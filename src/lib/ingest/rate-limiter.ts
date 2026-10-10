// Global limiter for requests to THB's site: at most `perMinute` per rolling 60s (hard rule: 20).
export type Clock = { now(): number; sleep(ms: number): Promise<void> };
export const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

export function createLimiter(perMinute = 20, clock: Clock = realClock) {
  if (perMinute > 20) throw new Error("THB site rate limit is 20 requests/minute");
  const gap = Math.ceil(60000 / perMinute) + 100; // small safety margin
  let last = -Infinity;
  const stamps: number[] = [];
  return {
    stamps,
    async wait() {
      const w = last + gap - clock.now();
      if (w > 0) await clock.sleep(w);
      last = clock.now();
      stamps.push(last);
    },
  };
}
