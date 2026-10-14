import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeReceipt, promptReceiptErrors, receiptInFile, RECEIPT_INSTRUCTION } from "./prompt-receipt";
import { buildTeamPacket, teamSemanticChecks } from "../team/bridge";
import { V1_PROMPT_VERSION } from "../studio/agents";

// Leo, 2026-10-14: every V1 run must load its prompt file, and its output must prove it and confirm the prompt version.
const FILE = "thb-v1-fact-privacy";
const fileText = readFileSync(`.claude/agents/${FILE}.md`, "utf8").replace(/\r\n/g, "\n");
const receipt = receiptInFile(fileText)!;

describe("the receipt of the V1 prompt file", () => {
  it("is present and current: a V1 prompt edit without a new receipt fails here (run npx tsx scripts/prompt-receipts.mts)", () => {
    expect(receipt).toMatch(/^[0-9a-f]{12}$/);
    expect(computeReceipt(fileText)).toBe(receipt);
  });
  it("changes when any text of the file changes, and not when only the receipt line changes", () => {
    expect(computeReceipt(fileText.replace("## Rules", "## Rules "))).not.toBe(receipt);
    expect(computeReceipt(fileText.replace(/^prompt_receipt: [0-9a-f]{12}$/m, "prompt_receipt: 000000000000"))).toBe(receipt);
    expect(computeReceipt(fileText.replace(/\n/g, "\r\n"))).toBe(receipt);              // line endings do not matter
  });
  it("the prompt tells V1 to copy it, and the packet tells V1 the same", () => {
    expect(fileText).toContain("Prompt receipt (added at prompt_version 1.10.0");
    expect(fileText).toContain('"prompt_receipt": "<the value of the prompt_receipt line of this file>"');
    const p = buildTeamPacket("V1", { articleId: "a", opportunityId: "o", unitKey: "s1", versionHash: "h" }, {});
    expect(p.prompt_receipt_required).toBe(true);
    expect(p.instructions).toContain(RECEIPT_INSTRUCTION(FILE));
    expect(buildTeamPacket("V2", { articleId: "a", opportunityId: "o", unitKey: "s1", versionHash: "h" }, {}).prompt_receipt_required).toBeUndefined();
  });
});

describe("an output is refused unless it carries the receipt of the current file and the required version", () => {
  const ok = { prompt_receipt: receipt, agent_prompt_version: V1_PROMPT_VERSION };
  it("accepts the right receipt and version", () => expect(promptReceiptErrors(ok, FILE, V1_PROMPT_VERSION)).toEqual([]));
  it("refuses a missing receipt (the run did not read the file), a wrong one, and an older version", () => {
    expect(promptReceiptErrors({ agent_prompt_version: V1_PROMPT_VERSION }, FILE, V1_PROMPT_VERSION).join()).toContain("prompt_receipt is missing");
    expect(promptReceiptErrors({ ...ok, prompt_receipt: "" }, FILE, V1_PROMPT_VERSION).join()).toContain("missing");
    expect(promptReceiptErrors({ ...ok, prompt_receipt: "abcdef012345" }, FILE, V1_PROMPT_VERSION).join()).toContain("does not match the current");
    expect(promptReceiptErrors({ ...ok, agent_prompt_version: "1.9.0" }, FILE, V1_PROMPT_VERSION).join()).toContain("agent_prompt_version must be");
  });
  it("refuses everything if the file's own receipt is stale or missing (the prompt changed without a new receipt)", () => {
    expect(promptReceiptErrors(ok, FILE, V1_PROMPT_VERSION, () => fileText.replace("## Rules", "## Rules "))[0]).toContain("stale");
    expect(promptReceiptErrors(ok, FILE, V1_PROMPT_VERSION, () => fileText.replace(/^prompt_receipt: .*\n\n?/m, ""))[0]).toContain("no prompt_receipt line");
    expect(promptReceiptErrors(ok, FILE, V1_PROMPT_VERSION, () => { throw new Error("nope"); })[0]).toContain("cannot be read");
  });
});

describe("the team and classic V1 validators enforce it when the packet asks (every queued V1 packet does)", () => {
  const out = (over: Record<string, unknown> = {}) => ({ article_id: "a", opportunity_id: "o", agent_name: "V1", agent_prompt_version: V1_PROMPT_VERSION, model_version: "claude-code/test", input_version_ids: ["h"], decision: "PASS", findings: [], evidence_ids: [], required_actions: [], output_version_id: "v", timestamp: "2026-10-14T12:00:00Z", result: { plan_text_hash: "h", card_checks: [], cards: [], leo_reference_needed: [] }, ...over });
  const packet = (flag: boolean) => ({ ...buildTeamPacket("V1", { articleId: "a", opportunityId: "o", unitKey: null, versionHash: "h" }, {}), prompt_receipt_required: flag });
  const run = (o: object, flag: boolean) => teamSemanticChecks("V1", o, { packet: packet(flag), image: { plan: { cards: [], skipped_units: [] }, textHash: "h" } });
  it("refuses a V1 output with no receipt, with a wrong one and with an older version", async () => {
    expect((await run(out(), true)).join()).toContain("prompt_receipt is missing");
    expect((await run(out({ prompt_receipt: "abcdef012345" }), true)).join()).toContain("does not match the current");
    expect((await run(out({ prompt_receipt: receipt, agent_prompt_version: "1.9.0" }), true)).join()).toContain("agent_prompt_version");
  });
  it("accepts the receipt, and does not require it from a packet that does not ask (older fixtures)", async () => {
    expect((await run(out({ prompt_receipt: receipt }), true)).join()).not.toContain("prompt_receipt");
    expect((await run(out(), false)).join()).not.toContain("prompt_receipt");
  });
});
