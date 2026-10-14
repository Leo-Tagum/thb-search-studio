/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { buildTaskPacket, semanticChecks } from "./bridge";
import { outputSchemas } from "./schemas";
import { legalLibraryErrors, legalStaticErrors, type LegalClaim, type LegalSource } from "./legal-checks";

// Phase 3e stage 2: the submit checks for legal claims, built from the real misses of the hoarder guide (public statute text from the official prints).
const Q12 = "(12) Infestation of insects, vermin, or rodents as determined by a health officer or, if an agreement does not exist with an agency that has a health officer, the infestation can be determined by a code enforcement officer, as defined in Section 829.5 of the Penal Code, upon successful completion of a course of study in the appropriate subject matter as determined by the local jurisdiction.";
const Q8 = "in which there exists any of the following listed conditions to an extent that endangers the life, limb, health, property, safety, or welfare of the occupants of the building, nearby residents, or the public shall be deemed and hereby is declared to be a substandard building";
const THRESHOLD = "to an extent that endangers the life, limb, health, property, safety, or welfare of the occupants of the building, nearby residents, or the public";
const lib: LegalSource = { id: "src:1", kind: "library", library_source_id: "L1" };
const web: LegalSource = { id: "src:2", kind: "official_url" };
const full = (over: Partial<LegalClaim> = {}): LegalClaim => ({
  id: "clm:2", support: "supported", risk: "high", source_ids: ["src:1"], passage_ids: ["p1"], quote: Q12, section: "H&S 17920.3(a)(12)",
  verification: { label: "MATCH", against: "authenticated leginfo print stored 2026-10-10", reader_impact: "none" },
  gates: [{ kind: "alternative_decider", text: "code enforcement officer", stated_in_claim: true }], ...over,
});
const clm8 = (over: Partial<LegalClaim> = {}): LegalClaim => ({ id: "clm:8", support: "supported", risk: "high", source_ids: ["src:1"], passage_ids: ["p1"], quote: Q8, section: "H&S 17920.3, opening paragraph", verification: { label: "MATCH", against: "print", reader_impact: "none" }, gates: [], ...over });
const errs = (claims: LegalClaim[], sources: LegalSource[] = [lib]) => legalStaticErrors(claims, sources).join(" | ");

describe("a supported high-risk legal claim needs its whole verification record", () => {
  it("a complete record is accepted", () => expect(legalStaticErrors([full()], [lib])).toEqual([]));
  it("no quote, no section, no verification, no gates list: each is refused, and the message says to ask Leo when the text is missing", () => {
    expect(errs([full({ quote: "" })])).toMatch(/full exact official quote.*ask Leo/);
    expect(errs([full({ quote: undefined })])).toMatch(/full exact official quote/);
    expect(errs([full({ section: " " })])).toMatch(/section and subsection/);
    expect(errs([full({ verification: undefined })])).toMatch(/needs its verification/);
    expect(errs([full({ gates: undefined })])).toMatch(/needs a gates list/);
    expect(errs([full({ verification: { label: "MATCH", against: "", reader_impact: "none" } })])).toMatch(/"against"/);
  });
  it("a claim that is not supported, or is not high-risk, needs none of it", () => {
    expect(legalStaticErrors([{ id: "clm:9", support: "unsupported", risk: "high", source_ids: [] }], [lib])).toEqual([]);
    expect(legalStaticErrors([{ id: "clm:9", support: "supported", risk: "medium", source_ids: ["src:2"] }], [web])).toEqual([]);
  });
  it("the quote may be up to 1200 characters, not more (the old limit was 400)", () => {
    expect(legalStaticErrors([full({ quote: "x".repeat(1200) })], [lib])).toEqual([]);
    expect(errs([full({ quote: "x".repeat(1201) })])).toMatch(/longer than 1200/);
  });
});

describe("an absence-of-law claim (statute_absence) carries the proof of the search", () => {
  const absence = (reason?: string) => full({ id: "clm:20", claim_type: "statute_absence", quote: "17920.3. Any building or portion thereof ... shall be deemed and hereby is declared to be a substandard building:", section: "H&S 17920.3 (full text)", verification: { label: "MATCH", against: "authenticated leginfo print stored 2026-10-10", reader_impact: "none", reason } });
  it("needs a recorded reason: which official text was read in full, when, and that the term does not appear", () => {
    expect(errs([absence(undefined)])).toMatch(/needs in verification\.reason the search done/);
    expect(errs([absence("read it")])).toMatch(/needs in verification\.reason the search done/);
    expect(legalStaticErrors([absence("Read the full text of H&S 17920.3 in the 2026-10-10 print on 2026-10-13; the word hoarding does not appear.")], [lib])).toEqual([]);
  });
});

describe("library only: a fetched web page cannot support a high-risk legal claim", () => {
  it("is refused with a pointer to ask Leo for a print", () => expect(errs([full({ source_ids: ["src:2"] })], [lib, web])).toMatch(/must rest on an Evidence Library source.*ask Leo for a print/));
  it("a library source is accepted", () => expect(legalStaticErrors([full()], [lib])).toEqual([]));
  it("a claim with no source at all is refused", () => expect(errs([full({ source_ids: [] })])).toMatch(/needs an Evidence Library source/));
});

describe("the label is a verdict, not decoration (the hoarder guide's NARROWER and misleading claims)", () => {
  it("BROADER and WRONG can never be supported", () => {
    expect(errs([full({ verification: { label: "BROADER", against: "a", reader_impact: "none" } })])).toMatch(/BROADER.*says more than/);
    expect(errs([full({ verification: { label: "WRONG", against: "a", reader_impact: "none" } })])).toMatch(/WRONG.*contradicts/);
  });
  it("REAL MISS: clm:2 worded 'as determined by a health officer' (code enforcement officer alternative dropped) is NARROWER with reader impact 'changes' and cannot be supported", () => {
    const old = full({ verification: { label: "NARROWER", reason: "drops the code enforcement officer alternative", against: "a", reader_impact: "changes" }, gates: [{ kind: "alternative_decider", text: "code enforcement officer", stated_in_claim: false }] });
    const e = errs([old]);
    expect(e).toMatch(/reader_impact is "changes"/);
    expect(e).toMatch(/NARROWER is acceptable only with reader_impact "none"/);
  });
  it("REAL MISS: clm:1-3 without the threshold, nobody carrying it, is refused; the same claim with the threshold carried by clm:8 is accepted", () => {
    const missing = { kind: "threshold", text: THRESHOLD, stated_in_claim: false };
    const noThreshold = full({ id: "clm:1", verification: { label: "NARROWER", reason: "subset of (j)", against: "a", reader_impact: "changes" }, gates: [missing] });
    expect(errs([noThreshold])).toMatch(/reader_impact is "changes"/);
    const carried = full({ id: "clm:1", verification: { label: "NARROWER", reason: "threshold carried by clm:8", against: "a", reader_impact: "none" }, gates: [{ ...missing, carried_by: "clm:8" }] });
    expect(legalStaticErrors([carried, clm8()], [lib])).toEqual([]);
  });
  it("a gate carried by a claim that is not in the packet, or not supported, is refused", () => {
    const carried = full({ gates: [{ kind: "threshold", text: THRESHOLD, stated_in_claim: false, carried_by: "clm:8" }], verification: { label: "NARROWER", reason: "carried", against: "a", reader_impact: "none" } });
    expect(errs([carried])).toMatch(/clm:8, which is not a claim in this packet/);
    expect(legalStaticErrors([carried, clm8({ support: "unsupported" })], [lib]).join(" ")).toMatch(/not supported/);
  });
  it("a gate may be both stated in the claim and carried by another claim (the dry run's redundant case is accepted); the carrier is still validated", () => {
    const both = full({ id: "clm:2", gates: [{ kind: "threshold", text: THRESHOLD, stated_in_claim: true, carried_by: "clm:8" }] });
    expect(legalStaticErrors([both, clm8()], [lib])).toEqual([]);
    expect(errs([both])).toMatch(/clm:8, which is not a claim in this packet/);                       // a missing carrier is still refused
    expect(legalStaticErrors([both, clm8({ support: "unsupported" })], [lib]).join(" ")).toMatch(/not supported/);   // so is an unsupported one
  });
  it("NARROWER with reader impact 'none' needs the recorded reason; with it, it is accepted (clm:6, 'sale only', Leo's ruling)", () => {
    const six = full({ id: "clm:6", verification: { label: "NARROWER", against: "a", reader_impact: "none" }, gates: [{ kind: "scope", text: "also exchange, lease with an option to purchase", stated_in_claim: false }] });
    expect(errs([six])).toMatch(/NARROWER needs a recorded reason/);
    expect(legalStaticErrors([{ ...six, verification: { ...six.verification!, reason: "a guide for sellers; the omitted transfer types change nothing for its reader" } }], [lib])).toEqual([]);
  });
  it("an omitted gate that is neither stated nor carried needs the reason even on a MATCH", () => {
    const m = full({ gates: [{ kind: "exception", text: "except as provided in Section 1102.2", stated_in_claim: false }] });
    expect(errs([m])).toMatch(/not stated in the claim; record the reason/);
  });
});

describe("the quote is verbatim in the stored official print, and its source is current", () => {
  const passages = new Map([["p1", { source_id: "L1", text: "(a) Inadequate sanitation shall include:\r\n" + Q12.replace(" the infestation can be determined", "\r\n the infestation can be determined") + "\r\n(13) Visible mold" }]]);
  const ok = (c: LegalClaim, ctx: Parameters<typeof legalLibraryErrors>[2]) => legalLibraryErrors([c], [lib], ctx).join(" | ");
  it("a verbatim quote (whitespace and line breaks aside) is accepted", () => expect(ok(full(), { libraryPassages: passages })).toBe(""));
  it("an invented or paraphrased quote is refused", () => {
    expect(ok(full({ quote: "Infestation of insects as determined by a health officer." }), { libraryPassages: passages })).toMatch(/does not appear verbatim/);
    expect(ok(full({ passage_ids: [] }), { libraryPassages: passages })).toMatch(/cites its passage_ids/);
    expect(ok(full({ passage_ids: ["nope"] }), { libraryPassages: passages })).toMatch(/unknown passage/);
    expect(ok(full(), { libraryPassages: new Map([["p1", { source_id: "L2", text: Q12 }]]) })).toMatch(/does not belong/);
  });
  it("a quote that runs across a page break (two consecutive passages) is accepted", () => {
    const cut = Q12.indexOf(" ", 200);                       // a page break falls between words, never inside one
    const split = new Map([["p1", { source_id: "L1", text: Q12.slice(0, cut) }], ["p2", { source_id: "L1", text: Q12.slice(cut + 1) }]]);
    expect(ok(full({ passage_ids: ["p1", "p2"] }), { libraryPassages: split })).toBe("");
    expect(ok(full({ passage_ids: ["p1"] }), { libraryPassages: split })).toMatch(/does not appear verbatim/);
  });
  it("a statute source needs a recheck date that has not passed (the Evidence Library records have none today)", () => {
    const p = { libraryPassages: passages, today: "2026-10-13" };
    expect(ok(full(), { ...p, librarySources: new Map([["L1", { recheck_by: null }]]) })).toMatch(/no "recheck by" date/);
    expect(ok(full(), { ...p, librarySources: new Map([["L1", { recheck_by: "2026-10-01" }]]) })).toMatch(/due for re-verification by 2026-10-01/);
    expect(ok(full(), { ...p, librarySources: new Map([["L1", { recheck_by: "2027-01-13" }]]) })).toBe("");
    expect(ok(full(), { ...p, librarySources: new Map([["L1", { recheck_by: "2027-01-13", needs_reprint: true }]]) })).toMatch(/NEEDS REPRINT/);      // Leo, 2026-10-14: a print he found bad cannot support any claim
  });
});

describe("wired into Agent 2's submit check", () => {
  const packet = buildTaskPacket("thb-02-research-evidence", { id: "o1", versionHash: "h1" }, {}, "agent-defined");
  const out = (claims: unknown[], sources: unknown[] = [{ id: "src:1", kind: "library", library_source_id: "L1", title: "H&S 17920.3", tier: 1, jurisdiction: "California", effective_date: "2025-01-01", retrieved_date: "2026-10-10", locality_matches: true }]) => ({
    article_id: "", opportunity_id: "o1", agent_name: "Research & Evidence", agent_prompt_version: "1.6.0", model_version: "claude-code/test", input_version_ids: ["h1"],
    decision: "PASS", findings: [], evidence_ids: ["src:1"], required_actions: [], output_version_id: "v1", timestamp: "2026-10-13T12:00:00Z",
    result: { sources, claims, brand_facts_pending: [], first_party_proof: "restricted", unresolved: [] },
  });
  const wire = { id: "clm:2", text: "H&S 17920.3(a)(12) lists infestation ... as determined by a health officer or a code enforcement officer", source_ids: ["src:1"], support: "supported", jurisdiction: "California", risk: "high", passage_ids: ["p1"], quote: Q12, section: "H&S 17920.3(a)(12)", verification: { label: "MATCH", against: "print", reader_impact: "none" }, gates: [] };
  const run = (o: ReturnType<typeof out>, ctx: Record<string, unknown> = {}) => {
    const p = outputSchemas["thb-02-research-evidence"].safeParse(o);
    return p.success ? semanticChecks("thb-02-research-evidence", p.data as Record<string, any>, { packet, libraryPassages: new Map([["p1", { source_id: "L1", text: Q12 }]]), ...ctx }) : p.error.issues.map((i) => i.path.join(".") + ": " + i.message);
  };
  it("a complete legal claim passes with a current source", () => expect(run(out([wire]), { legal: { librarySources: new Map([["L1", { recheck_by: "2027-01-13" }]]), today: "2026-10-13" } })).toEqual([]));
  it("a legal claim without the record fails the whole packet", () => {
    const { verification: _v, gates: _g, ...bare } = wire; void _v; void _g;
    expect(run(out([bare])).join(" ")).toMatch(/needs its verification/);
  });
  it("a roles that carry no legal claims (R3) can skip the legal checks", () => {
    const { verification: _v, gates: _g, ...bare } = wire; void _v; void _g;
    expect(run(out([bare]), { legal: { skip: true } })).toEqual([]);
  });
});
