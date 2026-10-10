// Candidate discovery for Engine A: intent grouping, overlap (query + intent, never similarity alone),
// city-swap detection, data gaps and candidate packets (blueprint §8).
import { isBrandQuery, parseQuery, sellerRelevanceHint } from "./intent";
import { normalizeUrl } from "./match";
import { buildScore, type Score } from "./score";

export type MetricRow = { page_url: string; page_id: string | null; query: string; impressions: number; clicks: number; position: number };
export type PageInfo = { id: string; url: string; canonical_url: string; title: string | null; meta_title: string | null; slug: string; protection_status: string; template_flag: string };
export type FirstPartyProof = "available" | "restricted" | "unavailable";

export type Kind = "overlap" | "improve" | "city_swap" | "gap";
export type Action = "CREATE" | "UPDATE" | "MERGE" | "HOLD" | "REJECT";

export type QueryStat = { query: string; impressions: number; clicks: number; position: number };
export type PageStat = {
  url: string; page_id: string | null; title: string | null; impressions: number; clicks: number; position: number; queryCount: number;
  protection_status: string | null; template_flag: string | null; in_inventory: boolean;
};

export type DataGap = { key: string; text: string };

export type Candidate = {
  kind: Kind;
  intent_key: string; // unique per candidate: intent|scope
  title: string;
  target_intent: string;
  scope: string;
  window: { start: string; end: string };
  totals: { impressions: number; clicks: number; position: number; queryCount: number };
  queries: QueryStat[];
  pages: PageStat[];
  covering_pages: { url: string; title: string | null; why: string }[]; // inventory pages whose slug/title already cover this intent
  overlap: { supported: boolean; shared_queries: string[]; reason: string };
  family: { places: string[]; size: number } | null;
  proposed_action: Action;
  alternatives: string[];
  uncertainty: string[];
  data_gaps: DataGap[];
  first_party_proof: FirstPartyProof;
  seller_relevance_hint: boolean;
  fan_out_hypotheses: { question: string; status: "hypothesis" }[];
  flags: { protected_warning: boolean; template_flag: string | null; dev_change_request: boolean };
  score: Score;
};

export type BuildOpts = { window: { start: string; end: string }; firstPartyProof: FirstPartyProof; minImpressions?: number };

export const STANDING_GAPS: DataGap[] = [
  { key: "serp_not_observed", text: "SERP result types and user questions were not observed (no SERP tool in this phase). Anything about the SERP is an assumption." },
  { key: "absent_queries_unknown", text: "Queries missing from the Search Console export are UNKNOWN, not proof of no demand." },
  { key: "leads_unknown", text: "Lead outcomes per intent are not joined yet (Phase 6). Business value is unverified." },
  { key: "local_info_unknown", text: "Whether useful local information exists for this scope is not established." },
];

type Agg = { impressions: number; clicks: number; posWeighted: number };
const add = (a: Agg, r: { impressions: number; clicks: number; position: number }) => { a.impressions += r.impressions; a.clicks += r.clicks; a.posWeighted += r.position * r.impressions; };
const pos = (a: Agg) => (a.impressions ? a.posWeighted / a.impressions : 0);

function pageCovers(p: PageInfo, tokens: string[]): boolean {
  if (!tokens.length) return false;
  const hay = `${p.slug} ${p.title ?? ""} ${p.meta_title ?? ""}`.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).map((t) => (t === "homes" || t === "home" || t === "houses" ? "house" : t.endsWith("s") && t.length > 3 && !t.endsWith("ss") ? t.slice(0, -1) : t));
  const set = new Set(hay);
  return tokens.every((t) => set.has(t));
}

export function buildCandidates(rows: MetricRow[], pages: PageInfo[], opts: BuildOpts): { candidates: Candidate[]; excluded: { brand: number; offTopic: number; belowThreshold: number } } {
  const minImp = opts.minImpressions ?? 40;
  const pageByKey = new Map<string, PageInfo>();
  for (const p of pages) { pageByKey.set(normalizeUrl(p.canonical_url), p); pageByKey.set(normalizeUrl(p.url), p); }

  // aggregate to (cell, query, normalized page)
  const cells = new Map<string, { intentKey: string; scopeKey: string; places: string[]; tokens: string[]; queries: Map<string, Map<string, Agg>>; rawUrls: Map<string, string> }>();
  const excluded = { brand: 0, offTopic: 0, belowThreshold: 0 };
  const seenBrand = new Set<string>(); const seenOff = new Set<string>();
  for (const r of rows) {
    if (isBrandQuery(r.query)) { if (!seenBrand.has(r.query)) { seenBrand.add(r.query); excluded.brand++; } continue; }
    const it = parseQuery(r.query);
    if (!sellerRelevanceHint(it.tokens, r.query) || !it.key) { if (!seenOff.has(r.query)) { seenOff.add(r.query); excluded.offTopic++; } continue; }
    const id = `${it.key}|${it.scopeKey}`;
    let c = cells.get(id);
    if (!c) { c = { intentKey: it.key, scopeKey: it.scopeKey, places: it.places, tokens: it.tokens, queries: new Map(), rawUrls: new Map() }; cells.set(id, c); }
    const pk = normalizeUrl(r.page_url);
    c.rawUrls.set(pk, r.page_url.split("?")[0]);
    let qm = c.queries.get(r.query); if (!qm) { qm = new Map(); c.queries.set(r.query, qm); }
    let a = qm.get(pk); if (!a) { a = { impressions: 0, clicks: 0, posWeighted: 0 }; qm.set(pk, a); }
    add(a, r);
  }

  // families: same intent across different place scopes
  const familyPlaces = new Map<string, Set<string>>();
  for (const c of cells.values()) if (c.places.length) { const s = familyPlaces.get(c.intentKey) ?? new Set<string>(); s.add(c.scopeKey); familyPlaces.set(c.intentKey, s); }

  const out: Candidate[] = [];
  for (const [id, c] of cells) {
    const qStats: QueryStat[] = []; const pageAgg = new Map<string, { a: Agg; qs: Set<string> }>(); const total: Agg = { impressions: 0, clicks: 0, posWeighted: 0 };
    for (const [q, pm] of c.queries) {
      const qa: Agg = { impressions: 0, clicks: 0, posWeighted: 0 };
      for (const [pk, a] of pm) {
        add(qa, { impressions: a.impressions, clicks: a.clicks, position: pos(a) }); add(total, { impressions: a.impressions, clicks: a.clicks, position: pos(a) });
        const pe = pageAgg.get(pk) ?? { a: { impressions: 0, clicks: 0, posWeighted: 0 }, qs: new Set<string>() };
        add(pe.a, { impressions: a.impressions, clicks: a.clicks, position: pos(a) }); pe.qs.add(q); pageAgg.set(pk, pe);
      }
      qStats.push({ query: q, impressions: qa.impressions, clicks: qa.clicks, position: Math.round(pos(qa) * 10) / 10 });
    }
    if (total.impressions < minImp) { excluded.belowThreshold++; continue; }
    qStats.sort((a, b) => b.impressions - a.impressions);

    const pageStats: PageStat[] = [...pageAgg].map(([pk, pe]) => {
      const inv = pageByKey.get(pk);
      return { url: inv?.canonical_url ?? c.rawUrls.get(pk) ?? pk, page_id: inv?.id ?? null, title: inv?.meta_title ?? inv?.title ?? null, impressions: pe.a.impressions, clicks: pe.a.clicks, position: Math.round(pos(pe.a) * 10) / 10, queryCount: pe.qs.size, protection_status: inv?.protection_status ?? null, template_flag: inv?.template_flag ?? null, in_inventory: !!inv };
    }).sort((a, b) => b.impressions - a.impressions);

    // overlap: two non-home pages that each rank for the same queries inside the same intent AND scope
    const nonHome = pageStats.filter((p) => !/^[^/]*\/?$/.test(normalizeUrl(p.url)));
    const shared: string[] = [];
    for (const [q, pm] of c.queries) {
      const ranking = [...pm].filter(([pk, a]) => a.impressions >= 3 && !/^[^/]*\/?$/.test(pk));
      if (ranking.length >= 2) shared.push(q);
    }
    const overlapSupported = nonHome.length >= 2 && shared.length >= 2;
    const overlap = overlapSupported
      ? { supported: true, shared_queries: shared.slice(0, 12), reason: `${nonHome.length} different pages each rank for the same ${shared.length} queries within the same intent and place scope (query overlap, not text similarity).` }
      : { supported: false, shared_queries: shared.slice(0, 12), reason: nonHome.length >= 2 ? "Several pages appear but share fewer than 2 queries; no cannibalization claim is made." : "Fewer than 2 distinct non-home pages rank; no overlap." };

    const covering = pages.filter((p) => pageCovers(p, c.tokens) && (c.places.length === 0 || c.places.every((pl) => `${p.slug} ${p.title ?? ""}`.toLowerCase().includes(pl.replace(/ /g, "-")) || `${p.title ?? ""}`.toLowerCase().includes(pl))))
      .slice(0, 6).map((p) => ({ url: p.canonical_url, title: p.meta_title ?? p.title, why: "slug/title contains every intent term" + (c.places.length ? " and the place" : "") }));

    const fam = c.places.length ? familyPlaces.get(c.intentKey) : undefined;
    const family = fam && fam.size >= 3 ? { places: [...fam].slice(0, 25), size: fam.size } : null;
    const best = pageStats.find((p) => !/^[^/]*\/?$/.test(normalizeUrl(p.url)));
    const hasCoverage = overlapSupported || covering.length > 0 || (best ? best.position <= 30 && best.impressions >= 20 : false);

    let kind: Kind; let action: Action; const alts: string[] = []; const unc: string[] = [];
    if (overlapSupported) { kind = "overlap"; action = "UPDATE"; alts.push("MERGE (needs a human-reviewed surviving URL, mapping, redirects, backup)", "HOLD"); unc.push("Same-intent overlap is inferred from shared queries; SERP intent was not observed."); }
    else if (c.places.length && family && family.size >= 3) {
      kind = "city_swap";
      const placePage = covering.length > 0;
      action = placePage ? "HOLD" : total.impressions >= 300 ? "HOLD" : "REJECT";
      alts.push(placePage ? "UPDATE (via Developer Change Request if template-rendered)" : "CREATE only with distinct local facts and official sources", "REJECT");
      unc.push("The same intent pattern exists for many places; without distinct local facts a new page would be a city-name swap.");
    } else if (hasCoverage) { kind = "improve"; action = "UPDATE"; alts.push("HOLD"); unc.push("Whether the page already satisfies the intent depends on the SERP, which was not observed."); }
    else { kind = "gap"; action = "CREATE"; alts.push("HOLD until SERP and evidence are checked", "REJECT if intent duplicates an existing page"); unc.push("No inventory page matches this intent by slug/title or GSC ranking, but absence from the export is not proof of a content gap."); }

    const t = pos(total); const tp = Math.round(t * 10) / 10;
    const flagsPage = (kind === "overlap" || kind === "improve" || kind === "city_swap") ? (best ?? pageStats[0]) : undefined;
    const template = flagsPage?.template_flag ?? null;
    const anyUnknownProtection = action === "UPDATE" && pageStats.some((p) => p.in_inventory && p.protection_status !== "not_protected");
    const gaps = [...STANDING_GAPS];
    const unmatched = pageStats.filter((p) => !p.in_inventory);
    if (unmatched.length) gaps.push({ key: "page_not_in_inventory", text: `${unmatched.length} ranking URL(s) are not in the inventory snapshot (${unmatched.slice(0, 3).map((u) => u.url).join(", ")}); their protection and template status are unknown.` });
    if (opts.firstPartyProof !== "available") gaps.push({ key: "first_party_proof", text: `First-party proof is ${opts.firstPartyProof}: no seller story is cleared for publication.` });

    const label = `${qStats[0].query}${qStats.length > 1 ? ` (+${qStats.length - 1} related queries)` : ""}`;
    out.push({
      kind, intent_key: id, title: `${label}`, target_intent: `Searchers using terms like "${qStats[0].query}" (${c.intentKey}${c.places.length ? "; place: " + c.places.join(", ") : "; no specific place"})`,
      scope: c.places.join(", ") || "none stated in queries", window: opts.window,
      totals: { impressions: total.impressions, clicks: total.clicks, position: tp, queryCount: qStats.length },
      queries: qStats.slice(0, 25), pages: pageStats.slice(0, 10), covering_pages: covering, overlap, family,
      proposed_action: action, alternatives: alts, uncertainty: unc, data_gaps: gaps, first_party_proof: opts.firstPartyProof,
      seller_relevance_hint: true, fan_out_hypotheses: [],
      flags: { protected_warning: anyUnknownProtection, template_flag: template, dev_change_request: action === "UPDATE" && template === "city" },
      score: buildScore({ impressions: total.impressions, position: tp }),
    });
  }
  out.sort((a, b) => (b.score.parts.search_opportunity.value ?? 0) - (a.score.parts.search_opportunity.value ?? 0) || b.totals.impressions - a.totals.impressions);
  return { candidates: out, excluded };
}
