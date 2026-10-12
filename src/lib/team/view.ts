// Phase 3c task 11: the Team tab's view model, built from stored tickets (pure, so it is tested without a database).
// Leo sees outcomes and escalations first: the budget, one outcome line per unit, and the "Stuck" inbox. The full discussion for each ticket is carried
// along and opened on click. The recommendations in the Stuck inbox are suggested defaults for Leo, never decisions.
import type { EscalationTrigger, RunStatus, TicketRec } from "./router";
import { TICKET_TYPES, type TicketType } from "./tickets";

export type ViewTicket = TicketRec & { dbId: string };
export type ViewMessage = { routerId: string; role: string; body: string; round: number; at: string };
export type ViewSection = { key: string; title: string; status: string };
export type TeamViewInput = {
  run: { ticketBudget: number; roundLimit: number; status: RunStatus };
  tickets: ViewTicket[];
  messages: ViewMessage[];
  sections: ViewSection[];
};

export type TeamName = "Research" | "Strategy" | "Writing" | "Review" | "Leo" | "Orchestrator";
export const teamOf = (role: string): TeamName => (role.startsWith("R") ? "Research" : role.startsWith("S") ? "Strategy" : role.startsWith("W") ? "Writing" : role.startsWith("V") ? "Review" : role === "LEO" ? "Leo" : "Orchestrator");

export type V1Status = "veto open" | "V1 items open" | "passed" | "not reviewed";
export type UnitOutcome = { key: string; title: string; sectionStatus: string; outcome: string; resolved: number; open: number; escalations: number; mustFixOpen: number; v1: V1Status };
export type ResolveAction = "request_revision" | "hold" | "reopen" | "dismiss";
export type StuckItem = { dbId: string; routerId: string; unit: string; trigger: EscalationTrigger | null; from: string[]; headline: string; positions: { label: string; text: string }[]; recommendation: string; parentRouterId: string | null; actions: ResolveAction[] };
export type TicketView = { dbId: string; routerId: string; type: TicketType; from: string[]; to: string; unit: string; severity: string; status: string; round: number; roundLimit: number; issue: string; evidence: string; fix: string | null; blocking: boolean; trigger: EscalationTrigger | null; resolution: string | null; mergedFrom: string[]; messages: ViewMessage[] };
export type TeamView = {
  budget: { used: number; limit: number; remaining: number; pct: number; stopped: boolean };
  roundLimit: number; runStatus: RunStatus;
  units: UnitOutcome[]; stuck: StuckItem[]; tickets: TicketView[];
  fired: { types: Record<TicketType, number>; teams: Record<string, { sent: number; received: number }> };
};

// Suggested defaults only. Leo decides.
export const RECOMMENDATIONS: Record<EscalationTrigger, string> = {
  round_limit: "If the reviewer's objection names a rule (a fact, privacy, a must-fix), keep the reviewer's position and send the section back with that directive. If it is a matter of style, accept the writer's version and note it.",
  budget_limit: "The article used its ticket budget. If any open item is a must-fix, fix it yourself or send the section back with a directive; otherwise accept the draft with the remaining items listed for review.",
  brief_change: "Approve a change to the brief or keyword only if the root cause cannot be fixed inside the approved brief. Otherwise keep the brief and send the section back to work within it.",
  legal_uncertain: "Do not publish the uncertain legal or privacy point. Drop or soften it unless an official source is added, and have V1 re-check the new version.",
  conflicting_evidence: "Prefer the official source with the later effective date. If they still conflict on a major claim, drop the claim from the article.",
  brand_risk: "Keep the safer wording and ask Juan before it is published.",
};

const OPEN = new Set(["OPEN", "ANSWERED"]);

function positions(t: ViewTicket): { label: string; text: string }[] {
  if (t.from[0] === "ORCHESTRATOR" && t.evidence.includes(" | ")) {
    return t.evidence.split(" | ").map((seg) => { const i = seg.indexOf(":"); return i > 0 && i < 48 ? { label: seg.slice(0, i).trim(), text: seg.slice(i + 1).trim() } : { label: "Detail", text: seg.trim() }; });
  }
  const out = [{ label: t.from.join(" + "), text: t.issue }];
  if (t.evidence) out.push({ label: t.from[0] === "ORCHESTRATOR" ? "Detail" : "Evidence", text: t.evidence });
  return out;
}

export function buildTeamView(input: TeamViewInput): TeamView {
  const { tickets, sections } = input;
  const roundLimit = input.run.roundLimit;
  const used = tickets.filter((t) => t.type !== "HUMAN_ESCALATION").length;
  const msgs = new Map<string, ViewMessage[]>();
  for (const m of input.messages) msgs.set(m.routerId, [...(msgs.get(m.routerId) ?? []), m]);
  const secByKey = new Map(sections.map((s) => [s.key, s]));

  const unitKeys = [...new Set([...sections.map((s) => s.key), ...tickets.map((t) => t.unitKey).filter(Boolean)])];
  const units: UnitOutcome[] = unitKeys.map((key) => {
    const mine = tickets.filter((t) => t.unitKey === key);
    const open = mine.filter((t) => OPEN.has(t.status) && t.type !== "HUMAN_ESCALATION");
    const escalations = mine.filter((t) => t.status === "ESCALATED" || (t.type === "HUMAN_ESCALATION" && t.status !== "CLOSED")).length;
    const v1Open = open.filter((t) => t.from.includes("V1"));
    const sectionStatus = secByKey.get(key)?.status ?? "NO SECTION";
    const v1: V1Status = v1Open.some((t) => t.blocking) ? "veto open" : v1Open.length ? "V1 items open" : sectionStatus === "LOCKED" ? "passed" : "not reviewed";
    const outcome = escalations ? "escalated to Leo" : sectionStatus === "LOCKED" && !open.length ? "locked" : open.length ? "open items" : sectionStatus.toLowerCase().replace(/_/g, " ");
    return { key, title: secByKey.get(key)?.title ?? key, sectionStatus, outcome, resolved: mine.filter((t) => t.status === "CLOSED" && t.type !== "HUMAN_ESCALATION").length, open: open.length, escalations, mustFixOpen: open.filter((t) => t.severity === "must fix").length, v1 };
  });

  const stuck: StuckItem[] = tickets.filter((t) => t.type === "HUMAN_ESCALATION" && t.status !== "CLOSED").map((t) => {
    const st = secByKey.get(t.unitKey)?.status ?? "";
    const actions: ResolveAction[] = ["ESCALATED", "BLOCKED_CLAIM", "BLOCKED_PRIVACY"].includes(st) ? ["request_revision", "hold", "dismiss"] : st === "LOCKED" ? ["reopen", "dismiss"] : ["dismiss"];
    const rec = t.trigger ? RECOMMENDATIONS[t.trigger] : "";
    return { dbId: t.dbId, routerId: t.id, unit: t.unitKey, trigger: t.trigger, from: t.from, headline: t.issue, positions: positions(t), parentRouterId: t.parentId, actions,
      recommendation: [rec, t.fix && t.from[0] !== "ORCHESTRATOR" ? `${t.from.join(" + ")} suggests: ${t.fix}` : ""].filter(Boolean).join(" ") };
  });

  const types = Object.fromEntries(TICKET_TYPES.map((k) => [k, tickets.filter((t) => t.type === k).length])) as Record<TicketType, number>;
  const teams: Record<string, { sent: number; received: number }> = {};
  const bump = (team: string, k: "sent" | "received") => { teams[team] ??= { sent: 0, received: 0 }; teams[team][k]++; };
  for (const t of tickets.filter((x) => x.from[0] !== "ORCHESTRATOR")) { for (const f of new Set(t.from.map(teamOf))) bump(f, "sent"); bump(teamOf(t.to), "received"); }

  return {
    budget: { used, limit: input.run.ticketBudget, remaining: Math.max(0, input.run.ticketBudget - used), pct: Math.min(100, Math.round((used / input.run.ticketBudget) * 100)), stopped: input.run.status === "STOPPED_BUDGET" },
    roundLimit, runStatus: input.run.status, units, stuck,
    tickets: [...tickets].reverse().map((t) => ({ dbId: t.dbId, routerId: t.id, type: t.type, from: t.from, to: t.to, unit: t.unitKey, severity: t.severity, status: t.status, round: t.round, roundLimit, issue: t.issue, evidence: t.evidence, fix: t.fix, blocking: t.blocking, trigger: t.trigger, resolution: t.resolution, mergedFrom: t.mergedFrom, messages: msgs.get(t.id) ?? [] })),
    fired: { types, teams },
  };
}
