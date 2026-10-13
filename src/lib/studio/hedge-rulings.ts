import { legalKindsOf } from "./legal-flags";
// V1 severity calibration (prompt version 1.2.0, after Leo's blind judgment of ten V1 must-fix cards: A 2, B 3, C 5).
// V1 still rules on every flagged generalization, with one of five rulings:
//   proven        a ledger claim or stored passage supports it (evidence in note)             -> settled, no item
//   not_a_claim   empathetic, conditional or hypothetical line: no fact, number, frequency or legal rule  -> settled, no item
//   soften        an unsupported frequency word that is not a statistic and states no legal rule or fact  -> settled, a should-fix (never blocks)
//   reword, drop  asserts a fact, figure, frequency or legal rule as certain                   -> a must-fix, as before
// Specific legal claims stay must-fix: the code refuses `soften` and `not_a_claim` on a flagged sentence with a statute or code section, a statutory condition,
// a figure or money, or a list of legal roles. A general legal principle may be `soften` (a should-fix), never `not_a_claim`.

export const HEDGE_RULINGS = ["proven", "reword", "drop", "soften", "not_a_claim"] as const;
export type HedgeRulingKind = (typeof HEDGE_RULINGS)[number];

const SETTLED: readonly string[] = ["proven", "soften", "not_a_claim"];
/** A flagged sentence still needs V1's ruling: it has none, or its reword/drop ruling is still open. */
export const needsRuling = (h: { ruling: string | null }): boolean => !SETTLED.includes(h.ruling ?? "");
/** A ruling that keeps its place while the sentence keeps its words (V1 is not asked again). */
export const keepsRuling = (ruling: string | null): boolean => SETTLED.includes(ruling ?? "");
/** reword and drop are must-fix; soften is a should-fix; proven and not_a_claim produce nothing. */
export const isMustFixRuling = (ruling: string | null | undefined): boolean => ruling === "reword" || ruling === "drop";

// Two tiers. SPECIFIC legal content can never be downgraded: a statute, section or code citation, a statutory condition (waiver, void, lien, probate), a figure
// or an amount of money, or a list of legal roles (trustee, executor, administrator, heirs, spouse...). GENERAL legal wording (a plain statement of a general
// principle, with no statute, figure, role list or case-specific conclusion) may be softened to a should-fix, but is never `not_a_claim`: it does state a legal rule.
const SPECIFIC_LEGAL = /\b(statute|statutes|section|sections|code|codes|waiver|waivers|void|lien|liens|probate|trustee|trustees|executor|executors|administrator|administrators|heir|heirs|spouse|conservator|guardian)\b|\$\s?\d|\d/i;
const GENERAL_LEGAL = /\b(law|laws|legal|legally|requires?|required|requirements?|court|courts|tax|taxes|disclos\w+|authority|liable|liability|obligat\w+|duty|duties)\b/i;

/** Why this ruling is not allowed on this sentence, or null. Applies to `soften` and `not_a_claim` only. */
export function rulingGuard(sentence: string, ruling: string): string | null {
  if (ruling !== "soften" && ruling !== "not_a_claim") return null;
  // Phase 3e: an absence-of-law claim or a sentence that blends the layers of law is never softened or waved through as "not a claim"
  if (legalKindsOf(sentence).length) return `ruling "${ruling}" is not allowed on a sentence about what a law does not say, or one that blends California law with a local rule or one city's rule with another's ("${sentence.slice(0, 80)}"); rule it proven (with the claim ids), reword or drop`;
  if (SPECIFIC_LEGAL.test(sentence)) return `ruling "${ruling}" is not allowed on a sentence with a statute, code section, statutory condition, figure, amount of money or list of legal roles ("${sentence.slice(0, 80)}"); rule it proven, reword or drop`;
  if (ruling === "not_a_claim" && GENERAL_LEGAL.test(sentence)) return `ruling "not_a_claim" is not allowed on a sentence that states a legal rule ("${sentence.slice(0, 80)}"); rule it soften (a general principle), proven, reword or drop`;
  return null;
}

/** Every ruling other than `proven` and the must-fix pair needs a note saying why or what plainer wording would do. */
export const rulingNoteError = (key: string, ruling: string, note: string | undefined): string | null => {
  if (ruling === "proven" && !(note ?? "").trim().match(/\S.{4,}/)) return `ruling "proven" for ${key} needs the evidence (a ledger claim id or source) in note`;
  if ((ruling === "soften" || ruling === "not_a_claim") && !(note ?? "").trim().match(/\S.{4,}/)) return `ruling "${ruling}" for ${key} needs a note (${ruling === "soften" ? "what plainer wording would do" : "why the line states no fact, number, frequency or legal rule"})`;
  return null;
};
