/* eslint-disable @typescript-eslint/no-explicit-any */
// Stage 6 part B calibration: the FAKE story fixtures through the real V1 (story check, prompt 1.7.0). No database, no real data, nothing saved except files in <dir>.
//   npx tsx scripts/story-calibration.mts prepare <dir>   writes one v1-<id>-packet.json per calibration story (each story is its own V1 run, like a real gate)
//        -> the operator dispatches thb-v1-fact-privacy once per packet (output <dir>/v1-<id>-out.json)
//   npx tsx scripts/story-calibration.mts verify <dir>    validates every output with the production checks and compares V1's verdict with the code's and with what the rules call for
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { wrapUntrusted } from "../src/lib/agents/bridge";
import { V1_PROMPT_VERSION } from "../src/lib/studio/agents";
import { v1StoryCheckErrors, v1StoryCheckOutput } from "../src/lib/studio/story-agents";
import { storyFindings, storyVerdict, APPROVED_PROCESS_WORDING } from "../src/lib/studio/story-cards";
import { STORY_FIXTURES } from "../src/lib/studio/story-fixtures";

const [cmd, dir] = process.argv.slice(2);
if (!cmd || !dir) throw new Error("usage: story-calibration.mts <prepare|verify> <dir>");
mkdirSync(dir, { recursive: true });
const picked = STORY_FIXTURES.filter((f) => f.inV1Calibration);

if (cmd === "prepare") {
  for (const f of picked) {
    const data = { stories: [{ story_id: f.card.story_id, story_card: f.card, draft_text: f.text }], approved_process_wording: f.approvedProcess ?? APPROVED_PROCESS_WORDING, note: "FAKE: every name, place, number and record in this packet is made up for a calibration. No real seller or deal data." };
    const packet = { run_id: `story-${f.id}`, attempts_used: 0, last_error: null, agent_key: "thb-v1-fact-privacy", prompt_version: V1_PROMPT_VERSION, mode: "STORY_CHECK", article_id: "fake-article", opportunity_id: "fake-opportunity", input_version_ids: [f.card.story_id], instructions: "This is a STORY check (see 'Story check' in your prompt): check the story in the data block against SR-18 to SR-20 (and SR-3, SR-7). Write ONE JSON output whose result has story_checks. Use article_id and opportunity_id from this packet; input_version_ids must contain the story_id.", untrusted_data_block: wrapUntrusted(data) };
    writeFileSync(join(dir, `v1-${f.id}-packet.json`), JSON.stringify(packet, null, 2));
  }
  console.log(`prepared ${picked.length} packets: ${picked.map((f) => f.id).join(", ")}`);
} else if (cmd === "verify") {
  const lines: string[] = []; let agree = 0, codeAgree = 0, refused = 0, missing = 0;
  for (const f of picked) {
    const file = join(dir, `v1-${f.id}-out.json`);
    if (!existsSync(file)) { lines.push(`${f.id}  NO OUTPUT`); missing++; continue; }
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const p = v1StoryCheckOutput.safeParse(raw);
    const findings = storyFindings(f.card, f.text, { approvedProcess: f.approvedProcess });
    const codeV = storyVerdict(findings);
    if (!p.success) { lines.push(`${f.id}  SCHEMA REFUSED: ${p.error.issues.slice(0, 2).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`); refused++; continue; }
    // The first run's packets named the story by the fixture id, the second by the card id: with ONE story per run the id is not what is being calibrated, so it is normalized to the card id here.
    const data = { ...p.data, result: { story_checks: p.data.result.story_checks.map((c) => ({ ...c, story_id: f.card.story_id })) } };
    const errs = v1StoryCheckErrors(data, new Map([[f.card.story_id, findings]]), V1_PROMPT_VERSION);
    const v1v = p.data.result.story_checks[0]?.verdict;
    const same = v1v === f.expect; if (same) agree++; if (codeV === f.expect) codeAgree++; if (errs.length) refused++;
    const rules = p.data.result.story_checks[0]?.rules_broken.map((r) => `${r.rule} ${r.what.slice(0, 50)}`).join(" | ") ?? "";
    lines.push(`${f.id}  expected ${f.expect.padEnd(13)} code ${codeV.padEnd(13)} V1 ${String(v1v).padEnd(13)} ${same ? "AGREE " : "DIFFER"}${errs.length ? `  PRODUCTION CHECK REFUSED: ${errs.join("; ").slice(0, 140)}` : ""}\n      ${f.label}${rules ? `\n      V1 rules: ${rules}` : ""}`);
  }
  const total = picked.length;
  lines.push(`\nV1 agrees with the expected verdict on ${agree} of ${total}; the code checks agree on ${codeAgree} of ${total}; outputs refused by the production checks: ${refused}; missing: ${missing}`);
  console.log(lines.join("\n")); writeFileSync(join(dir, "report.txt"), lines.join("\n"));
} else throw new Error(`unknown command ${cmd}`);
