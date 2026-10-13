import { Suspense } from "react";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-server";
import { confirmApproverAction } from "../actions";

async function Approvers({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { data } = await supabaseAdmin().from("approver_registry").select("*").order("first_seen_at");
  return (
    <main className="space-y-4 text-sm">
      <p><Link className="underline" href="/studio">← Content Studio</Link></p>
      <h1 className="text-xl font-semibold">Approval Room accounts</h1>
      <p>Anyone in the org can view, comment and click in the Approval Room. Only accounts you confirm here count as approvals; everyone else is saved as feedback. An account appears here after its first click (read in with <code>npm run studio -- sync-approvals</code>). Confirm by the display name and account id shown. The operator (you) can never be the approver or the secondary: register your own account as &quot;operator&quot;.</p>
      {typeof sp.error === "string" && <p className="border border-red-600 p-2">Not done: {sp.error}</p>}
      {sp.done && <p className="border border-green-700 p-2">Recorded.</p>}
      <table className="w-full text-xs">
        <thead><tr className="text-left"><th>Display name</th><th>Account id</th><th>First seen</th><th>Status</th><th>Confirm as</th></tr></thead>
        <tbody>
          {(data ?? []).map((r) => (
            <tr key={r.viewer_id} className="border-t align-top">
              <td>{r.display_name ?? "(no name)"}</td><td className="font-mono">{r.viewer_id}</td><td>{r.first_seen_at}</td>
              <td>{r.status}{r.role ? ` · ${r.role}` : ""}{r.label ? ` (${r.label})` : ""}</td>
              <td>
                {r.status === "PENDING" ? (
                  <form action={confirmApproverAction} className="flex gap-2">
                    <input type="hidden" name="viewer" value={r.viewer_id} />
                    <select name="role"><option value="approver">approver (e.g. Cherry; Juan may also approve)</option><option value="secondary">secondary (a second approver, if a proposal asks for one)</option><option value="operator">operator (this is Leo)</option></select>
                    <input name="label" required placeholder="who is this? e.g. Cherry" className="border px-1" />
                    <button className="border px-2">Confirm: this is…</button>
                  </form>
                ) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data?.length && <p>No account has clicked yet.</p>}
    </main>
  );
}

export default function ApproversPage(props: PageProps<"/studio/approvers">) {
  return <Suspense fallback={<p className="text-sm">Loading…</p>}><Approvers searchParams={props.searchParams} /></Suspense>;
}
