import { describe, expect, it } from "vitest";
import { createLimiter, type Clock } from "../ingest/rate-limiter";
import { fetchPostBodies, StopError } from "./fetch-bodies";

const clock = (): Clock & { t: number } => { const c = { t: 0, now: () => c.t, async sleep(ms: number) { c.t += ms; } }; return c; };
const body = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, link: `https://x/p${i}/`, modified: "", content: { rendered: "<p>hi</p>" } }));
const resp = (status: number, rows: unknown[], pages = "2") => new Response(JSON.stringify(rows), { status, headers: { "x-wp-totalpages": pages } });

describe("fetchPostBodies", () => {
  it("uses 2 requests for 122 posts and never exceeds 5/min", async () => {
    const c = clock(); const lim = createLimiter(5, c);
    let call = 0;
    const f = (async () => (++call === 1 ? resp(200, body(100)) : resp(200, body(22)))) as unknown as typeof fetch;
    const r = await fetchPostBodies("https://x", lim, f);
    expect(r.requests).toBe(2); expect(r.posts).toHaveLength(122);
    const s = lim.stamps;
    for (const t of s) expect(s.filter((x) => x >= t && x < t + 60000).length).toBeLessThanOrEqual(5);
  });
  for (const status of [429, 503, 500]) {
    it(`stops on ${status} without retrying`, async () => {
      let calls = 0;
      const f = (async () => { calls++; return resp(status, []); }) as unknown as typeof fetch;
      await expect(fetchPostBodies("https://x", createLimiter(5, clock()), f)).rejects.toBeInstanceOf(StopError);
      expect(calls).toBe(1);
    });
  }
});
