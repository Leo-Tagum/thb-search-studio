import { describe, expect, it } from "vitest";
import { budgetUsed, closeTicket, newRouter, openEscalations, raiseTicket, reopen, respond, routeAllowed, runStatus, type Result, type RouterState } from "./router";
import { TEAM_ROLES } from "./tickets";

const ctx = { at: "2026-10-10T12:00:00Z", versionHash: "v1" };
const qc = (o: Record<string, unknown> = {}) => ({ ticket: "QUALITY_CORRECTION", from: ["V3"], to: "W1", section: "h1", issue: "The H1 does not name the situation.", severity: "should fix", evidence: "authenticity q3", fix: null, blocking: false, ...o });
const must = (r: Result) => { if (!r.ok) throw new Error(r.reason); return r; };

describe("routing", () => {
  const teams: Record<string, string[]> = { Research: ["R1", "R2", "R3"], Strategy: ["S1", "S2"], Writing: ["W1", "W2"], Review: ["V1", "V2", "V3"] };
  const dest: Record<string, string> = { EVIDENCE_REQUEST: "R1", ROOT_CAUSE_NOTE: "S2", QUALITY_CORRECTION: "W1", HUMAN_ESCALATION: "LEO" };
  it("a ticket from a member of any team routes to the destination of its type, and logs it", () => {
    for (const [team, roles] of Object.entries(teams)) for (const [type, to] of Object.entries(dest)) {
      const from = roles.find((r) => r !== to)!;
      const r = raiseTicket(newRouter(), qc({ ticket: type, from: [from], to }), ctx, { trigger: "legal_uncertain" });
      expect(r.ok, `${team} ${from} ${type}`).toBe(true);
      expect(r.state.log).toHaveLength(1);
      expect(r.state.log[0]).toMatchObject({ action: "RAISE", versionHash: "v1", at: ctx.at });
    }
  });
  it("destination rules are checked in the router too, independent of the schema", () => {
    expect(routeAllowed("QUALITY_CORRECTION", ["V3"], "W2")).not.toBeNull();
    expect(routeAllowed("EVIDENCE_REQUEST", ["W1"], "S1")).not.toBeNull();
    expect(routeAllowed("ROOT_CAUSE_NOTE", ["V2"], "S1")).not.toBeNull();
    expect(routeAllowed("HUMAN_ESCALATION", ["V1"], "W1")).not.toBeNull();
    expect(routeAllowed("QUALITY_CORRECTION", ["V3"], "W1")).toBeNull();
    for (const r of TEAM_ROLES) expect(routeAllowed("QUALITY_CORRECTION", [r], r)).not.toBeNull();
  });
  it("an invalid card is refused, logged, and uses no budget", () => {
    const r = raiseTicket(newRouter(), qc({ from: ["V2"], blocking: true }), ctx);
    expect(r.ok).toBe(false);
    expect(r.state.tickets).toHaveLength(0);
    expect(r.state.log).toHaveLength(1);
    expect(r.state.log[0].action).toBe("REFUSE");
  });
  it("a HUMAN_ESCALATION without one of the six triggers is refused", () => {
    expect(raiseTicket(newRouter(), qc({ ticket: "HUMAN_ESCALATION", from: ["W1"], to: "LEO" }), ctx).ok).toBe(false);
  });
});

describe("rounds: 2 per ticket", () => {
  const open = () => must(raiseTicket(newRouter(), qc(), ctx)).state;
  it("rounds 1 and 2 are allowed, round 3 is refused and escalates to Leo with both positions", () => {
    let s: RouterState = open();
    s = must(respond(s, "T1", "W1", "Changed to name the situation.", ctx)).state;
    s = must(reopen(s, "T1", "V3", "Still vague.", ctx)).state;           // round 2
    expect(s.tickets[0].round).toBe(2);
    s = must(respond(s, "T1", "W1", "Reworded again.", ctx)).state;
    const r = reopen(s, "T1", "V3", "Still not right.", ctx);               // round 3
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.escalation).toMatchObject({ type: "HUMAN_ESCALATION", to: "LEO", trigger: "round_limit", parentId: "T1" });
    expect(r.ok === false && r.escalation?.evidence).toContain("Still not right.");
    expect(r.ok === false && r.escalation?.evidence).toContain("Reworded again.");
    expect(r.state.tickets[0].status).toBe("ESCALATED");
    expect(r.state.tickets[0].round).toBe(2);
    expect(runStatus(r.state)).toBe("ESCALATED");
    expect(budgetUsed(r.state)).toBe(1);                                    // the escalation does not use budget
  });
  it("only the addressee answers, only the sender reopens or closes, and a closed ticket stays closed", () => {
    const s = open();
    expect(respond(s, "T1", "V3", "x", ctx).ok).toBe(false);
    expect(reopen(s, "T1", "V3", "x", ctx).ok).toBe(false);                 // not ANSWERED yet
    const a = must(respond(s, "T1", "W1", "done", ctx)).state;
    expect(reopen(a, "T1", "W1", "x", ctx).ok).toBe(false);
    expect(closeTicket(a, "T1", "W2", "x", ctx).ok).toBe(false);
    const c = must(closeTicket(a, "T1", "V3", "accepted", ctx)).state;
    expect(c.tickets[0].status).toBe("CLOSED");
    expect(respond(c, "T1", "W1", "again", ctx).ok).toBe(false);
  });
  it("a configurable limit is honored", () => {
    let s = must(raiseTicket(newRouter({ roundLimit: 1 }), qc(), ctx)).state;
    s = must(respond(s, "T1", "W1", "done", ctx)).state;
    expect(reopen(s, "T1", "V3", "no", ctx).ok).toBe(false);
  });
});

describe("budget: 10 tickets per article", () => {
  const fill = (n: number) => { let s = newRouter(); for (let i = 0; i < n; i++) s = must(raiseTicket(s, qc({ issue: `Issue number ${i + 1}` }), ctx)).state; return s; };
  it("ticket 10 is accepted; ticket 11 is refused, stops the article and escalates", () => {
    const s = fill(10);
    expect(budgetUsed(s)).toBe(10);
    const r = raiseTicket(s, qc({ issue: "Issue number 11" }), ctx);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.escalation).toMatchObject({ type: "HUMAN_ESCALATION", to: "LEO", trigger: "budget_limit" });
    expect(r.state.tickets).toHaveLength(11);                               // 10 + the escalation, not the refused ticket
    expect(budgetUsed(r.state)).toBe(10);
    expect(runStatus(r.state)).toBe("STOPPED_BUDGET");
    expect(raiseTicket(r.state, qc({ issue: "Another one" }), ctx).ok).toBe(false);   // stopped stays stopped
  });
  it("an agent HUMAN_ESCALATION is accepted even when stopped, and does not use budget", () => {
    const stopped = raiseTicket(fill(10), qc(), ctx).state;
    const r = must(raiseTicket(stopped, qc({ ticket: "HUMAN_ESCALATION", from: ["V1"], to: "LEO", issue: "Legal point is uncertain." }), ctx, { trigger: "legal_uncertain" }));
    expect(budgetUsed(r.state)).toBe(10);
    expect(openEscalations(r.state).length).toBe(2);
  });
});

describe("escalation to Leo and the log", () => {
  it("a HUMAN_ESCALATION makes the run ESCALATED until Leo answers; Leo's answer closes it", () => {
    let s = must(raiseTicket(newRouter(), qc({ ticket: "HUMAN_ESCALATION", from: ["S2"], to: "LEO", issue: "A change would alter the target keyword." }), ctx, { trigger: "brief_change" })).state;
    expect(runStatus(s)).toBe("ESCALATED");
    expect(respond(s, "T1", "W1", "x", ctx).ok).toBe(false);
    s = must(respond(s, "T1", "LEO", "Keep the keyword.", ctx)).state;
    expect(s.tickets[0]).toMatchObject({ status: "CLOSED", resolution: "Keep the keyword." });
    expect(runStatus(s)).toBe("RUNNING");
  });
  it("every step produces a log row, in order, with who, when and version", () => {
    let s = must(raiseTicket(newRouter(), qc(), ctx)).state;
    s = must(respond(s, "T1", "W1", "done", { at: "2026-10-10T12:01:00Z", versionHash: "v2" })).state;
    s = must(reopen(s, "T1", "V3", "no", { at: "2026-10-10T12:02:00Z", versionHash: "v2" })).state;
    s = must(closeTicket(s, "T1", "ORCHESTRATOR", "verified by code", ctx)).state;
    expect(s.log.map((l) => [l.seq, l.action, l.role, l.round])).toEqual([[1, "RAISE", "V3", 1], [2, "REPLY", "W1", 1], [3, "REOPEN", "V3", 2], [4, "CLOSE", "ORCHESTRATOR", 2]]);
    expect(s.log[1]).toMatchObject({ at: "2026-10-10T12:01:00Z", versionHash: "v2" });
  });
  it("the router never mutates the state it was given", () => {
    const s0 = newRouter();
    raiseTicket(s0, qc(), ctx);
    expect(s0.tickets).toHaveLength(0);
    expect(s0.log).toHaveLength(0);
  });
});
