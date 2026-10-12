/* eslint-disable @typescript-eslint/no-explicit-any -- DB JSON columns and agent outputs are validated by zod / checks at the boundary */
// Phase 3c task 12: the team runtime on Supabase. Plans what can run next, queues role packets, validates and applies submissions, and keeps the
// section loop (team/loop.ts), the ticket router (team/router.ts via team/store.ts) and the claim ledger consistent. Only code moves state:
// no role output sets a lock, an approval or a state, and nothing here can resolve a section: that stays Leo's action.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { auditArticle, advanceArticle, blockArticleFor, load, MONEY_URL, orchestratorFor, safeJson, todayISO, voiceUsable, type Loaded } from "./service";
import { checkUnit } from "./checks";
import { contentHash, sha256 } from "./hash";
import { materialSig } from "./tokens";
import { unitClaimIds, unitText, type Unit } from "./schema";
import { buildTeamPacket, submitTeamOutput, teamPromptVersion, teamRoleOfAgentKey, TEAM_AGENT_FILE, type TeamCtx, type TeamPacket, type TeamRun, type TeamRunStore } from "../team/bridge";
import { combineFeedback, type CouncilItem } from "../team/council";
import { claimRow, packSummary, remapClaimKeys, supportedClaims, type PackClaim, type PackSource } from "../team/ledger";
import { needsRuling } from "./hedge-rulings";
import { applyDeterministic, briefRevised, declineMany, newTeamSection, recordReview, recordVersion, type CouncilRole, type TeamSectionState } from "../team/loop";
import { modeOf, pipelineGuard } from "../team/mode";
import { planSteps, type PlanStep } from "../team/plan";
import { closeTicket, raiseTicket, reopen, respond, runStatus, type Result, type RouterState, type TicketRec } from "../team/router";
import { dbSnapshotStore } from "../team/snapshot-db";
import { fulfillFetchRequest, officialFetcher, type Fetcher } from "../team/snapshots";
import { envelopeOf, saveEnvelope, type CouncilStored, type Envelope } from "./team-envelope";
import { loadRouter, runRouterOp, startTeamRun } from "../team/store";
import { briefSchema, resolveRootCause, type ApprovedIdentity } from "../team/strategy";
import type { FeedbackCard, TeamRole } from "../team/tickets";

const TEAM_KEYS: string[] = Object.values(TEAM_AGENT_FILE);

// ---------- section envelope (the team loop state lives in article_sections.issues; see team-envelope.ts) ----------
export { envelopeOf };
export type { Envelope, CouncilStored };

/** R1 reads official pages through this fetcher (the official-domain allowlist is checked on every hop). The live smoke swaps in a fixture fetcher; nothing else does. */
let r1Fetcher: Fetcher | null = null;
export const setR1FetcherForTests = (f: Fetcher | null) => { r1Fetcher = f; };

// ---------- context ----------
type T = { db: SupabaseClient; articleId: string; runId: string; L: Loaded };
let lastMs = 0;
/** Strictly increasing timestamps, so the log of one run always sorts in the order things happened. */
const stamp = (versionHash = "") => { lastMs = Math.max(Date.now(), lastMs + 1); return { at: new Date(lastMs).toISOString(), versionHash }; };
async function open(db: SupabaseClient, articleId: string): Promise<T> {
  const L = await load(db, articleId);
  if (modeOf(L.article) !== "team") throw new Error("this article runs in classic mode; team runs need a team-mode article");
  return { db, articleId, runId: await startTeamRun(db, articleId), L };
}
const op = (t: T, f: (s: RouterState) => Result) => runRouterOp(t.db, t.articleId, t.runId, f);
const routerOf = async (t: T) => (await loadRouter(t.db, t.runId)).state;
const raise = (t: T, card: FeedbackCard, hash: string, opts: { trigger?: any; mergedFrom?: string[] } = {}) => op(t, (s) => raiseTicket(s, card, stamp(hash), opts));
const row = (t: T, unit: string) => { const r = t.L.sections.find((s) => s.section_key === unit); if (!r) throw new Error(`no unit ${unit}`); return r; };
const currentVersion = async (db: SupabaseClient, r: any) => (r.current_version_id ? (await db.from("section_versions").select("*").eq("id", r.current_version_id).single()).data : null);

// ---------- plan, queue ----------
async function queuedRuns(db: SupabaseClient, articleId: string) {
  const { data } = await db.from("agent_runs").select("id,agent_key,task_packet").eq("subject_id", articleId).eq("status", "QUEUED").in("agent_key", TEAM_KEYS);
  return (data ?? []).map((r: any) => ({ id: r.id as string, role: teamRoleOfAgentKey(r.agent_key)!, unit: (r.task_packet?.unit_key ?? null) as string | null, ticketId: (r.task_packet?.ticket_id ?? null) as string | null }));
}

export async function teamPlan(db: SupabaseClient, articleId: string, unit?: string, shared?: T) {
  const t = shared ?? (await open(db, articleId));
  const router = await routerOf(t);
  const queued = await queuedRuns(db, articleId);
  const units = t.L.sections.map((s) => { const e = envelopeOf(s); return { key: s.section_key as string, status: e.team.status, pending: e.team.pending, waitingOn: e.waitingOn ?? [], issues: e.team.mustFix.length, hedges: e.team.hedges.filter(needsRuling).length }; });
  const steps = planSteps({ units, tickets: router.tickets, runStatus: runStatus(router), queued }).filter((s) => !unit || s.unit === unit);
  return { article: t.L.article.title as string, runStatus: runStatus(router), tickets: router.tickets, units, steps, queued };
}

export async function queueTeamRun(db: SupabaseClient, articleId: string, role: TeamRole, unit: string | null, ticketId: string | null, extra: Record<string, unknown> = {}, shared?: T): Promise<{ runId: string; duplicate: boolean }> {
  const t = shared ?? (await open(db, articleId));
  const dup = (await queuedRuns(db, articleId)).find((q) => q.role === role && q.unit === unit && q.ticketId === ticketId);
  if (dup) return { runId: dup.id, duplicate: true };
  const router = await routerOf(t);
  const ticket = ticketId ? router.tickets.find((x) => x.id === ticketId) ?? null : null;
  if (ticketId && !ticket) throw new Error(`no ticket ${ticketId}`);
  const isUnit = !!unit && t.L.sections.some((s) => s.section_key === unit);
  const cur = isUnit ? await currentVersion(db, row(t, unit!)) : null;
  const data = await packetData(t, role, unit, ticket, router, cur, extra);
  const packet = buildTeamPacket(role, { articleId, opportunityId: t.L.article.opportunity_id, unitKey: unit, versionHash: cur?.content_hash ?? (unit ? `unit:${unit}:none` : "article"), ticketId }, data);
  const { data: ins, error } = await db.from("agent_runs").insert({ agent_key: TEAM_AGENT_FILE[role], subject_type: "article", subject_id: articleId, status: "QUEUED", task_packet: { ...packet, team_run_id: t.runId, unit_hash: cur?.content_hash ?? null }, prompt_version: packet.prompt_version }).select("id").single();
  if (error) throw error;
  await auditArticle(db, articleId, "team_run_queued", { run: ins.id, role, unit, ticket: ticketId });
  return { runId: ins.id, duplicate: false };
}

export async function queueNextTeam(db: SupabaseClient, articleId: string, unit?: string, only?: (s: PlanStep) => boolean) {
  const t = await open(db, articleId);                                   // one load of the article for the whole batch
  const plan = await teamPlan(db, articleId, unit, t);
  plan.steps = only ? plan.steps.filter(only) : plan.steps;
  const out: { step: PlanStep; runId: string; duplicate: boolean }[] = [];
  for (const step of plan.steps) out.push({ step, ...(await queueTeamRun(db, articleId, step.role, step.unit, step.ticketId, {}, t)) });
  return out;
}

async function opportunityOf(db: SupabaseClient, L: Loaded) { return (await db.from("opportunities").select("*").eq("id", L.article.opportunity_id).single()).data as any; }

async function packetData(t: T, role: TeamRole, unit: string | null, ticket: TicketRec | null, router: RouterState, cur: any, extra: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { db, L } = t;
  const brief = L.brief.outline;
  const ledger = [...L.claims.values()].map((c) => ({ id: c.id, text: c.text, risk: c.risk, support: c.support, source: c.sourceId ? { title: L.sources.get(c.sourceId)?.title, url: L.sources.get(c.sourceId)?.source_url } : null, jurisdiction: c.jurisdiction }));
  const approvedFacts = L.facts.filter((f: any) => f.status === "approved");
  const base: Record<string, unknown> = {
    article: { id: t.articleId, title: L.article.title, slug: L.article.slug, primary_keyword: L.article.primary_keyword },
    claim_ledger: ledger, approved_brand_facts: approvedFacts.map((f: any) => ({ key: f.fact_key, value: f.fact_value })),
    pending_juan_blocked: "hours/24h, closing time, ownership/founder/title, contractor license, address vs service area, Equity Track, $32M+, 100% on time, East Oakland roots; and any statement that THB buys as-is or without a cleanout. Never write a star rating, a score such as 4.8/5 or a review count.",
    editorial_rules: "docs/references/editorial-standards.md",
  };
  const ticketData = ticket ? { id: ticket.id, type: ticket.type, from: ticket.from, to: ticket.to, unit: ticket.unitKey, issue: ticket.issue, severity: ticket.severity, evidence: ticket.evidence, suggested_fix: ticket.fix, round: ticket.round, thread: router.log.filter((l) => l.ticketId === ticket.id).map((l) => ({ role: l.role, round: l.round, body: l.body })) } : null;
  const answersFor = (r: TeamRole) => router.tickets.filter((x) => x.from.includes(r) && (x.unitKey === unit || !unit) && (x.status === "ANSWERED" || x.status === "CLOSED")).map((x) => ({ ticket: x.id, asked: x.issue, to: x.to, answer: router.log.filter((l) => l.ticketId === x.id && l.role === x.to).map((l) => l.body).join(" | ") }));
  const voice = async () => { const { data: vr } = await db.from("brand_facts").select("fact_value,status,provisional_by").eq("fact_key", "voice_reference").single(); return { status: vr?.provisional_by ? `provisionally approved by ${vr.provisional_by}; Juan confirms with the first article` : vr?.status, excerpts: safeJson(vr?.fact_value), note: "Examples of rhythm and stance, never text or facts to copy." }; };

  if (unit && L.sections.some((s) => s.section_key === unit) && ["W1", "W2", "V1", "V2", "V3"].includes(role)) {
    const r = row(t, unit); const env = envelopeOf(r); const idx = L.sections.indexOf(r);
    const unitBlock = {
      unit_key: unit,
      brief_for_this_unit: unit === "faq" ? { note: "FAQ unit: 5-7 short question-and-answer items drawn from the brief's fan_out hypotheses and the sections; answers 60 words or fewer; cite claim_ids only from the ledger.", fan_out: brief.fan_out } : { ...brief.outline[idx], section_key: unit, is_first_section: idx === 0 },
      brief_global: { target_reader: brief.target_reader, answer_first: brief.answer_first, honest_options: brief.honest_options, real_world_warnings: brief.real_world_warnings, professional_confirmation: brief.professional_confirmation, seller_situation_map: brief.seller_situation_map, link_plan: brief.link_plan, open_items: brief.open_items, outline_h2s: brief.outline.map((s: any, i: number) => ({ key: `s${i + 1}`, h2: s.h2 })) },
      current_version: cur ? { version_hash: cur.content_hash, unit: cur.content } : null,
    };
    Object.assign(base, unitBlock);
    if (role === "V1" || role === "V2" || role === "V3") Object.assign(base, { previously_declined: (env.team.declines ?? []).map((d) => ({ key: d.key, issue: d.text, writer_reason: d.reason, raised: d.raised })), declines_rule: "The writer declined these items and the code recorded them. Do not raise one again under a new key or new wording: it is counted once and not reopened. To raise it again, put what is new (a claim id, a stored passage, or the changed text) in new_evidence." });
    if (role === "W1") Object.assign(base, { voice_reference: await voice(), open_corrections: env.team.mustFix.map((m) => ({ key: m.key, from: m.role, issue: m.text, attempts: m.attempts })), open_tickets_to_you: router.tickets.filter((x) => x.to === "W1" && x.unitKey === unit && x.status === "OPEN").map((x) => ({ ticket: x.id, key: x.key, issue: x.issue, fix: x.fix, severity: x.severity, from: x.from })), declined_so_far: (env.team.declines ?? []).map((d) => ({ key: d.key, reason: d.reason, raised: d.raised })), declines_rule: "To not apply a should-fix or suggestion (never a must-fix), list it in result.declines as {key, reason} with the exact key from your packet. The code stores it and shows it to Leo.", should_fix_for_leo: env.team.collected.filter((c) => !c.declined).map((c) => ({ key: c.key, from: c.role, severity: c.severity, issue: c.text })), co_writer_suggestions: env.suggestions && cur && env.suggestions.versionHash === cur.content_hash ? env.suggestions.items : [], research_answers: answersFor("W1") });
    if (role === "W2") Object.assign(base, { voice_reference: await voice() });
    if (role === "V3") Object.assign(base, { voice_reference: await voice(), co_writer_suggestions: env.suggestions?.items ?? [] });
    if (role === "V1") {
      const hedges = env.team.hedges.filter(needsRuling).map((h) => ({ key: h.key, term: h.term, sentence: h.sentence }));
      Object.assign(base, { review_scope: env.team.v1Scope ?? { kind: "full" }, hedge_flags: hedges, previously_passed: env.team.v1Passed ? { version_hash: env.team.v1Passed.hash } : null, research_answers: answersFor("V1") });
    }
    if (role === "V2") Object.assign(base, { main_keyword: L.article.primary_keyword, research_answers: answersFor("V2") });
  } else if (role === "R1") {
    const { data: lib } = await db.from("evidence_sources").select("id,title,source_tier,jurisdiction,effective_date,retrieved_date,source_url,provenance_note").limit(200);
    const { data: pas } = await db.from("evidence_passages").select("id,source_id,passage,locator").limit(4000);
    Object.assign(base, { ticket: ticketData, evidence_library: (lib ?? []).map((l: any) => ({ ...l, passages: (pas ?? []).filter((p: any) => p.source_id === l.id).map((p: any) => ({ passage_id: p.id, locator: p.locator, text: p.passage })) })), library_first_rule: "Use Evidence Library sources FIRST. For official pages: ask for the URL in a fetch request; you quote only the stored passages (official_snapshots) by passage id.", official_snapshots: [], ...extra });
  } else if (role === "R2" || role === "S1") {
    const opp = await opportunityOf(db, L);
    const pkt = opp.packet;
    Object.assign(base, { ticket: ticketData, candidate_packet: pkt, allowed_evidence_ids: [`gsc:${pkt.window.start}..${pkt.window.end}`, ...pkt.pages.map((p: any) => `inv:${p.page_id ?? p.url}`), ...pkt.queries.map((q: any) => `q:${q.query}`)] });
    if (role === "S1") Object.assign(base, { agent1_decision: opp.agent_decision, brief_summary: { working_title: brief.working_title, outline_h2s: brief.outline.map((o: any) => o.h2) }, research_answers: answersFor("S1") });
  } else if (role === "R3") {
    const { data: lib } = await db.from("evidence_sources").select("id,title,source_tier,jurisdiction,effective_date,retrieved_date,source_url,provenance_note").limit(200);
    const { data: pas } = await db.from("evidence_passages").select("id,source_id,passage,locator").limit(4000);
    Object.assign(base, { ticket: ticketData, evidence_library: (lib ?? []).map((l: any) => ({ ...l, passages: (pas ?? []).filter((p: any) => p.source_id === l.id).map((p: any) => ({ passage_id: p.id, locator: p.locator, text: p.passage })) })), seller_library: { publication_cleared_briefs: 0, note: "No seller story is cleared for publication; stories stays empty." } });
  } else if (role === "S2") {
    Object.assign(base, { ticket: ticketData, brief: brief, approved_identity: await identityNote(t), supported_claim_ids: [...L.claims.values()].filter((c) => c.support === "supported").map((c) => c.id), units: L.sections.map((s) => s.section_key) });
  }
  return base;
}

// ---------- approved identity (S2 may not change it) ----------
const BRIEF_EXTRA_KEYS = ["decision", "run_id"];
async function approvedIdentity(t: T): Promise<ApprovedIdentity> {
  const opp = await opportunityOf(t.db, t.L);
  const plain = Object.fromEntries(Object.entries(t.L.brief.outline).filter(([k]) => !BRIEF_EXTRA_KEYS.includes(k)));
  const rd = opp.redirect ?? {};
  const dec = opp.agent_decision;
  return {
    brief: briefSchema.parse(plain), keyword: t.L.article.primary_keyword ?? "", slug: t.L.article.slug ?? null,
    action: dec?.decision === "UPDATE" ? "UPDATE" : "CREATE", targetPage: dec?.decision === "UPDATE" ? dec.result?.existing_urls?.[0] ?? null : null,
    requiredLinks: rd.required_links ?? [MONEY_URL], forbiddenTargetPhrases: rd.forbidden_target_phrases ?? [], protectedUrls: [MONEY_URL],
  };
}
async function identityNote(t: T) {
  const a = await approvedIdentity(t);
  return { target_keyword: a.keyword, slug: a.slug, action: a.action, target_page: a.targetPage, working_title: a.brief.working_title, h2_questions: a.brief.outline.map((o) => o.h2), required_links: a.requiredLinks, never_target: a.forbiddenTargetPhrases, protected_pages: a.protectedUrls, rule: "These are fixed. If the only real fix changes one, raise a HUMAN_ESCALATION (brief_change) instead." };
}

// ---------- submit ----------
async function teamCtxFor(db: SupabaseClient, run: TeamRun): Promise<TeamCtx> {
  const p = run.task_packet;
  const L = await load(db, p.article_id);
  const role = run.role;
  const ctx: TeamCtx = { packet: p, currentHash: p.unit_hash ?? null };
  const unit = p.unit_key;
  if (unit && ["W1", "V1", "V2", "V3"].includes(role)) {
    const r = L.sections.find((s) => s.section_key === unit);
    const cur = r ? await currentVersion(db, r) : null;
    const env = r ? envelopeOf(r) : { team: newTeamSection(unit) };
    ctx.currentHash = cur?.content_hash ?? null;
    ctx.studio = { packet: { agent_key: TEAM_AGENT_FILE[role], prompt_version: teamPromptVersion(role), unit_key: unit, unit_hash: cur?.content_hash ?? null, allowed_claim_ids: [...L.claims.keys()], opportunity_id: L.article.opportunity_id, article_id: p.article_id } as any, currentUnit: cur?.content ?? null, currentHash: cur?.content_hash ?? null, check: L.check, voiceUsable: await voiceUsable(db), requiredIssuesOpen: env.team.mustFix.map((m) => m.key), declinableKeys: role === "W1" ? [...env.team.collected.map((c) => c.key), ...(await w1ShouldFixKeys(db, p, unit))] : undefined };
    ctx.pendingHedgeKeys = env.team.hedges.filter(needsRuling).map((h) => h.key);
    ctx.pendingHedges = env.team.hedges.filter(needsRuling).map((h) => ({ key: h.key, sentence: h.sentence }));
  }
  const opp = await opportunityOf(db, L);
  if (role === "R1" || role === "R3") {
    const { data: pas } = await db.from("evidence_passages").select("id,source_id,passage").limit(4000);
    ctx.legacy = { libraryPassages: new Map((pas ?? []).map((x: any) => [x.id, { source_id: x.source_id, text: x.passage }])) };
    if (role === "R1") ctx.snapshotStore = dbSnapshotStore(db);
    if (role === "R3") { ctx.approvedFacts = new Map(L.facts.filter((f: any) => f.status === "approved").map((f: any) => [f.fact_key, f.fact_value])); ctx.clearedStories = new Map(); }
  }
  if (role === "R2" || role === "S1") {
    const pkt = opp.packet;
    ctx.allowedEvidenceIds = [`gsc:${pkt.window.start}..${pkt.window.end}`, ...pkt.pages.map((x: any) => `inv:${x.page_id ?? x.url}`), ...pkt.queries.map((q: any) => `q:${q.query}`)];
    ctx.gscRows = new Map(pkt.queries.map((q: any) => [`q:${q.query}`, { impressions: q.impressions, clicks: q.clicks, position: q.position }]));
    if (role === "S1") ctx.legacy = { candidate: pkt };
  }
  if (role === "S2") {
    const router = (await loadRouter(db, p.team_run_id ?? (await startTeamRun(db, p.article_id)))).state;
    const tk = router.tickets.find((x) => x.id === p.ticket_id);
    if (tk) ctx.rootCause = { ticket: { id: tk.id, type: tk.type, to: tk.to, unitKey: tk.unitKey || null }, approved: await approvedIdentity({ db, articleId: p.article_id, runId: "", L }), supportedClaimIds: new Set([...L.claims.values()].filter((c) => c.support === "supported").map((c) => c.id)) };
  }
  return ctx;
}

function dbRunStore(db: SupabaseClient, noteBox: { note?: string }): TeamRunStore {
  const fromRow = (d: any): TeamRun => ({ id: d.id, role: teamRoleOfAgentKey(d.agent_key)!, status: d.status, task_packet: d.task_packet, output: d.output, retries: d.retries, error: d.error, model_version: d.model_version });
  return {
    async getRun(id) { const { data, error } = await db.from("agent_runs").select("*").eq("id", id).single(); if (error) throw error; return fromRow(data); },
    async saveRun(r) {
      const { error } = await db.from("agent_runs").update({ status: r.status, output: r.output, model_version: r.model_version, retries: r.retries, error: r.error, updated_at: new Date().toISOString() }).eq("id", r.id);
      if (error) throw error;
      await db.from("audit_events").insert({ actor: `agent:${TEAM_AGENT_FILE[r.role]}`, subject_type: "article", subject_id: r.task_packet.article_id, event_type: `agent_run_${r.status.toLowerCase()}`, accepted: r.status !== "FAILED", detail: { run: r.id, retries: r.retries, role: r.role, unit: r.task_packet.unit_key, error: r.error?.slice(0, 500) ?? null } });
    },
    async onAccepted(run, out) { noteBox.note = await applyTeamAccepted(db, run, out); },
    async onIntegrationError(run) { await orchestratorFor(db).transition("article", run.task_packet.article_id, "INTEGRATION_ERROR", { kind: "system", id: "agent-bridge" }, { agent_run: run.id, role: run.role, attempts: run.retries, error: run.error?.slice(0, 500) }); },
  };
}

export type TeamSubmit = { ok: true; note?: string } | { ok: false; errors: string[]; final: boolean; attempt: number };
export async function submitTeam(db: SupabaseClient, runId: string, raw: string): Promise<TeamSubmit> {
  const { data: rrow } = await db.from("agent_runs").select("agent_key,subject_id,retries").eq("id", runId).single();
  if (!rrow || !teamRoleOfAgentKey(rrow.agent_key)) return { ok: false, errors: ["not a team role run"], final: true, attempt: 0 };
  const { data: art } = await db.from("articles").select("pipeline_mode").eq("id", rrow.subject_id).single();
  const wrong = pipelineGuard(modeOf(art ?? {}), rrow.agent_key, "team");
  if (wrong) return { ok: false, errors: [wrong], final: false, attempt: rrow.retries };           // refused outright: no attempt used
  const box: { note?: string } = {};
  const res = await submitTeamOutput(dbRunStore(db, box), runId, raw, (run) => teamCtxFor(db, run));
  if (res.ok) return { ok: true, note: box.note };
  return { ok: false, errors: res.errors, final: res.final, attempt: res.run.retries };
}

/** A dry run: the same validation as submit, nothing saved and no attempt used. */
export async function checkTeam(db: SupabaseClient, runId: string, raw: string): Promise<string[]> {
  const { teamSchema, teamSchemaKey, teamSemanticChecks } = await import("../team/bridge");
  const { data } = await db.from("agent_runs").select("*").eq("id", runId).single();
  const role = teamRoleOfAgentKey(data!.agent_key)!;
  try {
    const json = JSON.parse(raw);
    const r = teamSchema(teamSchemaKey(role, json)).safeParse(json);
    if (!r.success) return r.error.issues.map((i: any) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    return await teamSemanticChecks(role, r.data, await teamCtxFor(db, { id: runId, role, status: data!.status, task_packet: data!.task_packet, output: null, retries: data!.retries, error: null, model_version: null }));
  } catch (e) { return [`not valid JSON: ${e instanceof Error ? e.message : String(e)}`]; }
}

// ---------- apply ----------
const findRouterTicket = (s: RouterState, id: string | null) => (id ? s.tickets.find((x) => x.id === id) ?? null : null);

async function answerTickets(t: T, role: TeamRole, unit: string, keys: string[], body: string) {
  for (const key of keys) {
    const s = await routerOf(t);
    const hit = s.tickets.filter((x) => x.to === role && x.unitKey === unit && x.key === key && x.status === "OPEN").pop();
    if (hit) await op(t, (st) => respond(st, hit.id, role, body, stamp()));
  }
}
/** An answered evidence request is consumed when the sender's next accepted run completes: code closes it (the sender had the answer in its packet). */
async function closeConsumed(t: T, role: TeamRole, unit: string | null) {
  const s = await routerOf(t);
  for (const x of s.tickets.filter((x) => x.type === "EVIDENCE_REQUEST" && x.status === "ANSWERED" && x.from.includes(role) && (unit === null || x.unitKey === unit || !x.unitKey))) {
    await op(t, (st) => closeTicket(st, x.id, "ORCHESTRATOR", `answer used by ${role}'s next run`, stamp()));
  }
}
async function raiseAll(t: T, cards: FeedbackCard[], hash: string) {
  const out: { id: string | null; ok: boolean }[] = [];
  for (const c of cards) { const r = await raise(t, c, hash); out.push({ id: r.ok ? r.ticket.id : null, ok: r.ok }); }
  return out;
}

/** A Research answer to a request about a unit that is already locked: nobody will consume it, so code closes it right away (the answer stays on the ticket). */
async function closeIfUnitLocked(t: T, ticketId: string | null) {
  if (!ticketId) return;
  const tk = findRouterTicket(await routerOf(t), ticketId);
  if (!tk || tk.status !== "ANSWERED" || !tk.unitKey) return;
  const rw = t.L.sections.find((s) => s.section_key === tk.unitKey);
  if (rw && (await db0(t, rw)).status === "LOCKED") await op(t, (st) => closeTicket(st, ticketId, "ORCHESTRATOR", "unit already locked: the answer is recorded for Leo", stamp()));
}
const db0 = async (t: T, rw: any) => (await t.db.from("article_sections").select("status").eq("id", rw.id).single()).data as any;

async function addClaimsToLedger(t: T, role: "R1" | "R3", pack: { sources: PackSource[]; claims: PackClaim[] }): Promise<{ added: { key: string; text: string }[]; notProven: string[] }> {
  const { db, L } = t;
  const good = supportedClaims(pack.claims);
  const keys = remapClaimKeys(L.claims.keys(), good);
  const store = dbSnapshotStore(db);
  const rows: any[] = [];
  const added: { key: string; text: string }[] = [];
  for (const c of good) {
    const src = pack.sources.find((s) => s.id === c.source_ids[0]);
    let srcDb: string | null = null; let eff: string | null = src?.effective_date ?? null;
    if (src?.kind === "library") srcDb = src.library_source_id ?? null;
    else if (src?.url) { srcDb = await store.idForUrl(src.url); eff = eff ?? (await store.effectiveDate(src.url)); }
    const key = keys.get(c.id)!;
    rows.push(claimRow(t.articleId, key, c, srcDb, eff, TEAM_AGENT_FILE[role], todayISO(), sha256(c.text)));
    added.push({ key, text: c.text });
  }
  if (rows.length) { const { error } = await db.from("claims").insert(rows); if (error) throw error; }
  return { added, notProven: pack.claims.filter((c) => c.support !== "supported").map((c) => c.text) };
}

async function escalateRow(t: T, r: any, st: TeamSectionState) {
  if (st.status === "ESCALATED" && st.escalation) await t.db.from("escalations").insert({ article_id: t.articleId, section_id: r.id, issue_key: st.escalation.issueKey, reason: st.escalation.reason, attempts: 2 });
}

export async function applyTeamAccepted(db: SupabaseClient, run: TeamRun, out: any): Promise<string | undefined> {
  const p = run.task_packet;
  const t = await open(db, p.article_id);
  const role = run.role;
  const unit = p.unit_key;
  const notes: string[] = [];
  const r = out.result;

  if (role === "W1") notes.push(await applyW1(t, unit!, run, out));
  else if (role === "W2") {
    const rw = row(t, unit!); const env = envelopeOf(rw);
    await saveEnvelope(db, rw, { ...env, suggestions: { versionHash: r.version_hash, items: r.suggestions } });
    await auditArticle(db, t.articleId, "co_writer_suggestions", { unit, count: r.suggestions.length });
    notes.push(`${r.suggestions.length} suggestion(s) stored for W1`);
  } else if (role === "V1" || role === "V2" || role === "V3") notes.push(await applyCouncil(t, role, unit!, run, out));
  else if (role === "R1") notes.push(await applyR1(t, run, out));
  else if (role === "R2") {
    const tk = findRouterTicket(await routerOf(t), p.ticket_id);
    const body = `R2 answer (strategy only): ${r.demand.length} demand row(s), ${r.questions.length} question(s), ${r.rankings.length} ranking(s). ${JSON.stringify({ demand: r.demand, questions: r.questions, rankings: r.rankings, unresolved: r.unresolved }).slice(0, 6000)}`;
    if (tk) await op(t, (s) => respond(s, tk.id, "R2", body, stamp()));
    await closeIfUnitLocked(t, p.ticket_id);
    notes.push("R2 evidence pack recorded on the ticket");
  } else if (role === "R3") {
    const tk = findRouterTicket(await routerOf(t), p.ticket_id);
    const { added, notProven } = await addClaimsToLedger(t, "R3", { sources: r.sources, claims: r.claims });
    const extra = [r.facts.length ? `Approved brand facts (exact wording): ${r.facts.map((f: any) => `${f.fact_key}: "${f.wording}"`).join("; ")}.` : "", r.brand_facts_pending.length ? `Pending, not usable: ${r.brand_facts_pending.join("; ")}.` : "", "No seller story is cleared for publication."].filter(Boolean).join(" ");
    if (tk) await op(t, (s) => respond(s, tk.id, "R3", packSummary("R3", added, notProven, extra), stamp()));
    await closeIfUnitLocked(t, p.ticket_id);
    notes.push(`R3 answered (${added.length} claim(s) added)`);
  } else if (role === "S1") {
    await raiseAll(t, r.tickets, p.input_version_ids[0]);
    await closeConsumed(t, "S1", null);
    await auditArticle(db, t.articleId, "strategist_decision", { decision: out.decision, rationale: r.rationale, tickets: r.tickets.length });
    notes.push(`S1 decision ${out.decision}; ${r.tickets.length} ticket(s) raised`);
  } else if (role === "S2") notes.push(await applyS2(t, run, out));

  // Assemble only when every unit is locked (one cheap query before the full article load).
  const { data: st } = await db.from("article_sections").select("status").eq("article_id", t.articleId);
  if ((st ?? []).length && (st ?? []).every((x: any) => x.status === "LOCKED")) { const adv = await advanceArticle(db, t.articleId); if (adv) notes.push(adv); }
  return notes.filter(Boolean).join("; ");
}

/** Keys of should-fix / suggestion tickets still open to W1 on this unit: W1 may decline these as well as the council's collected items. */
async function w1ShouldFixKeys(db: SupabaseClient, p: TeamPacket, unit: string): Promise<string[]> {
  if (!p.team_run_id) return [];
  const rt = (await loadRouter(db, p.team_run_id)).state;
  return rt.tickets.filter((x) => x.to === "W1" && x.unitKey === unit && x.status === "OPEN" && x.severity !== "must fix" && !!x.key).map((x) => x.key as string);
}

async function applyW1(t: T, unit: string, run: TeamRun, out: any): Promise<string> {
  const { db, L } = t;
  const rw = row(t, unit); const env = envelopeOf(rw); const r = out.result;
  if (out.decision === "BLOCKED") {
    const made = await raiseAll(t, r.tickets, run.task_packet.unit_hash ?? "");
    await saveEnvelope(db, rw, { ...env, waitingOn: made.filter((m) => m.id).map((m) => m.id!) });
    await auditArticle(db, t.articleId, "writer_gap", { unit, tickets: made, required: out.required_actions });
    return `W1 reported a gap on ${unit}; ${made.filter((m) => m.ok).length} evidence request(s) raised`;
  }
  const u = r.unit as Unit;
  const hash = contentHash(u); const sig = materialSig(unitText(u), unitClaimIds(u));
  const versionNo = env.team.versionNo + 1;
  const { data: ver, error } = await db.from("section_versions").insert({ section_id: rw.id, version_no: versionNo, content: u, content_hash: hash, material_sig: sig, reason: r.change_note, created_by: TEAM_AGENT_FILE.W1, agent_run_id: run.id }).select("id").single();
  if (error) throw error;
  const rv = recordVersion(env.team, { hash, sig, text: unitText(u) });
  if (!rv.ok) throw new Error(rv.error);
  const findings = checkUnit(u, L.check);
  const d = applyDeterministic(rv.state, findings);
  if (!d.ok) throw new Error(d.error);
  let teamState = d.state;
  const declined: { key: string; reason: string }[] = r.declines ?? [];
  if (declined.length) {
    const rt = await routerOf(t);
    const extra = rt.tickets.filter((x) => x.to === "W1" && x.unitKey === unit && x.status === "OPEN" && x.severity !== "must fix" && !!x.key).map((x) => ({ key: x.key as string, text: x.issue, role: x.from[0] as string }));
    const dm = declineMany(teamState, declined, extra);
    if (!dm.ok) throw new Error(dm.error);
    teamState = dm.state;
  }
  const next: Envelope = { ...env, team: teamState, waitingOn: [], councilCards: {}, suggestions: undefined };
  await saveEnvelope(db, rw, next, { current_version_id: ver.id, body: JSON.stringify(u) });
  await auditArticle(db, t.articleId, "section_version", { unit, version: versionNo, hash, status: d.state.status, deterministic_findings: findings.map((f) => `${f.code}: ${f.detail}`), hedges: d.state.hedges.length, v1_scope: d.state.v1Scope?.kind ?? null, note: rv.note });
  if (d.state.status === "BLOCKED_CLAIM" || d.state.status === "BLOCKED_PRIVACY") await blockArticleFor(db, t.articleId, d.state.status, { unit, blockedBy: d.state.blockedBy });
  await escalateRow(t, rw, d.state);
  await answerTickets(t, "W1", unit, r.addresses, r.change_note);
  for (const x of declined) await answerTickets(t, "W1", unit, [x.key], `Declined: ${x.reason}`);
  if (declined.length) await auditArticle(db, t.articleId, "writer_declines", { unit, declines: declined });
  await closeConsumed(t, "W1", unit);
  await raiseAll(t, r.tickets, hash);
  return `section ${unit} v${versionNo} is now ${d.state.status}`;
}

const ROLE_ORDER: CouncilRole[] = ["V1", "V2", "V3"];
async function applyCouncil(t: T, role: CouncilRole, unit: string, run: TeamRun, out: any): Promise<string> {
  const { db } = t;
  const rw = row(t, unit); const env = envelopeOf(rw); const r = out.result;
  const cards: FeedbackCard[] = r.cards;
  // Loop items: every correction, and every other card that is a must-fix (a root cause for S2, an evidence request the unit cannot do without): the unit does not lock while one is open.
  const items = [
    ...cards.filter((c) => c.ticket === "QUALITY_CORRECTION" || (c.severity === "must fix" && c.ticket !== "HUMAN_ESCALATION")).map((c, i) => ({ key: c.key ?? `card:${c.ticket.toLowerCase()}:${i}`, severity: c.severity, text: c.issue, newEvidence: c.new_evidence })),
    ...(out.findings as any[]).filter((f) => f.severity === "optional" && !cards.some((c) => c.key === f.issue_key)).map((f) => ({ key: f.issue_key, severity: "should fix" as const, text: f.note, newEvidence: f.new_evidence })),
  ];
  const before = env.team;
  // A review that arrives after the unit moved on (escalated, blocked, sent back, or this member already reported) is recorded but changes nothing.
  if (before.status !== "NEEDS_COUNCIL" || r.version_hash !== before.versionHash || !before.pending.includes(role)) {
    await db.from("section_reviews").insert({ section_id: rw.id, version_id: rw.current_version_id, agent_key: TEAM_AGENT_FILE[role], decision: out.decision, findings: out.findings, required_actions: out.required_actions, advisory_score: role === "V3" ? Math.round(r.score.total) : null, agent_run_id: run.id });
    await auditArticle(db, t.articleId, "late_review_recorded", { unit, role, decision: out.decision, unit_status: before.status, pending: before.pending });
    return `${role} review arrived when ${unit} was ${before.status}: recorded, not applied`;
  }
  const rr = recordReview(before, { role, versionHash: r.version_hash, decision: out.decision, items, blockKind: r.block_kind, hedgeRulings: role === "V1" ? r.hedge_rulings : undefined });
  if (!rr.ok) throw new Error(rr.error);
  const stored: Envelope = { ...env, team: rr.state, councilCards: { ...(env.councilCards ?? {}), [role]: { versionHash: r.version_hash, decision: out.decision, cards, findings: out.findings } } };
  await db.from("section_reviews").insert({ section_id: rw.id, version_id: rw.current_version_id, agent_key: TEAM_AGENT_FILE[role], decision: out.decision, findings: out.findings, required_actions: out.required_actions, advisory_score: role === "V3" ? Math.round(r.score.total) : null, agent_run_id: run.id });
  await saveEnvelope(db, rw, stored);
  await auditArticle(db, t.articleId, "section_review", { unit, role, decision: out.decision, status: rr.state.status, pending: rr.state.pending, note: rr.note });
  await closeConsumed(t, role, unit);
  const done = rr.state.pending.length === 0 || rr.state.status !== "NEEDS_COUNCIL";
  const notes = [`${role} ${out.decision}`];
  if (done) notes.push(await finalizeCouncil(t, rw, stored));
  return notes.join("; ");
}

/** The council finished the current version: merge the cards into one set, raise tickets for must-fixes and cross-team cards, reopen or close earlier tickets, lock if the loop says so. */
async function finalizeCouncil(t: T, rw: any, env: Envelope): Promise<string> {
  const { db } = t;
  const st = env.team; const unit = rw.section_key as string; const hash = st.versionHash ?? "";
  const stored = ROLE_ORDER.map((r) => ({ role: r, s: env.councilCards?.[r] })).filter((x) => x.s && x.s.versionHash === hash);
  const input: CouncilItem[] = stored.flatMap((x) => x.s!.cards.map((c, i) => ({ id: `${x.role}:${i}`, card: c })));
  const combined = combineFeedback(input);
  const mustKeys = new Set(combined.toWriter.filter((c) => c.card.severity === "must fix").map((c) => c.card.key).filter(Boolean) as string[]);
  const notes: string[] = [];
  // must-fix corrections: a new ticket, or the next round of one W1 already answered
  for (const c of combined.toWriter.filter((x) => x.card.severity === "must fix")) {
    const s = await routerOf(t);
    const same = s.tickets.filter((x) => x.type === "QUALITY_CORRECTION" && x.unitKey === unit && x.key === c.card.key && x.status !== "CLOSED").pop();
    if (same?.status === "ANSWERED") {
      const sender = c.card.from.find((f) => same.from.includes(f)) ?? same.from[0];
      const res = await op(t, (st2) => reopen(st2, same.id, sender, `Still present after the rework: ${c.card.issue}`, stamp(hash)));
      notes.push(res.ok ? `${same.id} reopened (round ${same.round + 1})` : `${same.id} escalated: ${res.reason}`);
    } else if (!same) {
      const originals = c.mergedFrom.map((id) => ({ id: randomUuid(), cardId: id }));
      const res = await raise(t, c.card, hash, { mergedFrom: c.mergedFrom.length > 1 || c.mergeBasis !== "single" ? originals.map((o) => o.id) : [] });
      if (res.ok && res.dbTicketId && (c.mergedFrom.length > 1 || c.mergeBasis !== "single")) {
        await db.from("ticket_messages").insert(originals.map((o) => ({ id: o.id, ticket_id: res.dbTicketId, role: combined.originals[o.cardId].from[0], body: JSON.stringify({ original_card: combined.originals[o.cardId] }), round: 1, version_hash: hash || null })));
      }
    }
  }
  // cards for other teams go straight to the router
  for (const pc of combined.passThrough) await raise(t, pc.card, hash);
  // earlier corrections the reviewers no longer report are closed by code
  const s2 = await routerOf(t);
  for (const x of s2.tickets.filter((x) => x.type === "QUALITY_CORRECTION" && x.unitKey === unit && x.status === "ANSWERED" && x.key && !mustKeys.has(x.key))) {
    await op(t, (st2) => closeTicket(st2, x.id, "ORCHESTRATOR", "not reported again by the reviewers after the rework", stamp(hash)));
  }
  if (combined.disagreements.length) { await saveEnvelope(db, rw, { ...env, disagreements: combined.disagreements }); await auditArticle(db, t.articleId, "council_disagreements", { unit, disagreements: combined.disagreements }); }
  await escalateRow(t, rw, st);
  if (st.status === "BLOCKED_CLAIM" || st.status === "BLOCKED_PRIVACY") await blockArticleFor(db, t.articleId, st.status, { unit, blockedBy: st.blockedBy });
  if (st.status === "LOCKED") {
    await db.from("article_sections").update({ locked_version_id: rw.current_version_id }).eq("id", rw.id);
    const { data: ver } = await db.from("section_versions").select("content").eq("id", rw.current_version_id).single();
    const L = await load(db, t.articleId);
    for (const id of unitClaimIds(ver!.content as Unit)) { const c = L.claims.get(id); if (c) await db.from("claims").update({ locked_text: c.text, text_hash: sha256(c.text) }).eq("article_id", t.articleId).eq("claim_key", id); }
    // The unit is done: answers to its evidence requests were used, so code closes them.
    const done = await routerOf(t);
    for (const x of done.tickets.filter((x) => x.unitKey === unit && x.status === "ANSWERED")) await op(t, (st2) => closeTicket(st2, x.id, "ORCHESTRATOR", "unit locked: the answer was used", stamp(hash)));
    notes.push(`${unit} LOCKED by code (V1 passed this version; no must-fix open)`);
  } else notes.push(`${unit} is ${st.status}`);
  return notes.join("; ");
}
const randomUuid = () => (globalThis.crypto as any).randomUUID() as string;

async function applyR1(t: T, run: TeamRun, out: any): Promise<string> {
  const p = run.task_packet; const r = out.result;
  const tk = findRouterTicket(await routerOf(t), p.ticket_id);
  if ("fetch_request" in r) {
    const fx = await fulfillFetchRequest(r, { store: dbSnapshotStore(t.db), fetcher: r1Fetcher ?? officialFetcher(), today: todayISO() });
    const q = await queueTeamRun(t.db, t.articleId, "R1", p.unit_key, p.ticket_id, { official_snapshots: fx.snapshots, fetch_problems: fx.errors });
    await auditArticle(t.db, t.articleId, "r1_fetch", { ticket: p.ticket_id, fetched: fx.snapshots.map((s) => s.url), problems: fx.errors, next_run: q.runId });
    return `R1 asked for ${r.fetch_request.length} page(s); ${fx.snapshots.length} stored; R1 re-queued with the stored passages`;
  }
  const { added, notProven } = await addClaimsToLedger(t, "R1", { sources: r.sources, claims: r.claims });
  if (tk) await op(t, (s) => respond(s, tk.id, "R1", packSummary("R1", added, [...notProven, ...r.unresolved]), stamp()));
  await closeIfUnitLocked(t, p.ticket_id);
  return `R1 answered ${p.ticket_id ?? "the opening request"} (${added.length} claim(s) added)`;
}

async function applyS2(t: T, run: TeamRun, out: any): Promise<string> {
  const { db } = t; const p = run.task_packet; const r = out.result;
  const s = await routerOf(t);
  const tk = findRouterTicket(s, p.ticket_id);
  if (!tk) return "S2 output without a ticket";
  if (!("root_cause" in r)) return "S2 brief output recorded (no change applied)";
  const L = await load(db, t.articleId);
  const approved = await approvedIdentity(t);
  const outcome = resolveRootCause({ ticket: { id: tk.id, type: tk.type, to: tk.to, unitKey: tk.unitKey || null }, approved, output: r, supportedClaimIds: new Set([...L.claims.values()].filter((c) => c.support === "supported").map((c) => c.id)) });
  const directive = (text: string) => ({ key: `brief:${tk.id}`, text });
  const finish = async (body: string) => { await op(t, (st) => respond(st, tk.id, "S2", body, stamp())); await op(t, (st) => closeTicket(st, tk.id, "ORCHESTRATOR", "applied by code", stamp())); };
  await raiseAll(t, r.tickets, p.input_version_ids[0]);
  if (outcome.kind === "invalid") throw new Error(outcome.errors.join("; "));
  if (outcome.kind === "escalate") {
    await raise(t, outcome.card, p.input_version_ids[0], { trigger: outcome.trigger });
    await finish(`Escalated to Leo: ${outcome.reason}`);
    return `S2 fix would alter the approved brief (${outcome.changed.join("; ")}): escalated to Leo`;
  }
  const unitsToFix = outcome.kind === "revise" ? outcome.affectedUnits : tk.unitKey ? [tk.unitKey] : [];
  if (outcome.kind === "revise") {
    const { data: b } = await db.from("briefs").select("id,outline,outline_history").eq("id", L.article.brief_id).single();
    const history = [...((b!.outline_history as any[]) ?? []), { superseded_at: new Date().toISOString(), outline: b!.outline, reason: `ROOT_CAUSE_NOTE ${tk.id}` }];
    const extraKeys = Object.fromEntries(Object.entries(b!.outline as any).filter(([k]) => BRIEF_EXTRA_KEYS.includes(k)));
    await db.from("briefs").update({ outline_history: history, outline: { ...outcome.brief, ...extraKeys } }).eq("id", b!.id);
    for (const [i, o] of outcome.brief.outline.entries()) await db.from("article_sections").update({ claim_ids: o.claim_ids }).eq("article_id", t.articleId).eq("section_key", `s${i + 1}`);
  }
  for (const u of unitsToFix) {
    const rw = L.sections.find((x) => x.section_key === u); if (!rw) continue;
    const env = envelopeOf(rw);
    const why = outcome.kind === "revise" ? outcome.reasons[u] ?? r.root_cause : `${tk.issue} (the Architect found the brief is not the cause)`;
    const br = briefRevised(env.team, directive(`${outcome.kind === "revise" ? "The brief changed" : "From the review"}: ${why}`));
    if (br.ok) { await saveEnvelope(db, rw, { ...env, team: br.state, councilCards: {}, waitingOn: [] }); }
  }
  await auditArticle(db, t.articleId, "brief_revised", { ticket: tk.id, kind: outcome.kind, units: unitsToFix, root_cause: r.root_cause });
  await finish(outcome.kind === "revise" ? `Brief revised. Affected units: ${unitsToFix.join(", ")}. ${r.root_cause}` : `The brief is not the cause: ${r.root_cause}. Sent back to the writer.`);
  return outcome.kind === "revise" ? `brief revised; affected: ${unitsToFix.join(", ")}` : "brief unchanged; point sent back to the writer";
}

// ---------- operator files (the same pattern as dump-queued and submit-dir) ----------
export async function dumpTeamQueued(db: SupabaseClient, dir: string): Promise<string[]> {
  const { data } = await db.from("agent_runs").select("id,agent_key,task_packet,retries,error").eq("status", "QUEUED").in("agent_key", TEAM_KEYS).order("created_at");
  const lines: string[] = [];
  for (const rr of data ?? []) {
    if (!String(rr.task_packet?.output_contract?.submit ?? "").includes("team-submit")) continue;   // V1 on a classic article is a classic gate run (npm run studio -- dump-queued)
    const role = teamRoleOfAgentKey(rr.agent_key)!;
    const file = `${dir}/${role}-${rr.task_packet.unit_key ?? "article"}${rr.task_packet.ticket_id ? `-${rr.task_packet.ticket_id}` : ""}-packet.json`;
    writeFileSync(file, JSON.stringify({ run_id: rr.id, attempts_used: rr.retries, last_error: rr.error, ...rr.task_packet }, null, 2));
    lines.push(`${rr.id} ${role} ${rr.task_packet.unit_key ?? "-"} ${rr.task_packet.ticket_id ?? "-"} -> ${file}`);
  }
  return lines;
}

export async function submitTeamDir(db: SupabaseClient, dir: string): Promise<string[]> {
  const lines: string[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith("-packet.json")).sort()) {
    const out = `${dir}/${f.replace("-packet.json", "-out.json")}`;
    const name = f.replace("-packet.json", "");
    if (!existsSync(out)) { lines.push(`${name}: no output yet`); continue; }
    const runId = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")).run_id as string;
    const { data: run } = await db.from("agent_runs").select("status").eq("id", runId).single();
    if (run?.status !== "QUEUED") { lines.push(`${name}: run already ${run?.status}`); continue; }
    const res = await submitTeam(db, runId, readFileSync(out, "utf8"));
    lines.push(`${name}: ${res.ok ? `ACCEPTED${res.note ? ` — ${res.note}` : ""}` : `REJECTED (attempt ${res.attempt}/3)${res.final ? " FINAL" : ""}: ${res.errors.slice(0, 3).join(" | ")}`}`);
  }
  return lines;
}
