/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { stateOf } from "../src/lib/studio/service";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const B = "54070caa-bd79-4184-a82a-9235b1c33b64"; const OUT = process.argv[2]; const START = process.argv[3];
const { data: art } = await db.from("articles").select("state,version_hash,approved_hash,pipeline_mode,is_fixture").eq("id", B).single();
const { data: secs } = await db.from("article_sections").select("*").eq("article_id", B).order("position");
const units: any[] = [];
for (const s of secs!) {
  const st = stateOf(s);
  const { data: vers } = await db.from("section_versions").select("id,version_no,content,content_hash,created_by,created_at,reason").eq("section_id", s.id).order("version_no");
  const { data: revs } = await db.from("section_reviews").select("agent_key,decision,findings,created_at").eq("section_id", s.id).gte("created_at", START).order("created_at");
  units.push({ unit: s.section_key, status: st.status, gate: st.gate, v1Passed: !!st.v1Passed, v1Rounds: st.v1Rounds, collected: st.collected, declines: st.declines, hedges: st.hedges, versions: (vers ?? []).map((v: any) => ({ no: v.version_no, hash: v.content_hash.slice(0, 12), by: v.created_by, at: v.created_at, reason: v.reason, content: v.content })), reviewsThisRun: revs });
}
const { data: runs } = await db.from("agent_runs").select("agent_key,status,retries,created_at,updated_at,task_packet,output").eq("subject_id", B).gte("created_at", START).order("created_at");
const est = (runs ?? []).map((r: any) => ({ agent: r.agent_key, unit: r.task_packet?.unit_key, status: r.status, retries: r.retries, created: r.created_at, packetChars: JSON.stringify(r.task_packet).length, outChars: JSON.stringify(r.output ?? {}).length }));
const { data: esc } = await db.from("escalations").select("issue_key,status,reason,created_at").eq("article_id", B);
const { count: props } = await db.from("proposals").select("id", { count: "exact", head: true }).eq("article_id", B);
const { count: aps } = await db.from("approvals").select("id", { count: "exact", head: true }).eq("subject_id", B).is("invalidated_at", null);
writeFileSync(OUT, JSON.stringify({ article: art, units, runs: est, escalations: esc, proposals: props, activeApprovals: aps }, null, 1));
console.log(JSON.stringify({ article: art, runs: est.length, escalations: esc?.length, proposals: props, activeApprovals: aps }));
