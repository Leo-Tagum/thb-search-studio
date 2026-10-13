import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { imagePlanFindings, type ImageCard, type ImageCtx } from "../lib/studio/image-cards";
import type { LedgerClaim } from "../lib/studio/checks";
import type { Unit } from "../lib/studio/schema";

// Build step 5: the Image board page for Lawrence (a local template and a fixture payload). One card, one task, one next action.
const template = readFileSync("src/image-board/template.html", "utf8");
const fixture = JSON.parse(readFileSync("docs/phases/phase-3e-data/image-board/fixture-board.json", "utf8"));

describe("the image board fixture", () => {
  it("is marked as fixture data, with four cards that show finished, changes requested, outdated and in progress", () => {
    expect(fixture.board.fixture).toBe(true);
    expect(fixture.cards).toHaveLength(4);
    const c = fixture.cards;
    expect(c[0].work.done).toBe(true);
    expect(c[1].changes_requested?.text).toBeTruthy();
    expect(c[2].card_version).toBe(2);
    expect(c[2].uploads.every((u: { for_card_version: number }) => u.for_card_version < c[2].card_version)).toBe(true);
    expect(c[3].work.made).toBe(true);
    expect(c[3].work.words).toBe(false);
  });
  it("every card carries the idea, an optional example prompt, the avoid list, the locked words, an automatic file name and its history", () => {
    for (const c of fixture.cards) {
      for (const k of ["purpose", "placement", "design_brief", "generation_prompt", "avoid", "text_overlay", "aspect_ratio", "alt_text", "base_file_name", "card_version", "text_changes"]) expect(c[k], `${c.card_id} ${k}`).toBeTruthy();
      expect(c.base_file_name).toMatch(/^[a-z0-9_-]+$/);                    // Lawrence never types a technical name
      expect(c.design_brief.length).toBeGreaterThan(120);
    }
  });
  it("the fixture's idea, example prompt, avoid list and words obey the real image-card rules (no facts, no drawn words, whole sentences)", () => {
    const units: Unit[] = fixture.cards.map((c: { text_overlay: { text: string }[] }, i: number) => ({ kind: "section", key: `s${i + 1}`, h2: `Section ${i + 1}`, blocks: [{ t: "ul", items: c.text_overlay.map((l) => l.text) }], claim_ids: i === 1 ? ["clm:1"] : [], roles: [] }) as Unit);
    const claims = new Map<string, LedgerClaim>([["clm:1", { id: "clm:1", text: "t", risk: "high", support: "supported", sourceId: "s", sourceRecheckBy: null, jurisdiction: "California", verification: { quote: "q", section: "H&S 17920.3", label: "MATCH", reason: null, against: "p", gates: [], readerImpact: "none" } }]]);
    const ctx: ImageCtx = { units, unitHashes: Object.fromEntries(units.map((u) => [u.key, `h-${u.key}`])), claims };
    const cards: ImageCard[] = fixture.cards.map((c: any, i: number) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      card_id: c.card_id, unit_key: `s${i + 1}`, unit_hash: `h-s${i + 1}`, anchor: { after: `Section ${i + 1}`, block_index: 0 }, type: c.type, purpose: c.purpose, design_brief: c.design_brief, generation_prompt: c.generation_prompt, avoid: c.avoid,
      text_overlay: c.text_overlay.map((l: { text: string }) => ({ text: l.text, source_unit: `s${i + 1}`, source_block: "block:0" })), claim_ids: i === 1 ? ["clm:1"] : [], alt_text: c.alt_text, aspect_ratio: c.aspect_ratio, priority: c.priority, privacy_notes: "No people, no addresses.",
    }));
    // four units are carded here, so the proportion cap (half the units) is not what this test is about: give the context two extra uncarded units
    const extra: Unit[] = [5, 6].map((n) => ({ kind: "section", key: `s${n}`, h2: `Section ${n}`, blocks: [{ t: "p", text: "Plain text." }], claim_ids: [], roles: [] }) as Unit);
    const ctx2: ImageCtx = { ...ctx, units: [...units, ...extra], unitHashes: { ...ctx.unitHashes, s5: "h-s5", s6: "h-s6" } };
    const findings = imagePlanFindings({ cards, skipped_units: [{ unit_key: "s5", reason: "No image helps this unit." }, { unit_key: "s6", reason: "No image helps this unit." }] }, ctx2).filter((f) => !["IMAGE_TOO_MANY_CARDS", "IMAGE_TOO_MANY_MUST_HAVE"].includes(f.code));
    expect(findings).toEqual([]);
  });
});

describe("the image board template: one card, one task, one next action", () => {
  it("has the five steps and exactly one orange control class, used only for the next action", () => {
    for (const s of ["Read the idea", "Make the image", "Add the words", "Upload", "Mark done"]) expect(template, s).toContain(`'${s}'`);
    for (const g of ["Got it", "I've made the image", "I've added the words", "Upload finished image", "Mark done"]) expect(template, g).toContain(g);
    expect(template).toContain("Start version ");
    expect([...template.matchAll(/class: 'btn go'/g)].length).toBe(3);        // start the new version, the upload label, and the confirm buttons: one of them is drawn at a time
    expect(template).not.toMatch(/btn primary/);
  });
  it("shows the idea first, the example prompt as optional, the locked words with a copy button, and keeps the rest collapsed", () => {
    for (const s of ["'The idea'", "'Example prompt (optional)'", "Copy example prompt", "'The exact words to add'", "Copy words", "'What to avoid'", "'Details'", "'Version history'", "'Notes'"]) expect(template, s).toContain(s);
    expect(template.indexOf("'The idea'")).toBeLessThan(template.indexOf("'Example prompt (optional)'"));
    expect(template.indexOf("'Example prompt (optional)'")).toBeLessThan(template.indexOf("'The exact words to add'"));
    expect(template).toContain("'\\n\\nAvoid: '");                              // the example prompt is copied together with the avoid list
  });
  it("keeps the words locked and never edits the page through markup strings", () => {
    expect(template).not.toMatch(/contenteditable/i);
    expect(template).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write/);
    expect(template).toContain("They cannot be changed here.");
  });
  it("completes steps only from real actions: the upload step comes from an uploaded file, Mark done needs it, a request restarts the steps", () => {
    expect(template).toContain("return [w.read, w.made, w.words, up, w.done && up];");
    expect(template).toContain("function hasImage(c)");
    expect(template).toContain("Changes requested: please update this image.");
    expect(template).toContain("w.handled = req.id; w.base = w.uploads.length;");     // starting the next version keeps the old uploads
    expect(template).toContain("The words on this card changed.");
    expect(template).not.toMatch(/uploads\.(splice|pop|shift)\(|uploads = \[\]/);   // an older version is never deleted or overwritten
  });
  it("puts the next-action box under the idea for step 1 only, and reads change requests from the owner-only collection", () => {
    expect(template).toContain("if (nextEl && cur === 1) body.appendChild(nextEl);");
    expect(template).toContain("if (nextEl && cur !== 1) body.appendChild(nextEl);");
    expect(template).toContain("'board2/' + P.board.article_id + '/requests'");
  });
  it("separates handing in from approval", () => {
    expect(template).toContain("Handed in. Leo checks it next.");
    expect(template).toContain("Done does not mean approved");
    expect(template).toContain("Juan approves the article before anything is published");
  });
  it("accepts only PNG, JPEG, WebP and SVG up to 10 MB, and names files for Lawrence", () => {
    expect(template).toContain("10 * 1024 * 1024");
    expect(template).toContain("image/png,image/jpeg,image/webp,image/svg+xml");
    expect(template).toContain("c.base_file_name + '_v' + v + ext");
  });
  it("uses plain words: no hashes, database terms or technical identifiers in anything Lawrence reads", () => {
    const strings = [...template.matchAll(/(?:text: |\[|\(|\+ )'([^'\n]{8,}?)'/g)].map((m) => m[1]).filter((s) => /[A-Za-z]{3,} [A-Za-z]{2,}/.test(s));
    expect(strings.length).toBeGreaterThan(20);
    for (const s of strings) expect(s, s).not.toMatch(/\b(hash|sha-?256|database|json|uuid|schema|asset id|card version|payload)\b/i);
  });
  it("defines every color as a token with a dark theme, and loads fonts only from Google Fonts", () => {
    expect(template).toContain("@media (prefers-color-scheme: dark)");
    expect(template).toContain(':root[data-theme="dark"]');
    expect(template).toMatch(/background: var\(--bg\)/);
    const hosts = [...template.matchAll(/https?:\/\/[^/"')\s]+/g)].map((m) => m[0]).filter((h) => !h.includes("www.w3.org"));
    expect([...new Set(hosts)].sort()).toEqual(["https://fonts.googleapis.com", "https://fonts.gstatic.com"]);
  });
});
