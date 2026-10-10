/* eslint-disable @typescript-eslint/no-explicit-any */
// Operator CLI for the agent bridge. Usage:
//   npm run studio -- queue <agent-key|1|2|3> <opportunity_id>
//   npm run studio -- packet <run_id|next>     (prints the task packet JSON; never prints secrets)
//   npm run studio -- submit <run_id> <file>   (validates; malformed output retries, then INTEGRATION_ERROR)
//   npm run studio -- check <run_id> <file>    (dry run: validates without saving or using an attempt)
//   npm run studio -- runs                     (lists runs)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { AGENT_KEYS, type AgentKey } from "../src/lib/agents/schemas";
import { semanticChecks, submitOutput } from "../src/lib/agents/bridge";
import { outputSchemas } from "../src/lib/agents/schemas";
import { SupabaseBridgeStore, makeOrchestrator, queueRun, validationContext } from "../src/lib/agents/supabase-deps";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const [cmd, a, b] = process.argv.slice(2);

if (cmd === "queue") {
  const agent = (/^[123]$/.test(a) ? AGENT_KEYS[Number(a) - 1] : a) as AgentKey;
  if (!AGENT_KEYS.includes(agent)) throw new Error(`unknown agent ${a}`);
  const { run, duplicate } = await queueRun(db, agent, b);
  console.log(`${duplicate ? "existing" : "queued"} run ${run.id} (${agent}) for opportunity ${b}`);
} else if (cmd === "packet") {
  let id = a;
  if (a === "next") {
    const { data } = await db.from("agent_runs").select("id").eq("status", "QUEUED").order("created_at").limit(1).maybeSingle();
    if (!data) { console.log("no queued runs"); process.exit(0); }
    id = data.id;
  }
  const run = await new SupabaseBridgeStore(db).getRun(id);
  console.log(JSON.stringify({ run_id: run.id, attempts_used: run.retries, last_error: run.error, ...run.task_packet }, null, 2));
} else if (cmd === "submit") {
  const orch = makeOrchestrator(db);
  const res = await submitOutput(new SupabaseBridgeStore(db), orch, a, readFileSync(b, "utf8"), validationContext(db));
  if (res.ok) console.log(`ACCEPTED run ${a}`);
  else {
    console.log(`REJECTED run ${a} (attempt ${res.run.retries}/3)${res.final ? " — FINAL: opportunity moved to INTEGRATION_ERROR" : " — fix and resubmit"}`);
    for (const e of res.errors.slice(0, 20)) console.log("  -", e);
    process.exitCode = 2;
  }
} else if (cmd === "check") {
  // Dry run: same validation as submit, but nothing is saved and no attempt is used.
  const run = await new SupabaseBridgeStore(db).getRun(a);
  const errors: string[] = [];
  try {
    const r = outputSchemas[run.agent_key].safeParse(JSON.parse(readFileSync(b, "utf8")));
    if (!r.success) for (const i of r.error.issues) errors.push(`${i.path.join(".") || "(root)"}: ${i.message}`);
    else errors.push(...semanticChecks(run.agent_key, r.data as Record<string, any>, await validationContext(db)(run)));
  } catch (e) { errors.push(`not valid JSON: ${e instanceof Error ? e.message : String(e)}`); }
  console.log(errors.length ? `WOULD REJECT (${errors.length}); attempts used so far: ${run.retries}/3` : `WOULD ACCEPT (attempts used so far: ${run.retries}/3)`);
  for (const e of errors.slice(0, 20)) console.log("  -", e);
} else if (cmd === "runs") {
  const { data } = await db.from("agent_runs").select("id,agent_key,subject_id,status,retries,created_at").order("created_at");
  for (const r of data ?? []) console.log(`${r.id} ${r.agent_key} ${r.status} retries=${r.retries} opp=${r.subject_id}`);
} else {
  console.log("commands: queue | packet | submit | runs");
}
