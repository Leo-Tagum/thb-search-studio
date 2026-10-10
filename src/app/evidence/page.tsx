import { Suspense } from "react";
import { supabaseAdmin } from "@/lib/supabase-server";
import { uploadEvidenceAction } from "../actions";

async function EvidenceContent() {
  const { data } = await supabaseAdmin().from("evidence_sources").select("*").order("created_at", { ascending: false });
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-semibold">Evidence Library</h1>
      <form action={uploadEvidenceAction} className="grid max-w-xl gap-2 text-sm">
        <input type="file" name="file" required />
        <input name="title" required placeholder="Title" className="border px-1" />
        <select name="tier" required defaultValue="">
          <option value="" disabled>Source tier (1 = official law/agency ... 6 = competitor, internal only)</option>
          {[1, 2, 3, 4, 5, 6].map((t) => <option key={t} value={t}>Tier {t}</option>)}
        </select>
        <input name="sourceUrl" placeholder="Source URL (if any)" className="border px-1" />
        <input name="jurisdiction" placeholder="Jurisdiction" className="border px-1" />
        <label>Effective date <input type="date" name="effectiveDate" /></label>
        <label>Retrieved date <input type="date" name="retrievedDate" /></label>
        <textarea name="provenance" required placeholder="Provenance: where it came from, who gave it, permission to use" className="border px-1" />
        <button className="border px-2 py-1">Upload</button>
      </form>
      <table className="w-full text-xs">
        <thead><tr className="text-left"><th>Title</th><th>Tier</th><th>Jurisdiction</th><th>Provenance</th><th>Uploaded</th></tr></thead>
        <tbody>{(data ?? []).map((e) => (
          <tr key={e.id} className="border-t align-top"><td>{e.title}</td><td>{e.source_tier}</td><td>{e.jurisdiction}</td><td>{e.provenance_note}</td><td>{e.created_at?.slice(0, 10)} by {e.uploaded_by}</td></tr>
        ))}</tbody>
      </table>
    </main>
  );
}

export default function Evidence() {
  return <Suspense fallback={<p className="text-sm">Loading…</p>}><EvidenceContent /></Suspense>;
}
