/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 3c evidence audit: the database-derived numbers (Q1, Q3, Q4, Q9, Q19). READ-ONLY (select only). Run: npx tsx --env-file=.env.local scripts/phase3c-evidence-audit.mts
// The transcript-derived numbers (Q2, Q10-Q16) come from Claude Code's stored session logs; their extraction scripts are in docs/phases/phase-3c-evidence-audit-data/method/.
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const NAMES: Record<string, string> = { "e2b915e3-af97-4ea6-8979-4861ec729027": "original (classic draft)", "d7f03fff-22d0-48fe-9ee0-3d6d5102c856": "team branch (revision)", "54070caa-bd79-4184-a82a-9235b1c33b64": "classic-revision branch" };

// Q1: runs per article and agent
const { data: runs } = await db.from("agent_runs").select("agent_key,subject_type,subject_id,status,model_version");
const by: Record<string, Record<string, number>> = {};
for (const r of runs ?? []) { const k = NAMES[r.subject_id] ?? r.subject_type; by[k] ??= {}; by[k][r.agent_key] = (by[k][r.agent_key] ?? 0) + 1; }
console.log("Q1 agent_runs per subject:");
for (const [k, v] of Object.entries(by)) console.log(`  ${k}: ${Object.values(v).reduce((a, b) => a + b, 0)}  ${JSON.stringify(v)}`);
const models: Record<string, number> = {}; for (const r of runs ?? []) models[String(r.model_version)] = (models[String(r.model_version)] ?? 0) + 1;
console.log("Q16 self-reported model_version of every run:", JSON.stringify(models));

// Q3 and Q9: tickets by type, real vs fixture
const { data: arts } = await db.from("articles").select("id,is_fixture");
const fixture = new Set((arts ?? []).filter((a: any) => a.is_fixture).map((a: any) => a.id));
const { data: tickets } = await db.from("tickets").select("article_id,ticket_type,from_role,to_role,escalation_trigger");
const tt: Record<string, number> = {};
for (const t of tickets ?? []) { const k = `${fixture.has(t.article_id) ? "fixture" : "real"}:${t.ticket_type}`; tt[k] = (tt[k] ?? 0) + 1; }
console.log("Q3/Q9 tickets:", JSON.stringify(tt));

// Q4: collected and declined items, and the Phase 3d declines list, of the team branch
const { data: secs } = await db.from("article_sections").select("section_key,issues").eq("article_id", "d7f03fff-22d0-48fe-9ee0-3d6d5102c856");
let collected = 0, declined = 0, stored = 0;
for (const s of secs ?? []) { const t = (s.issues as any)?.team; collected += (t?.collected ?? []).length; declined += (t?.collected ?? []).filter((c: any) => c.declined).length; stored += (t?.declines ?? []).length; }
console.log(`Q4 team branch: ${collected} collected items, ${declined} declined, ${stored} in declines[]`);

// Q19: the distinct jurisdiction and applicability values of the original article's ledger
const { data: claims } = await db.from("claims").select("jurisdiction,applicability").eq("article_id", "e2b915e3-af97-4ea6-8979-4861ec729027");
console.log("Q19 distinct (jurisdiction, applicability):", JSON.stringify([...new Set((claims ?? []).map((c: any) => `${c.jurisdiction} | ${c.applicability}`))]));
