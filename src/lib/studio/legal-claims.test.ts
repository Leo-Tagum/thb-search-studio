import { describe, expect, it } from "vitest";
import { agent2Result } from "../agents/schemas";
import { claimRow } from "../team/ledger";
import { QUOTE_MAX, gate, isVerificationComplete, verificationColumns, verificationFromRow } from "./legal-claims";

// Phase 3e stage 1: the verification record of a legal claim (migration 0020). Shape and mapping only; the refusals are stages 2 and 3.
const base = { sources: [], brand_facts_pending: [], first_party_proof: "restricted" as const, unresolved: [] };
const claim = (over: Record<string, unknown> = {}) => ({ id: "clm:1", text: "t", source_ids: ["src:1"], support: "supported", jurisdiction: "California", risk: "high", ...over });
const parse = (c: Record<string, unknown>) => agent2Result.safeParse({ ...base, claims: [c] });
const full = { quote: "q", section: "H&S 17920.3(a)(12)", verification: { label: "MATCH", against: "authenticated leginfo print", reader_impact: "none" }, gates: [{ kind: "threshold", text: "to an extent that endangers", stated_in_claim: false, carried_by: "clm:8" }] };

describe("Agent 2 claim schema with the verification fields", () => {
  it("still accepts a claim written before the rule (every new field is optional)", () => {
    expect(parse(claim()).success).toBe(true);
  });
  it("accepts the full record", () => {
    expect(parse(claim(full)).success).toBe(true);
  });
  it("quotes may be up to 1200 characters, not more", () => {
    expect(QUOTE_MAX).toBe(1200);
    expect(parse(claim({ quote: "x".repeat(1200) })).success).toBe(true);
    expect(parse(claim({ quote: "x".repeat(1201) })).success).toBe(false);
  });
  it("only the four labels and two reader impacts exist", () => {
    for (const label of ["MATCH", "NARROWER", "BROADER", "WRONG"]) expect(parse(claim({ verification: { ...full.verification, label } })).success, label).toBe(true);
    expect(parse(claim({ verification: { ...full.verification, label: "SORT OF" } })).success).toBe(false);
    expect(parse(claim({ verification: { ...full.verification, reader_impact: "maybe" } })).success).toBe(false);
  });
  it("a gate has one of the five kinds, text, and says whether the claim states it; carried_by names a claim", () => {
    expect(gate.safeParse({ kind: "alternative_decider", text: "code enforcement officer", stated_in_claim: true }).success).toBe(true);
    expect(gate.safeParse({ kind: "loophole", text: "x", stated_in_claim: true }).success).toBe(false);
    expect(gate.safeParse({ kind: "threshold", text: "x", stated_in_claim: false, carried_by: "the other one" }).success).toBe(false);
    expect(gate.safeParse({ kind: "threshold", text: "", stated_in_claim: false }).success).toBe(false);
  });
  it("the schema stays strict: an unknown field on a claim is rejected", () => {
    expect(parse(claim({ verdict: "MATCH" })).success).toBe(false);
  });
});

describe("verificationColumns (claim -> claims table columns)", () => {
  it("maps the whole record", () => {
    expect(verificationColumns(full as never)).toEqual({
      quote_full: "q", section_cite: "H&S 17920.3(a)(12)", verification_label: "MATCH", verification_reason: null, verified_against: "authenticated leginfo print",
      gates: full.gates, reader_impact: "none",
    });
  });
  it("invents nothing: a claim without the record maps to nulls and no gates", () => {
    expect(verificationColumns({})).toEqual({ quote_full: null, section_cite: null, verification_label: null, verification_reason: null, verified_against: null, gates: [], reader_impact: null });
  });
  it("a Research pack claim reaches the ledger row with the record", () => {
    const row = claimRow("art", "clm:9", { id: "clm:1", text: "t", source_ids: [], support: "supported", jurisdiction: "California", risk: "high", ...full } as never, "src-db", "2025-01-01", "thb-r1-legal-official", "2026-10-13", "hash");
    expect(row.quote_full).toBe("q");
    expect(row.verification_label).toBe("MATCH");
    expect(row.gates).toEqual(full.gates);
    expect(row.supporting_passage).toBe("q");
  });
});

describe("verificationFromRow (claims row -> record)", () => {
  it("a claim written before the rule comes back empty, never throws", () => {
    const v = verificationFromRow({ claim_key: "clm:7" });
    expect(v).toEqual({ quote: null, section: null, label: null, reason: null, against: null, gates: [], readerImpact: null });
    expect(isVerificationComplete(v)).toBe(false);
  });
  it("a backfilled row round-trips", () => {
    const row = { quote_full: "(c) Any waiver of the requirements of this article is void as against public policy.", section_cite: "Civil Code 1102(c)", verification_label: "MATCH", verification_reason: "Word for word.", verified_against: "print", gates: [], reader_impact: "none" };
    const v = verificationFromRow(row);
    expect(v).toMatchObject({ label: "MATCH", section: "Civil Code 1102(c)", readerImpact: "none", gates: [] });
    expect(isVerificationComplete(v)).toBe(true);
  });
  it("an unknown label, an unknown impact or a malformed gate is dropped, not trusted", () => {
    const v = verificationFromRow({ quote_full: "q", section_cite: "s", verified_against: "a", verification_label: "BASICALLY", reader_impact: "meh", gates: [{ kind: "threshold", text: "ok", stated_in_claim: false }, { kind: "nope" }, "x"] });
    expect(v.label).toBeNull();
    expect(v.readerImpact).toBeNull();
    expect(v.gates).toHaveLength(1);
    expect(isVerificationComplete(v)).toBe(false);
  });
  it("a record with no quote is not complete", () => {
    expect(isVerificationComplete(verificationFromRow({ quote_full: "  ", section_cite: "s", verified_against: "a", verification_label: "MATCH", reader_impact: "none" }))).toBe(false);
  });
});
