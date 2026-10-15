// READ-ONLY page crawler for merge review. GET requests only: no clicks, logins, form submissions or content changes.
// Only twinhomebuyer.com and www.twinhomebuyer.com, https only. Honours robots.txt. One request every 3 seconds. Stops the whole run on 403, 429 or 5xx.
// Uses the locally installed Chrome in an isolated headless instance (temporary profile, never your own Chrome profile or windows). No browser download.
// For each URL it makes 3 requests: the raw HTML, the page rendered at desktop size, and the page rendered at a mobile size.
//   npx tsx scripts/crawl-pages.mts <url> [<url> ...] [--out docs/drafts/crawls] [--shots] [--known-redirected <file.csv>]
// Writes <out>/<slug>/crawl.json, page.md, raw.html (and desktop.png with --shots). Refuses to overwrite an existing crawl folder.
// --evidence (review loop): also measures the top of the page, paints privacy redactions into the rendered copy (testimonial names, street names, emails, personal phones, address-like
// image names) and saves four small JPEGs per page (desktop and mobile, top and capped full page) under <slug>/shots/ with neutral names, plus evidence.json (what was redacted,
// what remains visible, and a network summary that proves the restrictions: own hosts only, GET only, the gap between page loads, user agent). Nothing is clicked or submitted.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { EXTRACT_JS } from "../src/lib/crawl/extract-in-page";
import { buildPageRead, mobileSummary } from "../src/lib/crawl/analyze";
import { CRAWLER_UA, MIN_GAP_MS, isAccessRestriction, isAllowedUrl, parseRobots, robotsAllows, type RobotsRules } from "../src/lib/crawl/robots";
import { slugOf } from "../src/lib/crawl/text";
import { measureFeatures, redact, scrollThrough, shoot, type RedactReport, type ShotMeta } from "../src/lib/crawl/evidence";
import { scanFilename } from "../src/lib/crawl/privacy";
import type { DocExtract } from "../src/lib/crawl/types";

const argv = process.argv.slice(2);
const opt = (n: string) => { const i = argv.indexOf(`--${n}`); return i > -1 ? argv[i + 1] : undefined; };
const shots = argv.includes("--shots"); const evidence = argv.includes("--evidence");
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

let last = 0, requests = 0; const paceTimes: number[] = [];
const pace = async () => { const wait = last + MIN_GAP_MS - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); last = Date.now(); requests++; paceTimes.push(last); };
/** Network accounting for the page reads: proof that the restrictions held. */
const net = { allowed: 0, blockedOffHost: 0, blockedNonGet: 0, hosts: new Set<string>(), offHosts: new Set<string>(), methods: new Set<string>() };
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
    type Cap = { features: Record<string, unknown> | null; report: RedactReport; shots: { meta: ShotMeta; buf: Buffer }[] };
    let capD: Cap | null = null, capM: Cap | null = null; const netBefore = { ...net, hosts: new Set(net.hosts) }; const paceStart = paceTimes.length;
    try {
      if (!robotsAllows(await robotsFor(url), new URL(url).pathname)) throw new Error("robots.txt disallows this path; not fetched");
      rawRes = await rawFetch(url);
      if (rawRes.status !== 200) throw new Error(`HTTP ${rawRes.status}`);
      const mk = async (viewport: { width: number; height: number }, mobileMode: boolean) => {
        const ctx = await browser.newContext({ userAgent: CRAWLER_UA, viewport, isMobile: mobileMode, deviceScaleFactor: mobileMode ? 2 : 1, javaScriptEnabled: true, serviceWorkers: "block" });
        await ctx.route("**/*", (route) => {
          const rq = route.request();
          if (!isAllowedUrl(rq.url())) { net.blockedOffHost++; try { net.offHosts.add(new URL(rq.url()).hostname); } catch { /* ignore */ } return route.abort(); }   // our own hosts only
          if (rq.method() !== "GET") { net.blockedNonGet++; return route.abort(); }                                                                                   // GET only
          if (!(shots || evidence) && ["image", "media", "font"].includes(rq.resourceType())) return route.abort();
          net.allowed++; net.methods.add(rq.method()); net.hosts.add(new URL(rq.url()).hostname);
          return route.continue();
        });
        return ctx;
      };
      const read = async (viewport: { width: number; height: number }, mobileMode: boolean, shot: boolean, capture: "desktop" | "mobile" | null = null) => {
        const ctx = await mk(viewport, mobileMode); const page = await ctx.newPage();
        try {
          await pace();
          const resp = await page.goto(rawRes!.finalUrl, { waitUntil: "networkidle", timeout: 45000 });
          const st = resp?.status() ?? null;
          if (st !== null && isAccessRestriction(st)) throw new Stop(`HTTP ${st} on ${rawRes!.finalUrl} (rendered)`);
          await page.waitForTimeout(800);
          const ex = (await page.evaluate(`(${EXTRACT_JS})(${JSON.stringify({ base: rawRes!.finalUrl })})`)) as DocExtract;
          const buf = shot ? await page.screenshot({ fullPage: true }) : null;
          let cap: { features: Record<string, unknown> | null; report: RedactReport; shots: { meta: ShotMeta; buf: Buffer }[] } | null = null;
          if (capture) {
            await scrollThrough(page);
            const features = capture === "desktop" ? await measureFeatures(page) : null;   // measured before any redaction is painted
            const report = await redact(page);
            const taken = report.remaining === 0 ? await shoot(browser, page, url, capture, report.rects) : [];   // a page with a match that could not be redacted gets no screenshots
            cap = { features, report, shots: taken };
          }
          return { st, ex, buf, cap };
        } finally { await ctx.close(); }
      };
      const d = await read({ width: 1366, height: 900 }, false, shots, evidence ? "desktop" : null);
      rendered = d.ex; renderStatus = d.st; shotBuf = d.buf; capD = d.cap;
      const m = await read({ width: 390, height: 844 }, true, false, evidence ? "mobile" : null); capM = m.cap;
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
    if (evidence && (capD || capM)) {
      const all = [...(capD?.shots ?? []), ...(capM?.shots ?? [])]; mkdirSync(`${dir}/shots`, { recursive: true });
      for (const s of all) writeFileSync(`${dir}/shots/${s.meta.file}`, s.buf, { flag: "wx" });
      const mine = paceTimes.slice(paceStart); const gaps = mine.slice(1).map((x, i) => x - mine[i]);
      const urlFindings = [...(rendered?.links ?? []).map((l) => l.href), ...(rendered?.images ?? []).map((i) => i.src)].flatMap((u) => { try { return scanFilename(decodeURIComponent(new URL(u).pathname.split("/").pop() ?? "")); } catch { return []; } }).map((x) => x.kind);
      const ev = {
        url, finalUrl: read.finalUrl, capturedAt: new Date().toISOString(), features: capD?.features ?? null,
        redaction: { desktop: capD ? { counts: capD.report.counts, remainingVisibleMatches: capD.report.remaining, rectCount: capD.report.rects.length } : null, mobile: capM ? { counts: capM.report.counts, remainingVisibleMatches: capM.report.remaining, rectCount: capM.report.rects.length } : null },
        skippedForPrivacy: all.length === 0 ? "a seller-identifying match could not be redacted, so no screenshots were saved" : null,
        urlFilenameFindings: { kinds: urlFindings, count: urlFindings.length },
        shots: all.map((s) => s.meta),
        network: { userAgent: CRAWLER_UA, allowedRequests: net.allowed - netBefore.allowed, allowedHosts: [...net.hosts], blockedOffHostRequests: net.blockedOffHost - netBefore.blockedOffHost, offHostsSeen: [...net.offHosts], blockedNonGetRequests: net.blockedNonGet - netBefore.blockedNonGet, methodsUsed: [...net.methods], pageLoadGapsMs: gaps, minGapMs: gaps.length ? Math.min(...gaps) : null, requiredGapMs: MIN_GAP_MS, robotsChecked: Object.keys(robots).length > 0 },
      };
      writeFileSync(`${dir}/evidence.json`, JSON.stringify(ev, null, 2), { flag: "wx" });
    }
    console.log(`${read.ok ? "OK  " : "FAIL"} ${url} -> ${read.finalUrl ?? "-"} status ${read.status ?? "-"} (rendered ${renderStatus ?? "-"}), ${read.words} words, ${read.claims.length} claim flags${read.failure ? `; ${read.failure}` : ""}`);
    if (exitCode) break;
  }
} finally { await browser.close(); }
console.log(`${requests} requests made (1 per ${MIN_GAP_MS / 1000}s, own hosts only). Output: ${outDir}`);
process.exit(exitCode);
