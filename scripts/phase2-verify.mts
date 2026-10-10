/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 2 verification: prints real numbers for each "Done when" item. Read-only except the labelled
// INTEGRATION_ERROR injection, which runs against a throwaway fixture opportunity it creates and cancels.
import { createClient } from "@supabase/supabase-js";
import { MAX_ATTEMPTS, submitOutput } from "../src/lib/agents/bridge";
import { SupabaseBridgeStore, makeOrchestrator, queueRun, validationContext } from "../src/lib/agents/supabase-deps";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data: imp } = await db.from("gsc_imports").select("*");
for (const i of imp ?? []) console.log(`GSC import: ${i.start_date}..${i.end_date} state=${i.data_state} rows=${i.rows_fetched} truncated=${i.truncated} caveats=${i.caveats.length}`);
const { count: sm } = await db.from("search_metrics").select("id", { count: "exact", head: true });
console.log("search_metrics rows:", sm);

const { data: opps } = await db.from("opportunities").select("id,title,state,proposed_action,agent_decision,human_decision,protected_warning,template_flag,dev_change_request,packet,intent_key");
const by = (f: (o: any) => string) => { const m: Record<string, number> = {}; for (const o of opps ?? []) m[f(o)] = (m[f(o)] ?? 0) + 1; return JSON.stringify(m); };
console.log("opportunities:", opps?.length, "| by state", by((o) => o.state), "| by kind", by((o) => o.packet.kind));
console.log("engine proposals", by((o) => o.proposed_action), "| Agent 1 decisions", by((o) => o.agent_decision?.decision ?? "none"));
const updates = (opps ?? []).filter((o) => (o.agent_decision?.decision ?? o.proposed_action) === "UPDATE");
console.log(`UPDATE candidates: ${updates.length}; with protection warning: ${updates.filter((o) => o.protected_warning).length}; city-template flagged: ${updates.filter((o) => o.template_flag === "city").length}; routed to dev change request: ${updates.filter((o) => o.dev_change_request).length}`);
const citySwap = (opps ?? []).filter((o) => o.packet.kind === "city_swap");
console.log("city-swap candidates and engine/agent action:", citySwap.map((o) => `${o.packet.scope}:${o.proposed_action}/${o.agent_decision?.decision ?? "-"}`).join(", "));
console.log("CREATE-proposed that the agent changed:", (opps ?? []).filter((o) => o.proposed_action === "CREATE").map((o) => `${o.title} -> ${o.agent_decision?.decision ?? "-"}`).join(" | "));

const { data: runs } = await db.from("agent_runs").select("agent_key,status,retries");
const rs: Record<string, number> = {}; for (const r of runs ?? []) rs[`${r.agent_key}:${r.status}`] = (rs[`${r.agent_key}:${r.status}`] ?? 0) + 1;
console.log("agent runs:", JSON.stringify(rs), "| runs that needed a retry:", (runs ?? []).filter((r) => r.retries > 0).length);

// failure injection on a fixture opportunity (cleaned up afterwards)
const orch = makeOrchestrator(db);
const fixturePacket = { kind: "gap", totals: { impressions: 1, clicks: 0, position: 1, queryCount: 1 }, window: { start: "2000-01-01", end: "2000-01-02" }, pages: [], queries: [] };
const { data: fx } = await db.from("opportunities").insert({ title: "[fixture] malformed-output test", state: "CANDIDATE", packet: fixturePacket, intent_key: `fixture|${Date.now()}`, version_hash: "fixture" }).select("id").single();
const { run } = await queueRun(db, "thb-01-seo-strategist", fx!.id);
const store = new SupabaseBridgeStore(db);
for (let i = 1; i <= MAX_ATTEMPTS; i++) {
  const r = await submitOutput(store, orch, run.id, "{ this is not json", validationContext(db));
  console.log(`injection attempt ${i}: ok=${r.ok} final=${!r.ok && r.final} retries=${r.run.retries} status=${r.run.status}`);
}
const { data: after } = await db.from("opportunities").select("state").eq("id", fx!.id).single();
console.log("fixture opportunity state after malformed output x" + MAX_ATTEMPTS + ":", after!.state);
await db.from("agent_runs").delete().eq("subject_id", fx!.id);
await db.from("opportunities").delete().eq("id", fx!.id);
await db.from("audit_events").insert({ actor: "system:phase2-verify", subject_type: "opportunity", subject_id: fx!.id, event_type: "fixture_removed", accepted: true, detail: { note: "test fixture removed after the injection check; audit rows kept" } });
console.log("fixture removed (audit rows retained)");
