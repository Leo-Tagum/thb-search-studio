import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildImagesPayload, humanSource, type ApprovalCard } from "./images-payload";
import { pullImages, type BoardWork, type PlanCardRef } from "./image-pull";
import { makeDrawnPng } from "./image-files.testlib";
import type { LedgerClaim } from "./checks";
import type { Unit } from "./schema";

// Build step 7: what the Approval Room says about images. FAKE fixture text; synthetic pictures.
const SENT = "The law counts them only when they endanger life, limb, health, property, safety or welfare.";
const units: Unit[] = [
  { kind: "section", key: "s1", h2: "Can you sell a packed house?", blocks: [{ t: "p", text: "Start here." }, { t: "ol", items: ["Who has authority to sign?", "What is owed?"] }], claim_ids: [], roles: [] },
  { kind: "section", key: "s2", h2: "What does state law say?", blocks: [{ t: "p", text: SENT }], claim_ids: ["clm:1"], roles: [] },
  { kind: "faq", key: "faq", items: [{ q: "Q1?", a: "A1.", claim_ids: [] }, { q: "Q2?", a: "A2.", claim_ids: [] }, { q: "Q3?", a: "A3.", claim_ids: [] }] },
];
const claims = new Map<string, LedgerClaim>([["clm:1", { id: "clm:1", text: SENT, risk: "high", support: "supported", sourceId: "s", sourceRecheckBy: null, jurisdiction: "California", verification: { quote: "q", section: "H&S 17920.3", label: "MATCH", reason: null, against: "p", gates: [], readerImpact: "none" } }]]);
const ref = (card_id: string, unit_key: string, block_index: number): PlanCardRef => ({ card_id, unit_key, anchor: { after: "x", block_index }, card_version: 1, aspect_ratio: { ratio: "16:9", width_px: 1600, height_px: 900 }, base_file_name: `fx_${unit_key}`, alt_text: "alt" });
const cards: ApprovalCard[] = [
  { ...ref("img:1", "s1", 1), title: "First questions", text_overlay: [{ text: "Who has authority to sign?", source_unit: "s1", source_block: "block:1" }], claim_ids: [] },
  { ...ref("img:2", "s2", 0), title: "The condition", text_overlay: [{ text: SENT, source_unit: "s2", source_block: "block:0" }], claim_ids: ["clm:1"] },
];
const work = (id: string): BoardWork => ({ card_id: id, read: true, made: true, words: true, done: true, base: 0, uploads: [{ v: 1, for_card_version: 1, file_name: "a.png", date: "2026-10-14", asset_id: id }] });
const pulled = pullImages({ articleId: "a", cards, work: [work("img:1"), work("img:2")], files: new Map([["img:1", makeDrawnPng(1600, 900, [])], ["img:2", makeDrawnPng(1600, 900, [{ x: 10, y: 10, w: 50, h: 50, color: [1, 2, 3] }])]]) });
const leo = (ids: string[]) => new Map(ids.map((id) => [id, { by: "Leo", at: "2026-10-14", note: "Looked at it." }]));
const base = { cards, ready: pulled.ready, units, claims, history: [], urlFor: (i: { file_name: string }) => `https://signed.example/${i.file_name}`, imageIdFor: (i: { card_id: string }) => `id-${i.card_id}` };

describe("the Approval Room's image block", () => {
  it("shows each image with its exact words, where they come from, the claim and its label, and whether they match the article", () => {
    const p = buildImagesPayload({ ...base, vision: new Map([["img:1", []], ["img:2", []]]), leoChecks: leo(["img:1", "img:2"]) });
    expect(p.images).toHaveLength(2);
    expect(p.images[0].text_lines[0]).toEqual({ text: "Who has authority to sign?", source: "Section 1 (Can you sell a packed house?), list 2", claim_ids: [], label: null });
    expect(p.images[1].text_lines[0]).toMatchObject({ claim_ids: ["clm:1"], label: "MATCH", source: "Section 2 (What does state law say?), paragraph 1" });
    expect(p.images.every((i) => i.matches_locked_text)).toBe(true);
    expect(p.images[0].fingerprint).toHaveLength(12);
  });
  it("maps the display addresses by token and hash, and the hash of the article never depends on them", () => {
    const p = buildImagesPayload({ ...base, vision: new Map(), leoChecks: new Map() });
    expect(Object.keys(p.image_urls)).toEqual(pulled.ready.map((i) => `id-${i.card_id}#${i.sha256}`));
  });
  it("says only what was checked: the statement is NOT CONFIRMED until the picture check ran, found nothing, and Leo looked at every image", () => {
    const ok = buildImagesPayload({ ...base, vision: new Map([["img:1", []], ["img:2", []]]), leoChecks: leo(["img:1", "img:2"]) });
    expect(ok.images_statement).toMatch(/^Checked:/);
    expect(ok.images_statement).toContain("not a guarantee");
    expect(buildImagesPayload({ ...base, vision: new Map(), leoChecks: leo(["img:1", "img:2"]) }).images_statement).toContain("NOT CONFIRMED: the picture check");
    expect(buildImagesPayload({ ...base, vision: new Map([["img:1", ["looks like a street sign"], ], ["img:2", []]]), leoChecks: leo(["img:1", "img:2"]) }).images_statement).toContain("raised flags");
    expect(buildImagesPayload({ ...base, vision: new Map([["img:1", []], ["img:2", []]]), leoChecks: leo(["img:1"]) }).images_statement).toContain("Leo has not yet checked every image");
    expect(buildImagesPayload({ ...base, ready: [], vision: new Map(), leoChecks: new Map() }).images_statement).toContain("there are no images");
  });
  it("flags an image whose words are not word for word in the article", () => {
    const bad: ApprovalCard[] = [{ ...cards[0], text_overlay: [{ text: "Who can sign for the owner?", source_unit: "s1", source_block: "block:1" }] }, cards[1]];
    const p = buildImagesPayload({ ...base, cards: bad, vision: new Map([["img:1", []], ["img:2", []]]), leoChecks: leo(["img:1", "img:2"]) });
    expect(p.images[0].matches_locked_text).toBe(false);
    expect(p.images_statement).toContain("NOT CONFIRMED");
    expect(p.images_statement).toContain("not word for word");
  });
  it("describes a source in words", () => {
    expect(humanSource(units, "faq", "faq:1:a")).toBe("FAQ 2, answer");
    expect(humanSource(units, "s1", "h2")).toContain("heading");
  });
});

describe("the Approval Room page handles images", () => {
  const template = readFileSync("src/approval-room/template.html", "utf8");
  it("shows the picture inline from display addresses, but hashes the article with the tokens", () => {
    expect(template).toContain("P.image_urls[id+'#'+sha]");
    expect(template).toContain("wrapper.innerHTML = shown;");
    expect(template).toContain("sha256Hex(P.html)");                                   // the hash is of the stored HTML, not of the display copy
  });
  it("says the approval covers the words and the images together, and lists each image in the notes with the same-words check, labels, picture check and Leo's check", () => {
    for (const s of ["Your approval covers the words and the images together", "Images in this version", "Same words as the article", "picture check", "Who did what"]) expect(template, s).toContain(s);
  });
});
