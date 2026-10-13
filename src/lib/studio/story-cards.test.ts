import { describe, expect, it } from "vitest";
import { storyCard, storyCardErrors, storyFindings, storyVerdict, APPROVED_PROCESS_WORDING, REGION_NAMES } from "./story-cards";
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
  it("only Leo changes a gate; Yellow becomes Green only after Juan's approval is recorded", () => {
    expect(storyCardErrors(by("FAKE-27").card).join()).toContain("only Leo changes a gate");
    expect(storyCardErrors(by("FAKE-28").card).join()).toContain("only after Juan's approval");
    const ok = storyCard.parse({ ...by("FAKE-28").card, gate: { ...by("FAKE-28").card.gate, juan_approval_on: "2026-10-14" } });
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
    expect(storyCardErrors(storyCard.parse({ ...card, photos: [{ status: "identifiable", juan_ok_on: null }] })).join()).toContain("identify the property");
    expect(storyCardErrors(storyCard.parse({ ...card, photos: [{ status: "not_identifiable", juan_ok_on: null }] })).join()).toContain("Juan's OK");
    expect(storyCardErrors(storyCard.parse({ ...card, photos: [{ status: "not_identifiable", juan_ok_on: "2026-10-14" }] }))).toEqual([]);
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
