import { describe, expect, it } from "vitest";
import { storyCard, storyCardErrors, storyFindings, storyVerdict, APPROVED_PROCESS_WORDING, APPROVERS, REGION_NAMES } from "./story-cards";
import { STORY_FIXTURES } from "./story-fixtures";

// Stage 6 part B. Every story below is FAKE (see story-fixtures.ts): invented people, places and numbers; no real seller or deal data.
describe("every FAKE story gets the verdict the rules call for", () => {
  for (const fx of STORY_FIXTURES) {
    it(`${fx.id}: ${fx.label} -> ${fx.expect}`, () => {
      const findings = storyFindings(fx.card, fx.text, { approvedProcess: fx.approvedProcess });
      const codes = findings.map((f) => f.code);
      expect(storyVerdict(findings), JSON.stringify(findings.map((f) => f.code))).toBe(fx.expect);
      for (const c of fx.codes) expect(codes, `${fx.id} should include ${c}`).toContain(c);
      if (fx.expect === "PASS") expect(findings).toEqual([]);
    });
  }
  it("the fixtures cover every rule of SR-18 to SR-20 that Leo listed", () => {
    const need = ["STORY_ADDRESS", "STORY_MONEY", "STORY_DATE", "STORY_UNVERIFIED_FACT", "STORY_NOT_IN_RECORD", "STORY_LOCATION", "STORY_HELD_FOR_JUAN", "STORY_GATE_REFUSED", "STORY_PROMISE", "STORY_IDENTIFYING", "STORY_INVENTED", "STORY_QUOTE", "STORY_TESTIMONIAL", "STORY_SERVICE_AREA", "STORY_NAME", "STORY_PROCESS", "STORY_CARD_RECORD"];
    const seen = new Set(STORY_FIXTURES.flatMap((f) => f.codes));
    for (const c of need) expect(seen.has(c), c).toBe(true);
    expect(STORY_FIXTURES.filter((f) => f.expect === "PASS").length).toBeGreaterThanOrEqual(6);
    expect(STORY_FIXTURES.filter((f) => f.inV1Calibration).length).toBeGreaterThanOrEqual(10);
  });
});

describe("the four rules Leo added on 2026-10-14", () => {
  const by = (id: string) => STORY_FIXTURES.find((f) => f.id === id)!;
  it("a quotation without written permission is blocked; with written permission it must be word for word", () => {
    expect(storyVerdict(storyFindings(by("FAKE-18").card, by("FAKE-18").text))).toBe("BLOCKED");
    expect(storyVerdict(storyFindings(by("FAKE-19").card, by("FAKE-19").text))).toBe("PASS");
    expect(storyVerdict(storyFindings(by("FAKE-20").card, by("FAKE-20").text))).toBe("BLOCKED");
    expect(storyCardErrors(storyCard.parse({ ...by("FAKE-09").card, quotes: [{ text: "It helped.", permission_ref: "FAKE-PERM-9" }] })).join()).toContain("needs written seller permission");
  });
  it("region-level location passes; a city or neighborhood needs Juan's recorded approval", () => {
    expect(storyVerdict(storyFindings(by("FAKE-22").card, by("FAKE-22").text))).toBe("PASS");
    expect(storyVerdict(storyFindings(by("FAKE-21").card, by("FAKE-21").text))).toBe("BLOCKED");
    expect(storyVerdict(storyFindings(by("FAKE-25").card, by("FAKE-25").text))).toBe("PASS");
    for (const r of REGION_NAMES) expect(storyCardErrors(storyCard.parse({ ...by("FAKE-22").card, location: { level: "region", text: r, juan_approved_on: null } }))).toEqual([]);
    expect(storyCardErrors(storyCard.parse({ ...by("FAKE-22").card, location: { level: "city", text: "Oakland", juan_approved_on: null } })).join()).toContain("Juan's recorded approval");
    expect(storyCardErrors(storyCard.parse({ ...by("FAKE-22").card, location: { level: "region", text: "Oakland", juan_approved_on: null } })).join()).toContain("a region must be");
  });
  it("only Leo changes a gate; Yellow becomes Green only after the approver's approval (Cherry; Juan may also approve) is recorded", () => {
    expect(storyCardErrors(by("FAKE-27").card).join()).toContain("only Leo changes a gate");
    expect(storyCardErrors(by("FAKE-28").card).join()).toContain("only after the approver's approval");
    const ok = storyCard.parse({ ...by("FAKE-28").card, gate: { ...by("FAKE-28").card.gate, approval_on: "2026-10-14", approved_by: "Cherry" } });
    expect(storyCardErrors(ok)).toEqual([]);
  });
  it("a process description uses Juan-approved wording only, and none exists yet", () => {
    expect(APPROVED_PROCESS_WORDING).toEqual([]);
    expect(storyVerdict(storyFindings(by("FAKE-23").card, by("FAKE-23").text))).toBe("BLOCKED");
    expect(storyCardErrors(storyCard.parse({ ...by("FAKE-09").card, process_wording_ids: ["FAKE-PW-1"] })).join()).toContain("not Juan-approved");
    expect(storyVerdict(storyFindings(by("FAKE-24").card, by("FAKE-24").text))).toBe("BLOCKED");          // the same card WITHOUT the (fake) approved list: the id is not approved
    expect(storyVerdict(storyFindings(by("FAKE-24").card, by("FAKE-24").text, { approvedProcess: by("FAKE-24").approvedProcess }))).toBe("PASS");
  });
});

describe("the card schema is strict", () => {
  const card = STORY_FIXTURES[0].card;
  it("refuses unknown keys such as approved or published, and a fact with no verified field", () => {
    expect(storyCard.safeParse({ ...card, approved: true }).success).toBe(false);
    expect(storyCard.safeParse({ ...card, published: true }).success).toBe(false);
    expect(storyCard.safeParse({ ...card, facts: [{ id: "f1", kind: "action", text: "We purchased the home." }] }).success).toBe(false);
    expect(storyCard.safeParse({ ...card, gate: { ...card.gate, color: "blue" } }).success).toBe(false);
  });
  it("written permission needs its document and date; a photo that could identify the property is refused", () => {
    expect(storyCardErrors(storyCard.parse({ ...card, permission: { status: "written", doc_ref: null, on: null } })).join()).toContain("document reference");
    expect(storyCardErrors(storyCard.parse({ ...card, photos: [{ status: "identifiable", approver_ok_on: null }] })).join()).toContain("identify the property");
    expect(storyCardErrors(storyCard.parse({ ...card, photos: [{ status: "not_identifiable", approver_ok_on: null }] })).join()).toContain("the approver's OK");
    expect(storyCardErrors(storyCard.parse({ ...card, photos: [{ status: "not_identifiable", approver_ok_on: "2026-10-14" }] }))).toEqual([]);
  });
});

describe("the checks never write anything and never publish", () => {
  it("they return findings only, and the verdict of a clean story is PASS, which is not an approval", () => {
    const fx = STORY_FIXTURES[0];
    const before = JSON.stringify(fx.card);
    const f = storyFindings(fx.card, fx.text);
    expect(f).toEqual([]);
    expect(JSON.stringify(fx.card)).toBe(before);
    expect(storyVerdict(f)).toBe("PASS");
  });
});

describe("SR-18 (2026-10-14): a brief, general, verified reason for the sale is allowed; specifics about a person are not", () => {
  const by = (id: string) => STORY_FIXTURES.find((f) => f.id === id)!;
  it("'the owners could no longer keep up with the home' passes (FAKE-01 and FAKE-30)", () => {
    for (const id of ["FAKE-01", "FAKE-30"]) expect(storyFindings(by(id).card, by(id).text), id).toEqual([]);
  });
  it("a death, a job, an illness or money trouble is blocked even when it is a verified fact in the record", () => {
    for (const id of ["FAKE-31", "FAKE-32", "FAKE-33"]) {
      const fx = by(id);
      expect(fx.card.facts.every((f) => f.verified), `${id} facts are verified`).toBe(true);
      const f = storyFindings(fx.card, fx.text);
      expect(storyVerdict(f), id).toBe("BLOCKED");
      expect(f.map((x) => x.code), id).toContain("STORY_IDENTIFYING");
    }
  });
  it("the specifics SR-18 lists are all caught: age, health, deaths, family members, jobs, relationships, finances", () => {
    const card = by("FAKE-01").card;
    for (const t of ["The owner was 82 years old.", "The owner was in her eighties.", "The owner had dementia.", "The owner passed away.", "The owner's son wanted to sell.", "She was a schoolteacher.", "They were going through a divorce.", "The owners were laid off.", "They had a lot of debt."]) expect(storyFindings(card, t).map((x) => x.code), t).toContain("STORY_IDENTIFYING");
  });
  it("the approver is Cherry (Juan may also approve); a Yellow-to-Green record names who approved and when", () => {
    expect([...APPROVERS]).toEqual(["Cherry", "Juan"]);
    const g = by("FAKE-28").card.gate;
    expect(storyCardErrors(storyCard.parse({ ...by("FAKE-28").card, gate: { ...g, approval_on: "2026-10-14", approved_by: "Cherry" } }))).toEqual([]);
    expect(storyCardErrors(storyCard.parse({ ...by("FAKE-28").card, gate: { ...g, approval_on: "2026-10-14", approved_by: "Juan" } }))).toEqual([]);
    expect(storyCardErrors(storyCard.parse({ ...by("FAKE-28").card, gate: { ...g, approval_on: "2026-10-14" } })).join()).toContain("who approved and when");
    expect(storyCard.safeParse({ ...by("FAKE-28").card, gate: { ...g, approved_by: "Leo" } }).success).toBe(false);          // Leo is the operator, never an approver
  });
  it("a city still needs JUAN's recorded approval (a service-area decision), not the approver's", () => {
    expect(storyCardErrors(storyCard.parse({ ...by("FAKE-25").card, location: { level: "city", text: "Oakland", juan_approved_on: null } })).join()).toContain("Juan's recorded approval");
  });
});
