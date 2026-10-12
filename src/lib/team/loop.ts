// Phase 3c: the team-mode section loop, beside the classic loop.ts (which stays untouched).
//   write -> deterministic checks -> council (V1 fact/privacy, V2 SEO/AEO/GEO, V3 editorial) -> one revision set -> re-review -> lock.
// Decision rules (proposal section 4), all enforced here in code, never by agent agreement:
//   - V1 must pass the exact material content; only V1 can block; only a V1 pass on a new review clears a V1 item (it cannot be argued away or declined);
//   - every must-fix from V2/V3 must be closed; should-fix and suggestions never block, they are collected for Leo (so one reviewer cannot deadlock an article);
//   - V1 re-reviews every version whose text changed, not only material changes (unsourced generalizations such as "most owners" are wording, and the
//     material signature misses them). The re-review is scoped to the changed sentences to keep cost down; a material change, an open V1 item, or a
//     writer that sent no text means a full review. Only a byte-identical version (same hash V1 passed) carries the pass. Every new version goes to V2 and V3;
//   - the lock is set only by recordReview, when V1 passed the current material content and no must-fix is open. No role can lock.
// Pure functions over a TeamSectionState; persistence lives in the service. Two revision attempts per must-fix, then escalation (REVISION_LIMIT).
import { REVISION_LIMIT } from "../orchestrator/states";
import { hedgeFlagsInText, type Finding } from "../studio/checks";
import { declinesForLeo, mergeReview, recordWriterDeclines, type DeclineRecord } from "../studio/declines";
import { isMustFixRuling, keepsRuling, needsRuling, rulingGuard, rulingNoteError, type HedgeRulingKind } from "../studio/hedge-rulings";

export type CouncilRole = "V1" | "V2" | "V3";
export const COUNCIL: readonly CouncilRole[] = ["V1", "V2", "V3"];
export type TeamStatus = "NEEDS_WRITE" | "NEEDS_COUNCIL" | "NEEDS_REVISION" | "LOCKED" | "ESCALATED" | "BLOCKED_CLAIM" | "BLOCKED_PRIVACY";
export type ItemSeverity = "must fix" | "should fix" | "suggestion";
export type MustFix = { key: string; role: CouncilRole | "CODE" | "LEO"; text: string; attempts: number };
export type Collected = { key: string; role: CouncilRole; severity: "should fix" | "suggestion"; text: string; versionHash: string; declined: string | null };
export type TeamSectionState = {
  key: string; status: TeamStatus;
  versionNo: number; versionHash: string | null; sig: string | null; sentences: string[] | null;
  v1Passed: { hash: string; sig: string; sentences: string[] | null } | null;   // what V1 passed; the lock requires its hash to equal versionHash
  hedges: HedgeRecord[];             // flagged hedge sentences in the current version; the lock needs every one ruled "proven"
  v1Scope: V1Scope | null;           // what V1 must look at on the pending review (null when V1 is not pending)
  pending: CouncilRole[];            // council members who still have to review the current version
  mustFix: MustFix[];                // open must-fixes (V1 items, V2/V3 must-fix, deterministic findings, Leo directives)
  collected: Collected[];            // should-fix and suggestions, listed for Leo; never block
  declines?: DeclineRecord[];        // the writer's declines (Phase 3d): stored by code, never replaced by a reviewer's list, kept across versions, reopen and unlock
  lockedHash: string | null;
  escalation: { issueKey: string; reason: string } | null;
  blockedBy: string | null;
};
export type HedgeRuling = HedgeRulingKind;
/** A sentence with a hedge phrase ("most owners", "usually" ...). Flagged by code, never a block: V1 must rule on each one explicitly. */
export type HedgeRecord = { key: string; term: string; sentence: string; ruling: HedgeRuling | null; note: string | null };
export type V1Scope = { kind: "full" } | { kind: "changed"; sentences: string[] };
export type Outcome = { ok: true; state: TeamSectionState; note?: string } | { ok: false; error: string };

export const newTeamSection = (key: string): TeamSectionState => ({ key, status: "NEEDS_WRITE", versionNo: 0, versionHash: null, sig: null, sentences: null, v1Passed: null, hedges: [], v1Scope: null, pending: [], mustFix: [], collected: [], declines: [], lockedHash: null, escalation: null, blockedBy: null });
const HUMAN_STOPS: TeamStatus[] = ["ESCALATED", "BLOCKED_CLAIM", "BLOCKED_PRIVACY"];
const fail = (error: string): Outcome => ({ ok: false, error });
/** Sentences of a unit's plain text, whitespace-normalized, for the changed-sentence scope. */
export const splitSentences = (text: string): string[] => text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);

/** A new version from the writer (W1). Every new version goes back to V2 and V3; V1 re-reviews when the material content changed or V1 had open items. */
export function recordVersion(s: TeamSectionState, v: { hash: string; sig: string; text?: string }): Outcome {
  if (s.status === "LOCKED") return fail("section is locked; a locked section changes only through a human edit that clears the lock");
  if (HUMAN_STOPS.includes(s.status)) return fail(`section is ${s.status}; a human must resolve it first`);
  if (s.status !== "NEEDS_WRITE" && s.status !== "NEEDS_REVISION") return fail(`section is ${s.status}, not waiting for the writer`);
  const sentences = v.text === undefined ? null : splitSentences(v.text);
  const base = s.v1Passed;
  const v1Open = s.mustFix.some((i) => i.role === "V1");
  const v1Again = base?.hash !== v.hash || v1Open;            // only a byte-identical version carries V1's pass
  let v1Scope: V1Scope | null = null;
  if (v1Again) {
    const changed = base?.sentences && sentences && !v1Open && v.sig === base.sig ? sentences.filter((x) => !base.sentences!.includes(x)) : null;
    v1Scope = changed && changed.length ? { kind: "changed", sentences: changed } : { kind: "full" };
  }
  // Deterministic and Leo items are re-evaluated on the new text; council items stay open until their reviewer re-reviews.
  const mustFix = s.mustFix.filter((i) => i.role !== "LEO").map((i) => ({ ...i, attempts: i.attempts + 1 }));
  const pending: CouncilRole[] = v1Again ? ["V1", "V2", "V3"] : ["V2", "V3"];
  // Hedge sentences are re-detected on the new text. A sentence V1 already ruled "proven" (same words) keeps that ruling; anything else needs a fresh ruling.
  const hedges: HedgeRecord[] = v.text === undefined ? s.hedges : hedgeFlagsInText(v.text).map((h) => { const old = s.hedges.find((x) => x.key === h.key && keepsRuling(x.ruling)); return { ...h, ruling: old ? old.ruling : null, note: old?.note ?? null }; });
  const note = v1Again && base ? (v1Scope!.kind === "changed" ? `V1 re-reviews ${v1Scope!.sentences.length} changed sentence(s)` : "V1 re-reviews the full section") : undefined;
  return { ok: true, state: { ...s, versionNo: s.versionNo + 1, versionHash: v.hash, sig: v.sig, sentences, status: "NEEDS_COUNCIL", pending, mustFix, hedges, v1Passed: v1Again ? null : base, v1Scope, blockedBy: null }, note };
}

/** Deterministic findings (checks.ts) run on every new version before any reviewer sees it. Call with [] when the checks are clean. */
export function applyDeterministic(s: TeamSectionState, findings: Finding[]): Outcome {
  if (s.status !== "NEEDS_COUNCIL") return fail(`deterministic checks run on a new version, section is ${s.status}`);
  const priv = findings.find((f) => f.severity === "BLOCKED_PRIVACY");
  const claim = findings.find((f) => f.severity === "BLOCKED_CLAIM");
  if (priv || claim) { const f = (priv ?? claim)!; return { ok: true, state: { ...s, status: priv ? "BLOCKED_PRIVACY" : "BLOCKED_CLAIM", pending: [], blockedBy: `${f.code}: ${f.detail}` } }; }
  const prior = new Map(s.mustFix.filter((i) => i.role === "CODE").map((i) => [i.key, i.attempts]));
  const rest = s.mustFix.filter((i) => i.role !== "CODE");
  if (findings.length === 0) return { ok: true, state: { ...s, mustFix: rest } };
  const det: MustFix[] = findings.map((f) => ({ key: `det:${f.code}`, role: "CODE", text: f.detail, attempts: prior.get(`det:${f.code}`) ?? 0 }));
  const stuck = det.find((i) => i.attempts >= REVISION_LIMIT);
  if (stuck) return { ok: true, state: { ...s, mustFix: [...rest, ...det], pending: [], status: "ESCALATED", escalation: { issueKey: stuck.key, reason: `still not resolved after ${stuck.attempts} revision attempts: ${stuck.text}` } }, note: "escalated" };
  return { ok: true, state: { ...s, mustFix: [...rest, ...det], pending: [], status: "NEEDS_REVISION" } };
}

export type ReviewItem = { key: string; severity: ItemSeverity; text: string; newEvidence?: string | null };
export type HedgeVerdict = { key: string; ruling: HedgeRuling; note?: string };
export type CouncilReview = { role: string; versionHash: string; decision: "PASS" | "REVISION" | "BLOCKED"; items: ReviewItem[]; blockKind?: "BLOCKED_CLAIM" | "BLOCKED_PRIVACY"; hedgeRulings?: HedgeVerdict[] };

/** One council member reviews the current version. When the last pending member reports, the code decides: revise, or lock. */
export function recordReview(s: TeamSectionState, r: CouncilReview): Outcome {
  if (!(COUNCIL as readonly string[]).includes(r.role)) return fail(`${r.role} is not a council member and cannot review or lock a section`);
  const role = r.role as CouncilRole;
  if (s.status !== "NEEDS_COUNCIL") return fail(`${role} cannot review a section that is ${s.status}`);
  if (r.versionHash !== s.versionHash) return fail("the review is for an older version of this section");
  if (!s.pending.includes(role)) return fail(`${role} has no review pending on this version`);
  if (r.decision === "BLOCKED" && role !== "V1") return fail("only V1 can block");
  if (r.hedgeRulings?.length && role !== "V1") return fail("only V1 rules on hedge sentences");
  if (r.decision === "BLOCKED") {
    return { ok: true, state: { ...s, pending: [], status: r.blockKind ?? "BLOCKED_CLAIM", blockedBy: r.items.map((i) => i.text).join("; ") || "V1 blocked" } };
  }
  // Hedge sentences: V1 must rule on every unruled one (proven with its evidence / reword / drop). Reword and drop become V1 must-fixes.
  let hedges = s.hedges;
  const hedgeMust: ReviewItem[] = [];
  if (role === "V1") {
    const byKey = new Map((r.hedgeRulings ?? []).map((h) => [h.key, h]));
    for (const h of r.hedgeRulings ?? []) if (!s.hedges.some((x) => x.key === h.key)) return fail(`ruling for ${h.key}, which is not a flagged sentence in this version`);
    const missing = s.hedges.filter((h) => needsRuling(h) && !byKey.has(h.key));
    if (missing.length) return fail(`V1 must rule (proven / soften / not_a_claim / reword / drop) on every flagged sentence; missing: ${missing.map((h) => `${h.key} "${h.sentence}"`).join("; ")}`);
    for (const h of s.hedges) {
      const v = byKey.get(h.key);
      if (!v) continue;
      const bad = rulingNoteError(h.key, v.ruling, v.note) ?? rulingGuard(h.sentence, v.ruling);
      if (bad) return fail(bad);
      // reword and drop are must-fix; soften is a should-fix (listed for Leo, never blocks); proven and not_a_claim produce nothing.
      if (isMustFixRuling(v.ruling)) hedgeMust.push({ key: h.key, severity: "must fix", text: `${v.ruling} the unsourced generalization (${h.term}): "${h.sentence}"${v.note ? ` - ${v.note}` : ""}` });
      else if (v.ruling === "soften") hedgeMust.push({ key: `soften:${h.key}`, severity: "should fix", text: `soften the unsourced generalization (${h.term}): "${h.sentence}"${v.note ? ` - ${v.note}` : ""}` });
    }
    hedges = s.hedges.map((h) => { const v = byKey.get(h.key); return v ? { ...h, ruling: v.ruling, note: v.note?.trim() || null } : h; });
  }
  const items = [...r.items, ...hedgeMust];
  const must = items.filter((i) => i.severity === "must fix");
  if (r.decision === "PASS" && must.length) return fail("a PASS cannot carry must-fix items (a reword or drop ruling is a must-fix)");
  if (r.decision === "REVISION" && !must.length) return fail("a REVISION needs at least one must-fix item");
  // This reviewer's earlier must-fixes are replaced by what it reports now; a key it no longer reports is closed.
  const prior = new Map(s.mustFix.filter((i) => i.role === role).map((i) => [i.key, i.attempts]));
  const mine: MustFix[] = must.map((i) => ({ key: i.key, role, text: i.text, attempts: prior.get(i.key) ?? 0 }));
  const stuck = mine.find((i) => i.attempts >= REVISION_LIMIT);
  const mustFix = [...s.mustFix.filter((i) => i.role !== role), ...mine];
  // Soft items go through the declines store: an item the writer already declined counts once and is not reopened, unless the reviewer cites new evidence.
  const merged = mergeReview(s.declines ?? [], s.collected, role, items.filter((i) => i.severity !== "must fix").map((i) => ({ key: i.key, severity: i.severity as "should fix" | "suggestion", text: i.text, newEvidence: i.newEvidence })), r.versionHash);
  const collected = merged.collected as Collected[];
  const pending = s.pending.filter((p) => p !== role);
  const v1Passed = role === "V1" ? (r.decision === "PASS" ? { hash: s.versionHash!, sig: s.sig!, sentences: s.sentences } : null) : s.v1Passed;
  const next: TeamSectionState = { ...s, pending, mustFix, collected, declines: merged.declines, hedges, v1Passed, v1Scope: role === "V1" ? null : s.v1Scope };
  if (stuck) return { ok: true, state: { ...next, status: "ESCALATED", escalation: { issueKey: stuck.key, reason: `still not resolved after ${stuck.attempts} revision attempts: ${stuck.text}` } }, note: "escalated" };
  if (pending.length) return { ok: true, state: next };
  if (mustFix.length) return { ok: true, state: { ...next, status: "NEEDS_REVISION" } };
  if (hedges.some(needsRuling)) return { ok: true, state: { ...next, status: "NEEDS_COUNCIL", pending: ["V1"], v1Scope: { kind: "changed", sentences: hedges.filter(needsRuling).map((h) => h.sentence) } }, note: "a flagged sentence has no V1 ruling: back to V1" };
  if (v1Passed?.hash !== s.versionHash) return { ok: true, state: { ...next, status: "NEEDS_COUNCIL", pending: ["V1"], v1Scope: { kind: "full" } }, note: "V1 has not passed this content: back to V1" };
  return { ok: true, state: { ...next, status: "LOCKED", lockedHash: s.versionHash, pending: [] }, note: "locked" };
}

/** W1 declines should-fix items and suggestions with a reason (listed for Leo, stored in `declines`). A must-fix cannot be declined, and a V1 item can never be argued away. */
export function declineMany(s: TeamSectionState, list: { key: string; reason: string }[], extra: { key: string; text: string; role: string }[] = []): Outcome {
  const r = recordWriterDeclines(s.declines ?? [], s.collected, list, { mustFixKeys: s.mustFix.map((i) => i.key), extraDeclinable: extra });
  if (!r.ok) return fail(r.errors.join("; "));
  return { ok: true, state: { ...s, declines: r.declines, collected: r.collected as Collected[] } };
}
export function decline(s: TeamSectionState, key: string, reason: string): Outcome {
  if (s.mustFix.some((i) => i.key === key)) return fail("a must-fix cannot be declined: fix it, or escalate to Leo. Only the reviewer that raised it can close it, by passing the new version");
  if (!reason.trim()) return fail("declining needs a reason");
  if (!s.collected.some((x) => x.key === key)) return fail(`no open item ${key}`);
  return declineMany(s, [{ key, reason }]);
}

/** Leo resolves an escalation or a block: back to the writer, with a Leo directive. Every reviewer, V1 included, looks at the next version. */
export function resolveByHuman(s: TeamSectionState, a: { kind: "request_revision"; issueText: string } | { kind: "hold" }): Outcome {
  if (!HUMAN_STOPS.includes(s.status)) return fail(`nothing to resolve: section is ${s.status}`);
  if (a.kind === "hold") return { ok: true, state: s, note: "held" };
  const key = s.escalation?.issueKey ?? "human:directive";
  const mustFix = [...s.mustFix.filter((i) => i.key !== key && i.role !== "LEO"), { key, role: "LEO" as const, text: a.issueText, attempts: 0 }];
  return { ok: true, state: { ...s, mustFix, status: "NEEDS_REVISION", escalation: null, blockedBy: null, v1Passed: null, v1Scope: null, pending: [] } };
}

/** An edit to a locked section makes a new version, clears the lock and every earlier pass. The caller invalidates approvals. */
export function editLocked(s: TeamSectionState, v: { hash: string; sig: string; text?: string }): Outcome {
  if (s.status !== "LOCKED") return fail("section is not locked");
  return { ok: true, state: { ...s, versionNo: s.versionNo + 1, versionHash: v.hash, sig: v.sig, sentences: v.text === undefined ? null : splitSentences(v.text), hedges: v.text === undefined ? [] : hedgeFlagsInText(v.text).map((h) => ({ ...h, ruling: null, note: null })), status: "NEEDS_COUNCIL", pending: ["V1", "V2", "V3"], v1Passed: null, v1Scope: { kind: "full" }, lockedHash: null, mustFix: [], collected: [] }, note: "lock cleared; full council review runs again" };
}

/** A human reopens a locked section without supplying text: it goes back to the writer and through the full council again. */
export function reopen(s: TeamSectionState, directive: string): Outcome {
  if (s.status !== "LOCKED") return fail("section is not locked");
  return { ok: true, state: { ...s, status: "NEEDS_REVISION", v1Passed: null, v1Scope: null, lockedHash: null, pending: [], mustFix: [{ key: "human:directive", role: "LEO", text: directive, attempts: 0 }], collected: [] } };
}

/** The writer says the section cannot be written without inventing a fact: an escalation to Leo, never a filled-in gap. */
export function escalateGap(s: TeamSectionState, reason: string): Outcome {
  if (s.status !== "NEEDS_WRITE" && s.status !== "NEEDS_REVISION") return fail(`section is ${s.status}, not waiting for the writer`);
  return { ok: true, state: { ...s, status: "ESCALATED", escalation: { issueKey: "writer:gap", reason } } };
}

/**
 * The brief changed under this unit (S2 fixed a root cause, or S2 found the brief was not the cause and the point goes back to the writer).
 * A locked unit goes back to the writer and through the full council; a unit in review returns to the writer; an unwritten unit just uses the new brief.
 * The directive is a code-set must-fix, consumed by the next version. Escalated and blocked units wait for Leo first.
 */
export function briefRevised(s: TeamSectionState, d: { key: string; text: string }): Outcome {
  if (HUMAN_STOPS.includes(s.status)) return fail(`section is ${s.status}; a human must resolve it first`);
  if (s.status === "NEEDS_WRITE") return { ok: true, state: s, note: "unit not written yet: the writer uses the revised brief" };
  const mustFix = [...s.mustFix.filter((i) => i.key !== d.key), { key: d.key, role: "LEO" as const, text: d.text, attempts: 0 }];
  return { ok: true, state: { ...s, status: "NEEDS_REVISION", lockedHash: null, v1Passed: null, v1Scope: null, pending: [], mustFix }, note: s.status === "LOCKED" ? "locked unit reopened: the brief changed" : "unit returned to the writer: the brief changed" };
}

export const allLocked = (sections: TeamSectionState[]) => sections.length > 0 && sections.every((s) => s.status === "LOCKED");
/** What goes to Leo with the finished section: open (not declined) should-fix and suggestions, and the declined ones with their reasons. */
export const forLeo = (s: TeamSectionState) => declinesForLeo(s.declines ?? [], s.collected);
