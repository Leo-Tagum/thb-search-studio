// Human decisions on an opportunity. Only a human actor reaches this code; agents recommend, they never decide.
import type { SupabaseClient } from "@supabase/supabase-js";
import { Orchestrator, type Actor } from "../orchestrator";
import { SupabaseRepo } from "../orchestrator/supabase-repo";

export type Choice = "approve" | "hold_duplication" | "hold_evidence" | "reject";
export type DecisionResult = { ok: true; state: string } | { ok: false; reason: string };

export async function decideOpportunity(db: SupabaseClient, oppId: string, choice: Choice, reason: string, actorId: string, opts: { ackProtection?: boolean } = {}): Promise<DecisionResult> {
  const why = reason.trim();
  if (!why) return { ok: false, reason: "A reason is required." };
  const { data: o, error } = await db.from("opportunities").select("*").eq("id", oppId).single();
  if (error || !o) return { ok: false, reason: "Opportunity not found." };
  if (o.state !== "SEO_REVIEW") return { ok: false, reason: `Decisions are taken in SEO_REVIEW (this one is ${o.state}); run Agent 1 first.` };
  const actor: Actor = { kind: "human", id: actorId };
  const orch = new Orchestrator(new SupabaseRepo(db));

  if (choice === "approve" && o.protected_warning && !(opts.ackProtection || o.protection_ack)) {
    return { ok: false, reason: "Protection status is unknown or protected for a page this would change. Tick the acknowledgement to proceed (recorded in the audit log)." };
  }
  const target = choice === "approve" ? "EVIDENCE_REVIEW" : choice === "reject" ? "REJECTED" : choice === "hold_duplication" ? "HOLD_DUPLICATION" : "HOLD_EVIDENCE";
  const res = await orch.transition("opportunity", oppId, target, actor, { choice, reason: why, protection_acknowledged: !!opts.ackProtection });
  if (!res.ok) return { ok: false, reason: res.reason };

  const action = choice === "approve" ? (o.agent_decision?.decision ?? o.proposed_action) : choice === "reject" ? "REJECT" : "HOLD";
  await db.from("opportunities").update({ human_decision: choice === "approve" ? "approve" : choice, human_reason: why, action, protection_ack: !!opts.ackProtection || o.protection_ack }).eq("id", oppId);
  await db.from("decisions").insert({ opportunity_id: oppId, decision: choice, rationale: why, decided_by: actorId });
  if (choice === "reject" && o.intent_key) {
    await db.from("rejected_intents").upsert({ intent_key: o.intent_key, opportunity_id: oppId, reason: why, rejected_by: actorId, new_evidence_note: null });
  }
  return { ok: true, state: target };
}

/** Putting a held opportunity back into review is a human act too. */
export async function reopenHeld(db: SupabaseClient, oppId: string, actorId: string, why: string): Promise<DecisionResult> {
  const orch = new Orchestrator(new SupabaseRepo(db));
  const res = await orch.transition("opportunity", oppId, "SEO_REVIEW", { kind: "human", id: actorId }, { reason: why });
  return res.ok ? { ok: true, state: "SEO_REVIEW" } : { ok: false, reason: res.reason };
}

/** A rejected intent may be proposed again only after someone records new evidence. */
export async function recordNewEvidence(db: SupabaseClient, intentKey: string, note: string, actorId: string) {
  if (!note.trim()) throw new Error("new evidence note required");
  await db.from("rejected_intents").update({ new_evidence_note: note.trim() }).eq("intent_key", intentKey);
  await db.from("audit_events").insert({ actor: actorId, subject_type: "rejected_intent", subject_id: intentKey, event_type: "new_evidence_recorded", accepted: true, detail: { note } });
}
