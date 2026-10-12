import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Phase 3c task 5 (as Phase 2 task 9): the team role files exist, carry a version and their Prohibited action, and have the specified tools.
const dir = ".claude/agents";
const toolsOf = (text: string) => text.split(/\r?\n/).find((l) => l.startsWith("tools:"));

const RESEARCH: Record<string, { tools: string; prohibited: string }> = {
  "thb-r1-legal-official": { tools: "tools: Read, Write, WebFetch", prohibited: "Treating internal access as consent" },
  "thb-r2-search": { tools: "tools: Read, Write", prohibited: "Treating internal access as consent" },
  "thb-r3-experience": { tools: "tools: Read, Write", prohibited: "Treating internal access as consent" },
};

describe("Research team files (R1, R2, R3)", () => {
  for (const [k, spec] of Object.entries(RESEARCH)) {
    const text = readFileSync(join(dir, `${k}.md`), "utf8");
    it(`${k}: exists, versioned 1.0.0, quotes its Prohibited action, has the specified tools`, () => {
      expect(text).toMatch(/^name: /m);
      expect(text).toMatch(/prompt_version: 1\.0\.0/);
      expect(text).toContain(`**Prohibited action: ${spec.prohibited}.**`);
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
