"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-server";
import { approveBrief, resolveSection, setPipelineMode } from "@/lib/studio/service";
import { confirmApprover } from "@/lib/studio/proposals";
import { leoAnswerEscalation } from "@/lib/team/store";

const ACTOR = "leo"; // local single-operator app; the operator is never an approver (see approvals.ts)

export async function approveBriefAction(formData: FormData) {
  const id = String(formData.get("id"));
  const res = await approveBrief(supabaseAdmin(), id, ACTOR);
  revalidatePath("/opportunities"); revalidatePath(`/opportunities/${id}`);
  if (res.ok) redirect(`/studio/${res.articleId}`);
  redirect(`/opportunities/${id}?error=${encodeURIComponent(res.reason)}`);
}

export async function sectionAction(formData: FormData) {
  const articleId = String(formData.get("article")); const unit = String(formData.get("unit")); const kind = String(formData.get("kind"));
  const text = String(formData.get("text") ?? "").trim();
  if (!["request_revision", "reopen", "hold"].includes(kind)) throw new Error("bad action");
  if (kind !== "hold" && !text) redirect(`/studio/${articleId}?error=${encodeURIComponent("A directive is required.")}`);
  const res = await resolveSection(supabaseAdmin(), articleId, unit, kind === "hold" ? { kind: "hold" } : { kind: kind as "request_revision" | "reopen", text }, ACTOR);
  revalidatePath(`/studio/${articleId}`);
  redirect(`/studio/${articleId}?${res.ok ? `done=${res.status}` : `error=${encodeURIComponent(res.reason)}`}`);
}

export async function modeAction(formData: FormData) {
  const articleId = String(formData.get("article"));
  const res = await setPipelineMode(supabaseAdmin(), articleId, String(formData.get("mode")), ACTOR);
  revalidatePath(`/studio/${articleId}`);
  redirect(`/studio/${articleId}?${res.ok ? `done=${res.mode}-mode` : `error=${encodeURIComponent(res.reason)}`}`);
}

/** Leo answers a "Stuck" escalation: optionally sends the section back (the same resolveSection, audited as leo), then closes the escalation with his words. */
export async function resolveEscalationAction(formData: FormData) {
  const articleId = String(formData.get("article")); const ticket = String(formData.get("ticket")); const kind = String(formData.get("kind"));
  const text = String(formData.get("text") ?? "").trim();
  const back = (q: string) => redirect(`/studio/${articleId}?${q}`);
  if (!["request_revision", "reopen", "hold", "dismiss"].includes(kind)) throw new Error("bad action");
  if (kind !== "hold" && !text) back(`error=${encodeURIComponent("A decision or directive is required.")}`);
  const db = supabaseAdmin();
  const { data: t } = await db.from("tickets").select("unit_key,ticket_type").eq("id", ticket).single();
  if (kind !== "dismiss" && t?.unit_key) {
    const res = await resolveSection(db, articleId, t.unit_key, kind === "hold" ? { kind: "hold" } : { kind: kind as "request_revision" | "reopen", text }, ACTOR);
    if (!res.ok) back(`error=${encodeURIComponent(res.reason)}`);
  }
  const closed = await leoAnswerEscalation(db, articleId, ticket, kind === "dismiss" ? text : `${kind}: ${text || "held"}`);
  revalidatePath(`/studio/${articleId}`);
  back(closed.ok ? "done=escalation-closed" : `error=${encodeURIComponent(closed.reason)}`);
}

export async function voiceApproveAction() {
  const db = supabaseAdmin();
  const { data: vr } = await db.from("brand_facts").select("status,fact_value").eq("fact_key", "voice_reference").single();
  if (!vr || /^NEEDED/.test(vr.fact_value) || vr.status === "approved") redirect("/studio?error=" + encodeURIComponent("Nothing to approve provisionally."));
  await db.from("brand_facts").update({ provisional_by: ACTOR, provisional_at: new Date().toISOString() }).eq("fact_key", "voice_reference");
  await db.from("audit_events").insert({ actor: ACTOR, subject_type: "brand_fact", subject_id: "voice_reference", event_type: "voice_reference_provisionally_approved", accepted: true, detail: { note: "provisional; Juan confirms in the Approval Room with the first article" } });
  revalidatePath("/studio");
  redirect("/studio?done=voice");
}

export async function confirmApproverAction(formData: FormData) {
  const res = await confirmApprover(supabaseAdmin(), String(formData.get("viewer")), String(formData.get("role")) as "approver" | "secondary" | "operator", String(formData.get("label") ?? ""), ACTOR);
  revalidatePath("/studio/approvers");
  redirect(`/studio/approvers?${res.ok ? "done=1" : `error=${encodeURIComponent(res.error)}`}`);
}
