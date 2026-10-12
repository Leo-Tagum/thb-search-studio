// Phase 3d: pure helpers for V1 as the fact gate on classic text.
//   - citedSentences: which sentences of the reviewed version V1's items point at (hedge sentences by key, other items by the words they quote).
//   - fixChurn: on the writer's V1-fix pass, only the cited sentences may change. This is the only place the "fix only what is cited" rule is checked
//     by code; Agent 7 revisions, human edits and reopens are not fix passes and are never checked here (they go back through V1 in full or changed scope).
import type { Finding } from "./checks";

export const normSentence = (x: string) => x.replace(/\s+/g, " ").trim();
export const splitSentences = (text: string): string[] => text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
const fold = (s: string) => normSentence(s).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

/** Words inside quotation marks of at least 15 characters (V1 quotes the passage it means). */
function quoted(text: string): string[] {
  const out: string[] = [];
  const re = /"([^"]{15,})"|“([^”]{15,})”|'([^']{15,})'/g;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push(fold(m[1] ?? m[2] ?? m[3]));
  return out;
}

/** Sentences of the reviewed version that V1's must-fix items cite: the sentence appears inside the item text, or a passage the item quotes appears inside the sentence. */
export function citedSentences(sentences: string[] | null | undefined, itemTexts: string[], hedgeSentences: string[] = []): string[] {
  if (!sentences) return [];
  const items = itemTexts.map(fold);
  const quotes = itemTexts.flatMap(quoted);
  const hedge = new Set(hedgeSentences.map(fold));
  return sentences.filter((s) => {
    const f = fold(s);
    if (hedge.has(f)) return true;
    if (f.length >= 15 && items.some((t) => t.includes(f))) return true;
    return quotes.some((q) => f.includes(q) || (q.length >= 25 && q.includes(f) && f.length >= 15));
  });
}

/** The fix pass changed sentences V1 did not cite, or added far more text than the cited sentences needed. Null when it stayed inside the cited sentences. */
export function fixChurn(baseline: string[] | null | undefined, next: string[] | null | undefined, cited: string[]): Finding | null {
  if (!baseline || !next) return null;                         // no sentence data (an old state): nothing to compare, V1 still reviews the version
  const keep = new Set(next.map(fold)), was = new Set(baseline.map(fold)), cite = new Set(cited.map(fold));
  const touchedUncited = baseline.filter((s) => !keep.has(fold(s)) && !cite.has(fold(s)));
  const citedGone = baseline.filter((s) => !keep.has(fold(s)) && cite.has(fold(s))).length;
  const added = next.filter((s) => !was.has(fold(s))).length;
  const limit = 2 * Math.max(1, citedGone);
  if (!touchedUncited.length && added <= limit) return null;
  const parts: string[] = [];
  if (touchedUncited.length) parts.push(`these sentences V1 did not cite were changed or removed: ${touchedUncited.slice(0, 4).map((s) => `"${s.slice(0, 90)}"`).join("; ")}`);
  if (added > limit) parts.push(`${added} sentences were added for ${citedGone} cited sentence(s) fixed (limit ${limit})`);
  return { code: "V1_FIX_CHURN", severity: "REVISION", detail: `The V1 fix pass may change only the sentences V1 cited; ${parts.join("; ")}. Restore the rest and fix only the cited sentences.` };
}
