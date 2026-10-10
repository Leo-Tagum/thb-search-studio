import { Suspense } from "react";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-server";
import { bulkApproveAction } from "./actions";

const VERDICTS = ["UPDATE", "HOLD", "KEEP", "MERGE", "RETIRE", "NOINDEX", "FLAG_ONLY"];

async function Queue({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const verdict = s("verdict"), status = s("status"), issue = s("issue").toLowerCase(), prot = s("prot");
  const db = supabaseAdmin();
  const { data: run } = await db.from("blog_audits").select("audit_run").order("audit_run", { ascending: false }).limit(1).maybeSingle();
  const { data } = await db.from("blog_audits").select("id,page_id,proposed_verdict,final_verdict,status,reason,confidence,protection_status,evidence,agent_review").eq("audit_run", run?.audit_run ?? "").limit(500);
  const { data: pages } = await db.from("pages").select("id,url,title");
  const meta = new Map((pages ?? []).map((p) => [p.id, p]));
  let rows = (data ?? []).map((r) => ({ ...r, page: meta.get(r.page_id) }));
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.proposed_verdict] = (counts[r.proposed_verdict] ?? 0) + 1;
  if (verdict) rows = rows.filter((r) => r.proposed_verdict === verdict);
  if (status) rows = rows.filter((r) => r.status === status);
  if (prot) rows = rows.filter((r) => r.protection_status === prot);
  if (issue) rows = rows.filter((r) => r.reason.toLowerCase().includes(issue));
  rows.sort((a, b) => (b.evidence?.search?.impressions ?? 0) - (a.evidence?.search?.impressions ?? 0));
  const { data: sys } = await db.from("app_settings").select("value").eq("key", `blog_audit_systemic_${run?.audit_run}`).maybeSingle();
  const decided = (data ?? []).filter((r) => r.status !== "PROPOSED").length;

  return (
    <main className="space-y-4 text-sm">
      <h1 className="text-xl font-semibold">Blog audit queue</h1>
      <p>Run {run?.audit_run ?? "none"} · {data?.length ?? 0} posts · {decided} decided. Proposals are recommendations only. Nothing here changes WordPress; approved MERGE / RETIRE / NOINDEX go to the <Link className="underline" href="/audit/actions">manual action list</Link> for Leo and Gian. &quot;No search data&quot; means unknown, not dead.</p>
      <p>{VERDICTS.map((v) => `${v} ${counts[v] ?? 0}`).join(" · ")}</p>
      {typeof sp.msg === "string" && <p className="border p-2">{sp.msg}</p>}
      {(sys?.value?.findings?.length ?? 0) > 0 && (
        <div className="border p-2">
          <b>Site-wide findings (template text shared by 8+ posts; fix once, not per post):</b>
          <ul className="list-disc pl-5">{sys!.value.findings.map((f: { segment: string; posts: number; rules: string[] }) => <li key={f.segment}>{f.posts} posts: {f.rules.join("; ")} — &quot;{f.segment.slice(0, 120)}&quot;</li>)}</ul>
        </div>
      )}
      <form className="flex flex-wrap gap-2">
        <select name="verdict" defaultValue={verdict}><option value="">any verdict</option>{VERDICTS.map((v) => <option key={v}>{v}</option>)}</select>
        <select name="status" defaultValue={status}><option value="">any status</option>{["PROPOSED", "APPROVED", "CHANGED", "HELD"].map((v) => <option key={v}>{v}</option>)}</select>
        <select name="prot" defaultValue={prot}><option value="">any protection</option>{["unknown", "protected", "not_protected"].map((v) => <option key={v}>{v}</option>)}</select>
        <input name="issue" defaultValue={issue} placeholder="issue text (e.g. rating, 25+, competitor)" className="border px-1" />
        <button className="border px-2">Filter</button>
      </form>
      <form action={bulkApproveAction} className="space-y-2">
        <table className="w-full text-xs">
          <thead><tr className="text-left"><th></th><th>Post</th><th>Proposed</th><th>Status</th><th>Conf.</th><th>Clicks / impr. (16 mo)</th><th>Why</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td>{["MERGE", "RETIRE", "NOINDEX"].includes(r.proposed_verdict) ? "" : <input type="checkbox" name="ids" value={r.id} />}</td>
                <td className="break-all"><Link className="underline" href={`/audit/${r.id}`}>{r.page?.title ?? r.page?.url}</Link></td>
                <td><b>{r.proposed_verdict}</b>{r.agent_review ? ` (Agent 1: ${r.agent_review.decision})` : ""}</td>
                <td>{r.status}{r.final_verdict && r.final_verdict !== r.proposed_verdict ? ` → ${r.final_verdict}` : ""}</td>
                <td>{r.confidence}</td>
                <td>{r.evidence?.search?.hasData ? `${r.evidence.search.clicks} / ${r.evidence.search.impressions}` : "unknown"}</td>
                <td>{r.reason.slice(0, 160)}{r.reason.length > 160 ? "…" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-2">
          <input name="reason" required placeholder="Reason for approving the ticked rows (required)" className="w-96 border px-1" />
          <label><input type="checkbox" name="ack" /> I acknowledge protection status is UNKNOWN for these posts</label>
          <button className="border px-2">Approve ticked (KEEP / UPDATE only)</button>
        </div>
        <p className="text-xs">MERGE, RETIRE and NOINDEX have no checkbox: each must be opened and approved one at a time, with its own reason.</p>
      </form>
    </main>
  );
}

export default function Audit(props: PageProps<"/audit">) {
  return <Suspense fallback={<p className="text-sm">Loading…</p>}><Queue searchParams={props.searchParams} /></Suspense>;
}
