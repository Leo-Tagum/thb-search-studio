import { Suspense } from "react";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-server";
import { voiceApproveAction } from "./actions";

async function Studio({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const db = supabaseAdmin();
  const { data: arts } = await db.from("articles").select("id,title,state,slug,created_at,branch_of,pipeline_mode").order("created_at");
  const { data: vr } = await db.from("brand_facts").select("fact_value,status,provisional_by,provisional_at,approved_by").eq("fact_key", "voice_reference").single();
  let ref: { excerpts: { id: string; use: string; text: string; source_url: string }[]; imitate: string[]; avoid: string[] } | null = null;
  try { ref = vr && !/^NEEDED/.test(vr.fact_value) ? JSON.parse(vr.fact_value) : null; } catch { ref = null; }
  const { count: pending } = await db.from("approver_registry").select("*", { count: "exact", head: true }).eq("status", "PENDING");
  return (
    <main className="space-y-4 text-sm">
      <h1 className="text-xl font-semibold">Content Studio</h1>
      {typeof sp.error === "string" && <p className="border border-red-600 p-2">Not done: {sp.error}</p>}
      {sp.done === "voice" && <p className="border border-green-700 p-2">Voice reference provisionally approved.</p>}
      <h2 className="font-semibold">Articles</h2>
      <ul className="list-disc pl-5">{(arts ?? []).map((a) => <li key={a.id}><Link className="underline" href={`/studio/${a.id}`}>{a.title}</Link> — {a.state}{a.branch_of ? (a.pipeline_mode === "team" ? " · team branch of the classic article (comparison run)" : " · classic + V1 revision of the classic article") : ""}</li>)}</ul>
      {!arts?.length && <p>No article yet. Approve a brief on an opportunity in BRIEF_REVIEW to start one.</p>}
      <p><Link className="underline" href="/studio/approvers">Approval Room accounts</Link>{pending ? ` (${pending} waiting for your confirmation)` : ""}</p>

      <h2 className="font-semibold">Voice reference</h2>
      <p>Status: <b>{vr?.status}</b>{vr?.provisional_by ? ` · provisionally approved by ${vr.provisional_by} (${vr.provisional_at}); Juan confirms in the Approval Room` : " · not yet approved (Agent 7 is blocked until you approve it provisionally)"}{vr?.approved_by ? ` · approved by ${vr.approved_by}` : ""}</p>
      {ref ? (
        <>
          <p>Style only. None of these pages&apos; facts count. The older-home post is primary; Juan&apos;s page only for &quot;we&quot; sentences; the belongings post only for warmth.</p>
          <ul className="list-disc pl-5">{ref.excerpts.map((e) => <li key={e.id}>[{e.use}] {e.text}</li>)}</ul>
          <h3 className="font-semibold">Imitate</h3><ul className="list-disc pl-5">{ref.imitate.map((t) => <li key={t}>{t}</li>)}</ul>
          <h3 className="font-semibold">Avoid</h3><ul className="list-disc pl-5">{ref.avoid.map((t) => <li key={t}>{t}</li>)}</ul>
          {!vr?.provisional_by && vr?.status !== "approved" && <form action={voiceApproveAction}><button className="border px-3 py-1">Approve provisionally (Juan confirms with the first article)</button></form>}
        </>
      ) : <p>Not built yet: npx tsx --env-file=.env.local scripts/build-voice-reference.mts</p>}
    </main>
  );
}

export default function StudioPage(props: PageProps<"/studio">) {
  return <Suspense fallback={<p className="text-sm">Loading…</p>}><Studio searchParams={props.searchParams} /></Suspense>;
}
