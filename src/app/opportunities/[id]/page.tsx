import { Suspense } from "react";
import { supabaseAdmin } from "@/lib/supabase-server";
import { decideAction } from "../actions";

type PageRow = { url: string; impressions: number; clicks: number; position: number; protection_status: string | null; template_flag: string | null; in_inventory: boolean };

async function Detail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const db = supabaseAdmin();
  const { data: o } = await db.from("opportunities").select("*").eq("id", id).single();
  if (!o) return <p>Not found.</p>;
  const { data: brief } = await db.from("briefs").select("*").eq("opportunity_id", id).maybeSingle();
  const { data: runs } = await db.from("agent_runs").select("id,agent_key,status,retries,error").eq("subject_id", id).order("created_at");
  const p = o.packet;
  const a1 = o.agent_decision;
  const decidable = o.state === "SEO_REVIEW";
  return (
    <main className="space-y-4 text-sm">
      <h1 className="text-xl font-semibold">{o.title}</h1>
      {typeof sp.error === "string" && <p className="border border-red-600 p-2">Not done: {sp.error}</p>}
      {typeof sp.done === "string" && <p className="border border-green-700 p-2">Recorded. State is now {sp.done}.</p>}
      <p>State <b>{o.state}</b> · kind {p.kind} · engine proposal <b>{o.proposed_action}</b> · Agent 1 <b>{a1?.decision ?? "not run"}</b> · your decision <b>{o.human_decision ?? "none"}</b></p>
      <p>Window {p.window.start}..{p.window.end} (final data) · {p.totals.impressions} impressions, {p.totals.clicks} clicks, avg position {p.totals.position} · {p.totals.queryCount} queries</p>
      <p>{o.target_intent}</p>

      <h2 className="font-semibold">Unknown / not observed (shown, not guessed)</h2>
      <ul className="list-disc pl-5">{(o.data_gaps ?? []).map((g: { key: string; text: string }) => <li key={g.key}>{g.text}</li>)}</ul>

      <h2 className="font-semibold">Flags</h2>
      <ul className="list-disc pl-5">
        {o.protected_warning && <li><b>Warning:</b> a page this would change has protection status unknown or protected. Approving requires an explicit acknowledgement.</li>}
        {o.template_flag === "city" && <li>City-template page (inferred from slug, unconfirmed).</li>}
        {o.dev_change_request && <li>UPDATE on a template-rendered page: this routes to a Developer Change Request for Gian, not an Elementor brief.</li>}
        {!o.protected_warning && o.template_flag !== "city" && <li>None.</li>}
      </ul>

      <h2 className="font-semibold">Overlap</h2>
      <p>{p.overlap.reason}</p>
      {p.overlap.shared_queries.length > 0 && <p>Shared queries: {p.overlap.shared_queries.join("; ")}</p>}
      {p.family && <p>Same intent pattern exists for {p.family.size} places ({p.family.places.slice(0, 8).join(", ")}…).</p>}

      <h2 className="font-semibold">Pages ranking</h2>
      <table className="w-full text-xs">
        <thead><tr className="text-left"><th>URL</th><th>Impr.</th><th>Clicks</th><th>Pos.</th><th>Protection</th><th>Template</th></tr></thead>
        <tbody>
          {(p.pages as PageRow[]).map((pg) => (
            <tr key={pg.url} className="border-t"><td className="break-all">{pg.url}{pg.in_inventory ? "" : " (not in inventory)"}</td><td>{pg.impressions}</td><td>{pg.clicks}</td><td>{pg.position}</td><td>{pg.protection_status ?? "unknown"}</td><td>{pg.template_flag ?? "unknown"}</td></tr>
          ))}
        </tbody>
      </table>
      <h2 className="font-semibold">Top queries</h2>
      <p className="text-xs">{p.queries.slice(0, 12).map((q: { query: string; impressions: number; position: number }) => `${q.query} (${q.impressions}, pos ${q.position})`).join(" · ")}</p>

      <h2 className="font-semibold">Score (THB heuristic; never a gate)</h2>
      {o.score && (
        <>
          <p>{o.score.scored} of {o.score.scoredMax} scorable points: {o.score.reading}. {o.score.disclaimer}</p>
          <ul className="list-disc pl-5 text-xs">
            {Object.entries(o.score.parts).map(([k, v]) => {
              const part = v as { value: number | null; max: number; source: string; note: string };
              return <li key={k}>{k}: {part.value === null ? "not scored" : `${part.value}/${part.max}`} ({part.source}) {part.note}</li>;
            })}
          </ul>
        </>
      )}

      <h2 className="font-semibold">Agent 1 recommendation</h2>
      {a1 ? (
        <div className="space-y-1">
          <p><b>{a1.decision}</b> ({a1.result.confidence} confidence): {a1.result.rationale}</p>
          <p>Existing URLs: {a1.result.existing_urls.join(", ") || "none"}. Cannibalization warning: {String(a1.result.cannibalization.warning)} {a1.result.cannibalization.support}</p>
          <p>Unknowns: {a1.result.unknowns_acknowledged.join(" · ")}</p>
          <ul className="list-disc pl-5 text-xs">{a1.findings.map((f: { claim: string; basis: string; evidence_ids: string[] }, i: number) => <li key={i}>[{f.basis}] {f.claim} {f.evidence_ids.join(", ")}</li>)}</ul>
        </div>
      ) : <p>Not run yet.</p>}

      <h2 className="font-semibold">Your decision</h2>
      {decidable ? (
        <form action={decideAction} className="space-y-2 border p-3">
          <input type="hidden" name="id" value={o.id} />
          <textarea name="reason" required placeholder="Reason (required, saved in the audit log)" className="w-full border p-1" rows={2} />
          {o.protected_warning && <label className="block"><input type="checkbox" name="ack" /> I acknowledge the page&apos;s protection status is unknown or protected.</label>}
          <div className="flex gap-2">
            <button name="choice" value="approve" className="border px-3 py-1">Approve (go to evidence + brief)</button>
            <button name="choice" value="hold_duplication" className="border px-3 py-1">HOLD: duplication/overlap</button>
            <button name="choice" value="hold_evidence" className="border px-3 py-1">HOLD: evidence/timing</button>
            <button name="choice" value="reject" className="border px-3 py-1">REJECT</button>
          </div>
        </form>
      ) : <p>{o.state === "CANDIDATE" ? "Run Agent 1 first (/thb-run-agent)." : `Decision recorded or not available in state ${o.state}.${o.human_reason ? ` Reason: ${o.human_reason}` : ""}`}</p>}

      <h2 className="font-semibold">Agent runs</h2>
      <ul className="list-disc pl-5 text-xs">{(runs ?? []).map((r) => <li key={r.id}>{r.agent_key}: {r.status} (retries {r.retries}) {r.error ?? ""}</li>)}</ul>

      {brief && (
        <>
          <h2 className="font-semibold">Evidence packet and brief</h2>
          <p className="text-xs">{brief.notes}</p>
          {brief.evidence_packet && <details><summary>Evidence packet ({brief.evidence_packet.claims?.length ?? 0} claims, {brief.evidence_packet.sources?.length ?? 0} sources)</summary><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(brief.evidence_packet, null, 2)}</pre></details>}
          {brief.outline && <details open><summary>Brief</summary><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(brief.outline, null, 2)}</pre></details>}
        </>
      )}
    </main>
  );
}

export default function OpportunityPage(props: PageProps<"/opportunities/[id]">) {
  return <Suspense fallback={<p className="text-sm">Loading…</p>}><Detail params={props.params} searchParams={props.searchParams} /></Suspense>;
}
