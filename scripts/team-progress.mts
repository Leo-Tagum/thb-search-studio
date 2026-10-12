/* eslint-disable @typescript-eslint/no-explicit-any */
// Read-only progress of a team branch: per unit, status and how the seeded (baseline) findings stand now, and tickets used.
// Usage: npx tsx --env-file=.env.local scripts/team-progress.mts <branch_id>
import { createClient } from "@supabase/supabase-js";
import { progressOf } from "../src/lib/studio/team-progress";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const B = process.argv[2];
const { data: ev } = await db.from("audit_events").select("detail").eq("subject_id", B).eq("event_type", "branch_created").single();
const { data: secs } = await db.from("article_sections").select("section_key,status,issues").eq("article_id", B).order("position");
const { data: runs } = await db.from("team_runs").select("budget_used,ticket_budget,status").eq("article_id", B).order("started_at");
const p = progressOf(ev!.detail.seeded, secs as any[]);
for (const u of p.units) console.log(`${u.unit.padEnd(4)} ${u.status.padEnd(15)} seeded ${u.seeded}: fixed ${u.fixed}, declined ${u.declined}, still present ${u.stillPresent}  | new open items ${u.newOpen}`);
const r = runs?.[runs.length - 1];
console.log(`TOTAL fixed ${p.fixed}, declined ${p.declined}, still present ${p.stillPresent} of ${p.seeded} · tickets used ${r?.budget_used}/${r?.ticket_budget} · run ${r?.status}`);
