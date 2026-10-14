/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { teamSchema, v1LegalErrors } from "./bridge";
import type { LedgerClaim } from "../studio/checks";
import type { StudioValidationCtx } from "../studio/agents";
import type { ClaimVerification } from "../studio/legal-claims";

// Phase 3e stage 3: what V1 owes on legal claims (its output schema and the checks that refuse a PASS), from the hoarder guide's real misses.
const ver = (over: Partial<ClaimVerification> = {}): ClaimVerification => ({ quote: "(c) Any waiver of the requirements of this article is void as against public policy.", section: "Civil Code 1102(c)", label: "MATCH", reason: null, against: "print", gates: [], readerImpact: "none", ...over });
const claim = (id: string, v: ClaimVerification | undefined, over: Partial<LedgerClaim> = {}): LedgerClaim => ({ id, text: "t", risk: "high", support: "supported", sourceId: "s", sourceRecheckBy: null, jurisdiction: "California", verification: v, ...over });
const studio = (claims: LedgerClaim[], legalRecord = true, cite: string[] = claims.map((c) => c.id)): StudioValidationCtx => ({
  packet: { agent_key: "thb-05-fact-privacy-auditor", prompt_version: "1.10.0", unit_key: "s3", unit_hash: "h1", allowed_claim_ids: claims.map((c) => c.id), opportunity_id: "o1", article_id: "a1" },
  currentUnit: { kind: "section", key: "s3", h2: "Q?", blocks: [{ t: "p", text: "x" }], claim_ids: cite, roles: [] } as any, currentHash: "h1",
  check: { today: "2026-10-13", claims: new Map(claims.map((c) => [c.id, c])), approvedFactTexts: [], allowedLinks: [], sourceUrls: [], internalPassages: [], allowedJurisdictions: ["California"], blockedPhrases: [], briefH2: {}, keyword: "x", legalRecord },
  voiceUsable: true, requiredIssuesOpen: [],
});
const out = (decision: string, over: Record<string, unknown> = {}, checks: any[] = [{ claim_id: "clm:7", verdict: "supported_as_written", note: "ok", quote_comparison: "MATCH", reader_impact: "none" }]) => ({ decision, result: { block_kind: decision === "BLOCKED" ? "BLOCKED_CLAIM" : undefined, claim_checks: checks, leo_reference_needed: [], ...over } });
const errs = (o: any, c: StudioValidationCtx, rulings: any[] = [], sentences: [string, string][] = []) => v1LegalErrors(o, c, rulings, new Map(sentences)).join(" | ");

describe("V1 output schema (Phase 3e): quote_comparison, reader_impact and leo_reference_needed", () => {
  const base = { article_id: "a1", opportunity_id: "o1", agent_name: "V1 Fact and Privacy", agent_prompt_version: "1.10.0", model_version: "claude-code/test", input_version_ids: ["h1"], decision: "PASS", findings: [], evidence_ids: [], required_actions: [], output_version_id: "v", timestamp: "2026-10-13T12:00:00Z" };
  const res = (extra: Record<string, unknown> = {}, check: Record<string, unknown> = {}) => ({ ...base, result: { unit_key: "s3", version_hash: "h1", claim_checks: [{ claim_id: "clm:7", verdict: "supported_as_written", note: "ok", ...check }], privacy_ok: true, legal_qualification_ok: true, cards: [], hedge_rulings: [], ...extra } });
  it("accepts the new per-claim fields, and the old shape without them (they are required by the check, not the schema)", () => {
    expect(teamSchema("V1").safeParse(res({}, { quote_comparison: "MATCH", reader_impact: "none" })).success).toBe(true);
    expect(teamSchema("V1").safeParse(res()).success).toBe(true);
  });
  it("only the four labels and two impacts exist, and a reference request needs a reason", () => {
    expect(teamSchema("V1").safeParse(res({}, { quote_comparison: "KIND OF" })).success).toBe(false);
    expect(teamSchema("V1").safeParse(res({}, { reader_impact: "maybe" })).success).toBe(false);
    expect(teamSchema("V1").safeParse(res({ leo_reference_needed: [{ claim: "clm:9", section: "SF Health Code Art. 11", why: "x" }] })).success).toBe(false);
    expect(teamSchema("V1").safeParse(res({ leo_reference_needed: [{ claim: "clm:9", section: "SF Health Code Art. 11", why: "The official print of Article 11 is not in the Evidence Library." }] })).success).toBe(true);
  });
});

describe("V1 refuses a PASS on a high-risk legal claim without its record", () => {
  it("a MATCH claim with its quote and label, compared by V1 as MATCH with reader impact none, passes", () => expect(errs(out("PASS"), studio([claim("clm:7", ver())]))).toBe(""));
  it("every cited high-risk claim needs quote_comparison and reader_impact in V1's claim_checks", () => {
    expect(errs(out("PASS", {}, [{ claim_id: "clm:7", verdict: "supported_as_written", note: "ok" }]), studio([claim("clm:7", ver())]))).toMatch(/needs quote_comparison.*reader_impact/);
    expect(errs(out("REVISION", {}, [{ claim_id: "clm:7", verdict: "supported_as_written", note: "ok" }]), studio([claim("clm:7", ver())]))).toMatch(/needs quote_comparison/);   // also on a REVISION
  });
  it("a cited high-risk claim with no quote or no label in the ledger: PASS refused, and the way out is leo_reference_needed", () => {
    expect(errs(out("PASS"), studio([claim("clm:7", undefined)]))).toMatch(/PASS is not allowed: clm:7 has no exact official quote or label.*leo_reference_needed/);
    expect(errs(out("PASS"), studio([claim("clm:7", ver({ label: null }))]))).toMatch(/no exact official quote or label/);
    expect(errs(out("PASS"), studio([claim("clm:7", ver({ quote: " " }))]))).toMatch(/no exact official quote or label/);
  });
  it("BROADER or WRONG, in the ledger or in V1's own comparison, can never pass", () => {
    expect(errs(out("PASS"), studio([claim("clm:7", ver({ label: "BROADER" }))]))).toMatch(/labelled BROADER/);
    expect(errs(out("PASS"), studio([claim("clm:7", ver({ label: "WRONG" }))]))).toMatch(/labelled WRONG/);
    expect(errs(out("PASS", {}, [{ claim_id: "clm:7", verdict: "overstated", note: "says more", quote_comparison: "BROADER", reader_impact: "none" }]), studio([claim("clm:7", ver())]))).toMatch(/found it BROADER/);
  });
  it("REAL MISS: clm:1 NARROWER with reader impact 'changes' (no threshold) cannot pass; NARROWER with 'none' and a reason can (clm:6)", () => {
    const changes = [{ claim_id: "clm:1", verdict: "supported_as_written", note: "omits the threshold", quote_comparison: "NARROWER", reader_impact: "changes" }];
    expect(errs(out("PASS", {}, changes), studio([claim("clm:1", ver({ label: "NARROWER", reason: "subset" }))]))).toMatch(/changes what a reader would believe/);
    const accepted = [{ claim_id: "clm:6", verdict: "supported_as_written", note: "sale only: a guide for sellers, so the omitted transfer types change nothing", quote_comparison: "NARROWER", reader_impact: "none" }];
    expect(errs(out("PASS", {}, accepted), studio([claim("clm:6", ver({ label: "NARROWER", reason: "a guide for sellers" }))]))).toBe("");
    expect(errs(out("PASS", {}, [{ ...accepted[0], note: "ok" }]), studio([claim("clm:6", ver({ label: "NARROWER", reason: "a guide for sellers" }))]))).toMatch(/NARROWER.*only with reader_impact "none" and a note/);
  });
  it("a REVISION may report the same findings without being refused", () => {
    const bad = [{ claim_id: "clm:1", verdict: "overstated", note: "omits the threshold", quote_comparison: "NARROWER", reader_impact: "changes" }];
    expect(errs(out("REVISION", {}, bad), studio([claim("clm:1", ver({ label: "NARROWER", reason: "subset" }))]))).toBe("");
  });
  it("low-risk claims and units checked without the legal record (older fixtures) owe nothing new", () => {
    expect(errs(out("PASS", {}, [{ claim_id: "clm:3", verdict: "supported_as_written", note: "ok" }]), studio([claim("clm:3", undefined, { risk: "low" })]))).toBe("");
    expect(errs(out("PASS", {}, [{ claim_id: "clm:7", verdict: "supported_as_written", note: "ok" }]), studio([claim("clm:7", undefined)], false))).toBe("");
  });
});

describe("escalation to Leo: leo_reference_needed is a BLOCKED_CLAIM, never a PASS", () => {
  const ref = [{ claim: "clm:9", section: "SF Health Code Article 11", why: "The official print of Article 11 is not in the Evidence Library." }];
  it("a BLOCKED_CLAIM naming the reference is accepted; a PASS or a REVISION that carries one is refused", () => {
    expect(errs(out("BLOCKED", { leo_reference_needed: ref }), studio([claim("clm:7", ver())]))).toBe("");
    expect(errs(out("PASS", { leo_reference_needed: ref }), studio([claim("clm:7", ver())]))).toMatch(/needs decision BLOCKED with block_kind BLOCKED_CLAIM/);
    expect(errs(out("REVISION", { leo_reference_needed: ref }), studio([claim("clm:7", ver())]))).toMatch(/needs decision BLOCKED/);
    expect(errs(out("BLOCKED", { leo_reference_needed: ref, block_kind: "BLOCKED_PRIVACY" }), studio([claim("clm:7", ver())]))).toMatch(/needs decision BLOCKED with block_kind BLOCKED_CLAIM/);
  });
});

describe("rulings on flagged legal sentences: 'proven' must name its evidence", () => {
  const s = studio([claim("clm:7", ver()), claim("clm:20", ver({ section: "H&S 17920.3" }), { claimType: "statute_absence" }), claim("clm:21", ver(), { claimType: "statute" })], true, ["clm:7"]);
  const absence = "The statute does not mention hoarding.";
  const layers = "California law requires San Francisco owners to remove clutter.";
  const run = (ruling: string, note: string, sentence: string) => errs(out("PASS"), s, [{ key: "hedge:aaaaaaaaaaaa", ruling, note }], [["hedge:aaaaaaaaaaaa", sentence]]);
  it("REAL MISS: 'proven' on an absence-of-law sentence needs a ledger claim of type statute_absence, not an ordinary statute claim", () => {
    expect(run("proven", "clm:21 covers it", absence)).toMatch(/needs a ledger claim of type statute_absence/);
    expect(run("proven", "clm:20: full official text read, term absent", absence)).toBe("");
  });
  it("a sentence that blends California law and a local rule needs both layers' claims named", () => {
    expect(run("proven", "clm:7 supports it", layers)).toMatch(/needs both claim ids/);
    expect(run("proven", "clm:7 for the state layer, clm:21 for the San Francisco layer", layers)).toBe("");
  });
  it("reword and drop need no evidence", () => {
    expect(run("reword", "split the layers into two sentences", layers)).toBe("");
    expect(run("drop", "no source for it", absence)).toBe("");
  });
});
