// READ-ONLY merge review: reads stored crawls (scripts/crawl-pages.mts), compares source with destination, adds 12-month Search Console data,
// URL Inspection, protected status and the overlap pairs, and applies the recommendation gates. Proposals only. It writes one report (md + json) and nothing else:
// no WordPress write, no redirect, no delete, no database write, no Search Console change.
//   npx tsx --env-file=.env.local scripts/merge-review.mts --pair "<source url>|<destination url>" [--pair ...] [--ad <url>,<url>] [--crawl-dir docs/drafts/crawls] [--out docs/drafts/merge-review/<name>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";
import { compare, type CompareResult } from "../src/lib/crawl/compare";
import { parseCsv, pathOf } from "../src/lib/protected-import";
import { slugOf } from "../src/lib/crawl/text";
import type { PageRead } from "../src/lib/crawl/types";
import { recommend, type Gsc, type Inspection, type PageEvidence, type Recommendation } from "../src/lib/merge-review/recommend";

const argv = process.argv.slice(2);
const all = (n: string) => argv.flatMap((a, i) => (a === `--${n}` ? [argv[i + 1]] : []));
const pairs = all("pair").flatMap((p) => p.split(",")).map((p) => p.split("|").map((x) => x.trim()) as [string, string]);
const ads = all("ad").flatMap((a) => a.split(",")).map((x) => x.trim()).filter(Boolean);
const crawlDir = all("crawl-dir")[0] ?? "docs/drafts/crawls";
const out = all("out")[0] ?? `docs/drafts/merge-review/merge-review-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
if (!pairs.length && !ads.length) throw new Error("give at least one --pair \"source|destination\" or --ad <url>");
for (const f of [`${out}.md`, `${out}.json`]) if (existsSync(f)) throw new Error(`${f} already exists; not overwriting`);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const site = process.env.GSC_SITE_URL!;
const gsc = await new GoogleAuth({ keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] }).getClient();
const end = new Date(Date.now() - 3 * 864e5), start = new Date(end.getTime() - 364 * 864e5); const ymd = (d: Date) => d.toISOString().slice(0, 10);

const loadCrawl = (url: string): PageRead | null => { const f = `${crawlDir}/${slugOf(url)}/crawl.json`; return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as PageRead) : null; };
async function gscFor(url: string): Promise<Gsc> {
  const q = async (dimensions: string[]) => (await gsc.request<{ rows?: { keys: string[]; clicks: number; impressions: number; position: number }[] }>({
    url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, method: "POST",
    data: { startDate: ymd(start), endDate: ymd(end), dimensions, dataState: "final", rowLimit: 1000, dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "equals", expression: url }] }] },
  })).data.rows ?? [];
  const tot = (await q(["page"]))[0]; const qs = await q(["page", "query"]);
  return { clicks: tot?.clicks ?? 0, impressions: tot?.impressions ?? 0, position: tot?.position ?? null, queries: qs.map((r) => ({ query: r.keys[1], clicks: r.clicks, impressions: r.impressions, position: r.position })) };
}
async function inspect(url: string): Promise<Inspection> {
  try {
    const r = await gsc.request<{ inspectionResult: { indexStatusResult: { verdict: string; coverageState: string; lastCrawlTime?: string; googleCanonical?: string } } }>({ url: "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", method: "POST", data: { inspectionUrl: url, siteUrl: site } });
    const x = r.data.inspectionResult.indexStatusResult; return { coverageState: x.coverageState, lastCrawl: x.lastCrawlTime ?? null, googleCanonical: x.googleCanonical ?? null, verdict: x.verdict };
  } catch { return null; }
}
async function isProtected(url: string): Promise<boolean> {
  const { data } = await db.from("pages").select("protection_status").eq("url", url).maybeSingle();
  return data?.protection_status === "protected";
}
const overlap = (() => {
  const f = "docs/phases/overlap-pairs-2026-10-07-protected-stale.csv"; if (!existsSync(f)) return null;
  const [h, ...rows] = parseCsv(readFileSync(f, "utf8")); const ix = (n: string) => h.indexOf(n); return { h, rows, ix };
})();
function overlapFor(a: string, b: string) {
  if (!overlap) return "overlap pairs file not found";
  const { rows, ix } = overlap; const A = pathOf(a), B = pathOf(b);
  const hit = rows.find((r) => (pathOf(r[ix("a_url")]) === A && pathOf(r[ix("b_url")]) === B) || (pathOf(r[ix("a_url")]) === B && pathOf(r[ix("b_url")]) === A));
  return hit ? `pair #${hit[0]}: ${hit[ix("shared_queries")]} shared queries, supported=${hit[ix("supported")]}, label=${hit[ix("protected_label")] || "none"}; top shared: ${hit[ix("top_shared_queries")]}` : "no overlap pair recorded for these two URLs in the stored import (queries below the 5-impression rule or no shared queries)";
}

const evidence = async (url: string, full = true): Promise<PageEvidence> => ({ url, protected: await isProtected(url), crawl: loadCrawl(url), gsc: full ? await gscFor(url) : null, inspection: full ? await inspect(url) : null });
const reports: { recommendation: Recommendation; compare?: CompareResult; mainQuery?: unknown; overlap?: string; crawlStatus: string[] }[] = [];
const crawlLine = (e: PageEvidence) => `${e.url}: ${e.crawl ? (e.crawl.ok ? `crawl OK (HTTP ${e.crawl.status}, ${e.crawl.words} words, final URL ${e.crawl.finalUrl})` : `crawl FAILED: ${e.crawl.failure}`) : "no crawl on file"}`;

for (const [srcUrl, dstUrl] of pairs) {
  const s = await evidence(srcUrl), d = await evidence(dstUrl);
  let cmp: CompareResult | undefined;
  if (s.crawl?.ok && d.crawl?.ok) cmp = compare(s.crawl, d.crawl);
  const top = [...(s.gsc?.queries ?? [])].sort((a, b) => b.impressions - a.impressions)[0];
  const onDest = top ? d.gsc?.queries.find((q) => q.query === top.query) : undefined;
  const mainQuery = top ? { query: top.query, source: { impressions: top.impressions, position: top.position }, destination: onDest ? { impressions: onDest.impressions, position: onDest.position } : "no ranking recorded" } : "source has no query rows";
  reports.push({ recommendation: recommend({ page: s, destination: d, compare: cmp }), compare: cmp, mainQuery, overlap: overlapFor(srcUrl, dstUrl), crawlStatus: [crawlLine(s), crawlLine(d)] });
  reports.push({ recommendation: recommend({ page: d, isDestination: true }), crawlStatus: [crawlLine(d)] });
}
for (const a of ads) reports.push({ recommendation: recommend({ page: await evidence(a, false) }), crawlStatus: ["not crawled (ad page: protected status only)"] });

const L: string[] = [`# Merge review (proposals only, ${new Date().toISOString().slice(0, 10)})`, "", `12-month Search Console window ${ymd(start)} to ${ymd(end)} (final data). Read-only. Nothing was edited, redirected, deleted or approved. Leads and backlinks: unknown, Leo to fill. Own-site claims below are claims to check, never evidence.`, ""];
for (const r of reports) {
  const x = r.recommendation;
  L.push(`## ${x.url}`, `**Decision: ${x.decision}**${x.destination ? ` → ${x.destination}` : ""}${x.redirectStatus ? ` (redirect ${x.redirectStatus})` : ""}`, `Confidence: ${x.confidence} (${x.confidenceWhy})`, "", "Crawl:", ...r.crawlStatus.map((c) => `- ${c}`), "", "Evidence:", ...x.evidence.map((e) => `- ${e}`));
  if (r.mainQuery) L.push(`- main query (highest source impressions): ${JSON.stringify(r.mainQuery)}`);
  if (r.overlap) L.push(`- overlap pairs: ${r.overlap}`);
  if (x.blockers.length) L.push("", "Blockers:", ...x.blockers.map((b) => `- ${b}`));
  if (x.whatIsLost.length) L.push("", "What a redirect would lose:", ...x.whatIsLost.map((b) => `- ${b}`));
  if (r.compare) {
    const c = r.compare;
    L.push("", "Comparison (source → destination, exact URLs):", `- source ${c.sourceUrl} (final ${c.sourceFinalUrl})`, `- destination ${c.destinationUrl} (final ${c.destinationFinalUrl})`, "", "Source sections:");
    for (const s of c.sections) L.push(`- [${s.status}] "${s.heading}" (${s.words} words, ${s.contentClass}${s.bestMatch ? `, best destination match "${s.bestMatch.heading}" ${s.bestMatch.score}, destination coverage ${s.coverageOnWholeDestination}` : ""})`);
    L.push("", "Destination-only sections:", ...(c.destinationOnlySections.length ? c.destinationOnlySections.map((s) => `- "${s.heading}" (${s.words} words)`) : ["- none"]));
    L.push("", `Tables: ${c.tables.onlyOnSource.length} only on source, ${c.tables.onlyOnDestination.length} only on destination, ${c.tables.matched} matched`, ...c.tables.onlyOnSource.map((t) => `- source-only table: ${t.header.join(" | ")} (${t.rows} rows, ${t.contentClass}; claims: ${[...new Set(t.claims.map((k) => k.id))].join(", ") || "none"})`));
    L.push("", `FAQs: ${c.faqs.onlyOnSource.length} only on source, ${c.faqs.onlyOnDestination.length} only on destination, ${c.faqs.matched} matched`, ...c.faqs.onlyOnSource.map((q) => `- source-only FAQ: ${q}`));
    L.push("", `Headings only on source: ${c.headings.onlyOnSource.join(" / ") || "none"}`, `Headings only on destination: ${c.headings.onlyOnDestination.join(" / ") || "none"}`, `Schema: only on source [${c.schema.onlyOnSource.join(", ")}]; only on destination [${c.schema.onlyOnDestination.join(", ")}]; both [${c.schema.both.join(", ")}]`);
    L.push("", "Unsupported-claim content only on the source (flag, do not transfer):", ...(c.unsupportedOnlyOnSource.length ? c.unsupportedOnlyOnSource.map((u) => `- ${u.kind} "${u.label}": ${u.claims.join(", ")}`) : ["- none"]));
  }
  if (x.unsupportedClaims.length) L.push("", "Claims found on the page (own-site claims, to remove or rewrite):", ...x.unsupportedClaims.map((c) => `- ${c}`));
  L.push("");
}
mkdirSync(out.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
writeFileSync(`${out}.md`, L.join("\n"), { flag: "wx" });
writeFileSync(`${out}.json`, JSON.stringify(reports, null, 2), { flag: "wx" });
for (const r of reports) console.log(`${r.recommendation.decision.padEnd(32)} ${r.recommendation.url}${r.recommendation.destination ? ` -> ${r.recommendation.destination} [${r.recommendation.redirectStatus}]` : ""}`);
console.log(`Report: ${out}.md and .json`);
