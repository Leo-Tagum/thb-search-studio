import { describe, expect, it } from "vitest";
import { isReviewerName, neutralName, rectsAreSolid, scanFilename, scanText } from "../crawl/privacy";
import { citiesIn, guessType, type PageFeatures } from "../crawl/page-type";
import { flagsFor, geographyOf, purposesOf } from "./flags";
import type { PageInfo } from "./types";

describe("privacy scan", () => {
  it("finds street stories, addresses, emails, personal phones and reviewer names, and allows the company's own details", () => {
    expect(scanText("A Real Story from Amber Street: Selling an Eichler").some((f) => f.kind === "street-story")).toBe(true);
    expect(scanText("Helping a homeowner on Chestnut Street close quickly").some((f) => f.kind === "street-story")).toBe(true);
    expect(scanText("The house at 412 Maple Avenue sold").some((f) => f.kind === "street-address")).toBe(true);
    expect(scanText("write to jane.doe@example.com or call 650-555-0142").map((f) => f.kind).sort()).toEqual(["email", "phone"]);
    expect(scanText("Twin Home Buyer, 170 Glenn Way Ste 5, San Carlos, CA 94070. Call (415) 415-8946 or 415-415-TWIN. training@twinhomebuyer.com").length).toBe(0);
    expect(isReviewerName("Rafael P.")).toBe(true); expect(isReviewerName("Why Choose Us")).toBe(false);
  });
  it("checks filenames and makes neutral names that carry no page text", () => {
    expect(scanFilename("412-maple-avenue-front.webp").length).toBeGreaterThan(0);
    expect(scanFilename("4-18.webp").length).toBe(0);
    const n = neutralName("https://www.twinhomebuyer.com/some-page/", "desktop-top"); expect(n).toMatch(/^[0-9a-f]{8}-desktop-top\.jpg$/); expect(n).not.toContain("some-page");
  });
  it("accepts a redacted rectangle only when it is solid black in the pixels", () => {
    const w = 20, h = 20, data = new Uint8ClampedArray(w * h * 4).fill(255); for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) { const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; }
    expect(rectsAreSolid({ w, h, data }, [{ x: 5, y: 5, w: 10, h: 10 }]).ok).toBe(true);
    expect(rectsAreSolid({ w, h, data }, [{ x: 3, y: 3, w: 14, h: 14 }]).ok).toBe(false);
  });
});

const feat = (o: Partial<PageFeatures>): PageFeatures => ({ url: "https://www.twinhomebuyer.com/x/", title: "t", h1: "h", wpType: "page", protectedAd: false, words: 900, firstFormY: null, firstCtaY: null, ctaCount: 3, ctaCountAfterFold: 1, hasByline: false, hasDate: false, hasArticleSchema: false, hasLocalBusinessSchema: true, navLinks: 12, ...o });
describe("page-type rules", () => {
  it("money page: form at the top and a sell message", () => { const g = guessType(feat({ h1: "We Buy Houses for Cash", firstFormY: 300, firstCtaY: 250 })); expect(g.type).toBe("money page"); expect(g.confidence).toBe("high"); expect(g.evidence.join(" ")).toContain("form"); });
  it("city page: a money page that names a city", () => { expect(guessType(feat({ url: "https://www.twinhomebuyer.com/we-buy-houses-in-dublin/", h1: "We Buy Houses in Dublin", firstFormY: 300 })).type).toBe("city/location page"); });
  it("guide: byline, date, question H1, post", () => { const g = guessType(feat({ wpType: "post", h1: "Can a Cash Buyer Close If There Are Title Problems?", hasByline: true, hasDate: true, hasArticleSchema: true, words: 4000, ctaCount: 2, ctaCountAfterFold: 2 })); expect(g.type).toBe("guide/blog"); });
  it("ads landing page when protected; utility by address", () => { expect(guessType(feat({ protectedAd: true })).type).toBe("ads landing page"); expect(guessType(feat({ url: "https://www.twinhomebuyer.com/thank-you/" })).type).toBe("utility"); });
  it("story title; weak signals give low confidence", () => { expect(guessType(feat({ wpType: "post", h1: "San Jose's Most Mysterious Home & What It Teaches Us", title: "x", hasDate: true })).type).toBe("story/case study"); expect(guessType(feat({ wpType: "unknown", h1: "Hello", ctaCount: 0, ctaCountAfterFold: 0 })).confidence).toBe("low"); });
  it("finds city names in an address", () => { expect(citiesIn("we-buy-houses-in-los-altos")).toEqual(["Los Altos"]); });
});

const info = (o: Partial<PageInfo>): PageInfo => ({ url: "https://www.twinhomebuyer.com/a/", wpType: "page", visualType: "money page", confidence: "high", evidence: [], purposeText: "", purposes: [], geography: "general", protected: false, changedSinceDecision: null, source: "rules", ...o });
describe("flag rules", () => {
  it("no flag when type, place and purpose carry over", () => {
    const r = flagsFor({ source: info({ visualType: "city/location page", geography: "city:Dublin" }), destination: info({ visualType: "city/location page", geography: "city:Dublin" }) }); expect(r.flags).toEqual([]); expect(r.proposed.text).toBe("No new issue detected; existing decision unchanged.");
  });
  it("money and city pages are one family for the type check but geography still flags", () => {
    const r = flagsFor({ source: info({ visualType: "city/location page", geography: "city:Oakland", purposes: ["divorce"] }), destination: info({ visualType: "money page", geography: "general", purposes: ["divorce"] }) });
    expect(r.flags.map((f) => f.id)).toEqual(["geography-city-to-general"]); expect(r.proposed.kind).toBe("hold");
  });
  it("different city, and same city with a purpose the destination does not name", () => {
    expect(flagsFor({ source: info({ geography: "city:Oakland" }), destination: info({ geography: "city:San Jose" }) }).flags.map((f) => f.id)).toContain("geography-different-city");
    const r = flagsFor({ source: info({ geography: "city:San Mateo", purposes: ["rental or tenants"] }), destination: info({ geography: "city:San Mateo", purposes: [] }) }); expect(r.flags.map((f) => f.id)).toContain("purpose-mismatch");
  });
  it("crossing types holds; a money page into a guide and a guide into a money page both flag", () => {
    expect(flagsFor({ source: info({ visualType: "money page" }), destination: info({ visualType: "guide/blog", wpType: "post" }) }).flags.map((f) => f.id)).toContain("crosses-type");
    expect(flagsFor({ source: info({ visualType: "guide/blog", wpType: "post" }), destination: info({ visualType: "money page" }) }).flags.map((f) => f.id)).toContain("crosses-type");
  });
  it("keeps the confirmed MG8 exception unless there is new evidence", () => {
    const r = flagsFor({ source: info({ visualType: "story/case study", wpType: "post" }), destination: info({ visualType: "money page" }), isMG8Exception: true }); expect(r.proposed.kind).toBe("none"); expect(r.proposed.text).toContain("confirmed exception");
    const r2 = flagsFor({ source: info({ visualType: "story/case study", wpType: "post", changedSinceDecision: "title changed" }), destination: info({ visualType: "money page" }), isMG8Exception: true }); expect(r2.proposed.kind).toBe("hold");
  });
  it("protected pages and a page that changed since the decision are flagged", () => {
    expect(flagsFor({ source: info({}), destination: info({ protected: true }) }).flags.map((f) => f.id)).toContain("protected-destination");
    expect(flagsFor({ source: info({ changedSinceDecision: "now redirects" }), destination: info({}) }).flags.map((f) => f.id)).toContain("changed-source");
  });
  it("low confidence and WordPress/visual disagreement ask for confirmation, not HOLD", () => {
    const r = flagsFor({ source: info({ wpType: "post", visualType: "money page", confidence: "low" }), destination: info({}) }); expect(r.flags.map((f) => f.id).sort()).toEqual(["low-confidence-source", "wp-visual-source"]); expect(r.proposed.kind).toBe("none");
  });
  it("derives geography and purposes from the title and address", () => {
    expect(geographyOf("Sell Your Rental Property in San Mateo", "https://www.twinhomebuyer.com/sell-rental-property-in-san-mateo/")).toBe("city:San Mateo");
    expect(geographyOf("We Buy Houses for Cash in California", "https://www.twinhomebuyer.com/we-buy-houses-for-cash-in-california/")).toBe("statewide");
    expect(geographyOf("Bay Area cash buyers", "https://www.twinhomebuyer.com/x/")).toBe("general");
    expect(purposesOf("Divorcing and Need to Sell the Oakland House?")).toContain("divorce");
  });
});
