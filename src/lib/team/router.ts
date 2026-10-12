// Phase 3c: the ticket router. Pure and immutable: every function takes a RouterState and returns a new one.
// No ticket exists unless it came through raiseTicket. Enforces the round limit (2 per ticket) and ticket budget (10 per article),
// logs every step (including refusals), and turns a limit hit or a HUMAN_ESCALATION into a Leo escalation (proposal section 5).
// The router moves tickets only. It never writes a lock, a state, an approval or a ledger claim.
import { parseFeedbackCard, TEAM_ROLES, type FeedbackCard, type TicketType } from "./tickets";

export const ESCALATION_TRIGGERS = ["conflicting_evidence", "brief_change", "legal_uncertain", "round_limit", "brand_risk", "budget_limit"] as const;
export type EscalationTrigger = (typeof ESCALATION_TRIGGERS)[number];   // the six triggers, in the order of proposal section 5

export type TicketStatus = "OPEN" | "ANSWERED" | "CLOSED" | "ESCALATED";
export type RunStatus = "RUNNING" | "ESCALATED" | "STOPPED_BUDGET";
export type LogAction = "RAISE" | "REFUSE" | "REPLY" | "REOPEN" | "CLOSE" | "ESCALATE" | "STOP";

export interface TicketRec {
  id: string; no: number; type: TicketType; from: string[]; to: string; unitKey: string; issue: string; severity: FeedbackCard["severity"];
  evidence: string; fix: string | null; blocking: boolean; status: TicketStatus; round: number; parentId: string | null; versionHash: string;
  trigger: EscalationTrigger | null; resolution: string | null;
}
export interface LogRow { seq: number; at: string; ticketId: string | null; role: string; action: LogAction; round: number; versionHash: string; body: string }
export interface RouterState { ticketBudget: number; roundLimit: number; stopped: boolean; tickets: TicketRec[]; log: LogRow[] }
export interface Ctx { at: string; versionHash: string }
export type Result = { ok: true; state: RouterState; ticket: TicketRec } | { ok: false; state: RouterState; reason: string; escalation?: TicketRec };

export const newRouter = (opts: { ticketBudget?: number; roundLimit?: number } = {}): RouterState => ({ ticketBudget: opts.ticketBudget ?? 10, roundLimit: opts.roundLimit ?? 2, stopped: false, tickets: [], log: [] });

// Destination rules, checked here independently of the schema (belt and braces).
const RESEARCH = ["R1", "R2", "R3"];
export const routeAllowed = (type: TicketType, from: readonly string[], to: string): string | null => {
  if (!from.length || from.some((r) => !(TEAM_ROLES as readonly string[]).includes(r))) return "unknown sender role";
  if (from.includes(to)) return "a ticket cannot be addressed to its own sender";
  switch (type) {
    case "EVIDENCE_REQUEST": return RESEARCH.includes(to) ? null : "EVIDENCE_REQUEST goes to Research (R1, R2 or R3)";
    case "ROOT_CAUSE_NOTE": return to === "S2" ? null : "ROOT_CAUSE_NOTE goes to S2";
    case "QUALITY_CORRECTION": return to === "W1" ? null : "QUALITY_CORRECTION goes to W1 only";
    case "HUMAN_ESCALATION": return to === "LEO" ? null : "HUMAN_ESCALATION goes to LEO";
  }
};

export const budgetUsed = (s: RouterState) => s.tickets.filter((t) => t.type !== "HUMAN_ESCALATION").length;   // escalations are the exit path and never consume budget
export const openEscalations = (s: RouterState) => s.tickets.filter((t) => t.type === "HUMAN_ESCALATION" && t.status !== "CLOSED");
export const runStatus = (s: RouterState): RunStatus => (s.stopped ? "STOPPED_BUDGET" : openEscalations(s).length || s.tickets.some((t) => t.status === "ESCALATED") ? "ESCALATED" : "RUNNING");

const withLog = (s: RouterState, ctx: Ctx, row: Omit<LogRow, "seq" | "at" | "versionHash">): RouterState => ({ ...s, log: [...s.log, { seq: s.log.length + 1, at: ctx.at, versionHash: ctx.versionHash, ...row }] });
const setTicket = (s: RouterState, t: TicketRec): RouterState => ({ ...s, tickets: s.tickets.map((x) => (x.id === t.id ? t : x)) });
const refuse = (s: RouterState, ctx: Ctx, role: string, ticketId: string | null, round: number, reason: string): Result => ({ ok: false, reason, state: withLog(s, ctx, { ticketId, role, action: "REFUSE", round, body: reason }) });

// A system escalation (limit hit). From ORCHESTRATOR, never counted against the budget; carries both positions so Leo can decide.
const escalate = (s: RouterState, ctx: Ctx, trigger: EscalationTrigger, unitKey: string, issue: string, evidence: string, parent: TicketRec | null): { state: RouterState; ticket: TicketRec } => {
  const no = s.tickets.length + 1;
  const ticket: TicketRec = { id: `T${no}`, no, type: "HUMAN_ESCALATION", from: ["ORCHESTRATOR"], to: "LEO", unitKey, issue, severity: "must fix", evidence, fix: null, blocking: false, status: "OPEN", round: 1, parentId: parent?.id ?? null, versionHash: ctx.versionHash, trigger, resolution: null };
  let next: RouterState = { ...s, tickets: [...s.tickets, ticket] };
  if (parent) next = setTicket(next, { ...parent, status: "ESCALATED" });
  next = withLog(next, ctx, { ticketId: ticket.id, role: "ORCHESTRATOR", action: "ESCALATE", round: 1, body: `${trigger}: ${issue}` });
  return { state: next, ticket };
};

export function raiseTicket(s: RouterState, rawCard: unknown, ctx: Ctx, opts: { trigger?: EscalationTrigger; parentId?: string } = {}): Result {
  const sender = Array.isArray((rawCard as FeedbackCard | undefined)?.from) ? (rawCard as FeedbackCard).from.join("+") : "unknown";
  const parsed = parseFeedbackCard(rawCard);
  if (!parsed.success) return refuse(s, ctx, sender, null, 1, `invalid card: ${parsed.error.issues.map((i) => `${i.path.join(".") || "card"}: ${i.message}`).join("; ")}`);
  const c = parsed.data;
  const bad = routeAllowed(c.ticket, c.from, c.to);
  if (bad) return refuse(s, ctx, sender, null, 1, bad);
  const isEscalation = c.ticket === "HUMAN_ESCALATION";
  if (isEscalation && (!opts.trigger || !ESCALATION_TRIGGERS.includes(opts.trigger))) return refuse(s, ctx, sender, null, 1, "HUMAN_ESCALATION needs one of the six escalation triggers");
  if (s.stopped && !isEscalation) return refuse(s, ctx, sender, null, 1, "article stopped: ticket budget reached, waiting for Leo");
  if (!isEscalation && budgetUsed(s) >= s.ticketBudget) {
    const refused = withLog({ ...s, stopped: true }, ctx, { ticketId: null, role: sender, action: "STOP", round: 1, body: `ticket ${budgetUsed(s) + 1} refused: budget of ${s.ticketBudget} used` });
    const e = escalate(refused, ctx, "budget_limit", c.section, `Ticket budget (${s.ticketBudget}) reached; the article is stopped.`, `Refused: ${c.ticket} ${sender} -> ${c.to} on ${c.section}: ${c.issue}`, null);
    return { ok: false, reason: "ticket budget reached", state: e.state, escalation: e.ticket };
  }
  const no = s.tickets.length + 1;
  const ticket: TicketRec = { id: `T${no}`, no, type: c.ticket, from: c.from, to: c.to, unitKey: c.section, issue: c.issue, severity: c.severity, evidence: c.evidence, fix: c.fix ?? null, blocking: c.blocking, status: "OPEN", round: 1, parentId: opts.parentId ?? null, versionHash: ctx.versionHash, trigger: isEscalation ? opts.trigger! : null, resolution: null };
  const next = withLog({ ...s, tickets: [...s.tickets, ticket] }, ctx, { ticketId: ticket.id, role: sender, action: "RAISE", round: 1, body: `${c.ticket} ${sender} -> ${c.to} [${c.section}] ${c.issue}` });
  return { ok: true, state: next, ticket };
}

const find = (s: RouterState, id: string) => s.tickets.find((t) => t.id === id);

// The addressee answers. An escalation is answered by Leo and closes. Anything else becomes ANSWERED and waits for the sender to close or reopen.
export function respond(s: RouterState, ticketId: string, role: string, body: string, ctx: Ctx): Result {
  const t = find(s, ticketId);
  if (!t) return refuse(s, ctx, role, ticketId, 0, "unknown ticket");
  if (t.status !== "OPEN") return refuse(s, ctx, role, t.id, t.round, `ticket is ${t.status}, not OPEN`);
  if (role !== t.to) return refuse(s, ctx, role, t.id, t.round, `only ${t.to} can answer this ticket`);
  if (!body.trim()) return refuse(s, ctx, role, t.id, t.round, "empty reply");
  const done = t.type === "HUMAN_ESCALATION";
  const nt: TicketRec = { ...t, status: done ? "CLOSED" : "ANSWERED", resolution: done ? body : t.resolution ?? body };
  return { ok: true, ticket: nt, state: withLog(setTicket(s, nt), ctx, { ticketId: t.id, role, action: done ? "CLOSE" : "REPLY", round: t.round, body }) };
}

// The sender disputes the answer: a new round. Round 3 is refused and the ticket escalates to Leo (trigger: teams disagree past the round limit).
export function reopen(s: RouterState, ticketId: string, role: string, body: string, ctx: Ctx): Result {
  const t = find(s, ticketId);
  if (!t) return refuse(s, ctx, role, ticketId, 0, "unknown ticket");
  if (t.status !== "ANSWERED") return refuse(s, ctx, role, t.id, t.round, `ticket is ${t.status}, only an ANSWERED ticket can be reopened`);
  if (!t.from.includes(role)) return refuse(s, ctx, role, t.id, t.round, `only the sender (${t.from.join(", ")}) can reopen this ticket`);
  if (!body.trim()) return refuse(s, ctx, role, t.id, t.round, "empty reply");
  if (t.round >= s.roundLimit) {
    const logged = withLog(s, ctx, { ticketId: t.id, role, action: "REFUSE", round: t.round + 1, body: `round ${t.round + 1} refused: limit is ${s.roundLimit}. Sender's position: ${body}` });
    const e = escalate(logged, ctx, "round_limit", t.unitKey, `Ticket ${t.id} (${t.type}) is unresolved after ${s.roundLimit} rounds.`, `Ask (${t.from.join("+")}): ${t.issue} | Answer (${t.to}): ${t.resolution ?? "see log"} | Sender still disagrees: ${body}`, t);
    return { ok: false, reason: "round limit reached", state: e.state, escalation: e.ticket };
  }
  const nt: TicketRec = { ...t, status: "OPEN", round: t.round + 1, resolution: null };
  return { ok: true, ticket: nt, state: withLog(setTicket(s, nt), ctx, { ticketId: t.id, role, action: "REOPEN", round: nt.round, body }) };
}

// The sender accepts the answer (or ORCHESTRATOR closes it after code verified the fix). Leo may close any ticket.
export function closeTicket(s: RouterState, ticketId: string, role: string, resolution: string, ctx: Ctx): Result {
  const t = find(s, ticketId);
  if (!t) return refuse(s, ctx, role, ticketId, 0, "unknown ticket");
  if (t.status === "CLOSED") return refuse(s, ctx, role, t.id, t.round, "ticket already CLOSED");
  if (!(t.from.includes(role) || role === "ORCHESTRATOR" || role === "LEO")) return refuse(s, ctx, role, t.id, t.round, `${role} cannot close this ticket`);
  const nt: TicketRec = { ...t, status: "CLOSED", resolution };
  return { ok: true, ticket: nt, state: withLog(setTicket(s, nt), ctx, { ticketId: t.id, role, action: "CLOSE", round: t.round, body: resolution }) };
}
