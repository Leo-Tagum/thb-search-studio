import { Suspense } from "react";
import { supabaseAdmin } from "@/lib/supabase-server";

async function BrandContent() {
  const db = supabaseAdmin();
  const { data: facts } = await db.from("brand_facts").select("*").order("fact_key");
  const { data: conflicts } = await db.from("brand_fact_conflicts").select("*").order("fact_key");
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-semibold">Brand facts</h1>
      <p className="text-sm">Proposed facts await Juan&apos;s approval. Conflicting claims stay blocked until he picks the wording.</p>
      <table className="w-full text-xs">
        <thead><tr className="text-left"><th>Key</th><th>Value</th><th>Source</th><th>Status</th></tr></thead>
        <tbody>{(facts ?? []).map((f) => <tr key={f.id} className="border-t align-top"><td>{f.fact_key}</td><td>{f.fact_value}</td><td>{f.source_ref}</td><td>{f.status}</td></tr>)}</tbody>
      </table>
      <h2 className="font-semibold">Conflicts ({conflicts?.length ?? 0})</h2>
      <ul className="list-disc pl-5 text-xs">{(conflicts ?? []).map((c) => <li key={c.id}>{c.fact_key}: {JSON.stringify(c.variants)} {c.resolved_value ? `→ ${c.resolved_value}` : "(unresolved)"}</li>)}</ul>
    </main>
  );
}

export default function Brand() {
  return <Suspense fallback={<p className="text-sm">Loading…</p>}><BrandContent /></Suspense>;
}
