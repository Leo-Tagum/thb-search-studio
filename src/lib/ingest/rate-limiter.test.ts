import { describe, expect, it } from "vitest";
import { createLimiter, type Clock } from "./rate-limiter";

function fakeClock(): Clock & { t: number } {
  const c = { t: 0, now() { return c.t; }, async sleep(ms: number) { c.t += ms; } };
  return c;
}

describe("rate limiter", () => {
  it("never allows more than 20 requests in any rolling 60s window (mocked clock)", async () => {
    const clock = fakeClock();
    const lim = createLimiter(20, clock);
    for (let i = 0; i < 200; i++) { await lim.wait(); clock.t += 5; } // 5ms of work per request
    const s = lim.stamps;
    for (let i = 0; i < s.length; i++) {
      const inWindow = s.filter((x) => x >= s[i] && x < s[i] + 60000).length;
      expect(inWindow).toBeLessThanOrEqual(20);
    }
  });
  it("refuses a limit above 20/min", () => { expect(() => createLimiter(30)).toThrow(); });
});
