import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Build step 5: the Image board page (a local template and a fixture payload; nothing is published or shared).
const template = readFileSync("src/image-board/template.html", "utf8");
const fixture = JSON.parse(readFileSync("docs/phases/phase-3e-data/image-board/fixture-board.json", "utf8"));

describe("the image board fixture", () => {
  it("is marked as fixture data, with four cards and all three statuses", () => {
    expect(fixture.board.fixture).toBe(true);
    expect(fixture.cards).toHaveLength(4);
    expect(new Set(fixture.cards.map((c: { state: string }) => c.state))).toEqual(new Set(["todo", "prog", "done"]));
  });
  it("every card carries what Lawrence needs: purpose, placement, prompt, avoid list, overlay text, size, versions", () => {
    for (const c of fixture.cards) {
      for (const k of ["purpose", "placement", "generation_prompt", "avoid", "text_overlay", "aspect_ratio", "alt_text", "suggested_file_name", "versions", "card_version"]) expect(c[k], `${c.card_id} ${k}`).toBeTruthy();
      expect(c.generation_prompt).toContain("No text, no letters, no people");
      expect(c.generation_prompt).toContain(c.aspect_ratio.ratio);
      expect(c.avoid.join("|")).toMatch(/people or faces/);
      expect(c.avoid.join("|")).toMatch(/any text or letters/);
      expect(c.text_overlay.length).toBeGreaterThan(0);
      expect(c.versions.some((v: { v: number }) => v.v === c.card_version)).toBe(true);
    }
  });
  it("shows a card whose image is outdated (the card changed after the upload)", () => {
    const c = fixture.cards.find((x: { card_id: string }) => x.card_id === "img:2");
    expect(c.card_version).toBe(2);
    expect(c.uploads.every((u: { for_card_version: number }) => u.for_card_version < c.card_version)).toBe(true);
  });
});

describe("the image board template", () => {
  it("shows the overlay text read-only: no input, textarea or editable element in the overlay box", () => {
    expect(template).not.toMatch(/contenteditable/i);
    const lock = template.slice(template.indexOf("var lines = el("), template.indexOf("var spec = el("));
    expect(lock).not.toMatch(/'input'|'textarea'/);
    expect(lock).toContain("Locked. Add these words yourself");
  });
  it("writes page text with textContent, never innerHTML, so card text cannot inject markup", () => {
    expect(template).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write/);
  });
  it("has copy buttons for the prompt and the avoid list, version history, a note thread and the three statuses", () => {
    for (const s of ["Copy prompt", "Copy avoid list", "Version history", "Notes on this card", "To do", "In progress", "Done", "Upload a new version"]) expect(template, s).toContain(s);
  });
  it("only allows Done once an image exists for the current card version, and limits uploads to 10 MB and the four formats", () => {
    expect(template).toContain("var disabled = k === 'done' && !img;");
    expect(template).toContain("10 * 1024 * 1024");
    expect(template).toContain("image/png,image/jpeg,image/webp,image/svg+xml");
  });
  it("defines every color as a token with a dark theme, and loads fonts only from Google Fonts", () => {
    expect(template).toContain("@media (prefers-color-scheme: dark)");
    expect(template).toContain(':root[data-theme="dark"]');
    expect(template).toMatch(/background: var\(--bg\)/);
    const hosts = [...template.matchAll(/https?:\/\/[^/"')\s]+/g)].map((m) => m[0]).filter((h) => !h.includes("www.w3.org"));
    expect([...new Set(hosts)].sort()).toEqual(["https://fonts.googleapis.com", "https://fonts.gstatic.com"]);
  });
});
