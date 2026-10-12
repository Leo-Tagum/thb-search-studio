import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STUDIO_AGENT_KEYS } from "../studio/agents";
import { TEAM_AGENT_FILE } from "./bridge";
import { isPipelineMode, modeChangeRule, modeOf, pipelineGuard } from "./mode";

const TEAM_KEYS = Object.values(TEAM_AGENT_FILE);

describe("a team article refuses classic runs and the reverse", () => {
  it("every classic article agent (4-7) is refused on a team article", () => {
    for (const k of STUDIO_AGENT_KEYS) expect(pipelineGuard("team", k), k).toMatch(/team mode.*classic agent/);
  });
  it("every team role (R1-R3, S1-S2, W1-W2, V1-V3) is refused on a classic article", () => {
    expect(TEAM_KEYS).toHaveLength(10);
    for (const k of TEAM_KEYS) expect(pipelineGuard("classic", k), k).toMatch(/classic mode.*team role/);
  });
  it("each pipeline runs its own agents", () => {
    for (const k of STUDIO_AGENT_KEYS) expect(pipelineGuard("classic", k)).toBeNull();
    for (const k of TEAM_KEYS) expect(pipelineGuard("team", k)).toBeNull();
  });
  it("opportunity-level agents (1-3) are not an article pipeline matter", () => {
    for (const k of ["thb-01-seo-strategist", "thb-02-research-evidence", "thb-03-content-architect"]) {
      expect(pipelineGuard("classic", k)).toBeNull();
      expect(pipelineGuard("team", k)).toBeNull();
    }
  });
  it("an unknown agent key is not silently allowed to pretend it belongs to a pipeline", () => {
    expect(pipelineGuard("team", "thb-99-made-up")).toBeNull();      // not a pipeline agent; the bridge rejects unknown keys elsewhere
  });
});

describe("articles default to classic", () => {
  it("modeOf treats a missing or unknown value as classic", () => {
    expect(modeOf({})).toBe("classic");
    expect(modeOf({ pipeline_mode: null })).toBe("classic");
    expect(modeOf({ pipeline_mode: "classic" })).toBe("classic");
    expect(modeOf({ pipeline_mode: "team" })).toBe("team");
    expect(modeOf({ pipeline_mode: "whatever" })).toBe("classic");
  });
  it("the migration defaults pipeline_mode to classic and allows only classic or team", () => {
    const sql = readFileSync("supabase/migrations/0015_team_model.sql", "utf8");
    expect(sql).toMatch(/pipeline_mode text not null default 'classic' check \(pipeline_mode in \('classic','team'\)\)/);
    expect(isPipelineMode("classic") && isPipelineMode("team") && !isPipelineMode("both")).toBe(true);
  });
});

describe("when the mode can change", () => {
  const base = { current: "classic" as const, next: "team", isBranch: false, sectionsWritten: 0, hasProposal: false };
  it("before any section is written, either way", () => {
    expect(modeChangeRule(base)).toEqual({ ok: true, noop: false });
    expect(modeChangeRule({ ...base, current: "team" as never, next: "classic" })).toEqual({ ok: true, noop: false });
  });
  it("not once a section is written, unless the article is a team branch", () => {
    expect(modeChangeRule({ ...base, sectionsWritten: 3 })).toMatchObject({ ok: false });
    expect((modeChangeRule({ ...base, sectionsWritten: 3 }) as { reason: string }).reason).toMatch(/before any section is written, or on a team-mode branch/);
    expect(modeChangeRule({ ...base, sectionsWritten: 9, isBranch: true })).toEqual({ ok: true, noop: false });
  });
  it("never once a proposal exists, even on a branch", () => {
    expect(modeChangeRule({ ...base, hasProposal: true })).toMatchObject({ ok: false });
    expect(modeChangeRule({ ...base, hasProposal: true, isBranch: true, sectionsWritten: 5 })).toMatchObject({ ok: false });
  });
  it("choosing the current mode is a no-op, and an unknown mode is refused", () => {
    expect(modeChangeRule({ ...base, next: "classic", sectionsWritten: 9 })).toEqual({ ok: true, noop: true });
    expect(modeChangeRule({ ...base, next: "both" })).toMatchObject({ ok: false });
    expect(modeChangeRule({ ...base, next: undefined })).toMatchObject({ ok: false });
  });
});

describe("agent_runs accepts the team agent keys", () => {
  const dir = "supabase/migrations";
  const sql = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => ({ f, text: readFileSync(`${dir}/${f}`, "utf8") }));
  it("no migration puts a check or enum on agent_runs.agent_key (it is free text, so R1-R3, S1-S2, W1-W2 and V1-V3 can be stored)", () => {
    const create = sql.find((m) => /create table agent_runs/.test(m.text))!;
    const def = create.text.slice(create.text.indexOf("create table agent_runs"), create.text.indexOf(");", create.text.indexOf("create table agent_runs")));
    expect(def).toMatch(/agent_key text not null,/);
    expect(def).not.toMatch(/agent_key[^,\n]*check/i);
    for (const m of sql) {
      const stmts = m.text.split(";").filter((s) => /agent_runs/i.test(s) && /alter table|constraint|check/i.test(s));
      for (const s of stmts) expect(s, `${m.f}: ${s.trim().slice(0, 80)}`).not.toMatch(/agent_key[^;]*(check|in \()|check[^;]*agent_key/i);
    }
  });
  it("the team keys are distinct from the classic ones, so a key identifies one pipeline", () => {
    expect(new Set([...TEAM_KEYS, ...STUDIO_AGENT_KEYS]).size).toBe(TEAM_KEYS.length + STUDIO_AGENT_KEYS.length);
  });
});
