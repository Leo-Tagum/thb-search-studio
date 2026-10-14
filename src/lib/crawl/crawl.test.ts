import { describe, expect, it } from "vitest";
import { buildPageRead, headingOrderIssues, parseJsonLd, templateIssues } from "./analyze";
import { compare } from "./compare";
import { scanClaims } from "./claims";
import { isAccessRestriction, isAllowedUrl, parseRobots, robotsAllows } from "./robots";
import { toMarkdown, toSections } from "./text";
import type { Block, DocExtract, PageRead } from "./types";

const doc = (blocks: Block[], extra: Partial<DocExtract> = {}): DocExtract => ({
  title: "t", metaDescription: null, canonical: null, metaRobots: null, hreflang: [], og: {}, jsonLdRaw: [], h1s: [], headings: blocks.filter((b): b is Extract<Block, { t: "h" }> => b.t === "h").map((b) => ({ level: b.level, text: b.text })),
  blocks, links: [], images: [], forms: [], ctas: [], rootSelector: "main", ...extra,
});
const read = (url: string, blocks: Block[], extra: Partial<DocExtract> = {}): PageRead => buildPageRead({ requestedUrl: url, finalUrl: url, redirectChain: [], status: 200, fetchedAt: "x", userAgent: "THB-Studio-Crawler", raw: doc(blocks, extra), rendered: doc(blocks, extra), mobile: null, xRobotsTag: null });

describe("crawl access rules", () => {
  it("allows only our two https hosts", () => {
    expect(isAllowedUrl("https://www.twinhomebuyer.com/a/")).toBe(true);
    expect(isAllowedUrl("https://twinhomebuyer.com/")).toBe(true);
    expect(isAllowedUrl("http://www.twinhomebuyer.com/")).toBe(false);
    expect(isAllowedUrl("https://evil.com/?u=twinhomebuyer.com")).toBe(false);
    expect(isAllowedUrl("https://twinhomebuyer.com.evil.com/")).toBe(false);
  });
  it("stops on 403, 429 and 5xx only", () => {
    for (const s of [403, 429, 500, 503]) expect(isAccessRestriction(s)).toBe(true);
    for (const s of [200, 301, 404]) expect(isAccessRestriction(s)).toBe(false);
  });
  it("reads robots.txt: our agent group first, longest rule wins, allow wins a tie", () => {
    const r = parseRobots("User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\n");
    expect(robotsAllows(r, "/wp-admin/x")).toBe(false);
    expect(robotsAllows(r, "/wp-admin/admin-ajax.php")).toBe(true);
    expect(robotsAllows(r, "/major-repairs/")).toBe(true);
    const mine = parseRobots("User-agent: *\nAllow: /\n\nUser-agent: THB-Studio-Crawler\nDisallow: /\n");
    expect(robotsAllows(mine, "/major-repairs/")).toBe(false);
  });
});

describe("claims scan", () => {
  it("flags the known false and unverified claims and marks them as own-site claims", () => {
    const f = scanClaims("Run by a licensed general contractor (CSLB #1066892) and C36 plumber. Guaranteed. $32M+ saved fees, 1,000+ houses bought, 100% on time. 4.8/5 from 115 reviews.");
    const ids = new Set(f.map((x) => x.id));
    for (const id of ["licensed-contractor", "cslb", "c36", "guaranteed", "saved-fees", "houses-bought", "on-time", "review-figures"]) expect(ids.has(id)).toBe(true);
    expect(f.every((x) => x.ownSiteClaim)).toBe(true);
  });
  it("accepts only the approved closing wording; every other day count is flagged", () => {
    expect(scanClaims("We can close in as little as 7 days.").some((x) => x.id === "day-count")).toBe(false);
    for (const t of ["Close in 7 days", "7-14 Days", "closes within 7 days", "7 days or less", "5 days"]) expect(scanClaims(t).some((x) => x.id === "day-count"), t).toBe(true);
  });
  it("flags the all-costs versus most-standard-closing-costs contradiction", () => {
    const f = scanClaims("We pay all costs. We cover most standard closing costs.");
    expect(f.some((x) => x.id === "closing-costs-contradiction")).toBe(true);
    expect(scanClaims("We pay all costs.").some((x) => x.id === "closing-costs-contradiction")).toBe(false);
  });
});

describe("analysis helpers", () => {
  it("lists schema types and FAQ questions, and survives bad JSON", () => {
    const j = parseJsonLd([JSON.stringify({ "@graph": [{ "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Can I sell as is?" }] }, { "@type": ["WebPage", "Article"] }] }), "{oops"]);
    expect(j[0].types).toEqual(["Article", "FAQPage", "WebPage"]);
    expect(j[0].questions).toEqual(["Can I sell as is?"]);
    expect(j[1].ok).toBe(false);
  });
  it("flags skipped heading levels", () => { expect(headingOrderIssues([{ level: 1, text: "A" }, { level: 3, text: "B" }])).toHaveLength(1); expect(headingOrderIssues([{ level: 1, text: "A" }, { level: 2, text: "B" }])).toHaveLength(0); });
  it("detects the H1 repeated in the hero paragraph and a city-style meta description on a non-city page", () => {
    const d = doc([{ t: "p", text: "Relocating? Sell Your House: Twin Home Buyer makes it simple and fast for you." }], { h1s: ["Relocating? Sell Your House"], metaDescription: "Top cash home buyer in Relocation" });
    const ids = templateIssues(d, "https://www.twinhomebuyer.com/relocation-help/").map((x) => x.id);
    expect(ids).toContain("h1-in-hero-paragraph");
    expect(ids).toContain("city-style-meta-on-non-city-page");
  });
  it("renders markdown with a table and sections", () => {
    const blocks: Block[] = [{ t: "h", level: 1, text: "Title" }, { t: "p", text: "Intro text." }, { t: "table", rows: [["A", "B"], ["1", "2"]] }];
    expect(toMarkdown(blocks)).toContain("| A | B |");
    expect(toSections(blocks).map((s) => s.heading)).toEqual(["Title"]);
  });
});

const para = (s: string): Block => ({ t: "p", text: s });
const SRC: Block[] = [
  { t: "h", level: 1, text: "Fix up or sell as-is" },
  { t: "h", level: 2, text: "Compare the two paths" }, para("Selling as-is skips repairs, showings and inspection renegotiation while fixing up adds months of carrying cost and contractor work for the seller."),
  { t: "table", rows: [["Category", "Sell as-is", "Fix and sell"], ["Speed to close", "7-14 Days", "60-120 Days"], ["Repair costs", "$0", "$20k-$150k+"], ["Showings", "None", "Many"], ["Closing certainty", "Guaranteed", "Market dependent"], ["Inspection risk", "None", "Common"]] },
  { t: "h", level: 2, text: "Who we are" }, para("Run by a licensed general contractor (CSLB #1066892). Guaranteed fair offers. We pay all costs. 100% on time."),
  { t: "h", level: 2, text: "Can I sell with liens?" }, para("Yes, liens are paid through escrow from your proceeds at closing time."),
];
const DST: Block[] = [
  { t: "h", level: 1, text: "Selling as-is in the Bay Area" },
  { t: "h", level: 2, text: "Can I sell with liens?" }, para("Yes, liens are paid through escrow from your proceeds at closing time."),
  { t: "h", level: 2, text: "Benefits of selling as-is" }, para("You avoid contractors showings and prolonged negotiations which suits inherited properties and landlords."),
];

describe("compare", () => {
  const c = compare(read("https://www.twinhomebuyer.com/src/", SRC), read("https://www.twinhomebuyer.com/dst/", DST));
  it("records the exact URLs and finds the same section as PRESENT", () => {
    expect(c.sourceUrl).toBe("https://www.twinhomebuyer.com/src/"); expect(c.destinationUrl).toBe("https://www.twinhomebuyer.com/dst/");
    expect(c.sections.find((s) => s.heading === "Can I sell with liens?")?.status).toBe("PRESENT");
  });
  it("finds the table that exists only on the source and counts it as unique content to move (mixed: some rows carry claims)", () => {
    expect(c.tables.onlyOnSource).toHaveLength(1);
    expect(c.requiredUniqueContent.some((r) => r.kind === "table")).toBe(true);
  });
  it("keeps a claims-only section out of the transfer list", () => {
    expect(c.unsupportedOnlyOnSource.some((u) => u.label === "Who we are")).toBe(true);
    expect(c.requiredUniqueContent.some((r) => r.label === "Who we are")).toBe(false);
  });
  it("tells reorganized content from missing content", () => {
    const moved: Block[] = [{ t: "h", level: 2, text: "Something else" }, para("Selling as-is skips repairs, showings and inspection renegotiation."), { t: "h", level: 2, text: "More" }, para("fixing up adds months of carrying cost and contractor work for the seller.")];
    const cmp = compare(read("https://www.twinhomebuyer.com/s/", [{ t: "h", level: 2, text: "Compare the two paths" }, para("Selling as-is skips repairs, showings and inspection renegotiation while fixing up adds months of carrying cost and contractor work for the seller.")]), read("https://www.twinhomebuyer.com/d/", moved));
    expect(["REORGANIZED", "REWRITTEN", "PRESENT"]).toContain(cmp.sections[0].status);
    expect(cmp.sections[0].status).not.toBe("ONLY_ON_SOURCE");
  });
  it("a section with the same heading but reworded text is REWRITTEN, not missing", () => {
    const cmp = compare(read("https://www.twinhomebuyer.com/s/", [{ t: "h", level: 3, text: "Tell Us About The Property" }, para("Share the address condition and timing so we can prepare an offer.")]), read("https://www.twinhomebuyer.com/d/", [{ t: "h", level: 3, text: "Tell us about the property" }, para("Answer a few quick questions about your house and what you need.")]));
    expect(cmp.sections[0].status).toBe("REWRITTEN");
    expect(cmp.requiredUniqueContent).toHaveLength(0);
  });
  it("an H1 phrased as a question is not counted as an FAQ", () => {
    const cmp = compare(read("https://www.twinhomebuyer.com/s/", [{ t: "h", level: 1, text: "Should you fix it up or sell as-is?" }, para("Some intro text about the decision that sellers face today.")]), read("https://www.twinhomebuyer.com/d/", DST));
    expect(cmp.faqs.onlyOnSource).toHaveLength(0);
  });
  it("claim matches are one clean line and do not swallow neighbouring text", () => {
    const f = scanClaims("$32M+\nSaved Fees\n1,000+\nHouses Bought\n100%\nOn Time\nGet started. 4.8/5 | Based on 115 Reviews\nNext");
    expect(f.find((x) => x.id === "saved-fees")?.match).toBe("$32M+ Saved Fees");
    expect(f.find((x) => x.id === "houses-bought")?.match).toBe("1,000+ Houses Bought");
    expect(f.find((x) => x.id === "review-figures")?.match).toBe("4.8/5 | Based on 115 Reviews");
    expect(f.every((x) => !x.match.includes("\n"))).toBe(true);
  });
  it("refuses to compare an unread page", () => {
    const bad = buildPageRead({ requestedUrl: "https://www.twinhomebuyer.com/x/", finalUrl: null, redirectChain: [], status: 403, fetchedAt: "x", userAgent: "u", raw: null, rendered: null, mobile: null, xRobotsTag: null, failure: "HTTP 403" });
    expect(bad.ok).toBe(false);
    expect(() => compare(bad, read("https://www.twinhomebuyer.com/d/", DST))).toThrow();
  });
});
