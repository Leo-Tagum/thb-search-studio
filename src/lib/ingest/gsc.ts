// Read-only Search Console import logic. Pure: the API caller is injected so tests never hit Google.
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
export type GscCall = (body: Record<string, unknown>) => Promise<GscRow[]>;

export type GscFetch = {
  rows: { page_url: string; query: string; metric_date: string; clicks: number; impressions: number; ctr: number; position: number }[];
  truncated: boolean;
  requests: number;
};

export const GSC_CAVEATS = [
  "Search Console data only; a query that does not appear in this export is UNKNOWN, not proof of no demand.",
  "Google anonymizes rare queries: they are omitted from page x query rows, so totals understate real impressions.",
  "Positions and CTR are averages and can mislead for low-impression rows.",
  "Final data lags about 2-3 days; the window ends at the last final day.",
  "Only data Google returns for this URL-prefix property is included.",
];

/** Last-final-day window: ends `lagDays` before `today`, spans `days` days inclusive. */
export function windowFor(today: Date, days: number, lagDays = 3): { start: string; end: string } {
  const d = (n: number) => new Date(today.getTime() - n * 864e5).toISOString().slice(0, 10);
  return { start: d(lagDays + days - 1), end: d(lagDays) };
}

export async function fetchGsc(call: GscCall, opts: { start: string; end: string; dataState?: string; pageSize?: number; maxRows?: number }): Promise<GscFetch> {
  const pageSize = opts.pageSize ?? 25000;
  const maxRows = opts.maxRows ?? 200000;
  const out: GscFetch["rows"] = [];
  let requests = 0;
  let truncated = false;
  for (let startRow = 0; ; startRow += pageSize) {
    const rows = await call({
      startDate: opts.start, endDate: opts.end, dimensions: ["page", "query", "date"],
      rowLimit: pageSize, startRow, dataState: opts.dataState ?? "final",
    });
    requests += 1;
    for (const r of rows) {
      out.push({ page_url: r.keys[0], query: r.keys[1], metric_date: r.keys[2], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });
    }
    if (rows.length < pageSize) break;
    if (out.length >= maxRows) { truncated = true; break; }
  }
  return { rows: out, truncated, requests };
}

export type GscAggRow = { keys: string[]; clicks: number; impressions: number; position: number };
/** Aggregated pull (no date dimension) for the blog audit: one row per page, or per page x query. */
export async function fetchGscAggregate(call: GscCall, opts: { start: string; end: string; dimensions: string[]; pageSize?: number; maxRows?: number }): Promise<{ rows: GscAggRow[]; truncated: boolean; requests: number }> {
  const pageSize = opts.pageSize ?? 25000;
  const maxRows = opts.maxRows ?? 200000;
  const rows: GscAggRow[] = [];
  let requests = 0, truncated = false;
  for (let startRow = 0; ; startRow += pageSize) {
    const got = await call({ startDate: opts.start, endDate: opts.end, dimensions: opts.dimensions, rowLimit: pageSize, startRow, dataState: "final" });
    requests++;
    rows.push(...got.map((r) => ({ keys: r.keys, clicks: r.clicks, impressions: r.impressions, position: r.position })));
    if (got.length < pageSize) break;
    if (rows.length >= maxRows) { truncated = true; break; }
  }
  return { rows, truncated, requests };
}
