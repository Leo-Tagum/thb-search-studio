// Postgres-backed job helper logic: idempotency, retries, dead-letter -> INTEGRATION_ERROR.
import type { Actor, Orchestrator, SubjectType } from "./index";

export type Job = {
  id: string;
  kind: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  status: "queued" | "running" | "done" | "failed" | "dead";
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  subject?: { type: SubjectType; id: string };
};

export interface JobRepo {
  findByKey(key: string): Promise<Job | null>;
  insert(j: Omit<Job, "id">): Promise<Job>;
  save(j: Job): Promise<void>;
}

/** Same idempotency key returns the existing job instead of creating a duplicate. */
export async function enqueue(repo: JobRepo, input: { kind: string; key: string; payload?: Record<string, unknown>; maxAttempts?: number; subject?: Job["subject"] }): Promise<{ job: Job; duplicate: boolean }> {
  const existing = await repo.findByKey(input.key);
  if (existing) return { job: existing, duplicate: true };
  const job = await repo.insert({
    kind: input.kind, idempotencyKey: input.key, payload: input.payload ?? {}, status: "queued",
    attempts: 0, maxAttempts: input.maxAttempts ?? 3, lastError: null, subject: input.subject,
  });
  return { job, duplicate: false };
}

/** Run once. On failure: retry until maxAttempts, then dead-letter and move the subject to INTEGRATION_ERROR. */
export async function runJob(repo: JobRepo, orch: Orchestrator, job: Job, fn: (j: Job) => Promise<void>): Promise<Job> {
  if (job.status === "done" || job.status === "dead") return job;
  job.attempts += 1;
  job.status = "running";
  try {
    await fn(job);
    job.status = "done";
    job.lastError = null;
  } catch (e) {
    job.lastError = e instanceof Error ? e.message : String(e);
    if (job.attempts >= job.maxAttempts) {
      job.status = "dead";
      if (job.subject) {
        const actor: Actor = { kind: "system", id: "jobs" };
        await orch.transition(job.subject.type, job.subject.id, "INTEGRATION_ERROR", actor, { jobId: job.id, error: job.lastError });
      }
    } else {
      job.status = "queued";
    }
  }
  await repo.save(job);
  return job;
}
