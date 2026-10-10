// Live DB smoke test of the orchestrator: creates a throwaway article, walks transitions, checks audit rows.
import { createClient } from "@supabase/supabase-js";
import { Orchestrator } from "../src/lib/orchestrator/index";
import { SupabaseRepo } from "../src/lib/orchestrator/supabase-repo";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: a, error } = await db.from("articles").insert({ title: "SMOKE TEST (dummy)", version_hash: "h1" }).select("id").single();
if (error) throw error;
const orch = new Orchestrator(new SupabaseRepo(db));
const leo = { kind: "human" as const, id: "leo" };
const r1 = await orch.transition("article", a.id, "SEO_REVIEW", leo);
const r2 = await orch.transition("article", a.id, "PUBLISHED", leo);
const { data: ev } = await db.from("audit_events").select("event_type,prior_state,new_state,accepted").eq("subject_id", a.id).order("at");
console.log(JSON.stringify({ r1: r1.ok, r2: r2.ok, audit: ev }));
const upd = await db.from("audit_events").update({ actor: "x" }).eq("subject_id", a.id);
console.log("audit update refused:", !!upd.error, upd.error?.message);
if (r1.ok !== true || r2.ok !== false || ev?.length !== 2 || !upd.error) { console.error("FAIL"); process.exit(1); }
console.log("PASS");
