/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 3c task 11 live smoke. FIXTURE ONLY: a throwaway team-mode article is driven through the persisted ticket router: a resolved ticket, a round-limit
// escalation, an agent escalation, a refused card, the ticket budget (10) and its limit hit, and Leo closing an escalation. The Team tab's view model
// (the same function the page renders) must show each of them. Everything is removed afterwards; audit_events are append-only and stay (actors "team:*", "smoke-test").
// Nothing here touches WordPress.
import { createClient } from "@supabase/supabase-js";
import { approveBrief, load, setPipelineMode } from "../src/lib/studio/service";
import { closeTicket, raiseTicket, reopen, respond } from "../src/lib/team/router";
import { leoAnswerEscalation, loadRouter, loadTeamView, runRouterOp, startTeamRun } from "../src/lib/team/store";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const fail = (m: string): never => { throw new Error(`SMOKE FAILED: ${m}`); };
const expect = (c: unknown, m: string) => { if (!c) fail(m); };
const real = (await db.from("briefs").select("outline,evidence_packet").eq("opportunity_id", "1d78c9e3-6b2d-4434-88ed-56b905e67c24").single()).data!;
let opp = "", art = "", run = "";
let n = 0;
const ctx = () => ({ at: new Date(Date.now() + ++n).toISOString(), versionHash: "smoke" });
const card = (o: Record<string, unknown> = {}) => ({ ticket: "QUALITY_CORRECTION", from: ["V3"], to: "W1", section: "s2", issue: "The H1 does not name the seller situation.", severity: "must fix", evidence: "authenticity q1", fix: null, blocking: false, ...o });
const op = (f: Parameters<typeof runRouterOp>[3]) => runRouterOp(db, art, run, f);
const out: Record<string, unknown> = {};

try {
  opp = (await db.from("opportunities").insert({ title: "SMOKE team fixture (delete me)", state: "BRIEF_REVIEW", human_decision: "approve", version_hash: "smoke" }).select("id").single()).data!.id;
  await db.from("briefs").insert({ opportunity_id: opp, outline: real.outline, evidence_packet: real.evidence_packet, notes: "smoke fixture" });
  const ab = await approveBrief(db, opp, "smoke-test");
  if (!ab.ok) fail(ab.reason);
  art = (ab as any).articleId;
  await db.from("articles").update({ is_fixture: true }).eq("id", art);   // only a fixture article accepts the "smoke-test" actor
  expect((await setPipelineMode(db, art, "team", "smoke-test")).ok, "could not switch the fixture to team mode");
  run = await startTeamRun(db, art);
  expect((await startTeamRun(db, art)) === run, "a second start created another run");

  // 1. a ticket that resolves: raise -> answer -> close
  const a = await op((s) => raiseTicket(s, card(), ctx()));
  expect(a.ok && a.dbTicketId, "ticket A not stored");
  await op((s) => respond(s, "T1", "W1", "Reworded the H1 to name the situation.", ctx()));
  await op((s) => closeTicket(s, "T1", "V3", "accepted", ctx()));

  // 2. a ticket that hits the round limit: round 2 allowed, round 3 refused and escalated to Leo
  await op((s) => raiseTicket(s, card({ section: "s3", issue: "The example is generic and fits any investor site." }), ctx()));
  await op((s) => respond(s, "T2", "W1", "Made the example specific.", ctx()));
  await op((s) => reopen(s, "T2", "V3", "Still generic.", ctx()));
  await op((s) => respond(s, "T2", "W1", "Reworded again.", ctx()));
  const limit = await op((s) => reopen(s, "T2", "V3", "Still not right.", ctx()));
  expect(!limit.ok && limit.escalationDbId, "the round limit did not escalate");

  // 3. an agent escalation (V1 -> Leo, legal point uncertain) and a refused card (V2 may not block)
  const esc = await op((s) => raiseTicket(s, card({ ticket: "HUMAN_ESCALATION", from: ["V1"], to: "LEO", section: "s4", issue: "Whether the lien notice applies is uncertain.", severity: "must fix", evidence: "no official source found", fix: "Drop the sentence unless R1 finds a source." }), ctx(), { trigger: "legal_uncertain" }));
  expect(esc.ok, "agent escalation not stored");
  const refused = await op((s) => raiseTicket(s, card({ from: ["V2"], blocking: true, section: "s5" }), ctx()));
  expect(!refused.ok, "a V2 blocking card was accepted");

  // 4. fill the budget: tickets 3..10, then the 11th is refused, the article stops, and Leo gets an escalation
  for (let i = 3; i <= 10; i++) { const r = await op((s) => raiseTicket(s, card({ section: "s6", issue: `Smoke issue number ${i} about the keyword placement.` }), ctx())); expect(r.ok, `ticket ${i} refused`); }
  const eleventh = await op((s) => raiseTicket(s, card({ section: "s6", issue: "Smoke issue number 11 about the keyword placement." }), ctx()));
  expect(!eleventh.ok && eleventh.escalationDbId, "ticket 11 did not stop the article and escalate");
  const afterStop = await op((s) => raiseTicket(s, card({ section: "s7", issue: "A twelfth issue after the stop." }), ctx()));
  expect(!afterStop.ok, "a ticket was accepted after the budget stop");

  // the page's data: budget, ticket, limit hit, escalation, outcomes
  const v = (await loadTeamView(db, art))!;
  expect(v.budget.used === 10 && v.budget.limit === 10 && v.budget.stopped && v.runStatus === "STOPPED_BUDGET", `budget bar wrong: ${JSON.stringify(v.budget)} ${v.runStatus}`);
  expect(v.stuck.map((x) => x.trigger).sort().join() === "budget_limit,legal_uncertain,round_limit", `stuck inbox wrong: ${v.stuck.map((x) => x.trigger).join()}`);
  const lim = v.stuck.find((x) => x.trigger === "round_limit")!;
  expect(lim.positions.some((p) => p.label === "Sender still disagrees") && lim.positions.some((p) => p.label.startsWith("Answer")) && /reviewer's position/.test(lim.recommendation), "round-limit positions or recommendation missing");
  expect(v.stuck.find((x) => x.trigger === "legal_uncertain")!.recommendation.includes("V1 suggests: Drop the sentence"), "agent escalation suggestion missing");
  const u2 = v.units.find((u) => u.key === "s2")!, u3 = v.units.find((u) => u.key === "s3")!;
  expect(u2.resolved === 1 && u2.open === 0, `unit s2 outcome wrong: ${JSON.stringify(u2)}`);
  expect(u3.escalations >= 1 && u3.outcome === "escalated to Leo", `unit s3 outcome wrong: ${JSON.stringify(u3)}`);
  expect(v.tickets.find((t) => t.routerId === "T2")!.messages.length >= 5, "the discussion is not stored for the click-to-open view");
  expect(v.fired.types.QUALITY_CORRECTION === 10 && v.fired.types.HUMAN_ESCALATION === 3, `ticket-type counts wrong: ${JSON.stringify(v.fired.types)}`);
  const { data: refusals } = await db.from("audit_events").select("event_type,accepted").eq("subject_id", art).in("event_type", ["team_refuse", "team_stop"]);
  expect((refusals ?? []).length >= 3, "refusals and the stop were not audited");

  // 5. only Leo answers an escalation: a role is refused (and the refusal is logged), Leo's answer closes it and takes it out of the inbox
  const budgetEsc = v.stuck.find((x) => x.trigger === "budget_limit")!;
  const roleTry = await op((s) => respond(s, budgetEsc.routerId, "W1", "I approve this.", ctx()));
  expect(!roleTry.ok, "a role answered a Leo escalation");
  const closed = await leoAnswerEscalation(db, art, budgetEsc.dbId, "Accept the draft with the open items listed.");
  expect(closed.ok, `Leo could not close the escalation: ${JSON.stringify(closed)}`);
  expect((await leoAnswerEscalation(db, art, budgetEsc.dbId, "again")).ok === false, "a closed escalation was answered twice");
  const v2 = (await loadTeamView(db, art))!;
  expect(v2.stuck.length === 2 && !v2.stuck.some((x) => x.trigger === "budget_limit"), "the closed escalation is still in the inbox");

  // 6. the stored state reloads exactly (the router sees the same tickets after a restart)
  const { state } = await loadRouter(db, run);
  expect(state.tickets.length === 13 && state.tickets[1].round === 2 && state.tickets[1].status === "ESCALATED", `reload mismatch: ${state.tickets.length} tickets`);
  expect((await load(db, art)).article.pipeline_mode === "team", "the fixture is not a team article");

  out.budget = v.budget; out.stuck = v.stuck.map((x) => `${x.unit}: ${x.trigger}`); out.units = v.units.filter((u) => ["s2", "s3", "s4"].includes(u.key)).map((u) => `${u.key}: ${u.outcome} (resolved ${u.resolved}, open ${u.open}, escalations ${u.escalations}, V1 ${u.v1})`);
  out.firedTypes = v.fired.types; out.afterLeo = { stuck: v2.stuck.length };
  console.log(JSON.stringify(out, null, 1));
  console.log("TEAM VIEW SMOKE PASSED");
} finally {
  try {
    if (art) {
      const { data: ts } = await db.from("tickets").select("id").eq("article_id", art);
      const ids = (ts ?? []).map((t) => t.id);
      if (ids.length) {
        await db.from("tickets").update({ parent_ticket_id: null }).in("id", ids);
        await db.from("ticket_messages").delete().in("ticket_id", ids);
        await db.from("tickets").delete().in("id", ids);
      }
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
