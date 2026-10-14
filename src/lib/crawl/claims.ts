// Claims scan: flags wording that is false, unapproved or unverified. A claim found on our own site is a claim to check, never evidence.
import type { ClaimFinding } from "./types";

/** The only approved closing-time wording (Command Center S-CLAIM-2d, see docs/references/merge-groups-handoff.md). */
export const APPROVED_CLOSE = /\bclose in as little as 7 days\b/i;

type Pattern = { id: string; label: string; re: RegExp };
const PATTERNS: Pattern[] = [
  { id: "licensed-contractor", label: "licensed contractor (false per THB Source of Truth)", re: /licensed\s+(?:general\s+)?(?:contractor|plumb\w*)/gi },
  { id: "c36", label: "C36 (false as a THB licence claim)", re: /\bC-?36\b/g },
  { id: "cslb", label: "CSLB licence number (false per THB Source of Truth)", re: /\bCSLB\b(?:\s*(?:license\s*)?#?\s*\d+)?/gi },
  { id: "guaranteed", label: "guarantee language (unapproved)", re: /\bguarantee[sd]?\b/gi },
  { id: "saved-fees", label: "\"$32M+ saved fees\" (unverified recurring stat)", re: /\$\s?32\s?M\s?\+?(?:\s+saved\s+fees)?/gi },
  { id: "houses-bought", label: "\"1,000+ houses bought\" (unverified recurring stat)", re: /\b1,?000\s?\+(?:\s+(?:houses|homes|properties)(?:\s+bought)?)?/gi },
  { id: "on-time", label: "\"100% on time\" (unverified recurring stat)", re: /\b100\s?%\s*on[- ]time\b/gi },
  { id: "review-figures", label: "review rating or count (unverified recurring stat)", re: /\b\d(?:\.\d)?\s*\/\s*5\b(?:\s*\|?\s*(?:based on\s+)?\d{2,4}\s+(?:verified\s+)?reviews)?|\b\d{2,3}\s*%\s*excellent\b|\b(?:see all\s+)?\d{2,4}\s+reviews\b/gi },
  { id: "pay-all-costs", label: "\"we pay all costs\" wording", re: /\b(?:we\s+)?(?:pay|cover|paid|covered)\s+(?:for\s+)?all\s+(?:of\s+the\s+|your\s+)?(?:closing\s+)?costs?\b/gi },
  { id: "most-standard-closing-costs", label: "\"most standard closing costs\" wording", re: /\bmost\s+standard\s+closing\s+costs?\b/gi },
  { id: "no-closing-surprises", label: "\"no closing cost surprises\" wording", re: /\bno\s+closing[- ]cost\s+surprises?\b/gi },
  { id: "dollar-figure", label: "dollar figure with no source on the page", re: /\$\s?\d[\d,]*(?:\.\d+)?\s?[kKmM]?(?:\s?(?:-|–|—|to)\s?\$?\d[\d,]*(?:\.\d+)?\s?[kKmM]?)?/g },
];
const DAYS = /\b\d{1,3}(?:\s?(?:-|–|—|to)\s?\d{1,3})?\s?(?:calendar\s+)?days?\b(?:\s+or\s+(?:less|sixty|\d+\s+days?))?/gi;

const excerpt = (text: string, at: number, len: number) => text.slice(Math.max(0, at - 50), Math.min(text.length, at + len + 50)).replace(/\s+/g, " ").trim();

export function scanClaims(text: string): ClaimFinding[] {
  const out: ClaimFinding[] = [];
  const seen = new Set<string>();
  const add = (id: string, label: string, match: string, at: number) => {
    const key = `${id}|${match.toLowerCase()}|${at}`; if (seen.has(key)) return; seen.add(key);
    out.push({ id, label, match: match.replace(/\s+/g, " ").trim(), excerpt: excerpt(text, at, match.length), ownSiteClaim: true });
  };
  for (const p of PATTERNS) { p.re.lastIndex = 0; let m: RegExpExecArray | null; while ((m = p.re.exec(text))) add(p.id, p.label, m[0], m.index); }
  DAYS.lastIndex = 0; let m: RegExpExecArray | null;
  while ((m = DAYS.exec(text))) {
    const around = text.slice(Math.max(0, m.index - 20), m.index + m[0].length);
    if (APPROVED_CLOSE.test(around) || /as little as\s*$/i.test(text.slice(Math.max(0, m.index - 14), m.index))) continue;
    add("day-count", "day count that is not the approved wording (approved: \"close in as little as 7 days\")", m[0], m.index);
  }
  const ids = new Set(out.map((f) => f.id));
  if (ids.has("pay-all-costs") && ids.has("most-standard-closing-costs")) {
    out.push({ id: "closing-costs-contradiction", label: "CONTRADICTION on the same page: all costs paid versus most standard closing costs", match: "pay all costs / most standard closing costs", excerpt: "", ownSiteClaim: true });
  }
  return out;
}

/** Share of sentences that carry a claim finding (dollar figures count, they need a source). */
export function claimDensity(text: string): { sentences: number; flagged: number } {
  const ss = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  let flagged = 0; for (const s of ss) if (scanClaims(s).length) flagged++;
  return { sentences: ss.length, flagged };
}
