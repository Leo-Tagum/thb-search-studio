/* eslint-disable @typescript-eslint/no-explicit-any -- agent outputs are validated by zod at the boundary */
// Agents 4-7: strict output schemas (unknown keys such as "approved", "locked" or "next_state" are rejected) plus semantic checks.
// The writer (Agent 4) cannot add claims: the ledger only grows through Agent 2. No output can lock, approve or set a state.
import { z } from "zod";
import { unit, unitClaimIds, type Unit } from "./schema";
import { checkUnit, type CheckCtx } from "./checks";

export const STUDIO_AGENT_KEYS = ["thb-04-section-writer", "thb-05-fact-privacy-auditor", "thb-06-seo-aeo-geo-auditor", "thb-07-editorial-critic"] as const;
export type StudioAgentKey = (typeof STUDIO_AGENT_KEYS)[number];
/** Phase 3d: V1 (the team's fact and privacy reviewer) is the fact gate of the classic loop. It is not a classic Agent 1-7 and keeps its own file and prompt version. */
export const CLASSIC_V1_KEY = "thb-v1-fact-privacy";
export const V1_PROMPT_VERSION = "1.4.0";   // 1.1.0 declines wording; 1.2.0 severity calibration (soften, not_a_claim); 1.2.1 release label of the validated 1.2.0 text (no wording change); 1.3.0 Phase 3e: legal claims, no guessing (quote comparison, reader impact, legal flags, leo_reference_needed) and the standing rules
export const isStudioAgent = (k: string): k is StudioAgentKey => (STUDIO_AGENT_KEYS as readonly string[]).includes(k);

export const STUDIO_AGENT_META: Record<StudioAgentKey, { n: 4 | 5 | 6 | 7; name: string; promptVersion: string; decisions: readonly string[] }> = {
  "thb-04-section-writer": { n: 4, name: "Section Writer", promptVersion: "1.3.0", decisions: ["PASS", "BLOCKED"] },
  "thb-05-fact-privacy-auditor": { n: 5, name: "Fact & Privacy Auditor", promptVersion: "1.2.0", decisions: ["PASS", "REVISION", "BLOCKED"] },
  "thb-06-seo-aeo-geo-auditor": { n: 6, name: "SEO/AEO/GEO Auditor", promptVersion: "1.3.0", decisions: ["PASS", "REVISION"] },
  "thb-07-editorial-critic": { n: 7, name: "Editorial Critic", promptVersion: "1.3.0", decisions: ["PASS", "REVISION"] },
};

const issue = z.strictObject({ issue_key: z.string().regex(/^[a-z0-9_:.-]{3,80}$/i), severity: z.enum(["required", "optional"]), note: z.string().min(5), claim_id: z.string().nullish(), new_evidence: z.string().trim().min(5).max(1000).optional() });  // new_evidence: only to raise again an item the writer already declined  // a null claim_id means "no claim"
const base = {
  article_id: z.string().min(1),
  opportunity_id: z.string().min(1),
  agent_name: z.string(),
  agent_prompt_version: z.string(),
  model_version: z.string(),
  input_version_ids: z.array(z.string()),
  decision: z.enum(["PASS", "REVISION", "BLOCKED"]),
  findings: z.array(issue),
  evidence_ids: z.array(z.string()),
  required_actions: z.array(z.string()),
  output_version_id: z.string(),
  timestamp: z.iso.datetime(),
};

const agent4Result = z.strictObject({
  unit_key: z.string(),
  unit: unit.optional(),                      // absent only when BLOCKED (a gap that cannot be written without inventing a fact)
  addresses: z.array(z.string()),             // issue keys this version answers (targeted revision)
  change_note: z.string().min(5),
  declines: z.array(z.strictObject({ key: z.string().trim().min(1).max(100), reason: z.string().trim().min(10).max(500) })).max(40).default([]),   // optional items the writer chooses not to apply; stored by code
});
const claimCheck = z.strictObject({ claim_id: z.string(), verdict: z.enum(["supported_as_written", "unsupported", "altered", "stale", "wrong_jurisdiction", "overstated"]), note: z.string() });
const agent5Result = z.strictObject({
  unit_key: z.string(), version_hash: z.string(),
  claim_checks: z.array(claimCheck),
  privacy_ok: z.boolean(),
  legal_qualification_ok: z.boolean(),        // legal/tax/title/code language is careful and the article tells the reader to confirm with a professional
  block_kind: z.enum(["BLOCKED_CLAIM", "BLOCKED_PRIVACY"]).optional(),
});
const agent6Result = z.strictObject({
  unit_key: z.string(), version_hash: z.string(),
  checks: z.strictObject({ direct_answer_near_start: z.boolean(), question_h2: z.boolean(), local_modifiers_true_and_useful: z.boolean(), keyword_natural_not_forced: z.boolean(), short_direct_faq: z.boolean(), citation_ready: z.boolean() }),
  tested_http_or_schema: z.literal(false),    // Agent 6 never pretends it tested HTTP, schema or indexation
});
const SCORE_MAX = { voice: 20, education: 20, deal_logic: 20, local: 15, structure: 15, trust: 10 } as const;
const agent7Result = z.strictObject({
  unit_key: z.string(), version_hash: z.string(),
  voice_reference_used: z.boolean(),
  copy_paste_test: z.strictObject({ passed: z.boolean(), flagged: z.array(z.string()) }),
  authenticity: z.strictObject(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`q${i + 1}`, z.boolean()])) as Record<`q${number}`, z.ZodBoolean>),
  score: z.strictObject({ voice: z.number(), education: z.number(), deal_logic: z.number(), local: z.number(), structure: z.number(), trust: z.number(), total: z.number() }),
  revised_unit: unit.optional(),              // a focused replacement; never allowed to change a verified fact without going back to Agent 5
});

export const studioOutputSchemas = {
  "thb-04-section-writer": z.strictObject({ ...base, result: agent4Result }),
  "thb-05-fact-privacy-auditor": z.strictObject({ ...base, result: agent5Result }),
  "thb-06-seo-aeo-geo-auditor": z.strictObject({ ...base, result: agent6Result }),
  "thb-07-editorial-critic": z.strictObject({ ...base, result: agent7Result }),
} as const;

export type StudioPacketExtras = {
  unit_key: string;
  unit_hash: string | null;
  allowed_claim_ids: string[];
  opportunity_id: string;
  article_id: string;
};
export type StudioValidationCtx = {
  packet: StudioPacketExtras & { agent_key: StudioAgentKey; prompt_version: string };
  currentUnit: Unit | null;                   // the stored current version (Agents 5-7)
  currentHash: string | null;
  check: CheckCtx;
  voiceUsable: boolean;
  requiredIssuesOpen: string[];               // issue keys the writer is expected to answer
  declinableKeys?: string[];                  // writer only: the open should-fix / suggestion keys it may decline
};

export const scoreIssues = (s: Record<string, number>): string[] => {
  const e: string[] = [];
  for (const [k, max] of Object.entries(SCORE_MAX)) if (!(s[k] >= 0 && s[k] <= max)) e.push(`score.${k} must be 0..${max}`);
  const sum = Object.keys(SCORE_MAX).reduce((a, k) => a + (s[k] ?? 0), 0);
  if (Math.abs(sum - s.total) > 0.01) e.push(`score.total must equal the sum of the parts (${sum})`);
  return e;
};

export function studioSemanticChecks(agent: StudioAgentKey, out: Record<string, any>, ctx: StudioValidationCtx): string[] {
  const errs: string[] = [];
  const meta = STUDIO_AGENT_META[agent];
  const r = out.result;
  if (!meta.decisions.includes(out.decision)) errs.push(`decision ${out.decision} is not allowed for ${meta.name}; allowed: ${meta.decisions.join("/")}`);
  if (out.opportunity_id !== ctx.packet.opportunity_id) errs.push("opportunity_id does not match the task packet");
  if (out.article_id !== ctx.packet.article_id) errs.push("article_id does not match the task packet");
  if (out.agent_prompt_version !== meta.promptVersion) errs.push(`agent_prompt_version must be ${meta.promptVersion}`);
  if (!/^claude-code\//.test(out.model_version)) errs.push('model_version must be "claude-code/<model id>"');
  if (r.unit_key !== ctx.packet.unit_key) errs.push("unit_key does not match the task packet");
  if (agent !== "thb-04-section-writer" && r.version_hash !== ctx.currentHash) errs.push("the review is for a different version than the one in the packet");
  const allowed = new Set(ctx.packet.allowed_claim_ids);
  const needsRequired = (out.findings as any[]).filter((f) => f.severity === "required");

  if (agent === "thb-04-section-writer") {
    if (out.decision === "PASS") {
      if (!r.unit) errs.push("a PASS must include the written unit");
      else {
        if (r.unit.key !== r.unit_key) errs.push("unit.key must equal unit_key");
        for (const id of unitClaimIds(r.unit)) if (!allowed.has(id)) errs.push(`claim ${id} is not in the ledger supplied in the packet; the writer cannot add claims`);
      }
      for (const k of ctx.requiredIssuesOpen) if (!(r.addresses as string[]).includes(k)) errs.push(`the revision must address open issue ${k} (list it in addresses)`);
      for (const d of (r.declines ?? []) as { key: string }[]) {
        if (ctx.requiredIssuesOpen.includes(d.key)) errs.push(`declines: ${d.key} is a must-fix and cannot be declined: fix it`);
        else if (!(ctx.declinableKeys ?? []).includes(d.key)) errs.push(`declines: ${d.key} is not an open should-fix or suggestion for this unit (use the exact key from your packet)`);
      }
    } else if (r.unit) errs.push("a BLOCKED output carries no unit; say what is missing in required_actions");
    else if (out.required_actions.length === 0) errs.push("BLOCKED needs required_actions naming the gap (never fill it with an invented fact)");
  }

  if (agent === "thb-05-fact-privacy-auditor") {
    const cur = ctx.currentUnit;
    const cited = cur ? unitClaimIds(cur) : [];
    const checked = new Set<string>((r.claim_checks as any[]).map((c) => c.claim_id));
    for (const id of cited) if (!checked.has(id)) errs.push(`claim_checks must cover every claim cited by the unit (missing ${id})`);
    for (const c of r.claim_checks as any[]) if (!cited.includes(c.claim_id)) errs.push(`claim_checks names ${c.claim_id}, which this unit does not cite`);
    const bad = (r.claim_checks as any[]).filter((c) => c.verdict !== "supported_as_written");
    if (out.decision === "PASS") {
      if (bad.length) errs.push(`PASS is not allowed while claim ${bad[0].claim_id} is ${bad[0].verdict}`);
      if (!r.privacy_ok) errs.push("PASS is not allowed while privacy_ok is false");
      if (!r.legal_qualification_ok) errs.push("PASS is not allowed while legal_qualification_ok is false");
      if (needsRequired.length) errs.push("a PASS cannot carry required findings");
      // Agent 5 cannot pass its own assumptions: the deterministic checks must also be clean.
      if (cur) for (const f of checkUnit(cur, ctx.check)) if (f.severity !== "REVISION") errs.push(`PASS is not allowed: the deterministic check found ${f.code} (${f.detail})`);
    } else {
      if (out.decision === "BLOCKED" && !r.block_kind) errs.push("BLOCKED needs block_kind (BLOCKED_CLAIM or BLOCKED_PRIVACY)");
      if (needsRequired.length === 0) errs.push(`${out.decision} needs at least one required finding with an issue_key`);
    }
  }

  if (agent === "thb-06-seo-aeo-geo-auditor") {
    if (out.decision === "PASS" && needsRequired.length) errs.push("a PASS cannot carry required findings");
    if (out.decision === "REVISION" && needsRequired.length === 0) errs.push("REVISION needs at least one required finding with an issue_key");
  }

  if (agent === "thb-07-editorial-critic") {
    if (!ctx.voiceUsable) errs.push("Agent 7 cannot run: there is no usable voice reference (provisional or approved)");
    if (!r.voice_reference_used) errs.push("voice_reference_used must be true");
    errs.push(...scoreIssues(r.score));
    if (out.decision === "PASS") {
      if (needsRequired.length) errs.push("a PASS cannot carry required findings");
      if (!r.copy_paste_test.passed) errs.push("PASS is not allowed while the copy-paste test fails; list the flagged text as a required finding");
      if (Object.values(r.authenticity).some((v) => v === false)) errs.push("PASS is not allowed while an authenticity checklist answer is NO");
    } else if (needsRequired.length === 0) errs.push("REVISION needs at least one required finding with an issue_key");
    if (r.revised_unit) {
      if (out.decision !== "PASS") errs.push("revised_unit is only allowed with PASS; a REVISION goes back to the writer");
      if (r.revised_unit.key !== r.unit_key) errs.push("revised_unit.key must equal unit_key");
      for (const id of unitClaimIds(r.revised_unit)) if (!allowed.has(id)) errs.push(`revised_unit cites ${id}, which is not in the ledger`);
    }
  }
  // No agent output may carry a verdict about approval or state; the strict schema already rejects such keys.
  return errs;
}
