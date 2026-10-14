// Protected-list import (WP Ads Protection list). Pure planning plus one apply step that can only ever mark "protected".
// Nothing here sets "not_protected": the apply function has no status parameter, and a page already marked not_protected is reported, never changed.
import { markProtection, type ProtectionDb } from "./protection";

export const PROTECTED_REASON = "WP Ads Protection list, 2026-10-14";
export const PROTECTED_ACTOR = "leo";

export type ListRow = { url: string; wpId: number; state: string };
export type KnownPage = { id: string; wp_id: number | null; url: string; protection_status: "unknown" | "protected" | "not_protected" };
export type Match = { row: ListRow; page: KnownPage; how: "url" | "wp_id" };
export type ImportPlan = {
  toMark: Match[];
  alreadyProtected: Match[];
  /** On the list but the database says not_protected: reported for Leo, never changed. */
  conflicts: Match[];
  /** No page row. Retired pages (state starts with "Retired") are kept apart from the rest; no rows are added for either. */
  retiredUnmatched: ListRow[];
  otherUnmatched: ListRow[];
};

export function pathOf(url: string): string {
  try { return new URL(url, "https://www.twinhomebuyer.com").pathname.replace(/\/+$/, "") + "/"; } catch { return url; }
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let cur: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { cur.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; cur.push(f); f = ""; if (cur.length > 1 || cur[0]) rows.push(cur); cur = []; }
    else f += c;
  }
  if (f || cur.length) { cur.push(f); rows.push(cur); }
  return rows;
}

export function parseProtectedList(text: string): ListRow[] {
  const [head, ...rows] = parseCsv(text);
  const col = (n: string) => head.indexOf(n);
  if (col("url") < 0 || col("wp_id") < 0 || col("state") < 0) throw new Error("protected list needs the columns url, wp_id, state");
  return rows.map((r) => ({ url: r[col("url")].trim(), wpId: Number(r[col("wp_id")]), state: r[col("state")].trim() }));
}

export const isRetired = (r: ListRow) => r.state.toLowerCase().startsWith("retired");

export function planProtectedImport(list: ListRow[], pages: KnownPage[]): ImportPlan {
  const byPath = new Map(pages.map((p) => [pathOf(p.url), p]));
  const byWp = new Map(pages.filter((p) => p.wp_id !== null).map((p) => [p.wp_id as number, p]));
  const plan: ImportPlan = { toMark: [], alreadyProtected: [], conflicts: [], retiredUnmatched: [], otherUnmatched: [] };
  const seen = new Set<string>();
  for (const row of list) {
    let page = row.url ? byPath.get(pathOf(row.url)) : undefined; let how: "url" | "wp_id" = "url";
    if (!page && Number.isFinite(row.wpId)) { page = byWp.get(row.wpId); how = "wp_id"; }
    if (!page) { (isRetired(row) ? plan.retiredUnmatched : plan.otherUnmatched).push(row); continue; }
    if (seen.has(page.id)) continue;
    seen.add(page.id);
    const m = { row, page, how };
    if (page.protection_status === "protected") plan.alreadyProtected.push(m);
    else if (page.protection_status === "not_protected") plan.conflicts.push(m);
    else plan.toMark.push(m);
  }
  return plan;
}

/** Marks each planned page "protected" through markProtection (audited, reason and actor fixed). Returns the page ids it marked. */
export async function applyProtectedImport(plan: ImportPlan, db: ProtectionDb): Promise<string[]> {
  const done: string[] = [];
  for (const m of plan.toMark) { await markProtection(db, m.page.id, "protected", PROTECTED_REASON, PROTECTED_ACTOR); done.push(m.page.id); }
  return done;
}

// ---------- overlap pairs: protected labels ----------
export type PairsLabelSummary = { pairs: number; supportedBefore: number; supportedAfter: number; stale: number; protectedLive: number; bothProtected: number };

/**
 * Adds a_protected, b_protected and protected_label to an overlap-pairs CSV. A pair with a retired protected URL on either side is labelled
 * "stale (redirected)" and is not counted as supported (supported_after_stale). Any other pair with a protected URL is labelled "protected".
 */
export function labelPairsCsv(pairsCsv: string, list: ListRow[]): { csv: string; summary: PairsLabelSummary } {
  const protectedPaths = new Set(list.filter((r) => r.url).map((r) => pathOf(r.url)));
  const retiredPaths = new Set(list.filter((r) => r.url && isRetired(r)).map((r) => pathOf(r.url)));
  const [head, ...rows] = parseCsv(pairsCsv);
  const ix = (n: string) => head.indexOf(n);
  const esc = (v: string) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  const s: PairsLabelSummary = { pairs: rows.length, supportedBefore: 0, supportedAfter: 0, stale: 0, protectedLive: 0, bothProtected: 0 };
  const out = [[...head, "a_protected", "b_protected", "protected_label", "supported_after_stale"].map(esc).join(",")];
  for (const r of rows) {
    const a = pathOf(r[ix("a_url")]), b = pathOf(r[ix("b_url")]);
    const pa = protectedPaths.has(a), pb = protectedPaths.has(b);
    const stale = retiredPaths.has(a) || retiredPaths.has(b);
    const supported = r[ix("supported")] === "true";
    if (supported) s.supportedBefore++;
    const after = supported && !stale;
    if (after) s.supportedAfter++;
    if (stale) s.stale++; else if (pa || pb) s.protectedLive++;
    if (pa && pb) s.bothProtected++;
    out.push([...r, String(pa), String(pb), stale ? "stale (redirected)" : pa || pb ? "protected" : "", String(after)].map(esc).join(","));
  }
  return { csv: out.join("\n") + "\n", summary: s };
}
