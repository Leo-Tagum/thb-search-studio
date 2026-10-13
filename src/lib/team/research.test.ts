import { describe, expect, it } from "vitest";
import { r1SubmitErrors } from "./research";

const src = (url: string, o: Record<string, unknown> = {}) => ({ id: "src:1", kind: "official_url", url, ...o });
const claim = (o: Record<string, unknown> = {}) => ({ id: "clm:1", support: "supported", risk: "high", quote: "A seller must deliver the statement.", source_ids: ["src:1"], ...o });
const out = (sources: unknown[], claims: unknown[] = [claim()]) => ({ result: { sources, claims } }) as never;

describe("R1 official-source allowlist, enforced at submit", () => {
  const OFFICIAL = ["https://www.dre.ca.gov/x", "https://courts.ca.gov/forms", "https://www.sfgov.org/a", "https://www.oaklandca.gov/p", "https://www.cityofsanmateo.ca.us/x", "http://www.ca.gov/y", "https://WWW.COURTS.CA.GOV/z"];
  const NOT_OFFICIAL = [
    "https://www.opendoor.com/blog/x",              // competitor
    "https://www.twinhomebuyer.com/hoarder-houses/", // our own site
    "https://twinhomebuyer.com/x",
    "https://blog.sell-house-fast.com/probate",     // we-buy-houses
    "https://www.nolo.com/legal-encyclopedia/x",    // secondary legal publisher
    "https://www.zillow.com/learn/x",
    "https://en.wikipedia.org/wiki/Probate",
    "https://gov.evil.com/x",                       // ".gov" not at the end of the host
    "https://www.ca.gov.evil.com/x",
    "https://evil.com/www.ca.gov",                  // official host only in the path
    "https://www.ca.gov@evil.com/x",                // official host only as userinfo
    "https://notgov.com/x",
    "https://evilca.us/x",
    "https://www.ca.gov./x",                        // trailing dot
    "ftp://www.dre.ca.gov/x",
    "file:///etc/passwd",
    "not a url",
    "",
  ];
  for (const u of OFFICIAL) it(`accepts ${u}`, () => expect(r1SubmitErrors(out([src(u)]))).toEqual([]));
  for (const u of NOT_OFFICIAL) it(`rejects ${JSON.stringify(u)}`, () => expect(r1SubmitErrors(out([src(u)])).join(" ")).toMatch(/src:1/));
  it("rejects an official_url source with no url", () => expect(r1SubmitErrors(out([{ id: "src:1", kind: "official_url" }])).join(" ")).toMatch(/no url/));
  it("rejects a source kind R1 may not use", () => {
    expect(r1SubmitErrors(out([{ id: "src:1", kind: "web_search", url: "https://www.dre.ca.gov/x" }])).join(" ")).toMatch(/not allowed for R1/);
    expect(r1SubmitErrors(out([{ id: "src:1", kind: "gsc" }])).join(" ")).toMatch(/not allowed for R1/);
  });
  it("rejects the whole output when one of several sources is outside the allowlist, and names it", () => {
    const e = r1SubmitErrors(out([src("https://www.dre.ca.gov/x"), src("https://www.opendoor.com/x", { id: "src:2" })], [claim({ source_ids: ["src:1", "src:2"] })]));
    expect(e.some((x) => x.startsWith("source src:2"))).toBe(true);
    expect(e.some((x) => x.startsWith("source src:1"))).toBe(false);
    expect(e.join(" ")).toMatch(/claim clm:1 rests on non-official source src:2/);
  });
  it("a library source is allowed (it was approved into the Evidence Library by a human)", () => {
    expect(r1SubmitErrors(out([{ id: "src:1", kind: "library", library_source_id: "lib-1" }]))).toEqual([]);
  });
});

describe("R1 states a legal rule only with a word-for-word quote", () => {
  it("a supported high-risk claim without a quote is rejected", () => {
    expect(r1SubmitErrors(out([src("https://www.dre.ca.gov/x")], [claim({ quote: "" })])).join(" ")).toMatch(/word-for-word quote/);
    expect(r1SubmitErrors(out([src("https://www.dre.ca.gov/x")], [claim({ quote: undefined })])).join(" ")).toMatch(/word-for-word quote/);
    expect(r1SubmitErrors(out([src("https://www.dre.ca.gov/x")], [claim({ risk: "critical", quote: "  " })])).join(" ")).toMatch(/word-for-word quote/);
  });
  it("a supported high-risk claim with a quote is accepted; an unsupported claim needs none", () => {
    expect(r1SubmitErrors(out([src("https://www.dre.ca.gov/x")]))).toEqual([]);
    expect(r1SubmitErrors(out([src("https://www.dre.ca.gov/x")], [claim({ support: "unsupported", quote: undefined, source_ids: [] })]))).toEqual([]);
  });
  it("a quote over 1200 characters is rejected, 1200 is accepted", () => {
    expect(r1SubmitErrors(out([src("https://www.dre.ca.gov/x")], [claim({ quote: "x".repeat(1201) })])).join(" ")).toMatch(/longer than 1200/);
    expect(r1SubmitErrors(out([src("https://www.dre.ca.gov/x")], [claim({ quote: "x".repeat(1200) })])).join(" ")).not.toMatch(/longer than/);
  });
});
