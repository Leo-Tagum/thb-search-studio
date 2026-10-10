// Phase 2b: fetch all post bodies (2 requests, <=5/min, stop on 429/5xx), store in page_snapshots. Read-only on WordPress.
// Usage: tsx --env-file=.env.local scripts/fetch-post-bodies.mts
import { createClient } from "@supabase/supabase-js";
import { createLimiter } from "../src/lib/ingest/rate-limiter";
import { contentHash, fetchPostBodies } from "../src/lib/audit/fetch-bodies";

const BASE = process.env.WP_BASE_URL ?? "https://twinhomebuyer.com";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { posts, requests } = await fetchPostBodies(BASE, createLimiter(5)).catch((e) => { console.error(String(e)); process.exit(2); });
const { data: pages, error } = await db.from("pages").select("id,wp_id").eq("wp_type", "post");
if (error) throw error;
const byWp = new Map(pages.map((p) => [p.wp_id as number, p.id as string]));
let stored = 0, unchanged = 0, unmatched = 0;
for (const p of posts) {
  const pageId = byWp.get(p.id);
  if (!pageId) { unmatched++; continue; }
  const hash = contentHash(p.content.rendered);
  const { data: last } = await db.from("page_snapshots").select("content_hash").eq("page_id", pageId).order("fetched_at", { ascending: false }).limit(1);
  if (last?.[0]?.content_hash === hash) { unchanged++; continue; }
  // body_text holds the rendered HTML (needed for links/images); treat as untrusted data.
  const { error: e } = await db.from("page_snapshots").insert({ page_id: pageId, http_status: 200, content_hash: hash, body_text: p.content.rendered });
  if (e) throw e;
  stored++;
}
console.log(JSON.stringify({ requests, fetched: posts.length, stored, unchanged, unmatched }));
