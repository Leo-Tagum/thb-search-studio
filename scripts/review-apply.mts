// Applies Leo's CONFIRMED review answers to the local master map. Dry run unless --apply. Local files only: no WordPress, no redirects, no Search Console.
// Each row is touched only if its id, destination, group and status still match the card; a conflicting row is stopped and left alone. Existing notes are kept. The map is backed up to a NEW
// file first (never overwritten), and every before/after pair is appended to the authoritative log (JSON lines).
//   npx tsx scripts/review-apply.mts <answers dir> <cards.json> --map <master.csv> --log <applied-log.jsonl> --backup <new backup path> [--notes-corrections f] [--today d] [--apply]
import { appendFileSync, copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { applyChanges, understand, type Change } from "../src/lib/review/readback";
import type { Answer, Card } from "../src/lib/review/types";

const argv = process.argv.slice(2); const arg = (n: string, d = "") => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const [dir, cardsFile] = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
const mapPath = arg("--map"), logPath = arg("--log"), backup = arg("--backup"), today = arg("--today", new Date().toISOString().slice(0, 10)); const doApply = argv.includes("--apply");
if (!dir || !cardsFile || !mapPath || !logPath || !backup) throw new Error("usage: review-apply.mts <answers dir> <cards.json> --map f --log f --backup f [--notes-corrections f] [--today d] [--apply]");
const cards = new Map((JSON.parse(readFileSync(cardsFile, "utf8")).cards as Card[]).map((c) => [c.id, c]));
const corr: Record<string, string> = arg("--notes-corrections") && existsSync(arg("--notes-corrections")) ? JSON.parse(readFileSync(arg("--notes-corrections"), "utf8")) : {};
const changes: Change[] = []; const snaps: Record<string, { oldUrl: string; newUrl: string; group: string; status: string }> = {}; const ids: Record<string, string> = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const a = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as Answer; const card = cards.get(a.cardId); if (a.test || !card) continue;
  if (corr[a.cardId] !== undefined) a.note = corr[a.cardId];
  changes.push(...understand(a, card, today).changes); snaps[card.row.oldUrl] = card.row; ids[card.row.oldUrl] = a.cardId;
}
const mapText = readFileSync(mapPath, "utf8"); const r = applyChanges(mapText, changes, snaps);
const short = (u: string) => u.replace("https://www.twinhomebuyer.com", "");
for (const x of r.applied) { const [b, a] = [x.before.split(","), x.after.split(",")]; console.log(`${short(x.oldUrl)}\n  ${x.changes.join("; ")}\n  before: dest=${short(b[1])} group=${b[2]} status=${b[3]}\n  after : dest=${short(a[1])} group=${a[2]} status=${a[3]}`); }
for (const c of r.conflicts) console.log(`STOPPED ${short(c.oldUrl)}: ${c.why}`);
console.log(`${r.applied.length} rows would change, ${r.conflicts.length} stopped.`);
if (!doApply) { console.log("DRY RUN: nothing written."); process.exit(0); }
if (r.conflicts.length) { console.log("Refusing to apply while any row conflicts."); process.exit(1); }
if (existsSync(backup)) throw new Error(`backup ${backup} already exists; not overwriting`);
copyFileSync(mapPath, backup); writeFileSync(mapPath, r.text);
for (const x of r.applied) appendFileSync(logPath, JSON.stringify({ appliedOn: today, reviewedBy: "Leo", cardId: ids[x.oldUrl], oldUrl: x.oldUrl, changes: x.changes, before: x.before, after: x.after, backup }) + "\n");
console.log(`Applied. Backup: ${backup}. Log: ${logPath}.`);
