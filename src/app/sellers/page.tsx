import { Suspense } from "react";
import { supabaseAdmin } from "@/lib/supabase-server";

// Lists briefs with counts only. Passage text is never shown here; internal-only text stays out of the UI.
async function SellersContent() {
  const db = supabaseAdmin();
  const { data: briefs } = await db.from("seller_briefs").select("id,case_id,title,use_level,review_status,review_note").order("case_id");
  const { data: passages } = await db.from("seller_brief_passages").select("brief_id,visibility");
  const { data: perms } = await db.from("seller_permissions").select("brief_id,publication_cleared");
  const cnt = (id: string, v: string) => (passages ?? []).filter((p) => p.brief_id === id && p.visibility === v).length;
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-semibold">Seller briefs ({briefs?.length ?? 0})</h1>
      <p className="text-sm">Internal-only passages are tagged not-for-publication and never reach writers or drafts. Publication clearance is separate and documented per brief.</p>
      <table className="w-full text-xs">
        <thead><tr className="text-left"><th>Case</th><th>Situation</th><th>Use level</th><th>Review</th><th>Publishable</th><th>Internal-only</th><th>Publication cleared</th></tr></thead>
        <tbody>{(briefs ?? []).map((b) => (
          <tr key={b.id} className="border-t"><td>{b.case_id}</td><td>{b.title}</td><td>{b.use_level}</td>
            <td>{b.review_status === "pending_review" ? "pending (Juan's flag)" : "ok"}</td><td>{cnt(b.id, "publishable")}</td><td>{cnt(b.id, "internal_only")}</td>
            <td>{(perms ?? []).some((p) => p.brief_id === b.id && p.publication_cleared) ? "yes" : "no"}</td></tr>
        ))}</tbody>
      </table>
    </main>
  );
}

export default function Sellers() {
  return <Suspense fallback={<p className="text-sm">Loading…</p>}><SellersContent /></Suspense>;
}
