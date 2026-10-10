// Phase 2b live smoke (fixture only): approves one, changes one, holds one on a throwaway audit_run, checks the
// refusal rules and the audit log, then removes the fixture rows. Audit events are append-only and stay (actor "smoke-test").
import { createClient } from "@supabase/supabase-js";
import { bulkApprove, decideAudit } from "../src/lib/audit/decisions";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = `smoke-${Date.now()}`;
const { data: posts } = await db.from("pages").select("id,url").eq("wp_type", "post").limit(4);
const [p1, p2, p3, tgt] = posts!;
const mk = (page_id: string, v: string, extra: object = {}) => ({ page_id, audit_run: run, evidence: { search: { clicks: 1, impressions: 10 } }, checks: {}, proposed_verdict: v, reason: "fixture", confidence: "medium", unknowns: [], protection_status: "unknown", ...extra });
const { data: rows } = await db.from("blog_audits").insert([mk(p1.id, "UPDATE"), mk(p2.id, "UPDATE"), mk(p3.id, "MERGE", { target_page_id: tgt.id, target_url: tgt.url })]).select("id,page_id");
const id = (pid: string) => rows!.find((r) => r.page_id === pid)!.id;
const out: Record<string, unknown> = {};
out.noReason = await decideAudit(db, id(p1.id), { kind: "approve" }, "  ", "smoke-test");
out.noAck = await decideAudit(db, id(p1.id), { kind: "approve" }, "ok", "smoke-test");
out.approve = await decideAudit(db, id(p1.id), { kind: "approve" }, "smoke approve", "smoke-test", { ackProtection: true });
out.changeToRetireNoTarget = await decideAudit(db, id(p2.id), { kind: "change", verdict: "RETIRE" }, "smoke change", "smoke-test", { ackProtection: true });
out.changeToRetire = await decideAudit(db, id(p2.id), { kind: "change", verdict: "RETIRE", targetUrl: tgt.url }, "smoke change", "smoke-test", { ackProtection: true });
out.hold = await decideAudit(db, id(p3.id), { kind: "hold" }, "smoke hold", "smoke-test");
out.bulkRefusesMerge = await bulkApprove(db, [id(p3.id)], "bulk", "smoke-test", { ackProtection: true });
out.selfRedirect = await decideAudit(db, id(p1.id), { kind: "change", verdict: "RETIRE", targetUrl: p1.url }, "loop", "smoke-test", { ackProtection: true });
const { data: acts } = await db.from("blog_audit_actions").select("action,old_url,target_url,status").in("audit_id", rows!.map((r) => r.id));
const { data: ev } = await db.from("audit_events").select("event_type,new_state").eq("actor", "smoke-test").in("subject_id", rows!.map((r) => r.id));
console.log(JSON.stringify({ ...out, actionRows: acts, auditEvents: ev?.length, auditStates: ev?.map((e) => e.new_state) }, null, 1));
await db.from("blog_audit_actions").delete().in("audit_id", rows!.map((r) => r.id));
await db.from("blog_audits").delete().eq("audit_run", run);
console.log("fixture removed");
