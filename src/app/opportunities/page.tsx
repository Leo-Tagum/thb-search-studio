import { Suspense } from "react";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-server";

async function Queue({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const state = typeof sp.state === "string" ? sp.state : "";
  const db = supabaseAdmin();
  let q = db.from("opportunities").select("id,title,state,proposed_action,agent_decision,human_decision,score,protected_warning,template_flag,dev_change_request,packet,created_at").order("created_at");
  if (state) q = q.eq("state", state);
  const { data } = await q;
  const rows = data ?? [];
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-semibold">Opportunity queue</h1>
      <p className="text-sm">Agents recommend; only you approve, hold or reject. The score is a THB heuristic shown for orientation. It never gates a decision. Data gaps are shown as unknown, not guessed.</p>
      <form className="flex gap-2 text-sm">
        <select name="state" defaultValue={state}>
          <option value="">any state</option>
          {["CANDIDATE", "SEO_REVIEW", "EVIDENCE_REVIEW", "BRIEF_REVIEW", "HOLD_DUPLICATION", "HOLD_EVIDENCE", "REJECTED", "INTEGRATION_ERROR"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <button className="border px-2">Filter</button>
      </form>
      <table className="w-full text-xs">
        <thead><tr className="text-left"><th>Candidate</th><th>Kind</th><th>Engine</th><th>Agent 1</th><th>Your decision</th><th>State</th><th>Impr.</th><th>Score (scored of max)</th><th>Flags</th></tr></thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-t align-top">
              <td><Link className="underline" href={`/opportunities/${o.id}`}>{o.title}</Link></td>
              <td>{o.packet?.kind}</td><td>{o.proposed_action}</td><td>{o.agent_decision?.decision ?? "—"}</td><td>{o.human_decision ?? "—"}</td><td>{o.state}</td>
              <td>{o.packet?.totals?.impressions}</td>
              <td>{o.score ? `${o.score.scored} of ${o.score.scoredMax} (${o.score.reading})` : "—"}</td>
              <td>{o.protected_warning ? "protection unknown/protected " : ""}{o.template_flag === "city" ? "city template " : ""}{o.dev_change_request ? "dev change request" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="text-sm">No opportunities. Run npm run candidates -- --save 12.</p>}
    </main>
  );
}

export default function Opportunities(props: PageProps<"/opportunities">) {
  return <Suspense fallback={<p className="text-sm">Loading…</p>}><Queue searchParams={props.searchParams} /></Suspense>;
}
