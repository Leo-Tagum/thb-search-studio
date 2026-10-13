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
  article_id: "", opportunity_id: "o1", agent_name: "Content Architect", agent_prompt_version: "1.1.0", model_version: "claude-code/test",
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
  it("rejects East Oakland roots and every still-pending Brand Fact in a brief", () => {
    for (const bad of [
      "Juan's East Oakland roots",
      "We are open 24/7", "We close in 7 days", "A family-owned company", "Our licensed contractor team", "Powered by Equity Track Inc",
      "We have saved sellers $32M in fees", "100% on time closings",
    ]) {
      const errs = check(brief({ answer_first: `A direct answer: ${bad}` }));
      expect(errs.join(" "), bad).toMatch(/PENDING JUAN/);
    }
  });
  it("experience years: 25+ in the experience sense and the 2002 fact are approved; exact counts and other wordings are blocked", () => {
    const ok = [
      "Juan Diaz has 25+ years of experience in Bay Area real estate and has been investing since 2002.",
      "Juan brings 25+ years of experience in Bay Area real estate.",
      "Juan Diaz has been investing in Bay Area real estate since 2002.",
    ];
    for (const t of ok) expect(check(brief({ answer_first: `A direct answer: ${t}` })), t).toEqual([]);
    for (const bad of ["With 27 years of experience we know", "24 years of experience", "Over 25 years serving the Bay Area", "20+ years of experience", "25+ years in business", "more than 40 years in Bay Area real estate", "25 years of experience"]) {
      expect(check(brief({ answer_first: `A direct answer: ${bad}` })).join(" "), bad).toMatch(/experience years not allowed/);
    }
  });
  it("rating rule also catches percentage / excellent-rating claims", () => {
    for (const bad of ["92% excellent rating", "Rated excellent on Google", "98% positive reviews", "an excellent rating", "rating of 4.9"]) {
      expect(check(brief({ answer_first: `A direct answer: ${bad}` })).join(" "), bad).toMatch(/rating rule/);
    }
    expect(check(brief({ answer_first: "A direct answer: Sellers keep 100% of the proceeds after the agreed fees" })).join(" ")).not.toMatch(/rating rule/);
  });
  it("lets APPROVED facts through: name, 1,000+ homes, phones, website, address", () => {
    const ok = "Twin Home Buyer has purchased 1,000+ homes. Call (415) 415-8946 or (415) 415-TWIN, https://www.twinhomebuyer.com, 170 Glenn Way Ste 5, San Carlos, CA 94070.";
    expect(check(brief({ answer_first: `A direct answer: ${ok}` }))).toEqual([]);
  });
  it("SOURCED facts need their exact wording; 2002 is never the company founding year", () => {
    const exact = "Juan Diaz has been investing in Bay Area real estate since 2002";
    expect(check(brief({ answer_first: `A direct answer: ${exact}.` }))).toEqual([]);
    expect(check(brief({ answer_first: "A direct answer: Juan has invested in Bay Area real estate since 2002." })).join(" ")).toMatch(/exact wording/);
    expect(check(brief({ answer_first: "A direct answer: with more than 20 years of experience" })).join(" ")).toMatch(/experience years not allowed|exact wording/);
    expect(check(brief({ answer_first: `A direct answer: ${exact}. Our company was founded in 2002.` })).join(" ")).toMatch(/never the company founding year/);
    expect(check(brief({ answer_first: "A direct answer: BBB Accredited since 3/1/2022" }))).toEqual([]);
    expect(check(brief({ answer_first: "A direct answer: BBB accredited since 2022" })).join(" ")).toMatch(/BBB accreditation/);
    expect(check(brief({ answer_first: "A direct answer: Twin Home Buyer Limited Liability Company, formed in 2022" }))).toEqual([]);
    expect(check(brief({ answer_first: "A direct answer: Twin Home Buyer LLC" })).join(" ")).toMatch(/legal entity/);
  });
  it("allows them only in open_items (named as pending)", () => {
    expect(check(brief({ open_items: ["Experience figure (27 years vs 25+) is PENDING JUAN"] }))).toEqual([]);
  });
  it("does not flag ordinary durations from sources", () => {
    expect(pendingJuanHits({ result: { claims: [{ text: "The seller has 30 days to comply" }] } })).toEqual([]);
  });
});

describe("human redirect limits (links and forbidden target phrases)", () => {
  const MONEY = "https://www.twinhomebuyer.com/hoarder-houses/";
  const pk = buildTaskPacket("thb-03-content-architect", { id: "o1", versionHash: "h1" }, {}, ["src:1"], {
    allowed_link_urls: [MONEY, "https://www.twinhomebuyer.com/bay-area-title-issues-and-liens/"], required_links: [MONEY], forbidden_target_phrases: ["sell hoarder house", "sell my hoarder house"],
  });
  const run = (b: Record<string, unknown>) => {
    const p = outputSchemas["thb-03-content-architect"].safeParse(out(b));
    return p.success ? semanticChecks("thb-03-content-architect", p.data as Record<string, any>, { ...ctx, packet: pk }) : p.error.issues.map((i) => i.message);
  };
  const ok = { link_plan: [{ to_url: MONEY, anchor_intent: "next step" }, { to_url: "https://www.twinhomebuyer.com/bay-area-title-issues-and-liens", anchor_intent: "liens" }] };
  it("accepts allowed links including the required money page", () => {
    expect(run(brief(ok))).toEqual([]);
  });
  it("rejects an invented URL, a missing required link, and a forbidden target phrase", () => {
    expect(run(brief({ link_plan: [{ to_url: MONEY, anchor_intent: "x" }, { to_url: "https://www.twinhomebuyer.com/made-up/", anchor_intent: "y" }] })).join(" ")).toMatch(/not one of the inventory URLs/);
    expect(run(brief({ link_plan: [] })).join(" ")).toMatch(/must include the required link/);
    expect(run(brief({ ...ok, working_title: "How to Sell My Hoarder House" })).join(" ")).toMatch(/forbidden phrase "sell my hoarder house"/);
    expect(run(brief({ ...ok, outline: [{ h2: "Can you sell hoarder house contents?", purpose: "x", claim_ids: [] }] })).join(" ")).toMatch(/forbidden phrase "sell hoarder house"/);
  });
});

describe("permanent rating rule: never a rating or review count in text", () => {
  it("rejects stars, X/5 scores and review counts anywhere, even in open_items", () => {
    for (const bad of ["Rated 4.8/5 from 115 reviews", "Our 5-star rating", "five-star service", "Over 200 reviews say", "4.9 out of 5", "115 Google reviews"]) {
      expect(check(brief({ answer_first: `A direct answer: ${bad}` })).join(" "), bad).toMatch(/permanent rating rule/);
    }
    expect(check(brief({ open_items: ["Do not quote 4.8/5 here"] })).join(" ")).toMatch(/permanent rating rule/);
  });
  it("allows plain mentions of reviews or ratings without a figure, and ordinary numbers", () => {
    expect(check(brief({ open_items: ["The site's rating badge is a live Google widget; no rating is written in text."], answer_first: "A direct answer: read reviews on the reviews page and take 5 minutes to check title." }))).toEqual([]);
  });
});
