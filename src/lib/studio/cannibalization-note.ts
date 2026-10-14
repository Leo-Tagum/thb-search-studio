// Stage 6 part C, the cannibalization check (Leo, 2026-10-14): what to say when the main Search Console import (page x query x date) has NO rows for the existing page.
// Google omits rare queries from page x query rows, so a quiet page can be missing there while still having traffic. The blog-audit import keeps a PAGE TOTAL for it. The check then reports
// "no query data, page total X (window)", never "no overlap" and never a bare "no data" when a page total exists.
export type PageTotal = { impressions: number; clicks: number; position: number; start: string; end: string };

export function noQueryDataNote(path: string, total: PageTotal | null): string {
  if (!total) return `NO DATA: no query rows and no page total in the stored Search Console data for ${path}. This is not a finding of "no overlap".`;
  const pos = Number.isFinite(total.position) ? `, average position ${total.position.toFixed(1)}` : "";
  return `no query data, page total ${total.impressions} impressions, ${total.clicks} click${total.clicks === 1 ? "" : "s"}${pos} (${total.start}..${total.end}, blog-audit import) for ${path}. Google leaves rare queries out of page x query rows, so which queries it ranks for is unknown; this is not a finding of "no overlap".`;
}
