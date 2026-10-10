/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { outputSchemas } from "./schemas";
import { buildTaskPacket, pendingJuanHits, semanticChecks } from "./bridge";

const packet = buildTaskPacket("thb-03-content-architect", { id: "o1", versionHash: "h1" }, {}, ["src:1"]);
const ctx = { packet, agent2Claims: [{ id: "clm:1", support: "supported" }, { id: "clm:2", support: "unsupported" }] };
const rows = ["ownership", "authority", "condition", "people", "money", "timing", "risk"].map((row) => ({ row, status: "answered", answer: `answer for ${row}`, basis: "seller_problem_logic", claim_ids: [] as string[] }));

const brief = (over: Record<string, unknown> = {}) => ({
  seller_situation_map: rows,
  honest_options: [
    { option: "keep_it", when_it_fits: "when the seller is not under time pressure", claim_ids: [] },
    { option: "fix_it", when_it_fits: "when there is budget and time to clean out", claim_ids: [] },
    { option: "sell_directly", when_it_fits: "when speed and certainty matter most", claim_ids: [] },
  ],
  real_world_warnings: [{ warning: "Unpermitted or unsafe conditions can stall escrow", claim_ids: [] }],
  professional_confirmation: ["Confirm legal points with a real estate attorney"],
  working_title: "t", target_reader: "r", answer_first: "A direct answer capsule plan here.",
  outline: [{ h2: "Can I sell a hoarder house as is?", purpose: "answer plainly", claim_ids: ["clm:1"] }],
  fan_out: [], visuals: [], link_plan: [], cta: "Understand the house first", open_items: [],
  ...over,
});
const out = (b: Record<string, unknown>) => ({
  article_id: "", opportunity_id: "o1", agent_name: "Content Architect", agent_prompt_version: "1.0.0", model_version: "claude-code/test",
  input_version_ids: ["h1"], decision: "PASS", findings: [], evidence_ids: [], required_actions: [], output_version_id: "v1", timestamp: "2026-10-10T12:00:00Z",
  result: { brief: b },
});
const check = (b: Record<string, unknown>) => {
  const parsed = outputSchemas["thb-03-content-architect"].safeParse(out(b));
  return parsed.success ? semanticChecks("thb-03-content-architect", parsed.data as Record<string, any>, ctx) : parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message);
};

describe("Agent 3: editorial standards", () => {
  it("accepts a brief with the full Seller Situation Map, honest options and a warning", () => {
    expect(check(brief())).toEqual([]);
  });
  it("rejects a Seller Situation Map with a missing row", () => {
    expect(check(brief({ seller_situation_map: rows.slice(0, 6) })).length).toBeGreaterThan(0);
  });
  it("rejects a duplicate row that leaves another row unanswered", () => {
    const dup = [...rows.slice(0, 6), { ...rows[0] }];
    expect(check(brief({ seller_situation_map: dup })).join(" ")).toMatch(/missing the risk row/);
  });
  it("requires at least one real-world warning and at least three honest options", () => {
    expect(check(brief({ real_world_warnings: [] })).length).toBeGreaterThan(0);
    expect(check(brief({ honest_options: brief().honest_options.slice(0, 2) })).length).toBeGreaterThan(0);
  });
  it("a row that says basis=claim must cite a claim", () => {
    const bad = rows.map((r) => (r.row === "money" ? { ...r, basis: "claim" } : r));
    expect(check(brief({ seller_situation_map: bad })).join(" ")).toMatch(/money.*cites no claim_ids/);
  });
  it("a figure in an outline section needs a supported claim", () => {
    expect(check(brief({ outline: [{ h2: "You have 30 days to respond", purpose: "x", claim_ids: [] }] })).join(" ")).toMatch(/figure or date/);
    expect(check(brief({ outline: [{ h2: "Q?", purpose: "x", claim_ids: ["clm:2"] }] })).join(" ")).toMatch(/unsupported/);
  });
});

describe("PENDING JUAN facts stay blocked", () => {
  it("rejects an experience figure, '1,000+ homes' and 'East Oakland roots' in a brief", () => {
    for (const bad of ["With 27 years of experience we know...", "Over 25 years serving the Bay Area", "We have bought 1,000+ homes", "Juan's East Oakland roots"]) {
      const errs = check(brief({ answer_first: `A direct answer: ${bad}` }));
      expect(errs.join(" ")).toMatch(/PENDING JUAN/);
    }
  });
  it("allows them only in open_items (named as pending)", () => {
    expect(check(brief({ open_items: ["Experience figure (27 years vs 25+) is PENDING JUAN"] }))).toEqual([]);
  });
  it("does not flag ordinary durations from sources", () => {
    expect(pendingJuanHits({ result: { claims: [{ text: "The seller has 30 days to comply" }] } })).toEqual([]);
  });
});
