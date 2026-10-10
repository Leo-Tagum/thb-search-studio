/* eslint-disable @next/next/no-html-link-for-pages -- the CSV link is a file download route, not a page */
import { Suspense } from "react";
import { supabaseAdmin } from "@/lib/supabase-server";

async function List() {
  const db = supabaseAdmin();
  const { data } = await db.from("blog_audit_actions").select("action,old_url,target_url,reason,evidence_summary,status").neq("status", "CANCELLED").order("action");
  const rows = data ?? [];
  return (
    <main className="space-y-4 text-sm">
      <h1 className="text-xl font-semibold">Manual action list (for Leo and Gian)</h1>
      <p>The Studio only lists these. Nothing has been or will be changed in WordPress by this tool. Only decisions you approved appear here. <a className="underline" href="/audit/actions/csv">Download CSV</a> (includes the 301 redirect list).</p>
      {rows.length === 0 ? <p>No approved MERGE / RETIRE / NOINDEX yet.</p> : (
        <table className="w-full text-xs">
          <thead><tr className="text-left"><th>Action</th><th>Old URL</th><th>Target</th><th>Reason</th><th>Status</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.old_url} className="border-t align-top"><td><b>{r.action}</b>{r.action !== "NOINDEX" ? " (301)" : ""}</td><td className="break-all">{r.old_url}</td><td className="break-all">{r.target_url ?? "—"}</td><td>{r.reason}<br /><i>{r.evidence_summary}</i></td><td>{r.status}</td></tr>)}</tbody>
        </table>
      )}
    </main>
  );
}
export default function Actions() { return <Suspense fallback={<p className="text-sm">Loading…</p>}><List /></Suspense>; }
