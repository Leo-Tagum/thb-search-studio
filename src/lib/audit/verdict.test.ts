import { describe, expect, it } from "vitest";
import { runChecks } from "./checks";
import { computeOverlaps, type KnownPage, type PqRow } from "./overlap";
import { proposeVerdicts, validateTargets, type Overlap, type PostInput } from "./verdict";

const clean = runChecks(`<p>Title, authority and tenants decide escrow. Confirm with an attorney.</p><h2>Sources</h2><p>About the author</p>`);
const NOW = new Date("2026-10-10");
function post(id: string, o: Partial<PostInput> = {}): PostInput {
  return {
    id, url: `https://s/${id}/`, title: id, modifiedAt: "2026-01-01", protection: "unknown", templateFlag: "unknown", hasBody: true, wordCount: 900,
    search: { hasData: true, clicks: 10, impressions: 500, position: 12, queries: [] }, findings: clean, linksOut: 3, inboundFrom: [], overlaps: [], ...o,
  };
}
const ov = (target: string, n = 6, fraction = 0.8, extra: Partial<Overlap> = {}): Overlap => ({
  key: target, page_id: target, url: `https://s/${target}/`, title: target, kind: "post", protection: "unknown",
  shared: Array.from({ length: n }, (_, i) => `q${i}`), sharedImpressions: 100, fraction, supported: n >= 3 && fraction >= 0.4, partnerClicks: 0, partnerImpressions: 0, ...extra,
});
const none = { hasData: false, clicks: 0, impressions: 0, position: null, queries: [] };

describe("verdict guardrails", () => {
  it("a post with no GSC data is never MERGE/RETIRE/NOINDEX on that basis (and is not 'dead')", () => {
    const r = proposeVerdicts([post("a", { search: none })], NOW).get("a")!;
    expect(r.verdict).toBe("KEEP");
    expect(r.unknowns.join(" ")).toMatch(/UNKNOWN, not proof/);
    expect(r.reason).toMatch(/unknown/i);
  });
  it("protected posts are FLAG_ONLY even with overlap and issues", () => {
    const r = proposeVerdicts([post("a", { protection: "protected", overlaps: [ov("b")] }), post("b", { search: { hasData: true, clicks: 99, impressions: 900, position: 3, queries: [] } })], NOW).get("a")!;
    expect(r.verdict).toBe("FLAG_ONLY");
  });
  it("never merges into a protected survivor", () => {
    const m = proposeVerdicts([post("a", { overlaps: [ov("b")] }), post("b", { protection: "protected", search: { hasData: true, clicks: 99, impressions: 900, position: 3, queries: [] } })], NOW);
    expect(["MERGE", "RETIRE"]).not.toContain(m.get("a")!.verdict);
  });
  it("supported overlap proposes MERGE into the stronger post and names it", () => {
    const m = proposeVerdicts([post("a", { overlaps: [ov("b", 6, 0.6)] }), post("b", { search: { hasData: true, clicks: 40, impressions: 900, position: 4, queries: [] } })], NOW);
    const a = m.get("a")!;
    expect(a.verdict).toBe("MERGE"); expect(a.targetId).toBe("b"); expect(a.reason).toMatch(/Survivor: https:\/\/s\/b\//);
    expect(m.get("b")!.verdict).toBe("KEEP"); expect(m.get("b")!.notes.join(" ")).toMatch(/Would absorb/);
    expect(validateTargets(m, new Set(["a", "b"]))).toEqual([]);
  });
  it("mostly-shared thin duplicate becomes RETIRE (301) to the survivor", () => {
    const m = proposeVerdicts([post("a", { wordCount: 450, search: { hasData: true, clicks: 0, impressions: 120, position: 20, queries: [] }, overlaps: [ov("b", 9, 0.95)] }), post("b", { search: { hasData: true, clicks: 40, impressions: 900, position: 4, queries: [] } })], NOW);
    expect(m.get("a")!.verdict).toBe("RETIRE"); expect(m.get("a")!.targetUrl).toBe("https://s/b/");
  });
  it("does not build merge chains or loops: A->B->C stays unresolved by hand", () => {
    const strong = (c: number) => ({ hasData: true, clicks: c, impressions: c * 10, position: 5, queries: [] });
    const m = proposeVerdicts([
      post("a", { search: strong(1), overlaps: [ov("b")] }),
      post("b", { search: strong(5), overlaps: [ov("c"), ov("a")] }),
      post("c", { search: strong(20), overlaps: [ov("b")] }),
    ], NOW);
    expect(m.get("c")!.verdict).not.toBe("MERGE");
    expect(m.get("b")!.verdict).toBe("MERGE");
    expect(m.get("a")!.verdict).not.toBe("MERGE"); // would chain a->b->c
    expect(m.get("a")!.notes.join(" ")).toMatch(/chain/);
    expect(validateTargets(m, new Set(["a", "b", "c"]))).toEqual([]);
  });
  it("validateTargets catches a missing, self or retired target", () => {
    const m = proposeVerdicts([post("a", { overlaps: [ov("b")] }), post("b", { search: { hasData: true, clicks: 99, impressions: 900, position: 3, queries: [] } })], NOW);
    expect(validateTargets(m, new Set(["a"]))).toHaveLength(1);
  });
  it("similar-looking pages with no shared queries make no overlap claim", () => {
    const m = proposeVerdicts([post("a", { overlaps: [ov("b", 2, 0.9)] }), post("b")], NOW);
    expect(m.get("a")!.verdict).toBe("KEEP"); expect(m.get("a")!.notes.join(" ")).toMatch(/not enough for a cannibalization claim/);
  });
  it("overlap with a page is a note, never a merge", () => {
    const r = proposeVerdicts([post("a", { overlaps: [ov("p", 8, 0.9, { kind: "page" })] })], NOW).get("a")!;
    expect(r.verdict).toBe("KEEP"); expect(r.notes.join(" ")).toMatch(/never merged into pages/);
  });
  it("issues drive UPDATE; clean post stays KEEP; dated thin post is NOINDEX with low confidence and agent review", () => {
    expect(proposeVerdicts([post("a", { findings: runChecks("<p>With over 25 years of experience.</p><h2>Sources</h2>") })], NOW).get("a")!.verdict).toBe("UPDATE");
    expect(proposeVerdicts([post("a")], NOW).get("a")!.verdict).toBe("KEEP");
    const n = proposeVerdicts([post("a", { title: "Bay Area market 2022", wordCount: 350 })], NOW).get("a")!;
    expect(n.verdict).toBe("NOINDEX"); expect(n.confidence).toBe("low"); expect(n.needsAgentReview).toBe(true);
  });
});

describe("overlap detection", () => {
  const pages: KnownPage[] = [
    { id: "a", url: "https://www.s.com/a/", title: "A", wp_type: "post", protection: "unknown" },
    { id: "b", url: "https://www.s.com/b/", title: "B", wp_type: "post", protection: "unknown" },
    { id: "c", url: "https://www.s.com/c/", title: "C near-identical title", wp_type: "post", protection: "unknown" },
  ];
  const rows = (id: string, qs: string[], imp = 20): PqRow[] => qs.map((q) => ({ page_url: `https://www.s.com/${id}/`, page_id: id, query: q, impressions: imp, clicks: 1 }));
  it("supports overlap on shared queries, not on similarity; no-data post gets nothing", () => {
    const m = computeOverlaps([...rows("a", ["q1", "q2", "q3", "q4"]), ...rows("b", ["q1", "q2", "q3", "q9"]), ...rows("c", ["z1"])], pages);
    expect(m.get("a")![0]).toMatchObject({ page_id: "b", supported: true });
    expect(m.get("a")!.some((o) => o.page_id === "c")).toBe(false);
    expect(m.get("c")).toEqual([]);
  });
  it("brand queries do not create overlap", () => {
    const m = computeOverlaps([...rows("a", ["twin home buyer", "twin home buyer reviews", "twinhomebuyer"]), ...rows("b", ["twin home buyer", "twin home buyer reviews", "twinhomebuyer"])], pages);
    expect(m.get("a") ?? []).toEqual([]);
  });
});
