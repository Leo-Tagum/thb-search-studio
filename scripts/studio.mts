/* eslint-disable @typescript-eslint/no-explicit-any */
// Operator CLI for the agent bridge and the Content Studio. Usage:
//   npm run studio -- queue <agent-key|1..7> <opportunity_id | article_id> [unit_key]   (Agents 4-7 need article_id + unit_key, e.g. s1 or faq)
//   npm run studio -- plan <article_id>                 (what can run next, per unit)
//   npm run studio -- queue-next <article_id>           (queues every runnable step)
//   npm run studio -- packet <run_id|next>              (prints the task packet JSON; never prints secrets)
//   npm run studio -- submit <run_id> <file>            (validates; malformed output retries, then INTEGRATION_ERROR)
//   npm run studio -- check <run_id> <file>             (dry run: validates without saving or using an attempt)
//   npm run studio -- runs                              (lists runs)
//   npm run studio -- declines <article_id>             (Leo's list: every writer decline with its reason and how many times it was raised, and the open optional items)
//   npm run studio -- article <article_id>              (sections, statuses, claims, state)
//   npm run studio -- resolve <article_id> <unit_key> <request_revision|reopen|hold> [directive text]   (Leo: sends a blocked/escalated section back, or reopens a locked one)
//   Team mode (Phase 3c; the article must run in team mode, see "mode"):
//   npm run studio -- team-start <article_id>            (opens the team run: ticket budget 10, round limit 2)
//   npm run studio -- team-plan <article_id> [unit]      (which roles can run next, and why; open tickets; unit states)
//   npm run studio -- team-queue-next <article_id> [unit]   (queues every planned step)
//   npm run studio -- team-queue <role R1..V3> <article_id> [unit] [ticket e.g. T3]   (queues one role, e.g. W2, or S1 for a demand request)
//   npm run studio -- team-dump <dir>                    (writes every QUEUED team packet to <dir>/<ROLE>-<unit>[-<ticket>]-packet.json)
//   npm run studio -- team-submit-dir <dir>              (submits every <ROLE>-...-out.json that has a matching packet; same 3-attempt rule)
//   npm run studio -- team-submit <run_id> <file> | team-check <run_id> <file>   (submit one output / dry run)
//   npm run studio -- team-log <article_id>              (tickets, rounds and the full router log: who, what, when, version)
//   npm run studio -- team-budget <branch_id> <n> <reason...>   (Leo: raises the ticket budget of ONE team branch above the default of 10; recorded as an exception)
//   npm run studio -- team-answer <article_id> <T-id> <text...>  (Leo: answers an escalation, e.g. T11, and closes it)
//   npm run studio -- mode <article_id> [classic|team]  (Leo: shows or switches the pipeline; switching is allowed only before any section is written, or on a team branch)
//   npm run studio -- branch <article_id> <expected_findings> [--classic] [--dry-run]   (Leo: creates a BRANCH of a classic article for a comparison, team mode by default, or a classic revision baseline with --classic; reads the original only)
//   npm run studio -- fingerprint <article_id>          (read-only fingerprint of an article and everything attached to it)
//   npm run studio -- fingerprint-v2 <article_id>       (read-only; stable: fixed column list, ordered by id; a column added later cannot change it. Report it next to v1)
//   npm run studio -- branch-delete <branch_id> --yes   (Leo: removes one branch and what it created; refuses anything that is not a branch)
//   npm run studio -- voice-approve                    (Leo: provisionally approve the voice reference; Juan confirms in the Approval Room)
//   npm run studio -- proposal <article_id> <out.json>  (creates the proposal and writes the Approval Room payload)
//   npm run studio -- sync-approvals <records.json>     (records read from the Approval Room with ArtifactData)
//   npm run studio -- approvers                         (accounts that clicked; pending ones need Leo's confirmation)
//   npm run studio -- confirm-approver <viewer_id> <approver|secondary|operator> <label>
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { AGENT_KEYS, type AgentKey } from "../src/lib/agents/schemas";
import { semanticChecks, submitOutput } from "../src/lib/agents/bridge";
import { outputSchemas } from "../src/lib/agents/schemas";
import { SupabaseBridgeStore, makeOrchestrator, queueRun, validationContext } from "../src/lib/agents/supabase-deps";
import { CLASSIC_V1_KEY, STUDIO_AGENT_KEYS, isStudioAgent, type StudioAgentKey } from "../src/lib/studio/agents";
import { load, queueStudioRun, resolveSection, setPipelineMode, stateOf, submitStudio, validateStudio } from "../src/lib/studio/service";
import { declinesOfRow } from "../src/lib/studio/declines-view";
import { branchArticle, branchDelete, fingerprint } from "../src/lib/studio/branch";
import { modeOf } from "../src/lib/team/mode";
import { checkTeam, dumpTeamQueued, queueNextTeam, queueTeamRun, submitTeam, submitTeamDir, teamPlan } from "../src/lib/studio/team-service";
import { teamRoleOfAgentKey, isTeamRole } from "../src/lib/team/bridge";
import { leoAnswerEscalationAs, loadTeamView, raiseTicketBudget, startTeamRun } from "../src/lib/team/store";
import { parseTeamQueueArgs } from "../src/lib/studio/cli-args";
import { confirmApprover, createProposal, syncApprovals } from "../src/lib/studio/proposals";
import { buildProposalPayload } from "../src/lib/studio/proposal-payload";
import { fingerprintV2 } from "../src/lib/studio/fingerprint-v2";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

/** Phase 3e: every open escalation where V1 or Agent 2 could not verify a legal point from the official text and needs Leo's reference. */
async function printReferencesNeeded(articleId: string) {
  const { data } = await db.from("escalations").select("issue_key,reason,reference_needed,created_at").eq("article_id", articleId).eq("status", "OPEN").not("reference_needed", "is", null);
  for (const e of data ?? []) {
    const r = e.reference_needed as { claim: string | null; section: string | null; why: string };
    console.log(`  >> LEO: A REFERENCE IS NEEDED (${e.issue_key}): ${r.why}${r.claim ? ` [claim ${r.claim}]` : ""}${r.section ? ` [${r.section}]` : ""} — upload the official print to the Evidence Library, then: resolve <article> <unit> request_revision "<what changed>"`);
  }
}
const [cmd, a, b, c] = process.argv.slice(2);
const ALL = [...AGENT_KEYS, ...STUDIO_AGENT_KEYS, CLASSIC_V1_KEY] as string[];
const agentKeyOf = (x: string) => (/^[1-7]$/.test(x) ? ALL[Number(x) - 1] : /^v1$/i.test(x) ? CLASSIC_V1_KEY : x);
/** Who runs next on a unit: V1 is the fact gate of a classic unit; Agent 5 only for a unit saved before Phase 3d that has not been touched since. */
const runnerFor = (st: { status: string; gate?: string }): string | undefined => (st.status === "NEEDS_FACT" ? (st.gate === "v1" ? CLASSIC_V1_KEY : "thb-05-fact-privacy-auditor") : RUNNERS[st.status]?.[0]);
const RUNNERS: Record<string, string[]> = { NEEDS_WRITE: ["thb-04-section-writer"], NEEDS_REVISION: ["thb-04-section-writer"], NEEDS_FACT: ["thb-05-fact-privacy-auditor"], NEEDS_SEO: ["thb-06-seo-aeo-geo-auditor"], NEEDS_EDITORIAL: ["thb-07-editorial-critic"] };

/** V1 runs through the classic service when its article is a classic one (the gate), through the team service when the article runs in team mode. */
async function isClassicV1Run(run: { agent_key: string; subject_id: string }): Promise<boolean> {
  if (run.agent_key !== CLASSIC_V1_KEY) return false;
  const { data: art } = await db.from("articles").select("pipeline_mode").eq("id", run.subject_id).single();
  return modeOf(art ?? {}) === "classic";
}

if (cmd === "queue") {
  const agent = agentKeyOf(a);
  if (!ALL.includes(agent)) throw new Error(`unknown agent ${a}`);
  if (isStudioAgent(agent) || agent === CLASSIC_V1_KEY) {
    if (!c) throw new Error("Agents 4-7 and V1 need a unit key (s1, s2, ... or faq)");
    const { runId, duplicate } = await queueStudioRun(db, agent as StudioAgentKey, b, c);
    console.log(`${duplicate ? "existing" : "queued"} run ${runId} (${agent}) for article ${b} unit ${c}`);
  } else {
    const { run, duplicate } = await queueRun(db, agent as AgentKey, b);
    console.log(`${duplicate ? "existing" : "queued"} run ${run.id} (${agent}) for opportunity ${b}`);
  }
} else if (cmd === "plan" || cmd === "queue-next") {
  const L = await load(db, a);
  console.log(`article ${L.article.title} — state ${L.article.state}`);
  await printReferencesNeeded(a);
  for (const s of L.sections) {
    const st = stateOf(s);
    const nextAgent = runnerFor(st);
    const next = nextAgent ? [nextAgent] : undefined;
    console.log(`  ${st.key.padEnd(4)} ${st.status}${st.issues.length ? ` issues=${st.issues.map((i) => `${i.key}(${i.attempts})`).join(",")}` : ""}${st.blockedBy ? ` BLOCKED: ${st.blockedBy}` : ""}${st.escalation ? ` ESCALATED: ${st.escalation.reason}` : ""}${next ? `  -> ${next[0]}` : ""}`);
    if (cmd === "queue-next" && next) {
      try { const { runId, duplicate } = await queueStudioRun(db, next[0] as StudioAgentKey, a, st.key); console.log(`      ${duplicate ? "existing" : "queued"} run ${runId}`); } catch (e) { console.log(`      not queued: ${e instanceof Error ? e.message : e}`); }
    }
  }
} else if (cmd === "dump-queued") {
  // writes every QUEUED Agent 4-7 packet to <dir>/<agent-number>-<unit>-packet.json (the operator hands each file to its subagent)
  const { data: qs } = await db.from("agent_runs").select("id,agent_key,subject_id,task_packet").eq("status", "QUEUED").or(`agent_key.like.thb-0%,agent_key.eq.${CLASSIC_V1_KEY}`);
  for (const r of qs ?? []) {
    if (!isStudioAgent(r.agent_key) && !(await isClassicV1Run(r))) continue;
    const file = `${a}/${r.agent_key.slice(4, 6)}-${r.task_packet.unit_key}-packet.json`;
    writeFileSync(file, JSON.stringify({ run_id: r.id, attempts_used: 0, last_error: null, ...r.task_packet }, null, 2));
    console.log(`${r.id} ${r.agent_key} ${r.task_packet.unit_key} -> ${file}`);
  }
} else if (cmd === "submit-dir") {
  // submits every <nn>-<unit>-out.json in <dir> that has a matching -packet.json (run id comes from the packet), skipping runs already decided
  for (const f of readdirSync(a).filter((x) => x.endsWith("-packet.json")).sort()) {
    const out = `${a}/${f.replace("-packet.json", "-out.json")}`;
    if (!existsSync(out)) { console.log(`${f}: no output yet`); continue; }
    const runId = JSON.parse(readFileSync(`${a}/${f}`, "utf8")).run_id as string;
    const res = await submitStudio(db, runId, readFileSync(out, "utf8"));
    console.log(`${f.replace("-packet.json", "")}: ${res.ok ? `ACCEPTED${res.note ? ` — ${res.note}` : ""}` : `REJECTED (attempt ${res.attempt}/3)${res.final ? " FINAL" : ""}: ${res.errors.slice(0, 4).join(" | ")}`}`);
  }
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
  const { data: run } = await db.from("agent_runs").select("agent_key,subject_id").eq("id", a).single();
  if (teamRoleOfAgentKey(run!.agent_key) && !(await isClassicV1Run(run!))) { console.log("this is a team role run: use  npm run studio -- team-submit <run_id> <file>"); process.exitCode = 2; }
  else if (isStudioAgent(run!.agent_key) || (await isClassicV1Run(run!))) {
    const res = await submitStudio(db, a, readFileSync(b, "utf8"));
    if (res.ok) console.log(`ACCEPTED run ${a}${res.note ? ` — ${res.note}` : ""}`);
    else {
      console.log(`REJECTED run ${a} (attempt ${res.attempt}/3)${res.final ? " — FINAL: article moved to INTEGRATION_ERROR" : " — fix and resubmit"}`);
      for (const e of res.errors.slice(0, 20)) console.log("  -", e);
      process.exitCode = 2;
    }
  } else {
    const orch = makeOrchestrator(db);
    const res = await submitOutput(new SupabaseBridgeStore(db), orch, a, readFileSync(b, "utf8"), validationContext(db));
    if (res.ok) console.log(`ACCEPTED run ${a}`);
    else {
      console.log(`REJECTED run ${a} (attempt ${res.run.retries}/3)${res.final ? " — FINAL: opportunity moved to INTEGRATION_ERROR" : " — fix and resubmit"}`);
      for (const e of res.errors.slice(0, 20)) console.log("  -", e);
      process.exitCode = 2;
    }
  }
} else if (cmd === "check") {
  // Dry run: same validation as submit, but nothing is saved and no attempt is used.
  const { data: row } = await db.from("agent_runs").select("*").eq("id", a).single();
  let errors: string[] = [];
  if (teamRoleOfAgentKey(row!.agent_key) && !(await isClassicV1Run(row!))) errors = await checkTeam(db, a, readFileSync(b, "utf8"));
  else if (isStudioAgent(row!.agent_key) || (await isClassicV1Run(row!))) errors = (await validateStudio(db, a, readFileSync(b, "utf8"))).errors;
  else {
    const run = await new SupabaseBridgeStore(db).getRun(a);
    try {
      const r = outputSchemas[run.agent_key].safeParse(JSON.parse(readFileSync(b, "utf8")));
      if (!r.success) for (const i of r.error.issues) errors.push(`${i.path.join(".") || "(root)"}: ${i.message}`);
      else errors.push(...semanticChecks(run.agent_key, r.data as Record<string, any>, await validationContext(db)(run)));
    } catch (e) { errors.push(`not valid JSON: ${e instanceof Error ? e.message : String(e)}`); }
  }
  console.log(errors.length ? `WOULD REJECT (${errors.length}); attempts used so far: ${row!.retries}/3` : `WOULD ACCEPT (attempts used so far: ${row!.retries}/3)`);
  for (const e of errors.slice(0, 20)) console.log("  -", e);
} else if (cmd === "team-start") {
  console.log(`team run ${await startTeamRun(db, a)} for article ${a}`);
} else if (cmd === "team-plan") {
  const p = await teamPlan(db, a, b);
  console.log(`article ${p.article} — team run ${p.runStatus.toLowerCase().replace(/_/g, " ")}`);
  for (const u of p.units.filter((x) => !b || x.key === b)) console.log(`  ${u.key.padEnd(4)} ${u.status}${u.pending.length ? ` waiting for ${u.pending.join(",")}` : ""}${u.issues ? ` must-fix=${u.issues}` : ""}${u.hedges ? ` unruled-hedges=${u.hedges}` : ""}${u.waitingOn.length ? ` waiting on ${u.waitingOn.join(",")}` : ""}`);
  for (const t of p.tickets.filter((x) => x.status !== "CLOSED")) console.log(`  ticket ${t.id} ${t.type} ${t.from.join("+")}->${t.to} [${t.unitKey || "-"}] ${t.status} round ${t.round}: ${t.issue.slice(0, 80)}`);
  console.log(p.steps.length ? "runnable next:" : "nothing runnable (everything is locked, waiting for Leo, or already queued)");
  for (const st of p.steps) console.log(`  ${st.role}${st.unit ? ` ${st.unit}` : ""}${st.ticketId ? ` ${st.ticketId}` : ""} — ${st.reason}`);
  if (p.queued.length) console.log(`already queued: ${p.queued.map((q) => `${q.role}${q.unit ? ` ${q.unit}` : ""}${q.ticketId ? ` ${q.ticketId}` : ""}`).join(", ")}`);
} else if (cmd === "team-queue-next") {
  const made = await queueNextTeam(db, a, b);
  for (const m of made) console.log(`  ${m.duplicate ? "existing" : "queued"} run ${m.runId} ${m.step.role}${m.step.unit ? ` ${m.step.unit}` : ""}${m.step.ticketId ? ` ${m.step.ticketId}` : ""}`);
  if (!made.length) console.log("nothing to queue");
} else if (cmd === "team-queue") {
  if (!isTeamRole(a)) throw new Error(`unknown team role ${a}`);
  const q = parseTeamQueueArgs(process.argv.slice(2));   // team-queue <role> <article> [unit|-] [ticket]
  const r = await queueTeamRun(db, q.article, a, q.unit, q.ticket);
  console.log(`${r.duplicate ? "existing" : "queued"} run ${r.runId} (${a})`);
} else if (cmd === "team-dump") {
  const lines = await dumpTeamQueued(db, a);
  console.log(lines.length ? lines.join("\n") : "no queued team runs");
} else if (cmd === "team-submit-dir") {
  console.log((await submitTeamDir(db, a)).join("\n"));
} else if (cmd === "team-submit") {
  const res = await submitTeam(db, a, readFileSync(b, "utf8"));
  if (res.ok) console.log(`ACCEPTED run ${a}${res.note ? ` — ${res.note}` : ""}`);
  else { console.log(`REJECTED run ${a} (attempt ${res.attempt}/3)${res.final ? " — FINAL: article moved to INTEGRATION_ERROR" : " — fix and resubmit"}`); for (const e of res.errors.slice(0, 20)) console.log("  -", e); process.exitCode = 2; }
} else if (cmd === "team-check") {
  const errs = await checkTeam(db, a, readFileSync(b, "utf8"));
  console.log(errs.length ? `WOULD REJECT (${errs.length})` : "WOULD ACCEPT");
  for (const e of errs.slice(0, 20)) console.log("  -", e);
} else if (cmd === "team-log") {
  const v = await loadTeamView(db, a);
  if (!v) console.log("no team run yet");
  else {
    console.log(`tickets used ${v.budget.used}/${v.budget.limit}${v.budget.stopped ? " STOPPED" : ""} · run ${v.runStatus}`);
    for (const t of [...v.tickets].reverse()) { console.log(`${t.routerId} ${t.type} ${t.from.join("+")}->${t.to} [${t.unit || "-"}] ${t.status} round ${t.round}/${t.roundLimit}${t.trigger ? ` trigger=${t.trigger}` : ""}: ${t.issue}`); for (const m of t.messages) console.log(`    ${m.at} ${m.role} (r${m.round}): ${m.body.slice(0, 140)}`); }
    console.log(`stuck for Leo: ${v.stuck.length}`);
  }
} else if (cmd === "team-budget") {
  const res = await raiseTicketBudget(db, a, Number(b), process.argv.slice(5).join(" "), "leo");
  console.log(res.ok ? `ticket budget of article ${a} raised ${res.from} -> ${res.to} (recorded as a deliberate exception; the default stays 10)` : `NOT CHANGED: ${res.reason}`);
  if (!res.ok) process.exitCode = 2;
} else if (cmd === "team-answer") {
  const res = await leoAnswerEscalationAs(db, a, b, process.argv.slice(5).join(" "), "leo");
  console.log(res.ok ? `escalation ${b} closed with Leo's answer` : `NOT CLOSED: ${res.reason}`);
  if (!res.ok) process.exitCode = 2;
} else if (cmd === "mode") {
  if (!b) { const { data: art } = await db.from("articles").select("pipeline_mode,branch_of,title").eq("id", a).single(); console.log(`${art?.title}: ${modeOf(art ?? {})}${art?.branch_of ? ` (branch of ${art.branch_of})` : ""}`); }
  else {
    const res = await setPipelineMode(db, a, b, "leo");
    console.log(res.ok ? (res.noop ? `already ${res.mode}` : `article ${a} now runs in ${res.mode} mode`) : `NOT CHANGED: ${res.reason}`);
    if (!res.ok) process.exitCode = 2;
  }
} else if (cmd === "branch") {
  const res = await branchArticle(db, a, { actor: "leo", expectedFindings: Number(b), dryRun: process.argv.includes("--dry-run"), mode: process.argv.includes("--classic") ? "classic" : "team" });
  if (!res.ok) { console.log(`STOPPED: ${res.reason}${res.byUnit ? `\n  findings per unit: ${JSON.stringify(res.byUnit)}` : ""}`); process.exitCode = 2; }
  else if (res.dryRun) console.log(`DRY RUN ok: ${res.findings} findings ${JSON.stringify(res.byUnit)}; would copy ${res.units} units and ${res.claims} claims.\noriginal fingerprint ${res.fingerprint.total}\n${JSON.stringify(res.fingerprint.parts)}`);
  else {
    console.log(`branch ${res.branchId} created: ${res.findings} findings ${JSON.stringify(res.byUnit)}\noriginal fingerprint before ${res.before.total}\noriginal fingerprint after  ${res.after.total}\n${res.changed.length ? `ORIGINAL CHANGED: ${res.changed.join("; ")}` : "original unchanged"}\nisolation: ${res.isolation.ok ? "ok" : `PROBLEMS: ${res.isolation.problems.join("; ")}`} ${JSON.stringify(res.isolation.counts)}`);
    if (res.changed.length || !res.isolation.ok) process.exitCode = 3;
  }
} else if (cmd === "fingerprint") {
  const f = await fingerprint(db, a);
  console.log(`${f.total}\n${Object.entries(f.parts).map(([k, v]) => `  ${k}: ${v.count} rows ${v.hash.slice(0, 12)}`).join("\n")}`);
} else if (cmd === "fingerprint-v2") {
  const f = await fingerprintV2(db, a);
  console.log(`${f.total}\n${Object.entries(f.parts).map(([k, v]) => `  ${k}: ${v.count} rows ${v.hash.slice(0, 12)}`).join("\n")}`);
} else if (cmd === "branch-delete") {
  const res = await branchDelete(db, a, { actor: "leo", yes: process.argv.includes("--yes") });
  console.log(res.ok ? `branch ${a} deleted: ${res.summary}\n${res.originalChanged?.length ? `ORIGINAL CHANGED: ${res.originalChanged.join("; ")}` : "original fingerprint unchanged"}` : `NOT DELETED: ${res.reason}`);
  if (!res.ok || res.originalChanged?.length) process.exitCode = 2;
} else if (cmd === "runs") {
  const { data } = await db.from("agent_runs").select("id,agent_key,subject_id,status,retries,created_at,task_packet").order("created_at");
  for (const r of data ?? []) console.log(`${r.id} ${r.agent_key} ${r.status} retries=${r.retries} ${r.task_packet?.unit_key ? `unit=${r.task_packet.unit_key} ` : ""}subject=${r.subject_id}`);
} else if (cmd === "declines") {
  const L = await load(db, a);
  let n = 0;
  for (const s of L.sections) {
    const d = declinesOfRow(s);
    for (const x of d.declined) { n++; console.log(`${s.section_key}  DECLINED ${x.key} (raised ${x.raised}x, by ${x.role}): ${x.text}
      writer's reason: ${x.reason}`); }
    for (const x of d.open) console.log(`${s.section_key}  open ${x.key} (${x.role}, ${x.severity}): ${x.text}`);
  }
  console.log(`${n} decline(s) in total`);
} else if (cmd === "article") {
  const L = await load(db, a);
  console.log(`${L.article.title}\n  slug ${L.article.slug} · state ${L.article.state} · version ${L.article.version_hash?.slice(0, 12) || "none"} · approved ${L.article.approved_hash?.slice(0, 12) || "no"}`);
  for (const s of L.sections) console.log(`  ${s.section_key}: ${s.status}`);
  for (const [id, cl] of L.claims) console.log(`  claim ${id}: ${cl.support} ${cl.risk}${cl.lockedText ? " (locked)" : ""}${cl.verification?.label ? ` ${cl.verification.label} (reader impact ${cl.verification.readerImpact ?? "?"})` : cl.risk === "high" ? " NO LEGAL VERIFICATION RECORD" : ""}`);
  await printReferencesNeeded(a);
} else if (cmd === "resolve") {
  const kind = c as "request_revision" | "reopen" | "hold" | "v1_gate"; // argv: resolve <article> <unit> <kind> [text]
  const text = process.argv.slice(6).join(" ").trim();
  if (!["request_revision", "reopen", "hold", "v1_gate"].includes(kind)) throw new Error("kind must be request_revision, reopen, hold or v1_gate");
  const res = await resolveSection(db, a, b, kind === "hold" ? { kind: "hold" } : kind === "v1_gate" ? { kind: "v1_gate" } : { kind, text }, "leo");
  console.log(res.ok ? `${b} is now ${res.status}` : `REFUSED: ${res.reason}`);
  if (!res.ok) process.exitCode = 2;
} else if (cmd === "voice-approve") {
  const { data: vr } = await db.from("brand_facts").select("status,fact_value").eq("fact_key", "voice_reference").single();
  if (!vr || /^NEEDED/.test(vr.fact_value)) throw new Error("no voice reference built yet (npx tsx --env-file=.env.local scripts/build-voice-reference.mts)");
  await db.from("brand_facts").update({ provisional_by: "leo", provisional_at: new Date().toISOString() }).eq("fact_key", "voice_reference");
  await db.from("audit_events").insert({ actor: "leo", subject_type: "brand_fact", subject_id: "voice_reference", event_type: "voice_reference_provisionally_approved", accepted: true, detail: { note: "provisional; Juan confirms in the Approval Room with the first article" } });
  console.log("voice_reference provisionally approved by leo (status stays 'proposed' until Juan confirms)");
} else if (cmd === "proposal") {
  const p = await createProposal(db, a, "leo");
  const payload = await buildProposalPayload(db, p.id);
  writeFileSync(b, JSON.stringify(payload, null, 1));
  console.log(`proposal ${p.id} created; payload written to ${b}`);
} else if (cmd === "sync-approvals") {
  const records = JSON.parse(readFileSync(a, "utf8"));
  const rep = await syncApprovals(db, records);
  console.log(JSON.stringify(rep, null, 1));
} else if (cmd === "approvers") {
  const { data } = await db.from("approver_registry").select("*").order("first_seen_at");
  for (const r of data ?? []) console.log(`${r.viewer_id}  name="${r.display_name}"  ${r.status}${r.role ? ` ${r.role}` : ""}${r.label ? ` (${r.label})` : ""}`);
  if (!data?.length) console.log("no accounts have clicked in the Approval Room yet");
} else if (cmd === "confirm-approver") {
  const res = await confirmApprover(db, a, b as "approver" | "secondary" | "operator", c ?? "", "leo");
  console.log(res.ok ? `confirmed ${a} as ${b} (${c})` : `REFUSED: ${res.error}`);
  if (!res.ok) process.exitCode = 2;
} else {
  console.log("commands: queue | plan | queue-next | packet | submit | check | runs | article | voice-approve | proposal | sync-approvals | approvers | confirm-approver");
}
