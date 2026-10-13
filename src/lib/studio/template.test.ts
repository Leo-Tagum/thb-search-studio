import { describe, expect, it } from "vitest";
import { STYLE_BLOCK, STYLE_BLOCK_SHA256 } from "./style-block";
import { sha256 } from "./hash";
import { auditHtml, composeAuthor, composeCta, renderBody, resolveImageTokens, stripFigures, type BrandFactRow, type Composed, type PlacedImage } from "./template";
import { brandRuleFindings } from "./brand-check";
import { parseInline } from "./inline";
import type { Draft } from "./schema";

const facts: BrandFactRow[] = [
  { fact_key: "experience_total", fact_value: "25+ years of experience in Bay Area real estate", status: "approved" },
  { fact_key: "industry_experience", fact_value: "Juan Diaz has been investing in Bay Area real estate since 2002", status: "approved" },
  { fact_key: "homes_purchased", fact_value: "1,000+", status: "approved" },
  { fact_key: "company_name", fact_value: "Twin Home Buyer", status: "approved" },
];
const composed = (): Composed => ({
  author: composeAuthor(facts, "https://www.twinhomebuyer.com/from-the-desk-of-juan-diaz/"),
  related: [{ text: "What selling as-is means", url: "https://www.twinhomebuyer.com/what-does-selling-your-house-as-is-mean/" }],
  sources: [{ label: "California Legislative Information, Civil Code section 1102", url: "https://leginfo.legislature.ca.gov/x" }],
  cta: composeCta("https://www.twinhomebuyer.com/hoarder-houses/"),
});
const draft: Draft = {
  title: "T", slug: "t",
  units: [
    { kind: "section", key: "s1", h2: "What should you know first?", capsule: "Short capsule.", blocks: [{ t: "p", text: "Hello **world** and [a link](https://www.twinhomebuyer.com/x/)." }, { t: "table", headers: ["A", "B"], rows: [["1", "2"]] }], claim_ids: [], roles: ["opening"] },
    { kind: "faq", key: "faq", items: [{ q: "Q1?", a: "A1.", claim_ids: [] }, { q: "Q2?", a: "A2.", claim_ids: [] }, { q: "Q3?", a: "A3.", claim_ids: [] }] },
  ],
};

describe("body renderer", () => {
  it("style block is the verbatim live pattern (hash pinned)", () => expect(sha256(STYLE_BLOCK)).toBe(STYLE_BLOCK_SHA256));
  it("renders in the fixed order and passes the allowlist", () => {
    const html = renderBody(draft, composed());
    const order = ["<style>", "<h2>What should you know first?</h2>", "Frequently Asked Questions", "About Juan Diaz", "Related Guides", "Sources and References", "class=\"thb-cta-box\""].map((s) => html.indexOf(s));
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(auditHtml(html)).toEqual([]);
  });
  it("author box uses approved facts only: no founder, no title", () => {
    const html = renderBody(draft, composed()).replace(STYLE_BLOCK, "");
    expect(html).toContain("25+ years of experience in Bay Area real estate and has been investing since 2002");
    expect(html).not.toMatch(/founder|owner|CEO/i);
  });
  it("author box refuses an unapproved or reworded fact", () => {
    expect(() => composeAuthor(facts.map((f) => (f.fact_key === "homes_purchased" ? { ...f, status: "proposed" } : f)), "u")).toThrow();
    expect(() => composeAuthor(facts.map((f) => (f.fact_key === "experience_total" ? { ...f, fact_value: "27 years" } : f)), "u")).toThrow();
  });
  it("rejects raw markup and non-https links in agent text", () => {
    expect(parseInline("<script>alert(1)</script>").errors.length).toBeGreaterThan(0);
    expect(parseInline("[x](http://a.com)").errors.length).toBeGreaterThan(0);
    expect(parseInline("a & b").html).toBe("a &amp; b");
  });
  it("allowlist catches script, style attribute, header/footer/nav, widget markup and unknown classes", () => {
    const base = renderBody(draft, composed());
    for (const bad of ["<script>x</script>", '<p style="color:red">x</p>', "<header>x</header>", "<nav>x</nav>", '<div class="elementor-widget">x</div>', '<img src="x">'])
      expect(auditHtml(base + bad).length).toBeGreaterThan(0);
  });
  it("escapes HTML in agent text", () => {
    const d: Draft = { ...draft, units: [{ kind: "section", key: "s1", h2: "Q?", blocks: [{ t: "p", text: 'Fish & "chips"' }], claim_ids: [], roles: [] }] };
    expect(renderBody(d, composed())).toContain("Fish &amp; &quot;chips&quot;");
  });
});

// Phase 3e image planner, build step 4: figures, studio-image tokens, the allowlist, and the text proof.
describe("images in the body", () => {
  const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const SHA = "a".repeat(64);
  const img = (over: Partial<PlacedImage> = {}): PlacedImage => ({ unitKey: "s1", afterBlock: 0, imageId: ID, sha256: SHA, alt: "A checklist of three first questions.", ...over });
  const withImg = (i: PlacedImage[] = [img()]) => renderBody(draft, composed(), i);

  it("no images: the render is unchanged (a plain render and an empty list are the same bytes)", () => {
    expect(renderBody(draft, composed(), [])).toBe(renderBody(draft, composed()));
  });
  it("places a figure after the named block, with the token src and the alt text, and passes the allowlist", () => {
    const html = withImg();
    expect(html).toContain(`<figure class="thb-figure">\n<img src="studio-image:${ID}#${SHA}" alt="A checklist of three first questions.">\n</figure>`);
    expect(html.indexOf("<figure")).toBeGreaterThan(html.indexOf("Hello"));              // after block 0 (the paragraph)
    expect(html.indexOf("<figure")).toBeLessThan(html.indexOf("<table"));                // and before block 1 (the table)
    expect(auditHtml(html)).toEqual([]);
  });
  it("supports an optional caption and pixel size", () => {
    const html = withImg([img({ caption: "Three questions to answer first.", width: 1600, height: 900 })]);
    expect(html).toContain('width="1600" height="900"');
    expect(html).toContain("<figcaption>Three questions to answer first.</figcaption>");
    expect(auditHtml(html)).toEqual([]);
  });
  it("the text proof: stripping the figures gives, byte for byte, the text-only render", () => {
    const textOnly = renderBody(draft, composed());
    expect(stripFigures(withImg())).toBe(textOnly);
    expect(stripFigures(withImg([img(), img({ imageId: "11111111-2222-4333-8444-555555555555", afterBlock: 1, caption: "Cap" })]))).toBe(textOnly);
    expect(sha256(stripFigures(withImg()))).toBe(sha256(textOnly));
  });
  it("the version hash pins the exact bytes: another file (sha256) is another hash", () => {
    expect(sha256(withImg())).not.toBe(sha256(withImg([img({ sha256: "b".repeat(64) })])));
    expect(sha256(withImg())).not.toBe(sha256(renderBody(draft, composed())));
  });
  it("the allowlist refuses an img whose src is a URL, a bad token or missing, an img with no alt, and any attribute outside src, alt, width and height", () => {
    const base = renderBody(draft, composed());
    const bad = [
      '<img src="https://evil.example/x.png" alt="x">', '<img src="studio-image:not-a-uuid#abc" alt="x">', `<img alt="x">`, `<img src="studio-image:${ID}#${SHA}">`, `<img src="studio-image:${ID}#${SHA}" alt="">`,
      `<img src="studio-image:${ID}#${SHA}" alt="x" srcset="a 1x">`, `<img src="studio-image:${ID}#${SHA}" alt="x" style="width:9px">`, `<img src="studio-image:${ID}#${SHA}" alt="x" onerror="x()">`,
      `<img src="studio-image:${ID}#${SHA}" alt="x" loading="lazy">`, `<img src="studio-image:${ID}#${SHA}" alt="x" width="wide">`, `<figure class="other"></figure>`,
    ];
    for (const b of bad) expect(auditHtml(base + b).length, b).toBeGreaterThan(0);
  });
  it("refuses a placement that does not exist, a bad token and a missing alt at render time", () => {
    expect(() => withImg([img({ afterBlock: 9 })])).toThrow(/does not exist/);
    expect(() => withImg([img({ unitKey: "faq" })])).toThrow(/does not exist/);
    expect(() => withImg([img({ sha256: "zz" })])).toThrow(/token form/);
    expect(() => withImg([img({ alt: " " })])).toThrow(/alt text/);
  });
  it("tokens become real URLs only for the preview or publish, and the stored version keeps the tokens", () => {
    const stored = withImg();
    const preview = resolveImageTokens(stored, (id, sha) => `https://signed.example/${id}/${sha.slice(0, 8)}.png?t=1&x=2`);
    expect(preview).toContain(`src="https://signed.example/${ID}/aaaaaaaa.png?t=1&amp;x=2"`);
    expect(preview).not.toContain("studio-image:");
    expect(stored).toContain("studio-image:");
    expect(stripFigures(preview.replace(/<figure[\s\S]*?<\/figure>/g, "<figure class=\"thb-figure\">\n</figure>"))).toBe(renderBody(draft, composed()));
  });
  it("the brand-rule check reads alt text and captions too", () => {
    expect(brandRuleFindings(withImg())).toEqual([]);
    expect(brandRuleFindings(withImg([img({ alt: "Rated 4.8/5 by sellers" })])).map((f) => f.code)).toContain("BRAND_RATING");
    expect(brandRuleFindings(withImg([img({ caption: "We buy houses in Oakland" })])).map((f) => f.code)).toContain("BRAND_SERVICE_AREA");
  });
});
