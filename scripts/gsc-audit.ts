// Phase 0 step 6: prove read-only Search Console access. Prints results only; stores nothing.
import { GoogleAuth } from "google-auth-library";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const auth = new GoogleAuth({ keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, scopes: [SCOPE] });
const client = await auth.getClient();
console.log("scopes requested:", [SCOPE].join(", "));

const sites = await client.request<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>({
  url: "https://www.googleapis.com/webmasters/v3/sites",
});
console.log("sites visible:", JSON.stringify(sites.data.siteEntry ?? []));

const site = process.env.GSC_SITE_URL!;
const match = sites.data.siteEntry?.find((s) => s.siteUrl === site);
console.log("configured property:", site, "| type:", site.startsWith("sc-domain:") ? "domain" : "URL-prefix", "| listed:", !!match, "| permission:", match?.permissionLevel);

const day = (offset: number) => new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10);
const body = { startDate: day(9), endDate: day(3), dimensions: ["page", "query"], rowLimit: 5000, dataState: "final" };
const res = await client.request<{ rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] }>({
  url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
  method: "POST",
  data: body,
});
const rows = res.data.rows ?? [];
console.log(`date range: ${body.startDate}..${body.endDate} | rows returned: ${rows.length} (rowLimit ${body.rowLimit})`);
console.log("sample:", JSON.stringify(rows.slice(0, 3)));
export {};
