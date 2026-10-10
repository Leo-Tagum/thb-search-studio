import { beforeEach, describe, expect, it } from "vitest";
import { Orchestrator, type Actor, type Subject } from "./index";
import { STATES, TRANSITIONS, isAllowed, type State } from "./states";
import { MemoryJobRepo, MemoryRepo } from "./memory-repo";
import { enqueue, runJob } from "./jobs";

const human: Actor = { kind: "human", id: "leo" };
const agent: Actor = { kind: "agent", id: "agent-1" };
const subj = (state: State, over: Partial<Subject> = {}): Subject => ({
  type: "article", id: "a1", state, priorState: null, revisionCount: 0, versionHash: "h1", approvedHash: null, ...over,
});

let repo: MemoryRepo;
let orch: Orchestrator;
beforeEach(() => { repo = new MemoryRepo(); orch = new Orchestrator(repo); });

describe("transition table", () => {
  it("matches the blueprint happy path", () => {
    const path: State[] = ["CANDIDATE", "SEO_REVIEW", "EVIDENCE_REVIEW", "BRIEF_REVIEW", "BRIEF_APPROVED", "DRAFTING",
      "FACT_PRIVACY_REVIEW", "SEO_AEO_GEO_REVIEW", "EDITORIAL_REVIEW", "HUMAN_REVIEW", "APPROVED_FOR_WP_DRAFT",
      "WP_DRAFT_CREATED", "WP_RENDER_QA", "READY_FOR_MANUAL_PUBLICATION", "PUBLISHED", "MONITORING"];
    for (let i = 0; i < path.length - 1; i++) expect(isAllowed(path[i], path[i + 1]), `${path[i]}->${path[i + 1]}`).toBe(true);
  });
  it("rejects shortcuts that skip gates, for every state pair not listed", () => {
    const skips: [State, State][] = [["CANDIDATE", "DRAFTING"], ["SEO_REVIEW", "BRIEF_APPROVED"], ["DRAFTING", "PUBLISHED"],
      ["EDITORIAL_REVIEW", "APPROVED_FOR_WP_DRAFT"], ["HUMAN_REVIEW", "PUBLISHED"], ["BRIEF_REVIEW", "DRAFTING"], ["PUBLISHED", "DRAFTING"]];
    for (const [a, b] of skips) expect(isAllowed(a, b), `${a}->${b}`).toBe(false);
  });
  it("allows every state to be exercised: no state is unreachable or has an undefined entry", () => {
    for (const s of STATES) expect(TRANSITIONS[s]).toBeInstanceOf(Set);
  });
  it("terminal states have no exits", () => {
    expect([...TRANSITIONS.REJECTED]).toEqual([]);
    expect([...TRANSITIONS.CANCELLED]).toEqual([]);
  });
});

describe("orchestrator", () => {
  it("writes one accepted audit event per transition with actor, prior state, hash", async () => {
    repo.add(subj("CANDIDATE"));
    await orch.transition("article", "a1", "SEO_REVIEW", human);
    await orch.transition("article", "a1", "EVIDENCE_REVIEW", human);
    expect(repo.audit).toHaveLength(2);
    expect(repo.audit[1]).toMatchObject({ actor: "leo", prior_state: "SEO_REVIEW", new_state: "EVIDENCE_REVIEW", version_hash: "h1", accepted: true });
  });
  it("logs refused transitions and leaves state unchanged", async () => {
    repo.add(subj("CANDIDATE"));
    const r = await orch.transition("article", "a1", "PUBLISHED", human);
    expect(r.ok).toBe(false);
    expect((await repo.load("article", "a1")).state).toBe("CANDIDATE");
    expect(repo.audit).toHaveLength(1);
    expect(repo.audit[0]).toMatchObject({ accepted: false, event_type: "transition_refused" });
  });
  it("an agent cannot approve or move to human-gate states", async () => {
    repo.add(subj("BRIEF_REVIEW"));
    const r = await orch.transition("article", "a1", "BRIEF_APPROVED", agent);
    expect(r.ok).toBe(false);
    const a = await orch.recordApproval("article", "a1", "h1", agent);
    expect(a.ok).toBe(false);
    expect((await repo.load("article", "a1")).approvedHash).toBeNull();
  });
  it("APPROVED_FOR_WP_DRAFT needs a human approval of the current hash", async () => {
    repo.add(subj("HUMAN_REVIEW"));
    expect((await orch.transition("article", "a1", "APPROVED_FOR_WP_DRAFT", human)).ok).toBe(false);
    expect((await orch.recordApproval("article", "a1", "stale", human)).ok).toBe(false);
    expect((await orch.recordApproval("article", "a1", "h1", human)).ok).toBe(true);
    expect((await orch.transition("article", "a1", "APPROVED_FOR_WP_DRAFT", human)).ok).toBe(true);
  });
  it("an edit after sign-off invalidates approval and sends work back", async () => {
    repo.add(subj("APPROVED_FOR_WP_DRAFT", { approvedHash: "h1" }));
    const r = await orch.recordEdit("article", "a1", "h2", human);
    expect(r.ok).toBe(true);
    const s = await repo.load("article", "a1");
    expect(s.state).toBe("REVISION_REQUIRED");
    expect(s.approvedHash).toBeNull();
  });
  it("stops after two revisions and asks for escalation", async () => {
    repo.add(subj("EDITORIAL_REVIEW", { revisionCount: 2 }));
    const r = await orch.transition("article", "a1", "REVISION_REQUIRED", human);
    expect(r).toMatchObject({ ok: false, escalate: true });
  });
  it("BLOCKED_PRIVACY recovers only through REVISION_REQUIRED", async () => {
    repo.add(subj("DRAFTING"));
    await orch.transition("article", "a1", "BLOCKED_PRIVACY", { kind: "system", id: "privacy-gate" });
    expect((await orch.transition("article", "a1", "FACT_PRIVACY_REVIEW", human)).ok).toBe(false);
    expect((await orch.transition("article", "a1", "REVISION_REQUIRED", human)).ok).toBe(true);
  });
  it("INTEGRATION_ERROR recovers to the previous safe state", async () => {
    repo.add(subj("DRAFTING"));
    await orch.transition("article", "a1", "INTEGRATION_ERROR", { kind: "system", id: "jobs" });
    expect((await orch.transition("article", "a1", "DRAFTING", human)).ok).toBe(true);
  });
});

describe("jobs", () => {
  it("returns the same job for a duplicate idempotency key", async () => {
    const jr = new MemoryJobRepo();
    const a = await enqueue(jr, { kind: "x", key: "k1" });
    const b = await enqueue(jr, { kind: "x", key: "k1" });
    expect(b.duplicate).toBe(true);
    expect(b.job.id).toBe(a.job.id);
    expect(jr.jobs).toHaveLength(1);
  });
  it("retries to the limit, then dead-letters to INTEGRATION_ERROR", async () => {
    repo.add(subj("DRAFTING"));
    const jr = new MemoryJobRepo();
    const { job } = await enqueue(jr, { kind: "x", key: "k2", maxAttempts: 3, subject: { type: "article", id: "a1" } });
    const boom = async () => { throw new Error("boom"); };
    expect((await runJob(jr, orch, job, boom)).status).toBe("queued");
    expect((await runJob(jr, orch, job, boom)).status).toBe("queued");
    expect((await runJob(jr, orch, job, boom)).status).toBe("dead");
    expect((await repo.load("article", "a1")).state).toBe("INTEGRATION_ERROR");
  });
});
