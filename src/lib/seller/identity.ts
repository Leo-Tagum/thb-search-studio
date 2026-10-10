// Identity-pattern check for seller text. Heuristic, deliberately over-cautious; Leo reviews flags.
export type IssueKind = "street_address" | "person_name" | "amount" | "exact_date" | "seller_quote";
export type Issue = { kind: IssueKind; match: string };

const MONTHS = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?";
const SUFFIX = "(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Terrace|Ter|Highway|Hwy)";

const PATTERNS: [IssueKind, RegExp][] = [
  ["street_address", new RegExp(`\\b\\d{1,5}\\s+(?:[A-Z][a-z]+\\.?\\s+){0,3}${SUFFIX}\\b`, "g")],
  ["person_name", /\b(?:Mr|Mrs|Ms|Mx|Dr)\.?\s+[A-Z][a-z]+/g],
  ["person_name", /\b(?:named|name is|name's|called|first name)\s+[A-Z][a-z]+/g],
  ["amount", /\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:[kKmM]\b|million|thousand))?/g],
  ["amount", /\b(?:six|seven|eight)-figure\b/gi],
  ["amount", /\b\d[\d,]*\s+(?:dollars|bucks)\b/gi],
  ["exact_date", new RegExp(`\\b${MONTHS}\\s+\\d{1,2}(?:,?\\s+\\d{4})?\\b`, "g")],
  ["exact_date", /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g],
  ["seller_quote", /["“][^"”]{3,}["”]/g],
];

export function findIssues(text: string): Issue[] {
  const out: Issue[] = [];
  for (const [kind, re] of PATTERNS) for (const m of text.matchAll(re)) out.push({ kind, match: m[0] });
  return out;
}

/** Kinds that may never appear anywhere in stored text (flagged to Leo at import). */
export const NEVER_STORED: IssueKind[] = ["street_address", "person_name"];

/** Publishable text must contain none of the patterns at all. */
export function checkPublishable(text: string): { ok: boolean; issues: Issue[] } {
  const issues = findIssues(text);
  return { ok: issues.length === 0, issues };
}
