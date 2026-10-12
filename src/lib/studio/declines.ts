// Phase 3d (report 6.1): declines are stored by code, per unit, and a reviewer's new list never replaces them.
//   - The writer returns `declines: [{key, reason}]` for should-fix items and suggestions it chooses not to apply. A must-fix is never declinable.
//   - A re-raised item (same key, or similar text under a new key or new wording) with a stored decline counts once: it is not reopened and not
//     listed twice, unless the reviewer cites `new_evidence`, which reopens it.
//   - Declines stay listed for Leo for as long as the unit exists; reopen, new versions and reviewer lists do not clear them.
// Pure functions, shared by the classic loop and the team loop.

export type DeclineRecord = {
  key: string;              // the key the item had when it was declined
  role: string;             // who raised it (V1-V3, "A6", "A7" ...)
  text: string;             // the item's text when it was declined
  reason: string;           // the writer's reason
  raised: number;           // 1 = declined once; +1 each time a reviewer raised it again without new evidence
};
export type SoftItem = { key: string; role: string; text: string; newEvidence?: string | null };

const STOP = new Set(["the", "a", "an", "of", "to", "in", "is", "are", "and", "or", "for", "on", "it", "this", "that", "with", "no", "not", "be", "as", "at", "by", "any", "there", "from", "so", "if"]);
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)));

/** Word-set overlap in 0..1: the larger of Jaccard and containment of the shorter text (a reviewer who shortens or extends the same point still matches). */
export function similarity(a: string, b: string): number {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  const jaccard = inter / (x.size + y.size - inter);
  const contain = inter / Math.min(x.size, y.size);
  return Math.max(jaccard, contain >= 0.85 && Math.min(x.size, y.size) >= 5 ? contain * 0.9 : 0);
}
export const SIMILAR_AT = 0.6;

export function findDecline(declines: DeclineRecord[], item: { key: string; text: string }): DeclineRecord | null {
  const exact = declines.find((d) => d.key === item.key);
  if (exact) return exact;
  let best: DeclineRecord | null = null, score = 0;
  for (const d of declines) { const s = similarity(d.text, item.text); if (s >= SIMILAR_AT && s > score) { best = d; score = s; } }
  return best;
}

export type Collected = { key: string; role: string; severity: "should fix" | "suggestion"; text: string; versionHash: string; declined: string | null };

/**
 * A reviewer reports its soft items for a version. Items matching a stored decline are not reopened: the decline's `raised` counter goes up and the
 * item shows as declined. With `newEvidence` the decline is lifted (kept in `reopened` for the record) and the item is open again.
 * This reviewer's earlier collected items are replaced by the new list, as before; the declines are not touched by that replacement.
 */
export function mergeReview(declines: DeclineRecord[], collected: Collected[], role: string, items: { key: string; severity: "should fix" | "suggestion"; text: string; newEvidence?: string | null }[], versionHash: string): { declines: DeclineRecord[]; collected: Collected[]; counted: string[]; reopened: { key: string; evidence: string }[] } {
  let ds = declines.map((d) => ({ ...d }));
  const counted: string[] = [], reopened: { key: string; evidence: string }[] = [];
  const soft: Collected[] = [];
  const seen = new Set<string>();
  for (const i of items) {
    const hit = findDecline(ds, i);
    const evidence = (i.newEvidence ?? "").trim();
    if (hit && !evidence) {
      if (seen.has(hit.key)) continue;                        // counts once per review, however many times it is worded
      seen.add(hit.key);
      hit.raised += 1; counted.push(hit.key);
      soft.push({ key: hit.key, role, severity: i.severity, text: hit.text, versionHash, declined: hit.reason });
      continue;
    }
    if (hit) { ds = ds.filter((d) => d.key !== hit.key); reopened.push({ key: hit.key, evidence }); }   // new evidence lifts the decline
    soft.push({ key: i.key, role, severity: i.severity, text: i.text, versionHash, declined: null });
  }
  return { declines: ds, collected: [...collected.filter((c) => c.role !== role), ...soft], counted, reopened };
}

export type DeclineResult = { ok: true; declines: DeclineRecord[]; collected: Collected[] } | { ok: false; errors: string[] };

/** The writer's declines. Each key must be an open should-fix or suggestion the code knows about; a must-fix key is refused. */
export function recordWriterDeclines(declines: DeclineRecord[], collected: Collected[], list: { key: string; reason: string }[], opts: { mustFixKeys: string[]; extraDeclinable?: { key: string; text: string; role: string }[] }): DeclineResult {
  const errors: string[] = [];
  const known = new Map<string, { text: string; role: string }>();
  for (const c of collected) known.set(c.key, { text: c.text, role: c.role });
  for (const e of opts.extraDeclinable ?? []) if (!known.has(e.key)) known.set(e.key, { text: e.text, role: e.role });
  const ds = declines.map((d) => ({ ...d }));
  const seen = new Set<string>();
  for (const d of list) {
    if (seen.has(d.key)) { errors.push(`declines: ${d.key} is listed twice`); continue; }
    seen.add(d.key);
    if (opts.mustFixKeys.includes(d.key)) { errors.push(`declines: ${d.key} is a must-fix and cannot be declined: fix it`); continue; }
    const k = known.get(d.key);
    if (!k) { errors.push(`declines: ${d.key} is not an open should-fix or suggestion for this unit (use the exact key from your packet)`); continue; }
    if (!d.reason.trim() || d.reason.trim().length < 10) { errors.push(`declines: ${d.key} needs a reason (at least 10 characters)`); continue; }
    const old = ds.find((x) => x.key === d.key);
    if (old) old.reason = d.reason.trim();
    else ds.push({ key: d.key, role: k.role, text: k.text, reason: d.reason.trim(), raised: 1 });
  }
  if (errors.length) return { ok: false, errors };
  const byKey = new Map(ds.map((d) => [d.key, d]));
  return { ok: true, declines: ds, collected: collected.map((c) => (byKey.has(c.key) ? { ...c, declined: byKey.get(c.key)!.reason } : c)) };
}

/** What goes to Leo: open items, and every stored decline with its reason and how many times it was raised. */
export const declinesForLeo = (declines: DeclineRecord[], collected: Collected[]) => ({ open: collected.filter((c) => !c.declined), declined: declines });
