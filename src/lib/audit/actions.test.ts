import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { actionsToCsv, validateActions, type ActionRow } from "./actions";

const inv = new Set(["https://www.s.com/a/", "https://www.s.com/b/", "https://www.s.com/c/"]);
const row = (o: Partial<ActionRow>): ActionRow => ({ action: "RETIRE", old_url: "https://www.s.com/a/", target_url: "https://www.s.com/b/", reason: "r", evidence_summary: "e", ...o });

describe("manual action list checks", () => {
  it("accepts a clean redirect and a NOINDEX", () => {
    expect(validateActions([row({}), row({ action: "NOINDEX", old_url: "https://www.s.com/c/", target_url: null })], inv)).toEqual([]);
  });
  it("rejects missing target, unknown target, self redirect, chain and loop", () => {
    expect(validateActions([row({ target_url: null })], inv)[0]).toMatch(/no target/);
    expect(validateActions([row({ target_url: "https://www.s.com/zzz/" })], inv)[0]).toMatch(/not an existing/);
    expect(validateActions([row({ target_url: "https://s.com/a" })], inv)[0]).toMatch(/itself/);
    expect(validateActions([row({}), row({ old_url: "https://www.s.com/b/", target_url: "https://www.s.com/c/" })], inv).join()).toMatch(/chain or loop/);
    expect(validateActions([row({}), row({ old_url: "https://www.s.com/b/", target_url: "https://www.s.com/a/" })], inv).length).toBe(2);
  });
  it("rejects a redirect to a noindexed target and a NOINDEX with a target", () => {
    expect(validateActions([row({}), row({ action: "NOINDEX", old_url: "https://www.s.com/b/", target_url: null })], inv).join()).toMatch(/noindexed/);
    expect(validateActions([row({ action: "NOINDEX" })], inv)[0]).toMatch(/must not have a target/);
  });
  it("exports CSV with 301 for redirects and quoted fields", () => {
    const csv = actionsToCsv([row({ reason: 'has "quotes", commas' })]);
    expect(csv.split("\r\n")[0]).toBe("action,old_url,target_url,http_redirect,reason,evidence_summary,status");
    expect(csv).toContain('"301"');
    expect(csv).toContain('"has ""quotes"", commas"');
  });
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p]; });
}
describe("the Studio never writes to WordPress (audit code paths)", () => {
  const cwd = process.cwd();
  const targets = [...files(join(cwd, "src/lib/audit")), ...files(join(cwd, "src/app/audit")), join(cwd, "scripts/fetch-post-bodies.mts"), join(cwd, "scripts/run-blog-audit.mts")] /* import-gsc-audit.mts POSTs to Google Search Console (read-only query API), not to WordPress */
    .filter((f) => /\.(ts|tsx|mts)$/.test(f) && !f.endsWith(".test.ts"));
  it("has no non-GET HTTP method, WP credentials or Authorization header", () => {
    expect(targets.length).toBeGreaterThan(5);
    for (const f of targets) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/method\s*:\s*["'](POST|PUT|PATCH|DELETE)["']/);
      expect(src, f).not.toMatch(/WP_(APP_)?(PASSWORD|USER|TOKEN|SECRET)|Authorization/i);
    }
  });
  it("only the body fetcher talks to the THB site, and it only GETs through the limiter", () => {
    const talkers = targets.filter((f) => /\bfetch\(|doFetch\(/.test(readFileSync(f, "utf8")));
    expect(talkers.map((f) => f.split(/[\\/]/).pop())).toEqual(["fetch-bodies.ts"]);
    expect(readFileSync(join(cwd, "src/lib/audit/fetch-bodies.ts"), "utf8")).toMatch(/limiter\.wait\(\)/);
  });
});
