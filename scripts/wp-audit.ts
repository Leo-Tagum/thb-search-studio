// Phase 0 step 8: read-only WordPress REST + sitemap audit.
// Global limiter: <= 20 requests/minute (one every 3.1s). No cache-busting params.
// Aborts immediately on 403/429/5xx or a Wordfence-looking page.
const BASE = process.env.WP_BASE_URL ?? "https://twinhomebuyer.com";
const MIN_GAP_MS = 3100;
const FIELDS = "id,slug,link,modified,type,status,yoast_head_json";

let last = 0;
let count = 0;
async function get(url: string): Promise<Response> {
  const wait = last + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  count++;
  const res = await fetch(url, {
    headers: { "User-Agent": "THB-Search-Studio-audit/0.1 (internal, read-only)" },
  });
  if (res.status === 403 || res.status === 429 || res.status >= 500) {
    throw new Error(`STOP: ${res.status} from ${url}`);
  }
  return res;
}

async function text(url: string): Promise<string> {
  const res = await get(url);
  const body = await res.text();
  if (/wordfence|you have been temporarily blocked/i.test(body.slice(0, 4000)) && !res.ok) {
    throw new Error(`STOP: block page from ${url}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return body;
}

type Item = { id: number; slug: string; link: string; modified: string; type: string; status: string; yoast_head_json?: Record<string, unknown> | null };

async function listAll(kind: "posts" | "pages"): Promise<Item[]> {
  const out: Item[] = [];
  for (let page = 1; ; page++) {
    const url = `${BASE}/wp-json/wp/v2/${kind}?per_page=100&page=${page}&_fields=${FIELDS}`;
    const res = await get(url);
    if (res.status === 400) break; // past last page
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    const rows = (await res.json()) as Item[];
    out.push(...rows);
    const totalPages = Number(res.headers.get("x-wp-totalpages") ?? "1");
    if (page >= totalPages || rows.length === 0) break;
  }
  return out;
}

const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
const norm = (u: string) => u.replace(/\/+$/, "").toLowerCase();

const posts = await listAll("posts");
const pages = await listAll("pages");
const indexXml = await text(`${BASE}/sitemap_index.xml`);
const children = locs(indexXml);
const sitemapUrls: Record<string, string[]> = {};
for (const c of children) sitemapUrls[c] = locs(await text(c));

const allSitemap = new Set(Object.values(sitemapUrls).flat().map(norm));
const apiLinks = new Set([...posts, ...pages].map((i) => norm(i.link)));
const onlyApi = [...apiLinks].filter((u) => !allSitemap.has(u));
const onlySitemap = [...allSitemap].filter((u) => !apiLinks.has(u));
const withYoast = [...posts, ...pages].filter((i) => i.yoast_head_json && Object.keys(i.yoast_head_json).length > 0).length;
const statuses = (xs: Item[]) => Object.fromEntries([...new Set(xs.map((x) => x.status))].map((s) => [s, xs.filter((x) => x.status === s).length]));

console.log(JSON.stringify({
  requestsMade: count,
  posts: { count: posts.length, statuses: statuses(posts) },
  pages: { count: pages.length, statuses: statuses(pages) },
  yoastHeadJsonPresent: { items: withYoast, of: posts.length + pages.length },
  sitemapIndexChildren: Object.fromEntries(Object.entries(sitemapUrls).map(([k, v]) => [k, v.length])),
  sitemapUrlTotal: allSitemap.size,
  inApiNotInSitemap: { count: onlyApi.length, sample: onlyApi.slice(0, 15) },
  inSitemapNotInApi: { count: onlySitemap.length, sample: onlySitemap.slice(0, 15) },
}, null, 2));
export {};
