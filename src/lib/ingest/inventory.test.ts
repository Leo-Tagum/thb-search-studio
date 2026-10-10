import { describe, expect, it } from "vitest";
import { mergeInventory, normUrl, parseHead } from "./inventory";

describe("inventory", () => {
  it("normalises trailing slash, case, query and hash to one canonical", () => {
    expect(normUrl("https://WWW.example.com/a/b")).toBe(normUrl("https://www.example.com/a/b/?x=1#y"));
  });
  it("de-duplicates by canonical and marks sitemap membership", () => {
    const items = [
      { id: 1, slug: "a", link: "https://t.com/a/", modified: "2026-01-01T00:00:00", type: "post", status: "publish" },
      { id: 2, slug: "a", link: "https://t.com/a", modified: "2026-01-01T00:00:00", type: "page", status: "publish" }, // duplicate canonical
      { id: 3, slug: "b", link: "https://t.com/b/", modified: "2026-01-01T00:00:00", type: "page", status: "publish" },
    ];
    const rows = mergeInventory(items, ["https://t.com/a/", "https://t.com/c/"]);
    expect(rows.map((r) => r.canonical_url).sort()).toEqual(["https://t.com/a/", "https://t.com/b/", "https://t.com/c/"]);
    expect(rows.find((r) => r.slug === "b")!.in_sitemap).toBe(false);
    expect(rows.find((r) => r.wp_type === "sitemap_only")!.in_api).toBe(false);
  });
  it("parses title, description, h1, canonical", () => {
    const h = parseHead('<title>A &amp; B</title><meta name="description" content="Desc"><link rel="canonical" href="https://t.com/x/"><h1><span>Hi</span></h1>');
    expect(h).toEqual({ title: "A & B", description: "Desc", h1: "Hi", canonical: "https://t.com/x/" });
  });
});
