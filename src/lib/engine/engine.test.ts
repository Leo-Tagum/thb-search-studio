import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildCandidates, type MetricRow, type PageInfo } from "./candidates";
import { parseQuery } from "./intent";
import { buildScore, searchOpportunity } from "./score";

const W = { start: "2026-07-10", end: "2026-10-07" };
const page = (slug: string, title: string, extra: Partial<PageInfo> = {}): PageInfo => ({
  id: slug, url: `https://www.t.com/${slug}/`, canonical_url: `https://www.t.com/${slug}/`, title, meta_title: null, slug,
  protection_status: "unknown", template_flag: "unknown", ...extra,
});
const row = (slug: string, query: string, impressions: number, position = 12): MetricRow => ({ page_url: `https://www.t.com/${slug}/`, page_id: slug, query, impressions, clicks: 0, position });
const opts = { window: W, firstPartyProof: "restricted" as const };

describe("intent parsing", () => {
  it("strips places and keeps the same intent key across cities", () => {
    expect(parseQuery("we buy houses oakland").key).toBe(parseQuery("we buy houses in san jose ca").key);
    expect(parseQuery("we buy houses oakland").places).toEqual(["oakland"]);
  });
});

describe("blueprint §14 fixtures", () => {
  it("row 2: a city-name swap candidate is REJECT/HOLD, never CREATE", () => {
    const pages = [page("we-buy-houses-oakland", "We buy houses Oakland"), page("we-buy-houses-san-jose", "We buy houses San Jose"), page("we-buy-houses-concord", "We buy houses Concord")];
    const rows = [row("we-buy-houses-oakland", "we buy houses oakland", 200), row("we-buy-houses-san-jose", "we buy houses san jose", 200), row("we-buy-houses-concord", "we buy houses concord", 200),
      row("we-buy-houses-oakland", "we buy houses fremont", 90, 40)];
    const { candidates } = buildCandidates(rows, pages, opts);
    const fremont = candidates.find((c) => c.scope === "fremont")!;
    expect(fremont.kind).toBe("city_swap");
    expect(["REJECT", "HOLD"]).toContain(fremont.proposed_action);
    expect(fremont.family!.size).toBeGreaterThanOrEqual(3);
  });

  it("row 1: an overlapping intent gets UPDATE with query-overlap evidence, not CREATE", () => {
    const pages = [page("how-cash-buyers-work", "How cash home buyers work"), page("cash-home-buyers-guide", "Cash home buyers guide")];
    const rows = [row("how-cash-buyers-work", "cash home buyers", 150, 9), row("cash-home-buyers-guide", "cash home buyers", 120, 14),
      row("how-cash-buyers-work", "cash house buyers", 60, 10), row("cash-home-buyers-guide", "cash house buyers", 50, 15)];
    const c = buildCandidates(rows, pages, opts).candidates[0];
    expect(c.overlap.supported).toBe(true);
    expect(c.proposed_action).toBe("UPDATE");
    expect(c.alternatives.join(" ")).toMatch(/MERGE/);
  });

  it("similar-looking pages that share no queries raise no cannibalization claim", () => {
    const pages = [page("a-guide", "Sell inherited house"), page("b-guide", "Sell inherited home")];
    const rows = [row("a-guide", "sell inherited house", 100), row("b-guide", "sell inherited home california", 100)];
    const { candidates } = buildCandidates(rows, pages, opts);
    expect(candidates.every((c) => !c.overlap.supported)).toBe(true);
  });

  it("row 11: absent queries are unknown, never 'no demand'", () => {
    const rows = [row("p", "sell hoarder house", 100)];
    const c = buildCandidates(rows, [page("p", "x")], opts).candidates[0];
    const gap = c.data_gaps.find((g) => g.key === "absent_queries_unknown")!;
    expect(gap.text).toMatch(/UNKNOWN, not proof of no demand/);
    expect(JSON.stringify(c)).not.toMatch(/no demand"/);
  });

  it("row 10: fan-out ideas can only be hypotheses", () => {
    const c = buildCandidates([row("p", "sell hoarder house", 100)], [page("p", "x")], opts).candidates[0];
    expect(c.fan_out_hypotheses.every((f) => f.status === "hypothesis")).toBe(true);
  });

  it("generic CREATE is only proposed when no page covers the intent", () => {
    const covered = buildCandidates([row("other", "sell condemned house", 100, 40)], [page("sell-condemned-house", "Sell condemned house")], opts).candidates[0];
    expect(covered.proposed_action).not.toBe("CREATE");
    const gap = buildCandidates([row("other", "sell house with solar lease", 100, 60)], [page("unrelated", "Unrelated")], opts).candidates[0];
    expect(gap.proposed_action).toBe("CREATE");
  });

  it("brand and off-topic queries are excluded, not treated as opportunities", () => {
    const r = buildCandidates([row("p", "twin home buyer", 900), row("p", "mahjongjp88", 500)], [page("p", "x")], opts);
    expect(r.candidates).toHaveLength(0);
    expect(r.excluded.brand).toBe(1);
    expect(r.excluded.offTopic).toBe(1);
  });

  it("UPDATE candidates carry the protection warning (unknown) and template flag", () => {
    const pages = [page("we-buy-houses-concord", "We buy houses Concord", { template_flag: "city" })];
    const c = buildCandidates([row("we-buy-houses-concord", "sell my house fast concord", 300, 3)], pages, opts).candidates[0];
    expect(c.proposed_action).toBe("UPDATE");
    expect(c.flags.protected_warning).toBe(true);
  });
});

describe("score is displayed, never a gate", () => {
  it("unknown parts are not scored (not zero)", () => {
    const s = buildScore({ impressions: 500, position: 10 });
    expect(s.parts.seller_relevance.value).toBeNull();
    expect(s.reading).toMatch(/partial/);
    expect(s.disclaimer).toMatch(/never approves, rejects or blocks/);
  });
  it("more impressions never lowers search opportunity", () => {
    expect(searchOpportunity(1000, 12).value).toBeGreaterThanOrEqual(searchOpportunity(100, 12).value);
  });
  it("no orchestrator or state-machine file imports the scorer", () => {
    const dir = join(process.cwd(), "src", "lib", "orchestrator");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
      expect(readFileSync(join(dir, f), "utf8")).not.toMatch(/engine\/score|from "\.\.\/engine/);
    }
  });
});
