// Section diffs (before/after) and the UPDATE guard (live text vs proposed patch).
// For a CREATE there is no live text. For an UPDATE the blueprint's safeguard applies: the agent must not overwrite untouched sections,
// so any section not named in the change request must be byte-identical to the live page's text.
export type DiffLine = { kind: "same" | "add" | "del"; text: string };

/** Line diff by longest common subsequence. Lines are the reader-visible strings of a section (see unitStrings). */
export function lineDiff(before: string[], after: string[]): DiffLine[] {
  const n = before.length, m = after.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = before[i] === after[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) { out.push({ kind: "same", text: before[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: "del", text: before[i++] });
    else out.push({ kind: "add", text: after[j++] });
  }
  while (i < n) out.push({ kind: "del", text: before[i++] });
  while (j < m) out.push({ kind: "add", text: after[j++] });
  return out;
}
export const changed = (d: DiffLine[]) => d.some((l) => l.kind !== "same");

export type LiveSection = { key: string; text: string };
/**
 * UPDATE guard: `live` is the stored snapshot of the published page by section; `proposed` is the proposed text by the same keys.
 * Sections not listed in `touched` must be identical to live. Returns the violations (empty = safe).
 */
export function updateViolations(live: LiveSection[], proposed: LiveSection[], touched: string[]): string[] {
  const v: string[] = [];
  const p = new Map(proposed.map((s) => [s.key, s.text]));
  for (const l of live) {
    if (touched.includes(l.key)) continue;
    if (!p.has(l.key)) v.push(`untouched section ${l.key} was removed`);
    else if (p.get(l.key) !== l.text) v.push(`untouched section ${l.key} was rewritten (it must stay byte for byte as published)`);
  }
  for (const s of proposed) if (!live.some((l) => l.key === s.key) && !touched.includes(s.key)) v.push(`new section ${s.key} is not part of the change request`);
  return v;
}

/** For the UI: live vs proposed for one section (UPDATE) as a diff of lines. */
export const liveVsProposed = (live: string, proposed: string) => lineDiff(live.split("\n"), proposed.split("\n"));
