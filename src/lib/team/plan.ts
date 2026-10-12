// Phase 3c task 12: what can run next in a team article (pure). The operator runs the steps one packet at a time through /thb-run-agent.
// Order: tickets waiting on Research or the Architect first, then writers, then the council. Nothing runs once the ticket budget stopped the
// article (Leo decides), for an escalated or blocked unit, or for a unit that waits on an open evidence request.
import type { RunStatus, TicketRec } from "./router";
import type { CouncilRole, TeamStatus } from "./loop";
import type { TeamRole } from "./tickets";

export type PlanUnit = { key: string; status: TeamStatus; pending: CouncilRole[]; waitingOn: string[] };   // waitingOn: router ids of tickets W1 raised and is waiting on
export type PlanStep = { role: TeamRole; unit: string | null; ticketId: string | null; reason: string };
export type PlanInput = { units: PlanUnit[]; tickets: TicketRec[]; runStatus: RunStatus; queued: { role: string; unit: string | null; ticketId: string | null }[] };

const LISTENERS: TeamRole[] = ["R1", "R2", "R3", "S2"];

export function planSteps(input: PlanInput): PlanStep[] {
  if (input.runStatus === "STOPPED_BUDGET") return [];
  const steps: PlanStep[] = [];
  const queued = (role: string, unit: string | null, ticketId: string | null) => input.queued.some((q) => q.role === role && q.unit === unit && q.ticketId === ticketId);
  const push = (s: PlanStep) => { if (!queued(s.role, s.unit, s.ticketId) && !steps.some((x) => x.role === s.role && x.unit === s.unit && x.ticketId === s.ticketId)) steps.push(s); };

  for (const t of input.tickets) {
    if (t.status === "OPEN" && (LISTENERS as string[]).includes(t.to) && t.type !== "HUMAN_ESCALATION") push({ role: t.to as TeamRole, unit: t.unitKey || null, ticketId: t.id, reason: `${t.type} ${t.id} from ${t.from.join("+")} is waiting for ${t.to}` });
  }
  for (const u of input.units) {
    if (u.status === "NEEDS_WRITE" || u.status === "NEEDS_REVISION") {
      const waiting = u.waitingOn.filter((id) => { const t = input.tickets.find((x) => x.id === id); return t && (t.status === "OPEN" || t.status === "ESCALATED"); });
      if (!waiting.length) push({ role: "W1", unit: u.key, ticketId: null, reason: u.status === "NEEDS_WRITE" ? "unit not written" : "open corrections for the writer" });
    } else if (u.status === "NEEDS_COUNCIL") {
      for (const role of u.pending) push({ role, unit: u.key, ticketId: null, reason: `${role} has not reviewed the current version` });
    }
  }
  return steps;
}
