// READ-ONLY (writes only local files under docs/drafts/review/). Builds the review page HTML from cards.json (+ optional assets.json mapping shot file name -> uploaded asset id).
//   npx tsx scripts/build-review-page.mts <cards.json> [--assets <assets.json>] [--out docs/drafts/review/review-page.html]
// cards.json: { lede, cards: Card[], unflagged: Unflagged[] }. Shots without an asset id show "No screenshot uploaded". Nothing is uploaded or published here.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildPayload, checkPayload, renderPage } from "../src/lib/review/payload";
import type { Card, Unflagged } from "../src/lib/review/types";

const argv = process.argv.slice(2); const arg = (n: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const cardsFile = argv.find((a) => !a.startsWith("--")); if (!cardsFile) throw new Error("usage: build-review-page.mts <cards.json> [--assets f] [--out f]");
const out = arg("--out") ?? "docs/drafts/review/review-page.html";
const src = JSON.parse(readFileSync(cardsFile, "utf8")) as { lede: string; cards: Card[]; unflagged: Unflagged[] };
const assets: Record<string, string> = arg("--assets") && existsSync(arg("--assets")!) ? JSON.parse(readFileSync(arg("--assets")!, "utf8")) : {};
for (const c of src.cards) for (const side of [c.source, c.destination]) for (const s of side?.shots ?? []) if (assets[s.file]) s.assetId = assets[s.file]; else delete s.assetId;
const payload = buildPayload(src.cards, src.unflagged ?? [], src.lede);
const { bytes, problems } = checkPayload(payload);
if (problems.length) { console.error("BLOCKED:\n- " + problems.join("\n- ")); process.exit(1); }
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, renderPage(readFileSync("src/review/template.html", "utf8"), payload));
console.log(`wrote ${out}: ${src.cards.length} cards, payload ${bytes} bytes, ${Object.keys(assets).length} assets mapped`);
