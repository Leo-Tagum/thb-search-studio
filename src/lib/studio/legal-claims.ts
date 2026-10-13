/* eslint-disable @typescript-eslint/no-explicit-any -- DB rows */
// Legal-claim verification record ("Legal claims: no guessing", Leo's standing rule 2026-10-13; migration 0020, Phase 3e stage 1).
// This module is the shape of the record and its mapping to and from the `claims` table. It enforces nothing by itself: the submit checks for Agent 2 and R1
// are stage 2, the V1 and unit checks are stage 3. Everything here is optional on purpose, so claims written before the rule keep loading.
import { z } from "zod";

export const VERIFICATION_LABELS = ["MATCH", "NARROWER", "BROADER", "WRONG"] as const;
export type VerificationLabel = (typeof VERIFICATION_LABELS)[number];
export const READER_IMPACTS = ["none", "changes"] as const;
export type ReaderImpact = (typeof READER_IMPACTS)[number];
export const GATE_KINDS = ["threshold", "exception", "alternative_decider", "scope", "effective_date"] as const;
export type GateKind = (typeof GATE_KINDS)[number];

/** The longest exact quote a claim may carry (the claims table itself has no limit). */
export const QUOTE_MAX = 1200;

/**
 * A condition the quoted section puts on the rule: a threshold ("to an extent that endangers..."), an exception, an alternative decider, a scope, or an effective date.
 * `stated_in_claim`: the claim's own wording states it. `carried_by`: another claim (for example clm:8) states it, and any unit that cites this claim must cite that one too.
 */
export const gate = z.strictObject({
  kind: z.enum(GATE_KINDS),
  text: z.string().min(1),
  stated_in_claim: z.boolean(),
  carried_by: z.string().regex(/^(clm|new):/).optional(),
});
export type Gate = z.infer<typeof gate>;

/** What Agent 2 and R1 add to a claim (all optional in the schema; stage 2 makes them required for high-risk legal claims). */
export const verificationFields = {
  section: z.string().min(1).optional(),                       // "H&S 17920.3(a)(12)"
  verification: z.strictObject({
    label: z.enum(VERIFICATION_LABELS),
    reason: z.string().optional(),                             // required for NARROWER (stage 2)
    against: z.string().min(1),                                // what the quote was read from
    reader_impact: z.enum(READER_IMPACTS),
  }).optional(),
  gates: z.array(gate).optional(),
};

export type ClaimVerification = {
  quote: string | null; section: string | null; label: VerificationLabel | null; reason: string | null; against: string | null;
  gates: Gate[]; readerImpact: ReaderImpact | null;
};

type VerifiableClaim = {
  quote?: string | null; section?: string | null;
  verification?: { label: VerificationLabel; reason?: string | null; against: string; reader_impact: ReaderImpact } | null;
  gates?: Gate[] | null;
};

/** The `claims` columns added by migration 0020, from a claim as Agent 2 or R1 wrote it. Nothing is invented: a missing field is null (gates: empty). */
export function verificationColumns(c: VerifiableClaim) {
  return {
    quote_full: c.quote ?? null,
    section_cite: c.section ?? null,
    verification_label: c.verification?.label ?? null,
    verification_reason: c.verification?.reason ?? null,
    verified_against: c.verification?.against ?? null,
    gates: c.gates ?? [],
    reader_impact: c.verification?.reader_impact ?? null,
  };
}

/** The verification record of a `claims` row (a row older than migration 0020, or never backfilled, comes back all null and with no gates). */
export function verificationFromRow(row: Record<string, any>): ClaimVerification {
  const gates = Array.isArray(row.gates) ? (row.gates as unknown[]).flatMap((g) => { const p = gate.safeParse(g); return p.success ? [p.data] : []; }) : [];
  return {
    quote: row.quote_full ?? null, section: row.section_cite ?? null,
    label: (VERIFICATION_LABELS as readonly string[]).includes(row.verification_label) ? row.verification_label : null,
    reason: row.verification_reason ?? null, against: row.verified_against ?? null, gates,
    readerImpact: (READER_IMPACTS as readonly string[]).includes(row.reader_impact) ? row.reader_impact : null,
  };
}

/** True when the row carries the full record the rule asks for: a quote, a section, what it was read from, a label and a reader impact. */
export const isVerificationComplete = (v: ClaimVerification): boolean => !!(v.quote?.trim() && v.section && v.against && v.label && v.readerImpact);

/** What the reviewers see of a claim's verification record in the packet's claim ledger (null fields for a claim written before the rule). */
export function ledgerRecord(v: ClaimVerification | undefined) {
  return {
    quote: v?.quote ?? null, section: v?.section ?? null, verification_label: v?.label ?? null, verification_reason: v?.reason ?? null,
    reader_impact: v?.readerImpact ?? null, gates: v?.gates ?? [], verified_against: v?.against ?? null,
  };
}
