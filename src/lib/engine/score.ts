// Blueprint §4 prioritization score. A THB internal heuristic, NOT a Google ranking factor.
// It is displayed only. Nothing in the orchestrator or state machine imports this module (see score.test.ts).
export const SCORE_PARTS = [
  { key: "search_opportunity", label: "Search opportunity", max: 20 },
  { key: "seller_relevance", label: "Seller relevance", max: 20 },
  { key: "original_information", label: "Original information", max: 20 },
  { key: "local_differentiation", label: "Local differentiation", max: 15 },
  { key: "answer_usefulness", label: "Answer usefulness", max: 15 },
  { key: "topical_fit", label: "Topical / internal-link fit", max: 10 },
] as const;
export type PartKey = (typeof SCORE_PARTS)[number]["key"];

export type ScorePart = { value: number | null; max: number; source: "computed_from_gsc" | "agent_estimate" | "not_scored"; note: string };
export type Score = { parts: Record<PartKey, ScorePart>; scored: number; scoredMax: number; reading: string; disclaimer: string };

export const SCORE_DISCLAIMER = "THB internal heuristic, not a Google ranking factor. Shown for orientation; it never approves, rejects or blocks anything.";

/** Search opportunity: volume on a log scale (up to 14) plus striking-distance position bonus (up to 6). */
export function searchOpportunity(impressions: number, avgPosition: number): { value: number; note: string } {
  const vol = Math.min(14, Math.round((Math.log10(impressions + 1) / Math.log10(3000)) * 14));
  const pos = avgPosition >= 4 && avgPosition <= 30 ? Math.round(6 * (1 - Math.abs(avgPosition - 12) / 18)) : 0;
  const v = Math.max(0, Math.min(20, vol + Math.max(0, pos)));
  return { value: v, note: `${impressions} impressions in the window (volume ${vol}/14) and average position ${avgPosition.toFixed(1)} (position bonus ${Math.max(0, pos)}/6)` };
}

export function buildScore(computed: { impressions: number; position: number }, agentEstimates?: Partial<Record<PartKey, number>>): Score {
  const parts = {} as Record<PartKey, ScorePart>;
  for (const p of SCORE_PARTS) parts[p.key] = { value: null, max: p.max, source: "not_scored", note: "no data yet; not scored (not treated as zero)" };
  const so = searchOpportunity(computed.impressions, computed.position);
  parts.search_opportunity = { value: so.value, max: 20, source: "computed_from_gsc", note: so.note };
  for (const [k, v] of Object.entries(agentEstimates ?? {}) as [PartKey, number][]) {
    if (k === "search_opportunity") continue;
    const max = SCORE_PARTS.find((p) => p.key === k)!.max;
    parts[k] = { value: Math.max(0, Math.min(max, v)), max, source: "agent_estimate", note: "agent estimate, unverified" };
  }
  const scoredParts = Object.values(parts).filter((p) => p.value !== null);
  const scored = scoredParts.reduce((a, p) => a + (p.value ?? 0), 0);
  const scoredMax = scoredParts.reduce((a, p) => a + p.max, 0);
  const full = scoredParts.length === SCORE_PARTS.length;
  const reading = !full ? `partial (${scored} of ${scoredMax} scorable points; ${SCORE_PARTS.length - scoredParts.length} parts not scored)` : scored >= 80 ? "high priority" : scored >= 60 ? "review" : "lower priority";
  return { parts, scored, scoredMax, reading, disclaimer: SCORE_DISCLAIMER };
}
