// Read-only GSC import (page x query x date). Usage: npm run import:gsc -- [days=90]
import { GoogleAuth } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";
import { fetchGsc, windowFor, GSC_SCOPE, GSC_CAVEATS, type GscRow } from "../src/lib/ingest/gsc";
import { matchPages } from "../src/lib/engine/match";

const days = Number(process.argv[2] ?? 90);
const site = process.env.GSC_SITE_URL!;
const auth = new GoogleAuth({ keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, scopes: [GSC_SCOPE] });
const client = await auth.getClient();
console.log("scope requested:", GSC_SCOPE, "(read-only)");
const win = windowFor(new Date(), days);
const call = async (data: Record<string, unknown>) =>
  (await client.request<{ rows?: GscRow[] }>({ url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, method: "POST", data })).data.rows ?? [];
const res = await fetchGsc(call, { start: win.start, end: win.end });
console.log(`fetched ${res.rows.length} rows in ${res.requests} request(s); ${win.start}..${win.end}; truncated=${res.truncated}`);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: pages } = await db.from("pages").select("id,url,canonical_url");
const m = matchPages(res.rows.map((r) => r.page_url), pages ?? []);

const caveats = [...GSC_CAVEATS, ...(res.truncated ? ["Import hit the row cap and is TRUNCATED."] : [])];
// idempotent: replace the same (property, range, state)
await db.from("gsc_imports").delete().eq("property", site).eq("start_date", win.start).eq("end_date", win.end).eq("data_state", "final");
const { data: imp, error } = await db.from("gsc_imports").insert({ property: site, start_date: win.start, end_date: win.end, data_state: "final", row_limit: 25000, rows_fetched: res.rows.length, truncated: res.truncated, caveats }).select("id").single();
if (error) throw error;
const out = res.rows.map((r) => ({ import_id: imp.id, page_id: m.map.get(r.page_url) ?? null, page_url: r.page_url, query: r.query, metric_date: r.metric_date, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position, source: "gsc", window_note: `${win.start}..${win.end} final` }));
for (let i = 0; i < out.length; i += 1000) {
  const { error: e } = await db.from("search_metrics").insert(out.slice(i, i + 1000));
  if (e) throw e;
}
console.log(`stored import ${imp.id}: ${out.length} rows`);
console.log(`distinct GSC pages: ${m.matched.length + m.unmatched.length}; matched to inventory: ${m.matched.length}; unmatched: ${m.unmatched.length}`);
for (const u of m.unmatched.slice(0, 40)) console.log("  unmatched:", u);
