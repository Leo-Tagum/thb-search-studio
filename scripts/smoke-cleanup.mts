/* eslint-disable @typescript-eslint/no-explicit-any */
// Removes whatever a live smoke script left behind if it was killed before its own cleanup ran (a timeout, Ctrl-C): every article flagged
// is_fixture (a throwaway article created by a smoke script) with everything attached to it, fixture opportunities titled "SMOKE ...", R1 fixture
// snapshots, fixture approval-room rows, and the provisional voice-reference approval a smoke sets (it is restored to Leo's provisional approval).
// It never touches a real article: only rows flagged is_fixture or titled SMOKE are removed. audit_events are append-only and stay.
// Usage: npm run smoke:cleanup
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const viewers = ["u_smoke_juan", "u_smoke_cherry", "u_smoke_leo", "u_smoke_stranger"];

const { data: arts } = await db.from("articles").select("id,opportunity_id").eq("is_fixture", true);
for (const a of arts ?? []) {
  const art = a.id as string;
  const { data: ts } = await db.from("tickets").select("id").eq("article_id", art);
  const ids = (ts ?? []).map((t: any) => t.id);
  if (ids.length) { await db.from("tickets").update({ parent_ticket_id: null }).in("id", ids); await db.from("ticket_messages").delete().in("ticket_id", ids); await db.from("tickets").delete().in("id", ids); }
  await db.from("team_runs").delete().eq("article_id", art);
  const { data: secs } = await db.from("article_sections").select("id").eq("article_id", art);
  const sids = (secs ?? []).map((s: any) => s.id);
  if (sids.length) {
    await db.from("article_sections").update({ current_version_id: null, locked_version_id: null }).in("id", sids);
    await db.from("section_reviews").delete().in("section_id", sids);
    await db.from("section_versions").delete().in("section_id", sids);
    await db.from("article_sections").delete().in("id", sids);
  }
  await db.from("escalations").delete().eq("article_id", art);
  await db.from("proposals").delete().eq("article_id", art);
  await db.from("approvals").delete().eq("subject_id", art);
  await db.from("article_versions").delete().eq("article_id", art);
  await db.from("claims").delete().eq("article_id", art);
  await db.from("agent_runs").delete().eq("subject_id", art);
  await db.from("articles").delete().eq("id", art);
  console.log(`removed fixture article ${art}`);
}
const { data: opps } = await db.from("opportunities").select("id").like("title", "SMOKE%");
for (const o of opps ?? []) { await db.from("decisions").delete().eq("opportunity_id", o.id); await db.from("briefs").delete().eq("opportunity_id", o.id); await db.from("agent_runs").delete().eq("subject_id", o.id); await db.from("opportunities").delete().eq("id", o.id); console.log(`removed fixture opportunity ${o.id}`); }
const { data: snaps } = await db.from("evidence_sources").select("id").like("source_url", "https://www.dre.ca.gov/fixture/%");
for (const s of snaps ?? []) { await db.from("evidence_passages").delete().eq("source_id", s.id); await db.from("evidence_sources").delete().eq("id", s.id); console.log(`removed fixture snapshot ${s.id}`); }
await db.from("approval_sync_log").delete().like("record_id", "smoke-%");
await db.from("approver_registry").delete().in("viewer_id", viewers);
// the smokes set a provisional voice-reference approval for their duration; the real state is Leo's provisional approval
const { data: vr } = await db.from("brand_facts").select("status,provisional_by").eq("fact_key", "voice_reference").single();
if (vr?.provisional_by === "smoke-test") { await db.from("brand_facts").update({ provisional_by: "leo" }).eq("fact_key", "voice_reference"); console.log("voice_reference provisional approval restored to leo"); }
console.log("smoke cleanup done");
