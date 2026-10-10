import type { AuditEvent, Repo, Subject, SubjectType } from "./index";
import type { Job, JobRepo } from "./jobs";

/** In-memory repos for tests (fixture data only). */
export class MemoryRepo implements Repo {
  subjects = new Map<string, Subject>();
  audit: AuditEvent[] = [];
  add(s: Subject) { this.subjects.set(`${s.type}:${s.id}`, { ...s }); }
  async load(type: SubjectType, id: string) {
    const s = this.subjects.get(`${type}:${id}`);
    if (!s) throw new Error("subject not found");
    return { ...s };
  }
  async save(s: Subject) { this.subjects.set(`${s.type}:${s.id}`, { ...s }); }
  async appendAudit(e: AuditEvent) { this.audit.push(e); }
}

export class MemoryJobRepo implements JobRepo {
  jobs: Job[] = [];
  async findByKey(key: string) { return this.jobs.find((j) => j.idempotencyKey === key) ?? null; }
  async insert(j: Omit<Job, "id">) { const job = { ...j, id: String(this.jobs.length + 1) }; this.jobs.push(job); return job; }
  async save(j: Job) { const i = this.jobs.findIndex((x) => x.id === j.id); this.jobs[i] = j; }
}
