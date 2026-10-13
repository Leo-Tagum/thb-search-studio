// FAKE story cards and drafts for calibrating the story checks (SR-18 to SR-20). EVERYTHING HERE IS MADE UP: invented people, places and numbers; no real seller, deal or address ever
// enters the repository or a test. Each fixture says what the checks must do with it; the same fixtures go through the real V1 (calibration, prompt 1.7.0).
import { storyCard, type ApprovedProcess, type StoryCard, type StoryVerdict } from "./story-cards";

const V = (n: number) => ({ record_ref: `FAKE-REC-${n}`, checked_by: "Leo", checked_on: "2026-10-14" });
const GATE = { color: "green" as const, set_by: "Leo", set_on: "2026-10-14", from: null, juan_approval_on: null };
type Over = Record<string, unknown>;
const caseCard = (over: Over = {}): StoryCard => storyCard.parse({
  story_id: "FAKE-CS-001", type: "case_study", gate: GATE, source: "FAKE Content HQ ref", property_type: "single-family home",
  facts: [
    { id: "f1", kind: "situation", text: "The owner's family could no longer keep up with the home.", verified: V(1) },
    { id: "f2", kind: "action", text: "We purchased the home.", verified: V(2) },
    { id: "f3", kind: "action", text: "We cleared the belongings and made repairs.", verified: V(3) },
    { id: "f4", kind: "outcome", text: "The home was later resold.", verified: V(4) },
    { id: "f5", kind: "number", text: "We spent about $85,000 on repairs.", verified: null },
  ], ...over,
});
const sellerCard = (over: Over = {}): StoryCard => storyCard.parse({
  story_id: "FAKE-SS-001", type: "seller_story", gate: GATE, source: "FAKE Content HQ ref", situation_type: "inherited house full of belongings",
  facts: [
    { id: "f1", kind: "situation", text: "We have worked with families who inherited a house full of a parent's belongings.", verified: V(11) },
    { id: "f2", kind: "situation", text: "Many of them did not know where to start.", verified: V(12) },
  ], reader_takeaway: "If this sounds familiar, you are not alone.", ...over,
});
const CASE = "The owner's family could no longer keep up with the home. We purchased the home. We cleared the belongings and made repairs. The home was later resold.";
const SELLER = "We have worked with families who inherited a house full of a parent's belongings. Many of them did not know where to start. If this sounds familiar, you are not alone.";
const sellerFacts = (extra: object[] = []) => [{ id: "f1", kind: "situation", text: "We have worked with families who inherited a house full of a parent's belongings.", verified: V(11) }, { id: "f2", kind: "situation", text: "Many of them did not know where to start.", verified: V(12) }, ...extra];

export type StoryFixture = { id: string; label: string; card: StoryCard; text: string; expect: StoryVerdict; codes: string[]; approvedProcess?: ApprovedProcess[]; inV1Calibration?: boolean };
export const STORY_FIXTURES: StoryFixture[] = [
  { id: "FAKE-01", label: "clean case study (Green, all facts verified)", card: caseCard(), text: CASE, expect: "PASS", codes: [], inV1Calibration: true },
  { id: "FAKE-02", label: "case study with a street address", card: caseCard(), text: `${CASE} The house was on 1428 Elm Street.`, expect: "BLOCKED", codes: ["STORY_ADDRESS", "STORY_NOT_IN_RECORD"], inV1Calibration: true },
  { id: "FAKE-03", label: "case study with an exact purchase price", card: caseCard(), text: CASE.replace("We purchased the home.", "We purchased the home for $612,500."), expect: "BLOCKED", codes: ["STORY_MONEY"] },
  { id: "FAKE-04", label: "case study with an exact date", card: caseCard(), text: CASE.replace("We purchased the home.", "We purchased the home. We closed on March 4, 2025."), expect: "BLOCKED", codes: ["STORY_DATE"] },
  { id: "FAKE-05", label: "case study with an unverified number (fact f5 has no record)", card: caseCard(), text: `${CASE} We spent about $85,000 on repairs.`, expect: "BLOCKED", codes: ["STORY_UNVERIFIED_FACT", "STORY_MONEY"], inV1Calibration: true },
  { id: "FAKE-06", label: "case study with an invented detail (not in the record)", card: caseCard(), text: `${CASE} The kitchen was sunny, with original oak cabinets.`, expect: "BLOCKED", codes: ["STORY_NOT_IN_RECORD"], inV1Calibration: true },
  { id: "FAKE-07", label: "case study naming a neighborhood without Juan's approval", card: caseCard(), text: `${CASE} The home was in the Oakland hills.`, expect: "BLOCKED", codes: ["STORY_LOCATION"] },
  { id: "FAKE-08", label: "clean case study, Yellow gate", card: caseCard({ gate: { ...GATE, color: "yellow" } }), text: CASE, expect: "HELD_FOR_JUAN", codes: ["STORY_HELD_FOR_JUAN"], inV1Calibration: true },
  { id: "FAKE-09", label: "clean seller story (Green, situation only)", card: sellerCard(), text: SELLER, expect: "PASS", codes: [], inV1Calibration: true },
  { id: "FAKE-10", label: "seller story with a promise (\"we'll close in 7 days and pay cash\")", card: sellerCard(), text: `${SELLER} We'll close in 7 days and pay cash.`, expect: "BLOCKED", codes: ["STORY_PROMISE"], inV1Calibration: true },
  { id: "FAKE-11", label: "seller story with identifying detail (occupation, family detail, city)", card: sellerCard(), text: "A retired schoolteacher from San Mateo, whose husband had passed, came to us.", expect: "BLOCKED", codes: ["STORY_IDENTIFYING", "STORY_LOCATION"], inV1Calibration: true },
  { id: "FAKE-12", label: "seller story that is a composite", card: sellerCard(), text: `${SELLER} This is a composite of three families we have helped.`, expect: "BLOCKED", codes: ["STORY_INVENTED"] },
  { id: "FAKE-13", label: "seller story with a testimonial and a quote", card: sellerCard(), text: `${SELLER} “They treated us like family,” she said.`, expect: "BLOCKED", codes: ["STORY_QUOTE", "STORY_TESTIMONIAL"] },
  { id: "FAKE-14", label: "seller story with a service-area claim", card: sellerCard(), text: `${SELLER} We buy houses in Daly City.`, expect: "BLOCKED", codes: ["STORY_SERVICE_AREA", "STORY_LOCATION", "STORY_PROCESS"] },
  { id: "FAKE-15", label: "seller story naming a seller who only gave verbal permission", card: sellerCard(), text: "Maria Lopez gave us her OK by phone to share her story.", expect: "BLOCKED", codes: ["STORY_NAME"] },
  { id: "FAKE-16", label: "Red story", card: sellerCard({ gate: { ...GATE, color: "red" } }), text: SELLER, expect: "REFUSED", codes: ["STORY_GATE_REFUSED"] },
  { id: "FAKE-17", label: "Research-only story", card: caseCard({ gate: { ...GATE, color: "research_only" } }), text: CASE, expect: "REFUSED", codes: ["STORY_GATE_REFUSED"] },
  { id: "FAKE-18", label: "a quotation with no written permission on file", card: sellerCard(), text: `${SELLER} “It was a relief to have help.”`, expect: "BLOCKED", codes: ["STORY_QUOTE"], inV1Calibration: true },
  { id: "FAKE-19", label: "a quotation with written permission, word for word", card: sellerCard({ permission: { status: "written", doc_ref: "FAKE-PERM-1", on: "2026-10-14" }, quotes: [{ text: "It was a relief to have help.", permission_ref: "FAKE-PERM-1" }] }), text: `${SELLER} “It was a relief to have help.”`, expect: "PASS", codes: [] },
  { id: "FAKE-20", label: "a permitted quotation that was edited", card: sellerCard({ permission: { status: "written", doc_ref: "FAKE-PERM-1", on: "2026-10-14" }, quotes: [{ text: "It was a relief to have help.", permission_ref: "FAKE-PERM-1" }] }), text: `${SELLER} “It was a big relief to have help.”`, expect: "BLOCKED", codes: ["STORY_QUOTE"] },
  { id: "FAKE-21", label: "city-level location without Juan's approval", card: sellerCard({ facts: sellerFacts() }), text: "We have worked with families in San Mateo who inherited a house full of a parent's belongings. Many of them did not know where to start.", expect: "BLOCKED", codes: ["STORY_LOCATION"], inV1Calibration: true },
  { id: "FAKE-22", label: "region-level location (the Bay Area)", card: sellerCard({ location: { level: "region", text: "the Bay Area", juan_approved_on: null }, facts: [{ id: "f1", kind: "situation", text: "We have worked with families across the Bay Area who inherited a house full of a parent's belongings.", verified: V(11) }, { id: "f2", kind: "situation", text: "Many of them did not know where to start.", verified: V(12) }] }), text: "We have worked with families across the Bay Area who inherited a house full of a parent's belongings. Many of them did not know where to start.", expect: "PASS", codes: [], inV1Calibration: true },
  { id: "FAKE-23", label: "a process description that is not Juan-approved wording", card: sellerCard(), text: `${SELLER} We clear out the house, handle the repairs and buy it directly.`, expect: "BLOCKED", codes: ["STORY_PROCESS"], inV1Calibration: true },
  { id: "FAKE-24", label: "a process sentence that IS Juan-approved wording (a made-up approval, for the test only)", card: sellerCard({ process_wording_ids: ["FAKE-PW-1"] }), text: `${SELLER} We walk families through each option.`, expect: "PASS", codes: [], approvedProcess: [{ id: "FAKE-PW-1", text: "We walk families through each option." }] },
  { id: "FAKE-25", label: "case study with a city Juan approved (recorded)", card: caseCard({ location: { level: "city", text: "Oakland", juan_approved_on: "2026-10-14" }, facts: [{ id: "f1", kind: "situation", text: "The home was in Oakland.", verified: V(21) }, { id: "f2", kind: "action", text: "We purchased the home.", verified: V(2) }] }), text: "The home was in Oakland. We purchased the home.", expect: "PASS", codes: [] },
  { id: "FAKE-26", label: "case study at region level (the Peninsula)", card: caseCard({ location: { level: "region", text: "the Peninsula", juan_approved_on: null }, facts: [{ id: "f1", kind: "situation", text: "The home was on the Peninsula.", verified: V(22) }] }), text: "The home was on the Peninsula.", expect: "PASS", codes: [] },
  { id: "FAKE-27", label: "gate changed by an agent, not Leo", card: caseCard({ gate: { ...GATE, set_by: "Agent 7" } }), text: CASE, expect: "BLOCKED", codes: ["STORY_CARD_RECORD"] },
  { id: "FAKE-28", label: "Yellow turned Green without Juan's recorded approval", card: caseCard({ gate: { ...GATE, from: "yellow" } }), text: CASE, expect: "BLOCKED", codes: ["STORY_CARD_RECORD"] },
  { id: "FAKE-29", label: "seller story whose record contains an action (process), not only the situation", card: sellerCard({ facts: sellerFacts([{ id: "f3", kind: "action", text: "We cleared everything out.", verified: V(13) }]) }), text: SELLER, expect: "BLOCKED", codes: ["STORY_CARD_RECORD"] },
];
