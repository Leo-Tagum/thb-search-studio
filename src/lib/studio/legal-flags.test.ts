import { describe, expect, it } from "vitest";
import { checkUnit, hedgeFlagsInText, type CheckCtx, type LedgerClaim } from "./checks";
import { rulingGuard } from "./hedge-rulings";
import type { ClaimVerification, Gate } from "./legal-claims";
import { deciderFindings, legalKindsOf, legalRecordFindings, localNamesIn, rolesIn } from "./legal-flags";
import type { Unit } from "./schema";

// Phase 3e stage 3, deterministic tests built from the real misses of the hoarder guide (statute text from Leo's official prints) and Juan's Bay Area
// direction (state and local law are separate layers). Nothing here involves an agent: the code reads the sentences and the ledger.
const Q12 = "(12) Infestation of insects, vermin, or rodents as determined by a health officer or, if an agreement does not exist with an agency that has a health officer, the infestation can be determined by a code enforcement officer, as defined in Section 829.5 of the Penal Code, upon successful completion of a course of study in the appropriate subject matter as determined by the local jurisdiction.";
const Q16 = "(16) Lack of adequate garbage and rubbish storage and removal facilities, as determined by a health officer or, if an agreement does not exist with an agency that has a health officer, the lack of adequate garbage and rubbish removal facilities can be determined by a code enforcement officer as defined in Section 829.5 of the Penal Code.";
const Q4 = "(h) Any building or portion thereof, device, apparatus, equipment, combustible waste, or vegetation that, in the opinion of the chief of the fire department or the chief's deputy, is in such a condition as to cause a fire or explosion or provide a ready fuel to augment the spread and intensity of fire or explosion arising from any cause.";
const THRESHOLD = "to an extent that endangers the life, limb, health, property, safety, or welfare of the occupants of the building, nearby residents, or the public";

const rec = (quote: string, over: Partial<ClaimVerification> = {}): ClaimVerification => ({ quote, section: "H&S 17920.3", label: "MATCH", reason: null, against: "print", gates: [], readerImpact: "none", ...over });
const claim = (id: string, v?: ClaimVerification, over: Partial<LedgerClaim> = {}): LedgerClaim => ({ id, text: `text of ${id}`, risk: "high", support: "supported", sourceId: "src", sourceRecheckBy: null, jurisdiction: "California", verification: v, ...over });
const carried: Gate = { kind: "threshold", text: THRESHOLD, stated_in_claim: false, carried_by: "clm:8" };

describe("LEGAL_ABSENCE: a claim about what a law does not say is flagged for V1's ruling (REAL MISS: s3 'The statute does not mention hoarding.')", () => {
  const s3 = "California's Health and Safety Code, section 17920.3, lists conditions that can make a building substandard. I'd read them before you decide anything, so you know what the city or county can actually look at. The statute does not mention hoarding.";
  it("the real s3 paragraph raises a flag on exactly that sentence, alongside correctly supported legal statements", () => {
    const flags = hedgeFlagsInText(s3);
    expect(flags).toHaveLength(1);
    expect(flags[0].sentence).toBe("The statute does not mention hoarding.");
    expect(flags[0].legal).toEqual(["LEGAL_ABSENCE"]);
    expect(flags[0].key).toMatch(/^hedge:[0-9a-f]{12}$/);          // the same key shape as the generalization flags, so V1's rulings flow through the same machinery
  });
  it("V1 may never soften it or call it 'not a claim': only proven (with an absence claim), reword or drop", () => {
    const s = "The statute does not mention hoarding.";
    expect(rulingGuard(s, "soften")).toMatch(/what a law does not say/);
    expect(rulingGuard(s, "not_a_claim")).toMatch(/what a law does not say/);
    expect(rulingGuard(s, "reword")).toBeNull();
    expect(rulingGuard(s, "drop")).toBeNull();
  });
  it("other ways to say it are caught too", () => {
    for (const s of ["The law doesn't require you to clean out the house first.", "California law does not address clutter.", "There is no law that says a hoarded house is substandard.", "No statute requires a cleanout.", "The code is silent on hoarding.", "The ordinance never mentions belongings."]) expect(legalKindsOf(s), s).toContain("LEGAL_ABSENCE");
  });
  it("POSITIVE CONTROLS: the locked hoarder text and ordinary negations raise nothing", () => {
    for (const s of [
      "A full house is not automatically a code problem.", "This guide does not state probate or trust rules.", "This guide does not go through what the form asks.",
      "Any waiver of the requirements of these disclosure rules is void as against public policy.", "Do not plan to skip disclosure or play it down because the house is hard to see.",
      "A buyer who agrees to skip disclosures has not changed that.", "Whether a home meets them is for the local authority.", "You do not have to explain the clutter to anyone but your agent.",
    ]) expect(legalKindsOf(s), s).toEqual([]);
  });
});

describe("LEGAL_DECIDER: who decides is never presented as a complete list the quoted section does not make (REAL MISS: 'the health officer or the fire official')", () => {
  const cited = [claim("clm:2", rec(Q12)), claim("clm:3", rec(Q16)), claim("clm:4", rec(Q4))];
  const run = (...strings: string[]) => deciderFindings(strings, cited).map((f) => f.code);
  it("the roles are read from the stored quotes", () => {
    expect([...rolesIn(Q12)].sort()).toEqual(["code enforcement officer", "health officer"]);
    expect([...rolesIn(Q4)]).toEqual(["fire official"]);
  });
  it("REAL MISS (s7): 'It is the health officer or the fire official, not you and not me.' is a closed list: the code enforcement officer is missing", () => {
    expect(run("Notice who decides. It is the health officer or the fire official, not you and not me.")).toEqual(["LEGAL_DECIDER_CLOSED"]);
  });
  it("REAL MISS (s3 table rows 2 and 3): the bare cell 'A health officer' is flagged; 'A health officer or a code enforcement officer' is not", () => {
    expect(run("A health officer")).toEqual(["LEGAL_DECIDER_CLOSED"]);   // one finding, naming clm:2 and clm:3
    expect(run("A health officer or a code enforcement officer")).toEqual([]);
  });
  it("REAL MISS (s3 paragraph): '...the statute names a health officer or a fire official.' is flagged; naming all three is not", () => {
    expect(run("The local enforcement authority makes that call, and in several of these conditions the statute names a health officer or a fire official.").length).toBeGreaterThan(0);
    expect(run("The local enforcement authority makes that call, and in several of these conditions the statute names a health officer, a code enforcement officer or a fire official.")).toEqual([]);
  });
  it("POSITIVE CONTROLS: an open phrase is fine, the fire chief row for clm:4 alone is fine, and sentences with no decider say nothing", () => {
    expect(run("It is a local official, such as a health officer, a code enforcement officer or a fire official, not you and not me.")).toEqual([]);
    expect(run("It is a local official, such as the health officer or the fire official.")).toEqual([]);
    expect(run("The fire chief or the chief's deputy")).toEqual([]);
    expect(run("Whether your house meets any of them is for the local authority.")).toEqual([]);
    expect(run("Ask the city or county whether any notice is open.")).toEqual([]);
  });
  it("a claim with no stored quote cannot ground the check (no finding, no guess)", () => {
    expect(deciderFindings(["It is the health officer or the fire official."], [claim("clm:2", undefined)])).toEqual([]);
  });
});

describe("the verification record of the cited claims (REAL MISS: clm:1-3 without the threshold; FAQ 3 citing clm:1-4 without clm:8)", () => {
  const codes = (cited: LedgerClaim[]) => legalRecordFindings(cited).map((f) => `${f.code}:${f.severity}`);
  it("a MATCH claim with its record, and low-risk claims, raise nothing", () => {
    expect(codes([claim("clm:7", rec("(c) Any waiver ... is void as against public policy."))])).toEqual([]);
    expect(codes([claim("clm:9", undefined, { risk: "low" })])).toEqual([]);
  });
  it("a cited high-risk claim with no quote, no section or no label is blocked: ask Leo for the print", () => {
    expect(codes([claim("clm:1", undefined)])).toEqual(["UNVERIFIED_LEGAL_CLAIM:BLOCKED_CLAIM"]);
    expect(codes([claim("clm:1", rec("q", { quote: null }))])).toEqual(["UNVERIFIED_LEGAL_CLAIM:BLOCKED_CLAIM"]);
    expect(codes([claim("clm:1", rec("q", { label: null }))])).toEqual(["UNVERIFIED_LEGAL_CLAIM:BLOCKED_CLAIM"]);
    expect(legalRecordFindings([claim("clm:1", undefined)])[0].detail).toMatch(/ask Leo for a reference/);
  });
  it("BROADER and WRONG are blocked", () => {
    expect(codes([claim("clm:1", rec("q", { label: "BROADER" }))])).toEqual(["LEGAL_CLAIM_NOT_MATCHING:BLOCKED_CLAIM"]);
    expect(codes([claim("clm:1", rec("q", { label: "WRONG" }))])).toEqual(["LEGAL_CLAIM_NOT_MATCHING:BLOCKED_CLAIM"]);
  });
  it("REAL MISS: clm:1 as it was (NARROWER, the threshold neither stated nor carried, reader impact 'changes') is blocked", () => {
    expect(codes([claim("clm:1", rec("(j) ...", { label: "NARROWER", reason: "subset", readerImpact: "changes", gates: [{ ...carried, carried_by: undefined }] }))])).toEqual(["LEGAL_GATE_UNCARRIED:BLOCKED_CLAIM"]);
  });
  it("NARROWER needs a recorded reason and reader impact 'none' (clm:6, accepted by Leo, passes with its reason)", () => {
    expect(codes([claim("clm:6", rec("(a) Except as provided ...", { label: "NARROWER", reason: null }))])).toEqual(["LEGAL_NARROWER_UNRECORDED:BLOCKED_CLAIM"]);
    expect(codes([claim("clm:6", rec("(a) Except as provided ...", { label: "NARROWER", reason: "a guide for sellers; the omitted transfer types change nothing for its reader" }))])).toEqual([]);
  });
  it("a gate that is both stated in the claim and carried by clm:8 does not force the unit to cite clm:8 (the claim states it itself)", () => {
    const stated = claim("clm:1", rec("(j) ...", { label: "NARROWER", reason: "threshold stated in the claim and carried by clm:8", gates: [{ ...carried, stated_in_claim: true }] }));
    expect(codes([stated])).toEqual([]);
    const only = claim("clm:1", rec("(j) ...", { label: "NARROWER", reason: "carried by clm:8", gates: [carried] }));
    expect(codes([only])).toEqual(["GATE_CLAIM_NOT_CITED:REVISION"]);                                   // carried only: the unit must still cite the carrier
  });
  it("REAL MISS (FAQ 3): clm:1 with its threshold carried by clm:8 is fine when the unit cites clm:8, and sent back when it does not", () => {
    const one = claim("clm:1", rec("(j) ...", { label: "NARROWER", reason: "threshold carried by clm:8", gates: [carried] }));
    const eight = claim("clm:8", rec("in which there exists any of the following listed conditions " + THRESHOLD));
    expect(codes([one, eight])).toEqual([]);
    expect(codes([one])).toEqual(["GATE_CLAIM_NOT_CITED:REVISION"]);
    expect(legalRecordFindings([one])[0].detail).toMatch(/cite clm:8/);
  });
});

describe("layers of law (Juan's Bay Area direction): local and state law never blend, and one city's rule is never another's", () => {
  it("named local jurisdictions are found, including the generic city / county forms, without double counting 'south san francisco'", () => {
    expect(localNamesIn("In San Francisco and San Mateo County the rules differ.").sort()).toEqual(["san francisco", "san mateo"]);
    expect(localNamesIn("The City of Daly City and the County of Marin.").sort()).toEqual(["daly city", "marin"]);
    expect(localNamesIn("South San Francisco is not San Francisco.").sort()).toEqual(["san francisco", "south san francisco"]);
    expect(localNamesIn("Ask the city or county about your Bay Area house.")).toEqual([]);
  });
  it("a sentence with a local rule and California law together is flagged for V1 (each layer needs its own claim)", () => {
    expect(legalKindsOf("California law requires San Francisco owners to remove clutter.")).toContain("LAYER_LOCAL_AS_STATE");
    expect(legalKindsOf("San Mateo County follows the Health and Safety Code on this.")).toContain("LAYER_LOCAL_AS_STATE");
  });
  it("two cities or counties in one sentence are flagged: their rules are never implied to match", () => {
    expect(legalKindsOf("San Francisco and San Mateo have the same rule on rubbish.")).toContain("LAYER_CROSS_LOCAL");
    expect(legalKindsOf("Oakland and the City of San Mateo both treat it as a nuisance.")).toContain("LAYER_CROSS_LOCAL");
  });
  it("V1 may not soften or wave through a layer-blending sentence (only proven with both claim ids, reword or drop)", () => {
    const s = "California law requires San Francisco owners to remove clutter.";
    expect(rulingGuard(s, "soften")).toMatch(/blends California law with a local rule/);
    expect(rulingGuard(s, "not_a_claim")).toMatch(/blends California law with a local rule/);
  });
  it("POSITIVE CONTROLS: separate layers, each in its own sentence, and the approved fallback wording, raise nothing", () => {
    for (const s of [
      "California law sets the statewide rules, and local rules vary; check with your city or county.",
      "In San Francisco, the rule comes from the City and County of San Francisco's own code.",
      "Under California law, any waiver of the requirements is void as against public policy.",
      "For background on how one Bay Area city handles this, see the guide on Oakland code violations.",
    ]) expect(legalKindsOf(s), s).toEqual([]);
  });
  it("the flags reach the same flagged-sentence list V1 must rule on, with the reason in plain words", () => {
    const f = hedgeFlagsInText("San Francisco and San Mateo have the same rule on rubbish. Ask an attorney.");
    expect(f).toHaveLength(1);
    expect(f[0].why).toMatch(/never imply their rules match/);
    expect(f[0].term).toBe("legal:layer-cross-local");
  });
});

describe("wired into checkUnit (legalRecord on): the hoarder guide's misses become findings; with it off, nothing changes", () => {
  const eight = claim("clm:8", rec("in which there exists any of the following listed conditions " + THRESHOLD));
  const one = claim("clm:1", rec("(j) ...", { label: "NARROWER", reason: "carried by clm:8", gates: [carried] }));
  const two = claim("clm:2", rec(Q12));
  const claims = new Map([["clm:1", one], ["clm:2", two], ["clm:8", eight]]);
  const ctx = (legalRecord: boolean): CheckCtx => ({ today: "2026-10-13", claims, approvedFactTexts: [], allowedLinks: [], sourceUrls: [], internalPassages: [], allowedJurisdictions: ["California"], blockedPhrases: [], briefH2: { s3: "What conditions can turn a cluttered house into a code or safety problem?" }, keyword: "x", legalRecord });
  const unit = (text: string, ids: string[]): Unit => ({ kind: "section", key: "s3", h2: "What conditions can turn a cluttered house into a code or safety problem?", blocks: [{ t: "p", text }], claim_ids: ids, roles: [] });
  const codes = (u: Unit, on: boolean) => checkUnit(u, ctx(on)).map((f) => f.code);
  it("the closed decider list is a finding; the corrected sentence is not", () => {
    expect(codes(unit("It is the health officer or the fire official, not you and not me.", ["clm:1", "clm:2", "clm:8"]), true)).toContain("LEGAL_DECIDER_CLOSED");
    expect(codes(unit("It is a local official, such as a health officer, a code enforcement officer or a fire official, not you and not me.", ["clm:1", "clm:2", "clm:8"]), true)).not.toContain("LEGAL_DECIDER_CLOSED");
  });
  it("a unit citing clm:1 without clm:8 is sent back", () => {
    expect(codes(unit("Some of them can apply to a house with a lot of belongings.", ["clm:1"]), true)).toContain("GATE_CLAIM_NOT_CITED");
    expect(codes(unit("Some of them can apply to a house with a lot of belongings.", ["clm:1", "clm:8"]), true)).not.toContain("GATE_CLAIM_NOT_CITED");
  });
  it("with legalRecord off (fixtures that predate the rule) none of these findings exist", () => {
    const c = codes(unit("It is the health officer or the fire official, not you and not me.", ["clm:1"]), false);
    expect(c).not.toContain("LEGAL_DECIDER_CLOSED");
    expect(c).not.toContain("GATE_CLAIM_NOT_CITED");
  });
});
