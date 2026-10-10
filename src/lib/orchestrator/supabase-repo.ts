import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditEvent, Repo, Subject, SubjectType } from "./index";
import type { State } from "./states";
import type { Job, JobRepo } from "./jobs";

const table = (t: SubjectType) => (t === "opportunity" ? "opportunities" : "articles");

/** Persistent repos. Pass a service-role client (server side only). */
export class SupabaseRepo implements Repo {
  constructor(private db: SupabaseClient) {}
  async load(type: SubjectType, id: string): Promise<Subject> {
    const { data, error } = await this.db.from(table(type)).select("*").eq("id", id).single();
    if (error) throw error;
    return {
      type, id, state: data.state as State, priorState: (data.prior_state as State) ?? null,
      revisionCount: data.revision_count ?? 0, versionHash: data.version_hash ?? "", approvedHash: data.approved_hash ?? null,
    };
  }
  async save(s: Subject) {
    const { error } = await this.db.from(table(s.type)).update({
      state: s.state, prior_state: s.priorState, revision_count: s.revisionCount,
      version_hash: s.versionHash, approved_hash: s.approvedHash,
    }).eq("id", s.id);
    if (error) throw error;
  }
  async appendAudit(e: AuditEvent) {
    const { error } = await this.db.from("audit_events").insert(e);
    if (error) throw error;
  }
}

export class SupabaseJobRepo implements JobRepo {
  constructor(private db: SupabaseClient) {}
  private row = (d: Record<string, unknown>): Job => ({
    id: d.id as string, kind: d.kind as string, idempotencyKey: d.idempotency_key as string,
    payload: d.payload as Record<string, unknown>, status: d.status as Job["status"],
    attempts: d.attempts as number, maxAttempts: d.max_attempts as number, lastError: (d.last_error as string) ?? null,
    subject: (d.payload as { subject?: Job["subject"] }).subject,
  });
  async findByKey(key: string) {
    const { data } = await this.db.from("jobs").select("*").eq("idempotency_key", key).maybeSingle();
    return data ? this.row(data) : null;
  }
  async insert(j: Omit<Job, "id">) {
    const { data, error } = await this.db.from("jobs").insert({
      kind: j.kind, idempotency_key: j.idempotencyKey, payload: { ...j.payload, subject: j.subject },
      status: j.status, attempts: j.attempts, max_attempts: j.maxAttempts,
    }).select("*").single();
    if (error) throw error;
    return this.row(data);
  }
  async save(j: Job) {
    const { error } = await this.db.from("jobs").update({ status: j.status, attempts: j.attempts, last_error: j.lastError }).eq("id", j.id);
    if (error) throw error;
  }
}
