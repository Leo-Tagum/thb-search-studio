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
import type { Finding } from "../studio/checks";

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
  v1Scope: V1Scope | null;           // what V1 must look at on the pending review (null when V1 is not pending)
  pending: CouncilRole[];            // council members who still have to review the current version
  mustFix: MustFix[];                // open must-fixes (V1 items, V2/V3 must-fix, deterministic findings, Leo directives)
  collected: Collected[];            // should-fix and suggestions, listed for Leo; never block
  lockedHash: string | null;
  escalation: { issueKey: string; reason: string } | null;
  blockedBy: string | null;
};
export type V1Scope = { kind: "full" } | { kind: "changed"; sentences: string[] };
export type Outcome = { ok: true; state: TeamSectionState; note?: string } | { ok: false; error: string };

export const newTeamSection = (key: string): TeamSectionState => ({ key, status: "NEEDS_WRITE", versionNo: 0, versionHash: null, sig: null, sentences: null, v1Passed: null, v1Scope: null, pending: [], mustFix: [], collected: [], lockedHash: null, escalation: null, blockedBy: null });
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
  const note = v1Again && base ? (v1Scope!.kind === "changed" ? `V1 re-reviews ${v1Scope!.sentences.length} changed sentence(s)` : "V1 re-reviews the full section") : undefined;
  return { ok: true, state: { ...s, versionNo: s.versionNo + 1, versionHash: v.hash, sig: v.sig, sentences, status: "NEEDS_COUNCIL", pending, mustFix, v1Passed: v1Again ? null : base, v1Scope, blockedBy: null }, note };
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

export type ReviewItem = { key: string; severity: ItemSeverity; text: string };
export type CouncilReview = { role: string; versionHash: string; decision: "PASS" | "REVISION" | "BLOCKED"; items: ReviewItem[]; blockKind?: "BLOCKED_CLAIM" | "BLOCKED_PRIVACY" };

/** One council member reviews the current version. When the last pending member reports, the code decides: revise, or lock. */
export function recordReview(s: TeamSectionState, r: CouncilReview): Outcome {
  if (!(COUNCIL as readonly string[]).includes(r.role)) return fail(`${r.role} is not a council member and cannot review or lock a section`);
  const role = r.role as CouncilRole;
  if (s.status !== "NEEDS_COUNCIL") return fail(`${role} cannot review a section that is ${s.status}`);
  if (r.versionHash !== s.versionHash) return fail("the review is for an older version of this section");
  if (!s.pending.includes(role)) return fail(`${role} has no review pending on this version`);
  if (r.decision === "BLOCKED" && role !== "V1") return fail("only V1 can block");
  const must = r.items.filter((i) => i.severity === "must fix");
  if (r.decision === "PASS" && must.length) return fail("a PASS cannot carry must-fix items");
  if (r.decision === "REVISION" && !must.length) return fail("a REVISION needs at least one must-fix item");
  if (r.decision === "BLOCKED") {
    return { ok: true, state: { ...s, pending: [], status: r.blockKind ?? "BLOCKED_CLAIM", blockedBy: r.items.map((i) => i.text).join("; ") || "V1 blocked" } };
  }
  // This reviewer's earlier must-fixes are replaced by what it reports now; a key it no longer reports is closed.
  const prior = new Map(s.mustFix.filter((i) => i.role === role).map((i) => [i.key, i.attempts]));
  const mine: MustFix[] = must.map((i) => ({ key: i.key, role, text: i.text, attempts: prior.get(i.key) ?? 0 }));
  const stuck = mine.find((i) => i.attempts >= REVISION_LIMIT);
  const mustFix = [...s.mustFix.filter((i) => i.role !== role), ...mine];
  const was = new Map(s.collected.filter((c) => c.role === role).map((c) => [c.key, c.declined]));
  const soft: Collected[] = r.items.filter((i) => i.severity !== "must fix").map((i) => ({ key: i.key, role, severity: i.severity as Collected["severity"], text: i.text, versionHash: r.versionHash, declined: was.get(i.key) ?? null }));
  const collected = [...s.collected.filter((c) => c.role !== role), ...soft];
  const pending = s.pending.filter((p) => p !== role);
  const v1Passed = role === "V1" ? (r.decision === "PASS" ? { hash: s.versionHash!, sig: s.sig!, sentences: s.sentences } : null) : s.v1Passed;
  const next: TeamSectionState = { ...s, pending, mustFix, collected, v1Passed, v1Scope: role === "V1" ? null : s.v1Scope };
  if (stuck) return { ok: true, state: { ...next, status: "ESCALATED", escalation: { issueKey: stuck.key, reason: `still not resolved after ${stuck.attempts} revision attempts: ${stuck.text}` } }, note: "escalated" };
  if (pending.length) return { ok: true, state: next };
  if (mustFix.length) return { ok: true, state: { ...next, status: "NEEDS_REVISION" } };
  if (v1Passed?.hash !== s.versionHash) return { ok: true, state: { ...next, status: "NEEDS_COUNCIL", pending: ["V1"], v1Scope: { kind: "full" } }, note: "V1 has not passed this content: back to V1" };
  return { ok: true, state: { ...next, status: "LOCKED", lockedHash: s.versionHash, pending: [] }, note: "locked" };
}

/** W1 declines a should-fix or suggestion with a reason (listed for Leo). A must-fix cannot be declined, and a V1 item can never be argued away. */
export function decline(s: TeamSectionState, key: string, reason: string): Outcome {
  if (s.mustFix.some((i) => i.key === key)) return fail("a must-fix cannot be declined: fix it, or escalate to Leo. Only the reviewer that raised it can close it, by passing the new version");
  const c = s.collected.find((x) => x.key === key);
  if (!c) return fail(`no open item ${key}`);
  if (!reason.trim()) return fail("declining needs a reason");
  return { ok: true, state: { ...s, collected: s.collected.map((x) => (x.key === key ? { ...x, declined: reason } : x)) } };
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
  return { ok: true, state: { ...s, versionNo: s.versionNo + 1, versionHash: v.hash, sig: v.sig, sentences: v.text === undefined ? null : splitSentences(v.text), status: "NEEDS_COUNCIL", pending: ["V1", "V2", "V3"], v1Passed: null, v1Scope: { kind: "full" }, lockedHash: null, mustFix: [], collected: [] }, note: "lock cleared; full council review runs again" };
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

export const allLocked = (sections: TeamSectionState[]) => sections.length > 0 && sections.every((s) => s.status === "LOCKED");
/** What goes to Leo with the finished section: open (not declined) should-fix and suggestions, and the declined ones with their reasons. */
export const forLeo = (s: TeamSectionState) => ({ open: s.collected.filter((c) => !c.declined), declined: s.collected.filter((c) => c.declined) });
