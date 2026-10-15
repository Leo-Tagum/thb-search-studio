// READ-ONLY. After you publish the approved sections, a fresh crawl must show each section live with the exact text, in the right place, and nothing else on the page changed.
// It compares a fresh crawl (--after) with a baseline crawl taken BEFORE publishing (--before; if omitted, the 2026-10-14 crawls under docs/drafts/crawls* are used) and checks
// every section in the manifest: exact text, the heading before and after it, page title, meta description, H1, canonical, robots, schema, forms, calls to action and links.
// It writes nothing except a report on screen. --crawl runs the crawler first (own hosts only, GET only, 1 request per 3 seconds, robots.txt respected) into --after.
//   npx tsx scripts/verify-publish.mts <manifest.json> [--before <dir>] [--after <dir>] [--crawl]
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { verifyPage, type Manifest } from "../src/lib/crawl/verify-publish";
import type { PageRead } from "../src/lib/crawl/types";

const argv = process.argv.slice(2);
const opt = (n: string) => { const i = argv.indexOf(`--${n}`); return i > -1 ? argv[i + 1] : undefined; };
const manifestPath = argv.find((a, i) => !a.startsWith("--") && !["--before", "--after"].includes(argv[i - 1] ?? ""));
if (!manifestPath) throw new Error("usage: verify-publish.mts <manifest.json> [--before dir] [--after dir] [--crawl]");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
const after = opt("after") ?? "docs/drafts/crawls-postpublish"; const before = opt("before");

if (argv.includes("--crawl")) {
  if (existsSync(after)) throw new Error(`${after} already exists; the crawler will not overwrite it. Pass a new --after folder.`);
  const urls = manifest.pages.map((p) => p.url);
  const r = spawnSync("npx", ["tsx", "scripts/crawl-pages.mts", ...urls, "--out", after], { stdio: "inherit", shell: true });
  if (r.status !== 0) throw new Error(`crawler stopped (exit ${r.status}); not verifying`);
}
const load = (dir: string, slug: string): PageRead | null => { const f = `${dir}/${slug}/crawl.json`; return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as PageRead) : null; };
const stored = (slug: string): PageRead | null => { for (const d of readdirSync("docs/drafts").filter((x) => x.startsWith("crawls") && `docs/drafts/${x}` !== after).map((x) => `docs/drafts/${x}`)) { const r = load(d, slug); if (r?.ok) return r; } return null; };
if (!before) console.log("No --before folder: using the stored crawls from 2026-10-14 as the baseline. If anyone edited these pages since, the text check will show it; for a clean comparison, crawl them just before you publish and pass --before.\n");

let allOk = true;
for (const p of manifest.pages) {
  const a = load(after, p.slug); const b = before ? load(before, p.slug) : stored(p.slug);
  if (!a) { console.log(`FAIL ${p.url}\n   no fresh crawl in ${after}/${p.slug}\n`); allOk = false; continue; }
  if (!b) { console.log(`FAIL ${p.url}\n   no baseline crawl for ${p.slug}\n`); allOk = false; continue; }
  const v = verifyPage(b, a, p); allOk = allOk && v.ok;
  console.log(`${v.ok ? "PASS" : "FAIL"} ${p.url}`);
  for (const c of v.checks) console.log(`   ${c.ok ? (c.warn ? "!" : "ok") : "XX"}  ${c.name}: ${c.detail}`);
  console.log();
}
console.log(allOk ? "ALL PAGES PASS: every section is live and nothing else changed." : "NOT PASSING: fix the lines marked XX, re-publish if needed, and crawl again (use a new --after folder).");
process.exit(allOk ? 0 : 1);
