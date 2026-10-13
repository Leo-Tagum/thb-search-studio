import type { ReactNode } from "react";
import type { ResolveAction, StuckItem, TeamView, TicketView } from "@/lib/team/view";
import { resolveEscalationAction } from "../actions";

const LABEL: Record<ResolveAction, string> = { request_revision: "Send back to writer with this directive", hold: "Hold", reopen: "Reopen for revision", dismiss: "Accept and close" };

/** Leo's inbox: every open HUMAN_ESCALATION (agent-raised, round limit, budget limit) with both positions and a suggested default. Shown above every tab. */
export function StuckInbox({ article, items }: { article: string; items: StuckItem[] }) {
  if (!items.length) return null;
  return (
    <section className="space-y-2 border border-amber-600 p-2">
      <b>Stuck: needs Leo ({items.length})</b>
      {items.map((it) => (
        <form key={it.dbId} action={resolveEscalationAction} className="space-y-1 border p-2">
          <input type="hidden" name="article" value={article} /><input type="hidden" name="ticket" value={it.dbId} />
          <p><b>{it.unit || "article"}</b> · {it.trigger ? it.trigger.replace(/_/g, " ") : "escalation"} · from {it.from.join(" + ")}</p>
          <p>{it.headline}</p>
          <ul className="list-disc pl-5">{it.positions.map((p, i) => <li key={i}><b>{p.label}:</b> {p.text}</li>)}</ul>
          {it.recommendation && <p><i>Suggested default (yours to decide):</i> {it.recommendation}</p>}
          <div className="flex flex-wrap gap-2">
            <input name="text" placeholder="Your decision / directive (required except Hold; saved in the audit log)" className="min-w-80 flex-1 border px-1" />
            {it.actions.map((a) => <button key={a} name="kind" value={a} className="border px-2">{LABEL[a]}</button>)}
          </div>
        </form>
      ))}
    </section>
  );
}

function Discussion({ t }: { t: TicketView }): ReactNode {
  return (
    <details className="border p-1">
      <summary className="cursor-pointer">
        <b>{t.routerId}</b> {t.type.replace(/_/g, " ").toLowerCase()} · {t.from.join(" + ")} → {t.to} · {t.unit || "article"} · {t.severity}{t.blocking ? " · BLOCKING" : ""} · <b>{t.status}</b> · round {t.round}/{t.roundLimit}
      </summary>
      <div className="space-y-1 pl-3 pt-1">
        <p>{t.issue}</p>
        {t.evidence && <p><b>Evidence:</b> {t.evidence}</p>}
        {t.fix && <p><b>Suggested fix:</b> {t.fix}</p>}
        {t.trigger && <p><b>Trigger:</b> {t.trigger}</p>}
        {t.resolution && <p><b>Resolution:</b> {t.resolution}</p>}
        {t.mergedFrom.length > 0 && <p><b>Merged from original cards:</b> {t.mergedFrom.join(", ")} (check a merge by wording against these)</p>}
        <ol className="list-decimal pl-5">{t.messages.map((m, i) => <li key={i}><b>{m.role}</b> (round {m.round}): {m.body} <span className="text-neutral-500 dark:text-neutral-400">{m.at}</span></li>)}</ol>
      </div>
    </details>
  );
}

/** The Team tab: budget bar, one outcome line per unit, then the tickets (full discussion opens on click). */
export function TeamTab({ view }: { view: TeamView | null }) {
  if (!view) return <p>No team run yet. Switch the article to team mode and start a run (before any section is written, or on a team branch).</p>;
  const { budget } = view;
  return (
    <div className="space-y-3">
      <div>
        <p>Tickets used <b>{budget.used}</b> of <b>{budget.limit}</b>{budget.stopped ? " — STOPPED: budget reached, waiting for Leo" : ""} · round limit {view.roundLimit} per ticket · run {view.runStatus.toLowerCase().replace(/_/g, " ")}</p>
        <div className="h-3 w-80 border" role="progressbar" aria-valuenow={budget.used} aria-valuemin={0} aria-valuemax={budget.limit}><div className={`h-full ${budget.stopped ? "bg-red-600" : "bg-neutral-700"}`} style={{ width: `${budget.pct}%` }} /></div>
      </div>
      <table className="border-collapse text-left">
        <thead><tr>{["Unit", "Outcome", "Resolved", "Open", "Must-fix open", "Escalations", "V1"].map((h) => <th key={h} className="border px-2">{h}</th>)}</tr></thead>
        <tbody>{view.units.map((u) => (
          <tr key={u.key}><td className="border px-2"><b>{u.key}</b> <span className="text-neutral-600 dark:text-neutral-400">{u.title}</span></td><td className="border px-2">{u.outcome}</td><td className="border px-2">{u.resolved}</td><td className="border px-2">{u.open}</td><td className="border px-2">{u.mustFixOpen}</td><td className="border px-2">{u.escalations}</td><td className="border px-2">{u.v1}</td></tr>
        ))}</tbody>
      </table>
      <p>Ticket types so far: {Object.entries(view.fired.types).map(([k, n]) => `${k.replace(/_/g, " ").toLowerCase()} ${n}`).join(" · ")}</p>
      <div className="space-y-1">{view.tickets.length ? view.tickets.map((t) => <Discussion key={t.dbId} t={t} />) : <p>No tickets yet.</p>}</div>
    </div>
  );
}
