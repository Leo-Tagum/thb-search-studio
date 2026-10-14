// READ-ONLY one-off: Search Console numbers for ONE page (page dimension, last N days). One API request, writes nothing (no database, no file).
//   npx tsx --env-file=.env.local scripts/gsc-page-query.mts <page url> [days=90]
// It matches the "Pages" filter of the Search Console report. Final data lags about 3 days, so the window ends 3 days ago (windowFor).
import { GoogleAuth } from "google-auth-library";
import { windowFor, GSC_SCOPE, type GscRow } from "../src/lib/ingest/gsc";

const [url, daysArg] = process.argv.slice(2);
if (!url) throw new Error("usage: gsc-page-query.mts <page url> [days=90]");
const days = Number(daysArg ?? 90);
const site = process.env.GSC_SITE_URL!;
const client = await new GoogleAuth({ keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, scopes: [GSC_SCOPE] }).getClient();
const win = windowFor(new Date(), days);
console.log(`scope ${GSC_SCOPE} (read-only); property ${site}; window ${win.start}..${win.end} (${days} days); page ${url}`);
const body = { startDate: win.start, endDate: win.end, dimensions: ["page"], dataState: "final", rowLimit: 10, dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "equals", expression: url }] }] };
const res = await client.request<{ rows?: GscRow[] }>({ url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, method: "POST", data: body });
const rows = res.data.rows ?? [];
if (!rows.length) console.log("no row returned: Google reports no impressions for this exact URL in this window (or the URL differs, for example a trailing slash or www).");
for (const r of rows) console.log(`${r.keys[0]}  impressions ${r.impressions}  clicks ${r.clicks}  ctr ${(r.ctr * 100).toFixed(1)}%  average position ${r.position.toFixed(1)}`);
console.log("1 request made; nothing was written.");
