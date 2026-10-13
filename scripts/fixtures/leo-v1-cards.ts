// Leo's blind judgments of ten V1 must-fix cards (2026-10-12; docs/phases/phase-3c-evidence-audit.md, Q20). FIXTURE DATA: the sentences are the real wording
// V1 reviewed, with Leo's verdict and the outcome the calibrated V1 gate must produce for each. The pipeline that wrote each sentence is deliberately absent.
//   A real problem, must fix          -> a required finding: the unit goes back to the writer
//   B minor, should-fix at most       -> a should-fix: it never blocks (a `soften` ruling on a flagged sentence, an optional finding otherwise)
//   C not a problem, V1 overreached   -> no finding at all (`not_a_claim` on a flagged sentence, nothing otherwise)
/** A known, accepted difference between Leo's verdict and what the real V1 returns. The verdict itself is never relabeled: it stays what Leo judged. */
export type DocumentedException = { observedV1: "must" | "should" | "none"; reason: string; approved: string; evidence: string };
export type LeoCard = { card: number; sentence: string; leo: "A" | "B" | "C"; v1Originally: "must fix"; flagged: boolean; note: string; documentedException?: DocumentedException };

export const LEO_CARDS: LeoCard[] = [
  {
    card: 1, sentence: "Living in the house alone does not give you that authority.", leo: "B", v1Originally: "must fix", flagged: false, note: "legal point stated plainly; clarify the wording, do not weaken it",
    // Leo's verdict is B (should-fix). The real V1 keeps it must-fix because the nearby sentence lists legal roles (owner, trustee, executor, administrator, heirs), a protected category,
    // and because the sentence is a conclusion about who holds authority. Accepted as a deliberate conservative exception; the verdict is not relabeled.
    documentedException: {
      observedV1: "must",
      reason: "In its FAQ context the neighbouring sentence lists legal roles (an owner, a trustee, an executor or administrator, or several heirs); V1 judges the item as a whole and returns a required finding. Alone, V1 also returns must-fix: a case-specific conclusion about who holds authority.",
      approved: "Leo, 2026-10-13: approved with documented exception (potentially case-specific legal authority)",
      evidence: "docs/phases/phase-3d-hybrid.md (V1 severity calibration); docs/phases/phase-3d-data/calibration-card1-in-context/",
    },
  },
  { card: 2, sentence: "Trash or signs of pests are another, and they match conditions the statute lists.", leo: "A", v1Originally: "must fix", flagged: false, note: "statute match asserted without the legal criteria" },
  { card: 3, sentence: "Most families are not looking for judgment.", leo: "C", v1Originally: "must fix", flagged: false, note: "empathetic, not a statistic (not caught by the hedge flag: 'most families')" },
  { card: 4, sentence: "The real question is usually whether the house or the paperwork is the bigger risk to the sale.", leo: "B", v1Originally: "must fix", flagged: true, note: "'usually' implies an unsupported frequency; practical guidance" },
  { card: 5, sentence: "The real question is usually not which route is best.", leo: "B", v1Originally: "must fix", flagged: true, note: "'usually' is conversational guidance; a minor wording change" },
  { card: 6, sentence: "Most people in this spot are not avoiding the problem.", leo: "C", v1Originally: "must fix", flagged: true, note: "empathetic, conversational, not a statistical claim" },
  { card: 7, sentence: "Spending first can commit you to a plan the right person never agreed to.", leo: "C", v1Originally: "must fix", flagged: true, note: "conditional warning; 'never agreed to' vs 'did not agree to' adds no accuracy" },
  { card: 8, sentence: "Only someone with legal authority to sign.", leo: "C", v1Originally: "must fix", flagged: false, note: "a basic legal principle (V1's rule 1 keeps legal claims stated as certain at must-fix; see the report)" },
  { card: 9, sentence: "Whoever has legal authority to sign, such as an owner, trustee, executor, administrator, surviving spouse or several heirs acting together.", leo: "A", v1Originally: "must fix", flagged: false, note: "a list of roles stated as who holds authority" },
  { card: 10, sentence: "A house full of belongings is hard enough without finding out halfway through that nobody checked who could sign.", leo: "C", v1Originally: "must fix", flagged: true, note: "hypothetical warning in natural language" },
];
