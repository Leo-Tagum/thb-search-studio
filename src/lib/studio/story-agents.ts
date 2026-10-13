// Stage 6 part B: V1's "story check" (prompt 1.7.0): its own result shape, like the image text check, not a flag on the unit review. V1 reads a story card and its draft independently of
// the deterministic checks (story-cards.ts); the code refuses a V1 PASS where those checks found something. V1 never writes or changes a story and never sets a gate (SR-20).
import { z } from "zod";
import { type StoryFinding, type StoryVerdict, storyVerdict } from "./story-cards";

const finding = z.strictObject({ issue_key: z.string().regex(/^[a-z0-9_:.-]{3,80}$/i), severity: z.enum(["required", "optional"]), note: z.string().min(5) });
const storyCheck = z.strictObject({
  story_id: z.string().min(3),
  verdict: z.enum(["PASS", "BLOCKED", "HELD_FOR_JUAN", "REFUSED"]),
  rules_broken: z.array(z.strictObject({ rule: z.enum(["SR-3", "SR-7", "SR-18", "SR-19", "SR-20"]), what: z.string().trim().min(5).max(300) })).max(20),
  note: z.string().trim().min(5).max(600),
});
export const v1StoryCheckResult = z.strictObject({ story_checks: z.array(storyCheck).min(1).max(12) });
export const v1StoryCheckOutput = z.strictObject({
  article_id: z.string().min(1), opportunity_id: z.string().min(1), agent_name: z.string(), agent_prompt_version: z.string(), model_version: z.string(),
  input_version_ids: z.array(z.string()), decision: z.enum(["PASS", "REVISION", "BLOCKED"]), findings: z.array(finding), evidence_ids: z.array(z.string()), required_actions: z.array(z.string()),
  output_version_id: z.string(), timestamp: z.iso.datetime(), result: v1StoryCheckResult,
});
export type V1StoryCheckOutput = z.infer<typeof v1StoryCheckOutput>;

/**
 * The code refuses: a decision that disagrees with the verdicts (PASS only if every story passes); a story with no check, or a check of an unknown story; and a V1 PASS for a story
 * where the deterministic checks found something (V1 may be stricter than the code, never looser).
 */
export function v1StoryCheckErrors(out: V1StoryCheckOutput, expected: Map<string, StoryFinding[]>, version: string): string[] {
  const errs: string[] = [];
  if (out.agent_prompt_version !== version) errs.push(`agent_prompt_version must be ${version}`);
  const checks = new Map(out.result.story_checks.map((c) => [c.story_id, c]));
  for (const [id, findings] of expected) {
    const c = checks.get(id);
    if (!c) { errs.push(`${id}: V1 must check every story in the packet`); continue; }
    const code: StoryVerdict = storyVerdict(findings);
    if (c.verdict === "PASS" && code !== "PASS") errs.push(`${id}: V1 says PASS but the code checks found ${[...new Set(findings.map((f) => f.code))].join(", ")}; V1 cannot pass a story the checks refuse`);
    if (c.verdict !== "PASS" && !c.rules_broken.length) errs.push(`${id}: a verdict other than PASS names the rule broken`);
  }
  for (const id of checks.keys()) if (!expected.has(id)) errs.push(`${id}: V1 checked a story that is not in the packet`);
  const allPass = out.result.story_checks.every((c) => c.verdict === "PASS");
  if (out.decision === "PASS" && !allPass) errs.push("decision PASS needs every story to PASS");
  if (out.decision !== "PASS" && allPass) errs.push(`decision ${out.decision} but every story passes`);
  return errs;
}
