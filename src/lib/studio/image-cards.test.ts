import { describe, expect, it } from "vitest";
import { imageCard, imagePlanFindings, imagePlanResult, MAX_CARDS, type ImageCard, type ImageCtx, type ImagePlanResult } from "./image-cards";
import type { LedgerClaim } from "./checks";
import type { Unit } from "./schema";

// Phase 3e image planner, build step 2 (schema, checks, tests; no prompt, no migration). All text below is FAKE fixture text, modeled on the hoarder guide's shape.
const SENT1 = "California's Health and Safety Code lists conditions that can make a building substandard, such as junk and debris that are fire, health or safety hazards.";
const SENT2 = "The law counts them only when they endanger life, limb, health, property, safety or welfare.";
const DECIDER = "Whether a home meets them is for a health officer, a code enforcement officer or another local official.";
const units: Unit[] = [
  { kind: "section", key: "s1", h2: "Can you sell a packed house?", capsule: "Yes, you can sell a packed house in California. The route depends on who has authority, the condition and your timeline.", blocks: [{ t: "p", text: "Start with who holds title." }, { t: "ol", items: ["Who has authority to sign?", "What is owed?", "What does the house need?"] }], claim_ids: [], roles: [] },
  { kind: "section", key: "s2", h2: "What does state law list?", blocks: [{ t: "p", text: `${SENT1} ${SENT2}` }, { t: "table", headers: ["Question", "Answer"], rows: [["Who decides?", DECIDER]] }, { t: "p", text: "Ask the city or county what applies to your house." }], claim_ids: ["clm:1"], roles: [] },
  { kind: "section", key: "s3", h2: "Your options", blocks: [{ t: "ul", items: ["Keep the house for now", "Clear it first", "Sell it as it is"] }, { t: "p", text: "Each one costs something different in time, money or control." }], claim_ids: [], roles: [] },
  { kind: "section", key: "s4", h2: "What to do this week", blocks: [{ t: "p", text: "List the people who can sign. Gather the paperwork. Talk to a professional." }], claim_ids: [], roles: [] },
  { kind: "section", key: "s5", h2: "Local rules", blocks: [{ t: "p", text: "San Francisco keeps its own housing code, and San Mateo County has its own ordinances." }, { t: "p", text: "Local rules vary; check with your city or county." }], claim_ids: ["clm:2", "clm:3"], roles: [] },
  { kind: "faq", key: "faq", items: [{ q: "Can I sell as is?", a: "Often yes.", claim_ids: [] }, { q: "Who signs?", a: "Whoever has authority.", claim_ids: [] }, { q: "Do I clean first?", a: "Not always.", claim_ids: [] }] },
];
const ver = (over: Record<string, unknown> = {}) => ({ quote: "the condition endangers the life, limb, health, property, safety, or welfare of the occupants, as determined by the health officer or, if there is no agreement, a code enforcement officer", section: "H&S 17920.3", label: "MATCH" as const, reason: null, against: "print", gates: [], readerImpact: "none" as const, ...over });
const claim = (id: string, over: Partial<LedgerClaim> = {}): LedgerClaim => ({ id, text: "t", risk: "high", support: "supported", sourceId: "s", sourceRecheckBy: null, jurisdiction: "California", verification: ver(), ...over });
const claims = new Map<string, LedgerClaim>([
  ["clm:1", claim("clm:1")],
  ["clm:2", claim("clm:2", { jurisdiction: "San Francisco", verification: ver({ quote: "SF text", section: "SF HC 1" }) })],
  ["clm:3", claim("clm:3", { jurisdiction: "San Mateo County", verification: ver({ quote: "SM text", section: "SM 1" }) })],
]);
const ctx: ImageCtx = { units, unitHashes: { s1: "h1", s2: "h2", s3: "h3", s4: "h4", s5: "h5", faq: "hf" }, claims };

const card = (over: Partial<ImageCard> = {}): ImageCard => ({
  card_id: "img:1", unit_key: "s1", unit_hash: "h1", anchor: { after: "Can you sell a packed house?", block_index: 1 }, type: "checklist_graphic",
  purpose: "Help the reader see the three first questions at a glance.", designer_description: "A plain checklist graphic with three rows, calm navy and white, no people.",
  generation_prompt: "A plain checklist graphic with three empty rows, flat simple shapes in calm navy with orange accents on a light background, wide 16:9 composition with clear empty space on the right where the text will go. Calm, reassuring mood. No text, no letters, no people.",
  avoid: ["people or faces", "real-looking identifiable house exteriors", "addresses", "street numbers or street signs", "logos", "documents", "any text or letters in the image"],
  text_overlay: [{ text: "Who has authority to sign?", source_unit: "s1", source_block: "block:1" }, { text: "What is owed?", source_unit: "s1", source_block: "block:1" }, { text: "What does the house need?", source_unit: "s1", source_block: "block:1" }],
  claim_ids: [], alt_text: "A checklist with three questions about authority, what is owed and what the house needs.", aspect_ratio: { ratio: "16:9", width_px: 1600, height_px: 900 }, priority: "must_have",
  privacy_notes: "No people, no addresses, no documents.", ...over,
});
const skipsFor = (keys: string[]) => keys.map((unit_key) => ({ unit_key, reason: "No image helps this unit more than its text." }));
const plan = (cards: ImageCard[], skipped?: string[]): ImagePlanResult => ({ cards, skipped_units: skipsFor(skipped ?? units.map((u) => u.key).filter((k) => !cards.some((c) => c.unit_key === k))) });
const codes = (p: ImagePlanResult) => imagePlanFindings(p, ctx).map((f) => f.code);
const legalCard = (over: Partial<ImageCard> = {}) => card({ card_id: "img:2", unit_key: "s2", unit_hash: "h2", anchor: { after: "What does state law list?", block_index: 0 }, type: "comparison_graphic", purpose: "Show the law's wording next to its condition.", designer_description: "A two-part graphic: the list on the left, the condition on the right, plain colors.", text_overlay: [{ text: SENT1, source_unit: "s2", source_block: "block:0" }, { text: SENT2, source_unit: "s2", source_block: "block:0" }], claim_ids: ["clm:1"], alt_text: "State law lists conditions that can make a building substandard, only when they endanger people or property.", ...over });

describe("the card schema is strict and read-only", () => {
  it("accepts a clean plan and a plan that skips every unit", () => {
    expect(imagePlanResult.safeParse(plan([card()])).success).toBe(true);
    expect(imagePlanResult.safeParse({ cards: [], skipped_units: skipsFor(["s1", "s2"]) }).success).toBe(true);
  });
  it("refuses any key that could carry text, a lock or an approval: unit, revised_unit, approved, locked, state", () => {
    for (const k of ["unit", "revised_unit", "approved", "locked", "state"]) {
      expect(imagePlanResult.safeParse({ ...plan([card()]), [k]: "x" }).success, k).toBe(false);
      expect(imageCard.safeParse({ ...card(), [k]: "x" }).success, `card.${k}`).toBe(false);
    }
  });
  it("refuses a bad card id, a block reference that is not a block, an empty alt text and a skip without a reason", () => {
    expect(imageCard.safeParse(card({ card_id: "x" })).success).toBe(false);
    expect(imageCard.safeParse(card({ text_overlay: [{ text: "a", source_unit: "s1", source_block: "paragraph 2" }] })).success).toBe(false);
    expect(imageCard.safeParse(card({ alt_text: "" })).success).toBe(false);
    expect(imagePlanResult.safeParse({ cards: [], skipped_units: [{ unit_key: "s1", reason: "no" }] }).success).toBe(false);
  });
  it("a hard cap of six cards at the schema", () => {
    const many = Array.from({ length: MAX_CARDS + 1 }, (_, i) => card({ card_id: `img:${i + 1}` }));
    expect(imagePlanResult.safeParse({ cards: many, skipped_units: [] }).success).toBe(false);
  });
});

describe("a clean plan passes the checks", () => {
  it("a checklist card from list items, a whole-sentence legal card with its claim, and skipped units with reasons", () => {
    expect(imagePlanFindings(plan([card(), legalCard()]), ctx)).toEqual([]);
  });
  it("skipping a unit with a reason is a normal result", () => {
    expect(imagePlanFindings(plan([card()], ["s2", "s3", "s4", "s5", "faq"]), ctx)).toEqual([]);
  });
});

describe("SR-11: the text in an image is the locked text, word for word", () => {
  it("a paraphrase, one changed word and a new number are refused", () => {
    expect(codes(plan([card({ text_overlay: [{ text: "Who can sign for the owner?", source_unit: "s1", source_block: "block:1" }] })]))).toContain("IMAGE_TEXT_NOT_VERBATIM");
    expect(codes(plan([card({ text_overlay: [{ text: "Who has the authority to sign?", source_unit: "s1", source_block: "block:1" }] })]))).toContain("IMAGE_TEXT_NOT_VERBATIM");
    expect(codes(plan([card({ designer_description: "A checklist with 5 rows, calm colors, no people." })]))).toContain("IMAGE_NEW_NUMBER");
    expect(codes(plan([card({ alt_text: "Three questions; 90 percent of sellers skip them." })]))).toEqual(expect.arrayContaining(["IMAGE_NEW_NUMBER", "IMAGE_INVENTED_DATA"]));
  });
  it("a source that does not exist is refused", () => {
    expect(codes(plan([card({ text_overlay: [{ text: "What is owed?", source_unit: "s9", source_block: "block:1" }] })]))).toContain("IMAGE_TEXT_SOURCE_MISSING");
    expect(codes(plan([card({ text_overlay: [{ text: "What is owed?", source_unit: "s1", source_block: "block:7" }] })]))).toContain("IMAGE_TEXT_SOURCE_MISSING");
  });
  it("a number that IS in the locked text is fine in the description", () => {
    expect(codes(plan([card({ designer_description: "A plain graphic with three rows and no people." })]))).not.toContain("IMAGE_NEW_NUMBER");
  });
});

describe("SR-12: a legal line is a whole sentence with its claim (and must not drop the threshold or the decider)", () => {
  it("a fragment that drops the threshold is refused (the hoarder clm:8 case)", () => {
    const frag = legalCard({ text_overlay: [{ text: "lists conditions that can make a building substandard", source_unit: "s2", source_block: "block:0" }] });
    expect(codes(plan([frag]))).toContain("IMAGE_LEGAL_FRAGMENT");
  });
  it("the whole threshold sentence passes; a whole table cell passes", () => {
    expect(codes(plan([legalCard({ text_overlay: [{ text: SENT2, source_unit: "s2", source_block: "block:0" }] })]))).not.toContain("IMAGE_LEGAL_FRAGMENT");
    expect(codes(plan([legalCard({ text_overlay: [{ text: DECIDER, source_unit: "s2", source_block: "block:1" }] })]))).not.toContain("IMAGE_LEGAL_FRAGMENT");
  });
  it("a legal line with no claim id, an unknown claim id or a claim the text does not cite is refused", () => {
    expect(codes(plan([legalCard({ claim_ids: [] })]))).toContain("IMAGE_LEGAL_NO_CLAIM");
    expect(codes(plan([legalCard({ claim_ids: ["clm:99"] })]))).toContain("IMAGE_CLAIM_UNKNOWN");
    expect(codes(plan([legalCard({ claim_ids: ["clm:2"] })]))).toContain("IMAGE_CLAIM_NOT_CITED_BY_TEXT");
  });
  it("a claim that is not MATCH (BROADER, WRONG) or has no verification record cannot carry an image", () => {
    const broader = new Map(claims); broader.set("clm:1", claim("clm:1", { verification: ver({ label: "BROADER" }) }));
    expect(imagePlanFindings(plan([legalCard()]), { ...ctx, claims: broader }).map((f) => f.code)).toContain("IMAGE_CLAIM_NOT_MATCH");
    const none = new Map(claims); none.set("clm:1", claim("clm:1", { verification: undefined }));
    expect(imagePlanFindings(plan([legalCard()]), { ...ctx, claims: none }).map((f) => f.code)).toContain("UNVERIFIED_LEGAL_CLAIM");
    const narrow = new Map(claims); narrow.set("clm:1", claim("clm:1", { verification: ver({ label: "NARROWER", readerImpact: "none", reason: "fine" }) }));
    expect(imagePlanFindings(plan([legalCard()]), { ...ctx, claims: narrow }).map((f) => f.code)).not.toContain("IMAGE_CLAIM_NOT_MATCH");
  });
  it("a statement of what a law does not say is never put in an image", () => {
    const u2 = units.map((u) => (u.key === "s2" && u.kind === "section" ? { ...u, blocks: [...u.blocks, { t: "p" as const, text: "The statute does not mention hoarding." }] } : u));
    const c = legalCard({ text_overlay: [{ text: "The statute does not mention hoarding.", source_unit: "s2", source_block: "block:3" }] });
    expect(imagePlanFindings(plan([c]), { ...ctx, units: u2 }).map((f) => f.code)).toContain("IMAGE_LEGAL_ABSENCE");
  });
  it("a closed list of deciders is flagged when the claim's quote names more (decider check reused from the article text)", () => {
    const u2 = units.map((u) => (u.key === "s2" && u.kind === "section" ? { ...u, blocks: [...u.blocks, { t: "p" as const, text: "It is the health officer or the fire official." }] } : u));
    const c = legalCard({ text_overlay: [{ text: "It is the health officer or the fire official.", source_unit: "s2", source_block: "block:3" }] });
    expect(imagePlanFindings(plan([c]), { ...ctx, units: u2 }).map((f) => f.code)).toContain("LEGAL_DECIDER_CLOSED");
  });
});

describe("SR-2 and SR-14: layers of law stay apart in an image", () => {
  it("a line with a local rule and California law, or two cities, is refused; each local line needs its own claim", () => {
    const u2 = units.map((u) => (u.key === "s5" && u.kind === "section" ? { ...u, blocks: [...u.blocks, { t: "p" as const, text: "Under California law and San Francisco's code, the same rule applies." }, { t: "p" as const, text: "San Francisco and San Mateo have the same rule under their housing law." }] } : u));
    const base = { card_id: "img:3", unit_key: "s5", unit_hash: "h5", type: "comparison_graphic" as const, designer_description: "A two-column comparison, plain colors, no people.", claim_ids: ["clm:2", "clm:3"], anchor: { after: "Local rules", block_index: 0 } };
    const a = card({ ...base, text_overlay: [{ text: "Under California law and San Francisco's code, the same rule applies.", source_unit: "s5", source_block: "block:2" }] });
    const b = card({ ...base, text_overlay: [{ text: "San Francisco and San Mateo have the same rule under their housing law.", source_unit: "s5", source_block: "block:3" }] });
    expect(imagePlanFindings(plan([a]), { ...ctx, units: u2 }).map((f) => f.code)).toContain("IMAGE_LAYER_BLEND");
    expect(imagePlanFindings(plan([b]), { ...ctx, units: u2 }).map((f) => f.code)).toContain("IMAGE_LAYER_BLEND");
  });
  it("a line that names a city whose own claim is not cited is refused; with its own claim it passes", () => {
    const sf = card({ card_id: "img:3", unit_key: "s5", unit_hash: "h5", type: "comparison_graphic", designer_description: "A simple two-column graphic, plain colors, no people.", anchor: { after: "Local rules", block_index: 0 }, text_overlay: [{ text: "San Francisco keeps its own housing code, and San Mateo County has its own ordinances.", source_unit: "s5", source_block: "block:0" }], claim_ids: ["clm:2"] });
    expect(codes(plan([sf]))).toContain("IMAGE_LOCAL_NO_CLAIM");
    expect(codes(plan([{ ...sf, claim_ids: ["clm:2", "clm:3"] }]))).not.toContain("IMAGE_LOCAL_NO_CLAIM");
  });
});

describe("SR-13, SR-15, SR-16: brand, service area, privacy and banned imagery", () => {
  const bad = (text: string, field: "designer_description" | "alt_text" | "purpose" | "privacy_notes" = "designer_description") => codes(plan([card({ [field]: text } as Partial<ImageCard>)]));
  it("maps, skylines, landmarks, coverage badges and accreditation badges are refused", () => {
    for (const t of ["A map of the Bay Area with pins, no people.", "The San Francisco skyline behind a house, no people.", "The Golden Gate Bridge in the background, no people.", "A badge reading Serving Oakland, no people.", "A BBB accredited badge, no people."]) expect(bad(t), t).toContain("IMAGE_BRAND_COVERAGE");
  });
  it("a city in the description that the locked text does not name is refused", () => {
    expect(bad("A graphic with the word Oakland in large type, no people.")).toContain("IMAGE_CITY_NOT_IN_TEXT");
  });
  it("ratings, pending-Juan items and experience wording are refused anywhere on the card", () => {
    expect(bad("A graphic with five stars and 4.8/5, no people.")).toEqual(expect.arrayContaining(["IMAGE_RATING"]));
    expect(bad("A banner: open 24/7, no people.")).toContain("IMAGE_PENDING_JUAN");
    expect(bad("A banner: 27 years of experience, no people.")).toContain("IMAGE_EXPERIENCE");
  });
  it("people, faces, sellers, addresses, house numbers and real homes are refused; 'no people' is fine", () => {
    expect(bad("A smiling family on a porch.")).toContain("IMAGE_PEOPLE");
    expect(bad("A photo of the seller's home with the house number visible.")).toContain("IMAGE_IDENTIFYING");
    expect(bad("A house at 123 Main Street.")).toContain("IMAGE_IDENTIFYING");
    expect(bad("A clean checklist, no people and no faces.")).toEqual([]);
  });
  it("a stock photo must be described as generic", () => {
    const stock = (d: string) => codes(plan([card({ type: "stock_photo", text_overlay: [], designer_description: d })]));
    expect(stock("A living room with boxes stacked on the floor, no people.")).toContain("IMAGE_STOCK_NOT_GENERIC");
    expect(stock("A generic living room with boxes stacked, no people.")).toEqual([]);
  });
  it("speech bubbles, quotation marks, before-and-after and testimonial framing are banned", () => {
    for (const t of ["A speech bubble with a quote, no people.", "A before-and-after of the room, no people.", "A testimonial layout, no people."]) expect(bad(t), t).toContain("IMAGE_BANNED_IMAGERY");
  });
  it("charts, statistics and data values are refused", () => {
    expect(bad("A pie chart of the options, no people.")).toContain("IMAGE_INVENTED_DATA");
    expect(bad("An infographic with statistics, no people.")).toContain("IMAGE_INVENTED_DATA");
  });
});

describe("the generation prompt and the avoid list (Lawrence's ready-to-paste fields)", () => {
  const gp = (generation_prompt: string, over: Partial<ImageCard> = {}) => codes(plan([card({ generation_prompt, ...over })]));
  const GOOD = card().generation_prompt;
  it("the default prompt passes; negations like 'no people' are the instruction we want", () => {
    expect(gp(GOOD)).toEqual([]);
  });
  it("a prompt must carry the palette, the aspect ratio, a light background, clear empty space for the text, and a plain 'no text'", () => {
    expect(gp("A checklist graphic on a light background, 16:9, clear empty space for the text. No text, no people.")).toContain("IMAGE_PROMPT_INCOMPLETE");               // no navy / orange
    expect(gp(GOOD.replace("16:9", "wide"))).toContain("IMAGE_PROMPT_INCOMPLETE");
    expect(gp(GOOD.replace("on a light background", "on a plain field"))).toContain("IMAGE_PROMPT_INCOMPLETE");
    expect(gp(GOOD.replace("clear empty space on the right where the text will go", "a busy layout"))).toContain("IMAGE_PROMPT_INCOMPLETE");
    expect(gp(GOOD.replace("No text, no letters, no people.", "No people."))).toContain("IMAGE_PROMPT_INCOMPLETE");
  });
  it("empty space is not required when the card has no overlay text", () => {
    expect(gp(GOOD.replace("clear empty space on the right where the text will go", "a simple layout"), { text_overlay: [] })).toEqual([]);
  });
  it("a prompt that asks the tool to draw words, quotes a string, or contains the overlay text is refused (AI tools never generate the words)", () => {
    expect(gp(GOOD + ' A banner that reads "Who has authority to sign?"')).toContain("IMAGE_PROMPT_HAS_TEXT");
    expect(gp(GOOD + " Add the headline in bold type.")).toContain("IMAGE_PROMPT_HAS_TEXT");
    expect(gp(GOOD + " Rows for What is owed? and What does the house need?")).toContain("IMAGE_PROMPT_HAS_TEXT");
  });
  it("a prompt states no fact the article does not: numbers, cities, coverage, experience, ratings, pending items", () => {
    expect(gp(GOOD + " Show 7 rows.")).toContain("IMAGE_NEW_NUMBER");
    expect(gp(GOOD + " Set in Oakland.")).toContain("IMAGE_CITY_NOT_IN_TEXT");
    expect(gp(GOOD + " Add a Serving the Bay Area badge.")).toContain("IMAGE_BRAND_COVERAGE");
    expect(gp(GOOD + " Mood of 27 years of experience.")).toEqual(expect.arrayContaining(["IMAGE_EXPERIENCE"]));
    expect(gp(GOOD + " Five stars at the top.")).toContain("IMAGE_RATING");
    expect(gp(GOOD + " Convey we close in 7 days.")).toContain("IMAGE_PENDING_JUAN");
  });
  it("a prompt that depicts people or an address is refused", () => {
    expect(gp(GOOD + " A smiling family at the door.")).toContain("IMAGE_PEOPLE");
    expect(gp(GOOD + " A house with the street address visible.")).toContain("IMAGE_IDENTIFYING");
  });
  it("the avoid list always covers people or faces, identifiable house exteriors, addresses, street numbers or signs, logos, documents, and any text or letters", () => {
    const a = card().avoid;
    for (const drop of ["people or faces", "real-looking identifiable house exteriors", "addresses", "street numbers or street signs", "logos", "documents", "any text or letters in the image"]) {
      expect(codes(plan([card({ avoid: [...a.filter((x) => x !== drop), "pastel colors", "heavy shadows"].slice(0, 7) })])), `without "${drop}"`).toContain("IMAGE_AVOID_INCOMPLETE");
    }
  });
  it("the avoid list states no fact either: a number, a city or a brand claim", () => {
    const a = card().avoid;
    expect(codes(plan([card({ avoid: [...a, "any figure over 40"] })]))).toContain("IMAGE_NEW_NUMBER");
    expect(codes(plan([card({ avoid: [...a, "skylines of Oakland"] })]))).toContain("IMAGE_CITY_NOT_IN_TEXT");
    expect(codes(plan([card({ avoid: [...a, "open 24/7 signage"] })]))).toContain("IMAGE_BRAND_CLAIM");
  });
  it("the schema needs the two new fields", () => {
    const { generation_prompt: _g, ...noPrompt } = card(); void _g;
    expect(imageCard.safeParse(noPrompt).success).toBe(false);
    expect(imageCard.safeParse({ ...card(), avoid: ["people"] }).success).toBe(false);          // fewer than six items
  });
});

describe("proportions, accounting and staleness", () => {
  it("more than six cards, more than three must-haves, a second card in a unit, a card on the FAQ and more than half the units are refused", () => {
    const four = ["s1", "s2", "s3", "s4"].map((k, i) => card({ card_id: `img:${i + 1}`, unit_key: k, unit_hash: ctx.unitHashes[k], text_overlay: [], claim_ids: [], anchor: { after: "x", block_index: 0 } }));
    expect(codes(plan(four))).toContain("IMAGE_TOO_MANY_MUST_HAVE");
    expect(codes(plan(four))).toContain("IMAGE_TOO_MANY_CARDS");        // 4 cards for 6 units: more than half
    expect(codes(plan([card(), card({ card_id: "img:2" })]))).toContain("IMAGE_ONE_PER_UNIT");
    expect(codes(plan([card({ unit_key: "faq", unit_hash: "hf", text_overlay: [], anchor: { after: "x", block_index: 0 } })]))).toContain("IMAGE_FAQ");
  });
  it("every unit is either carded or skipped with a reason; a unit cannot be both", () => {
    expect(codes({ cards: [card()], skipped_units: skipsFor(["s2"]) })).toContain("IMAGE_UNIT_UNACCOUNTED");
    expect(codes({ cards: [card()], skipped_units: skipsFor(["s1", "s2", "s3", "s4", "s5", "faq"]) })).toContain("IMAGE_SKIPPED_AND_CARDED");
  });
  it("a card planned on an old unit hash is STALE; an anchor outside the unit is refused", () => {
    expect(codes(plan([card({ unit_hash: "old" })]))).toContain("IMAGE_STALE_UNIT_HASH");
    expect(codes(plan([card({ anchor: { after: "x", block_index: 9 } })]))).toContain("IMAGE_BAD_ANCHOR");
  });
  it("the checks never change the units: the plan cannot hold article text", () => {
    const before = JSON.stringify(units);
    imagePlanFindings(plan([card(), legalCard()]), ctx);
    expect(JSON.stringify(units)).toBe(before);
  });
});
