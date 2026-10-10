// Pure helpers for inventory ingestion: canonical normalisation, merge, rendered-head parsing.
export function normUrl(u: string): string {
  const x = new URL(u);
  x.hash = ""; x.search = "";
  const path = x.pathname.replace(/\/+$/, "");
  return `${x.protocol}//${x.hostname.toLowerCase().replace(/^www\./, "www.")}${path}/`;
}

export type ApiItem = { id: number; slug: string; link: string; modified: string; type: string; status: string; parent?: number; title?: { rendered?: string } };
export type PageRow = {
  wp_id: number | null; wp_type: "post" | "page" | "sitemap_only"; slug: string; url: string; canonical_url: string;
  path: string; wp_status: string | null; title: string | null; modified_at: string | null; wp_parent: number | null;
  in_sitemap: boolean; in_api: boolean;
};

const decode = (s: string) => s.replace(/&#8217;|&rsquo;/g, "'").replace(/&#8211;|&ndash;/g, "-").replace(/&amp;/g, "&").replace(/&#038;/g, "&").replace(/&quot;/g, '"').replace(/&#8220;|&#8221;/g, '"');

/** De-duplicates by normalised canonical URL; API item wins over a sitemap-only entry. */
export function mergeInventory(items: ApiItem[], sitemapUrls: string[]): PageRow[] {
  const map = new Map<string, PageRow>();
  const sm = new Set(sitemapUrls.map(normUrl));
  for (const i of items) {
    const key = normUrl(i.link);
    if (map.has(key)) continue;
    map.set(key, {
      wp_id: i.id, wp_type: i.type === "post" ? "post" : "page", slug: i.slug, url: i.link, canonical_url: key,
      path: new URL(i.link).pathname, wp_status: i.status, title: i.title?.rendered ? decode(i.title.rendered) : null,
      modified_at: i.modified ? new Date(i.modified + "Z").toISOString() : null, wp_parent: i.parent || null,
      in_sitemap: sm.has(key), in_api: true,
    });
  }
  for (const u of sitemapUrls) {
    const key = normUrl(u);
    if (map.has(key)) continue;
    map.set(key, {
      wp_id: null, wp_type: "sitemap_only", slug: "", url: u, canonical_url: key, path: new URL(u).pathname,
      wp_status: null, title: null, modified_at: null, wp_parent: null, in_sitemap: true, in_api: false,
    });
  }
  return [...map.values()];
}

export function parseHead(html: string): { title: string | null; description: string | null; h1: string | null; canonical: string | null } {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const d = /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1]
    ?? /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html)?.[1];
  const h = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, "").trim();
  const c = /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i.exec(html)?.[1];
  return { title: t ? decode(t.trim()) : null, description: d ? decode(d) : null, h1: h ? decode(h) : null, canonical: c ?? null };
}
