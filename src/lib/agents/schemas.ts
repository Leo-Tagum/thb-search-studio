// Blueprint §5 common response schema + per-agent result schemas. Strict: unknown keys (for example
// "approved" or "next_state") are rejected, so no agent output can set an approval or a state.
import { z } from "zod";
import { QUOTE_MAX, verificationFields } from "../studio/legal-claims";

export const AGENT_KEYS = ["thb-01-seo-strategist", "thb-02-research-evidence", "thb-03-content-architect"] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];

export const AGENT_META: Record<AgentKey, { n: 1 | 2 | 3; name: string; promptVersion: string; decisions: readonly string[] }> = {
  "thb-01-seo-strategist": { n: 1, name: "SEO Strategist", promptVersion: "1.5.0", decisions: ["CREATE", "UPDATE", "MERGE", "HOLD", "REJECT"] },
  "thb-02-research-evidence": { n: 2, name: "Research & Evidence", promptVersion: "1.6.0", decisions: ["PASS", "REVISION", "BLOCKED"] },
  "thb-03-content-architect": { n: 3, name: "Content Architect", promptVersion: "1.6.0", decisions: ["PASS", "REVISION", "BLOCKED"] },
};

const finding = z.strictObject({
  claim: z.string().min(1),
  basis: z.enum(["gsc_data", "inventory", "official_source", "evidence_library", "assumption", "hypothesis"]),
  evidence_ids: z.array(z.string()),
  note: z.string().optional(),
}).refine((f) => ["assumption", "hypothesis"].includes(f.basis) || f.evidence_ids.length > 0, { message: "a finding that is not an assumption/hypothesis needs evidence_ids" });

export const mapTo = z.enum(["existing_page", "section_on_this_page", "separate_supporting_page", "official_reference", "exclude"]);
const fanOut = z.strictObject({ question: z.string(), status: z.literal("hypothesis"), map_to: mapTo, note: z.string().optional() });

const scoreKeys = z.enum(["seller_relevance", "original_information", "local_differentiation", "answer_usefulness", "topical_fit"]);

export const agent1Result = z.strictObject({
  rationale: z.string().min(20),
  existing_urls: z.array(z.string()),
  cannibalization: z.strictObject({ warning: z.boolean(), support: z.string() }),
  score_estimates: z.partialRecord(scoreKeys, z.number().min(0).max(20)),
  unknowns_acknowledged: z.array(z.string()).min(1),
  confidence: z.enum(["low", "medium", "high"]),
  fan_out: z.array(fanOut),
});

const source = z.strictObject({
  id: z.string().regex(/^src:/),
  kind: z.enum(["library", "official_url"]),
  library_source_id: z.string().optional(),
  url: z.string().optional(),
  title: z.string(),
  tier: z.number().int().min(1).max(6),
  jurisdiction: z.string(),
  effective_date: z.string().nullable(),
  retrieved_date: z.string(),
  locality_matches: z.boolean(),
});
const claim = z.strictObject({
  id: z.string().regex(/^clm:/),
  text: z.string().min(1),
  source_ids: z.array(z.string()),
  support: z.enum(["supported", "unsupported", "conflicting"]),
  jurisdiction: z.string(),
  risk: z.enum(["low", "medium", "high"]),
  // For claims supported by an Evidence Library source: the passage ids and a short verbatim quote (checked against the stored text).
  passage_ids: z.array(z.string()).optional(),
  quote: z.string().max(QUOTE_MAX).optional(),
  claim_type: z.enum(["statute", "statute_absence"]).optional(),   // statute_absence: a claim that a law does NOT say something, with proof (the full official text read, the term absent)
  ...verificationFields,   // Phase 3e: section, verification {label, reason, against, reader_impact}, gates (required for high-risk legal claims by the stage 2 submit check)
  note: z.string().optional(),
});
// Stage 6 part A: what Agent 2 and R1 hand Leo INSTEAD of a guess when the official text is not in the Evidence Library: the exact section to print and where to find it.
const printRequest = z.strictObject({
  jurisdiction: z.string().trim().min(2),
  code: z.string().trim().min(2),                       // e.g. "San Francisco Housing Code"
  section: z.string().trim().min(1).max(120),           // the section number, or "find by title" when the number is not known
  title: z.string().trim().min(3).max(200),
  url: z.string().nullable().default(null),             // the official page, if known (an official host or a known code publisher)
  why: z.string().trim().min(15).max(400),              // which legal point of the article needs it
});
export const agent2Result = z.strictObject({
  sources: z.array(source),
  claims: z.array(claim),
  print_requests: z.array(printRequest).max(12).default([]),
  brand_facts_pending: z.array(z.string()),
  first_party_proof: z.enum(["available", "restricted", "unavailable"]),
  unresolved: z.array(z.string()),
});

// Editorial standards §3: every brief fills all 7 Seller Situation Map rows (answered, or marked not relevant with a reason).
export const SITUATION_ROWS = ["ownership", "authority", "condition", "people", "money", "timing", "risk"] as const;
const situationRow = z.strictObject({
  row: z.enum(SITUATION_ROWS),
  status: z.enum(["answered", "not_relevant"]),
  answer: z.string().min(5), // the answer, or the reason it is not relevant
  basis: z.enum(["seller_problem_logic", "claim", "not_applicable"]),
  claim_ids: z.array(z.string()),
});
// Editorial standards §2: honest options and at least one real-world warning are required in every article.
export const OPTIONS = ["keep_it", "list_it", "fix_it", "get_professional_help", "sell_directly"] as const;

export const agent3Result = z.strictObject({
  brief: z.strictObject({
    seller_situation_map: z.array(situationRow).length(7),
    honest_options: z.array(z.strictObject({ option: z.enum(OPTIONS), when_it_fits: z.string().min(5), claim_ids: z.array(z.string()) })).min(3),
    real_world_warnings: z.array(z.strictObject({ warning: z.string().min(10), claim_ids: z.array(z.string()) })).min(1),
    professional_confirmation: z.array(z.string()), // who the seller should confirm legal/tax/title/code points with
    working_title: z.string(),
    target_reader: z.string(),
    answer_first: z.string().min(10),
    outline: z.array(z.strictObject({ h2: z.string(), purpose: z.string(), claim_ids: z.array(z.string()), notes: z.string().optional() })).min(1),
    fan_out: z.array(fanOut),
    visuals: z.array(z.string()),
    link_plan: z.array(z.strictObject({ to_url: z.string(), anchor_intent: z.string() })),
    cta: z.string(),
    open_items: z.array(z.string()),
  }),
});

const base = {
  article_id: z.string(),
  opportunity_id: z.string().min(1),
  agent_name: z.string(),
  agent_prompt_version: z.string(),
  model_version: z.string(),
  input_version_ids: z.array(z.string()),
  decision: z.enum(["PASS", "REVISION", "BLOCKED", "CREATE", "UPDATE", "MERGE", "HOLD", "REJECT"]),
  findings: z.array(finding),
  evidence_ids: z.array(z.string()),
  required_actions: z.array(z.string()),
  output_version_id: z.string(),
  timestamp: z.iso.datetime(),
};
export const outputSchemas = {
  "thb-01-seo-strategist": z.strictObject({ ...base, result: agent1Result }),
  "thb-02-research-evidence": z.strictObject({ ...base, result: agent2Result }),
  "thb-03-content-architect": z.strictObject({ ...base, result: agent3Result }),
} as const;

export type AgentOutput = z.infer<(typeof outputSchemas)[AgentKey]>;
