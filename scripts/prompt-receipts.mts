// Writes (or checks) the `prompt_receipt:` line of every prompt file that carries one (today: V1). Run after editing such a file:  npx tsx scripts/prompt-receipts.mts   (add --check to only verify)
import { readFileSync, writeFileSync } from "node:fs";
import { computeReceipt, promptFilePath, receiptInFile } from "../src/lib/agents/prompt-receipt";

const FILES = ["thb-v1-fact-privacy"];
const checkOnly = process.argv.includes("--check");
let stale = 0;
for (const f of FILES) {
  const p = promptFilePath(f); const text = readFileSync(p, "utf8"); const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const lf = text.replace(/\r\n/g, "\n"); const now = computeReceipt(text); const had = receiptInFile(text);
  if (had === now) { console.log(`${f}: receipt ${now} is current`); continue; }
  if (checkOnly) { console.log(`${f}: STALE (file says ${had ?? "none"}, text hashes to ${now})`); stale++; continue; }
  const without = lf.replace(/^prompt_receipt: [0-9a-f]{12}\n\n?/m, "");
  const withLine = without.replace(/^(prompt_version: .*\n\n)/m, `$1prompt_receipt: ${now}\n\n`);
  if (withLine === without) throw new Error(`${f}: no prompt_version line to put the receipt after`);
  // the receipt is computed over the text WITHOUT its own line, so writing the line does not change it
  if (computeReceipt(withLine) !== now) throw new Error("receipt is not stable");
  writeFileSync(p, withLine.replace(/\n/g, nl)); console.log(`${f}: wrote receipt ${now}`);
}
if (stale) process.exitCode = 1;
