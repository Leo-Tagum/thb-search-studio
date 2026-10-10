/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 3 verification: prints real numbers for each "Done when" item. Read-only. The fixture-driven checks (forged records, edit after
// approval, blocked cases) are proven by the unit tests and `npm run smoke:studio`; this prints their latest results next to the live state.
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const run = (cmd: string) => { try { return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch (e: any) { return `${e.stdout ?? ""}${e.stderr ?? ""}`; } };
const vt = JSON.parse(run("npx vitest run --reporter=json").replace(/^[^{]*/, "")) as any;
const byFile = (re: RegExp) => { const f = vt.testResults.filter((t: any) => re.test(t.name)); return `${f.reduce((a: number, t: any) => a + t.assertionResults.filter((x: any) => x.status === "passed").length, 0)} of ${f.reduce((a: number, t: any) => a + t.assertionResults.length, 0)} passed`; };
console.log(`Vitest total: ${vt.numPassedTests} passed, ${vt.numFailedTests} failed (${vt.numTotalTestSuites} suites, ${vt.testResults.length} files)`);
console.log("  checks (blocked cases, required elements, PENDING JUAN):", byFile(/studio[\\/]checks\.test/));
console.log("  loop (targeted fix, material change, two-attempt limit, locks):", byFile(/studio[\\/]loop\.test/));
console.log("  approvals (forged hash, backdated time, registry, sign-off, no self-approval):", byFile(/studio[\\/]approvals\.test/));
console.log("  agents + files (strict schemas, Agent 5/7 rules, no-write guarantees):", byFile(/studio[\\/]agents\.test/));
console.log("  renderer, voice reference, diffs:", byFile(/studio[\\/](template|voice|diff)\.test/));

const { data: arts } = await db.from("articles").select("id,title,state,version_hash,approved_hash");
for (const a of arts ?? []) {
  const { data: secs } = await db.from("article_sections").select("section_key,status").eq("article_id", a.id).order("position");
  const { count: claims } = await db.from("claims").select("*", { count: "exact", head: true }).eq("article_id", a.id);
  const { count: revs } = await db.from("section_reviews").select("*", { count: "exact", head: true }).in("section_id", (await db.from("article_sections").select("id").eq("article_id", a.id)).data!.map((s: any) => s.id));
  const { data: ap } = await db.from("approvals").select("approver_identity,item_kind,decided_at,invalidated_at").eq("subject_id", a.id);
  console.log(`article "${a.title}": ${a.state}; sections ${JSON.stringify((secs ?? []).map((s: any) => `${s.section_key}:${s.status}`))}; ledger claims ${claims}; reviews ${revs}; version ${a.version_hash?.slice(0, 12)}; approved_hash ${a.approved_hash ? "set" : "none"}; approvals ${JSON.stringify(ap)}`);
}
const { data: vr } = await db.from("brand_facts").select("status,provisional_by,approved_by").eq("fact_key", "voice_reference").single();
console.log("voice reference:", JSON.stringify(vr));
const { data: reg } = await db.from("approver_registry").select("viewer_id,display_name,status,role,label");
console.log("approver registry:", JSON.stringify(reg));
const { data: log } = await db.from("approval_sync_log").select("classification,accepted");
const tally: Record<string, number> = {}; for (const l of log ?? []) tally[`${l.classification}${l.accepted ? "" : "(not counted)"}`] = (tally[`${l.classification}${l.accepted ? "" : "(not counted)"}`] ?? 0) + 1;
console.log("approval sync log:", JSON.stringify(tally));
const { data: runs } = await db.from("agent_runs").select("agent_key,status,retries").like("agent_key", "thb-0%");
const rs: Record<string, number> = {}; for (const r of runs ?? []) if (/thb-0[4-7]/.test(r.agent_key)) rs[`${r.agent_key}:${r.status}`] = (rs[`${r.agent_key}:${r.status}`] ?? 0) + 1;
console.log("Agents 4-7 runs:", JSON.stringify(rs));
