import { createHash } from "node:crypto";
import { HUMAN_ONLY_TARGETS, REQUIRES_VALID_APPROVAL, REVISION_LIMIT, isAllowed, type State } from "./states";

export type ActorKind = "human" | "system" | "agent";
export type Actor = { kind: ActorKind; id: string };
export type SubjectType = "opportunity" | "article";

export type Subject = {
  type: SubjectType;
  id: string;
  state: State;
  priorState: State | null;
  revisionCount: number;
  versionHash: string;
  approvedHash: string | null; // hash a human approved, null if none/invalidated
};

export type AuditEvent = {
  actor: string;
  subject_type: string;
  subject_id: string;
  event_type: string;
  prior_state: string | null;
  new_state: string | null;
  version_hash: string | null;
  accepted: boolean;
  detail?: Record<string, unknown>;
};

export interface Repo {
  load(type: SubjectType, id: string): Promise<Subject>;
  save(s: Subject): Promise<void>;
  appendAudit(e: AuditEvent): Promise<void>;
}

export type Result =
  | { ok: true; subject: Subject }
  | { ok: false; reason: string; escalate?: boolean };

export function versionHash(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body, Object.keys(flat(body)).sort())).digest("hex");
}
function flat(o: unknown, out: Record<string, 1> = {}): Record<string, 1> {
  if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { out[k] = 1; flat(v, out); }
  return out;
}

export class Orchestrator {
  constructor(private repo: Repo) {}

  /** Move a subject to `to`. Every attempt, accepted or refused, writes an audit event. */
  async transition(type: SubjectType, id: string, to: State, actor: Actor, detail?: Record<string, unknown>): Promise<Result> {
    const s = await this.repo.load(type, id);
    const refuse = async (reason: string, escalate = false): Promise<Result> => {
      await this.repo.appendAudit({
        actor: actor.id, subject_type: type, subject_id: id, event_type: "transition_refused",
        prior_state: s.state, new_state: to, version_hash: s.versionHash, accepted: false, detail: { reason, actorKind: actor.kind, ...detail },
      });
      return { ok: false, reason, escalate };
    };

    // INTEGRATION_ERROR recovery goes back to the safe prior state, by a human or the system.
    const recovering = s.state === "INTEGRATION_ERROR" && to === s.priorState && actor.kind !== "agent";
    if (!recovering && !isAllowed(s.state, to)) return refuse(`transition ${s.state} -> ${to} is not allowed`);
    if (actor.kind === "agent" && HUMAN_ONLY_TARGETS.includes(to)) return refuse(`agents cannot move work to ${to}`);
    if (REQUIRES_VALID_APPROVAL.includes(to) && s.approvedHash !== s.versionHash) {
      return refuse("no human approval matching the current version hash");
    }
    if (to === "REVISION_REQUIRED" && s.state !== "BLOCKED_PRIVACY" && s.state !== "BLOCKED_CLAIM") {
      if (s.revisionCount >= REVISION_LIMIT) return refuse(`revision limit (${REVISION_LIMIT}) reached; escalate to a human`, true);
    }

    const next: Subject = {
      ...s,
      state: to,
      priorState: s.state,
      revisionCount: to === "REVISION_REQUIRED" && s.state !== "BLOCKED_PRIVACY" && s.state !== "BLOCKED_CLAIM" ? s.revisionCount + 1 : s.revisionCount,
      approvedHash: to === "REVISION_REQUIRED" ? null : s.approvedHash,
    };
    await this.repo.save(next);
    await this.repo.appendAudit({
      actor: actor.id, subject_type: type, subject_id: id, event_type: "transition",
      prior_state: s.state, new_state: to, version_hash: next.versionHash, accepted: true, detail: { actorKind: actor.kind, ...detail },
    });
    return { ok: true, subject: next };
  }

  /** Record a human approval of exactly the current version. Agents can never approve. */
  async recordApproval(type: SubjectType, id: string, hash: string, actor: Actor): Promise<Result> {
    const s = await this.repo.load(type, id);
    if (actor.kind !== "human") {
      await this.repo.appendAudit({ actor: actor.id, subject_type: type, subject_id: id, event_type: "approval_refused", prior_state: s.state, new_state: null, version_hash: s.versionHash, accepted: false, detail: { reason: "only a human can approve" } });
      return { ok: false, reason: "only a human can approve" };
    }
    if (hash !== s.versionHash) {
      await this.repo.appendAudit({ actor: actor.id, subject_type: type, subject_id: id, event_type: "approval_refused", prior_state: s.state, new_state: null, version_hash: s.versionHash, accepted: false, detail: { reason: "hash does not match current version", given: hash } });
      return { ok: false, reason: "approval hash does not match the current version" };
    }
    const next = { ...s, approvedHash: hash };
    await this.repo.save(next);
    await this.repo.appendAudit({ actor: actor.id, subject_type: type, subject_id: id, event_type: "approval_recorded", prior_state: s.state, new_state: s.state, version_hash: hash, accepted: true });
    return { ok: true, subject: next };
  }

  /** Any content edit changes the version hash; a prior approval no longer counts. */
  async recordEdit(type: SubjectType, id: string, newHash: string, actor: Actor): Promise<Result> {
    const s = await this.repo.load(type, id);
    const invalidated = s.approvedHash !== null && s.approvedHash !== newHash;
    const next: Subject = { ...s, versionHash: newHash, approvedHash: invalidated ? null : s.approvedHash };
    await this.repo.save(next);
    await this.repo.appendAudit({ actor: actor.id, subject_type: type, subject_id: id, event_type: "edit", prior_state: s.state, new_state: s.state, version_hash: newHash, accepted: true, detail: { approvalInvalidated: invalidated } });
    const postSignoff = ["APPROVED_FOR_WP_DRAFT", "WP_DRAFT_CREATED", "WP_RENDER_QA", "READY_FOR_MANUAL_PUBLICATION"].includes(s.state);
    if (invalidated && postSignoff) return this.transition(type, id, "REVISION_REQUIRED", { kind: "system", id: "orchestrator" }, { reason: "edit after sign-off" });
    return { ok: true, subject: next };
  }
}
