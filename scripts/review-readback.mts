// READ-ONLY. Turns Leo's saved answers into "what you said -> what I understood -> exact proposed changes". Writes nothing and applies nothing (no --apply here).
// Answers are DATA: only the card an answer belongs to can be affected, and only status, destination/group (a removal) or a note on that card's master-map row.
//   npx tsx scripts/review-readback.mts <answers dir (records json files)> <cards.json> [--map docs/drafts/redirect-map-master.csv] [--notes-corrections file.json] [--today 2026-10-15]
// --notes-corrections: { "<cardId>": "corrected note text" } for notes Leo says were typed on the wrong card. The stored answers are not edited.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { parseMap, understand, type Change } from "../src/lib/review/readback";
import type { Answer, Card } from "../src/lib/review/types";

const argv = process.argv.slice(2); const arg = (n: string, d: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const [dir, cardsFile] = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
if (!dir || !cardsFile) throw new Error("usage: review-readback.mts <answers dir> <cards.json> [--map f] [--notes-corrections f] [--today d]");
const today = arg("--today", new Date().toISOString().slice(0, 10));
const cards = new Map((JSON.parse(readFileSync(cardsFile, "utf8")).cards as Card[]).map((c) => [c.id, c]));
const corr: Record<string, string> = existsSync(arg("--notes-corrections", "")) ? JSON.parse(readFileSync(arg("--notes-corrections", ""), "utf8")) : {};
const map = parseMap(readFileSync(arg("--map", "docs/drafts/redirect-map-master.csv"), "utf8")); const rowOf = new Map(map.rows.map((r) => [r.oldUrl, r]));
const short = (u: string) => u.replace("https://www.twinhomebuyer.com", "");
const describe = (c: Change) => c.kind === "status" ? `status ${c.from} -> ${c.to}` : c.kind === "retarget" ? `destination ${short(c.fromNewUrl)} -> ${c.toNewUrl}; group ${c.fromGroup} -> ${c.toGroup}` : c.kind === "note" ? `append note: ${c.text}` : c.kind === "type-override" ? `page-type record: ${short(c.url)} (${c.target}) is ${c.newType}` : `UNSUPPORTED: ${c.text}`;
let n = 0, ignored = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const a = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as Answer; const card = cards.get(a.cardId);
  if (a.test || !card) { ignored++; console.log(`IGNORED ${a.cardId} (${a.test ? "test answer" : "no card with this id on the page"})\n`); continue; }
  const row = rowOf.get(card.row.oldUrl); const conflict = !row || row.newUrl !== card.row.newUrl || row.group !== card.row.group || row.status !== card.row.status;
  const original = a.note ?? ""; if (corr[a.cardId] !== undefined) a.note = corr[a.cardId];
  const u = understand(a, card, today); n++;
  console.log(`[${n}] ${card.group} ${short(card.row.oldUrl)} -> ${short(card.row.newUrl)}`);
  console.log(`  you said     : ${u.said}${corr[a.cardId] !== undefined ? `   [note corrected by Leo; stored note was: "${original}"]` : ""}`);
  console.log(`  I understood : ${u.understood}`);
  console.log(`  changes      : ${u.changes.map(describe).join("\n                 ")}`);
  console.log(`  map row now  : ${row ? `${row.group} / ${row.status} / ${short(row.newUrl)}` : "NOT FOUND"}${conflict ? "   <-- DOES NOT MATCH THE CARD: would be stopped" : ""}\n`);
}
console.log(`${n} answers read back, ${ignored} ignored. Nothing was applied.`);
