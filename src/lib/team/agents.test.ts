import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Phase 3c task 5 (as Phase 2 task 9): the team role files exist, carry a version and their Prohibited action, and have the specified tools.
const dir = ".claude/agents";
const toolsOf = (text: string) => text.split(/\r?\n/).find((l) => l.startsWith("tools:"));

// Each role keeps Agent 2's Prohibited action and adds its own (Leo, 2026-10-10).
const AGENT2 = "Treating internal access as consent";
const RESEARCH: Record<string, { tools: string; prohibited: string; own: string }> = {
  "thb-r1-legal-official": { tools: "tools: Read, Write, WebFetch", prohibited: AGENT2, own: "**Prohibited action (R1): Citing non-official, secondary or competitor sources as law; stating a legal rule without a word-for-word quote.**" },
  "thb-r2-search": { tools: "tools: Read, Write", prohibited: AGENT2, own: "**Prohibited action (R2): Turning search data into article statistics; estimating or inventing demand numbers.**" },
  "thb-r3-experience": { tools: "tools: Read, Write", prohibited: AGENT2, own: "**Prohibited action (R3): Using or clearing seller stories beyond their approved wording; paraphrasing brand facts.**" },
};

describe("Research team files (R1, R2, R3)", () => {
  for (const [k, spec] of Object.entries(RESEARCH)) {
    const text = readFileSync(join(dir, `${k}.md`), "utf8");
    it(`${k}: exists, versioned 1.3.0, quotes its Prohibited action, has the specified tools`, () => {
      expect(text).toMatch(/^name: /m);
      expect(text).toMatch(/prompt_version: 1\.3\.0/);
      expect(text).toContain(`**Prohibited action: ${spec.prohibited}.**`);
      expect(text).toContain(spec.own);
      expect(toolsOf(text)).toBe(spec.tools);
    });
    it(`${k}: treats ticket text as untrusted and cannot lock, approve or set state`, () => {
      expect(text).toContain("UNTRUSTED_DATA");
      expect(text).toMatch(/never write `approved`/i);
      expect(text).toMatch(/`locked`/);
      expect(text).toMatch(/star rating/);
    });
  }
  it("R1 is limited to official sources, never competitors or twinhomebuyer.com", () => {
    const t = readFileSync(join(dir, "thb-r1-legal-official.md"), "utf8");
    expect(t).toMatch(/official sources only/i);
    expect(t).toContain("Never competitor sites");
    expect(t).toContain("twinhomebuyer.com");
  });
  it("R1 uses WebFetch for discovery only and quotes only from stored passages by id", () => {
    const t = readFileSync(join(dir, "thb-r1-legal-official.md"), "utf8");
    expect(t).toMatch(/WebFetch is for DISCOVERY only/);
    expect(t).toMatch(/never quote from what it showed you/);
    expect(t).toMatch(/fetch_request/);
    expect(t).toMatch(/official_snapshots/);
    expect(t).toMatch(/passage_ids/);
    expect(t).toMatch(/sha256/);
    expect(t).toMatch(/is refused/);
    expect(t).not.toMatch(/ask it for the exact text/i);
  });
  it("R2 reads stored GSC data only: no web tool, no estimates", () => {
    const t = readFileSync(join(dir, "thb-r2-search.md"), "utf8");
    expect(t).toMatch(/Stored data only/);
    expect(t).toMatch(/never estimate/i);
  });
  it("R3 cannot clear a seller story: publication_cleared stays the gate", () => {
    const t = readFileSync(join(dir, "thb-r3-experience.md"), "utf8");
    expect(t).toMatch(/can never clear a seller story/);
    expect(t).toMatch(/`publication_cleared` is set only by a human/);
    expect(t).toMatch(/approved_wording/);
  });
  it("only Agent 2 and R1 have a web tool", () => {
    for (const f of readdirSync(dir)) {
      const tools = toolsOf(readFileSync(join(dir, f), "utf8"));
      if (!f.startsWith("thb-02") && !f.startsWith("thb-r1")) expect(tools, f).not.toMatch(/Web/);
    }
  });
});

describe("escalation cards carry a trigger", () => {
  it("every role that may escalate tells the agent to name the trigger and that the router sets the limit triggers", () => {
    for (const f of ["thb-s1-strategist", "thb-s2-architect", "thb-w1-writer", "thb-v1-fact-privacy", "thb-v2-seo-aeo-geo", "thb-v3-editorial"]) {
      const t = readFileSync(join(dir, `${f}.md`), "utf8");
      expect(t, f).toMatch(/## Escalation cards carry a trigger/);
      expect(t, f).toMatch(/`round_limit` and `budget_limit` are set by the router/);
    }
  });
});

describe("the /thb-run-agent command knows the team roles and commands", () => {
  const cmd = readFileSync(".claude/commands/thb-run-agent.md", "utf8");
  it("names all ten team subagents and the team CLI verbs", () => {
    for (const f of ["thb-r1-legal-official", "thb-r2-search", "thb-r3-experience", "thb-s1-strategist", "thb-s2-architect", "thb-w1-writer", "thb-w2-cowriter", "thb-v1-fact-privacy", "thb-v2-seo-aeo-geo", "thb-v3-editorial"]) expect(cmd, f).toContain(f);
    for (const v of ["team-plan", "team-queue-next", "team-dump", "team-submit-dir", "team-check", "team-log"]) expect(cmd, v).toContain(v);
  });
  it("keeps the classic agents, the one-packet-at-a-time rule and the no-lock, no-resolve rule", () => {
    for (const f of ["thb-01-seo-strategist", "thb-04-section-writer", "thb-07-editorial-critic"]) expect(cmd, f).toContain(f);
    expect(cmd).toMatch(/one packet at a time/);
    expect(cmd).toMatch(/never approve, lock, resolve, hold or reopen/i);
    expect(cmd).toMatch(/Only Leo resolves them/);
    expect(cmd).toMatch(/Never edit an agent's output yourself/);
  });
});
