import { describe, expect, it } from "vitest";
import { classifyRecord, confirmRegistration, evaluateSignoff, type Counted, type Proposal, type Registry, type RoomRecord } from "./approvals";
import { MemoryRepo } from "../orchestrator/memory-repo";
import { Orchestrator } from "../orchestrator";

const GOOD = "a".repeat(64);
const proposal = (o: Partial<Proposal> = {}): Proposal => ({ id: "p1", createdAt: "2026-10-10T12:00:00Z", requiresSecondary: false, open: true, items: [{ itemKind: "article", recomputedHash: GOOD, currentHash: GOOD }, { itemKind: "voice_reference", recomputedHash: "b".repeat(64), currentHash: "b".repeat(64) }], ...o });
const props = (p = proposal()) => new Map([[p.id, p]]);
const reg = (): Registry => new Map([
  ["u_juan", { role: "approver", status: "CONFIRMED", label: "Juan" }],
  ["u_cherry", { role: "secondary", status: "CONFIRMED", label: "Cherry" }],
  ["u_leo", { role: "operator", status: "CONFIRMED", label: "Leo" }],
  ["u_pending", { role: null, status: "PENDING" }],
]);
const rec = (o: Partial<RoomRecord> = {}): RoomRecord => ({ recordId: "r1", proposalId: "p1", itemKind: "article", decision: "approve", claimedHash: GOOD, viewerId: "u_juan", serverUpdatedAt: "2026-10-10T13:00:00Z", ...o });
const READ = "2026-10-10T14:00:00Z";

describe("approval sync: forged and untrusted records", () => {
  it("a genuine approval by a confirmed approver counts", () => {
    const v = classifyRecord(rec(), props(), reg(), READ);
    expect(v.classification).toBe("APPROVAL"); expect(v.accepted).toBe(true);
  });
  it("FORGED: wrong hash is rejected and both hashes are reported", () => {
    const v = classifyRecord(rec({ claimedHash: "f".repeat(64) }), props(), reg(), READ);
    expect(v.classification).toBe("REJECTED"); expect(v.accepted).toBe(false);
    expect(v.reason).toContain("hash mismatch"); expect(v.recomputedHash).toBe(GOOD);
  });
  it("FORGED: a backdated browser decidedAt is ignored; the platform server time is what counts", () => {
    const v = classifyRecord(rec({ browserDecidedAt: "2020-01-01T00:00:00Z", serverUpdatedAt: "2026-10-10T13:00:00Z" }), props(), reg(), READ);
    expect(v.countedTime).toBe("2026-10-10T13:00:00Z");
    expect(v.accepted).toBe(true);
  });
  it("with no platform time our own read time is used, never the browser's", () => {
    const v = classifyRecord(rec({ serverUpdatedAt: null, browserDecidedAt: "2020-01-01T00:00:00Z" }), props(), reg(), READ);
    expect(v.countedTime).toBe(READ);
  });
  it("a record written before the proposal existed cannot approve it", () => {
    expect(classifyRecord(rec({ serverUpdatedAt: "2026-10-10T11:00:00Z" }), props(), reg(), READ).classification).toBe("REJECTED");
  });
  it("an edit after approval: the claimed hash no longer equals the current version, so the record is rejected", () => {
    const p = proposal({ items: [{ itemKind: "article", recomputedHash: GOOD, currentHash: "c".repeat(64) }] });
    const v = classifyRecord(rec(), props(p), reg(), READ);
    expect(v.classification).toBe("REJECTED"); expect(v.reason).toContain("superseded");
  });
  it("a closed or superseded proposal cannot take a decision, even with the right hash", () => {
    const v = classifyRecord(rec(), props(proposal({ open: false })), reg(), READ);
    expect(v.classification).toBe("REJECTED"); expect(v.reason).toContain("closed or superseded");
  });
  it("unknown proposal or item is rejected", () => {
    expect(classifyRecord(rec({ proposalId: "nope" }), props(), reg(), READ).classification).toBe("REJECTED");
  });
});

describe("approval sync: who counts", () => {
  it("an unknown account's first click is feedback, queued for Leo's confirmation", () => {
    const v = classifyRecord(rec({ viewerId: "u_new" }), props(), reg(), READ);
    expect(v.classification).toBe("FEEDBACK"); expect(v.registerPending).toBe(true); expect(v.accepted).toBe(false);
  });
  it("a pending or unconfirmed account is feedback", () => expect(classifyRecord(rec({ viewerId: "u_pending" }), props(), reg(), READ).classification).toBe("FEEDBACK"));
  it("Leo's own click (operator) is never an approval, even with the right hash", () => {
    const v = classifyRecord(rec({ viewerId: "u_leo" }), props(), reg(), READ);
    expect(v.classification).toBe("FEEDBACK"); expect(v.accepted).toBe(false);
  });
  it("a wrong-hash click from an unconfirmed account is feedback, not a rejection", () => expect(classifyRecord(rec({ viewerId: "u_new", claimedHash: "z" }), props(), reg(), READ).classification).toBe("FEEDBACK"));
});

describe("sign-off", () => {
  const c = (viewerId: string, role: Counted["role"], itemKind: Counted["itemKind"], classification: Counted["classification"]): Counted => ({ viewerId, role, itemKind, classification, time: READ });
  it("article and voice approval by the approver signs off", () => {
    expect(evaluateSignoff(proposal(), [c("u_juan", "approver", "article", "APPROVAL"), c("u_juan", "approver", "voice_reference", "APPROVAL")]).status).toBe("APPROVED");
  });
  it("article approved but voice not yet confirmed: waiting", () => {
    expect(evaluateSignoff(proposal(), [c("u_juan", "approver", "article", "APPROVAL")]).status).toBe("WAITING");
  });
  it("a rejected voice reference sends the article back to Agent 7", () => {
    const r = evaluateSignoff(proposal(), [c("u_juan", "approver", "article", "APPROVAL"), c("u_juan", "approver", "voice_reference", "CHANGES_REQUESTED")]);
    expect(r.status).toBe("SENT_BACK"); expect(r.reasons[0]).toContain("Agent 7");
  });
  it("privacy exception needs a secondary who is a different account", () => {
    const p = proposal({ requiresSecondary: true, items: [{ itemKind: "article", recomputedHash: GOOD, currentHash: GOOD }] });
    expect(evaluateSignoff(p, [c("u_juan", "approver", "article", "APPROVAL")]).status).toBe("WAITING");
    expect(evaluateSignoff(p, [c("u_juan", "approver", "article", "APPROVAL"), c("u_cherry", "secondary", "article", "APPROVAL")]).status).toBe("APPROVED");
    expect(evaluateSignoff(p, [c("u_juan", "approver", "article", "APPROVAL"), c("u_juan", "secondary", "article", "APPROVAL")]).status).toBe("WAITING");
  });
});

describe("registration by first click", () => {
  it("Leo can confirm Juan as approver and Cherry as secondary", () => {
    const r: Registry = new Map([["u_a", { role: null, status: "PENDING" }]]);
    expect(confirmRegistration(r, "u_a", "approver", "Juan").ok).toBe(true);
    expect(confirmRegistration(r, "u_a", "secondary", "Cherry").ok).toBe(true);
  });
  it("never Leo as secondary or approver", () => {
    const r: Registry = new Map([["u_a", { role: null, status: "PENDING" }], ["u_leo", { role: "operator", status: "CONFIRMED" }]]);
    expect(confirmRegistration(r, "u_a", "secondary", "Leo").ok).toBe(false);
    expect(confirmRegistration(r, "u_leo", "secondary", "Cherry").ok).toBe(false);
    expect(confirmRegistration(r, "u_leo", "approver", "Juan").ok).toBe(false);
  });
  it("an account that has not clicked cannot be confirmed", () => expect(confirmRegistration(new Map(), "u_x", "approver", "Juan").ok).toBe(false));
});

describe("orchestrator: no agent sets an approval; edit after approval invalidates", () => {
  const subject = { type: "article" as const, id: "a1", state: "HUMAN_REVIEW" as const, priorState: null, revisionCount: 0, versionHash: "h1", approvedHash: null };
  const mk = () => { const repo = new MemoryRepo(); repo.add({ ...subject }); return { repo, orch: new Orchestrator(repo) }; };
  it("an agent cannot record an approval or move to APPROVED_FOR_WP_DRAFT", async () => {
    const { orch } = mk();
    expect((await orch.recordApproval("article", "a1", "h1", { kind: "agent", id: "thb-07-editorial-critic" })).ok).toBe(false);
    expect((await orch.transition("article", "a1", "APPROVED_FOR_WP_DRAFT", { kind: "agent", id: "thb-05-fact-privacy-auditor" })).ok).toBe(false);
  });
  it("a human approval of the current hash works; an edit afterwards invalidates it", async () => {
    const { repo, orch } = mk();
    expect((await orch.recordApproval("article", "a1", "h1", { kind: "human", id: "u_juan" })).ok).toBe(true);
    expect((await orch.transition("article", "a1", "APPROVED_FOR_WP_DRAFT", { kind: "human", id: "u_juan" })).ok).toBe(true);
    const r = await orch.recordEdit("article", "a1", "h2", { kind: "human", id: "leo" });
    expect(r.ok && r.subject.state).toBe("REVISION_REQUIRED");
    expect((await repo.load("article", "a1")).approvedHash).toBeNull();
  });
  it("an approval for a stale hash is refused", async () => {
    const { orch } = mk();
    expect((await orch.recordApproval("article", "a1", "old", { kind: "human", id: "u_juan" })).ok).toBe(false);
  });
});
