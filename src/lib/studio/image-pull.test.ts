import { describe, expect, it } from "vitest";
import { buildImageVersion, pullImages, type BoardWork, type PlanCardRef } from "./image-pull";
import { jpegSegment, makeJpeg, makePng, makeSvg, pngChunk, textBytes } from "./image-files.testlib";
import { composeAuthor, composeCta, renderBody, stripFigures, type BrandFactRow, type Composed } from "./template";
import type { Draft } from "./schema";

// Build step 6: pulling images off the board and placing them in an article. FAKE fixture article and synthetic files only.
const cards: PlanCardRef[] = [
  { card_id: "img:1", unit_key: "s1", anchor: { after: "Can you sell a packed house?", block_index: 1 }, card_version: 1, aspect_ratio: { ratio: "16:9", width_px: 1600, height_px: 900 }, base_file_name: "fx_s1_first-questions", alt_text: "A checklist of three first questions." },
  { card_id: "img:2", unit_key: "s2", anchor: { after: "What does state law list?", block_index: 0 }, card_version: 2, aspect_ratio: { ratio: "16:9", width_px: 1600, height_px: 900 }, base_file_name: "fx_s2_law", alt_text: "The law's list and its condition." },
  { card_id: "img:3", unit_key: "s3", anchor: { after: "Your options", block_index: 0 }, card_version: 1, aspect_ratio: { ratio: "16:9", width_px: 1600, height_px: 900 }, base_file_name: "fx_s3_options", alt_text: "Three options." },
  { card_id: "img:4", unit_key: "s4", anchor: { after: "This week", block_index: 0 }, card_version: 1, aspect_ratio: { ratio: "16:9", width_px: 1600, height_px: 900 }, base_file_name: "fx_s4_paperwork", alt_text: "Three icons." },
];
const up = (v: number, forV: number, asset: string | null = `a${v}`) => ({ v, for_card_version: forV, file_name: asset === "a2" ? "photo.jpg" : `whatever ${v}.png`, date: "2026-10-14", asset_id: asset });
const work = (card_id: string, over: Partial<BoardWork> = {}): BoardWork => ({ card_id, read: true, made: true, words: true, done: true, base: 0, uploads: [], ...over });
const dirtyJpeg = makeJpeg(1600, 900, [jpegSegment(0xe1, textBytes("Exif\0\0GPSLatitude=37.5"))], 7);

describe("pulling images off the board", () => {
  const files = new Map<string, Uint8Array>([["a1", makePng(1600, 900, [pngChunk("tEXt", textBytes("GPS 37.5"))])], ["a2", dirtyJpeg], ["a3", makePng(1600, 900, [], 3)], ["a4", makePng(1600, 900, [], 4)], ["old", makePng(1600, 900, [], 9)]]);
  const board: BoardWork[] = [
    work("img:1", { uploads: [up(1, 1, "a1")] }),                                                   // handed in, with metadata to strip
    work("img:2", { uploads: [up(1, 1, "old"), up(2, 2, "a2")], base: 0 }),                         // v1 was for the earlier card version; v2 is current
    work("img:3", { uploads: [up(1, 1, "a3")], done: false }),                                      // uploaded but not marked done
    work("img:4", { uploads: [up(1, 1, "old")], base: 1 }),                                         // restarted after a requested change: nothing new yet
  ];
  const r = pullImages({ articleId: "art-1", cards, work: board, files, uploader: "Lawrence" });
  const by = (id: string) => r.cards.find((c) => c.card_id === id)!;

  it("only an image Lawrence handed in, that is valid and current, is READY", () => {
    expect(by("img:1").status).toBe("READY");
    expect(by("img:2").status).toBe("READY");
    expect(by("img:3").status).toBe("NOT_HANDED_IN");
    expect(by("img:4").status).toBe("OUTDATED_ONLY");
    expect(r.ready.map((i) => i.card_id)).toEqual(["img:1", "img:2"]);
  });
  it("uses the newest upload made for the card's current version, never an older one", () => {
    expect(by("img:2").image!.version_no).toBe(2);
    expect(by("img:2").image!.for_card_version).toBe(2);
  });
  it("names files for Lawrence and stores under a path that carries the version and the hash; the hash is of the cleaned bytes", () => {
    const i = by("img:1").image!;
    expect(i.file_name).toBe("fx_s1_first-questions_v1.png");
    expect(i.storage_path).toBe(`articles/art-1/img-1/v1_${i.sha256}.png`);
    expect(r.files.has(i.storage_path)).toBe(true);
    expect(i.uploaded_by).toBe("Lawrence");
  });
  it("strips metadata from what is stored, and says so", () => {
    const png = by("img:1").image!; const jpg = by("img:2").image!;
    expect(png.stripped).toEqual(["PNG tEXt"]); expect(jpg.stripped).toEqual(["JPEG EXIF/XMP"]);
    for (const i of [png, jpg]) expect(new TextDecoder("latin1").decode(r.files.get(i.storage_path)!)).not.toContain("GPS");
  });
  it("a missing file, a refused file and a wrong-shaped picture are reported, never stored", () => {
    const bad = pullImages({ articleId: "a", cards: cards.slice(0, 3), files: new Map([["x", makeSvg("<script>1</script>")], ["w", makePng(900, 900)]]), work: [work("img:1", { uploads: [up(1, 1, "x")] }), work("img:2", { uploads: [up(1, 2, "nope")] }), work("img:3", { uploads: [up(1, 1, "w")] })] });
    expect(bad.cards[0].status).toBe("REJECTED"); expect(bad.cards[0].reasons.join()).toContain("script");
    expect(bad.cards[1].status).toBe("FILE_MISSING");
    expect(bad.cards[2].status).toBe("READY"); expect(bad.cards[2].reasons.join()).toContain("the card asked for 16:9");     // a note for Leo, not a refusal
    expect(bad.files.size).toBe(1);
  });
  it("a card with nothing uploaded is reported", () => {
    expect(pullImages({ articleId: "a", cards: [cards[0]], work: [], files: new Map() }).cards[0]).toMatchObject({ status: "NO_CURRENT_IMAGE" });
  });
});

describe("placing the images in the article: the text must not change", () => {
  const facts: BrandFactRow[] = [{ fact_key: "experience_total", fact_value: "25+ years of experience in Bay Area real estate", status: "approved" }, { fact_key: "industry_experience", fact_value: "Juan Diaz has been investing in Bay Area real estate since 2002", status: "approved" }, { fact_key: "homes_purchased", fact_value: "1,000+", status: "approved" }, { fact_key: "company_name", fact_value: "Twin Home Buyer", status: "approved" }];
  const composed: Composed = { author: composeAuthor(facts, "https://www.twinhomebuyer.com/from-the-desk-of-juan-diaz/"), related: [], sources: [{ label: "California Legislative Information, Civil Code §1102", url: "https://leginfo.legislature.ca.gov/x" }], cta: composeCta("https://www.twinhomebuyer.com/hoarder-houses/") };
  const draft: Draft = { title: "T", slug: "t", units: [
    { kind: "section", key: "s1", h2: "Can you sell a packed house?", capsule: "Yes.", blocks: [{ t: "p", text: "Start with who holds title." }, { t: "ol", items: ["Who has authority to sign?", "What is owed?"] }], claim_ids: [], roles: [] },
    { kind: "section", key: "s2", h2: "What does state law list?", blocks: [{ t: "p", text: "Ask the city or county." }], claim_ids: [], roles: [] },
    { kind: "faq", key: "faq", items: [{ q: "Q1?", a: "A1.", claim_ids: [] }, { q: "Q2?", a: "A2.", claim_ids: [] }, { q: "Q3?", a: "A3.", claim_ids: [] }] },
  ] };
  const files = new Map<string, Uint8Array>([["a1", makePng(1600, 900)], ["a2", makeJpeg(1600, 900)]]);
  const pulled = pullImages({ articleId: "art-1", cards: cards.slice(0, 2), files, work: [work("img:1", { uploads: [up(1, 1, "a1")] }), work("img:2", { uploads: [up(1, 2, "a2")] })] });
  const idFor = (i: { card_id: string }) => (i.card_id === "img:1" ? "0f8fad5b-d9cb-469f-a165-70867728950e" : "11111111-2222-4333-8444-555555555555");

  it("adds figures at each card's anchor, passes the allowlist and the brand check, and the text-only render is byte for byte the same", () => {
    const v = buildImageVersion(draft, composed, pulled.ready, cards, idFor);
    expect(v.figures).toBe(2);
    expect(stripFigures(v.html)).toBe(renderBody(draft, composed));
    expect(v.textOnlyHash).not.toBe(v.hash);
    expect(v.html).toContain(`studio-image:0f8fad5b-d9cb-469f-a165-70867728950e#${pulled.ready[0].sha256}`);
    expect(v.html.indexOf("<figure")).toBeGreaterThan(v.html.indexOf("What is owed?"));     // after block 1 (the list) of section 1
  });
  it("a different file is a different version hash; the same files give the same hash", () => {
    const a = buildImageVersion(draft, composed, pulled.ready, cards, idFor);
    expect(buildImageVersion(draft, composed, pulled.ready, cards, idFor).hash).toBe(a.hash);
    const other = pullImages({ articleId: "art-1", cards: cards.slice(0, 2), files: new Map([["a1", makePng(1600, 900, [], 42)], ["a2", makeJpeg(1600, 900)]]), work: [work("img:1", { uploads: [up(1, 1, "a1")] }), work("img:2", { uploads: [up(1, 2, "a2")] })] });
    expect(buildImageVersion(draft, composed, other.ready, cards, idFor).hash).not.toBe(a.hash);
  });
  it("refuses an image made for an earlier card version, an unknown card, and an anchor that does not exist", () => {
    expect(() => buildImageVersion(draft, composed, [{ ...pulled.ready[0], for_card_version: 0 }], cards, idFor)).toThrow(/earlier version/);
    expect(() => buildImageVersion(draft, composed, [{ ...pulled.ready[0], card_id: "img:99" }], cards, idFor)).toThrow(/not in the plan/);
    expect(() => buildImageVersion(draft, composed, pulled.ready, [{ ...cards[0], anchor: { after: "x", block_index: 9 } }, cards[1]], idFor)).toThrow(/does not exist/);
  });
  it("refuses alt text or a caption that breaks the brand rules", () => {
    expect(() => buildImageVersion(draft, composed, pulled.ready, [{ ...cards[0], alt_text: "Rated 4.8/5 by sellers" }, cards[1]], idFor)).toThrow(/brand-rule/);
    expect(() => buildImageVersion(draft, composed, pulled.ready, [{ ...cards[0], caption: "We buy houses in Oakland" }, cards[1]], idFor)).toThrow(/brand-rule/);
  });
  it("does not change the draft it is given", () => {
    const before = JSON.stringify(draft);
    buildImageVersion(draft, composed, pulled.ready, cards, idFor);
    expect(JSON.stringify(draft)).toBe(before);
  });
});
