import { describe, expect, it } from "vitest";
import { planSteps, type PlanInput, type PlanUnit } from "./plan";
import { newRouter, raiseTicket, respond } from "./router";

const ctx = { at: "2026-10-12T12:00:00Z", versionHash: "v1" };
const unit = (o: Partial<PlanUnit> = {}): PlanUnit => ({ key: "s2", status: "NEEDS_WRITE", pending: [], waitingOn: [], ...o });
const input = (o: Partial<PlanInput> = {}): PlanInput => ({ units: [unit()], tickets: [], runStatus: "RUNNING", queued: [], ...o });
const card = (o: Record<string, unknown> = {}) => ({ ticket: "EVIDENCE_REQUEST", from: ["W1"], to: "R2", section: "s2", issue: "What is the demand for this question?", severity: "must fix", evidence: "no data in the brief", fix: null, blocking: false, ...o });
const tickets = (...cs: Record<string, unknown>[]) => { let s = newRouter(); for (const c of cs) { const r = raiseTicket(s, c, ctx); if (!r.ok) throw new Error(r.reason); s = r.state; } return s; };

describe("team plan", () => {
  it("an unwritten unit needs W1; a unit in review needs the council members still pending; a revision needs W1", () => {
    expect(planSteps(input()).map((s) => [s.role, s.unit])).toEqual([["W1", "s2"]]);
    expect(planSteps(input({ units: [unit({ status: "NEEDS_COUNCIL", pending: ["V1", "V3"] })] })).map((s) => s.role)).toEqual(["V1", "V3"]);
    expect(planSteps(input({ units: [unit({ status: "NEEDS_REVISION" })] })).map((s) => s.role)).toEqual(["W1"]);
  });
  it("nothing runs for a locked, escalated or blocked unit", () => {
    for (const status of ["LOCKED", "ESCALATED", "BLOCKED_CLAIM", "BLOCKED_PRIVACY"] as const) expect(planSteps(input({ units: [unit({ status })] }))).toEqual([]);
  });
  it("an open ticket waits for its addressee first: Research or S2", () => {
    const s = tickets(card(), card({ ticket: "ROOT_CAUSE_NOTE", from: ["V2"], to: "S2", issue: "The brief gives s3 the wrong purpose." }));
    const steps = planSteps(input({ units: [unit({ status: "NEEDS_COUNCIL", pending: ["V1"] })], tickets: s.tickets }));
    expect(steps.map((x) => [x.role, x.ticketId])).toEqual([["R2", "T1"], ["S2", "T2"], ["V1", null]]);
  });
  it("a unit waiting on its evidence request does not run W1 until the ticket is answered", () => {
    const s = tickets(card({ to: "R1" }));
    const waiting = unit({ status: "NEEDS_WRITE", waitingOn: ["T1"] });
    expect(planSteps(input({ units: [waiting], tickets: s.tickets })).map((x) => x.role)).toEqual(["R1"]);
    const answered = respond(s, "T1", "R1", "Here is the pack.", ctx);
    if (!answered.ok) throw new Error(answered.reason);
    expect(planSteps(input({ units: [waiting], tickets: answered.state.tickets })).map((x) => x.role)).toEqual(["W1"]);
  });
  it("an answered or closed ticket is not run again, and a human escalation is nobody's step", () => {
    let s = tickets(card());
    const a = respond(s, "T1", "R2", "Pack.", ctx);
    if (!a.ok) throw new Error(a.reason);
    s = a.state;
    expect(planSteps(input({ units: [], tickets: s.tickets }))).toEqual([]);
    const e = raiseTicket(newRouter(), card({ ticket: "HUMAN_ESCALATION", from: ["V1"], to: "LEO" }), ctx, { trigger: "legal_uncertain" });
    if (!e.ok) throw new Error(e.reason);
    expect(planSteps(input({ units: [], tickets: e.state.tickets }))).toEqual([]);
  });
  it("steps that are already queued are not planned twice, and a stopped run plans nothing", () => {
    const base = input({ units: [unit(), unit({ key: "s3" })] });
    expect(planSteps(base)).toHaveLength(2);
    expect(planSteps({ ...base, queued: [{ role: "W1", unit: "s2", ticketId: null }] }).map((x) => x.unit)).toEqual(["s3"]);
    expect(planSteps({ ...base, runStatus: "STOPPED_BUDGET" })).toEqual([]);
  });
});
