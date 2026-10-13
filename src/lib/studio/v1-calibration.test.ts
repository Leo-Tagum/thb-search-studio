import { describe, expect, it } from "vitest";
import { LEO_CARDS } from "../../../scripts/fixtures/leo-v1-cards";
import { applyDeterministic, applyReview, forLeo, newSection, recordVersion, type HedgeVerdict, type Outcome, type SectionState } from "./loop";
import { hedgeFlagsInText, checkUnit, type CheckCtx, type LedgerClaim } from "./checks";
import { unitText, type Unit } from "./schema";
import type { StudioValidationCtx } from "./agents";
import { isMustFixRuling, needsRuling, rulingGuard } from "./hedge-rulings";
import { applyDeterministic as teamDet, newTeamSection, recordReview, recordVersion as teamRecord, forLeo as teamForLeo, type Outcome as TeamOutcome, type TeamSectionState } from "../team/loop";
import { buildTeamPacket, teamSchema, teamSemanticChecks } from "../team/bridge";
import { poisoned } from "../../../scripts/fixtures/adversarial-units";

// Phase 3d, V1 severity calibration (prompt 1.2.0). Leo's ten blind verdicts are the fixtures: A must-fix, B should-fix, C no finding.
// These tests check the MACHINERY (what each ruling does to a unit); whether the real V1 chooses the ruling Leo would is measured live.

const claims = new Map<string, LedgerClaim>([["clm:1", { id: "clm:1", text: "Civil Code section 1102 applies to a transfer by sale.", risk: "high", support: "supported", sourceId: "src", sourceRecheckBy: null, jurisdiction: "California" }]]);
const check: CheckCtx = { today: "2026-10-12", claims, approvedFactTexts: [], allowedLinks: [], sourceUrls: [], internalPassages: [], allowedJurisdictions: ["California"], blockedPhrases: [], briefH2: { s2: "What do you have to disclose?" }, keyword: "x" };
const base = { kind: "section", key: "s2", h2: "What do you have to disclose?", blocks: [{ t: "p", text: "Civil Code section 1102 applies to a transfer by sale." }, { t: "p", text: "Ask an attorney what applies to your sale." }], claim_ids: ["clm:1"], roles: [] } as unknown as Unit;
const ok = (o: Outcome): SectionState => { if (!o.ok) throw new Error(o.error); return o.state; };
const okT = (o: TeamOutcome): TeamSectionState => { if (!o.ok) throw new Error(o.error); return o.state; };
const err = (o: Outcome | TeamOutcome): string => (o.ok ? "" : o.error);
const write = (sentence: string) => { const u = poisoned(base, sentence); return ok(applyDeterministic(ok(recordVersion(newSection("s2"), { hash: "c1", sig: "sig", text: unitText(u) })), checkUnit(u, check))); };
const rulings = (s: SectionState, ruling: HedgeVerdict["ruling"], note = "calibration fixture"): HedgeVerdict[] => (s.hedges ?? []).filter(needsRuling).map((h) => ({ key: h.key, ruling, note }));
const v1 = (s: SectionState, decision: "PASS" | "REVISION", o: { issues?: { key: string; text: string }[]; optional?: { key: string; text: string }[]; rulings?: HedgeVerdict[] }) =>
  applyReview(s, { agent: "V1", versionHash: s.versionHash!, decision, issues: o.issues ?? [], optional: o.optional, hedgeRulings: o.rulings ?? [] });

describe("Leo's ten cards: verdicts and which the hedge flag sees", () => {
  it("A 2, B 3, C 5; the flag fires on exactly the five usually/most people/never/nobody cards", () => {
    const n = (v: string) => LEO_CARDS.filter((c) => c.leo === v).length;
    expect([n("A"), n("B"), n("C")]).toEqual([2, 3, 5]);
    for (const c of LEO_CARDS) expect(hedgeFlagsInText(c.sentence).length > 0, `card ${c.card}`).toBe(c.flagged);
    expect(LEO_CARDS.every((c) => c.v1Originally === "must fix")).toBe(true);
  });
});

describe("card 1: Leo's verdict stays B; V1's difference is a documented exception, not a relabel", () => {
  const card1 = LEO_CARDS.find((c) => c.card === 1)!;
  it("the verdict is Leo's B and the expected machinery outcome is should-fix", () => {
    expect(card1.leo).toBe("B");
    expect(card1.sentence).toBe("Living in the house alone does not give you that authority.");
  });
  it("the exception records what the real V1 does (must-fix), why (the nearby role list), who accepted it and where the evidence is", () => {
    const x = card1.documentedException!;
    expect(x.observedV1).toBe("must");
    expect(x.reason).toMatch(/lists legal roles/);
    expect(x.reason).toMatch(/executor/);
    expect(x.approved).toMatch(/documented exception/);
    expect(x.evidence).toMatch(/calibration-card1-in-context/);
  });
  it("no other card carries an exception", () => {
    expect(LEO_CARDS.filter((c) => c.documentedException).map((c) => c.card)).toEqual([1]);
  });
  it("the in-context regression is runnable against the real V1: npm run calibrate-context (setup, dispatch V1 on each packet, submit-dir, verify)", async () => {
    const { readFileSync } = await import("node:fs");
    expect(JSON.parse(readFileSync("package.json", "utf8")).scripts["calibrate-context"]).toMatch(/calibration-context-smoke/);
    expect(readFileSync("scripts/calibration-context-smoke.mts", "utf8")).toMatch(/documentedException/);
  });
});

describe("each card gets the outcome Leo judged", () => {
  for (const c of LEO_CARDS) {
    if (c.leo === "A") {
      it(`card ${c.card} (A): a required finding sends the unit back to the writer`, () => {
        const s = write(c.sentence);
        const r = ok(v1(s, "REVISION", { issues: [{ key: `fact:card${c.card}`, text: `Unsupported: "${c.sentence}"` }], rulings: rulings(s, "proven") }));
        expect(r.status).toBe("NEEDS_REVISION");
        expect(r.fixCited).toContain(c.sentence);
      });
    } else if (c.leo === "B") {
      it(`card ${c.card} (B): a should-fix that never blocks; the unit moves on and Leo sees the item`, () => {
        const s = write(c.sentence);
        const r = ok(c.flagged ? v1(s, "PASS", { rulings: rulings(s, "soften", "say it can be, with no frequency word") }) : v1(s, "PASS", { optional: [{ key: `fact:card${c.card}:clarify`, text: `Clarify: "${c.sentence}"` }] }));
        expect(r.status).toBe("NEEDS_SEO");
        expect(r.issues).toEqual([]);
        expect(forLeo(r).open).toHaveLength(1);
        expect(forLeo(r).open[0].text).toContain(c.flagged ? c.sentence : "Clarify");
      });
    } else {
      it(`card ${c.card} (C): no finding at all`, () => {
        const s = write(c.sentence);
        const r = ok(c.flagged ? v1(s, "PASS", { rulings: rulings(s, "not_a_claim", "conversational line: states no fact, number, frequency or legal rule") }) : v1(s, "PASS", {}));
        expect(r.status).toBe("NEEDS_SEO");
        expect(r.issues).toEqual([]);
        expect(forLeo(r).open).toEqual([]);
        expect(forLeo(r).declined).toEqual([]);
      });
    }
  }
  it("the same flagged sentences with the old rulings (reword, drop) are still must-fix: nothing was removed", () => {
    for (const c of LEO_CARDS.filter((x) => x.flagged)) {
      const s = write(c.sentence);
      for (const ruling of ["reword", "drop"] as const) {
        expect(err(v1(s, "PASS", { rulings: rulings(s, ruling) }))).toMatch(/cannot carry required issues/);
        expect(ok(v1(s, "REVISION", { rulings: rulings(s, ruling) })).status).toBe("NEEDS_REVISION");
      }
    }
  });
  it("a flagged sentence still needs a ruling: V1 cannot skip it, and soften / not_a_claim need a note", () => {
    const s = write(LEO_CARDS[3].sentence);
    expect(err(v1(s, "PASS", { rulings: [] }))).toMatch(/must rule \(proven \/ soften \/ not_a_claim \/ reword \/ drop\)/);
    for (const ruling of ["soften", "not_a_claim"] as const) expect(err(v1(s, "PASS", { rulings: (s.hedges ?? []).map((h) => ({ key: h.key, ruling, note: "" })) }))).toMatch(/needs a note/);
  });
});

describe("specific legal claims cannot be talked down; a general legal principle may be a should-fix", () => {
  const legal = ["Owners usually have to disclose under the statute.", "Most owners must follow Civil Code section 1102.", "A buyer usually pays $500 more for a full house.", "You will never have to disclose a lien.", "Most people owe tax on the sale within 30 days.", "The executor, trustee or heirs usually have authority to sign.", "A waiver of the disclosure is never valid."];
  it("soften and not_a_claim are refused on a sentence with a statute or code section, a statutory condition, a figure or money, or a list of legal roles; proven, reword and drop are not", () => {
    for (const sentence of legal) {
      expect(rulingGuard(sentence, "soften"), sentence).toMatch(/not allowed/);
      expect(rulingGuard(sentence, "not_a_claim"), sentence).toMatch(/not allowed/);
      for (const allowed of ["proven", "reword", "drop"]) expect(rulingGuard(sentence, allowed), sentence).toBeNull();
    }
    const s = write(legal[0]);
    expect(err(v1(s, "PASS", { rulings: rulings(s, "soften") }))).toMatch(/not allowed on a sentence with a statute/);
    expect(isMustFixRuling("reword") && isMustFixRuling("drop") && !isMustFixRuling("soften") && !isMustFixRuling("not_a_claim")).toBe(true);
  });
  it("a general legal principle may be softened (a should-fix) but is never not_a_claim; specific wording of the same idea is refused both ways", () => {
    for (const general of ["Owners usually have a duty to tell a buyer what they know about the house.", "Most sellers are required to be honest with a buyer.", "A seller is never allowed by law to hide a problem."]) {
      expect(rulingGuard(general, "soften"), general).toBeNull();
      expect(rulingGuard(general, "not_a_claim"), general).toMatch(/states a legal rule/);
    }
    for (const specific of ["Owners usually have to disclose under Civil Code section 1102.", "Sellers never have to pay more than $500 to disclose."]) {
      expect(rulingGuard(specific, "soften"), specific).toMatch(/not allowed/);
      expect(rulingGuard(specific, "not_a_claim"), specific).toMatch(/not allowed/);
    }
  });
  it("none of Leo's five flagged cards trips the guard (so the calibration is available on them)", () => {
    for (const c of LEO_CARDS.filter((x) => x.flagged)) expect(rulingGuard(c.sentence, "soften"), `card ${c.card}`).toBeNull();
  });
  it("a settled ruling is kept while the sentence keeps its words", () => {
    let s = write(LEO_CARDS[5].sentence);
    s = ok(v1(s, "PASS", { rulings: rulings(s, "not_a_claim", "conversational line: states no fact") }));
    expect(s.status).toBe("NEEDS_SEO");
    s = ok(applyReview(s, { agent: 6, versionHash: "c1", decision: "REVISION", issues: [{ key: "seo:x", text: "Add the direct answer." }] }));
    const u2 = poisoned(base, LEO_CARDS[5].sentence);
    s = ok(applyDeterministic(ok(recordVersion(s, { hash: "c2", sig: "sig", text: "Direct answer first. " + unitText(u2) })), []));
    expect((s.hedges ?? []).every((h) => h.ruling === "not_a_claim")).toBe(true);
    s = ok(applyReview(s, { agent: "V1", versionHash: "c2", decision: "PASS", issues: [], hedgeRulings: [] }));
    expect(s.status).toBe("NEEDS_SEO");
  });
});

describe("the team loop applies the same severities", () => {
  const tv = (text: string): TeamSectionState => okT(teamDet(okT(teamRecord(newTeamSection("s2"), { hash: "t1", sig: "sig", text })), []));
  const rv = (s: TeamSectionState, role: string, decision: "PASS" | "REVISION", hedgeRulings?: { key: string; ruling: HedgeVerdict["ruling"]; note?: string }[]) => recordReview(s, { role, versionHash: s.versionHash!, decision, items: [], hedgeRulings });
  it("soften is a should-fix on a passing review, not_a_claim leaves nothing, reword is a must-fix", () => {
    const flagged = LEO_CARDS.find((c) => c.card === 4)!.sentence;
    let s = tv(flagged);
    const soft = okT(rv(s, "V1", "PASS", [{ key: s.hedges[0].key, ruling: "soften", note: "say it can be" }]));
    expect(soft.mustFix).toEqual([]);
    expect(teamForLeo(soft).open.map((c) => c.severity)).toEqual(["should fix"]);
    s = tv(LEO_CARDS.find((c) => c.card === 6)!.sentence);
    const none = okT(rv(s, "V1", "PASS", [{ key: s.hedges[0].key, ruling: "not_a_claim", note: "conversational line, no fact" }]));
    expect(none.mustFix).toEqual([]);
    expect(teamForLeo(none).open).toEqual([]);
    s = tv(flagged);
    expect(err(rv(s, "V1", "PASS", [{ key: s.hedges[0].key, ruling: "reword", note: "x" }]))).toMatch(/cannot carry must-fix/);
    expect(okT(rv(s, "V1", "REVISION", [{ key: s.hedges[0].key, ruling: "reword", note: "x" }])).mustFix).toHaveLength(1);
    // V2 and V3 pass too: the unit locks with the soften item still open for Leo
    let l = soft;
    l = okT(recordReview(l, { role: "V2", versionHash: l.versionHash!, decision: "PASS", items: [] }));
    l = okT(recordReview(l, { role: "V3", versionHash: l.versionHash!, decision: "PASS", items: [] }));
    expect(l.status).toBe("LOCKED");
  });
});

describe("the bridge accepts the new rulings and the new prompt version", () => {
  const res = (hedge_rulings: object[]) => ({ article_id: "a1", opportunity_id: "o1", agent_name: "V1 Fact and Privacy", agent_prompt_version: "1.3.0", model_version: "claude-code/test", input_version_ids: ["h1"], decision: "PASS", findings: [], evidence_ids: [], required_actions: [], output_version_id: "v1", timestamp: "2026-10-12T12:00:00Z", result: { unit_key: "s2", version_hash: "h1", claim_checks: [{ claim_id: "clm:1", verdict: "supported_as_written", note: "ok" }], privacy_ok: true, legal_qualification_ok: true, cards: [], hedge_rulings } });
  const run = async (out: object, pend: { key: string; sentence: string }[]) => {
    const p = teamSchema("V1").safeParse(out);
    if (!p.success) return ["SCHEMA " + p.error.issues.map((i: { message: string }) => i.message).join("; ")];
    const packet = buildTeamPacket("V1", { articleId: "a1", opportunityId: "o1", unitKey: "s2", versionHash: "h1" }, {});
    const studio: StudioValidationCtx = { packet: { agent_key: "thb-05-fact-privacy-auditor" as const, prompt_version: "1.0.0", unit_key: "s2", unit_hash: "h1", allowed_claim_ids: ["clm:1"], opportunity_id: "o1", article_id: "a1" }, currentUnit: base as never, currentHash: "h1", check, voiceUsable: true, requiredIssuesOpen: [] };
    return teamSemanticChecks("V1", p.data, { packet, currentHash: "h1", studio, pendingHedgeKeys: pend.map((x) => x.key), pendingHedges: pend });
  };
  const K = "hedge:0123456789ab";
  it("soften and not_a_claim ride on a PASS; reword does not; the guard and the notes apply", async () => {
    const plain = [{ key: K, sentence: "Most people in this spot are not avoiding the problem." }];
    expect(await run(res([{ key: K, ruling: "not_a_claim", note: "conversational line, no fact" }]), plain)).toEqual([]);
    expect(await run(res([{ key: K, ruling: "soften", note: "say it can be" }]), plain)).toEqual([]);
    expect((await run(res([{ key: K, ruling: "reword", note: "x" }]), plain)).join()).toMatch(/cannot carry a reword or drop/);
    expect((await run(res([{ key: K, ruling: "soften" }]), plain)).join()).toMatch(/needs a note/);
    expect((await run(res([{ key: K, ruling: "soften", note: "plainer" }]), [{ key: K, sentence: "Owners usually must follow the statute." }])).join()).toMatch(/not allowed on a sentence with a statute/);
    expect((await run(res([{ key: K, ruling: "maybe", note: "x" }]), plain)).join()).toMatch(/SCHEMA/);
  });
});
