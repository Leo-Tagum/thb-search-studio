// "Risky tokens": the statute numbers, money, percentages, durations, years and counts in a piece of text.
// A section may contain a risky token only if a ledger claim it cites (or an approved brand fact) contains the same token.
// This is deterministic and agent-independent: it is how an editor's changed number or an invented figure gets caught.
import { createHash } from "node:crypto";

const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, "forty-five": 45, sixty: 60, ninety: 90 };
const UNIT = "(?:business\\s+|calendar\\s+)?(day|week|month|year|hour)s?";
const WORD_ALT = Object.keys(NUM_WORDS).sort((a, b) => b.length - a.length).join("|");

function statuteKeys(t: string): string[] {
  const out = new Set<string>();
  const codeRe = /\b(?:civil|health\s+and\s+safety|h\s?&\s?s|probate|government|revenue\s+and\s+taxation|business\s+and\s+professions)\s+code\b[^.\d]{0,20}?(?:§+|sections?|sec\.)?\s*(\d[\d.]*\d)/gi;
  for (const m of t.matchAll(codeRe)) out.add(`§${m[1]}`);
  for (const m of t.matchAll(/§+\s*(\d[\d.]*\d)/g)) out.add(`§${m[1]}`);
  for (const m of t.matchAll(/\bsections?\s+(\d{3,5}(?:\.\d+)?)/gi)) out.add(`§${m[1]}`);
  for (const m of t.matchAll(/\b(\d{4,5}\.\d+)\b/g)) out.add(`§${m[1]}`);
  return [...out];
}

export function riskyKeys(text: string): string[] {
  const t = text.replace(/\s+/g, " ");
  const out = new Set<string>(statuteKeys(t));
  for (const m of t.matchAll(/\$\s?[\d,.]+(?:\s?(?:k|m|million|thousand|billion)\b)?/gi)) out.add(`$${m[0].replace(/[\s$,]/g, "").toLowerCase().replace(/\.$/, "")}`);
  for (const m of t.matchAll(/\b\d+(?:\.\d+)?\s?%/g)) out.add(m[0].replace(/\s/g, ""));
  for (const m of t.matchAll(new RegExp(`\\b(\\d+)[- ]${UNIT}\\b`, "gi"))) out.add(`${m[1]} ${m[2].toLowerCase()}`);
  for (const m of t.matchAll(new RegExp(`\\b(${WORD_ALT})[- ]${UNIT}\\b`, "gi"))) out.add(`${NUM_WORDS[m[1].toLowerCase()]} ${m[2].toLowerCase()}`);
  for (const m of t.matchAll(/\b(?:19|20)\d{2}\b/g)) out.add(`year:${m[0]}`);
  for (const m of t.matchAll(/\b\d[\d,]*\+?\s+(homes|houses|properties|families|sellers|deals|transactions|clients|owners)\b/gi)) out.add(`count:${m[0].toLowerCase().replace(/\s+/g, " ").replace(/,/g, "")}`);
  return [...out].sort();
}

/** Keys in `text` that none of `coverTexts` contains. Statute keys also count as covered by the bare number. */
export function uncoveredKeys(text: string, coverTexts: string[]): string[] {
  const covered = new Set(coverTexts.flatMap((c) => riskyKeys(c)));
  for (const c of coverTexts) for (const m of c.matchAll(/\b(\d{3,5}(?:\.\d+)?)\b/g)) covered.add(`§${m[1]}`);
  return riskyKeys(text).filter((k) => !covered.has(k));
}

/** A change here means a material change: fact review must run again before the section can lock. */
export function materialSig(text: string, claimIds: string[]): string {
  return createHash("sha256").update(JSON.stringify({ k: riskyKeys(text), c: [...claimIds].sort() })).digest("hex");
}
