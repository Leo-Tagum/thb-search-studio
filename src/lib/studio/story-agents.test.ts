import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { v1StoryCheckErrors, v1StoryCheckOutput } from "./story-agents";
import { storyFindings } from "./story-cards";
import { STORY_FIXTURES } from "./story-fixtures";
import { teamSchemaKey } from "../team/bridge";
import { V1_PROMPT_VERSION } from "./agents";

// Stage 6 part B: V1's story check shape and the code's refusal of a PASS the checks do not support. FAKE stories only.
const out = (checks: object[], decision = "PASS") => ({ article_id: "a1", opportunity_id: "o1", agent_name: "V1", agent_prompt_version: V1_PROMPT_VERSION, model_version: "claude-code/test", input_version_ids: ["h"], decision, findings: [], evidence_ids: [], required_actions: [], output_version_id: "v", timestamp: "2026-10-14T12:00:00Z", result: { story_checks: checks } });
const ok = (id: string) => ({ story_id: id, verdict: "PASS", rules_broken: [], note: "Rests on the verified facts." });
const bad = (id: string, verdict = "BLOCKED") => ({ story_id: id, verdict, rules_broken: [{ rule: "SR-18", what: "\"1428 Elm Street\" is an address" }], note: "An address appears in the text." });
const expectFor = (ids: string[]) => new Map(ids.map((id) => [id, storyFindings(STORY_FIXTURES.find((f) => f.id === id)!.card, STORY_FIXTURES.find((f) => f.id === id)!.text)]));

describe("V1's story check", () => {
  it("has its own schema key, picked from story_checks, and is strict", () => {
    expect(teamSchemaKey("V1", out([ok("FAKE-01")]))).toBe("V1_STORY");
    expect(v1StoryCheckOutput.safeParse(out([ok("FAKE-01")])).success).toBe(true);
    expect(v1StoryCheckOutput.safeParse({ ...out([ok("FAKE-01")]), approved: true }).success).toBe(false);
    expect(v1StoryCheckOutput.safeParse(out([{ ...ok("FAKE-01"), set_gate: "green" }])).success).toBe(false);          // V1 cannot set a gate
    expect(v1StoryCheckOutput.safeParse(out([{ ...bad("FAKE-02"), verdict: "APPROVED" }])).success).toBe(false);
  });
  it("accepts V1 agreeing with the checks, and V1 being stricter than the checks", () => {
    expect(v1StoryCheckErrors(v1StoryCheckOutput.parse(out([ok("FAKE-01"), bad("FAKE-02", "BLOCKED")], "BLOCKED")), expectFor(["FAKE-01", "FAKE-02"]), V1_PROMPT_VERSION)).toEqual([]);
    expect(v1StoryCheckErrors(v1StoryCheckOutput.parse(out([bad("FAKE-01")], "BLOCKED")), expectFor(["FAKE-01"]), V1_PROMPT_VERSION)).toEqual([]);     // stricter: allowed
  });
  it("refuses a PASS for a story the checks refuse, a missing or unknown story, and a decision that disagrees with the verdicts", () => {
    expect(v1StoryCheckErrors(v1StoryCheckOutput.parse(out([ok("FAKE-02")])), expectFor(["FAKE-02"]), V1_PROMPT_VERSION).join()).toContain("cannot pass a story the checks refuse");
    expect(v1StoryCheckErrors(v1StoryCheckOutput.parse(out([ok("FAKE-01")])), expectFor(["FAKE-01", "FAKE-09"]), V1_PROMPT_VERSION).join()).toContain("FAKE-09: V1 must check every story");
    expect(v1StoryCheckErrors(v1StoryCheckOutput.parse(out([ok("FAKE-01"), ok("FAKE-77")])), expectFor(["FAKE-01"]), V1_PROMPT_VERSION).join()).toContain("not in the packet");
    expect(v1StoryCheckErrors(v1StoryCheckOutput.parse(out([ok("FAKE-01")], "BLOCKED")), expectFor(["FAKE-01"]), V1_PROMPT_VERSION).join()).toContain("every story passes");
    expect(v1StoryCheckErrors(v1StoryCheckOutput.parse(out([bad("FAKE-02")], "PASS")), expectFor(["FAKE-02"]), V1_PROMPT_VERSION).join()).toContain("decision PASS needs every story to PASS");
    expect(v1StoryCheckErrors(v1StoryCheckOutput.parse(out([{ story_id: "FAKE-02", verdict: "BLOCKED", rules_broken: [], note: "Something is wrong." }], "BLOCKED")), expectFor(["FAKE-02"]), V1_PROMPT_VERSION).join()).toContain("names the rule broken");
    expect(v1StoryCheckErrors(v1StoryCheckOutput.parse({ ...out([ok("FAKE-01")]), agent_prompt_version: "1.0.0" }), expectFor(["FAKE-01"]), V1_PROMPT_VERSION).join()).toContain("agent_prompt_version");
  });
  it("the V1 prompt carries the story check, the rules it applies and the fact that V1 never sets a gate", () => {
    const t = readFileSync(".claude/agents/thb-v1-fact-privacy.md", "utf8").replace(/\r\n/g, "\n");
    for (const s of ["Story check (added at prompt_version 1.7.0)", "SR-18 to SR-20", "you never set or change a gate", "Juan-approved process wording (none exists yet)", "word for word one of the card's permitted quotes", "region-level location only"]) expect(t, s).toContain(s);
  });
});
