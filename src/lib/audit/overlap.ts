// Cannibalization evidence for posts: two URLs overlap only when they rank for the same queries (query overlap),
// never on title/slug similarity. Reuses Engine A's URL matching and brand-query filter.
import { isBrandQuery } from "../engine/intent";
import { normalizeUrl } from "../engine/match";
import { overlapSupported, type Overlap, type Protection } from "./verdict";

export type PqRow = { page_url: string; page_id: string | null; query: string; impressions: number; clicks: number };
export type KnownPage = { id: string; url: string; title: string | null; wp_type: "post" | "page" | "sitemap_only"; protection: Protection };

const MIN_IMPRESSIONS_PER_QUERY = 5;

export function computeOverlaps(rows: PqRow[], pages: KnownPage[]): Map<string, Overlap[]> {
  const info = new Map(pages.map((p) => [p.id, p]));
  type Side = { key: string; page_id: string | null; url: string; queries: Map<string, number>; impressions: number; clicks: number };
  const sides = new Map<string, Side>();
  for (const r of rows) {
    if (!r.query || isBrandQuery(r.query)) continue;
    const key = r.page_id ?? normalizeUrl(r.page_url);
    let s = sides.get(key);
    if (!s) { s = { key, page_id: r.page_id, url: r.page_id ? info.get(r.page_id)?.url ?? r.page_url : r.page_url, queries: new Map(), impressions: 0, clicks: 0 }; sides.set(key, s); }
    s.queries.set(r.query, (s.queries.get(r.query) ?? 0) + r.impressions);
    s.impressions += r.impressions; s.clicks += r.clicks;
  }
  const byQuery = new Map<string, Side[]>();
  for (const s of sides.values()) for (const [q, imp] of s.queries) if (imp >= MIN_IMPRESSIONS_PER_QUERY) { const l = byQuery.get(q) ?? []; l.push(s); byQuery.set(q, l); }

  const out = new Map<string, Overlap[]>();
  for (const a of sides.values()) {
    if (!a.page_id || info.get(a.page_id)?.wp_type !== "post") continue;
    const acc = new Map<string, { b: Side; shared: string[]; aImp: number }>();
    for (const [q, aImp] of a.queries) {
      if (aImp < MIN_IMPRESSIONS_PER_QUERY) continue;
      for (const b of byQuery.get(q) ?? []) {
        if (b.key === a.key) continue;
        const e = acc.get(b.key) ?? { b, shared: [], aImp: 0 };
        e.shared.push(q); e.aImp += aImp; acc.set(b.key, e);
      }
    }
    const list: Overlap[] = [...acc.values()].map(({ b, shared, aImp }) => {
      const meta = b.page_id ? info.get(b.page_id) : undefined;
      const fraction = a.impressions ? aImp / a.impressions : 0;
      shared.sort((x, y) => (a.queries.get(y) ?? 0) - (a.queries.get(x) ?? 0));
      return {
        key: b.key, page_id: b.page_id, url: b.url, title: meta?.title ?? null,
        kind: meta ? (meta.wp_type === "post" ? "post" : "page") : "gsc_only", protection: meta?.protection ?? null,
        shared, sharedImpressions: aImp, fraction, supported: overlapSupported(shared.length, fraction), partnerClicks: b.clicks, partnerImpressions: b.impressions,
      } satisfies Overlap;
    }).sort((x, y) => y.shared.length - x.shared.length).slice(0, 8);
    out.set(a.page_id, list);
  }
  return out;
}
