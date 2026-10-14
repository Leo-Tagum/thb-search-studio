/* eslint-disable @typescript-eslint/no-explicit-any -- DB JSON columns */
// The voice reference is JUAN's to confirm (Leo, 2026-10-14): it is the brand voice, and the approver of articles (Cherry) cannot confirm Juan's voice. It is therefore NOT part of an
// article proposal any more. Juan confirms it once, on a small separate page, with the SAME recorded decision as the Approval Room (decisions/<viewer id>/records/<id>__voice_reference).
// This file reads those records back: the same trust rules as the Approval Room (identity is the platform viewer id, the hash a browser wrote is only a claim, the time is the platform's),
// plus one more: only a confirmed account labelled Juan counts.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Registry, RoomRecord } from "./approvals";
import { voiceHash } from "./proposals";

export const VOICE_ID_PREFIX = "voice-reference:";
/** The id of the one-time voice item for a given voice reference: it changes when the reference changes, so an old click never confirms a new text. */
export const voiceItemId = (hash: string) => `${VOICE_ID_PREFIX}${hash.slice(0, 12)}`;
const isJuan = (label?: string) => /^juan\b/i.test((label ?? "").trim());

export type VoiceVerdict = { classification: "APPROVAL" | "CHANGES_REQUESTED" | "FEEDBACK" | "REJECTED"; accepted: boolean; reason: string; registerPending: boolean; countedTime: string };

/** Pure: what one record from the voice page means. `currentHash` is the hash of the voice reference as stored now (null if there is none). */
export function classifyVoiceRecord(rec: RoomRecord, currentHash: string | null, registry: Registry, readAt: string): VoiceVerdict {
  const countedTime = rec.serverUpdatedAt ?? readAt;
  const v = (classification: VoiceVerdict["classification"], accepted: boolean, reason: string, registerPending = false): VoiceVerdict => ({ classification, accepted, reason, registerPending, countedTime });
  if (rec.itemKind !== "voice_reference" || !rec.proposalId.startsWith(VOICE_ID_PREFIX)) return v("REJECTED", false, "not a voice reference record");
  if (!currentHash) return v("REJECTED", false, "there is no voice reference stored");
  const reg = registry.get(rec.viewerId);
  if (!reg) return v("FEEDBACK", false, "first click from this account: saved as feedback and queued for Leo to confirm who this is", true);
  if (reg.status !== "CONFIRMED" || !reg.role) return v("FEEDBACK", false, `account is ${reg.status}; saved as feedback, not a confirmation`);
  if (reg.role === "operator") return v("FEEDBACK", false, "operator (Leo) account: feedback only");
  if (!isJuan(reg.label)) return v("FEEDBACK", false, `the voice reference is Juan's to confirm; this account is ${reg.label ?? "unlabelled"}: saved as feedback`);
  if (rec.proposalId !== voiceItemId(currentHash)) return v("REJECTED", false, "this decision is for an earlier version of the voice reference; it does not apply to the current one");
  if (rec.claimedHash !== currentHash) return v("REJECTED", false, `hash mismatch: the record claims ${rec.claimedHash.slice(0, 12)}…, the stored voice reference hashes to ${currentHash.slice(0, 12)}…`);
  if (rec.decision === "approve") return v("APPROVAL", true, `confirmed by ${reg.label}`);
  return v("CHANGES_REQUESTED", true, `${rec.decision === "hold" ? "hold" : "changes requested"} by ${reg.label}`);
}

export type VoiceSyncReport = { read: number; confirmed: boolean; feedback: number; rejected: number; pendingRegistrations: string[]; lines: string[] };

/** Read the records from the voice page and apply them. Idempotent. A confirmation sets the voice reference to approved; a request for changes clears Leo's provisional approval. */
export async function syncVoiceApproval(db: SupabaseClient, records: RoomRecord[], readAt = new Date().toISOString()): Promise<VoiceSyncReport> {
  const { data: vr } = await db.from("brand_facts").select("fact_value,status").eq("fact_key", "voice_reference").single();
  const current = voiceHash(vr?.fact_value);
  const { data: regRows } = await db.from("approver_registry").select("*");
  const registry: Registry = new Map((regRows ?? []).map((r: any) => [r.viewer_id, { role: r.role, status: r.status, label: r.label }]));
  const rep: VoiceSyncReport = { read: records.length, confirmed: false, feedback: 0, rejected: 0, pendingRegistrations: [], lines: [] };
  for (const rec of records) {
    const v = classifyVoiceRecord(rec, current, registry, readAt);
    if (v.registerPending) {
      registry.set(rec.viewerId, { role: null, status: "PENDING" });
      await db.from("approver_registry").upsert({ viewer_id: rec.viewerId, display_name: rec.displayName ?? null, status: "PENDING" }, { onConflict: "viewer_id", ignoreDuplicates: true });
      rep.pendingRegistrations.push(`${rec.displayName ?? "(no name)"} [${rec.viewerId}]`);
    }
    if (v.classification === "REJECTED") rep.rejected++; else if (v.classification === "FEEDBACK") rep.feedback++;
    if (v.classification === "APPROVAL") {
      const who = `${registry.get(rec.viewerId)!.label} (${rec.viewerId})`;
      if (vr?.status !== "approved") await db.from("brand_facts").update({ status: "approved", approved_by: who, approved_at: v.countedTime }).eq("fact_key", "voice_reference");
      await db.from("audit_events").insert({ actor: "system:voice-sync", subject_type: "brand_fact", subject_id: "voice_reference", event_type: "voice_reference_confirmed", accepted: true, detail: { record: rec.recordId, by: who, hash: current } });
      rep.confirmed = true;
    } else if (v.classification === "CHANGES_REQUESTED") {
      await db.from("brand_facts").update({ provisional_by: null, provisional_at: null }).eq("fact_key", "voice_reference");
      await db.from("audit_events").insert({ actor: "system:voice-sync", subject_type: "brand_fact", subject_id: "voice_reference", event_type: "voice_reference_changes_requested", accepted: true, detail: { record: rec.recordId, viewer: rec.viewerId, note: (rec.note ?? "").slice(0, 500) } });
    }
    rep.lines.push(`${rec.recordId}: ${v.classification}${v.accepted ? "" : " (not counted)"}: ${v.reason}`);
  }
  return rep;
}

/** What the voice page shows: a few example lines (the same filter the Approval Room used) and the hash the decision will be recorded against. Read-only. */
export type VoicePagePayload = { id: string; hash: string; excerpts: { text: string }[]; question: string; imitate: string[]; avoid: string[]; banned_phrases: { dont: string; write_like_juan: string }[]; all_excerpts: string[] };
export function voicePagePayload(factValue: string): VoicePagePayload | null {
  const hash = voiceHash(factValue); if (!hash) return null;
  const v = JSON.parse(factValue);
  const ex = (v.excerpts ?? []).filter((x: any) => (x.use === "primary" || x.use === "warmth") && x.text.length <= 170 && !/(usually|often|most)/i.test(x.text)).slice(0, 4).map((x: any) => ({ text: x.text }));
  // everything the hash covers is shown (Leo, 2026-10-14): the example lines, the "imitate" and "avoid" lists, the rewrite pairs and every excerpt
  const strs = (a: any): string[] => (Array.isArray(a) ? a.filter((x) => typeof x === "string") : []);
  const pairs = (Array.isArray(v.banned_phrases) ? v.banned_phrases : []).filter((b: any) => typeof b?.dont === "string" && typeof b?.write_like_juan === "string").map((b: any) => ({ dont: b.dont, write_like_juan: b.write_like_juan }));
  return { id: voiceItemId(hash), hash, excerpts: ex, imitate: strs(v.imitate), avoid: strs(v.avoid), banned_phrases: pairs, all_excerpts: (v.excerpts ?? []).map((x: any) => String(x.text)), question: "These example lines guide how future articles are written in your voice. Confirm once and we won't ask again." };
}
