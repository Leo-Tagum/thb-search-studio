// Phase 0 step 7: prove read-only GA4 Data API access. Prints results only; stores nothing.
import { GoogleAuth } from "google-auth-library";

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const auth = new GoogleAuth({ keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, scopes: [SCOPE] });
const client = await auth.getClient();
console.log("scopes requested:", SCOPE);

const property = process.env.GA4_PROPERTY_ID!.replace(/^properties\//, "");
const url = `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`;
type Report = { rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[]; rowCount?: number };
const dateRanges = [{ startDate: "7daysAgo", endDate: "yesterday" }];

// 1) Organic-search sessions by landing page
const organic = await client.request<Report>({
  url, method: "POST",
  data: {
    dateRanges,
    dimensions: [{ name: "landingPagePlusQueryString" }],
    metrics: [{ name: "sessions" }],
    dimensionFilter: { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: "Organic Search" } } },
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 10000,
  },
});
const rows = organic.data.rows ?? [];
console.log(`organic landing-page rows: ${organic.data.rowCount ?? rows.length}`);
console.log("top 3:", JSON.stringify(rows.slice(0, 3).map((r) => [r.dimensionValues[0].value, r.metricValues[0].value])));

// 2) Which events exist, and which are marked as key events (lead tracking)
const events = await client.request<Report>({
  url, method: "POST",
  data: {
    dateRanges: [{ startDate: "90daysAgo", endDate: "yesterday" }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }, { name: "keyEvents" }],
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
    limit: 200,
  },
});
const ev = (events.data.rows ?? []).map((r) => ({ event: r.dimensionValues[0].value, count: Number(r.metricValues[0].value), keyEvents: Number(r.metricValues[1].value) }));
console.log("events in last 90 days:", ev.map((e) => `${e.event}(${e.count})`).join(", "));
console.log("events counted as key events:", JSON.stringify(ev.filter((e) => e.keyEvents > 0)));
export {};
