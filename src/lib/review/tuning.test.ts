import { describe, expect, it } from "vitest";
import { guessType, shorten, type PageFeatures } from "../crawl/page-type";
import { flagsFor, geographyOf, purposesOf } from "./flags";
import type { PageInfo } from "./types";

const feat = (o: Partial<PageFeatures>): PageFeatures => ({ url: "https://www.twinhomebuyer.com/x/", title: "t", h1: "h", wpType: "post", protectedAd: false, words: 900, firstFormY: null, firstCtaY: null, ctaCount: 0, ctaCountAfterFold: 0, hasByline: false, hasDate: false, hasArticleSchema: false, hasLocalBusinessSchema: false, navLinks: 30, ...o });
const info = (o: Partial<PageInfo>): PageInfo => ({ url: "https://www.twinhomebuyer.com/a/", wpType: "post", visualType: "guide/blog", confidence: "high", evidence: [], purposeText: "", purposes: [], geography: "general", protected: false, changedSinceDecision: null, source: "rules", ...o });

describe("fix 1: informational headings are not a sell-to-us message", () => {
  it.each(["iBuyers : Who Are They? What Should You Know?", "How Cash Home Buyers Work in California (2025–2026 Guide): The 4 Types of Buyers & What Homeowners Should Know", "Cash Buyer vs Realtor: Which Is Right for You?"])("%s", (h1) => {
    const g = guessType(feat({ h1, title: h1, hasDate: true }));
    expect(g.type).toBe("guide/blog"); expect(g.evidence.join(" ")).not.toMatch(/sell-to-us/);
  });
  it("a real offer heading still counts", () => { const g = guessType(feat({ wpType: "page", h1: "We Buy Houses For Cash In California", firstFormY: 300 })); expect(g.type).toBe("money page"); expect(g.evidence.join(" ")).toMatch(/sell-to-us/); });
  it("a bare noun phrase ('cash home buyers', 'as-is') is not enough on its own", () => { expect(guessType(feat({ h1: "Cash Home Buyers in the Bay Area", title: "As-Is Sales" })).evidence.join(" ")).not.toMatch(/sell-to-us/); });
});

describe("fix 2: headings are never cut mid-word", () => {
  const long = "How Cash Home Buyers Work in California (2025–2026 Guide): The 4 Types of Buyers & What Homeowners Should Know";
  it("a heading under the limit is shown whole", () => { expect(shorten(long, 140)).toBe(long); });
  it("a longer one is cut at a word boundary with an ellipsis", () => { const s = shorten(long, 70); expect(s.endsWith("...")).toBe(true); expect(long.startsWith(s.slice(0, -3))).toBe(true); expect(long[s.length - 3]).toBe(" "); });
  it("the evidence text carries the whole heading, not '...Guide): T'", () => { expect(guessType(feat({ h1: long, title: long, hasDate: true })).evidence.join(" ")).not.toMatch(/Guide\): T"/); });
});

describe("fix 3: statewide place needs service-area wording", () => {
  it("a guide title that mentions California is general", () => { expect(geographyOf("How Cash Home Buyers Work in California | 2025–2026 Guide", "https://www.twinhomebuyer.com/how-cash-home-buyers-work-california/")).toBe("general"); });
  it("a service-area heading is statewide", () => { expect(geographyOf("We Buy Houses For Cash In California", "https://www.twinhomebuyer.com/we-buy-houses-for-cash-in-california/")).toBe("statewide"); });
  it("a Bay Area page that names California is not statewide", () => { expect(geographyOf("We Buy Houses in the Bay Area, California", "https://www.twinhomebuyer.com/x/")).toBe("general"); });
  it("a city still wins", () => { expect(geographyOf("We Buy Houses in Dublin, California", "https://www.twinhomebuyer.com/we-buy-houses-in-dublin/")).toBe("city:Dublin"); });
});

describe("fix 4: approved sections waiting to be published count for the purpose rule", () => {
  const src = info({ purposes: purposesOf("Are cash offers legit"), geography: "general" });
  it("the source purpose is legitimacy", () => { expect(src.purposes).toContain("buyer types or legitimacy"); });
  it("without pending sections it is a HOLD", () => { const r = flagsFor({ source: src, destination: info({ url: "https://www.twinhomebuyer.com/b/", purposes: ["process"] }) }); expect(r.flags.map((f) => f.id)).toEqual(["purpose-mismatch"]); expect(r.proposed.kind).toBe("hold"); });
  it("a pending 'Where iBuyers Fit' section turns the HOLD into a confirm flag that says it is not live yet", () => {
    const r = flagsFor({ source: src, destination: info({ url: "https://www.twinhomebuyer.com/b/", purposes: ["process"], pendingHeadings: ["Where iBuyers Fit", "Red Flags Before You Sign"] }) });
    expect(r.flags.map((f) => [f.id, f.severity])).toEqual([["purpose-pending", "confirm"]]); expect(r.flags[0].rule).toMatch(/not yet published/); expect(r.proposed.kind).toBe("none");
  });
  it("a pending section about something else does not cover it", () => { const r = flagsFor({ source: src, destination: info({ url: "https://www.twinhomebuyer.com/b/", pendingHeadings: ["Get Your Information Ready"] }) }); expect(r.flags.map((f) => f.id)).toContain("purpose-mismatch"); });
  it("a purpose that is still missing stays a HOLD next to a covered one", () => {
    const s2 = info({ purposes: ["buyer types or legitimacy", "divorce"] }); const r = flagsFor({ source: s2, destination: info({ url: "https://www.twinhomebuyer.com/b/", pendingHeadings: ["Where iBuyers Fit"] }) });
    expect(r.flags.map((f) => f.id).sort()).toEqual(["purpose-mismatch", "purpose-pending"]); expect(r.proposed.kind).toBe("hold");
  });
  it("the flag never changes the card ids or the decision: it only lists what is waiting", () => { expect(flagsFor({ source: src, destination: info({ pendingHeadings: ["Where iBuyers Fit"] }) }).flags.every((f) => f.severity === "confirm")).toBe(true); });
});
