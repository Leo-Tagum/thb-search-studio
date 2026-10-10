// Human decisions on blog-audit verdicts. Only a human actor reaches this code; the engine and agents recommend.
// The Studio never changes WordPress: approved MERGE/RETIRE/NOINDEX only produce rows in blog_audit_actions (a manual list).
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateActions, type ActionRow } from "./actions";

export type Verdict = "KEEP" | "UPDATE" | "MERGE" | "RETIRE" | "NOINDEX" | "FLAG_ONLY";
export const VERDICTS: Verdict[] = ["KEEP", "UPDATE", "MERGE", "RETIRE", "NOINDEX", "FLAG_ONLY"];
export const RISKY: Verdict[] = ["MERGE", "RETIRE", "NOINDEX"];
export type Result = { ok: true; status: string; verdict: Verdict | null } | { ok: false; reason: string };

type AuditRow = {
  id: string; page_id: string; proposed_verdict: Verdict; target_url: string | null; reason: string; protection_status: string;
  evidence: { search?: { clicks: number; impressions: number }; overlap?: { sharedCount: number }[] };
};

async function load(db: SupabaseClient, id: string): Promise<{ a: AuditRow; url: string } | null> {
  const { data: a } = await db.from("blog_audits").select("*").eq("id", id).single();
  if (!a) return null;
  const { data: p } = await db.from("pages").select("url").eq("id", a.page_id).single();
  return { a: a as AuditRow, url: p!.url as string };
}

const summary = (a: AuditRow) => `${a.evidence.search ? `${a.evidence.search.clicks} clicks / ${a.evidence.search.impressions} impressions (16 months)` : "no search data"}; ${a.reason}`.slice(0, 600);

/** Rebuilds the action row for one audit and validates the whole list; returns problems without saving when invalid. */
async function syncAction(db: SupabaseClient, a: AuditRow, oldUrl: string, verdict: Verdict, target: string | null, why: string): Promise<string[]> {
  const { data: current } = await db.from("blog_audit_actions").select("audit_id,action,old_url,target_url,reason,evidence_summary,status").neq("status", "CANCELLED");
  const others = ((current ?? []) as (ActionRow & { audit_id: string })[]).filter((r) => r.audit_id !== a.id);
  const next: ActionRow[] = RISKY.includes(verdict) ? [...others, { action: verdict as ActionRow["action"], old_url: oldUrl, target_url: verdict === "NOINDEX" ? null : target, reason: why, evidence_summary: summary(a) }] : others;
  const { data: pages } = await db.from("pages").select("url,wp_type,in_sitemap").in("wp_type", ["post", "page"]);
  const problems = validateActions(next, new Set((pages ?? []).map((p) => p.url as string)));
  // only problems that involve this row block the decision
  const mine = problems.filter((p) => p.startsWith(oldUrl) || (target && p.includes(target)));
  if (mine.length) return mine;
  if (RISKY.includes(verdict)) {
    const { error } = await db.from("blog_audit_actions").upsert({ audit_id: a.id, action: verdict, old_url: oldUrl, target_url: verdict === "NOINDEX" ? null : target, reason: why, evidence_summary: summary(a), status: "TO_DO" }, { onConflict: "audit_id" });
    if (error) throw error;
  } else {
    await db.from("blog_audit_actions").update({ status: "CANCELLED" }).eq("audit_id", a.id);
  }
  return [];
}

export type Choice = { kind: "approve" } | { kind: "change"; verdict: Verdict; targetUrl?: string } | { kind: "hold" };

export async function decideAudit(db: SupabaseClient, auditId: string, choice: Choice, reason: string, actor: string, opts: { ackProtection?: boolean } = {}): Promise<Result> {
  const why = reason.trim();
  if (!why) return { ok: false, reason: "A reason is required." };
  const row = await load(db, auditId);
  if (!row) return { ok: false, reason: "Audit row not found." };
  const { a, url } = row;
  const prior = a.proposed_verdict;

  let verdict: Verdict | null = null; let target: string | null = null; let status: string;
  if (choice.kind === "hold") { status = "HELD"; }
  else if (choice.kind === "approve") { status = "APPROVED"; verdict = prior; target = a.target_url; }
  else {
    if (a.protection_status === "protected") return { ok: false, reason: "Protected page: only FLAG_ONLY applies; the verdict cannot be changed." };
    if (!VERDICTS.includes(choice.verdict) || choice.verdict === prior) return { ok: false, reason: "Choose a different, valid verdict." };
    status = "CHANGED"; verdict = choice.verdict; target = RISKY.includes(verdict) && verdict !== "NOINDEX" ? (choice.targetUrl?.trim() || null) : null;
    if (verdict === "FLAG_ONLY") return { ok: false, reason: "FLAG_ONLY is set by protection status, not chosen per post. Mark protection first." };
  }
  if (verdict && verdict !== "KEEP" && verdict !== "FLAG_ONLY" && a.protection_status === "unknown" && !opts.ackProtection) {
    return { ok: false, reason: "Protection status is UNKNOWN for this post. Tick the acknowledgement to approve a change (recorded in the audit log)." };
  }
  if (verdict && RISKY.includes(verdict) && verdict !== "NOINDEX" && !target) return { ok: false, reason: `${verdict} needs a target (surviving/redirect) URL.` };

  const problems = await syncAction(db, a, url, verdict ?? prior, verdict ? target : null, why).catch((e) => [String(e)]);
  if (verdict === null) await db.from("blog_audit_actions").update({ status: "CANCELLED" }).eq("audit_id", a.id); // held: nothing to execute
  else if (problems.length) return { ok: false, reason: `Action list check failed: ${problems.join(" | ")}` };

  const { error } = await db.from("blog_audits").update({
    status, final_verdict: verdict, final_target_url: target, decision_reason: why, decided_by: actor, decided_at: new Date().toISOString(),
    protection_ack: !!opts.ackProtection || undefined,
  }).eq("id", a.id);
  if (error) return { ok: false, reason: error.message };
  await db.from("audit_events").insert({ actor, subject_type: "blog_audit", subject_id: a.id, event_type: "audit_decided", prior_state: prior, new_state: verdict ?? "HELD", accepted: true, detail: { status, reason: why, url, target, protection_acknowledged: !!opts.ackProtection } });
  return { ok: true, status, verdict };
}

/** Bulk approval exists only for KEEP / UPDATE / FLAG_ONLY with one shared reason. MERGE / RETIRE / NOINDEX are refused: one at a time. */
export async function bulkApprove(db: SupabaseClient, ids: string[], reason: string, actor: string, opts: { ackProtection?: boolean } = {}): Promise<{ approved: number; refused: { id: string; reason: string }[] }> {
  const refused: { id: string; reason: string }[] = []; let approved = 0;
  for (const id of ids) {
    const { data: a } = await db.from("blog_audits").select("proposed_verdict,status").eq("id", id).single();
    if (!a) { refused.push({ id, reason: "not found" }); continue; }
    if (RISKY.includes(a.proposed_verdict as Verdict)) { refused.push({ id, reason: `${a.proposed_verdict} cannot be bulk-approved` }); continue; }
    const r = await decideAudit(db, id, { kind: "approve" }, reason, actor, opts);
    if (r.ok) approved++; else refused.push({ id, reason: r.reason });
  }
  return { approved, refused };
}
