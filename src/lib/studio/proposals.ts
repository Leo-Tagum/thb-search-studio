/* eslint-disable @typescript-eslint/no-explicit-any -- DB JSON columns are validated at the boundary */
// Proposals and approval sync (Supabase side). All trust decisions are in approvals.ts; this module only loads the stored truth
// (hashes recomputed from the stored rows), records every record it read (accepted or not), and applies the sign-off through the orchestrator.
import type { SupabaseClient } from "@supabase/supabase-js";
import { Orchestrator, type Actor } from "../orchestrator";
import { SupabaseRepo } from "../orchestrator/supabase-repo";
import { classifyRecord, confirmRegistration, evaluateSignoff, type Counted, type Proposal, type Registry, type RoomRecord } from "./approvals";
import { contentHash, sha256 } from "./hash";
import { SYSTEM } from "./service";

const orch = (db: SupabaseClient) => new Orchestrator(new SupabaseRepo(db));

/** Hash of the voice reference content (the stored hash field is excluded, so the value is recomputed, never trusted). */
export function voiceHash(value: string | null | undefined): string | null {
  try {
    const v = JSON.parse(value ?? "");
    if (!v?.excerpts) return null;
    const { content_hash: _ignored, ...core } = v; void _ignored;
    return contentHash(core);
  } catch { return null; }
}

export async function createProposal(db: SupabaseClient, articleId: string, actorId: string, opts: { requiresSecondary?: boolean } = {}) {
  const { data: a } = await db.from("articles").select("*").eq("id", articleId).single();
  if (a.state !== "HUMAN_REVIEW") throw new Error(`A proposal needs the article in HUMAN_REVIEW (it is ${a.state}).`);
  const { data: ver } = await db.from("article_versions").select("*").eq("id", a.locked_version_id).single();
  if (sha256(ver.body.html) !== a.version_hash) throw new Error("the stored version does not match the article's current hash");
  const { data: vr } = await db.from("brand_facts").select("fact_value,status").eq("fact_key", "voice_reference").single();
  const voice = vr?.status === "approved" ? null : (voiceHash(vr?.fact_value) ? JSON.parse(vr!.fact_value) : null);
  await db.from("proposals").update({ status: "SUPERSEDED" }).eq("article_id", articleId).eq("status", "OPEN");
  const { data: p, error } = await db.from("proposals").insert({ article_id: articleId, article_version_id: ver.id, voice_snapshot: voice, requires_secondary: !!opts.requiresSecondary, created_by: actorId }).select("*").single();
  if (error) throw error;
  await db.from("audit_events").insert({ actor: actorId, subject_type: "article", subject_id: articleId, event_type: "proposal_created", accepted: true, version_hash: a.version_hash, detail: { proposal: p.id, voice_item: !!voice } });
  return p;
}

async function loadProposals(db: SupabaseClient): Promise<{ map: Map<string, Proposal>; rows: any[] }> {
  const { data: rows } = await db.from("proposals").select("*");
  const { data: vr } = await db.from("brand_facts").select("fact_value").eq("fact_key", "voice_reference").single();
  const map = new Map<string, Proposal>();
  for (const r of rows ?? []) {
    const { data: ver } = await db.from("article_versions").select("body").eq("id", r.article_version_id).single();
    const { data: art } = await db.from("articles").select("version_hash").eq("id", r.article_id).single();
    const items: Proposal["items"] = [{ itemKind: "article", recomputedHash: sha256(ver!.body.html), currentHash: art!.version_hash }];
    if (r.voice_snapshot) items.push({ itemKind: "voice_reference", recomputedHash: voiceHash(JSON.stringify(r.voice_snapshot))!, currentHash: voiceHash(vr?.fact_value) ?? "none" });
    map.set(r.id, { id: r.id, createdAt: r.created_at, items, requiresSecondary: r.requires_secondary, open: r.status === "OPEN" });
  }
  return { map, rows: rows ?? [] };
}

async function loadRegistry(db: SupabaseClient): Promise<Registry> {
  const { data } = await db.from("approver_registry").select("*");
  return new Map((data ?? []).map((r: any) => [r.viewer_id, { role: r.role, status: r.status, label: r.label }]));
}

export type SyncReport = { read: number; approvals: number; feedback: number; rejected: number; pendingRegistrations: string[]; signoff: Record<string, string>; lines: string[] };

/** Process records read from the Approval Room. Idempotent: the same record read twice is evaluated twice but recorded once. */
export async function syncApprovals(db: SupabaseClient, records: RoomRecord[], readAt = new Date().toISOString()): Promise<SyncReport> {
  const { map, rows } = await loadProposals(db);
  const registry = await loadRegistry(db);
  const rep: SyncReport = { read: records.length, approvals: 0, feedback: 0, rejected: 0, pendingRegistrations: [], signoff: {}, lines: [] };
  const touched = new Set<string>();

  for (const rec of records) {
    const v = classifyRecord(rec, map, registry, readAt);
    await db.from("approval_sync_log").upsert({
      record_id: rec.recordId, proposal_id: rec.proposalId, item_kind: rec.itemKind, viewer_id: rec.viewerId, decision: rec.decision, claimed_hash: rec.claimedHash,
      recomputed_hash: v.recomputedHash, server_updated_at: rec.serverUpdatedAt ?? readAt, browser_decided_at: rec.browserDecidedAt ?? null,
      classification: v.classification, accepted: v.accepted, reason: v.reason, synced_at: readAt,
    }, { onConflict: "record_id,server_updated_at" });
    if (v.registerPending) {
      registry.set(rec.viewerId, { role: null, status: "PENDING" });
      await db.from("approver_registry").upsert({ viewer_id: rec.viewerId, display_name: rec.displayName ?? null, status: "PENDING" }, { onConflict: "viewer_id", ignoreDuplicates: true });
      rep.pendingRegistrations.push(`${rec.displayName ?? "(no name)"} [${rec.viewerId}]`);
    }
    if (v.classification === "REJECTED") {
      rep.rejected++;
      const p = map.get(rec.proposalId);
      await db.from("audit_events").insert({ actor: "system:approval-sync", subject_type: "proposal", subject_id: rec.proposalId, event_type: "approval_record_rejected", accepted: false, detail: { record: rec.recordId, viewer: rec.viewerId, claimed_hash: rec.claimedHash, recomputed_hash: v.recomputedHash, current_hash: p?.items.find((i) => i.itemKind === rec.itemKind)?.currentHash, reason: v.reason, browser_decided_at_untrusted: rec.browserDecidedAt ?? null } });
    } else if (v.classification === "FEEDBACK") rep.feedback++;
    else {
      if (v.classification === "APPROVAL") rep.approvals++;
      touched.add(rec.proposalId);
      const reg = registry.get(rec.viewerId)!;
      const identity = `${reg.label ?? "approver"} (${rec.viewerId})`;
      const { data: dup } = await db.from("approvals").select("id").eq("proposal_id", rec.proposalId).eq("item_kind", rec.itemKind).eq("approver_identity", identity).eq("version_hash", v.recomputedHash!).eq("decision", rec.decision).maybeSingle();
      if (!dup) await db.from("approvals").insert({ subject_type: "article", subject_id: rows.find((r) => r.id === rec.proposalId).article_id, version_hash: v.recomputedHash, decision: rec.decision, approver_identity: identity, decided_at: v.countedTime, proposal_id: rec.proposalId, item_kind: rec.itemKind });
    }
    rep.lines.push(`${rec.recordId}: ${v.classification}${v.accepted ? "" : " (not counted)"} — ${v.reason}`);
  }

  for (const pid of touched) rep.signoff[pid] = await applySignoff(db, map.get(pid)!, rows.find((r) => r.id === pid), registry);
  return rep;
}

async function applySignoff(db: SupabaseClient, p: Proposal, row: any, registry: Registry): Promise<string> {
  const { data: appr } = await db.from("approvals").select("*").eq("proposal_id", p.id).is("invalidated_at", null);
  const counted: Counted[] = [];
  for (const a of appr ?? []) {
    const viewer = /\((u_[^)]+|[^)]+)\)$/.exec(a.approver_identity)?.[1] ?? "";
    const reg = registry.get(viewer);
    if (!reg || reg.status !== "CONFIRMED" || (reg.role !== "approver" && reg.role !== "secondary")) continue;
    const item = p.items.find((i) => i.itemKind === a.item_kind);
    if (!item || a.version_hash !== item.recomputedHash || item.recomputedHash !== item.currentHash) continue;   // an edit since invalidates it
    counted.push({ viewerId: viewer, role: reg.role, itemKind: a.item_kind, classification: a.decision === "approve" ? "APPROVAL" : a.decision === "hold" ? "HOLD" : "CHANGES_REQUESTED", time: a.decided_at });
  }
  const res = evaluateSignoff(p, counted);
  const o = orch(db);
  const articleId = row.article_id as string;
  const { data: art } = await db.from("articles").select("state,version_hash").eq("id", articleId).single();
  if (res.status === "WAITING") return `WAITING: ${res.reasons.join("; ")}`;
  if (res.status === "SENT_BACK") {
    await db.from("proposals").update({ status: "SENT_BACK" }).eq("id", p.id);
    const voiceRejected = res.reasons[0].includes("voice reference");
    if (voiceRejected) await db.from("brand_facts").update({ provisional_by: null, provisional_at: null }).eq("fact_key", "voice_reference");
    if (art!.state === "HUMAN_REVIEW") {
      await o.transition("article", articleId, "REVISION_REQUIRED", SYSTEM, { reason: res.reasons.join("; "), proposal: p.id });
      await o.transition("article", articleId, "DRAFTING", SYSTEM, { proposal: p.id });
      if (voiceRejected) {
        // Back to Agent 7: every section returns to editorial review (fact and SEO passes stay; the lock is cleared).
        const { data: secs } = await db.from("article_sections").select("*").eq("article_id", articleId);
        for (const s of secs ?? []) { const env = s.issues?.meta ? s.issues : { issues: [], meta: {} }; await db.from("article_sections").update({ status: "NEEDS_EDITORIAL", locked: false, issues: { ...env, meta: { ...env.meta, lockedHash: null, resumeStage: "editorial" } } }).eq("id", s.id); }
      }
    }
    await db.from("audit_events").insert({ actor: "system:approval-sync", subject_type: "article", subject_id: articleId, event_type: "proposal_sent_back", accepted: true, detail: { proposal: p.id, reasons: res.reasons } });
    return `SENT_BACK: ${res.reasons.join("; ")}`;
  }
  // APPROVED: record the human approval against the exact current hash, move to the sign-off state, confirm the voice reference.
  const approver = counted.find((c) => c.role === "approver" && c.itemKind === "article")!;
  const reg = registry.get(approver.viewerId)!;
  const actor: Actor = { kind: "human", id: `${reg.label} (${approver.viewerId})` };
  const hash = p.items.find((i) => i.itemKind === "article")!.recomputedHash;
  const r1 = await o.recordApproval("article", articleId, hash, actor);
  if (!r1.ok) return `REFUSED: ${r1.reason}`;
  await db.from("articles").update({ approved_hash: hash }).eq("id", articleId);
  const r2 = art!.state === "HUMAN_REVIEW" ? await o.transition("article", articleId, "APPROVED_FOR_WP_DRAFT", actor, { proposal: p.id, approvers: counted.map((c) => c.viewerId) }) : r1;
  if (!r2.ok) return `REFUSED: ${r2.reason}`;
  if (p.items.some((i) => i.itemKind === "voice_reference")) await db.from("brand_facts").update({ status: "approved", approved_by: actor.id, approved_at: counted.find((c) => c.itemKind === "voice_reference")!.time }).eq("fact_key", "voice_reference");
  await db.from("proposals").update({ status: "APPROVED" }).eq("id", p.id);
  return `APPROVED by ${actor.id}; article is now APPROVED_FOR_WP_DRAFT`;
}

// ---------- Leo's registration of first-click accounts ----------
export async function confirmApprover(db: SupabaseClient, viewerId: string, role: "approver" | "secondary" | "operator", label: string, byActor: string) {
  const registry = await loadRegistry(db);
  const ok = confirmRegistration(registry, viewerId, role, label);
  if (!ok.ok) return ok;
  await db.from("approver_registry").update({ role, label: label.trim(), status: "CONFIRMED", confirmed_by: byActor, confirmed_at: new Date().toISOString() }).eq("viewer_id", viewerId);
  await db.from("audit_events").insert({ actor: byActor, subject_type: "approver", subject_id: viewerId, event_type: "approver_confirmed", accepted: true, detail: { role, label } });
  return { ok: true as const };
}
