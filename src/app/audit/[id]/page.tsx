import { Suspense } from "react";
import { supabaseAdmin } from "@/lib/supabase-server";
import { decideAuditAction } from "../actions";

type Hit = { text: string; context: string };

async function Detail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const db = supabaseAdmin();
  const { data: a } = await db.from("blog_audits").select("*").eq("id", id).single();
  if (!a) return <p>Not found.</p>;
  const { data: page } = await db.from("pages").select("url,title,modified_at").eq("id", a.page_id).single();
  const e = a.evidence; const c = a.checks;
  const risky = ["MERGE", "RETIRE", "NOINDEX"].includes(a.proposed_verdict);
  return (
    <main className="space-y-4 text-sm">
      <h1 className="text-xl font-semibold">{page?.title}</h1>
      <p className="break-all"><a className="underline" href={page?.url}>{page?.url}</a> · last modified {page?.modified_at?.slice(0, 10)}</p>
      {typeof sp.error === "string" && <p className="border border-red-600 p-2">Not done: {sp.error}</p>}
      {typeof sp.done === "string" && <p className="border border-green-700 p-2">Recorded: {sp.done}.</p>}
      <p>Proposed <b>{a.proposed_verdict}</b> (confidence {a.confidence}) · status <b>{a.status}</b>{a.final_verdict ? <> · final <b>{a.final_verdict}</b></> : null}{a.target_url ? <> · target <span className="break-all">{a.target_url}</span></> : null}</p>
      <p>{a.reason}</p>
      {a.decision_reason && <p>Your reason: {a.decision_reason}</p>}
      {a.agent_review && <div className="border p-2"><b>Agent 1 review (advisory): {a.agent_review.decision}</b>{a.agent_review.agrees_with_engine === false ? " — disagrees with the engine" : ""}<p>{a.agent_review.rationale}</p></div>}

      <h2 className="font-semibold">Unknown / not observed</h2>
      <ul className="list-disc pl-5">{a.unknowns.map((u: string) => <li key={u}>{u}</li>)}</ul>

      <h2 className="font-semibold">Search (Search Console {e.search.window?.start}..{e.search.window?.end})</h2>
      {e.search.hasData ? <p>{e.search.clicks} clicks · {e.search.impressions} impressions · avg position {e.search.position}</p> : <p>No rows: unknown, not zero.</p>}
      <table className="text-xs"><tbody>{e.search.queries.map((q: { query: string; impressions: number; clicks: number; position: number }) => <tr key={q.query}><td className="pr-4">{q.query}</td><td className="pr-4">{q.impressions} impr.</td><td className="pr-4">{q.clicks} clicks</td><td>pos {q.position}</td></tr>)}</tbody></table>

      <h2 className="font-semibold">Structure</h2>
      <p>{e.structure.wordCount} words (own text, template blocks excluded) · {e.structure.linksOut} internal links out · {e.structure.inboundCount} in from other posts (partial: pages not fetched)</p>
      {e.structure.inboundFrom.length > 0 && <ul className="list-disc pl-5 text-xs">{e.structure.inboundFrom.map((u: string) => <li key={u} className="break-all">{u}</li>)}</ul>}

      <h2 className="font-semibold">Overlap (shared ranking queries only)</h2>
      {e.overlap.length === 0 ? <p>None found.</p> : <ul className="list-disc pl-5">{e.overlap.map((o: { url: string; kind: string; supported: boolean; sharedCount: number; sharedSample: string[]; fractionOfThisPostImpressions: number }) => <li key={o.url} className="break-all">{o.supported ? "SUPPORTED" : "not supported"} · {o.kind} · {o.url} · {o.sharedCount} shared queries ({Math.round(o.fractionOfThisPostImpressions * 100)}% of this post&apos;s impressions): {o.sharedSample.join("; ")}</li>)}</ul>}
      {e.notes.length > 0 && <ul className="list-disc pl-5">{e.notes.map((n: string) => <li key={n}>{n}</li>)}</ul>}

      <h2 className="font-semibold">Content checks (exact text shown)</h2>
      {c.skipped ? <p>{c.skipped}</p> : (
        <ul className="list-disc pl-5">
          {c.competitors.map((x: { kind: string; domain: string; url: string }) => <li key={x.url}>Competitor {x.kind}: {x.domain} ({x.url})</li>)}
          {c.pendingFacts.map((x: { fact: string; hit: Hit }, i: number) => <li key={i}>Pending brand fact — {x.fact}: &quot;…{x.hit.context}…&quot;</li>)}
          {c.sourcedFactIssues.map((x: string) => <li key={x}>{x}</li>)}
          {c.ratingHits.map((x: Hit, i: number) => <li key={i}>Rating rule: &quot;…{x.context}…&quot;</li>)}
          {c.legal.count > 0 && <li>{c.legal.count} legal/tax/permit-type terms (heuristic); official links: {c.legal.officialLinks.length}; &quot;confirm with a professional&quot; language: {c.legal.professionalConfirmation ? "yes" : "no"}. e.g. {c.legal.samples.slice(0, 2).map((x: Hit) => `"…${x.context}…"`).join(" ")}</li>}
          {e.advisories.map((x: string) => <li key={x}>Advisory: {x}</li>)}
        </ul>
      )}

      <h2 className="font-semibold">Your decision</h2>
      {a.protection_status === "unknown" && !["KEEP", "FLAG_ONLY"].includes(a.proposed_verdict) && <p className="border p-2">Protection status is UNKNOWN. Approving a change needs the acknowledgement box.</p>}
      <form action={decideAuditAction} className="space-y-2">
        <input type="hidden" name="id" value={a.id} />
        <textarea name="reason" required placeholder="Reason (required)" className="block w-full max-w-xl border p-1" rows={3} />
        <div className="flex flex-wrap items-center gap-2">
          <select name="verdict" defaultValue=""><option value="">(change to…)</option>{["KEEP", "UPDATE", "HOLD", "MERGE", "RETIRE", "NOINDEX"].filter((v) => v !== a.proposed_verdict).map((v) => <option key={v}>{v}</option>)}</select>
          <input name="target" placeholder="target URL (MERGE / RETIRE)" className="w-80 border px-1" />
          <label><input type="checkbox" name="ack" /> I acknowledge protection status is UNKNOWN</label>
        </div>
        <div className="flex gap-2">
          <button name="choice" value="approve" className="border px-2">Approve {risky ? "(one at a time)" : ""}</button>
          <button name="choice" value="change" className="border px-2">Change verdict</button>
          <button name="choice" value="hold" className="border px-2">Hold</button>
        </div>
      </form>
    </main>
  );
}

export default function AuditDetail(props: PageProps<"/audit/[id]">) {
  return <Suspense fallback={<p className="text-sm">Loading…</p>}><Detail params={props.params} searchParams={props.searchParams} /></Suspense>;
}
