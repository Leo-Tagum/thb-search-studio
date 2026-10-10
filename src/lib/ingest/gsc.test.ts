import { describe, expect, it } from "vitest";
import { fetchGsc, windowFor, GSC_SCOPE, GSC_CAVEATS, type GscRow } from "./gsc";

const row = (i: number): GscRow => ({ keys: [`https://x/p${i}`, `q${i}`, "2026-10-01"], clicks: 1, impressions: 10, ctr: 0.1, position: 5 });

describe("gsc import", () => {
  it("pages until a short page and records the request count", async () => {
    const calls: number[] = [];
    const call = async (b: Record<string, unknown>) => { calls.push(b.startRow as number); return b.startRow === 0 ? [row(1), row(2)] : [row(3)]; };
    const r = await fetchGsc(call, { start: "a", end: "b", pageSize: 2 });
    expect(calls).toEqual([0, 2]);
    expect(r.rows).toHaveLength(3);
    expect(r.truncated).toBe(false);
  });
  it("flags truncation at the row cap", async () => {
    const r = await fetchGsc(async () => [row(1), row(2)], { start: "a", end: "b", pageSize: 2, maxRows: 4 });
    expect(r.truncated).toBe(true);
    expect(r.rows).toHaveLength(4);
  });
  it("window is exact and inclusive", () => {
    expect(windowFor(new Date("2026-10-10T12:00:00Z"), 90)).toEqual({ start: "2026-07-10", end: "2026-10-07" });
  });
  it("only the read-only scope, and caveats say absent != no demand", () => {
    expect(GSC_SCOPE.endsWith("webmasters.readonly")).toBe(true);
    expect(GSC_CAVEATS.join(" ")).toMatch(/UNKNOWN, not proof of no demand/);
  });
});
