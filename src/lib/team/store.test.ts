import { describe, expect, it } from "vitest";
import { closeTicket, newRouter, raiseTicket, reopen, respond, runStatus, type Result, type RouterState } from "./router";
import { diffRouter, rowsToRouter, ticketToRow } from "./store";
import { buildTeamView, type ViewTicket } from "./view";

const ctx = (n = 0) => ({ at: `2026-10-12T12:00:${String(n).padStart(2, "0")}Z`, versionHash: "v1" });
const qc = (o: Record<string, unknown> = {}) => ({ ticket: "QUALITY_CORRECTION", from: ["V3"], to: "W1", section: "s2", issue: "The H1 does not name the situation.", severity: "must fix", evidence: "authenticity q3", fix: null, blocking: false, ...o });
const must = (r: Result) => { if (!r.ok) throw new Error(r.reason); return r.state; };

/** Round-trips a router state through the database row shapes, the way store.ts writes and reads it. */
function viaRows(s: RouterState, status = runStatus(s)): RouterState {
  const rows = s.tickets.map((t, i) => ({ ...ticketToRow(t, { id: `uuid-${t.id}`, runId: "run1", articleId: "a1", parentId: t.parentId ? `uuid-${t.parentId}` : null }, "2026-10-12T12:30:00Z"), created_at: `2026-10-12T12:00:${String(i).padStart(2, "0")}Z` }));
  const msgs = s.log.filter((l) => l.ticketId).map((l) => ({ ticket_id: `uuid-${l.ticketId}`, role: l.role, body: l.body, round: l.round, version_hash: l.versionHash, created_at: l.at }));
  return rowsToRouter({ ticket_budget: s.ticketBudget, round_limit: s.roundLimit, status: status === "STOPPED_BUDGET" ? "STOPPED_BUDGET" : "RUNNING" }, rows, msgs).state;
}

describe("router state survives the database round trip", () => {
  it("tickets, rounds, answers, parents, triggers, merged links and multi-role senders come back identical", () => {
    let s = newRouter();
    s = must(raiseTicket(s, qc({ from: ["V2", "V3"], key: "a:b" }), ctx(0), { mergedFrom: ["m1", "m2"] }));
    s = must(respond(s, "T1", "W1", "Reworded the H1.", ctx(1)));
    s = must(reopen(s, "T1", "V2", "Still vague.", ctx(2)));
    s = must(respond(s, "T1", "W1", "Reworded again.", ctx(3)));
    const r = reopen(s, "T1", "V2", "Not resolved.", ctx(4));                          // round 3: refused, escalates
    s = r.state;
    s = must(raiseTicket(s, qc({ ticket: "HUMAN_ESCALATION", from: ["V1"], to: "LEO", section: "s3", issue: "Legal point uncertain.", blocking: false }), ctx(5), { trigger: "legal_uncertain" }));
    const back = viaRows(s);
    expect(back.tickets).toEqual(s.tickets.map((t) => ({ ...t })));
    expect(back.tickets[0]).toMatchObject({ from: ["V2", "V3"], mergedFrom: ["m1", "m2"], status: "ESCALATED", round: 2 });
    expect(back.tickets[1]).toMatchObject({ type: "HUMAN_ESCALATION", trigger: "round_limit", parentId: "T1", from: ["ORCHESTRATOR"] });
    expect(runStatus(back)).toBe("ESCALATED");
  });
  it("a stopped run stays stopped and its budget count comes back", () => {
    let s = newRouter();
    for (let i = 0; i < 10; i++) s = must(raiseTicket(s, qc({ issue: `Issue number ${i + 1}` }), ctx(i)));
    const r = raiseTicket(s, qc({ issue: "Issue number 11" }), ctx(11));
    expect(r.ok).toBe(false);
    const back = viaRows(r.state);
    expect(back.stopped).toBe(true);
    expect(back.tickets).toHaveLength(11);
  });
  it("blocking and unit-less tickets keep their values", () => {
    let s = newRouter();
    s = must(raiseTicket(s, qc({ from: ["V1"], blocking: true, severity: "must fix" }), ctx(0)));
    expect(viaRows(s).tickets[0].blocking).toBe(true);
  });
});

describe("diffRouter: exactly what changed", () => {
  it("a raise adds a ticket and one log row; a reply changes the ticket and adds one row", () => {
    const s0 = newRouter();
    const s1 = must(raiseTicket(s0, qc(), ctx(0)));
    expect(diffRouter(s0, s1)).toMatchObject({ newTickets: [{ id: "T1" }], changedTickets: [], newLog: [{ action: "RAISE" }], newlyStopped: false });
    const s2 = must(respond(s1, "T1", "W1", "Done.", ctx(1)));
    const d = diffRouter(s1, s2);
    expect(d.newTickets).toEqual([]);
    expect(d.changedTickets.map((t) => [t.id, t.status])).toEqual([["T1", "ANSWERED"]]);
    expect(d.newLog.map((l) => l.action)).toEqual(["REPLY"]);
  });
  it("a refusal adds only a log row (no ticket); a limit hit adds the escalation, changes the parent and flags the stop", () => {
    const s0 = newRouter();
    const refused = raiseTicket(s0, qc({ from: ["V2"], blocking: true }), ctx(0));
    expect(diffRouter(s0, refused.state)).toMatchObject({ newTickets: [], changedTickets: [], newLog: [{ action: "REFUSE", ticketId: null }] });
    let s = s0;
    for (let i = 0; i < 10; i++) s = must(raiseTicket(s, qc({ issue: `Issue number ${i + 1}` }), ctx(i)));
    const stop = raiseTicket(s, qc({ issue: "Issue number 11" }), ctx(11));
    const d = diffRouter(s, stop.state);
    expect(d.newTickets.map((t) => t.trigger)).toEqual(["budget_limit"]);
    expect(d.newlyStopped).toBe(true);
    expect(d.newLog.map((l) => l.action)).toEqual(["STOP", "ESCALATE"]);
  });
  it("closing changes one ticket", () => {
    let s = must(raiseTicket(newRouter(), qc(), ctx(0)));
    s = must(respond(s, "T1", "W1", "Done.", ctx(1)));
    const closed = must(closeTicket(s, "T1", "V3", "accepted", ctx(2)));
    expect(diffRouter(s, closed).changedTickets.map((t) => [t.id, t.status, t.resolution])).toEqual([["T1", "CLOSED", "accepted"]]);
  });
});

describe("the Team tab view: outcomes and escalations first", () => {
  const toView = (s: RouterState, sections = [{ key: "s2", title: "What do you have to disclose?", status: "NEEDS_FACT" }, { key: "s3", title: "What does cleanup cost?", status: "LOCKED" }]) =>
    buildTeamView({
      run: { ticketBudget: s.ticketBudget, roundLimit: s.roundLimit, status: runStatus(s) },
      tickets: s.tickets.map((t) => ({ ...t, dbId: `uuid-${t.id}` }) as ViewTicket),
      messages: s.log.filter((l) => l.ticketId).map((l) => ({ routerId: l.ticketId!, role: l.role, body: l.body, round: l.round, at: l.at })), sections,
    });

  it("shows the budget bar: tickets used of 10, escalations not counted", () => {
    let s = newRouter();
    for (let i = 0; i < 4; i++) s = must(raiseTicket(s, qc({ issue: `Issue number ${i + 1}` }), ctx(i)));
    s = must(raiseTicket(s, qc({ ticket: "HUMAN_ESCALATION", from: ["V1"], to: "LEO", issue: "Legal point uncertain." }), ctx(5), { trigger: "legal_uncertain" }));
    const v = toView(s);
    expect(v.budget).toEqual({ used: 4, limit: 10, remaining: 6, pct: 40, stopped: false });
    expect(v.runStatus).toBe("ESCALATED");
  });
  it("per unit: resolved, open, must-fix, escalations and V1 status", () => {
    let s = newRouter();
    s = must(raiseTicket(s, qc({ from: ["V1"], blocking: true }), ctx(0)));                                 // s2: V1 veto open
    s = must(raiseTicket(s, qc({ issue: "Keyword is forced into the answer." }), ctx(1)));                  // s2: open must-fix from V3
    s = must(raiseTicket(s, qc({ section: "s3", issue: "Example is generic and fits any site.", severity: "should fix" }), ctx(2)));
    s = must(respond(s, "T3", "W1", "Fixed.", ctx(3)));
    s = must(closeTicket(s, "T3", "V3", "accepted", ctx(4)));                                                // s3: resolved, locked
    const v = toView(s);
    const s2 = v.units.find((u) => u.key === "s2")!, s3 = v.units.find((u) => u.key === "s3")!;
    expect(s2).toMatchObject({ open: 2, mustFixOpen: 2, resolved: 0, escalations: 0, v1: "veto open", outcome: "open items" });
    expect(s3).toMatchObject({ open: 0, resolved: 1, v1: "passed", outcome: "locked" });
  });
  it("a limit hit and an agent escalation both land in the Stuck inbox, with both positions, a suggested default and the right resolve actions", () => {
    let s = must(raiseTicket(newRouter(), qc(), ctx(0)));
    s = must(respond(s, "T1", "W1", "Reworded the H1.", ctx(1)));
    s = must(reopen(s, "T1", "V3", "Still vague.", ctx(2)));
    s = must(respond(s, "T1", "W1", "Reworded again.", ctx(3)));
    s = reopen(s, "T1", "V3", "Still not right.", ctx(4)).state;                                            // round 3 refused -> escalation T2
    s = must(raiseTicket(s, qc({ ticket: "HUMAN_ESCALATION", from: ["S2"], to: "LEO", section: "s3", issue: "The fix would change the target keyword.", fix: "Keep the keyword." }), ctx(5), { trigger: "brief_change" }));
    const v = toView(s, [{ key: "s2", title: "t", status: "ESCALATED" }, { key: "s3", title: "t", status: "LOCKED" }]);
    expect(v.stuck.map((x) => [x.trigger, x.unit])).toEqual([["round_limit", "s2"], ["brief_change", "s3"]]);
    const lim = v.stuck[0];
    expect(lim.positions.map((p) => p.label)).toEqual(expect.arrayContaining(["Answer (W1)", "Sender still disagrees"]));
    expect(lim.positions.find((p) => p.label.startsWith("Ask"))?.text).toContain("The H1 does not name the situation.");
    expect(lim.recommendation).toMatch(/keep the reviewer's position/);
    expect(lim.actions).toEqual(["request_revision", "hold", "dismiss"]);
    expect(lim.parentRouterId).toBe("T1");
    const agent = v.stuck[1];
    expect(agent.positions[0]).toEqual({ label: "S2", text: "The fix would change the target keyword." });
    expect(agent.recommendation).toContain("S2 suggests: Keep the keyword.");
    expect(agent.actions).toEqual(["reopen", "dismiss"]);
    expect(v.units.find((u) => u.key === "s2")!.outcome).toBe("escalated to Leo");
  });
  it("a budget stop shows in the bar and the inbox; Leo's answer takes the item out of the inbox", () => {
    let s = newRouter();
    for (let i = 0; i < 10; i++) s = must(raiseTicket(s, qc({ issue: `Issue number ${i + 1}` }), ctx(i)));
    s = raiseTicket(s, qc({ issue: "Issue number 11" }), ctx(11)).state;
    let v = toView(s);
    expect(v.budget).toMatchObject({ used: 10, remaining: 0, pct: 100, stopped: true });
    expect(v.runStatus).toBe("STOPPED_BUDGET");
    expect(v.stuck).toHaveLength(1);
    expect(v.stuck[0].trigger).toBe("budget_limit");
    expect(v.stuck[0].recommendation).toMatch(/ticket budget/);
    s = must(respond(s, "T11", "LEO", "Accept the draft with the open items listed.", ctx(12)));
    v = toView(s);
    expect(v.stuck).toEqual([]);
  });
  it("tickets carry the full discussion and merged links for the click-to-open view, newest first", () => {
    let s = must(raiseTicket(newRouter(), qc({ from: ["V2", "V3"] }), ctx(0), { mergedFrom: ["c1", "c2"] }));
    s = must(respond(s, "T1", "W1", "Done.", ctx(1)));
    s = must(raiseTicket(s, qc({ issue: "A second, different issue appears here." }), ctx(2)));
    const v = toView(s);
    expect(v.tickets.map((t) => t.routerId)).toEqual(["T2", "T1"]);
    expect(v.tickets[1].messages.map((m) => m.role)).toEqual(["V2+V3", "W1"]);
    expect(v.tickets[1].mergedFrom).toEqual(["c1", "c2"]);
  });
  it("counts which ticket types fired and which teams sent and received", () => {
    let s = newRouter();
    s = must(raiseTicket(s, qc({ ticket: "EVIDENCE_REQUEST", from: ["W1"], to: "R1" }), ctx(0)));
    s = must(raiseTicket(s, qc({ ticket: "ROOT_CAUSE_NOTE", from: ["V2"], to: "S2" }), ctx(1)));
    s = must(raiseTicket(s, qc(), ctx(2)));
    const { fired } = toView(s);
    expect(fired.types).toEqual({ EVIDENCE_REQUEST: 1, ROOT_CAUSE_NOTE: 1, QUALITY_CORRECTION: 1, HUMAN_ESCALATION: 0 });
    expect(fired.teams).toEqual({ Writing: { sent: 1, received: 1 }, Research: { sent: 0, received: 1 }, Review: { sent: 2, received: 0 }, Strategy: { sent: 0, received: 1 } });
  });
});
