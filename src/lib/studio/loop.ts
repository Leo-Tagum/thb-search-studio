// Section-level review loop (blueprint §5), Phase 3d hybrid:
//   write v1 -> fact/privacy (V1, the fact gate; Agent 5 only for a section saved before Phase 3d) -> SEO/AEO/GEO (Agent 6) -> editorial (Agent 7) -> targeted revision -> re-review -> lock.
// V1 is a mandatory gate on any text the classic loop writes or revises: the lock needs a V1 PASS on the exact content hash, V1 reviews changed sentences
// only after the first review, the writer's fix pass touches only the sentences V1 cited, and 2 fix attempts end in an escalation to Leo.
// Pure functions over a SectionState; persistence lives in service.ts. No agent can lock a section: the lock is only reached
// through a PASS from Agent 7 on the exact version whose material content Agent 5 passed. Two revision attempts per issue,
// then escalation to a human. A change to a material claim (statute, figure, date, claim ids) re-enters fact review.
import { REVISION_LIMIT } from "../orchestrator/states";
import type { Finding } from "./checks";
import { hedgeFlagsInText } from "./checks";
import { declinesForLeo, mergeReview, recordWriterDeclines, type Collected, type DeclineRecord } from "./declines";
import { citedSentences, splitSentences } from "./v1-gate";
import type { HedgeRecord, HedgeRuling } from "../team/loop";

export type Stage = "fact" | "seo" | "editorial";
export type V1Scope = { kind: "full" } | { kind: "changed"; sentences: string[] };
export type V1Mark = { hash: string; sig: string; sentences: string[] | null };
export type ReviewAgent = 5 | "V1" | 6 | 7;      // 5 is the retired fact auditor: it reviews only a section that has no V1 gate (saved before Phase 3d)
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
  // ---- V1 gate (Phase 3d); every field is optional so a state saved before Phase 3d still loads ----
  gate?: "v1";                       // set once any text of this section is written or revised under the V1 gate
  sentences?: string[] | null;       // sentences of the current version
  v1Passed?: V1Mark | null;          // what V1 passed; the lock requires its hash to equal versionHash
  v1Reviewed?: V1Mark | null;        // the version V1 last reviewed: the baseline for changed-sentence scope and for the fix-only check
  v1Scope?: V1Scope | null;          // what V1 must look at on the pending review
  hedges?: HedgeRecord[];            // flagged hedge sentences of the current version; V1 must rule on each
  fixCited?: string[];               // sentences V1 cited on its last REVISION (the only ones the fix pass may change)
  v1Rounds?: number;                 // V1 REVISION rounds in this cycle; the third REVISION escalates (2 fix attempts)
  seoPassedHash?: string | null;     // versions Agents 6 and 7 passed: a V1 re-check of byte-identical text does not repeat them
  edPassedHash?: string | null;
};
export type Outcome = { ok: true; state: SectionState; note?: string } | { ok: false; error: string };

export const newSection = (key: string): SectionState => ({ key, status: "NEEDS_WRITE", versionNo: 0, versionHash: null, sig: null, factPassedSig: null, resumeStage: null, issues: [], lockedHash: null, escalation: null, blockedBy: null, collected: [], declines: [], gate: "v1", sentences: null, v1Passed: null, v1Reviewed: null, v1Scope: null, hedges: [], fixCited: [], v1Rounds: 0, seoPassedHash: null, edPassedHash: null });
const STAGE_STATUS: Record<Stage, SectionStatus> = { fact: "NEEDS_FACT", seo: "NEEDS_SEO", editorial: "NEEDS_EDITORIAL" };
const AGENT_STAGE: Record<ReviewAgent, Stage> = { 5: "fact", V1: "fact", 6: "seo", 7: "editorial" };
/** Who reviews the section now: V1 when it has the gate, Agent 5 only for a section saved before Phase 3d. */
export const reviewerFor = (s: SectionState): ReviewAgent | null => (s.status === "NEEDS_FACT" ? (s.gate === "v1" ? "V1" : 5) : s.status === "NEEDS_SEO" ? 6 : s.status === "NEEDS_EDITORIAL" ? 7 : null);

const hedgesFor = (text: string | undefined, old: HedgeRecord[] | undefined): HedgeRecord[] =>
  text === undefined ? (old ?? []) : hedgeFlagsInText(text).map((h) => { const o = (old ?? []).find((x) => x.key === h.key && x.ruling === "proven"); return { ...h, ruling: o ? "proven" as const : null, note: o?.note ?? null }; });
/** The writer is fixing what V1 cited: V1 items (not deterministic findings, not a human directive) are open. Only this pass is checked for churn. */
export const isV1FixPass = (s: SectionState) => s.status === "NEEDS_REVISION" && s.issues.some(isV1Item);
const isV1Item = (i: Issue) => i.stage === "fact" && !i.key.startsWith("det:") && !i.key.startsWith("human:");

/** Scope of V1's next review of new text: the sentences that changed since V1 last looked (plus any cited sentence still present), or the whole unit. */
function scopeFor(s: SectionState, sentences: string[] | null, sig: string, fixPass: boolean): V1Scope {
  const base = s.v1Reviewed ?? s.v1Passed ?? null;
  if (!sentences || !base?.sentences || !(fixPass || sig === base.sig)) return { kind: "full" };
  const was = new Set(base.sentences);
  const changed = sentences.filter((x) => !was.has(x));
  const keptCited = (s.fixCited ?? []).filter((c) => sentences.includes(c) && !changed.includes(c));
  return changed.length || keptCited.length ? { kind: "changed", sentences: [...changed, ...keptCited] } : { kind: "full" };
}

/** A new version of the section from the writer (Agent 4). Locked, escalated and blocked sections refuse it. Any new text goes back to V1 (the exact content must pass). */
export function recordVersion(s: SectionState, v: { hash: string; sig: string; text?: string }): Outcome {
  if (s.status === "LOCKED") return { ok: false, error: "section is locked; a locked section changes only through a human edit that clears the lock" };
  if (s.status === "ESCALATED" || s.status === "BLOCKED_CLAIM" || s.status === "BLOCKED_PRIVACY") return { ok: false, error: `section is ${s.status}; a human must resolve it first` };
  if (s.status !== "NEEDS_WRITE" && s.status !== "NEEDS_REVISION") return { ok: false, error: `section is ${s.status}, not waiting for the writer` };
  const revising = s.status === "NEEDS_REVISION";
  const issues = revising ? s.issues.map((i) => ({ ...i, attempts: i.attempts + 1 })) : s.issues;
  if (s.gate !== "v1" && v.text === undefined) {
    // A caller that supplies no text (a state saved before Phase 3d) keeps the earlier flow: Agent 5 and the material signature.
    const stage: Stage = revising ? (v.sig !== s.factPassedSig ? "fact" : (s.resumeStage ?? "fact")) : "fact";
    return { ok: true, state: { ...s, versionNo: s.versionNo + 1, versionHash: v.hash, sig: v.sig, issues, status: STAGE_STATUS[stage], resumeStage: stage, blockedBy: null }, note: revising && stage === "fact" && s.resumeStage !== "fact" ? "material change: back to fact review" : undefined };
  }
  const sentences = v.text === undefined ? null : splitSentences(v.text);
  const fixPass = revising && s.issues.some(isV1Item);
  const scope = scopeFor(s, sentences, v.sig, fixPass);
  const note = scope.kind === "changed" ? `V1 re-reviews ${scope.sentences.length} changed sentence(s)` : "V1 reviews the full section";
  return { ok: true, state: { ...s, gate: "v1", versionNo: s.versionNo + 1, versionHash: v.hash, sig: v.sig, sentences, issues, status: "NEEDS_FACT", resumeStage: "fact", blockedBy: null, v1Passed: null, v1Scope: scope, hedges: hedgesFor(v.text, s.hedges) }, note };
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

export type HedgeVerdict = { key: string; ruling: HedgeRuling; note?: string };
export type Review = { agent: ReviewAgent; versionHash: string; decision: "PASS" | "REVISION" | "BLOCKED"; issues: { key: string; text: string }[]; blockKind?: "BLOCKED_CLAIM" | "BLOCKED_PRIVACY"; optional?: { key: string; text: string; newEvidence?: string | null }[]; hedgeRulings?: HedgeVerdict[] };

/** Where a section goes after V1 passes: SEO and editorial are skipped only for text they already passed byte for byte. */
function afterV1(s: SectionState): { status: SectionStatus; resumeStage: Stage | null; note?: string } {
  if (s.seoPassedHash && s.seoPassedHash === s.versionHash) {
    if (s.edPassedHash && s.edPassedHash === s.versionHash) return { status: "LOCKED", resumeStage: null, note: "V1 passed identical text that Agents 6 and 7 already passed: locked again" };
    return { status: "NEEDS_EDITORIAL", resumeStage: "editorial" };
  }
  return { status: "NEEDS_SEO", resumeStage: "seo" };
}

/** V1 reviews the current version: hedge rulings, must-fix items, the round limit. Only a PASS on this exact content can ever lead to a lock. */
function applyV1(s: SectionState, r: Review): Outcome {
  const hedges = s.hedges ?? [];
  const byKey = new Map((r.hedgeRulings ?? []).map((h) => [h.key, h]));
  if (r.decision !== "BLOCKED") {
    for (const h of r.hedgeRulings ?? []) if (!hedges.some((x) => x.key === h.key)) return { ok: false, error: `ruling for ${h.key}, which is not a flagged sentence in this version` };
    const missing = hedges.filter((h) => h.ruling !== "proven" && !byKey.has(h.key));
    if (missing.length) return { ok: false, error: `V1 must rule (proven / reword / drop) on every flagged sentence; missing: ${missing.map((h) => `${h.key} "${h.sentence}"`).join("; ")}` };
    for (const h of hedges) { const v = byKey.get(h.key); if (v?.ruling === "proven" && !(v.note ?? "").trim().match(/\S.{4,}/)) return { ok: false, error: `ruling "proven" for ${h.key} needs the evidence (a ledger claim id or source) in note` }; }
  }
  const ruled = hedges.map((h) => { const v = byKey.get(h.key); return v ? { ...h, ruling: v.ruling, note: v.note?.trim() || null } : h; });
  const hedgeMust = ruled.filter((h) => byKey.has(h.key) && h.ruling !== "proven").map((h) => ({ key: h.key, text: `${h.ruling} the unsourced generalization (${h.term}): "${h.sentence}"${h.note ? ` - ${h.note}` : ""}` }));
  const reviewed: V1Mark = { hash: s.versionHash!, sig: s.sig!, sentences: s.sentences ?? null };
  if (r.decision === "BLOCKED") return { ok: true, state: { ...s, v1Reviewed: reviewed, v1Passed: null, status: r.blockKind ?? "BLOCKED_CLAIM", blockedBy: r.issues.map((i) => i.text).join("; ") || "V1 blocked" } };
  const found = [...r.issues, ...hedgeMust];
  if (r.decision === "PASS") {
    if (found.length) return { ok: false, error: "a PASS cannot carry required issues (a reword or drop ruling is one)" };
    const next = afterV1(s);
    return { ok: true, state: { ...s, hedges: ruled, issues: s.issues.filter((i) => i.stage !== "fact"), factPassedSig: s.sig, v1Passed: reviewed, v1Reviewed: reviewed, v1Scope: null, v1Rounds: 0, fixCited: [], status: next.status, resumeStage: next.resumeStage, lockedHash: next.status === "LOCKED" ? s.versionHash : s.lockedHash }, note: next.note };
  }
  if (!found.length) return { ok: false, error: "a REVISION needs at least one required issue" };
  const rounds = s.v1Rounds ?? 0;
  const withHedges = { ...s, hedges: ruled, v1Reviewed: reviewed, v1Passed: null, v1Scope: null };
  const o = withIssues(withHedges, "fact", found);
  if (!o.ok) return o;
  const fixCited = citedSentences(s.sentences, found.map((f) => f.text), ruled.filter((h) => byKey.has(h.key) && h.ruling !== "proven").map((h) => h.sentence));
  // Two fix attempts, then Leo: the third REVISION in one cycle escalates (a reworded sentence gets a new key, so the per-issue count alone would never reach it).
  if (rounds >= REVISION_LIMIT && o.state.status !== "ESCALATED") return { ok: true, state: { ...o.state, status: "ESCALATED", v1Rounds: rounds + 1, fixCited, escalation: { issueKey: found[0].key, reason: `V1 still returns REVISION after ${REVISION_LIMIT} fix attempts: ${found.map((f) => f.text).join(" | ")}` } }, note: "escalated" };
  return { ok: true, state: { ...o.state, v1Rounds: rounds + 1, fixCited }, note: o.note };
}

export function applyReview(s: SectionState, r: Review): Outcome {
  if (reviewerFor(s) !== r.agent) return { ok: false, error: `${r.agent === "V1" ? "V1" : `Agent ${r.agent}`} cannot review a section that is ${s.status}${s.status === "NEEDS_FACT" && r.agent === 5 ? " under the V1 gate" : ""}` };
  if (r.versionHash !== s.versionHash) return { ok: false, error: "the review is for an older version of this section" };
  const stage = AGENT_STAGE[r.agent];
  // Optional findings go through the declines store: one the writer already declined counts once and is not reopened, unless the reviewer cites new evidence.
  if (r.optional) {
    const m = mergeReview(s.declines ?? [], s.collected ?? [], r.agent === "V1" ? "V1" : `A${r.agent}`, r.optional.map((o) => ({ key: o.key, severity: "should fix" as const, text: o.text, newEvidence: o.newEvidence })), r.versionHash);
    s = { ...s, collected: m.collected, declines: m.declines };
  }
  if (r.agent === "V1") return applyV1(s, r);
  if (r.decision === "BLOCKED") return { ok: true, state: { ...s, status: r.blockKind ?? "BLOCKED_CLAIM", blockedBy: r.issues.map((i) => i.text).join("; ") || `Agent ${r.agent} blocked` } };
  if (r.decision === "REVISION") {
    if (r.issues.length === 0) return { ok: false, error: "a REVISION needs at least one required issue" };
    return withIssues(s, stage, r.issues);
  }
  if (r.issues.length > 0) return { ok: false, error: "a PASS cannot carry required issues" };
  const cleared = s.issues.filter((i) => i.stage !== stage);
  if (stage === "fact") return { ok: true, state: { ...s, issues: cleared, factPassedSig: s.sig, status: "NEEDS_SEO", resumeStage: "seo" } };    // Agent 5, a section without the V1 gate
  if (stage === "seo") return { ok: true, state: { ...s, issues: cleared, seoPassedHash: s.versionHash, status: "NEEDS_EDITORIAL", resumeStage: "editorial" } };
  // Editorial pass locks only when V1 passed this exact content (a section without the V1 gate: when the material content is what Agent 5 passed).
  if (s.gate === "v1" ? s.v1Passed?.hash !== s.versionHash : s.sig !== s.factPassedSig) return { ok: true, state: { ...s, issues: cleared, status: "NEEDS_FACT", resumeStage: "fact", v1Scope: { kind: "full" } }, note: "V1 has not passed this content: back to V1" };
  return { ok: true, state: { ...s, issues: cleared, edPassedHash: s.versionHash, status: "LOCKED", lockedHash: s.versionHash, resumeStage: null }, note: "locked" };
}

/** Agent 7 may return a replacement version. Whatever it changes goes back through V1 (changed sentences only): the editor cannot lock a changed sentence. */
export function editorRevision(s: SectionState, v: { hash: string; sig: string; text?: string }): Outcome {
  if (s.status !== "NEEDS_EDITORIAL") return { ok: false, error: "an editorial replacement is only accepted while the section is in editorial review" };
  if (s.gate !== "v1" && v.text === undefined) {
    const material = v.sig !== s.factPassedSig;
    return { ok: true, state: { ...s, versionNo: s.versionNo + 1, versionHash: v.hash, sig: v.sig, status: material ? "NEEDS_FACT" : "NEEDS_SEO", resumeStage: material ? "fact" : "seo" }, note: material ? "material change by the editor: back to fact review" : "wording-only change: SEO and editorial review run again" };
  }
  const sentences = v.text === undefined ? null : splitSentences(v.text);
  const scope = scopeFor({ ...s, fixCited: [] }, sentences, v.sig, true);
  return { ok: true, state: { ...s, gate: "v1", versionNo: s.versionNo + 1, versionHash: v.hash, sig: v.sig, sentences, status: "NEEDS_FACT", resumeStage: "fact", v1Passed: null, v1Scope: scope, hedges: hedgesFor(v.text, s.hedges) }, note: `the editor changed the text: back to V1 (${scope.kind === "changed" ? `${scope.sentences.length} changed sentence(s)` : "full section"})` };
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
  return { ok: true, state: { ...s, issues, status: "NEEDS_REVISION", escalation: null, blockedBy: null, resumeStage: s.resumeStage ?? "fact", v1Rounds: 0 } };
}

/** An edit to a locked section creates a new version, clears the lock and every earlier pass. V1 reviews the full section. The caller invalidates approvals. */
export function editLocked(s: SectionState, v: { hash: string; sig: string; text?: string }): Outcome {
  if (s.status !== "LOCKED") return { ok: false, error: "section is not locked" };
  return { ok: true, state: { ...s, gate: "v1", versionNo: s.versionNo + 1, versionHash: v.hash, sig: v.sig, sentences: v.text === undefined ? null : splitSentences(v.text), status: "NEEDS_FACT", resumeStage: "fact", factPassedSig: null, lockedHash: null, issues: [], v1Passed: null, v1Reviewed: null, v1Scope: { kind: "full" }, hedges: v.text === undefined ? [] : hedgesFor(v.text, []), fixCited: [], v1Rounds: 0, seoPassedHash: null, edPassedHash: null }, note: "lock cleared; V1 and full review run again" };
}

export const allLocked = (sections: SectionState[]) => sections.length > 0 && sections.every((s) => s.status === "LOCKED");

/** The writer says a section cannot be written without inventing a fact: that is an escalation to a human, never a filled-in gap. */
export function escalateGap(s: SectionState, reason: string): Outcome {
  if (s.status !== "NEEDS_WRITE" && s.status !== "NEEDS_REVISION") return { ok: false, error: `section is ${s.status}, not waiting for the writer` };
  return { ok: true, state: { ...s, status: "ESCALATED", escalation: { issueKey: "writer:gap", reason } } };
}

/** A human reopens a locked section without supplying text: it goes back to the writer and through V1 and the full review again. */
export function reopen(s: SectionState, directive: string): Outcome {
  if (s.status !== "LOCKED") return { ok: false, error: "section is not locked" };
  const base: V1Mark | null = s.v1Passed ?? (s.versionHash && s.sig ? { hash: s.versionHash, sig: s.sig, sentences: s.sentences ?? null } : null);
  return { ok: true, state: { ...s, gate: "v1", status: "NEEDS_REVISION", factPassedSig: null, lockedHash: null, resumeStage: "fact", v1Passed: null, v1Reviewed: base, v1Rounds: 0, fixCited: [], seoPassedHash: null, edPassedHash: null, issues: [{ key: "human:directive", stage: "fact", text: directive, attempts: 0 }] } };
}

/**
 * Leo sends a locked section through the V1 gate without changing its text (a section locked before Phase 3d has no V1 pass). V1 reviews the full unit.
 * If V1 passes the identical text, Agents 6 and 7 do not repeat (they passed this exact version before it was locked); if V1 returns REVISION the normal fix loop runs.
 */
export function gateOnly(s: SectionState, v: { text?: string }): Outcome {
  if (s.status !== "LOCKED") return { ok: false, error: "section is not locked" };
  const sentences = v.text === undefined ? null : splitSentences(v.text);
  return { ok: true, state: { ...s, gate: "v1", status: "NEEDS_FACT", resumeStage: "fact", lockedHash: null, factPassedSig: null, sentences, v1Passed: null, v1Reviewed: null, v1Scope: { kind: "full" }, hedges: hedgesFor(v.text, []), fixCited: [], v1Rounds: 0, seoPassedHash: s.versionHash, edPassedHash: s.versionHash, issues: [] }, note: "sent through the V1 gate; text unchanged" };
}
