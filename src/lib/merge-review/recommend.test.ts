import { describe, expect, it } from "vitest";
import { buildPageRead } from "../crawl/analyze";
import { compare } from "../crawl/compare";
import type { Block, DocExtract } from "../crawl/types";
import { recommend, type PageEvidence } from "./recommend";

const doc = (blocks: Block[]): DocExtract => ({ title: "t", metaDescription: null, canonical: null, metaRobots: null, hreflang: [], og: {}, jsonLdRaw: [], h1s: [], headings: blocks.filter((b): b is Extract<Block, { t: "h" }> => b.t === "h").map((b) => ({ level: b.level, text: b.text })), blocks, links: [], images: [], forms: [], ctas: [], rootSelector: "main" });
const crawl = (url: string, blocks: Block[]) => buildPageRead({ requestedUrl: url, finalUrl: url, redirectChain: [], status: 200, fetchedAt: "x", userAgent: "u", raw: doc(blocks), rendered: doc(blocks), mobile: null, xRobotsTag: null });
const failed = (url: string) => buildPageRead({ requestedUrl: url, finalUrl: null, redirectChain: [], status: 403, fetchedAt: "x", userAgent: "u", raw: null, rendered: null, mobile: null, xRobotsTag: null, failure: "STOPPED: HTTP 403" });
const ev = (url: string, c: ReturnType<typeof crawl> | null, o: Partial<PageEvidence> = {}): PageEvidence => ({ url, protected: false, crawl: c, gsc: { clicks: 0, impressions: 10, position: 9, queries: [] }, inspection: null, ...o });

const UNIQUE: Block[] = [{ t: "h", level: 2, text: "Compare" }, { t: "p", text: "Selling as-is skips repairs showings and inspection renegotiation while fixing up adds months of carrying cost and contractor work for the seller." }];
const OTHER: Block[] = [{ t: "h", level: 2, text: "Something unrelated" }, { t: "p", text: "Completely different topic about probate timelines and heirs and paperwork that nobody else covers here at all today." }];

describe("merge-review gates", () => {
  it("a protected page can only be KEEP / AD, even when proposed as a source", () => {
    const r = recommend({ page: ev("https://www.twinhomebuyer.com/ad/", null, { protected: true }), destination: ev("https://www.twinhomebuyer.com/d/", crawl("https://www.twinhomebuyer.com/d/", OTHER)) });
    expect(r.decision).toBe("KEEP / AD"); expect(r.redirectStatus).toBeNull();
  });
  it("an unread source gives BLOCKED: content not reviewed, never a redirect or removal", () => {
    const r = recommend({ page: ev("https://www.twinhomebuyer.com/s/", failed("https://www.twinhomebuyer.com/s/")), destination: ev("https://www.twinhomebuyer.com/d/", crawl("https://www.twinhomebuyer.com/d/", OTHER)) });
    expect(r.decision).toBe("BLOCKED: content not reviewed");
    expect(recommend({ page: ev("https://www.twinhomebuyer.com/s/", null), noSensibleTarget: true }).decision).toBe("BLOCKED: content not reviewed");
  });
  it("an unread destination also blocks", () => {
    const r = recommend({ page: ev("https://www.twinhomebuyer.com/s/", crawl("https://www.twinhomebuyer.com/s/", UNIQUE)), destination: ev("https://www.twinhomebuyer.com/d/", failed("https://www.twinhomebuyer.com/d/")) });
    expect(r.decision).toBe("BLOCKED: content not reviewed");
  });
  it("a redirect with unique source content stays BLOCKED and lists exactly what must move", () => {
    const s = ev("https://www.twinhomebuyer.com/s/", crawl("https://www.twinhomebuyer.com/s/", UNIQUE)), d = ev("https://www.twinhomebuyer.com/d/", crawl("https://www.twinhomebuyer.com/d/", OTHER));
    const r = recommend({ page: s, destination: d, compare: compare(s.crawl!, d.crawl!) });
    expect(r.decision).toBe("REDIRECT RECOMMENDATION"); expect(r.redirectStatus).toBe("BLOCKED");
    expect(r.blockers.join(" ")).toContain('section "Compare"');
    expect(r.blockers.join(" ")).toContain("fresh crawl");
    expect(r.unknown).toEqual(["leads: unknown, Leo to fill", "backlinks: unknown, Leo to fill"]);
  });
  it("even with nothing to move, the redirect needs the owner's approval, and only the owner's flag lifts that", () => {
    const same = crawl("https://www.twinhomebuyer.com/s/", UNIQUE), s = ev("https://www.twinhomebuyer.com/s/", same), d = ev("https://www.twinhomebuyer.com/d/", crawl("https://www.twinhomebuyer.com/d/", UNIQUE));
    const c = compare(s.crawl!, d.crawl!);
    expect(recommend({ page: s, destination: d, compare: c }).redirectStatus).toBe("BLOCKED");
    expect(recommend({ page: s, destination: d, compare: c, ownerApproved: true }).redirectStatus).toBe("READY FOR OWNER SIGN-OFF");
  });
  it("a protected destination blocks any transfer into it", () => {
    const s = ev("https://www.twinhomebuyer.com/s/", crawl("https://www.twinhomebuyer.com/s/", UNIQUE)), d = ev("https://www.twinhomebuyer.com/d/", crawl("https://www.twinhomebuyer.com/d/", OTHER), { protected: true });
    expect(recommend({ page: s, destination: d, compare: compare(s.crawl!, d.crawl!) }).blockers.join(" ")).toContain("protected");
  });
  it("REWRITE needs all three owner-confirmed tests; REMOVE needs a completed compare and no clicks; otherwise BLOCKED", () => {
    const page = ev("https://www.twinhomebuyer.com/s/", crawl("https://www.twinhomebuyer.com/s/", UNIQUE));
    expect(recommend({ page, rewriteCriteria: { distinctIntent: true, realSellerQuestion: true, substantiallyDifferentContent: false } }).decision).toBe("BLOCKED: no destination given");
    expect(recommend({ page, rewriteCriteria: { distinctIntent: true, realSellerQuestion: true, substantiallyDifferentContent: true } }).decision).toBe("REWRITE");
    expect(recommend({ page, noSensibleTarget: true }).decision).toBe("BLOCKED: no destination given");
  });
  it("a page that is a destination is MAIN; every recommendation says index status is a hypothesis and shows protected status", () => {
    const r = recommend({ page: ev("https://www.twinhomebuyer.com/d/", crawl("https://www.twinhomebuyer.com/d/", OTHER), { inspection: { coverageState: "Crawled - currently not indexed", lastCrawl: null, googleCanonical: null, verdict: "NEUTRAL" } }), isDestination: true });
    expect(r.decision).toBe("MAIN");
    expect(r.evidence.join(" ")).toContain("hypothesis");
    expect(r.evidence.join(" ")).toContain("protected (Ads list)");
  });
});
