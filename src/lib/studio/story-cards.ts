// Phase 3e, Stage 6 part B: case studies and seller stories (standing rules SR-18 to SR-20, docs/references/standing-rules.md).
// A STORY CARD is the record Leo supplies (Content HQ); a story DRAFT is the text written from it. This file is the card schema and the deterministic checks run on every draft;
// V1 reads the same draft independently (prompt 1.7.0, "Story check"), and the code refuses a V1 PASS where these checks found something. Pure functions: no database, no model.
// Real story cards never enter the repository or a test: every example in the tests is labelled FAKE and made up.
import { z } from "zod";
import { brandRuleFindings } from "./brand-check";
import { localNamesIn } from "./legal-flags";

export const STORY_GATES = ["green", "yellow", "red", "research_only"] as const;
export type StoryGate = (typeof STORY_GATES)[number];
/** Juan-approved process wording ("what we generally do"). NONE EXISTS YET (Leo, 2026-10-14): until Juan approves one, a seller story describes the situation only (process wording stays Juan's decision). */
export type ApprovedProcess = { id: string; text: string };
export const APPROVED_PROCESS_WORDING: ApprovedProcess[] = [];
/** Who approves articles, case studies and seller stories (SR-8, 2026-10-14): Cherry (COO); Juan may also approve. Juan alone decides brand facts, service area (so a city), as-is wording and process wording. */
export const APPROVERS = ["Cherry", "Juan"] as const;
export const REGION_NAMES = ["the Bay Area", "the Peninsula", "the East Bay", "the North Bay", "the South Bay"] as const;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const verified = z.strictObject({ record_ref: z.string().trim().min(3), checked_by: z.string().trim().min(2), checked_on: date });
export const storyFact = z.strictObject({
  id: z.string().regex(/^f\d{1,2}$/),
  kind: z.enum(["number", "condition", "action", "outcome", "situation"]),
  text: z.string().trim().min(5).max(400),
  verified: verified.nullable(),                       // null = NOT verified: the fact is dropped, never written
});
export const storyCard = z.strictObject({
  story_id: z.string().trim().min(3),                  // internal id, never printed
  type: z.enum(["case_study", "seller_story"]),
  gate: z.strictObject({ color: z.enum(STORY_GATES), set_by: z.string().trim().min(2), set_on: date, from: z.enum(STORY_GATES).nullable().default(null), approval_on: date.nullable().default(null), approved_by: z.enum(APPROVERS).nullable().default(null) }),
  source: z.string().trim().min(3),                    // the Content HQ reference
  approval: z.strictObject({ status: z.enum(["none", "pending", "approved"]), on: date.nullable(), by: z.enum(APPROVERS).nullable().default(null) }).default({ status: "none", on: null, by: null }),   // the approver's approval of this story (Cherry; Juan may also approve)
  permission: z.strictObject({ status: z.enum(["none", "written"]), doc_ref: z.string().nullable(), on: date.nullable() }).default({ status: "none", doc_ref: null, on: null }),
  quotes: z.array(z.strictObject({ text: z.string().trim().min(3), permission_ref: z.string().trim().min(3) })).default([]),
  location: z.strictObject({ level: z.enum(["none", "region", "city", "neighborhood"]), text: z.string().nullable(), juan_approved_on: date.nullable() }).default({ level: "none", text: null, juan_approved_on: null }),
  facts: z.array(storyFact).min(1).max(30),
  property_type: z.string().optional(),
  photos: z.array(z.strictObject({ status: z.enum(["none", "identifiable", "not_identifiable"]), approver_ok_on: date.nullable() })).default([]),
  situation_type: z.string().optional(),
  reader_takeaway: z.string().nullable().default(null),   // one sentence with no promise
  process_wording_ids: z.array(z.string()).default([]),   // ids of Juan-approved process wording the story may use (none exist yet)
});
export type StoryCard = z.infer<typeof storyCard>;
export type StoryLevel = "BLOCK" | "HOLD" | "REFUSE";
export type StoryFinding = { code: string; rule: "SR-18" | "SR-19" | "SR-20" | "SR-3" | "SR-7"; level: StoryLevel; detail: string };
export type StoryVerdict = "PASS" | "BLOCKED" | "HELD_FOR_JUAN" | "REFUSED";

const F = (code: string, rule: StoryFinding["rule"], level: StoryLevel, detail: string): StoryFinding => ({ code, rule, level, detail });

// ---------- the card itself ----------
/** Problems with the record, before any text is written (who set the gate, permission, location approval, process wording, fact kinds). */
export function storyCardErrors(card: StoryCard, approved: ApprovedProcess[] = APPROVED_PROCESS_WORDING): string[] {
  const e: string[] = [];
  if (card.gate.set_by !== "Leo") e.push(`the gate was set by "${card.gate.set_by}"; only Leo changes a gate (SR-20)`);
  if (card.gate.color === "green" && card.gate.from === "yellow" && (!card.gate.approval_on || !card.gate.approved_by)) e.push("a Yellow story becomes Green only after the approver's approval is recorded, with who approved and when (Cherry; Juan may also approve) (SR-20)");
  if (card.permission.status === "written" && (!card.permission.doc_ref || !card.permission.on)) e.push("written permission needs its document reference and date (SR-19)");
  if (card.quotes.length && card.permission.status !== "written") e.push("a quotation needs written seller permission on file; there is none (SR-19)");
  if ((card.location.level === "city" || card.location.level === "neighborhood") && (!card.location.text || !card.location.juan_approved_on)) e.push("a city or neighborhood needs Juan's recorded approval (SR-18, SR-19)");
  if (card.location.level === "region" && !(REGION_NAMES as readonly string[]).includes(card.location.text ?? "")) e.push(`a region must be one of: ${REGION_NAMES.join(", ")} (SR-18, SR-19)`);
  for (const id of card.process_wording_ids) if (!approved.some((a) => a.id === id)) e.push(`process wording ${id} is not Juan-approved; none exists yet (SR-19)`);
  if (card.type === "seller_story") for (const f of card.facts) if (!["situation", "condition"].includes(f.kind)) e.push(`seller story fact ${f.id} is a ${f.kind}; until Juan approves process wording a seller story describes the situation only (SR-19)`);
  for (const p of card.photos) {
    if (p.status === "identifiable") e.push("a photo that could identify the property is not allowed (SR-18)");
    if (p.status === "not_identifiable" && !p.approver_ok_on) e.push("a photo needs the approver's OK even when the property cannot be identified (SR-18)");
  }
  return e;
}

// ---------- word lists for the text checks ----------
const STOP = new Set("the and for with that this was were are has had have from they them their there then than into onto about over under after before while which who whom whose what when where how not but its our out you your can will would could should may might one also very more most some any each other such only just".split(" "));
const words = (s: string): string[] => s.toLowerCase().replace(/[^a-z' ]+/g, " ").split(/\s+/).map((w) => w.replace(/^'+|'+$/g, "")).filter((w) => w.length >= 3 && !STOP.has(w));
const sentencesOf = (t: string) => t.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=[A-Z“"‘'])/).map((x) => x.trim()).filter(Boolean);
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

const MONEY = /\$\s?\d|\b\d[\d,.]*\s?(?:k|thousand|million|billion)\b|\b\d[\d,.]*\s?dollars?\b/i;
const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const DATE_RES = [new RegExp(`\\b${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "i"), new RegExp(`\\b${MONTH}\\.?,?\\s+(?:19|20)\\d{2}\\b`, "i"), /\b(?:19|20)\d{2}-\d{2}-\d{2}\b/, /\b\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})\b/, /\b(?:in|since|during|by|of)\s+(?:19|20)\d{2}\b/i];
const STREET = /\b\d{1,5}\s+(?:[NSEW]\.?\s+)?[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)?\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Way|Ln|Lane|Ct|Court|Pl|Place|Ter|Terrace|Hwy|Highway)\b\.?|\b(?:APN|parcel number|unit\s*#)\s*[\w-]+/;
const NEIGHBORHOODS = ["noe valley", "mission district", "sunset district", "richmond district", "pacific heights", "nob hill", "north beach", "oakland hills", "rockridge", "montclair", "temescal", "haight", "excelsior", "bayview", "hunters point", "diamond heights", "twin peaks", "bernal heights", "east oakland", "west oakland", "glen park", "potrero hill", "dogpatch", "cow hollow", "marina district", "tenderloin", "chinatown", "visitacion valley", "ingleside", "oceanview", "portola", "crocker amazon"];
const NEIGHBORHOOD_RE = /\b[A-Z][a-z]+\s+(?:Hills?|Heights|District|Valley|Flats|Beach|Terrace|Gardens)\b/g;
const IDENTIFYING = [
  /\b(?:retired|widow(?:ed|er)?|veteran|elderly|single (?:mother|father|mom|dad))\b/i,
  /\b(?:school ?teacher|teacher|nurse|doctor|lawyer|attorney|firefighter|police officer|engineer|professor|pastor|farmer|chef|carpenter|plumber)\b/i,
  /\b\d{1,3}[- ]years?[- ]old\b|\bin (?:his|her|their) (?:\d0s|(?:twenties|thirties|forties|fifties|sixties|seventies|eighties|nineties))\b|\bage[sd]? \d{2}\b/i,
  /\b(?:owners?|sellers?)['’]s?\s+(?:husband|wife|spouse|son|daughter|mother|father|brother|sister|grandson|granddaughter|nephew|niece|partner)\b/i,
  /\bwhose\s+(?:husband|wife|son|daughter|mother|father|brother|sister|spouse)\b|\b(?:her|his|their)\s+(?:late\s+)?(?:husband|wife|spouse|son|daughter|mother|father|brother|sister)\b/i,
  /\b(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+[A-Z][a-z]+|\b(?:named|called)\s+[A-Z][a-z]+|\b(?:the|a)\s+[A-Z][a-z]+\s+family\b/,
];
// Specifics about a person (SR-18, 2026-10-14): age, health, deaths, family members, jobs, relationships, finances. A brief, general reason for the sale ("could no longer keep up with the home") is allowed.
const PERSON_SPECIFICS = /\b(?:died|passed away|passed on|death of|deceased|bereave\w*|diagnos\w+|illness|ill health|cancer|dementia|alzheimer\w*|stroke|disabled|disability|hospitali[sz]\w*|surgery|divorc\w+|separat(?:ed|ion)|bankrupt\w*|foreclos\w+|behind on (?:the )?(?:payments?|mortgage|taxes)|laid off|lost (?:his|her|their) job|unemployed|medical bills|financial (?:trouble|hardship|difficult\w*)|debt)\b/i;
const KNOWN_PROPER = new Set(["twin home", "home buyer", "bay area", "east bay", "north bay", "south bay", "san francisco", "san mateo", "san carlos", "daly city", "redwood city", "palo alto", "south san", "san jose"]);
const SPECIFIC_PERSON = /\b(?:one|a|another|the|this)\s+(?:woman|man|seller|owner|homeowner|widow|couple|family|client|heir|daughter|son|lady|gentleman)\s+(?:we|who|that we|named|from|whose|came|called|reached|contacted)\b|\bone of our (?:sellers|clients|homeowners|families)\b/i;
const PROMISE_RES = [
  /\bwe(?:'ll|\s+will|\s+can|\s+promise|\s+guarantee|\s+always)\b[^.!?]{0,80}\b(?:close|pay|buy|purchase|get you|take care|handle|make you|fix|clear|sell|offer|help you|solve)\b/i,
  /\b(?:guarantee[sd]?|promise[sd]?|no fees?|no obligation|no risk|hassle[- ]free|stress[- ]free|worry[- ]free)\b/i,
  /\b(?:in|within)\s+(?:as little as\s+)?\d+\s*(?:days?|hours?|weeks?)\b|\b(?:fast|quick|quickly|immediately|same[- ]day|overnight)\s+(?:cash|close|closing|sale|offer)\b/i,
  /\b(?:cash offer|all[- ]cash|fair (?:cash )?offer|top dollar|highest price|best price)\b/i,
  /\byou(?:'ll|\s+will)\s+(?:get|receive|walk away|be able|save|sell|close)\b/i,
];
const COMPOSITE = /\b(?:composite|combination of|amalgam|blend of|fictional|made[- ]up|hypothetical|imagine\s+(?:a|an|that|you)|let'?s say|for example,? (?:a|one) (?:family|seller|owner)|a typical (?:seller|family|owner|case)|names? (?:and|or) details? (?:have been )?changed)\b/i;
const TESTIMONIAL = /\b(?:thanks to (?:us|twin|them)|treated us like family|couldn'?t have done it without|highly recommend|best decision (?:we|i) ever|life[- ]?saver|saved us|forever grateful|so grateful|couldn'?t be happier)\b/i;
const ATTRIBUTION = /\b(?:she|he|they|the (?:owner|seller|family|daughter|son|widow))\s+(?:said|told us|shared|recalled|explained|added|wrote)\b|\bin (?:her|his|their) words\b|\baccording to (?:the|one|a)\s+(?:seller|owner|family)\b/i;
const QUOTED = /“([^”]{3,})”|"([^"]{3,})"|‘([^’]{3,})’/g;
const PROCESS = /\b(?:we|twin home buyer)\s+(?:(?:also|then|usually|typically|generally|first|always)\s+)?(?:clear(?:s|ed)?|clean(?:s|ed)?|repair(?:s|ed)?|remodel(?:s|ed)?|fix(?:es|ed)?|buy|buys|bought|purchase[sd]?|handle[sd]? the|take(?:s)? care|walk(?:s|ed)?\s+\w+\s+through|manage[sd]?|coordinate[sd]?|pay|pays|paid|close[sd]?|sell(?:s)?|list(?:s)?|offer(?:s|ed)?|arrange[sd]?|haul(?:s|ed)?|donate[sd]?|help(?:s|ed)?\s+(?:them|you|families|sellers)\s+(?:with|through|to))\b|\b(?:clear(?:s|ed|ing)? out|handle(?:s|d)? the (?:repairs|paperwork|cleanout|sale|details))\b/i;

/** Every check on one story draft. Empty means the text may go on to V1 and then to Juan; it is never a publication. */
export function storyFindings(card: StoryCard, text: string, opts: { approvedProcess?: ApprovedProcess[] } = {}): StoryFinding[] {
  const out: StoryFinding[] = [];
  const approved = opts.approvedProcess ?? APPROVED_PROCESS_WORDING;
  const sr = card.type === "case_study" ? "SR-18" : "SR-19";
  // the gate (SR-20): Red and Research-only are never used; Yellow waits for Juan
  if (card.gate.color === "red" || card.gate.color === "research_only") return [F("STORY_GATE_REFUSED", "SR-20", "REFUSE", `the gate is ${card.gate.color === "red" ? "Red" : "Research-only"}: this content is never used`)];
  if (card.gate.color === "yellow") out.push(F("STORY_HELD_FOR_JUAN", "SR-20", "HOLD", "the gate is Yellow: held for Juan; it is not used until Juan's approval is recorded and Leo changes the gate to Green"));
  for (const e of storyCardErrors(card, approved)) out.push(F("STORY_CARD_RECORD", "SR-20", "BLOCK", e));

  const plain = text.replace(/\s+/g, " ").trim();
  // unverified facts are dropped: neither their sentence nor their numbers may appear
  for (const f of card.facts.filter((x) => !x.verified)) {
    const nums = f.text.match(/\d[\d,.]*/g) ?? [];
    if (norm(plain).includes(norm(f.text).replace(/[.!?]+$/, "")) || nums.some((n) => plain.includes(n.replace(/[.,]+$/, "")))) out.push(F("STORY_UNVERIFIED_FACT", sr, "BLOCK", `fact ${f.id} ("${f.text.slice(0, 60)}") is not verified against a record, so it cannot appear`));
  }
  // money, dates, addresses (SR-18; the same applies to a seller story)
  if (MONEY.test(plain)) out.push(F("STORY_MONEY", sr, "BLOCK", "a dollar amount appears; use general terms such as a price band, never an exact figure"));
  for (const re of DATE_RES) if (re.test(plain)) { out.push(F("STORY_DATE", sr, "BLOCK", "an exact date or year appears; use general terms such as \"several months\"")); break; }
  if (STREET.test(plain)) out.push(F("STORY_ADDRESS", sr, "BLOCK", "an address or parcel number appears"));
  // location: region-level is fine; a city or neighborhood only with Juan's recorded approval
  const lower = plain.toLowerCase();
  const places = new Set<string>([...localNamesIn(plain), ...NEIGHBORHOODS.filter((n) => lower.includes(n)), ...[...plain.matchAll(NEIGHBORHOOD_RE)].map((m) => m[0].toLowerCase())]);
  const okPlace = card.location.juan_approved_on && card.location.text && (card.location.level === "city" || card.location.level === "neighborhood") ? card.location.text.toLowerCase() : "";
  for (const p of places) if (!okPlace || !okPlace.includes(p)) out.push(F("STORY_LOCATION", sr, "BLOCK", `"${p}" is a city or neighborhood; only a region ("the Bay Area", "the Peninsula", "the East Bay") is allowed without Juan's recorded approval`));
  // identifying detail, personal names, a specific person
  for (const re of [...IDENTIFYING, PERSON_SPECIFICS]) { const m = re.exec(plain); if (m) { out.push(F("STORY_IDENTIFYING", "SR-7", "BLOCK", `"${m[0]}" is a specific about a person (age, health, death, family member, job, relationship or finances); a case study may give only a brief, general reason for the sale (SR-18, SR-19, SR-7)`)); break; } }
  for (const s of sentencesOf(plain)) {
    const toks = s.split(/\s+/);
    for (let i = 0; i < toks.length - 1; i++) {
      const a = toks[i].replace(/[^A-Za-z'-]/g, ""), b = toks[i + 1].replace(/[^A-Za-z'-]/g, "");
      if (/^[A-Z][a-z]+$/.test(a) && /^[A-Z][a-z]+$/.test(b) && !KNOWN_PROPER.has(`${a} ${b}`.toLowerCase()) && !places.has(`${a} ${b}`.toLowerCase()) && !/^(?:Health|Civil|Penal|Bay|East|North|South|Twin|Home)$/.test(a)) { out.push(F("STORY_NAME", "SR-7", "BLOCK", `"${a} ${b}" looks like a person's name`)); break; }
    }
  }
  if (card.type === "case_study") { const m = /\b(?:the|this|their|his|her)\s+(?:owners?['’]s?\s+)?family\b|\bthe owners?['’]s?\s+family\b|\bfamily of the owners?\b/i.exec(plain); if (m) out.push(F("STORY_IDENTIFYING", "SR-18", "BLOCK", `"${m[0]}" refers to the owner's family: family members are a specific about a person; give only a brief, general reason for the sale (for example "the owners could no longer keep up with the home")`)); }
  if (card.type === "seller_story" && SPECIFIC_PERSON.test(plain)) out.push(F("STORY_SPECIFIC_PERSON", "SR-19", "BLOCK", "the story points to one specific person or family; describe the situation type, not a person"));
  // promises, testimonial framing, composites
  for (const re of PROMISE_RES) { const m = re.exec(plain); if (m) { out.push(F("STORY_PROMISE", sr, "BLOCK", `"${m[0]}" is a promise or an implied result for the reader`)); break; } }
  if (TESTIMONIAL.test(plain)) out.push(F("STORY_TESTIMONIAL", sr, "BLOCK", "testimonial framing"));
  if (COMPOSITE.test(plain)) out.push(F("STORY_INVENTED", "SR-20", "BLOCK", "a composite, hypothetical or invented person or property; only what is in the record may be written"));
  // quotations: only with written permission, word for word, never edited
  const quoted = [...plain.matchAll(QUOTED)].map((m) => (m[1] ?? m[2] ?? m[3]).trim());
  const allowedQuotes = card.permission.status === "written" ? card.quotes.map((q) => q.text.trim()) : [];
  for (const q of quoted) if (!allowedQuotes.includes(q)) out.push(F("STORY_QUOTE", "SR-19", "BLOCK", card.permission.status === "written" ? `the quotation "${q.slice(0, 50)}" is not word for word in the permitted quotes` : `a quotation appears but there is no written seller permission on file ("${q.slice(0, 50)}")`));
  if (ATTRIBUTION.test(plain) && card.permission.status !== "written") out.push(F("STORY_QUOTE", "SR-19", "BLOCK", "a statement attributed to a seller (\"she said\", \"told us\") without written permission on file"));
  // process: a seller story describes the situation only, unless the sentence is Juan-approved process wording
  if (card.type === "seller_story") for (const s of sentencesOf(plain)) if (PROCESS.test(s) && !approved.some((a) => card.process_wording_ids.includes(a.id) && norm(a.text) === norm(s))) { out.push(F("STORY_PROCESS", "SR-19", "BLOCK", `"${s.slice(0, 80)}" describes what we do; only Juan-approved process wording may (none exists yet)`)); break; }
  // brand and service area (SR-3 and editorial standards section 7), on the plain text
  for (const b of brandRuleFindings(`<p>${plain.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`)) out.push(F(b.code === "BRAND_SERVICE_AREA" ? "STORY_SERVICE_AREA" : "STORY_BRAND", "SR-3", "BLOCK", b.detail));
  // nothing "for color": every sentence must rest on a verified fact (or the takeaway, a permitted quote, or approved process wording)
  const support = [...card.facts.filter((f) => f.verified).map((f) => words(f.text)), ...(card.reader_takeaway ? [words(card.reader_takeaway)] : []), ...allowedQuotes.map(words), ...approved.filter((a) => card.process_wording_ids.includes(a.id)).map((a) => words(a.text))];
  for (const s of sentencesOf(plain)) {
    const sw = words(s); if (!sw.length) continue;
    if (!support.some((fw) => { const set = new Set(fw); return sw.filter((w) => set.has(w)).length / sw.length >= 0.75; })) out.push(F("STORY_NOT_IN_RECORD", "SR-20", "BLOCK", `"${s.slice(0, 80)}" is not supported by a verified fact in the record (nothing may be added "for color")`));
  }
  return out;
}

export const storyVerdict = (f: StoryFinding[]): StoryVerdict => (f.some((x) => x.level === "REFUSE") ? "REFUSED" : f.some((x) => x.level === "BLOCK") ? "BLOCKED" : f.some((x) => x.level === "HOLD") ? "HELD_FOR_JUAN" : "PASS");
