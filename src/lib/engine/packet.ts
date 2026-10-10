import { z } from "zod";

const gap = z.object({ key: z.string(), text: z.string() });

// Candidate packet (blueprint §8). Fan-out items can only ever be hypotheses.
export const candidatePacketSchema = z.object({
  kind: z.enum(["overlap", "improve", "city_swap", "gap"]),
  intent_key: z.string(),
  title: z.string(),
  target_intent: z.string().min(1),
  scope: z.string(),
  window: z.object({ start: z.string(), end: z.string() }),
  totals: z.object({ impressions: z.number(), clicks: z.number(), position: z.number(), queryCount: z.number() }),
  queries: z.array(z.object({ query: z.string(), impressions: z.number(), clicks: z.number(), position: z.number() })),
  pages: z.array(z.object({
    url: z.string(), page_id: z.string().nullable(), title: z.string().nullable(), impressions: z.number(), clicks: z.number(), position: z.number(),
    queryCount: z.number(), protection_status: z.string().nullable(), template_flag: z.string().nullable(), in_inventory: z.boolean(),
  })),
  covering_pages: z.array(z.object({ url: z.string(), title: z.string().nullable(), why: z.string() })),
  overlap: z.object({ supported: z.boolean(), shared_queries: z.array(z.string()), reason: z.string() }),
  family: z.object({ places: z.array(z.string()), size: z.number() }).nullable(),
  proposed_action: z.enum(["CREATE", "UPDATE", "MERGE", "HOLD", "REJECT"]),
  alternatives: z.array(z.string()),
  uncertainty: z.array(z.string()),
  data_gaps: z.array(gap).min(1), // a packet with no stated gaps is a bug: SERP is never observed here
  first_party_proof: z.enum(["available", "restricted", "unavailable"]),
  seller_relevance_hint: z.boolean(),
  fan_out_hypotheses: z.array(z.object({ question: z.string(), status: z.literal("hypothesis") })),
  flags: z.object({ protected_warning: z.boolean(), template_flag: z.string().nullable(), dev_change_request: z.boolean() }),
  score: z.any(),
});
export type CandidatePacket = z.infer<typeof candidatePacketSchema>;
