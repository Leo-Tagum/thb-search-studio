/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 3c task 12 live smoke. FIXTURE ONLY: a throwaway team-mode article is driven through the same functions the operator CLI uses
// (team-plan, team-queue-next, team-queue, team-dump, team-submit-dir) with scripted role outputs written to files, exactly as /thb-run-agent would.
// One unit goes: W1 writes -> W2 suggests -> council (V1 rules on a hedge sentence and blocks; V2 + V3 raise the same issue, merged by wording)
// -> W1 revises, answers the corrections and asks R2 for evidence -> R2 answers -> council passes -> locked by code. It ends by checking the router
// log is complete for every ticket. Everything is removed afterwards; audit_events are append-only and stay. Nothing here touches WordPress.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { approveBrief, load, setPipelineMode } from "../src/lib/studio/service";
import { dumpTeamQueued, envelopeOf, queueNextTeam, queueTeamRun, submitTeamDir, teamPlan } from "../src/lib/studio/team-service";
import { loadRouter, loadTeamView, startTeamRun } from "../src/lib/team/store";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const fail = (m: string): never => { throw new Error(`SMOKE FAILED: ${m}`); };
const expect = (c: unknown, m: string) => { if (!c) fail(m); };
const real = (await db.from("briefs").select("outline,evidence_packet").eq("opportunity_id", "1d78c9e3-6b2d-4434-88ed-56b905e67c24").single()).data!;
const P = "https://www.twinhomebuyer.com/";
let opp = "", art = "";
const UNIT = "s2";
const dir = mkdtempSync(join(tmpdir(), "team-cli-smoke-"));
const out: Record<string, unknown> = {};

const dataOf = (p: any) => { const b = p.untrusted_data_block as string; return JSON.parse(b.slice(b.indexOf("\n") + 1, b.lastIndexOf("\n<<<END"))); };
const env = (role: string, p: any, decision: string, result: any, extra: Record<string, unknown> = {}) => ({
  article_id: p.article_id, opportunity_id: p.opportunity_id, agent_name: role, agent_prompt_version: "1.0.0", model_version: "claude-code/smoke-script", input_version_ids: p.input_version_ids,
  decision, findings: [], evidence_ids: [], required_actions: [], output_version_id: `smoke-${Date.now()}-${Math.random()}`, timestamp: new Date().toISOString(), result, ...extra,
});
const card = (from: string, to: string, ticket: string, o: Record<string, unknown> = {}) => ({ ticket, from: [from], to, section: UNIT, issue: "One issue.", severity: "must fix", evidence: "rule or id", fix: null, blocking: false, ...o });
const req = (key: string, note: string) => ({ issue_key: key, severity: "required", note });

// ---- the unit text: v1 has a hedge sentence and a buried answer; v2 fixes both ----
const unitV = (h2: string, version: 1 | 2) => ({
  kind: "section", key: UNIT, h2, roles: [], claim_ids: [],
  blocks: [
    { t: "p", text: version === 1
      ? "Before anything else, find out who holds title and who can sign. That might be one owner, a trust, an estate or several heirs, and each one changes the steps. See [legal authority to sell inherited property](" + P + "inherited-property-bay-area-legal-authority-to-sell/)."
      : "You can sell the house only when the person signing has the legal authority to do so, so start by finding out who holds title. That might be one owner, a trust, an estate or several heirs, and each one changes the steps. See [legal authority to sell inherited property](" + P + "inherited-property-bay-area-legal-authority-to-sell/)." },
    { t: "p", text: version === 1 ? "If someone is still living in the house, make them part of the decision. Most owners never check what a buyer will actually pay for the contents." : "If someone is still living in the house, make them part of the decision. Respect matters here, and so does time." },
    { t: "note", text: "Confirm who can sign with a probate attorney or your title company." },
  ],
});

/** The scripted agents: read each queued packet, write its -out.json. */
function runScriptedAgents(round: { writer: 1 | 2; council: 1 | 2 }) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith("-packet.json"))) {
    const p = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const d = dataOf(p);
    const h2 = d.brief_for_this_unit?.h2 ?? "";
    const base = { unit_key: UNIT, version_hash: d.current_version?.version_hash };
    let o: any;
    if (p.role === "W1") {
      const addresses = (d.open_corrections ?? []).map((c: any) => c.key);
      o = env("W1 Writer", p, "PASS", { unit_key: UNIT, addresses, change_note: round.writer === 1 ? "first version" : "answered the corrections: answer first, hedge sentence removed", unit: unitV(h2, round.writer), tickets: round.writer === 2 ? [card("W1", "R2", "EVIDENCE_REQUEST", { issue: "How do sellers phrase the authority-to-sell question when they search?", severity: "should fix", evidence: "the brief has no search-wording data" })] : [] });
    } else if (p.role === "W2") {
      o = env("W2 Co-writer", p, "PASS", { ...base, suggestions: [{ id: "w2:answer-first", area: "angle", issue: "The first paragraph buries the answer to the heading.", suggestion: "Lead with who must sign before the list of owner types." }] });
    } else if (p.role === "V1") {
      const flags = d.hedge_flags ?? [];
      const bad = round.council === 1;
      o = env("V1 Fact and Privacy", p, bad ? "REVISION" : "PASS", { ...base, claim_checks: [], privacy_ok: true, legal_qualification_ok: true, cards: bad ? [card("V1", "W1", "QUALITY_CORRECTION", { key: "fact:hedge-owners", issue: "Most owners never check what a buyer will pay is an unsourced generalization.", evidence: "hedge flag; no ledger claim", fix: "Say what a buyer actually checks, or drop the sentence.", blocking: true })] : [], hedge_rulings: bad ? flags.map((h: any) => ({ key: h.key, ruling: "reword", note: "no source says what most owners do" })) : [] },
        { findings: bad ? [req("fact:hedge-owners", "unsourced generalization about owners")] : [] });
    } else if (p.role === "V2") {
      const bad = round.council === 1;
      o = env("V2 SEO/AEO/GEO", p, bad ? "REVISION" : "PASS", { ...base, checks: { direct_answer_near_start: !bad, question_h2: true, local_modifiers_true_and_useful: true, keyword_natural_not_forced: true, short_direct_faq: true, citation_ready: true }, tested_http_or_schema: false, cards: bad ? [card("V2", "W1", "QUALITY_CORRECTION", { key: "seo:direct-answer", issue: "The opening does not answer the heading question directly.", evidence: "AEO: direct answer near the start", fix: "Answer who must sign in the first sentence." })] : [] },
        { findings: bad ? [req("seo:direct-answer", "the first sentence does not answer the H2")] : [] });
    } else if (p.role === "V3") {
      const bad = round.council === 1;
      o = env("V3 Editorial Critic", p, bad ? "REVISION" : "PASS", { ...base, voice_reference_used: true, copy_paste_test: { passed: true, flagged: [] }, authenticity: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`q${i + 1}`, true])), score: { voice: 16, education: 16, deal_logic: 16, local: 11, structure: 11, trust: 8, total: 78 }, cards: bad ? [card("V3", "W1", "QUALITY_CORRECTION", { key: "ed:opening", issue: "Opening does not answer the heading question directly.", evidence: "authenticity q9", fix: "Start with the answer a homeowner is looking for." })] : [] },
        { findings: bad ? [req("ed:opening", "the opening does not answer what the homeowner is asking")] : [] });
    } else if (p.role === "R2") {
      const q = d.candidate_packet.queries[0];
      o = env("R2 Search", p, "PASS", { ticket_id: p.ticket_id, window: d.candidate_packet.window, demand: [{ query: q.query, impressions: q.impressions, clicks: q.clicks, position: q.position, page: null, evidence_id: `q:${q.query}`, use: "strategy_only" }], questions: [], rankings: [], unresolved: [] },
        { findings: [{ claim: "stored demand row for the main query", basis: "gsc_data", evidence_ids: [`q:${q.query}`] }], evidence_ids: [`q:${q.query}`] });
    } else fail(`no scripted answer for ${p.role}`);
    writeFileSync(join(dir, f.replace("-packet.json", "-out.json")), JSON.stringify(o));
  }
}

async function cycle(label: string, round: { writer: 1 | 2; council: 1 | 2 }, extraQueue: (() => Promise<unknown>)[] = []) {
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir);
  const made = await queueNextTeam(db, art, UNIT);
  for (const f of extraQueue) await f();
  const lines = await dumpTeamQueued(db, dir);
  runScriptedAgents(round);
  const res = await submitTeamDir(db, dir);
  console.log(`-- ${label}: queued ${made.map((m) => m.step.role).join(",") || "-"} | ${res.map((r) => r.replace(/^[^:]+: /, "").slice(0, 110)).join(" || ")}`);
  expect(lines.length > 0, `${label}: nothing was dumped`);
  expect(res.every((r) => r.includes("ACCEPTED")), `${label}: ${res.join(" / ")}`);
  return res;
}

try {
  opp = (await db.from("opportunities").insert({ title: "SMOKE team CLI fixture (delete me)", state: "BRIEF_REVIEW", human_decision: "approve", version_hash: "smoke" }).select("id").single()).data!.id;
  await db.from("briefs").insert({ opportunity_id: opp, outline: real.outline, evidence_packet: real.evidence_packet, notes: "smoke fixture" });
  // the fixture opportunity needs the candidate packet (GSC rows) R2 reads
  const origPacket = (await db.from("opportunities").select("packet,agent_decision").eq("id", "1d78c9e3-6b2d-4434-88ed-56b905e67c24").single()).data!;
  await db.from("opportunities").update({ packet: origPacket.packet, agent_decision: origPacket.agent_decision }).eq("id", opp);
  const ab = await approveBrief(db, opp, "smoke-test");
  if (!ab.ok) fail(ab.reason);
  art = (ab as any).articleId;
  await db.from("articles").update({ is_fixture: true }).eq("id", art);   // only a fixture article accepts the "smoke-test" actor
  expect((await setPipelineMode(db, art, "team", "smoke-test")).ok, "could not switch the fixture to team mode");
  const runId = await startTeamRun(db, art);

  // plan: an unwritten unit needs W1 and nothing else
  const plan0 = await teamPlan(db, art, UNIT);
  expect(plan0.steps.length === 1 && plan0.steps[0].role === "W1", `plan 0 wrong: ${JSON.stringify(plan0.steps)}`);

  // a malformed output is rejected without losing the run: attempt 1 of 3, then the real output is accepted
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir);
  await queueNextTeam(db, art, UNIT);
  await dumpTeamQueued(db, dir);
  const pf = readdirSync(dir).find((f) => f.endsWith("-packet.json"))!;
  writeFileSync(join(dir, pf.replace("-packet.json", "-out.json")), "{ not json");
  const bad = await submitTeamDir(db, dir);
  expect(bad[0].includes("REJECTED (attempt 1/3)"), `malformed output not rejected on attempt 1: ${bad[0]}`);
  runScriptedAgents({ writer: 1, council: 1 });
  const good = await submitTeamDir(db, dir);
  expect(good[0].includes("ACCEPTED"), `W1 v1 not accepted: ${good[0]}`);

  // after W1 v1: hedge flagged by code, V1 scoped to the full unit; queue W2 explicitly and the council from the plan
  let env1 = envelopeOf((await load(db, art)).sections.find((s) => s.section_key === UNIT));
  expect(env1.team.status === "NEEDS_COUNCIL" && env1.team.hedges.length === 1 && env1.team.v1Scope?.kind === "full", `after W1 v1: ${env1.team.status}, ${env1.team.hedges.length} hedge(s)`);
  await cycle("council round 1 (+ W2)", { writer: 1, council: 1 }, [() => queueTeamRun(db, art, "W2", UNIT, null)]);
  env1 = envelopeOf((await load(db, art)).sections.find((s) => s.section_key === UNIT));
  expect(env1.team.status === "NEEDS_REVISION", `after council round 1 the unit is ${env1.team.status}`);
  expect(env1.team.mustFix.length >= 3, `expected V1, hedge, V2 and V3 must-fixes, got ${env1.team.mustFix.map((m) => m.key).join()}`);
  expect(env1.suggestions?.items.length === 1, "W2 suggestions not stored");
  let router = (await loadRouter(db, runId)).state;
  expect(router.tickets.length === 2, `expected 2 tickets after round 1 (V1 card, merged V2+V3 card), got ${router.tickets.map((t) => `${t.id}:${t.key}`).join()}`);
  const merged = router.tickets.find((t) => t.from.length === 2)!;
  expect(merged && merged.from.join() === "V2,V3" && merged.mergedFrom.length === 2, "the V2 and V3 cards were not merged into one ticket with links to both originals");
  const { data: originals } = await db.from("ticket_messages").select("id,role,body").in("id", merged.mergedFrom);
  expect((originals ?? []).length === 2 && (originals ?? []).every((m) => JSON.parse(m.body).original_card), "the original cards are not stored behind the merged ticket");

  // W1 revises (answers the corrections, asks R2 for evidence); R2 answers
  await cycle("W1 revision", { writer: 2, council: 1 });
  await cycle("R2 answers + council round 2", { writer: 2, council: 2 });
  env1 = envelopeOf((await load(db, art)).sections.find((s) => s.section_key === UNIT));
  const left = await teamPlan(db, art, UNIT);
  out.afterRound2 = { status: env1.team.status, steps: left.steps.map((s) => `${s.role}${s.ticketId ? " " + s.ticketId : ""}`) };
  expect(env1.team.status === "LOCKED", `the unit is ${env1.team.status}, not LOCKED; plan: ${JSON.stringify(left.steps)}`);
  expect(left.steps.length === 0, `something is still runnable after the lock: ${JSON.stringify(left.steps)}`);

  // the router log is complete for every ticket
  router = (await loadRouter(db, runId)).state;
  const view = (await loadTeamView(db, art))!;
  expect(router.tickets.length === 3, `expected 3 tickets (V1 card, merged V2+V3 card, W1 evidence request), got ${router.tickets.map((t) => `${t.id}:${t.type}`).join()}`);
  for (const t of router.tickets) {
    const msgs = view.tickets.find((x) => x.routerId === t.id)!.messages.filter((m) => !m.body.startsWith('{"original_card"'));
    expect(t.status === "CLOSED" && !!t.resolution, `${t.id} is ${t.status}, resolution ${t.resolution}`);
    expect(msgs.length >= 3, `${t.id} has only ${msgs.length} logged message(s)`);
    expect(msgs[0].role === t.from.join("+"), `${t.id} first message is by ${msgs[0].role}, not ${t.from.join("+")}`);
    expect(msgs.some((m) => m.role === t.to), `${t.id} has no reply from ${t.to}`);
    expect(msgs[msgs.length - 1].role === "ORCHESTRATOR", `${t.id} was not closed by code: last by ${msgs[msgs.length - 1].role}`);
    expect(msgs.every((m, i) => i === 0 || msgs[i - 1].at <= m.at), `${t.id} log is out of order`);
    expect(t.versionHash.length > 0, `${t.id} has no version`);
  }
  expect(router.tickets.find((t) => t.type === "EVIDENCE_REQUEST")!.to === "R2", "the evidence request did not go to R2");
  expect(view.budget.used === 3 && view.stuck.length === 0, `budget/stuck wrong: ${JSON.stringify(view.budget)}, stuck ${view.stuck.length}`);
  const { data: audit } = await db.from("audit_events").select("event_type").eq("subject_id", art);
  const kinds = new Set((audit ?? []).map((a) => a.event_type));
  for (const k of ["team_run_queued", "agent_run_submitted", "section_version", "section_review", "co_writer_suggestions"]) expect(kinds.has(k) || (k === "agent_run_submitted" && kinds.has("agent_run_submitted")), `audit event ${k} missing`);
  const { data: runs } = await db.from("agent_runs").select("agent_key,status,retries").eq("subject_id", art);
  out.runs = Object.fromEntries(Object.entries((runs ?? []).reduce((acc: Record<string, number>, r) => { acc[`${r.agent_key}:${r.status}`] = (acc[`${r.agent_key}:${r.status}`] ?? 0) + 1; return acc; }, {})));
  out.tickets = router.tickets.map((t) => `${t.id} ${t.type} ${t.from.join("+")}->${t.to} ${t.status} round ${t.round}${t.mergedFrom.length ? ` merged-from ${t.mergedFrom.length}` : ""}`);
  out.logRows = view.tickets.reduce((n, t) => n + t.messages.length, 0);
  console.log(JSON.stringify(out, null, 1));
  console.log("TEAM CLI SMOKE PASSED");
} finally {
  rmSync(dir, { recursive: true, force: true });
  try {
    if (art) {
      const { data: ts } = await db.from("tickets").select("id").eq("article_id", art);
      const ids = (ts ?? []).map((t) => t.id);
      if (ids.length) { await db.from("tickets").update({ parent_ticket_id: null }).in("id", ids); await db.from("ticket_messages").delete().in("ticket_id", ids); await db.from("tickets").delete().in("id", ids); }
      await db.from("team_runs").delete().eq("article_id", art);
      const { data: secs } = await db.from("article_sections").select("id").eq("article_id", art);
      const sids = (secs ?? []).map((s) => s.id);
      await db.from("article_sections").update({ current_version_id: null, locked_version_id: null }).in("id", sids);
      await db.from("section_reviews").delete().in("section_id", sids);
      await db.from("escalations").delete().eq("article_id", art);
      await db.from("section_versions").delete().in("section_id", sids);
      await db.from("article_sections").delete().in("id", sids);
      await db.from("claims").delete().eq("article_id", art);
      await db.from("agent_runs").delete().eq("subject_id", art);
      await db.from("articles").delete().eq("id", art);
    }
    if (opp) { await db.from("decisions").delete().eq("opportunity_id", opp); await db.from("briefs").delete().eq("opportunity_id", opp); await db.from("agent_runs").delete().eq("subject_id", opp); await db.from("opportunities").delete().eq("id", opp); }
    console.log("cleanup done");
  } catch (e) { console.error("CLEANUP PROBLEM:", e); process.exitCode = 1; }
}
