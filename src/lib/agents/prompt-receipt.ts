// Safeguard (Leo, 2026-10-14): every V1 run must LOAD its prompt file, and its output must confirm which prompt it used. One V1 run in the Stage 6 dry run said it had applied the rules
// "from the packet" without opening its prompt file. The file carries a `prompt_receipt:` line, a short fingerprint of the file's own text; the run has to copy that line into its output
// (`prompt_receipt`). A run that did not read the file cannot know it, and the code refuses an output whose receipt (or prompt version) does not match. The receipt changes whenever the
// file's text changes, so a prompt edit without a new receipt (and a new version) fails a test: `npx tsx scripts/prompt-receipts.mts` writes it.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LINE = /^prompt_receipt: ([0-9a-f]{12})\r?$/m;
const norm = (t: string) => t.replace(/\r\n/g, "\n");
/** The fingerprint of a prompt file: sha256 of its text without the receipt line itself (and without the blank line that follows it), first 12 hex characters. */
export function computeReceipt(fileText: string): string {
  const body = norm(fileText).replace(/^prompt_receipt: [0-9a-f]{12}\n\n?/m, "");
  return createHash("sha256").update(body).digest("hex").slice(0, 12);
}
/** The receipt written in the file, or null if there is none. */
export const receiptInFile = (fileText: string): string | null => LINE.exec(norm(fileText))?.[1] ?? null;
export const promptFilePath = (agentFile: string) => join(process.cwd(), ".claude", "agents", `${agentFile}.md`);

/**
 * Errors for a run's output: the receipt must be there and equal the receipt written in the CURRENT prompt file; the file's own receipt must be current (not stale); and the version the
 * run says it used must be the version the code requires.
 */
export function promptReceiptErrors(out: { prompt_receipt?: unknown; agent_prompt_version?: unknown }, agentFile: string, requiredVersion: string, readFile: (p: string) => string = (p) => readFileSync(p, "utf8")): string[] {
  let text: string;
  try { text = readFile(promptFilePath(agentFile)); } catch { return [`internal: the prompt file for ${agentFile} cannot be read, so the prompt receipt cannot be checked`]; }
  const want = receiptInFile(text);
  if (!want) return [`internal: the prompt file ${agentFile}.md has no prompt_receipt line`];
  if (want !== computeReceipt(text)) return [`internal: the prompt_receipt in ${agentFile}.md is stale (the file changed after it was written): run npx tsx scripts/prompt-receipts.mts`];
  const errs: string[] = [];
  if (typeof out.prompt_receipt !== "string" || !out.prompt_receipt.trim()) errs.push(`prompt_receipt is missing: read .claude/agents/${agentFile}.md first and copy its prompt_receipt line into your output as "prompt_receipt"`);
  else if (out.prompt_receipt.trim() !== want) errs.push(`prompt_receipt ${out.prompt_receipt.trim().slice(0, 16)} does not match the current .claude/agents/${agentFile}.md: you did not load this prompt file (or an older copy)`);
  if (out.agent_prompt_version !== requiredVersion) errs.push(`agent_prompt_version must be ${requiredVersion} (the version of the prompt file you must load)`);
  return errs;
}
/** The sentence every V1 packet carries. */
export const RECEIPT_INSTRUCTION = (agentFile: string) => `FIRST read .claude/agents/${agentFile}.md in full and copy the value of its "prompt_receipt:" line into your output as the field "prompt_receipt"; also state the prompt version you used in "agent_prompt_version". The code refuses an output whose receipt or version does not match the file.`;
