import { describe, expect, it } from "vitest";
import { ADVERSARIAL, poisoned } from "../../../scripts/fixtures/adversarial-units";
import { applyDeterministic, applyReview, allLocked, newSection, recordVersion, reviewerFor, type Outcome, type SectionState } from "./loop";
import { checkUnit, hedgeFlagsInText, type CheckCtx, type LedgerClaim } from "./checks";
import { unitText, type Unit } from "./schema";

// Phase 3d adversarial tests, fixtures only: a newly invented legal claim, an unsupported generalization, an unverified local fact and a seller-identifying
// anecdote must each be caught before HUMAN_REVIEW. Two layers: here, by the code (deterministic checks, the hedge flag) and by the state machine (no lock
// without a V1 pass, whatever Agents 5-7 say). The live run puts the real V1 on the same sentences (scripts/adversarial-smoke.mts); a miss there is reported, never hidden.

const claims = new Map<string, LedgerClaim>([["clm:1", { id: "clm:1", text: "Civil Code section 1102 applies to a transfer by sale.", risk: "high", support: "supported", sourceId: "src", sourceRecheckBy: null, jurisdiction: "California" }]]);
const check: CheckCtx = { today: "2026-10-12", claims, approvedFactTexts: [], allowedLinks: [], sourceUrls: [], internalPassages: [], allowedJurisdictions: ["California"], blockedPhrases: [], briefH2: { s2: "What do you have to disclose?" }, keyword: "x" };
const base = { kind: "section", key: "s2", h2: "What do you have to disclose?", blocks: [{ t: "p", text: "Civil Code section 1102 applies to a transfer by sale." }, { t: "p", text: "Ask an attorney what applies to your sale." }], claim_ids: ["clm:1"], roles: [] } as unknown as Unit;

const ok = (o: Outcome): SectionState => { if (!o.ok) throw new Error(o.error); return o.state; };
const err = (o: Outcome): string => (o.ok ? "" : o.error);
const sig = "sig";
const write = (u: Unit, hash = "p1", s = newSection(u.key)) => {
  const o = ok(recordVersion(s, { hash, sig, text: unitText(u) }));
  return ok(applyDeterministic(o, checkUnit(u, check)));
};

describe("the fixtures themselves", () => {
  it("the clean base unit passes every deterministic check and has no flagged sentence", () => {
    expect(checkUnit(base, check)).toEqual([]);
    expect(hedgeFlagsInText(unitText(base))).toEqual([]);
  });
  it("there is one case per defect family", () => {
    expect(ADVERSARIAL.map((c) => c.id).sort()).toEqual(["generalization", "legal-claim", "local-fact", "seller-anecdote"]);
  });
});

describe("what the code alone catches (no agent involved)", () => {
  for (const c of ADVERSARIAL) {
    it(`${c.id}: the deterministic layer matches what the fixture declares`, () => {
      const u = poisoned(base, c.sentence);
      const codes = checkUnit(u, check).map((f) => f.code);
      for (const want of c.caught.code.filter((x) => x !== "HEDGE_FLAG")) expect(codes, c.id).toContain(want);
      if (c.caught.code.includes("HEDGE_FLAG")) expect(hedgeFlagsInText(unitText(u)).length, c.id).toBeGreaterThan(0);
      if (c.caught.code.length === 0) {
        // only V1 can catch it: the code must NOT pretend to (this is the honest record of what the fixture relies on)
        expect(codes.filter((x) => !["LINK_NOT_ALLOWED"].includes(x)), `${c.id} is caught by code after all: update the fixture`).toEqual([]);
        expect(hedgeFlagsInText(unitText(u)), `${c.id} carries a hedge term: update the fixture`).toEqual([]);
      }
    });
  }
  it("a blunt seller anecdote is a privacy block by code, before any reviewer runs", () => {
    const blunt = ADVERSARIAL.find((c) => c.id === "seller-anecdote")!.blunt!;
    const u = poisoned(base, blunt.sentence);
    const f = checkUnit(u, check).find((x) => x.code === blunt.code)!;
    expect(f.severity).toBe("BLOCKED_PRIVACY");
    const s = write(u);
    expect(s.status).toBe("BLOCKED_PRIVACY");
    expect(err(recordVersion(s, { hash: "x", sig, text: "t." }))).toMatch(/BLOCKED_PRIVACY; a human must resolve it/);
  });
});

describe("before HUMAN_REVIEW: no poisoned unit can lock, whatever Agents 5, 6 and 7 say", () => {
  for (const c of ADVERSARIAL) {
    const u = () => poisoned(base, c.sentence);
    it(`${c.id}: the old fact auditor's PASS no longer moves it; only V1 does`, () => {
      const s = write(u());
      expect(s.status).toBe("NEEDS_FACT");
      expect(reviewerFor(s)).toBe("V1");
      expect(err(applyReview(s, { agent: 5, versionHash: s.versionHash!, decision: "PASS", issues: [] }))).toMatch(/cannot review/);
      expect(err(applyReview(s, { agent: 6, versionHash: s.versionHash!, decision: "PASS", issues: [] }))).toMatch(/cannot review/);
      expect(err(applyReview(s, { agent: 7, versionHash: s.versionHash!, decision: "PASS", issues: [] }))).toMatch(/cannot review/);
    });
    it(`${c.id}: a V1 REVISION sends it back; it locks only after a clean rewrite passes V1, SEO and editorial`, () => {
      let s = write(u());
      const rulings = s.hedges!.map((h) => ({ key: h.key, ruling: "drop" as const, note: "no ledger claim supports it" }));
      s = ok(applyReview(s, { agent: "V1", versionHash: s.versionHash!, decision: "REVISION", issues: [{ key: `fact:${c.id}`, text: `Unsupported: "${c.sentence}"` }], hedgeRulings: rulings }));
      expect(s.status).toBe("NEEDS_REVISION");
      expect(s.fixCited).toContain(c.sentence);                              // the cited sentence is the one the fix pass may change
      expect(allLocked([s])).toBe(false);
      // the clean rewrite: the poisoned sentence is gone
      s = ok(applyDeterministic(ok(recordVersion(s, { hash: "p2", sig, text: unitText(base) })), checkUnit(base, check)));
      expect(s.status).toBe("NEEDS_FACT");
      s = ok(applyReview(s, { agent: "V1", versionHash: "p2", decision: "PASS", issues: [], hedgeRulings: [] }));
      s = ok(applyReview(s, { agent: 6, versionHash: "p2", decision: "PASS", issues: [] }));
      s = ok(applyReview(s, { agent: 7, versionHash: "p2", decision: "PASS", issues: [] }));
      expect(s.status).toBe("LOCKED");
      expect(allLocked([s])).toBe(true);
    });
  }
  it("generalization: V1 cannot pass the flagged sentence without ruling on it, and a drop or reword ruling is a required fix", () => {
    const c = ADVERSARIAL.find((x) => x.id === "generalization")!;
    const s = write(poisoned(base, c.sentence));
    expect(s.hedges!.length).toBe(1);
    expect(s.hedges![0].term).toBe("most owners");
    expect(err(applyReview(s, { agent: "V1", versionHash: s.versionHash!, decision: "PASS", issues: [], hedgeRulings: [] }))).toMatch(/must rule/);
    for (const ruling of ["drop", "reword"] as const) {
      expect(err(applyReview(s, { agent: "V1", versionHash: s.versionHash!, decision: "PASS", issues: [], hedgeRulings: [{ key: s.hedges![0].key, ruling, note: "x" }] }))).toMatch(/cannot carry required issues/);
      const r = ok(applyReview(s, { agent: "V1", versionHash: s.versionHash!, decision: "REVISION", issues: [], hedgeRulings: [{ key: s.hedges![0].key, ruling }] }));
      expect(r.status).toBe("NEEDS_REVISION");
    }
  });
  it("the same four sentences DID pass the earlier flow: a section saved before the gate locks with Agent 5 alone (the gap this phase closes)", () => {
    for (const c of ADVERSARIAL.filter((x) => x.caught.code.length === 0 || x.id === "generalization")) {
      const legacy = { ...newSection("s2"), gate: undefined } as SectionState;
      let s = ok(recordVersion(legacy, { hash: "L1", sig }));                // no text: the earlier flow
      s = ok(applyReview(s, { agent: 5, versionHash: "L1", decision: "PASS", issues: [] }));
      s = ok(applyReview(s, { agent: 6, versionHash: "L1", decision: "PASS", issues: [] }));
      s = ok(applyReview(s, { agent: 7, versionHash: "L1", decision: "PASS", issues: [] }));
      expect(s.status, c.id).toBe("LOCKED");
    }
  });
  it("one unit stuck in V1 revision keeps the whole article from HUMAN_REVIEW", () => {
    const locked = (key: string): SectionState => ({ ...newSection(key), status: "LOCKED", lockedHash: "h" });
    const stuck = ok(applyReview(write(poisoned(base, ADVERSARIAL[0].sentence)), { agent: "V1", versionHash: "p1", decision: "REVISION", issues: [{ key: "fact:x", text: "Unsupported." }], hedgeRulings: [] }));
    expect(allLocked([locked("s2"), locked("s3"), stuck])).toBe(false);
    expect(allLocked([locked("s2"), locked("s3")])).toBe(true);
  });
});
