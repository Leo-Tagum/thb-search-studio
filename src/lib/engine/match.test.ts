import { describe, expect, it } from "vitest";
import { matchPages, normalizeUrl } from "./match";

describe("page matching", () => {
  it("normalizes www, scheme, slash, query, fragment, case", () => {
    expect(normalizeUrl("https://www.twinhomebuyer.com/Blog/x/?utm=1#top")).toBe(normalizeUrl("http://twinhomebuyer.com/blog/x"));
  });
  it("keeps unmatched URLs and lists them", () => {
    const pages = [{ id: "1", url: "https://www.t.com/a/", canonical_url: "https://www.t.com/a/" }];
    const r = matchPages(["https://t.com/a", "https://t.com/zzz"], pages);
    expect(r.matched).toEqual(["https://t.com/a"]);
    expect(r.unmatched).toEqual(["https://t.com/zzz"]);
  });
});
