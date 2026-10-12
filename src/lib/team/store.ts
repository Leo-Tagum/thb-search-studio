/* eslint-disable @typescript-eslint/no-explicit-any -- DB rows */
// Phase 3c task 11: persistence for the ticket router. The router (router.ts) stays pure; this module loads its state from team_runs, tickets and
// ticket_messages, runs one operation, and writes back exactly what changed: new and changed tickets, one ticket_messages row per ticket-bound log
// row, an audit event for log rows that belong to no ticket (refusals, stops), and the run's budget and status. Router ids (T1, T2 ...) are the
// tickets in creation order; the database ids are uuids. This module never writes a lock, a state, an approval or a ledger claim.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { budgetUsed, closeTicket, newRouter, respond, runStatus, type LogRow, type Result, type RouterState, type TicketRec } from "./router";
import { buildTeamView } from "./view";
import { agentLikeActor, resolveActorError } from "../studio/actors";

export type DiffResult = { newTickets: TicketRec[]; changedTickets: TicketRec[]; newLog: LogRow[]; newlyStopped: boolean };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What changed between two router states (pure). Tickets are never removed and the log only grows. */
export function diffRouter(before: RouterState, after: RouterState): DiffResult {
  const known = new Map(before.tickets.map((t) => [t.id, t]));
  return {
    newTickets: after.tickets.filter((t) => !known.has(t.id)),
    changedTickets: after.tickets.filter((t) => known.has(t.id) && !same(known.get(t.id), t)),
    newLog: after.log.slice(before.log.length),
    newlyStopped: after.stopped && !before.stopped,
  };
}

// ---------- row <-> record ----------
export const ticketToRow = (t: TicketRec, ids: { id: string; runId: string; articleId: string; parentId: string | null }, at: string) => ({
  id: ids.id, team_run_id: ids.runId, article_id: ids.articleId, unit_key: t.unitKey || null, ticket_type: t.type, from_role: t.from[0], from_roles: t.from, to_role: t.to,
  issue: t.issue, severity: t.severity, evidence: t.evidence, suggested_fix: t.fix, blocking: t.blocking, status: t.status, round: t.round, parent_ticket_id: ids.parentId,
  version_hash: t.versionHash, resolution: t.resolution, escalation_trigger: t.trigger, issue_key: t.key, merged_from: t.mergedFrom,
  closed_at: t.status === "CLOSED" ? at : null,
});

export function rowsToRouter(run: { ticket_budget: number; round_limit: number; status: string }, rows: any[], messages: any[]): { state: RouterState; idByRouterId: Map<string, string> } {
  const sorted = [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
  const routerId = new Map(sorted.map((r, i) => [r.id as string, `T${i + 1}`]));
  const tickets: TicketRec[] = sorted.map((r, i) => ({
    id: `T${i + 1}`, no: i + 1, type: r.ticket_type, from: r.from_roles ?? [r.from_role], to: r.to_role, unitKey: r.unit_key ?? "", issue: r.issue, severity: r.severity,
    evidence: r.evidence ?? "", fix: r.suggested_fix ?? null, blocking: !!r.blocking, status: r.status, round: r.round, parentId: r.parent_ticket_id ? routerId.get(r.parent_ticket_id) ?? null : null,
    versionHash: r.version_hash ?? "", trigger: r.escalation_trigger ?? null, resolution: r.resolution ?? null, key: r.issue_key ?? null, mergedFrom: r.merged_from ?? [],
  }));
  const log: LogRow[] = [...messages].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map((m, i) => ({
    seq: i + 1, at: m.created_at, ticketId: routerId.get(m.ticket_id) ?? null, role: m.role, action: (m.action ?? "REPLY") as LogRow["action"], round: m.round, versionHash: m.version_hash ?? "", body: m.body,
  }));
  const state: RouterState = { ...newRouter({ ticketBudget: run.ticket_budget, roundLimit: run.round_limit }), stopped: run.status === "STOPPED_BUDGET", tickets, log };
  return { state, idByRouterId: new Map(sorted.map((r, i) => [`T${i + 1}`, r.id as string])) };
}

// ---------- database I/O ----------
export async function startTeamRun(db: SupabaseClient, articleId: string, opts: { ticketBudget?: number; roundLimit?: number } = {}): Promise<string> {
  const { data: art } = await db.from("articles").select("pipeline_mode").eq("id", articleId).single();
  if (art?.pipeline_mode !== "team") throw new Error("team runs exist only on team-mode articles");
  const { data: open } = await db.from("team_runs").select("id").eq("article_id", articleId).in("status", ["RUNNING", "ESCALATED", "STOPPED_BUDGET"]).order("started_at", { ascending: false }).limit(1);
  if (open?.length) return open[0].id;
  const { data, error } = await db.from("team_runs").insert({ article_id: articleId, ticket_budget: opts.ticketBudget ?? 10, round_limit: opts.roundLimit ?? 2 }).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function loadRouter(db: SupabaseClient, teamRunId: string) {
  const { data: run, error } = await db.from("team_runs").select("*").eq("id", teamRunId).single();
  if (error || !run) throw new Error("no such team run");
  const { data: rows } = await db.from("tickets").select("*").eq("team_run_id", teamRunId);
  const ids = (rows ?? []).map((r: any) => r.id);
  const { data: msgs } = ids.length ? await db.from("ticket_messages").select("*").in("ticket_id", ids) : { data: [] as any[] };
  return { run, ...rowsToRouter(run, rows ?? [], msgs ?? []) };
}

/**
 * Runs one router operation against the stored state and persists the result, including a refusal's log row and an escalation raised by a limit hit.
 * The operation receives the loaded state; whatever Result it returns is written back. Returns the router's Result with the ticket's database id.
 */
export async function runRouterOp(db: SupabaseClient, articleId: string, teamRunId: string, op: (s: RouterState) => Result, now = new Date().toISOString()): Promise<Result & { dbTicketId?: string; escalationDbId?: string }> {
  const { state: before, idByRouterId } = await loadRouter(db, teamRunId);
  const res = op(before);
  const after = res.state;
  const d = diffRouter(before, after);
  const idOf = new Map(idByRouterId);
  for (const t of d.newTickets) idOf.set(t.id, randomUUID());

  if (d.newTickets.length) {
    const rows = d.newTickets.map((t) => ticketToRow(t, { id: idOf.get(t.id)!, runId: teamRunId, articleId, parentId: t.parentId ? idOf.get(t.parentId) ?? null : null }, now));
    // parents first so the foreign key holds
    const { error } = await db.from("tickets").insert(rows);
    if (error) throw error;
  }
  for (const t of d.changedTickets) {
    const { error } = await db.from("tickets").update({ status: t.status, round: t.round, resolution: t.resolution, closed_at: t.status === "CLOSED" ? now : null, merged_from: t.mergedFrom }).eq("id", idOf.get(t.id)!);
    if (error) throw error;
  }
  const bound = d.newLog.filter((l) => l.ticketId);
  if (bound.length) {
    const { error } = await db.from("ticket_messages").insert(bound.map((l) => ({ ticket_id: idOf.get(l.ticketId!)!, role: l.role, body: l.body, round: l.round, version_hash: l.versionHash || null, created_at: l.at })));
    if (error) throw error;
  }
  const unbound = d.newLog.filter((l) => !l.ticketId);
  if (unbound.length) await db.from("audit_events").insert(unbound.map((l) => ({ actor: `team:${l.role}`, subject_type: "article", subject_id: articleId, event_type: `team_${l.action.toLowerCase()}`, accepted: l.action !== "REFUSE" && l.action !== "STOP", version_hash: l.versionHash || null, detail: { team_run: teamRunId, round: l.round, body: l.body } })));
  const status = runStatus(after);
  await db.from("team_runs").update({ budget_used: budgetUsed(after), status, ended_at: status === "STOPPED_BUDGET" ? now : null }).eq("id", teamRunId);
  const esc = res.ok === false ? res.escalation : undefined;
  return { ...res, dbTicketId: res.ok ? idOf.get(res.ticket.id) : undefined, escalationDbId: esc ? idOf.get(esc.id) : undefined };
}

/** The Team tab's data for one article: its latest team run, tickets, messages and the unit statuses (read only). Null when the article has no team run yet. */
export async function loadTeamView(db: SupabaseClient, articleId: string) {
  const { data: runs } = await db.from("team_runs").select("id").eq("article_id", articleId).order("started_at", { ascending: false }).limit(1);
  if (!runs?.length) return null;
  const { run, state, idByRouterId } = await loadRouter(db, runs[0].id);
  const { data: secs } = await db.from("article_sections").select("section_key,brief_h2,status").eq("article_id", articleId).order("position");
  return buildTeamView({
    run: { ticketBudget: run.ticket_budget, roundLimit: run.round_limit, status: runStatus(state) },
    tickets: state.tickets.map((t) => ({ ...t, dbId: idByRouterId.get(t.id)! })),
    messages: state.log.filter((l) => l.ticketId).map((l) => ({ routerId: l.ticketId!, role: l.role, body: l.body, round: l.round, at: l.at })),
    sections: (secs ?? []).map((s: any) => ({ key: s.section_key, title: s.brief_h2, status: s.status })),
  });
}

/** Leo answers an escalation: the router closes it with his words as the resolution (only role LEO may answer a HUMAN_ESCALATION). */
export async function leoAnswerEscalation(db: SupabaseClient, articleId: string, dbTicketId: string, text: string, now = new Date().toISOString()): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { data: row } = await db.from("tickets").select("team_run_id,article_id,ticket_type,status").eq("id", dbTicketId).single();
  if (!row || row.article_id !== articleId) return { ok: false, reason: "no such escalation on this article" };
  if (row.ticket_type !== "HUMAN_ESCALATION") return { ok: false, reason: "only an escalation is answered here" };
  if (row.status === "CLOSED") return { ok: false, reason: "this escalation is already closed" };
  const { idByRouterId } = await loadRouter(db, row.team_run_id);
  const routerId = [...idByRouterId.entries()].find(([, id]) => id === dbTicketId)?.[0];
  if (!routerId) return { ok: false, reason: "ticket not found in its run" };
  const res = await runRouterOp(db, articleId, row.team_run_id, (s) => respond(s, routerId, "LEO", text, { at: now, versionHash: "" }), now);
  if (!res.ok) return { ok: false, reason: res.reason };
  // The ticket this escalated (a round-limit hit) is decided too: Leo's words are its resolution.
  const parent = res.ticket.parentId;
  if (parent) await runRouterOp(db, articleId, row.team_run_id, (s) => { const p = s.tickets.find((x) => x.id === parent); return p && p.status === "ESCALATED" ? closeTicket(s, parent, "LEO", `decided by Leo: ${text}`, { at: new Date(Date.parse(now) + 1).toISOString(), versionHash: "" }) : { ok: true as const, state: s, ticket: p! }; }, now);
  return { ok: true };
}

export const DEFAULT_TICKET_BUDGET = 10;
export const BRANCH_BUDGET_MAX = 50;

/**
 * Leo raises the ticket budget of ONE comparison branch (a deliberate, recorded exception; every other article keeps the default of 10).
 * Allowed only as leo, only on a team-mode branch (branch_of set), only upward and with a reason. A budget stop becomes RUNNING again; an open
 * escalation stays open until Leo answers it. The exception is written to the audit log with the old and new budget and the reason.
 */
export async function raiseTicketBudget(db: SupabaseClient, articleId: string, newBudget: number, reason: string, actorId: string): Promise<{ ok: true; from: number; to: number; runId: string } | { ok: false; reason: string }> {
  if (agentLikeActor(actorId) || !actorId.trim()) return { ok: false, reason: resolveActorError(actorId, null)! };   // before any read or write
  const { data: art } = await db.from("articles").select("id,branch_of,is_fixture,pipeline_mode").eq("id", articleId).single();
  if (!art) return { ok: false, reason: "no such article" };
  const denied = resolveActorError(actorId, art);
  if (denied) return { ok: false, reason: denied };
  if (!art.branch_of) return { ok: false, reason: `a ticket budget exception is allowed only on a comparison branch; every other article keeps the default of ${DEFAULT_TICKET_BUDGET}` };
  if (art.pipeline_mode !== "team") return { ok: false, reason: "only a team-mode article has a ticket budget" };
  if (!Number.isInteger(newBudget) || newBudget < 1 || newBudget > BRANCH_BUDGET_MAX) return { ok: false, reason: `the budget must be a whole number from 1 to ${BRANCH_BUDGET_MAX}` };
  if (!reason.trim()) return { ok: false, reason: "a reason is required: the exception is recorded" };
  const { data: runs } = await db.from("team_runs").select("id,ticket_budget,status").eq("article_id", articleId).in("status", ["RUNNING", "ESCALATED", "STOPPED_BUDGET"]).order("started_at", { ascending: false }).limit(1);
  const run = runs?.[0];
  if (!run) return { ok: false, reason: "no open team run on this article" };
  if (newBudget <= run.ticket_budget) return { ok: false, reason: `the new budget must be higher than the current ${run.ticket_budget}` };
  const { error } = await db.from("team_runs").update({ ticket_budget: newBudget, status: run.status === "STOPPED_BUDGET" ? "RUNNING" : run.status, ended_at: null }).eq("id", run.id);
  if (error) return { ok: false, reason: error.message };
  await db.from("audit_events").insert({ actor: actorId, subject_type: "article", subject_id: articleId, event_type: "team_budget_exception", accepted: true, detail: { team_run: run.id, from: run.ticket_budget, to: newBudget, default: DEFAULT_TICKET_BUDGET, reason: reason.trim() } });
  return { ok: true, from: run.ticket_budget, to: newBudget, runId: run.id };
}

/** Leo answers an escalation by its router id (T11 ...) from the operator CLI; same closing path as the Stuck inbox, with an actor check (the UI action uses a constant). */
export async function leoAnswerEscalationAs(db: SupabaseClient, articleId: string, routerTicketId: string, text: string, actorId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (agentLikeActor(actorId) || !actorId.trim()) return { ok: false, reason: resolveActorError(actorId, null)! };
  const { data: art } = await db.from("articles").select("id,is_fixture").eq("id", articleId).single();
  if (!art) return { ok: false, reason: "no such article" };
  const denied = resolveActorError(actorId, art);
  if (denied) return { ok: false, reason: denied };
  if (!text.trim()) return { ok: false, reason: "a decision is required" };
  const runId = await startTeamRun(db, articleId);
  const { idByRouterId } = await loadRouter(db, runId);
  const dbId = idByRouterId.get(routerTicketId);
  if (!dbId) return { ok: false, reason: `no ticket ${routerTicketId} in this article's run` };
  return leoAnswerEscalation(db, articleId, dbId, text.trim());
}
