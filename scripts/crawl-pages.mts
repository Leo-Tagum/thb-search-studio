// READ-ONLY page crawler for merge review. GET requests only: no clicks, logins, form submissions or content changes.
// Only twinhomebuyer.com and www.twinhomebuyer.com, https only. Honours robots.txt. One request every 3 seconds. Stops the whole run on 403, 429 or 5xx.
// Uses the locally installed Chrome in an isolated headless instance (temporary profile, never your own Chrome profile or windows). No browser download.
// For each URL it makes 3 requests: the raw HTML, the page rendered at desktop size, and the page rendered at a mobile size.
//   npx tsx scripts/crawl-pages.mts <url> [<url> ...] [--out docs/drafts/crawls] [--shots] [--known-redirected <file.csv>]
// Writes <out>/<slug>/crawl.json, page.md, raw.html (and desktop.png with --shots). Refuses to overwrite an existing crawl folder.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { EXTRACT_JS } from "../src/lib/crawl/extract-in-page";
import { buildPageRead, mobileSummary } from "../src/lib/crawl/analyze";
import { CRAWLER_UA, MIN_GAP_MS, isAccessRestriction, isAllowedUrl, parseRobots, robotsAllows, type RobotsRules } from "../src/lib/crawl/robots";
import { slugOf } from "../src/lib/crawl/text";
import type { DocExtract } from "../src/lib/crawl/types";

const argv = process.argv.slice(2);
const opt = (n: string) => { const i = argv.indexOf(`--${n}`); return i > -1 ? argv[i + 1] : undefined; };
const shots = argv.includes("--shots");
const outDir = opt("out") ?? "docs/drafts/crawls";
const valueArgs = new Set(["--out", "--known-redirected"]);
const urls = argv.filter((a, i) => !a.startsWith("--") && !valueArgs.has(argv[i - 1] ?? ""));
if (!urls.length) throw new Error("usage: crawl-pages.mts <url> [<url> ...] [--out dir] [--shots] [--known-redirected file.csv]");
for (const u of urls) if (!isAllowedUrl(u)) throw new Error(`Refusing ${u}: only https://twinhomebuyer.com and https://www.twinhomebuyer.com are crawled`);
const chromePath = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"].find((p) => existsSync(p));
if (!chromePath) throw new Error("Local Chrome not found; not downloading another browser");

let knownRedirected: string[] = [];
const kr = opt("known-redirected");
if (kr) knownRedirected = readFileSync(kr, "utf8").split(/\r?\n/).slice(1).map((l) => l.split(",")[0]?.trim()).filter((x) => x && x.startsWith("http") || x?.startsWith("/")).map((x) => (x.startsWith("/") ? `https://www.twinhomebuyer.com${x}` : x));

let last = 0, requests = 0;
const pace = async () => { const wait = last + MIN_GAP_MS - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); last = Date.now(); requests++; };
class Stop extends Error {}

async function rawFetch(url: string) {
  const chain: { url: string; status: number }[] = []; let cur = url;
  for (let hop = 0; hop < 6; hop++) {
    if (!isAllowedUrl(cur)) throw new Error(`Redirect leaves our hosts: ${cur}`);
    await pace();
    const res = await fetch(cur, { redirect: "manual", method: "GET", headers: { "User-Agent": CRAWLER_UA, Accept: "text/html" } });
    chain.push({ url: cur, status: res.status });
    if (isAccessRestriction(res.status)) throw new Stop(`HTTP ${res.status} on ${cur}`);
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) { cur = new URL(loc, cur).href; continue; }
    return { chain, finalUrl: cur, status: res.status, xRobotsTag: res.headers.get("x-robots-tag"), html: await res.text() };
  }
  throw new Error("Too many redirects");
}

const robots: Record<string, RobotsRules> = {};
async function robotsFor(url: string): Promise<RobotsRules> {
  const host = new URL(url).origin;
  if (robots[host]) return robots[host];
  await pace();
  const res = await fetch(`${host}/robots.txt`, { headers: { "User-Agent": CRAWLER_UA } });
  if (isAccessRestriction(res.status)) throw new Stop(`HTTP ${res.status} on ${host}/robots.txt`);
  return (robots[host] = res.status === 200 ? parseRobots(await res.text()) : { disallow: [], allow: [] });
}

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
let exitCode = 0;
try {
  for (const url of urls) {
    const dir = `${outDir}/${slugOf(url)}`;
    if (existsSync(dir)) throw new Error(`${dir} already exists; not overwriting (move it, or pass --out with a new folder)`);
    const fetchedAt = new Date().toISOString();
    let failure: string | undefined; let rawRes: Awaited<ReturnType<typeof rawFetch>> | null = null;
    let raw: DocExtract | null = null, rendered: DocExtract | null = null, mobile = null as ReturnType<typeof mobileSummary> | null;
    let renderStatus: number | null = null, shotBuf: Buffer | null = null;
    try {
      if (!robotsAllows(await robotsFor(url), new URL(url).pathname)) throw new Error("robots.txt disallows this path; not fetched");
      rawRes = await rawFetch(url);
      if (rawRes.status !== 200) throw new Error(`HTTP ${rawRes.status}`);
      const mk = async (viewport: { width: number; height: number }, mobileMode: boolean) => {
        const ctx = await browser.newContext({ userAgent: CRAWLER_UA, viewport, isMobile: mobileMode, deviceScaleFactor: mobileMode ? 2 : 1, javaScriptEnabled: true, serviceWorkers: "block" });
        await ctx.route("**/*", (route) => {
          const rq = route.request();
          if (!isAllowedUrl(rq.url())) return route.abort();            // our own hosts only
          if (rq.method() !== "GET") return route.abort();               // GET only
          if (!shots && ["image", "media", "font"].includes(rq.resourceType())) return route.abort();
          return route.continue();
        });
        return ctx;
      };
      const read = async (viewport: { width: number; height: number }, mobileMode: boolean, shot: boolean) => {
        const ctx = await mk(viewport, mobileMode); const page = await ctx.newPage();
        try {
          await pace();
          const resp = await page.goto(rawRes!.finalUrl, { waitUntil: "networkidle", timeout: 45000 });
          const st = resp?.status() ?? null;
          if (st !== null && isAccessRestriction(st)) throw new Stop(`HTTP ${st} on ${rawRes!.finalUrl} (rendered)`);
          await page.waitForTimeout(800);
          const ex = (await page.evaluate(`(${EXTRACT_JS})(${JSON.stringify({ base: rawRes!.finalUrl })})`)) as DocExtract;
          const buf = shot ? await page.screenshot({ fullPage: true }) : null;
          return { st, ex, buf };
        } finally { await ctx.close(); }
      };
      const d = await read({ width: 1366, height: 900 }, false, shots);
      rendered = d.ex; renderStatus = d.st; shotBuf = d.buf;
      const m = await read({ width: 390, height: 844 }, true, false);
      mobile = mobileSummary(m.st, m.ex, d.ex);
      // Raw HTML parsed inertly in a blank page: no scripts run, no requests are made.
      const blank = await (await browser.newContext({ userAgent: CRAWLER_UA, javaScriptEnabled: true })).newPage();
      raw = (await blank.evaluate(`(${EXTRACT_JS})(${JSON.stringify({ html: rawRes.html, base: rawRes.finalUrl })})`)) as DocExtract;
      await blank.context().close();
    } catch (e) {
      if (e instanceof Stop) { failure = `STOPPED: access restriction. ${e.message}`; exitCode = 2; } else failure = (e as Error).message;
    }
    const read = buildPageRead({
      requestedUrl: url, finalUrl: rawRes?.finalUrl ?? null, redirectChain: rawRes?.chain ?? [], status: rawRes?.status ?? null, fetchedAt, userAgent: CRAWLER_UA,
      raw, rendered, mobile, xRobotsTag: rawRes?.xRobotsTag ?? null, knownRedirected, failure,
    });
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/crawl.json`, JSON.stringify(read, null, 2), { flag: "wx" });
    if (read.markdown) writeFileSync(`${dir}/page.md`, read.markdown, { flag: "wx" });
    if (rawRes?.html) writeFileSync(`${dir}/raw.html`, rawRes.html, { flag: "wx" });
    if (shotBuf) writeFileSync(`${dir}/desktop.png`, shotBuf, { flag: "wx" });
    console.log(`${read.ok ? "OK  " : "FAIL"} ${url} -> ${read.finalUrl ?? "-"} status ${read.status ?? "-"} (rendered ${renderStatus ?? "-"}), ${read.words} words, ${read.claims.length} claim flags${read.failure ? `; ${read.failure}` : ""}`);
    if (exitCode) break;
  }
} finally { await browser.close(); }
console.log(`${requests} requests made (1 per ${MIN_GAP_MS / 1000}s, own hosts only). Output: ${outDir}`);
process.exit(exitCode);
