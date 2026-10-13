import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CheckCtx, LedgerClaim } from "../studio/checks";
import type { StudioValidationCtx } from "../studio/agents";
import { w1Output, w1SemanticChecks, w2Output, w2SemanticChecks } from "./writing";

const claims = new Map<string, LedgerClaim>([["clm:1", { id: "clm:1", text: "Civil Code section 1102 applies to a transfer by sale.", risk: "high", support: "supported", sourceId: "src", sourceRecheckBy: null, jurisdiction: "California" }]]);
const check: CheckCtx = { today: "2026-10-12", claims, approvedFactTexts: [], allowedLinks: [], sourceUrls: [], internalPassages: [], allowedJurisdictions: ["California"], blockedPhrases: [], briefH2: { s2: "What do you have to disclose?" }, keyword: "x" };
const ctx: StudioValidationCtx = {
  packet: { agent_key: "thb-04-section-writer", prompt_version: "1.5.0", unit_key: "s2", unit_hash: null, allowed_claim_ids: ["clm:1"], opportunity_id: "o1", article_id: "a1" },
  currentUnit: null, currentHash: null, check, voiceUsable: true, requiredIssuesOpen: [],
};
const envelope = (decision: string, result: object, extra: object = {}) => ({
  article_id: "a1", opportunity_id: "o1", agent_name: "x", agent_prompt_version: "1.5.0", model_version: "claude-code/test", input_version_ids: ["h1"], decision, findings: [],
  evidence_ids: [], required_actions: [], output_version_id: "v1", timestamp: "2026-10-12T12:00:00Z", result, ...extra,
});

// ---------- W1 ----------
const unit = { kind: "section", key: "s2", h2: "What do you have to disclose?", blocks: [{ t: "p", text: "Civil Code section 1102 applies to a transfer by sale. Ask an attorney." }], claim_ids: ["clm:1"], roles: [] };
const evReq = (o: Record<string, unknown> = {}) => ({ ticket: "EVIDENCE_REQUEST", from: ["W1"], to: "R1", section: "s2", issue: "Is a transfer disclosure always required?", severity: "must fix", evidence: "no ledger claim covers this", fix: null, blocking: false, ...o });
const w1 = (decision: string, result: Record<string, unknown> = {}, extra: object = {}, req: string[] = []) =>
  envelope(decision, { unit_key: "s2", addresses: [], change_note: "wrote the unit", unit, tickets: [], ...result }, { required_actions: req, ...extra });
const w1Check = (o: unknown) => { const p = w1Output.safeParse(o); return p.success ? w1SemanticChecks(p.data, ctx) : ["SCHEMA: " + p.error.issues.map((i) => i.message).join("; ")]; };

describe("W1: Agent 4 plus tickets, and it cannot add claims", () => {
  it("accepts a clean unit, with or without an evidence request", () => {
    expect(w1Check(w1("PASS"))).toEqual([]);
    expect(w1Check(w1("PASS", { tickets: [evReq()] }))).toEqual([]);
  });
  it("cannot add claims: a claim outside the ledger in the packet is rejected", () => {
    expect(w1Check(w1("PASS", { unit: { ...unit, claim_ids: ["clm:1", "clm:9"] } })).join()).toMatch(/clm:9.*cannot add claims/);
  });
  it("has no field to add claims through: extra keys such as claims or new_claims are rejected", () => {
    for (const k of ["claims", "new_claims", "ledger_additions"]) expect(w1Check(w1("PASS", { [k]: [{ id: "clm:9", text: "A new fact." }] }))[0]).toMatch(/^SCHEMA/);
  });
  it("a gap (BLOCKED) must come with an EVIDENCE_REQUEST ticket instead of an added fact", () => {
    const blocked = (tickets: unknown[]) => w1("BLOCKED", { unit: undefined, tickets }, {}, ["the ledger has no claim on probate timing"]);
    expect(w1Check(blocked([])).join()).toMatch(/must raise an EVIDENCE_REQUEST/);
    expect(w1Check(blocked([evReq({ ticket: "HUMAN_ESCALATION", to: "LEO" })])).join()).toMatch(/must raise an EVIDENCE_REQUEST/);
    expect(w1Check(blocked([evReq()]))).toEqual([]);
    expect(w1Check(blocked([evReq({ to: "R2" })]))).toEqual([]);
  });
  it("tickets are only from W1, only EVIDENCE_REQUEST or HUMAN_ESCALATION, never blocking, and about this unit", () => {
    expect(w1Check(w1("PASS", { tickets: [evReq({ from: ["V1"] })] })).join()).toMatch(/only as W1/);
    expect(w1Check(w1("PASS", { tickets: [evReq({ from: ["W1", "W2"] })] })).join()).toMatch(/only as W1/);
    expect(w1Check(w1("PASS", { tickets: [evReq({ ticket: "QUALITY_CORRECTION", to: "W1", from: ["W1"] })] })).join()).toBeTruthy();
    expect(w1Check(w1("PASS", { tickets: [evReq({ ticket: "ROOT_CAUSE_NOTE", to: "S2" })] })).join()).toMatch(/not ROOT_CAUSE_NOTE/);
    expect(w1Check(w1("PASS", { tickets: [evReq({ blocking: true })] }))[0]).toMatch(/^SCHEMA/);              // only V1 can block
    expect(w1Check(w1("PASS", { tickets: [evReq({ section: "s5" })] })).join()).toMatch(/must be this unit/);
  });
  it("still cannot lock, approve or set a state", () => {
    for (const k of ["approved", "locked", "state", "next_state"]) {
      expect(w1Check({ ...w1("PASS"), [k]: true })[0]).toMatch(/^SCHEMA/);
      expect(w1Check(w1("PASS", { [k]: true }))[0]).toMatch(/^SCHEMA/);
    }
  });
});

// ---------- W2 ----------
const sug = (o: Record<string, unknown> = {}) => ({ id: "w2:h1-situation", area: "h1", issue: "The H1 names the keyword but not the seller's situation.", suggestion: "Lead with the situation the reader is in.", ...o });
const w2 = (suggestions: unknown[] = [sug()], result: Record<string, unknown> = {}, extra: object = {}) =>
  envelope("PASS", { unit_key: "s2", version_hash: "h1", suggestions, ...result }, extra);
const w2Check = (o: unknown) => { const p = w2Output.safeParse(o); return p.success ? w2SemanticChecks(p.data, { unit_key: "s2", currentHash: "h1" }) : ["SCHEMA: " + p.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")]; };

describe("W2: suggestions only, never draft text, claims, locks or state", () => {
  it("accepts direction, and an empty list", () => {
    expect(w2Check(w2())).toEqual([]);
    expect(w2Check(w2([]))).toEqual([]);
    expect(w2Check(w2([sug({ id: "w2:cta", area: "cta", issue: "The call to action pushes.", suggestion: "Make the next step lower pressure. Keep it honest." })]))).toEqual([]);
  });
  it("rejects draft text: a unit, blocks, a capsule, an H2 or replacement text keys in the result", () => {
    for (const k of ["unit", "blocks", "capsule", "h2", "draft", "text", "revised_unit", "replacement"]) expect(w2Check(w2([sug()], { [k]: k === "unit" ? { kind: "section", key: "s2" } : "x" }))[0], k).toMatch(/^SCHEMA/);
  });
  it("rejects replacement text inside a suggestion: long, multi-sentence, multi-line, markup, lists", () => {
    expect(w2Check(w2([sug({ suggestion: "x".repeat(301) })])).join()).toMatch(/longer than 300/);
    expect(w2Check(w2([sug({ suggestion: "Open with a story. Then explain the form. Then give the steps." })])).join()).toMatch(/more than two sentences/);
    expect(w2Check(w2([sug({ suggestion: "Try this opening:\nA packed house is not a failure." })])).join()).toMatch(/one line/);
    expect(w2Check(w2([sug({ suggestion: "Use **bold** on the answer." })])).join()).toMatch(/markup/);
    expect(w2Check(w2([sug({ suggestion: "See [the form](https://example.gov)." })])).join()).toMatch(/markup/);
    expect(w2Check(w2([sug({ suggestion: "<p>Replace the intro</p>" })])).join()).toMatch(/markup/);
    expect(w2Check(w2([sug({ suggestion: "- first idea" })])).join()).toMatch(/markup or a list/);
  });
  it("rejects claims: claim keys, claim ids in text", () => {
    for (const k of ["claims", "claim_ids", "new_claims"]) expect(w2Check(w2([sug()], { [k]: ["clm:1"] }))[0], k).toMatch(/^SCHEMA/);
    expect(w2Check(w2([sug({ suggestion: "Cite clm:1 in the opening." })])).join()).toMatch(/claim id/);
    expect(w2Check(w2([sug({ claim_ids: ["clm:1"] })]))[0]).toMatch(/^SCHEMA/);
  });
  it("rejects a lock, an approval or a state change anywhere, and tickets", () => {
    for (const k of ["locked", "lock", "approved", "state", "next_state", "approval", "tickets"]) {
      expect(w2Check(w2([sug()], {}, { [k]: true }))[0], `envelope ${k}`).toMatch(/^SCHEMA/);
      expect(w2Check(w2([sug()], { [k]: true }))[0], `result ${k}`).toMatch(/^SCHEMA/);
      expect(w2Check(w2([sug({ [k]: true })]))[0], `suggestion ${k}`).toMatch(/^SCHEMA/);
    }
  });
  it("only PASS, and only the five areas, at most six suggestions", () => {
    expect(w2Check({ ...w2(), decision: "BLOCKED" })[0]).toMatch(/^SCHEMA/);
    expect(w2Check({ ...w2(), decision: "REVISION" })[0]).toMatch(/^SCHEMA/);
    expect(w2Check(w2([sug({ area: "facts" })]))[0]).toMatch(/^SCHEMA/);
    expect(w2Check(w2(Array.from({ length: 7 }, (_, i) => sug({ id: `w2:s${i}` }))))[0]).toMatch(/^SCHEMA/);
  });
  it("must be about the unit and the version in the packet, with unique ids", () => {
    expect(w2Check(w2([sug()], { unit_key: "s3" })).join()).toMatch(/unit_key/);
    expect(w2Check(w2([sug()], { version_hash: "h0" })).join()).toMatch(/different version/);
    expect(w2Check(w2([sug(), sug()])).join()).toMatch(/used twice/);
  });
});

describe("writing files", () => {
  const read = (f: string) => readFileSync(`.claude/agents/${f}.md`, "utf8");
  const toolsOf = (t: string) => t.split(/\r?\n/).find((l) => l.startsWith("tools:"));
  it("W1 carries Agent 4's Prohibited action, 1.5.0, Read/Write only, and the ticket and hedge rules", () => {
    const t = read("thb-w1-writer");
    expect(t).toMatch(/prompt_version: 1\.5\.0/);
    expect(t).toContain("**Prohibited action: Making unapproved new factual claims.**");
    expect(toolsOf(t)).toBe("tools: Read, Write");
    expect(t).toMatch(/You never add a claim/);
    expect(t).toMatch(/EVIDENCE_REQUEST/);
    expect(t).toMatch(/No quotation marks around anything a homeowner thinks/);
    expect(t).toMatch(/UNTRUSTED_DATA/);
    expect(t).toMatch(/V1 must rule on each one/);
  });
  it("W1's own examples do not contain a hedge phrase presented as good writing", () => {
    expect(read("thb-w1-writer")).not.toMatch(/write "Most owners/);
  });
  it("W2 has its own Prohibited action, 1.4.0, Read/Write only, and says it never writes into the draft", () => {
    const t = read("thb-w2-cowriter");
    expect(t).toMatch(/prompt_version: 1\.4\.0/);
    expect(t).toContain("**Prohibited action: Writing draft text; adding claims; setting a lock or a state.**");
    expect(toolsOf(t)).toBe("tools: Read, Write");
    expect(t).toMatch(/never write into the draft: only W1 does/);
    expect(t).toMatch(/UNTRUSTED_DATA/);
  });
});
