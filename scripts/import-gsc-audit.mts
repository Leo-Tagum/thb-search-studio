// Phase 2b: read-only GSC pull for the blog audit (page totals + page x query, no date dimension, ~16 months).
// Usage: npm run import:gsc-audit -- [days=480]
import { GoogleAuth } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";
import { fetchGscAggregate, windowFor, GSC_SCOPE, GSC_CAVEATS, type GscRow } from "../src/lib/ingest/gsc";
import { matchPages } from "../src/lib/engine/match";

const days = Number(process.argv[2] ?? 480);
const site = process.env.GSC_SITE_URL!;
const client = await new GoogleAuth({ keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, scopes: [GSC_SCOPE] }).getClient();
console.log("scope requested:", GSC_SCOPE, "(read-only)");
const win = windowFor(new Date(), days);
const call = async (data: Record<string, unknown>) =>
  (await client.request<{ rows?: GscRow[] }>({ url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, method: "POST", data })).data.rows ?? [];
const pageAgg = await fetchGscAggregate(call, { ...win, dimensions: ["page"] });
const pqAgg = await fetchGscAggregate(call, { ...win, dimensions: ["page", "query"] });
console.log(`page rows ${pageAgg.rows.length}; page x query rows ${pqAgg.rows.length}; window ${win.start}..${win.end}; truncated=${pqAgg.truncated || pageAgg.truncated}`);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: pages } = await db.from("pages").select("id,url,canonical_url");
const m = matchPages([...pageAgg.rows, ...pqAgg.rows].map((r) => r.keys[0]), pages ?? []);
const truncated = pqAgg.truncated || pageAgg.truncated;
const caveats = [...GSC_CAVEATS, "Page totals include anonymized queries; page x query rows do not, so query rows sum to less than the page total.", ...(truncated ? ["Import hit the row cap and is TRUNCATED."] : [])];
await db.from("audit_gsc_imports").delete().eq("property", site).eq("start_date", win.start).eq("end_date", win.end);
const { data: imp, error } = await db.from("audit_gsc_imports").insert({ property: site, start_date: win.start, end_date: win.end, page_rows: pageAgg.rows.length, query_rows: pqAgg.rows.length, truncated, caveats }).select("id").single();
if (error) throw error;
const out = [
  ...pageAgg.rows.map((r) => ({ import_id: imp.id, page_url: r.keys[0], page_id: m.map.get(r.keys[0]) ?? null, query: null, clicks: r.clicks, impressions: r.impressions, position: r.position })),
  ...pqAgg.rows.map((r) => ({ import_id: imp.id, page_url: r.keys[0], page_id: m.map.get(r.keys[0]) ?? null, query: r.keys[1], clicks: r.clicks, impressions: r.impressions, position: r.position })),
];
for (let i = 0; i < out.length; i += 1000) { const { error: e } = await db.from("audit_gsc_rows").insert(out.slice(i, i + 1000)); if (e) throw e; }
console.log(`stored audit import ${imp.id}: ${out.length} rows; matched URLs ${m.matched.length}, unmatched ${m.unmatched.length}`);
