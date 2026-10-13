/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { outputSchemas } from "./schemas";
import { buildTaskPacket, semanticChecks } from "./bridge";

const packet = buildTaskPacket("thb-02-research-evidence", { id: "o1", versionHash: "h1" }, {}, "agent-defined");
const src = (over: Record<string, unknown> = {}) => ({ id: "src:1", kind: "official_url", url: "https://www.dre.ca.gov/x", title: "DRE", tier: 2, jurisdiction: "California", effective_date: null, retrieved_date: "2026-10-10", locality_matches: true, ...over });
const clm = (over: Record<string, unknown> = {}) => ({ id: "clm:1", text: "A seller must deliver a disclosure.", source_ids: ["src:1"], support: "supported", jurisdiction: "California", risk: "medium", ...over });
const out = (result: Record<string, unknown>, decision = "PASS") => ({
  article_id: "", opportunity_id: "o1", agent_name: "Research & Evidence", agent_prompt_version: "1.5.0", model_version: "claude-code/test", input_version_ids: ["h1"],
  decision, findings: [], evidence_ids: ["src:1"], required_actions: [], output_version_id: "v1", timestamp: "2026-10-10T12:00:00Z",
  result: { sources: [src()], claims: [clm()], brand_facts_pending: [], first_party_proof: "restricted", unresolved: [], ...result },
});
const check = (o: ReturnType<typeof out>) => {
  const p = outputSchemas["thb-02-research-evidence"].safeParse(o);
  return p.success ? semanticChecks("thb-02-research-evidence", p.data as Record<string, any>, { packet }) : p.error.issues.map((i) => i.path.join(".") + ": " + i.message);
};

describe("Agent 2 evidence rules (blueprint §14 rows 5, 8, 9)", () => {
  it("accepts an official, locality-matched, supported claim", () => {
    expect(check(out({}))).toEqual([]);
  });
  it("row 9: a competitor blog offered as a citation is rejected", () => {
    expect(check(out({ sources: [src({ url: "https://www.opendoor.com/blog/x" })] })).join(" ")).toMatch(/not on the official-source allowlist/);
  });
  it("our own site is rejected as a research source", () => {
    expect(check(out({ sources: [src({ url: "https://www.twinhomebuyer.com/hoarder-houses/" })] })).join(" ")).toMatch(/twinhomebuyer\.com/);
  });
  it("row 5: a source for a different jurisdiction cannot support a claim", () => {
    expect(check(out({ sources: [src({ locality_matches: false, jurisdiction: "Texas" })] })).join(" ")).toMatch(/locality does not match/);
  });
  it("a supported claim without sources is rejected", () => {
    expect(check(out({ claims: [clm({ source_ids: [] })] })).join(" ")).toMatch(/supported without source_ids/);
  });
  it("PASS is not allowed while a high-risk claim is unsupported (BLOCKED_CLAIM stance)", () => {
    expect(check(out({ claims: [clm({ support: "unsupported", source_ids: [], risk: "high" })] })).join(" ")).toMatch(/PASS is not allowed/);
    expect(check(out({ claims: [clm({ support: "unsupported", source_ids: [], risk: "high" })] }, "REVISION"))).toEqual([]);
  });
  it("seller material is never part of an Agent 2 packet (first-party proof stays restricted)", () => {
    expect(JSON.stringify(packet)).not.toMatch(/seller_brief_passages/);
  });
});

describe("Agent 2 Evidence Library citations are checked against the stored text", () => {
  const lib = new Map([["p1", { source_id: "L1", text: "1102. (c) Any waiver of the requirements of this article is void as against public policy." }]]);
  const libSrc = { id: "src:1", kind: "library", library_source_id: "L1", url: undefined, title: "Civil Code 1102", tier: 1, jurisdiction: "California", effective_date: null, retrieved_date: "2026-10-10", locality_matches: true };
  const run = (claim: Record<string, unknown>) => {
    const o = out({ sources: [libSrc], claims: [clm(claim)] });
    const p = outputSchemas["thb-02-research-evidence"].safeParse(o);
    return p.success ? semanticChecks("thb-02-research-evidence", p.data as Record<string, any>, { packet, libraryPassages: lib }) : p.error.issues.map((i) => i.message);
  };
  it("accepts a verbatim quote from the cited passage", () => {
    expect(run({ passage_ids: ["p1"], quote: "Any waiver of the requirements of this article is void as against public policy." })).toEqual([]);
  });
  it("rejects an invented quote, a missing quote, an unknown passage and a passage from another source", () => {
    expect(run({ passage_ids: ["p1"], quote: "The seller must always give a 30 day notice." }).join(" ")).toMatch(/not appear verbatim/);
    expect(run({}).join(" ")).toMatch(/passage_ids and a short verbatim quote/);
    expect(run({ passage_ids: ["nope"], quote: "x" }).join(" ")).toMatch(/unknown passage/);
    const other = new Map([["p1", { source_id: "L2", text: "a" }]]);
    const o = out({ sources: [libSrc], claims: [clm({ passage_ids: ["p1"], quote: "a" })] });
    const p = outputSchemas["thb-02-research-evidence"].safeParse(o);
    expect(p.success && semanticChecks("thb-02-research-evidence", p.data as Record<string, any>, { packet, libraryPassages: other }).join(" ")).toMatch(/does not belong/);
  });
});
