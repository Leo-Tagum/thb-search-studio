import { describe, expect, it } from "vitest";
import { noQueryDataNote } from "./cannibalization-note";

describe("cannibalization check when the main import has no rows for the page", () => {
  const total = { impressions: 79, clicks: 1, position: 7.4, start: "2025-06-15", end: "2026-10-07" };
  it("reports the page total from the audit data, with its window, and says overlap is unknown", () => {
    const n = noQueryDataNote("/sell-bay-area-house-full-of-belongings/", total);
    expect(n).toContain("no query data, page total 79 impressions, 1 click, average position 7.4 (2025-06-15..2026-10-07");
    expect(n).toContain('not a finding of "no overlap"');
  });
  it("pluralizes clicks and survives a missing position", () => {
    expect(noQueryDataNote("/x/", { ...total, clicks: 3, position: NaN })).toContain("3 clicks (");
  });
  it("says NO DATA only when there is no page total either", () => {
    const n = noQueryDataNote("/x/", null);
    expect(n).toMatch(/^NO DATA/);
    expect(n).toContain('not a finding of "no overlap"');
  });
});
