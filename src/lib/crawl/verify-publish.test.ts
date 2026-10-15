import { describe, expect, it } from "vitest";
import { buildPageRead } from "./analyze";
import { fold, parseSection, verifyPage, type ManifestPage } from "./verify-publish";
import type { Block, DocExtract } from "./types";

const doc = (blocks: Block[], extra: Partial<DocExtract> = {}): DocExtract => ({ title: "T", metaDescription: "M", canonical: "https://www.twinhomebuyer.com/p/", metaRobots: "index", hreflang: [], og: {}, jsonLdRaw: [], h1s: ["H1"], headings: blocks.filter((b): b is Extract<Block, { t: "h" }> => b.t === "h").map((b) => ({ level: b.level, text: b.text })), blocks, links: [], images: [], forms: [], ctas: [], rootSelector: "main", ...extra });
const page = (blocks: Block[], extra: Partial<DocExtract> = {}) => buildPageRead({ requestedUrl: "https://www.twinhomebuyer.com/p/", finalUrl: "https://www.twinhomebuyer.com/p/", redirectChain: [], status: 200, fetchedAt: "x", userAgent: "u", raw: doc(blocks, extra), rendered: doc(blocks, extra), mobile: null, xRobotsTag: null });
const h = (level: number, text: string): Block => ({ t: "h", level, text });
const p = (text: string): Block => ({ t: "p", text });
const li = (text: string): Block => ({ t: "li", text });
const BASE: Block[] = [h(1, "Title"), h(2, "Intro"), p("Intro text."), h(3, "Risks"), p("Risk text."), h(2, "Biggest Mistake"), p("Mistake text.")];
const MD = "### New Section\nA paragraph with **bold** words.\n\n- **Label one.** First point.\n- Second point.\n\n| A | B |\n|---|---|\n| 1 | 2 |";
const NEW: Block[] = [h(3, "New Section"), p("A paragraph with bold words."), li("Label one. First point."), li("Second point."), { t: "table", rows: [["A", "B"], ["1", "2"]] }];
const withNew = (): Block[] => [...BASE.slice(0, 5), ...NEW, ...BASE.slice(5)];
const MP: ManifestPage = { url: "https://www.twinhomebuyer.com/p/", slug: "p", editor: "x", sections: [{ id: "S1", source: "t", level: 3, heading: "New Section", afterHeading: "Risks", beforeHeading: "Biggest Mistake", markdown: MD }] };

describe("publish verification", () => {
  it("parses the markdown into a heading, paragraphs, bullets and a table, stripping bold", () => {
    const s = parseSection(MD); expect(s.level).toBe(3); expect(s.heading).toBe("New Section");
    expect(s.blocks.map((b) => b.t)).toEqual(["p", "li", "li", "table"]);
    expect((s.blocks[1] as { text: string }).text).toBe("Label one. First point.");
  });
  it("folds curly quotes, dashes and spacing", () => { expect(fold("It’s – fine  ok")).toBe("It's - fine ok"); });
  it("passes when the section is live in the right place and nothing else changed", () => {
    const v = verifyPage(page(BASE), page(withNew()), MP); expect(v.checks.filter((c) => !c.ok)).toEqual([]); expect(v.ok).toBe(true);
  });
  it("fails when the section is missing", () => { const v = verifyPage(page(BASE), page(BASE), MP); expect(v.ok).toBe(false); expect(v.checks.some((c) => c.name.includes("section live") && !c.ok)).toBe(true); });
  it("fails when the pasted text differs from the approved text", () => {
    const b = withNew(); b[6] = p("A changed paragraph."); const v = verifyPage(page(BASE), page(b), MP);
    expect(v.checks.find((c) => c.name.includes("exact text"))?.ok).toBe(false);
  });
  it("fails when the section is in the wrong place", () => {
    const b = [...BASE.slice(0, 2), ...NEW, ...BASE.slice(2)]; const v = verifyPage(page(BASE), page(b), MP);
    expect(v.checks.find((c) => c.name.includes("after heading"))?.ok).toBe(false);
  });
  it("fails when other text on the page changed or was removed", () => {
    const b = withNew(); b[2] = p("Intro text edited."); const v = verifyPage(page(BASE), page(b), MP);
    expect(v.checks.find((c) => c.name.startsWith("nothing else changed"))?.ok).toBe(false);
    const c = withNew().filter((x) => !(x.t === "p" && x.text === "Risk text.")); expect(verifyPage(page(BASE), page(c), MP).ok).toBe(false);
  });
  it("fails when the title, a form or the schema changed, and when an unexpected link appears", () => {
    expect(verifyPage(page(BASE), page(withNew(), { title: "Other" }), MP).ok).toBe(false);
    expect(verifyPage(page(BASE), page(withNew(), { forms: [{ action: "x", method: "post", fields: 3 }] }), MP).ok).toBe(false);
    expect(verifyPage(page(BASE), page(withNew(), { links: [{ href: "https://www.twinhomebuyer.com/x/", text: "x", inMain: true }] }), MP).ok).toBe(false);
    const withLink: ManifestPage = { ...MP, sections: [{ ...MP.sections[0], expectedLinks: ["https://www.twinhomebuyer.com/x/"] }] };
    expect(verifyPage(page(BASE), page(withNew(), { links: [{ href: "https://www.twinhomebuyer.com/x/", text: "x", inMain: true }] }), withLink).ok).toBe(true);
  });
  it("ignores a blog-feed block that changed, when the manifest says to", () => {
    const feedBase = [...BASE, h(3, "Selling an Older Home in SF"), p("old teaser")]; const feedAfter = [...withNew(), h(3, "Selling an Older Home in SF"), p("new teaser")];
    expect(verifyPage(page(feedBase), page(feedAfter), MP).ok).toBe(false);
    expect(verifyPage(page(feedBase), page(feedAfter), { ...MP, ignoreHeadings: ["Selling an Older Home"] }).ok).toBe(true);
  });
  it("fails when the fresh crawl failed", () => {
    const bad = buildPageRead({ requestedUrl: MP.url, finalUrl: null, redirectChain: [], status: 403, fetchedAt: "x", userAgent: "u", raw: null, rendered: null, mobile: null, xRobotsTag: null, failure: "STOPPED" });
    expect(verifyPage(page(BASE), bad, MP).ok).toBe(false);
  });
});
