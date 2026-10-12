/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { memDb } from "../studio/memdb.testlib";
import { parseTeamQueueArgs } from "../studio/cli-args";
import { progressOf } from "../studio/team-progress";
import { BRANCH_BUDGET_MAX, leoAnswerEscalationAs, raiseTicketBudget, startTeamRun } from "./store";

// The comparison branch may get a higher ticket budget as a recorded, deliberate exception; nothing else may.
const seed = (over: Record<string, any> = {}, run: Record<string, any> = {}) => ({
  articles: [{ id: "branch", pipeline_mode: "team", branch_of: "orig", is_fixture: false, ...over }, { id: "orig", pipeline_mode: "classic", branch_of: null, is_fixture: false }],
  team_runs: [{ id: "run1", article_id: "branch", ticket_budget: 10, round_limit: 2, budget_used: 10, status: "STOPPED_BUDGET", started_at: "2026-10-12", ...run }],
  tickets: [], ticket_messages: [], audit_events: [],
});
const REASON = "comparison run: a 9-unit revision needs about 2.5 tickets per unit";

describe("raiseTicketBudget", () => {
  it("raises the budget of a team branch, resumes a budget stop and records the exception with its reason", async () => {
    const m = memDb(seed());
    const r = await raiseTicketBudget(m.db, "branch", 30, REASON, "leo");
    expect(r).toMatchObject({ ok: true, from: 10, to: 30 });
    expect(m.t.team_runs[0]).toMatchObject({ ticket_budget: 30, status: "RUNNING", ended_at: null });
    const ev = m.t.audit_events.find((e) => e.event_type === "team_budget_exception");
    expect(ev).toMatchObject({ actor: "leo", subject_id: "branch", detail: { from: 10, to: 30, default: 10, reason: REASON } });
  });
  it("is refused on a normal (non-branch) article: every other article keeps 10", async () => {
    const m = memDb(seed({ branch_of: null }));
    const r = await raiseTicketBudget(m.db, "branch", 30, REASON, "leo");
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/only on a comparison branch/) });
    expect(m.t.team_runs[0].ticket_budget).toBe(10); expect(m.log).toEqual([]);
  });
  it("is refused for agents, the smoke-test actor on a real article, other humans and a blank actor, before any write", async () => {
    for (const actor of ["W1", "V1", "agent:s2", "orchestrator", "smoke-test", "cherry", ""]) {
      const m = memDb(seed());
      expect((await raiseTicketBudget(m.db, "branch", 30, REASON, actor)).ok, actor).toBe(false);
      expect(m.log, actor).toEqual([]);
    }
  });
  it("needs a reason, a whole number above the current budget, and at most the cap", async () => {
    for (const [n, why] of [[30, ""], [30, "   "], [10, REASON], [9, REASON], [2.5, REASON], [BRANCH_BUDGET_MAX + 1, REASON], [0, REASON]] as [number, string][]) {
      const m = memDb(seed());
      expect((await raiseTicketBudget(m.db, "branch", n, why, "leo")).ok, `${n}/${why}`).toBe(false);
      expect(m.log).toEqual([]);
    }
  });
  it("refuses a classic article and an article with no open team run", async () => {
    expect((await raiseTicketBudget(memDb(seed({ pipeline_mode: "classic" })).db, "branch", 30, REASON, "leo")).ok).toBe(false);
    expect((await raiseTicketBudget(memDb(seed({}, { status: "COMPLETE" })).db, "branch", 30, REASON, "leo")).ok).toBe(false);
  });
  it("does not touch a running run's status", async () => {
    const m = memDb(seed({}, { status: "RUNNING", budget_used: 4 }));
    expect((await raiseTicketBudget(m.db, "branch", 20, REASON, "leo")).ok).toBe(true);
    expect(m.t.team_runs[0]).toMatchObject({ ticket_budget: 20, status: "RUNNING", budget_used: 4 });
  });
  it("a new team run still starts with the default budget of 10", async () => {
    const m = memDb({ ...seed({}, { status: "COMPLETE" }) });
    const id = await startTeamRun(m.db, "branch");
    expect(m.t.team_runs.find((r) => r.id === id)).toMatchObject({ ticket_budget: 10, round_limit: 2 });
  });
});

describe("leoAnswerEscalationAs", () => {
  it("refuses agents and other humans before touching anything, and an unknown ticket", async () => {
    for (const actor of ["V1", "orchestrator", "smoke-test", "cherry", ""]) {
      const m = memDb(seed());
      expect((await leoAnswerEscalationAs(m.db, "branch", "T11", "ok", actor)).ok, actor).toBe(false);
      expect(m.log, actor).toEqual([]);
    }
    const m = memDb(seed());
    expect(await leoAnswerEscalationAs(m.db, "branch", "T99", "ok", "leo")).toMatchObject({ ok: false, reason: expect.stringMatching(/no ticket T99/) });
    expect(await leoAnswerEscalationAs(m.db, "branch", "T1", "  ", "leo")).toMatchObject({ ok: false });
  });
});

describe("parseTeamQueueArgs (the argument-position bug)", () => {
  it("reads role, article, unit and ticket from the right positions", () => {
    expect(parseTeamQueueArgs(["team-queue", "W2", "art-id", "s4"])).toEqual({ role: "W2", article: "art-id", unit: "s4", ticket: null });
    expect(parseTeamQueueArgs(["team-queue", "S1", "art-id", "-", "T3"])).toEqual({ role: "S1", article: "art-id", unit: null, ticket: "T3" });
    expect(parseTeamQueueArgs(["team-queue", "R1", "art-id"])).toEqual({ role: "R1", article: "art-id", unit: null, ticket: null });
  });
  it("the CLI uses the parser", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("scripts/studio.mts", "utf8")).toMatch(/parseTeamQueueArgs\(process\.argv\.slice\(2\)\)/);
  });
});

describe("progressOf", () => {
  const seeded = [{ unit: "s1", role: "V3", key: "ed:a" }, { unit: "s1", role: "V2", key: "seo:a" }, { unit: "s1", role: "V3", key: "ed:b" }, { unit: "s2", role: "V1", key: "fact:z" }];
  const secs = [
    { section_key: "s1", status: "LOCKED", issues: { team: { collected: [{ role: "V3", key: "ed:b", declined: "keeps the legal order" }, { role: "V2", key: "seo:a" }, { role: "V3", key: "ed:new" }] } } },
    { section_key: "s2", status: "NEEDS_REVISION", issues: { team: { collected: [{ role: "V1", key: "fact:z" }] } } },
    { section_key: "s3", status: "NEEDS_WRITE", issues: null },
  ];
  it("counts fixed, declined, still present and new per unit and in total", () => {
    const p = progressOf(seeded, secs as any);
    expect(p.units[0]).toMatchObject({ unit: "s1", seeded: 3, fixed: 1, declined: 1, stillPresent: 1, newOpen: 1 });
    expect(p.units[1]).toMatchObject({ unit: "s2", seeded: 1, fixed: 0, declined: 0, stillPresent: 1, newOpen: 0 });
    expect(p.units[2]).toMatchObject({ unit: "s3", seeded: 0, fixed: 0 });
    expect(p).toMatchObject({ fixed: 1, declined: 1, stillPresent: 2, seeded: 4 });
  });
  it("matches by reviewer AND key (the same key from another reviewer is a different finding)", () => {
    const p = progressOf([{ unit: "s1", role: "V2", key: "x" }], [{ section_key: "s1", status: "LOCKED", issues: { team: { collected: [{ role: "V3", key: "x" }] } } }] as any);
    expect(p.units[0]).toMatchObject({ fixed: 1, stillPresent: 0, newOpen: 1 });
  });
});
