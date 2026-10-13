import { describe, expect, it } from "vitest";
import { brandRuleFindings, htmlPlainText } from "./brand-check";
import { composeAuthor, composeCta, renderBody, type BrandFactRow, type Composed } from "./template";
import type { Draft } from "./schema";

// Phase 3e (Leo, 2026-10-13): a brand-rule check on every assembly that scans ALL rendered text, template parts included, against editorial standards section 7.
const facts: BrandFactRow[] = [
  { fact_key: "experience_total", fact_value: "25+ years of experience in Bay Area real estate", status: "approved" },
  { fact_key: "industry_experience", fact_value: "Juan Diaz has been investing in Bay Area real estate since 2002", status: "approved" },
  { fact_key: "homes_purchased", fact_value: "1,000+", status: "approved" },
  { fact_key: "company_name", fact_value: "Twin Home Buyer", status: "approved" },
];
const composed = (over: Partial<Composed> = {}): Composed => ({
  author: composeAuthor(facts, "https://www.twinhomebuyer.com/from-the-desk-of-juan-diaz/"),
  related: [{ text: "7 Things That Slow Down an As-Is Sale", url: "https://www.twinhomebuyer.com/what-can-delay-as-is-home-sale-bay-area/" }, { text: "Oakland Code Violations in 2026", url: "https://www.twinhomebuyer.com/oakland-code-violations-2026/" }],
  sources: [{ label: "California Legislative Information, California Civil Code §1102", url: "https://leginfo.legislature.ca.gov/x" }],
  cta: composeCta("https://www.twinhomebuyer.com/hoarder-houses/"),
  ...over,
});
const draft = (text = "Whether speed, certainty, privacy or the highest price matters most to you."): Draft => ({
  title: "T", slug: "t",
  units: [
    { kind: "section", key: "s1", h2: "What should you know first?", capsule: "Short capsule.", blocks: [{ t: "p", text }], claim_ids: [], roles: [] },
    { kind: "faq", key: "faq", items: [{ q: "Q1?", a: "A1.", claim_ids: [] }, { q: "Q2?", a: "A2.", claim_ids: [] }, { q: "Q3?", a: "A3.", claim_ids: [] }] },
  ],
});
const codes = (html: string) => brandRuleFindings(html).map((f) => f.code);

describe("the brand-rule check scans the whole rendered article", () => {
  it("the approved author sentence, the approved homes line, the CTA and ordinary related titles pass", () => {
    expect(brandRuleFindings(renderBody(draft(), composed()))).toEqual([]);
  });
  it("reads template text too: a bad author sentence in the template is caught", () => {
    for (const sentence of [
      "Juan Diaz has 27 years of experience in Bay Area real estate.",
      "Juan Diaz has over 25 years of experience in Bay Area real estate.",
      "Juan Diaz has 20+ years of experience in Bay Area real estate.",
      "Twin Home Buyer has 25+ years in business.",
    ]) {
      const html = renderBody(draft(), composed({ author: { ...composed().author, sentence } }));
      expect(codes(html), sentence).toContain("BRAND_EXPERIENCE");
    }
  });
  it("the founding-year trap: 2002 as the company's start", () => {
    const html = renderBody(draft(), composed({ author: { ...composed().author, sentence: "Twin Home Buyer was founded in 2002." } }));
    expect(codes(html)).toContain("BRAND_SOURCED_FACT");
  });
  it("catches a rating or review count anywhere, including the CTA and a related title", () => {
    expect(codes(renderBody(draft(), composed({ related: [{ text: "Rated 4.8/5 by sellers", url: "https://www.twinhomebuyer.com/x/" }] })))).toContain("BRAND_RATING");
    expect(codes(renderBody(draft("We have 115 reviews."), composed()))).toContain("BRAND_RATING");
  });
  it("catches pending-Juan items: hours, closing time, ownership, license, $32M, East Oakland", () => {
    for (const t of ["We are open 24/7.", "We can close in 7 days.", "A family-owned company.", "A licensed general contractor.", "We saved sellers $32M in fees.", "Our East Oakland roots."]) expect(codes(renderBody(draft(t), composed())), t).toContain("BRAND_PENDING_JUAN");
  });
  it("catches service-area claims and badges (SR-3)", () => {
    for (const t of ["We buy houses in Oakland.", "We serve San Mateo County.", "Serving San Francisco homeowners.", "See the cities we serve."]) expect(codes(renderBody(draft(t), composed())), t).toContain("BRAND_SERVICE_AREA");
  });
  it("catches an as-is or no-cleanout promise and a guaranteed price", () => {
    for (const t of ["We buy as-is, no cleanout needed.", "We guarantee a fair cash offer."]) expect(codes(renderBody(draft(t), composed())), t).toContain("BRAND_PROMISE");
  });
  it("plain talk that only mentions the words passes: an as-is guide title, a seller choosing the highest price, a city named as a topic", () => {
    expect(brandRuleFindings(renderBody(draft("Some sellers want the highest price. A house can sell as-is, but that is the seller's choice. Oakland has its own code."), composed()))).toEqual([]);
  });
  it("htmlPlainText drops the style block and tags and decodes entities", () => {
    const t = htmlPlainText(renderBody(draft("Tom & Jerry"), composed()));
    expect(t).toContain("Tom & Jerry");
    expect(t).not.toContain("<");
    expect(t).not.toContain("--thb");
  });
});
