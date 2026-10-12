// Section-level review loop (blueprint §5):
//   write v1 -> fact/privacy (Agent 5) -> SEO/AEO/GEO (Agent 6) -> editorial (Agent 7) -> targeted revision -> re-review -> lock.
// Pure functions over a SectionState; persistence lives in service.ts. No agent can lock a section: the lock is only reached
// through a PASS from Agent 7 on the exact version whose material content Agent 5 passed. Two revision attempts per issue,
// then escalation to a human. A change to a material claim (statute, figure, date, claim ids) re-enters fact review.
import { REVISION_LIMIT } from "../orchestrator/states";
import type { Finding } from "./checks";
import { declinesForLeo, mergeReview, recordWriterDeclines, type Collected, type DeclineRecord } from "./declines";

export type Stage = "fact" | "seo" | "editorial";
export type SectionStatus =
  | "NEEDS_WRITE" | "NEEDS_FACT" | "NEEDS_SEO" | "NEEDS_EDITORIAL" | "NEEDS_REVISION"
  | "LOCKED" | "ESCALATED" | "BLOCKED_CLAIM" | "BLOCKED_PRIVACY";
export type Issue = { key: string; stage: Stage; text: string; attempts: number };
export type SectionState = {
  key: string; status: SectionStatus;
  versionNo: number; versionHash: string | null; sig: string | null;
  factPassedSig: string | null;      // material signature Agent 5 passed
  resumeStage: Stage | null;         // where review resumes after a revision
  issues: Issue[];
  lockedHash: string | null;
  escalation: { issueKey: string; reason: string } | null;
  blockedBy: string | null;
  collected?: Collected[];           // optional findings (should-fix, suggestions) of the reviewers, for Leo; never block (Phase 3d)
  declines?: DeclineRecord[];        // the writer's declines: stored by code, never replaced by a reviewer's list, kept across versions and reopen
};
export type Outcome = { ok: true; state: SectionState; note?: string } | { ok: false; error: string };

export const newSection = (key: string): SectionState => ({ key, status: "NEEDS_WRITE", versionNo: 0, versionHash: null, sig: null, factPassedSig: null, resumeStage: null, issues: [], lockedHash: null, escalation: null, blockedBy: null, collected: [], declines: [] });
const STAGE_STATUS: Record<Stage, SectionStatus> = { fact: "NEEDS_FACT", seo: "NEEDS_SEO", editorial: "NEEDS_EDITORIAL" };
const AGENT_STAGE: Record<5 | 6 | 7, Stage> = { 5: "fact", 6: "seo", 7: "editorial" };
const STAGE_AGENT = (st: SectionStatus): 5 | 6 | 7 | null => (st === "NEEDS_FACT" ? 5 : st === "NEEDS_SEO" ? 6 : st === "NEEDS_EDITORIAL" ? 7 : null);

/** A new version of the section from the writer (Agent 4). Locked, escalated and blocked sections refuse it. */
export function recordVersion(s: SectionState, v: { hash: string; sig: string }): Outcome {
  if (s.status === "LOCKED") return { ok: false, error: "section is locked; a locked section changes only through a human edit that clears the lock" };
  if (s.status === "ESCALATED" || s.status === "BLOCKED_CLAIM" || s.status === "BLOCKED_PRIVACY") return { ok: false, error: `section is ${s.status}; a human must resolve it first` };
  if (s.status !== "NEEDS_WRITE" && s.status !== "NEEDS_REVISION") return { ok: false, error: `section is ${s.status}, not waiting for the writer` };
  const revising = s.status === "NEEDS_REVISION";
  const issues = revising ? s.issues.map((i) => ({ ...i, attempts: i.attempts + 1 })) : s.issues;
  const stage: Stage = revising ? (v.sig !== s.factPassedSig ? "fact" : (s.resumeStage ?? "fact")) : "fact";
  return { ok: true, state: { ...s, versionNo: s.versionNo + 1, versionHash: v.hash, sig: v.sig, issues, status: STAGE_STATUS[stage], resumeStage: stage, blockedBy: null }, note: revising && stage === "fact" && s.resumeStage !== "fact" ? "material change: back to fact review" : undefined };
}

function withIssues(s: SectionState, stage: Stage, found: { key: string; text: string }[]): Outcome {
  const issues: Issue[] = s.issues.filter((i) => i.stage !== stage || found.some((f) => f.key === i.key));
  for (const f of found) {
    const ex = issues.find((i) => i.key === f.key);
    if (ex) {
      if (ex.attempts >= REVISION_LIMIT) return { ok: true, state: { ...s, issues, status: "ESCALATED", escalation: { issueKey: f.key, reason: `still not resolved after ${ex.attempts} revision attempts: ${f.text}` } }, note: "escalated" };
      ex.text = f.text;
    } else issues.push({ key: f.key, stage, text: f.text, attempts: 0 });
  }
  return { ok: true, state: { ...s, issues, status: "NEEDS_REVISION", resumeStage: stage, escalation: null } };
}

/** Deterministic findings (checks.ts) run on every new version before any agent sees it. */
export function applyDeterministic(s: SectionState, findings: Finding[]): Outcome {
  if (findings.length === 0) return { ok: true, state: s };
  const priv = findings.find((f) => f.severity === "BLOCKED_PRIVACY");
  const claim = findings.find((f) => f.severity === "BLOCKED_CLAIM");
  if (priv || claim) return { ok: true, state: { ...s, status: priv ? "BLOCKED_PRIVACY" : "BLOCKED_CLAIM", blockedBy: `${(priv ?? claim)!.code}: ${(priv ?? claim)!.detail}` } };
  return withIssues({ ...s, issues: s.issues.filter((i) => !i.key.startsWith("det:")) }, "fact", findings.map((f) => ({ key: `det:${f.code}`, text: f.detail })));
}

export type Review = { agent: 5 | 6 | 7; versionHash: string; decision: "PASS" | "REVISION" | "BLOCKED"; issues: { key: string; text: string }[]; blockKind?: "BLOCKED_CLAIM" | "BLOCKED_PRIVACY"; optional?: { key: string; text: string; newEvidence?: string | null }[] };

export function applyReview(s: SectionState, r: Review): Outcome {
  if (STAGE_AGENT(s.status) !== r.agent) return { ok: false, error: `Agent ${r.agent} cannot review a section that is ${s.status}` };
  if (r.versionHash !== s.versionHash) return { ok: false, error: "the review is for an older version of this section" };
  const stage = AGENT_STAGE[r.agent];
  // Optional findings go through the declines store: one the writer already declined counts once and is not reopened, unless the reviewer cites new evidence.
  if (r.optional) {
    const m = mergeReview(s.declines ?? [], s.collected ?? [], `A${r.agent}`, r.optional.map((o) => ({ key: o.key, severity: "should fix" as const, text: o.text, newEvidence: o.newEvidence })), r.versionHash);
    s = { ...s, collected: m.collected, declines: m.declines };
  }
  if (r.decision === "BLOCKED") return { ok: true, state: { ...s, status: r.blockKind ?? "BLOCKED_CLAIM", blockedBy: r.issues.map((i) => i.text).join("; ") || `Agent ${r.agent} blocked` } };
  if (r.decision === "REVISION") {
    if (r.issues.length === 0) return { ok: false, error: "a REVISION needs at least one required issue" };
    return withIssues(s, stage, r.issues);
  }
  if (r.issues.length > 0) return { ok: false, error: "a PASS cannot carry required issues" };
  const cleared = s.issues.filter((i) => i.stage !== stage);
  if (stage === "fact") return { ok: true, state: { ...s, issues: cleared, factPassedSig: s.sig, status: "NEEDS_SEO", resumeStage: "seo" } };
  if (stage === "seo") return { ok: true, state: { ...s, issues: cleared, status: "NEEDS_EDITORIAL", resumeStage: "editorial" } };
  // Editorial pass locks only when the material content is what Agent 5 passed.
  if (s.sig !== s.factPassedSig) return { ok: true, state: { ...s, issues: cleared, status: "NEEDS_FACT", resumeStage: "fact" }, note: "material content changed since fact review: back to fact review" };
  return { ok: true, state: { ...s, issues: cleared, status: "LOCKED", lockedHash: s.versionHash, resumeStage: null }, note: "locked" };
}

/** Agent 7 may return a replacement version. If it changes anything material, fact review must run again; the editor cannot lock a changed fact. */
export function editorRevision(s: SectionState, v: { hash: string; sig: string }): Outcome {
  if (s.status !== "NEEDS_EDITORIAL") return { ok: false, error: "an editorial replacement is only accepted while the section is in editorial review" };
  const material = v.sig !== s.factPassedSig;
  return { ok: true, state: { ...s, versionNo: s.versionNo + 1, versionHash: v.hash, sig: v.sig, status: material ? "NEEDS_FACT" : "NEEDS_SEO", resumeStage: material ? "fact" : "seo" }, note: material ? "material change by the editor: back to fact review" : "wording-only change: SEO and editorial review run again" };
}

/** The writer declines optional findings with a reason (stored in `declines`, listed for Leo). A required issue cannot be declined. */
export function declineOptional(s: SectionState, list: { key: string; reason: string }[]): Outcome {
  const r = recordWriterDeclines(s.declines ?? [], s.collected ?? [], list, { mustFixKeys: s.issues.map((i) => i.key) });
  if (!r.ok) return { ok: false, error: r.errors.join("; ") };
  return { ok: true, state: { ...s, declines: r.declines, collected: r.collected } };
}
export const forLeo = (s: SectionState) => declinesForLeo(s.declines ?? [], s.collected ?? []);

/** Human resolves an escalation or a block: sends the section back to the writer with a fresh attempt count on the stuck issue. */
export function resolveByHuman(s: SectionState, a: { kind: "request_revision"; issueText: string } | { kind: "hold" }): Outcome {
  if (!["ESCALATED", "BLOCKED_CLAIM", "BLOCKED_PRIVACY"].includes(s.status)) return { ok: false, error: `nothing to resolve: section is ${s.status}` };
  if (a.kind === "hold") return { ok: true, state: s, note: "held" };
  const key = s.escalation?.issueKey ?? "human:directive";
  const issues = [...s.issues.filter((i) => i.key !== key), { key, stage: s.resumeStage ?? "fact", text: a.issueText, attempts: 0 }];
  return { ok: true, state: { ...s, issues, status: "NEEDS_REVISION", escalation: null, blockedBy: null, resumeStage: s.resumeStage ?? "fact" } };
}

/** An edit to a locked section creates a new version, clears the lock and every earlier pass. The caller invalidates approvals. */
export function editLocked(s: SectionState, v: { hash: string; sig: string }): Outcome {
  if (s.status !== "LOCKED") return { ok: false, error: "section is not locked" };
  return { ok: true, state: { ...s, versionNo: s.versionNo + 1, versionHash: v.hash, sig: v.sig, status: "NEEDS_FACT", resumeStage: "fact", factPassedSig: null, lockedHash: null, issues: [] }, note: "lock cleared; full review runs again" };
}

export const allLocked = (sections: SectionState[]) => sections.length > 0 && sections.every((s) => s.status === "LOCKED");

/** The writer says a section cannot be written without inventing a fact: that is an escalation to a human, never a filled-in gap. */
export function escalateGap(s: SectionState, reason: string): Outcome {
  if (s.status !== "NEEDS_WRITE" && s.status !== "NEEDS_REVISION") return { ok: false, error: `section is ${s.status}, not waiting for the writer` };
  return { ok: true, state: { ...s, status: "ESCALATED", escalation: { issueKey: "writer:gap", reason } } };
}

/** A human reopens a locked section without supplying text: it goes back to the writer and through full review again. */
export function reopen(s: SectionState, directive: string): Outcome {
  if (s.status !== "LOCKED") return { ok: false, error: "section is not locked" };
  return { ok: true, state: { ...s, status: "NEEDS_REVISION", factPassedSig: null, lockedHash: null, resumeStage: "fact", issues: [{ key: "human:directive", stage: "fact", text: directive, attempts: 0 }] } };
}
