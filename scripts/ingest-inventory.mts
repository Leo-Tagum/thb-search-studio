// Read-only inventory ingestion (no WordPress writes). All THB requests go through one limiter (<=20/min).
// Usage: tsx --env-file=.env.local scripts/ingest-inventory.mts list       (REST + sitemap, ~8 requests)
//        tsx --env-file=.env.local scripts/ingest-inventory.mts rendered   (title/description/h1 per URL, ~18 min)
import { createClient } from "@supabase/supabase-js";
import { createLimiter } from "../src/lib/ingest/rate-limiter";
import { mergeInventory, parseHead, type ApiItem } from "../src/lib/ingest/inventory";

const BASE = process.env.WP_BASE_URL ?? "https://twinhomebuyer.com";
const limiter = createLimiter(20);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let requests = 0;

async function get(url: string): Promise<Response> {
  await limiter.wait();
  requests++;
  const res = await fetch(url, { headers: { "User-Agent": "THB-Search-Studio-inventory/0.1 (internal, read-only)" } });
  if (res.status === 403 || res.status === 429 || res.status >= 500) throw new Error(`STOP: HTTP ${res.status} from ${url}`);
  return res;
}
const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

async function listAll(kind: "posts" | "pages"): Promise<ApiItem[]> {
  const out: ApiItem[] = [];
  for (let page = 1; ; page++) {
    const res = await get(`${BASE}/wp-json/wp/v2/${kind}?per_page=100&page=${page}&_fields=id,slug,link,modified,type,status,parent,title`);
    if (res.status === 400) break;
    if (!res.ok) throw new Error(`HTTP ${res.status} listing ${kind}`);
    const rows = (await res.json()) as ApiItem[];
    out.push(...rows);
    if (page >= Number(res.headers.get("x-wp-totalpages") ?? "1") || !rows.length) break;
  }
  return out;
}

const mode = process.argv[2];
if (mode === "list") {
  const posts = await listAll("posts");
  const pages = await listAll("pages");
  const idx = await (await get(`${BASE}/sitemap_index.xml`)).text();
  const sitemap: string[] = [];
  for (const child of locs(idx)) sitemap.push(...locs(await (await get(child)).text()));
  const rows = mergeInventory([...posts, ...pages], sitemap);
  // protection_status / template_flag are NOT in the payload: new rows take the default 'unknown';
  // existing rows keep whatever Leo marked.
  const { error } = await db.from("pages").upsert(rows.map((r) => ({ ...r, last_seen_at: new Date().toISOString() })), { onConflict: "canonical_url" });
  if (error) throw error;
  const byType = (t: string) => rows.filter((r) => r.wp_type === t).length;
  console.log(JSON.stringify({ requests, posts: posts.length, pages: pages.length, sitemapUrls: sitemap.length, uniqueCanonical: rows.length, post: byType("post"), page: byType("page"), sitemapOnly: byType("sitemap_only"), notInSitemap: rows.filter((r) => !r.in_sitemap).length }));
} else if (mode === "rendered") {
  const { data, error } = await db.from("pages").select("id,url").is("rendered_checked_at", null).order("path");
  if (error) throw error;
  let n = 0, fail = 0;
  for (const p of data) {
    try {
      const res = await get(p.url);
      const head = res.ok ? parseHead(await res.text()) : null;
      await db.from("pages").update({ meta_title: head?.title ?? null, meta_description: head?.description ?? null, h1: head?.h1 ?? null, rendered_checked_at: new Date().toISOString() }).eq("id", p.id);
      if (!res.ok) fail++;
    } catch (e) { console.error(String(e)); if (String(e).startsWith("Error: STOP")) process.exit(2); fail++; }
    if (++n % 25 === 0) console.log(`rendered ${n}/${data.length}`);
  }
  console.log(JSON.stringify({ requests, checked: n, nonOk: fail }));
} else { console.error("usage: list | rendered"); process.exit(1); }
