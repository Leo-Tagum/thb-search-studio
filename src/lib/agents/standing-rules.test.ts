import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENT_META } from "./schemas";
import { STANDING_RULES_FILE, STANDING_RULES_VERSION } from "./standing-rules";
import { STUDIO_AGENT_META, V1_PROMPT_VERSION } from "../studio/agents";
import { TEAM_AGENT_FILE, TEAM_PROMPT_VERSIONS } from "../team/bridge";

// The code check Leo asked for (Phase 3e stage 4): every agent prompt loads the standing rules at their CURRENT version, and carries the version the code expects.
const dir = join(process.cwd(), ".claude", "agents");
const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
const text = (f: string) => readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n");
const rules = readFileSync(join(process.cwd(), STANDING_RULES_FILE), "utf8").replace(/\r\n/g, "\n");

// file -> the prompt version the code requires of that agent
const expected: Record<string, string> = {};
for (const [k, m] of Object.entries(AGENT_META)) expected[k] = m.promptVersion;
for (const [k, m] of Object.entries(STUDIO_AGENT_META)) expected[k] = m.promptVersion;
for (const [role, file] of Object.entries(TEAM_AGENT_FILE)) expected[file] = (TEAM_PROMPT_VERSIONS as Record<string, string>)[role];
expected["thb-v1-fact-privacy"] = V1_PROMPT_VERSION;

describe("the standing rules file", () => {
  it("exists, has an owner, a version equal to the code constant, and every rule has a source and a date", () => {
    expect(existsSync(join(process.cwd(), STANDING_RULES_FILE))).toBe(true);
    expect(rules).toMatch(/^owner: Leo$/m);
    expect(rules).toMatch(new RegExp(`^standing-rules-version: ${STANDING_RULES_VERSION.replace(/\./g, "\\.")}$`, "m"));
    const ids = [...rules.matchAll(/^\*\*(SR-\d+)\./gm)].map((m) => m[1]);
    expect(ids).toEqual(Array.from({ length: ids.length }, (_, i) => `SR-${i + 1}`));      // numbered without gaps
    for (const id of ids) {
      const para = rules.slice(rules.indexOf(`**${id}.`)).split(/\n\n/)[0];
      expect(para, id).toMatch(/Source: .+\. Date: \d{4}-\d{2}-\d{2}/);
    }
  });
  it("covers the rules Leo listed", () => {
    for (const re of [/Bay Area/, /separate layers/i, /no guessing/i, /Thresholds, conditions and deciders/, /absence-of-law/i, /service-area claims/i, /Privacy/, /Juan approves/, /published automatically/]) expect(rules).toMatch(re);
  });
});

describe("every agent prompt loads the current standing rules and carries the version the code expects", () => {
  it("there is a prompt for every agent the code knows, and no prompt the code does not know", () => {
    expect(files.map((f) => f.replace(/\.md$/, "")).sort()).toEqual(Object.keys(expected).sort());
  });
  for (const f of files) {
    const key = f.replace(/\.md$/, "");
    it(`${f}: standing_rules_version ${STANDING_RULES_VERSION}, prompt_version ${expected[key]} (as the code requires)`, () => {
      const t = text(f);
      expect(t).toMatch(new RegExp(`^standing_rules_version: ${STANDING_RULES_VERSION.replace(/\./g, "\\.")}$`, "m"));
      expect(t).toContain(STANDING_RULES_FILE);
      expect(t).toContain(`standing-rules version ${STANDING_RULES_VERSION}`);
      expect(t).toMatch(new RegExp(`^prompt_version: ${expected[key].replace(/\./g, "\\.")}$`, "m"));
      for (const m of t.matchAll(/"agent_prompt_version": "([^"]+)"/g)) expect(m[1], `${f} output example`).toBe(expected[key]);
    });
    it(`${f}: every standing rule it cites exists`, () => {
      for (const m of text(f).matchAll(/\bSR-(\d+)\b/g)) expect(rules, `${f} cites SR-${m[1]}`).toContain(`**SR-${m[1]}.`);
    });
  }
  it("a standing-rules change that is not carried everywhere would fail: the check reads the constant, the file and all prompts", () => {
    expect(files.length).toBe(17);
  });
});

describe("the operator (Claude Code) follows the standing rules too", () => {
  it("CLAUDE.md tells the operator to follow the standing rules file", () => {
    const claude = readFileSync(join(process.cwd(), "CLAUDE.md"), "utf8");
    expect(claude).toContain(STANDING_RULES_FILE);
    expect(claude).toMatch(/follow/i);
  });
});
