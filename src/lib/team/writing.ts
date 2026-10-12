// Phase 3c: Writing team (W1 writer, W2 co-writer) output rules, enforced in code.
//   - Only W1 writes into the draft. W1 is Agent 4's contract plus tickets: it cannot add claims (the ledger only grows through Research) and
//     must raise an EVIDENCE_REQUEST when it needs a fact it does not have.
//   - W2 only challenges and suggests. Its output has no unit, no claims, no lock, no state, no tickets, and its suggestions cannot carry replacement text.
// Strict schemas reject unknown keys (a "locked", "state" or "approved" key never validates); semantic checks add the rules a schema cannot say.
import { z } from "zod";
import { studioOutputSchemas, studioSemanticChecks, type StudioValidationCtx } from "../studio/agents";
import { feedbackCard } from "./tickets";

// ---------- W1 ----------
const agent4 = studioOutputSchemas["thb-04-section-writer"];
export const w1Output = agent4.extend({ result: agent4.shape.result.extend({ tickets: z.array(feedbackCard).max(5) }) });

export function w1SemanticChecks(out: z.infer<typeof w1Output>, ctx: StudioValidationCtx): string[] {
  const errs = studioSemanticChecks("thb-04-section-writer", out, ctx);   // unit key, H2, claims only from the ledger in the packet, issues addressed
  const r = out.result;
  for (const t of r.tickets) {
    if (t.from.length !== 1 || t.from[0] !== "W1") errs.push("W1 raises tickets only as W1");
    if (t.ticket !== "EVIDENCE_REQUEST" && t.ticket !== "HUMAN_ESCALATION") errs.push(`W1 raises EVIDENCE_REQUEST or HUMAN_ESCALATION, not ${t.ticket}`);
    if (t.section !== r.unit_key) errs.push(`a ticket's section must be this unit (${r.unit_key}), not ${t.section}`);
  }
  // A gap is never filled in and never just reported: it becomes an evidence request to Research.
  if (out.decision === "BLOCKED" && !r.tickets.some((t) => t.ticket === "EVIDENCE_REQUEST")) errs.push("a BLOCKED output must raise an EVIDENCE_REQUEST ticket for the missing fact instead of adding one");
  return errs;
}

// ---------- W2 ----------
export const W2_AREAS = ["angle", "h1", "clarity", "examples", "cta"] as const;
const { result: _r, decision: _d, ...envelopeShape } = agent4.shape;
void _r; void _d;
const suggestion = z.strictObject({ id: z.string().regex(/^[a-z0-9_:.-]{3,80}$/i), area: z.enum(W2_AREAS), issue: z.string().min(5), suggestion: z.string().min(5) });
export const w2Output = z.strictObject({
  ...envelopeShape,
  decision: z.literal("PASS"),
  result: z.strictObject({ unit_key: z.string(), version_hash: z.string(), suggestions: z.array(suggestion).max(6) }),
});
export type W2Output = z.infer<typeof w2Output>;

const SENTENCES = (t: string) => t.split(/(?<=[.!?])\s+/).filter((x) => x.trim()).length;

/** W2 gives direction, not text: short, one line, at most two sentences, no markup, no claim ids. */
export function w2SemanticChecks(out: W2Output, ctx: { unit_key: string; currentHash: string | null }): string[] {
  const errs: string[] = [];
  if (out.result.unit_key !== ctx.unit_key) errs.push("unit_key does not match the task packet");
  if (out.result.version_hash !== ctx.currentHash) errs.push("the suggestions are for a different version than the one in the packet");
  const ids = new Set<string>();
  for (const s of out.result.suggestions) {
    if (ids.has(s.id)) errs.push(`suggestion id ${s.id} is used twice`);
    ids.add(s.id);
    for (const [field, text] of [["issue", s.issue], ["suggestion", s.suggestion]] as const) {
      if (text.length > 300) errs.push(`${s.id}: ${field} is longer than 300 characters; W2 gives direction, it does not write draft text`);
      if (/[\r\n]/.test(text)) errs.push(`${s.id}: ${field} must be one line; W2 does not supply blocks of text`);
      if (SENTENCES(text) > 2) errs.push(`${s.id}: ${field} is more than two sentences; W2 does not write draft text`);
      if (/clm:\d+/i.test(text)) errs.push(`${s.id}: ${field} mentions a claim id; W2 never adds or cites claims`);
      if (/\*\*|\]\(|<\/?[a-z][^>]*>|^\s*([-*•]|\d+[.)])\s/m.test(text)) errs.push(`${s.id}: ${field} contains markup or a list; W2 does not supply draft text`);
    }
  }
  return errs;
}
