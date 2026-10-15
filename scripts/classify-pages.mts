// READ-ONLY (writes only local files under docs/drafts/review/). Reads the approved rows of the master map and an evidence crawl, classifies each page (rules, plus visual-review overrides from
// type-overrides.json), computes the flags, and writes page-types.csv, cards.json and upload-list.txt (the screenshots to upload: flagged cards only, shared destinations once).
//   npx tsx scripts/classify-pages.mts <crawl dir> [--map docs/drafts/redirect-map-master.csv] [--overrides docs/drafts/review/type-overrides.json] [--out docs/drafts/review]
// type-overrides.json: { "<url>": { "type": "...", "confidence": "high|medium|low", "evidence": "what the screenshot shows" } }. Changes no decision and no master-map row.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { citiesIn, guessType, isPageType, shorten, type PageFeatures } from "../src/lib/crawl/page-type";
import { slugOf } from "../src/lib/crawl/text";
import { flagsFor, geographyOf, purposesOf } from "../src/lib/review/flags";
import { parseMap } from "../src/lib/review/readback";
import type { Card, PageInfo, ScreenshotRef, Unflagged } from "../src/lib/review/types";

const argv = process.argv.slice(2); const arg = (n: string, d: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const dir = argv.find((a) => !a.startsWith("--")); if (!dir) throw new Error("usage: classify-pages.mts <crawl dir>");
const out = arg("--out", "docs/drafts/review"); mkdirSync(out, { recursive: true });   // a new --out folder never overwrites an existing review file
const overridesPath = arg("--overrides", "docs/drafts/review/type-overrides.json");
const manifestPath = arg("--manifest", "docs/drafts/merge-package-2026-10-14/publish-manifest.json");
const pendingByUrl: Record<string, string[]> = {};   // approved sections waiting to be published, by destination page
if (existsSync(manifestPath)) for (const pg of (JSON.parse(readFileSync(manifestPath, "utf8")).pages ?? []) as { url: string; sections: { heading: string }[] }[]) pendingByUrl[pg.url] = pg.sections.map((s) => s.heading);
const map = parseMap(readFileSync(arg("--map", "docs/drafts/redirect-map-master.csv"), "utf8"));
const overrides: Record<string, { type: string; confidence: "high" | "medium" | "low"; evidence: string }> = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, "utf8")) : {};
const protectedPaths = new Set(readFileSync("docs/references/protected-pages-2026-10-14.csv", "utf8").split("\n").slice(1).map((l) => l.split(",")[0].trim()).filter(Boolean));
const pathOf = (u: string) => { try { return new URL(u).pathname; } catch { return u; } };
const rows = map.rows.filter((r) => r.status === "APPROVED");

type Ev = { features: Record<string, unknown>; redaction: { desktop?: { remainingVisibleMatches: number }; mobile?: { remainingVisibleMatches: number } }; skippedForPrivacy: string | null; shots: ScreenshotRef[] };
const cache = new Map<string, PageInfo & { shots: ScreenshotRef[] }>();
function info(url: string): (PageInfo & { shots: ScreenshotRef[] }) | null {
  if (cache.has(url)) return cache.get(url)!;
  const base = `${dir}/${slugOf(url)}`; if (!existsSync(`${base}/crawl.json`) || !existsSync(`${base}/evidence.json`)) return null;
  const crawl = JSON.parse(readFileSync(`${base}/crawl.json`, "utf8")); const ev = JSON.parse(readFileSync(`${base}/evidence.json`, "utf8")) as Ev;
  const raw = existsSync(`${base}/raw.html`) ? readFileSync(`${base}/raw.html`, "utf8").slice(0, 60000) : "";
  const wpType: PageInfo["wpType"] = /<body[^>]*\b(single-post|postid-\d+)/i.test(raw) ? "post" : /<body[^>]*\b(page-id-\d+|page-template)/i.test(raw) ? "page" : "unknown";
  const f = ev.features as { h1: string; title: string } & Record<string, never>; const prot = protectedPaths.has(pathOf(url));
  const feat = { ...(ev.features as object), url, wpType, protectedAd: prot, title: f.title, h1: f.h1 } as unknown as PageFeatures;
  const g = guessType(feat); const ov = overrides[url]; const text = `${f.title} ${f.h1}`;
  let visualType = g.type, confidence = g.confidence, evidence = g.evidence, source: PageInfo["source"] = "rules";
  if (ov && isPageType(ov.type)) { visualType = ov.type; confidence = ov.confidence; evidence = [ov.evidence, ...g.evidence.slice(0, 2)]; source = "visual-review"; }
  const changed = [crawl.status !== 200 ? `status ${crawl.status}` : "", crawl.finalUrl.replace(/\/$/, "") !== url.replace(/\/$/, "") ? `redirects to ${crawl.finalUrl}` : ""].filter(Boolean).join("; ") || null;
  const shots = ev.skippedForPrivacy ? [] : ev.shots.map((s) => ({ kind: s.kind, file: s.file, width: s.width, height: s.height, bytes: s.bytes }));
  const p = { url, wpType, visualType, confidence, evidence, purposeText: shorten(f.h1 || f.title || "", 160), pendingHeadings: pendingByUrl[url] ?? [], purposes: purposesOf(text + " " + url), geography: geographyOf(text, url), protected: prot, changedSinceDecision: changed, source, shots } as PageInfo & { shots: ScreenshotRef[] };
  void citiesIn; cache.set(url, p); return p;
}

const cards: Card[] = []; const unflagged: Unflagged[] = []; const missing: string[] = [];
const FORCE_CARD = "https://www.twinhomebuyer.com/sell-my-house-privately-in-bay-area/";
for (const r of rows) {
  const s = info(r.oldUrl); const d = r.newUrl.startsWith("http") ? info(r.newUrl) : null;
  if (!s || (r.newUrl.startsWith("http") && !d)) { missing.push(r.oldUrl); continue; }
  const mg8 = r.group === "MG8";
  const { flags, proposed } = flagsFor({ source: s, destination: d, isMG8Exception: mg8 });
  const exc = mg8 ? (/INTENT-GATE EXCEPTION[^.]*\.[^.]*\./.exec(r.notes)?.[0] ?? "Previously confirmed exception (Leo, 2026-10-14).") : null;
  if (flags.length || r.oldUrl === FORCE_CARD || mg8) cards.push({ id: `r-${slugOf(r.oldUrl).slice(0, 60)}`, group: r.group, row: { oldUrl: r.oldUrl, newUrl: r.newUrl, status: r.status, group: r.group }, existingDecision: d ? `REDIRECT RECOMMENDATION to ${r.newUrl} (approved verbally by Bryan, 2026-10-14)` : "REMOVE RECOMMENDATION (approved verbally by Bryan, 2026-10-14)", confirmedException: exc, source: s, destination: d, flags, proposed });
  else unflagged.push({ oldUrl: r.oldUrl, newUrl: r.newUrl, group: r.group, sourceType: s.visualType, destinationType: d?.visualType ?? null, note: "No new issue detected; existing decision unchanged." });
}
const q = (x: string) => `"${x.replace(/"/g, '""')}"`;
const seen = new Set<string>(); const csv = ["url,visual_type,confidence,wordpress_type,source,protected,geography,evidence"];
for (const p of cache.values()) if (!seen.has(p.url)) { seen.add(p.url); csv.push([p.url, p.visualType, p.confidence, p.wpType, p.source, p.protected, p.geography, q(p.evidence.join("; "))].join(",")); }
writeFileSync(`${out}/page-types.csv`, csv.join("\n") + "\n");
writeFileSync(`${out}/cards.json`, JSON.stringify({ lede: "Each card compares a redirect source with its destination, shows the rule that flagged it, the approved decision and the proposed change, and asks for your answer. Answers save to your own account. Nothing here changes the master map or the live site.", cards, unflagged }, null, 1));
const files = new Map<string, string>(); for (const c of cards) for (const side of [c.source, c.destination]) if (side) for (const s of side.shots) files.set(s.file, `${dir}/${slugOf(side.url)}/shots/${s.file}`);
writeFileSync(`${out}/upload-list.txt`, [...files.values()].join("\n") + "\n");
console.log(`pages classified ${cache.size}; cards ${cards.length}; unflagged ${unflagged.length}; missing crawl ${missing.length}${missing.length ? " (" + missing.join(", ") + ")" : ""}; screenshots to upload ${files.size}`);
for (const c of cards) console.log(`${c.group} ${c.row.oldUrl.replace("https://www.twinhomebuyer.com", "")} [${c.source.visualType}/${c.source.confidence}] -> ${c.destination ? c.destination.visualType + "/" + c.destination.confidence : "REMOVE"} | ${c.flags.map((f) => f.id).join(", ") || "-"}`);
