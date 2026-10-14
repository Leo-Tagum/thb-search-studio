/* eslint-disable @typescript-eslint/no-explicit-any -- agent outputs are validated by zod at the boundary */
// Phase 3e build step 3: the image planner agents' registration, output envelope and submit checks, and V1's "image text check" result shape.
// Agent 8 (hybrid, thb-08-image-planner) and D1 (team, thb-d1-image-planner) share ONE rules body and ONE output schema. Neither can write text, lock,
// approve or set a state: the strict schema has no field for it (image-cards.ts). The image plan is dry-run only until the board and the pull step exist.
import { z } from "zod";
import { VERIFICATION_LABELS, READER_IMPACTS } from "./legal-claims";
import { imagePlanFindings, imagePlanResult, legalOverlayLines, type ImageCtx, type ImagePlanResult } from "./image-cards";

export const IMAGE_AGENT_KEYS = ["thb-08-image-planner", "thb-d1-image-planner"] as const;
export type ImageAgentKey = (typeof IMAGE_AGENT_KEYS)[number];
export const isImageAgent = (k: string): k is ImageAgentKey => (IMAGE_AGENT_KEYS as readonly string[]).includes(k);
export const IMAGE_AGENT_META: Record<ImageAgentKey, { n: 8 | null; name: string; promptVersion: string; decisions: readonly string[] }> = {
  "thb-08-image-planner": { n: 8, name: "Image Planner", promptVersion: "1.5.0", decisions: ["PASS", "BLOCKED"] },
  "thb-d1-image-planner": { n: null, name: "Design, Image Planner", promptVersion: "1.5.0", decisions: ["PASS", "BLOCKED"] },
};

const finding = z.strictObject({ issue_key: z.string().regex(/^[a-z0-9_:.-]{3,80}$/i), severity: z.enum(["required", "optional"]), note: z.string().min(5) });
const envelope = {
  article_id: z.string().min(1), opportunity_id: z.string().min(1), agent_name: z.string(), agent_prompt_version: z.string(), model_version: z.string(),
  input_version_ids: z.array(z.string()), decision: z.enum(["PASS", "BLOCKED"]), findings: z.array(finding), evidence_ids: z.array(z.string()), required_actions: z.array(z.string()),
  output_version_id: z.string(), timestamp: z.iso.datetime(),
};
/** The planner's whole output: the usual envelope plus `result.cards[]` and `result.skipped_units[]`. Strict: unknown keys (`approved`, `locked`, `unit`, `state`...) are refused. */
export const imagePlanOutput = z.strictObject({ ...envelope, result: imagePlanResult });

export type ImagePlanSubmitCtx = ImageCtx & { agent: ImageAgentKey; opportunityId: string; articleId: string; textVersionHash: string };
/** Everything the submit step checks on a planner output: the envelope, then the card checks of image-cards.ts. A BLOCKED output carries no cards. */
export function imagePlanSubmitErrors(out: unknown, ctx: ImagePlanSubmitCtx): string[] {
  const p = imagePlanOutput.safeParse(out);
  if (!p.success) return p.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  const o = p.data; const meta = IMAGE_AGENT_META[ctx.agent]; const errs: string[] = [];
  if (!meta.decisions.includes(o.decision)) errs.push(`decision ${o.decision} is not allowed; allowed: ${meta.decisions.join("/")}`);
  if (o.agent_prompt_version !== meta.promptVersion) errs.push(`agent_prompt_version must be ${meta.promptVersion}`);
  if (o.opportunity_id !== ctx.opportunityId) errs.push("opportunity_id does not match the task packet");
  if (o.article_id !== ctx.articleId) errs.push("article_id does not match the task packet");
  if (!/^claude-code\//.test(o.model_version)) errs.push('model_version must be "claude-code/<model id>"');
  if (!o.input_version_ids.includes(ctx.textVersionHash)) errs.push("input_version_ids must include the locked text version hash the plan is for");
  if (o.decision === "BLOCKED" && o.result.cards.length) errs.push("a BLOCKED plan carries no cards");
  if (o.decision === "BLOCKED" && !o.findings.some((f) => f.severity === "required")) errs.push("a BLOCKED plan names the reason as a required finding");
  if (o.decision === "PASS") errs.push(...imagePlanFindings(o.result as ImagePlanResult, ctx).map((f) => `${f.code}: ${f.detail}`));
  return errs;
}

// ---------- V1's "image text check" (prompt 1.5.0): its own result shape, not a flag on the unit review ----------
const cardCheck = z.strictObject({
  card_id: z.string().regex(/^img:\d{1,2}$/),
  overlay_matches_locked_text: z.boolean(),         // every text_overlay line is word for word in the named locked block
  prompt_ok: z.boolean(),                           // the generation prompt and avoid list state no fact the article does not state and ask for no words
  quote_comparison: z.enum(VERIFICATION_LABELS).optional(),     // required when an overlay line is a legal point
  reader_impact: z.enum(READER_IMPACTS).optional(),
  note: z.string().trim().min(5).max(600),
});
export const v1ImageCheckResult = z.strictObject({
  plan_text_hash: z.string(),
  card_checks: z.array(cardCheck).max(12),
  cards: z.array(z.strictObject({ issue_key: z.string(), severity: z.enum(["required", "optional"]), note: z.string() })).max(20).default([]),
  leo_reference_needed: z.array(z.strictObject({ claim: z.string().nullable(), section: z.string().nullable(), why: z.string().trim().min(10).max(600) })).max(5).default([]),
});
export const v1ImageCheckOutput = z.strictObject({ ...envelope, prompt_receipt: z.string().optional(), decision: z.enum(["PASS", "REVISION", "BLOCKED"]), result: v1ImageCheckResult });

/**
 * The code refuses a V1 PASS when: a card has no check; an overlay line or prompt was found wrong; or a card with a legal overlay line has no quote comparison,
 * or the label is not MATCH (NARROWER only with a reader impact of "none"). The plan is the one that passed the card checks.
 */
export function v1ImageCheckErrors(out: any, plan: ImagePlanResult, textHash?: string): string[] {
  const errs: string[] = [];
  const checks = new Map<string, any>((out?.result?.card_checks ?? []).map((c: any) => [c.card_id, c]));
  if (out?.decision === "PASS") for (const c of plan.cards) {
    const k = checks.get(c.card_id);
    if (!k) { errs.push(`${c.card_id}: V1 PASS needs a card_check for every card`); continue; }
    if (!k.overlay_matches_locked_text) errs.push(`${c.card_id}: V1 found the overlay text is not the locked text; this cannot be a PASS`);
    if (!k.prompt_ok) errs.push(`${c.card_id}: V1 found the prompt or avoid list wrong; this cannot be a PASS`);
    if (legalOverlayLines(c).length) {
      if (!k.quote_comparison) errs.push(`${c.card_id}: a legal overlay line needs V1's quote_comparison against the stored official quote`);
      else if (k.quote_comparison !== "MATCH" && !(k.quote_comparison === "NARROWER" && k.reader_impact === "none")) errs.push(`${c.card_id}: quote_comparison ${k.quote_comparison}; a legal overlay line passes only as MATCH (or NARROWER with no reader impact)`);
    }
  }
  if (textHash && out?.result?.plan_text_hash !== textHash) errs.push("plan_text_hash must be the locked text version hash the plan is for");
  for (const id of checks.keys()) if (!plan.cards.some((c) => c.card_id === id)) errs.push(`${id}: V1 checked a card that is not in the plan`);
  return errs;
}
