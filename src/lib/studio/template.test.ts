import { describe, expect, it } from "vitest";
import { STYLE_BLOCK, STYLE_BLOCK_SHA256 } from "./style-block";
import { sha256 } from "./hash";
import { auditHtml, composeAuthor, composeCta, renderBody, type BrandFactRow, type Composed } from "./template";
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
