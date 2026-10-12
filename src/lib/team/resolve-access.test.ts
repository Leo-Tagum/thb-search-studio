/* eslint-disable @typescript-eslint/no-explicit-any */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agentLikeActor, resolveActorError } from "../studio/actors";
import { resolveSection } from "../studio/service";
import { TEAM_AGENT_FILE } from "./bridge";

// resolveSection is Leo's action: reachable only from the Studio UI action and the operator CLI (both act as "leo"), audited, never by an agent role or the bridge.

/** A minimal chainable fake of the Supabase client: reads return the table fixtures, inserts are recorded. */
function fakeDb(tables: Record<string, any>, log: { inserts: { table: string; row: any }[]; updates: string[]; touched: string[] }) {
  return {
    from(table: string) {
      log.touched.push(table);
      const result = () => ({ data: tables[table] ?? [], error: null });
      const single = () => ({ data: Array.isArray(tables[table]) ? tables[table][0] : tables[table], error: null });
      const b: any = new Proxy(function () {}, {
        get: (_t, k) => {
          if (k === "then") return (res: any) => res(result());
          if (k === "single" || k === "maybeSingle") return () => Promise.resolve(single());
          if (k === "insert") return (row: any) => { log.inserts.push({ table, row }); return b; };
          if (k === "update") return () => { log.updates.push(table); return b; };
          return () => b;
        },
      });
      return b;
    },
  } as any;
}
const tablesFor = (mode: "classic" | "team", status = "ESCALATED") => ({
  articles: [{ id: "a1", brief_id: "b1", pipeline_mode: mode, state: "DRAFTING", primary_keyword: "hoarded house" }],
  briefs: [{ id: "b1", outline: { link_plan: [] } }],
  article_sections: [{ id: "sec1", article_id: "a1", section_key: "s2", brief_h2: "What do you have to disclose?", status, locked: false, issues: { issues: [], meta: { versionNo: 1, versionHash: "h1", sig: "s", factPassedSig: null, resumeStage: "fact", lockedHash: null, escalation: { issueKey: "fact:x", reason: "stuck" }, blockedBy: null } } }],
});
const newLog = () => ({ inserts: [] as { table: string; row: any }[], updates: [] as string[], touched: [] as string[] });

describe("who counts as an agent-like actor", () => {
  it("every team role, agent key, the bridge, the orchestrator and agent:/system: ids", () => {
    for (const role of Object.keys(TEAM_AGENT_FILE)) { expect(agentLikeActor(role), role).toBe(true); expect(agentLikeActor(role.toLowerCase()), role).toBe(true); }
    for (const k of [...Object.values(TEAM_AGENT_FILE), "thb-04-section-writer", "thb-05-fact-privacy-auditor", "thb-01-seo-strategist"]) expect(agentLikeActor(k), k).toBe(true);
    for (const id of ["agent:W1", "system:studio", "system:agent-bridge", "orchestrator", "agent-bridge", "bridge", "Studio", "ROUTER", " V1 ", "role:V1", "bot:x"]) expect(agentLikeActor(id), id).toBe(true);
  });
  it("humans are not", () => {
    for (const id of ["leo", "Leo", "smoke-test", "juan", "cherry"]) expect(agentLikeActor(id), id).toBe(false);
  });
  it("policy: blank and agent actors are refused everywhere; on a team article only Leo", () => {
    expect(resolveActorError("", "classic")).toMatch(/actor required/);
    expect(resolveActorError("V1", "classic")).toMatch(/agent or system actor/);
    expect(resolveActorError("cherry", "classic")).toBeNull();
    expect(resolveActorError("cherry", "team")).toMatch(/only Leo/);
    expect(resolveActorError("leo", "team")).toBeNull();
  });
});

describe("resolveSection cannot be triggered by an agent role or the bridge", () => {
  const actions = [{ kind: "hold" as const }, { kind: "request_revision" as const, text: "Write it without the figure." }, { kind: "reopen" as const, text: "Re-check the wording." }];
  it("an agent-like actor is refused before anything is read or written, for every action and mode", async () => {
    for (const actor of ["W1", "V1", "S2", "R1", "agent:thb-w1-writer", "system:agent-bridge", "orchestrator", "thb-04-section-writer"]) for (const mode of ["classic", "team"] as const) for (const action of actions) {
      const log = newLog();
      const res = await resolveSection(fakeDb(tablesFor(mode), log), "a1", "s2", action, actor);
      expect(res.ok, `${actor} ${mode} ${action.kind}`).toBe(false);
      expect((res as any).reason).toMatch(/agent or system actor/);
      expect(log.touched, `${actor} touched the database`).toEqual([]);
      expect(log.inserts).toEqual([]);
    }
  });
  it("on a team-mode article a human other than Leo is refused too, with nothing written", async () => {
    const log = newLog();
    const res = await resolveSection(fakeDb(tablesFor("team"), log), "a1", "s2", { kind: "request_revision", text: "Fix it." }, "cherry");
    expect(res.ok).toBe(false);
    expect((res as any).reason).toMatch(/only Leo/);
    expect(log.inserts).toEqual([]);
    expect(log.updates).toEqual([]);
  });
  it("Leo's resolve on a team article goes through and is audited with Leo as the actor", async () => {
    const log = newLog();
    const res = await resolveSection(fakeDb(tablesFor("team"), log), "a1", "s2", { kind: "request_revision", text: "Write it without the figure." }, "leo");
    expect(res.ok).toBe(true);
    const audit = log.inserts.find((i) => i.table === "audit_events");
    expect(audit?.row).toMatchObject({ actor: "leo", subject_type: "article", subject_id: "a1", event_type: "section_request_revision", accepted: true });
    expect(audit?.row.detail).toMatchObject({ unit: "s2", text: "Write it without the figure." });
  });
  it("a hold is audited too, and a classic article still accepts any human operator", async () => {
    const log = newLog();
    expect((await resolveSection(fakeDb(tablesFor("team"), log), "a1", "s2", { kind: "hold" }, "leo")).ok).toBe(true);
    expect(log.inserts.find((i) => i.table === "audit_events")?.row).toMatchObject({ actor: "leo", event_type: "section_hold" });
    const log2 = newLog();
    expect((await resolveSection(fakeDb(tablesFor("classic"), log2), "a1", "s2", { kind: "request_revision", text: "Fix it." }, "smoke-test")).ok).toBe(true);
  });
});

describe("the only call sites are Leo's: the UI action and the operator CLI", () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === "node_modules" || f === ".next" ? [] : walk(p)) : [p]; });
  const files = [...walk("src"), ...walk("scripts")].filter((f) => /\.(ts|tsx|mts)$/.test(f)).map((f) => f.replace(/\\/g, "/"));
  const callers = files.filter((f) => !f.endsWith(".test.ts") && f !== "src/lib/studio/service.ts" && /resolveSection\s*\(/.test(readFileSync(f, "utf8")));
  it("resolveSection( is called only from the Studio UI action, the CLI and the fixture-only smoke scripts", () => {
    expect(callers.sort()).toEqual(["scripts/studio-smoke.mts", "scripts/studio.mts", "src/app/studio/actions.ts"]);
  });
  it("the UI action and the CLI both act as leo; the smoke acts as smoke-test", () => {
    expect(readFileSync("src/app/studio/actions.ts", "utf8")).toMatch(/const ACTOR = "leo"/);
    expect(readFileSync("src/app/studio/actions.ts", "utf8")).toMatch(/resolveSection\(supabaseAdmin\(\), articleId, unit, [^;]*, ACTOR\)/);
    expect(readFileSync("scripts/studio.mts", "utf8")).toMatch(/resolveSection\(db, a, b, [^;]*, "leo"\)/);
    for (const m of readFileSync("scripts/studio-smoke.mts", "utf8").matchAll(/resolveSection\(db, art, [^\n]*?, "([^"]+)"\)/g)) expect(m[1]).toBe("smoke-test");
  });
  it("no agent, bridge, router or council code can reach it: nothing under src/lib/team or src/lib/agents imports the studio service or actions", () => {
    for (const f of files.filter((x) => (x.startsWith("src/lib/team/") || x.startsWith("src/lib/agents/")) && !x.endsWith(".test.ts"))) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/from "(\.\.\/)+studio\/service"|from "@\/lib\/studio\/service"|from "\.\/service"|app\/studio\/actions/);
      expect(text, f).not.toMatch(/resolveSection/);
    }
  });
  it("the UI entry points are server actions behind the Studio page, and every call acts as ACTOR (leo)", () => {
    const actions = readFileSync("src/app/studio/actions.ts", "utf8");
    expect(actions.startsWith('"use server"')).toBe(true);
    const calls = [...actions.matchAll(/resolveSection\([^;]*;/g)].map((m) => m[0]);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    for (const c of calls) expect(c, c).toMatch(/, ACTOR\)/);                    // every call acts as the constant operator "leo"
  });
});
