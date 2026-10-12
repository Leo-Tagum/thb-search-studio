/* eslint-disable @typescript-eslint/no-explicit-any */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agentLikeActor, resolveActorError } from "../studio/actors";
import { resolveSection, setPipelineMode } from "../studio/service";
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
const tablesFor = (mode: "classic" | "team", status = "ESCALATED", fixture = false) => ({
  articles: [{ id: "a1", brief_id: "b1", pipeline_mode: mode, state: "DRAFTING", primary_keyword: "hoarded house", is_fixture: fixture }],
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
  it("policy: blank and agent actors are refused everywhere; a real article accepts only leo; a fixture article also accepts smoke-test", () => {
    const real = { is_fixture: false }, fixture = { is_fixture: true };
    expect(resolveActorError("", real)).toMatch(/actor required/);
    expect(resolveActorError("V1", real)).toMatch(/agent or system actor/);
    expect(resolveActorError("V1", fixture)).toMatch(/agent or system actor/);
    expect(resolveActorError("leo", real)).toBeNull();
    expect(resolveActorError("Leo", fixture)).toBeNull();
    expect(resolveActorError("smoke-test", fixture)).toBeNull();
    expect(resolveActorError("smoke-test", real)).toMatch(/only on fixture articles/);
    expect(resolveActorError("smoke-test", {})).toMatch(/only on fixture articles/);          // a missing flag is a real article
    expect(resolveActorError("smoke-test", null)).toMatch(/only on fixture articles/);
    expect(resolveActorError("smoke-test", { is_fixture: null })).toMatch(/only on fixture articles/);
    expect(resolveActorError("cherry", real)).toMatch(/only leo/);
    expect(resolveActorError("cherry", fixture)).toMatch(/only leo/);
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
  it("a human other than Leo is refused on a real article, in either mode, with nothing written", async () => {
    for (const mode of ["classic", "team"] as const) for (const actor of ["cherry", "juan"]) {
      const log = newLog();
      const res = await resolveSection(fakeDb(tablesFor(mode), log), "a1", "s2", { kind: "request_revision", text: "Fix it." }, actor);
      expect(res.ok, `${actor} ${mode}`).toBe(false);
      expect((res as any).reason).toMatch(/only leo/);
      expect(log.inserts).toEqual([]);
      expect(log.updates).toEqual([]);
    }
  });
  it("the smoke-test actor is refused on a REAL article, in either mode and for every action, with nothing written", async () => {
    for (const mode of ["classic", "team"] as const) for (const action of actions) {
      const log = newLog();
      const res = await resolveSection(fakeDb(tablesFor(mode, "ESCALATED", false), log), "a1", "s2", action, "smoke-test");
      expect(res.ok, `${mode} ${action.kind}`).toBe(false);
      expect((res as any).reason).toMatch(/only on fixture articles/);
      expect(log.inserts).toEqual([]);
      expect(log.updates).toEqual([]);
    }
  });
  it("the smoke-test actor is accepted on a fixture article, and the audit event names it", async () => {
    for (const mode of ["classic", "team"] as const) {
      const log = newLog();
      const res = await resolveSection(fakeDb(tablesFor(mode, "ESCALATED", true), log), "a1", "s2", { kind: "request_revision", text: "Fixture directive." }, "smoke-test");
      expect(res.ok, mode).toBe(true);
      expect(log.inserts.find((i) => i.table === "audit_events")?.row).toMatchObject({ actor: "smoke-test", event_type: "section_request_revision" });
    }
  });
  it("Leo's resolve goes through on a real article in either mode and is audited with Leo as the actor", async () => {
    for (const mode of ["classic", "team"] as const) {
      const log = newLog();
      const res = await resolveSection(fakeDb(tablesFor(mode), log), "a1", "s2", { kind: "request_revision", text: "Write it without the figure." }, "leo");
      expect(res.ok, mode).toBe(true);
      const audit = log.inserts.find((i) => i.table === "audit_events");
      expect(audit?.row).toMatchObject({ actor: "leo", subject_type: "article", subject_id: "a1", event_type: "section_request_revision", accepted: true });
      expect(audit?.row.detail).toMatchObject({ unit: "s2", text: "Write it without the figure." });
    }
  });
  it("a hold is audited too", async () => {
    const log = newLog();
    expect((await resolveSection(fakeDb(tablesFor("team"), log), "a1", "s2", { kind: "hold" }, "leo")).ok).toBe(true);
    expect(log.inserts.find((i) => i.table === "audit_events")?.row).toMatchObject({ actor: "leo", event_type: "section_hold" });
  });
});

describe("switching the pipeline follows the same actor rule", () => {
  it("smoke-test cannot switch a real article; Leo can; smoke-test can switch a fixture", async () => {
    const real = newLog();
    const refused = await setPipelineMode(fakeDb(tablesFor("classic"), real), "a1", "team", "smoke-test");
    expect(refused.ok).toBe(false);
    expect((refused as any).reason).toMatch(/only on fixture articles/);
    expect(real.updates).toEqual([]);
    expect((await setPipelineMode(fakeDb(tablesFor("classic"), newLog()), "a1", "team", "V1")).ok).toBe(false);
    const leo = newLog();
    expect((await setPipelineMode(fakeDb(tablesFor("classic", "NEEDS_WRITE"), leo), "a1", "team", "leo")).ok).toBe(true);
    expect(leo.updates).toContain("articles");
    expect((await setPipelineMode(fakeDb(tablesFor("classic", "NEEDS_WRITE", true), newLog()), "a1", "team", "smoke-test")).ok).toBe(true);
  });
});

describe("smoke scripts flag their fixture articles", () => {
  it("every script that creates an article with approveBrief and acts as smoke-test marks it is_fixture right after", () => {
    const scripts = readdirSync("scripts").filter((f) => f.endsWith(".mts")).map((f) => `scripts/${f}`);
    const makers = scripts.filter((f) => { const t = readFileSync(f, "utf8"); return /approveBrief\(/.test(t) && /"smoke-test"/.test(t); });
    expect(makers.sort()).toEqual(["scripts/studio-smoke.mts", "scripts/team-cli-smoke.mts", "scripts/team-view-smoke.mts"]);
    for (const f of makers) {
      const t = readFileSync(f, "utf8");
      expect(t, f).toMatch(/update\(\{ is_fixture: true \}\)/);
      expect(t.indexOf("is_fixture: true"), f).toBeLessThan(t.indexOf('"smoke-test")', t.indexOf("is_fixture: true")));   // the flag is set before the first fixture-actor call that needs it
    }
  });
  it("the migration adds is_fixture as false by default, so every existing article is a real one", () => {
    expect(readFileSync("supabase/migrations/0018_article_is_fixture.sql", "utf8")).toMatch(/is_fixture boolean not null default false/);
  });
});

describe("the only call sites are Leo's: the UI action and the operator CLI", () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === "node_modules" || f === ".next" ? [] : walk(p)) : [p]; });
  const files = [...walk("src"), ...walk("scripts")].filter((f) => /\.(ts|tsx|mts)$/.test(f)).map((f) => f.replace(/\\/g, "/"));
  const callers = files.filter((f) => !f.endsWith(".test.ts") && f !== "src/lib/studio/service.ts" && /resolveSection\s*\(/.test(readFileSync(f, "utf8")));
  it("resolveSection( is called only from the Studio UI action, the CLI and the fixture-only smoke scripts", () => {
    expect(callers.sort()).toEqual(["scripts/studio-smoke.mts", "scripts/studio.mts", "src/app/studio/actions.ts"]);
  });
  it("the UI action and the CLI both act as leo; the smoke acts as smoke-test (on its fixture article only)", () => {
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
