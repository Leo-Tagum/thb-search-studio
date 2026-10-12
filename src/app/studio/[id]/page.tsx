/* eslint-disable @typescript-eslint/no-explicit-any -- DB JSON columns */
import { Suspense } from "react";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-server";
import { load, stateOf } from "@/lib/studio/service";
import { declinesOfRow } from "@/lib/studio/declines-view";
import { unitStrings, type Unit } from "@/lib/studio/schema";
import { lineDiff } from "@/lib/studio/diff";
import { modeAction, sectionAction } from "../actions";
import { loadTeamView } from "@/lib/team/store";
import { StuckInbox, TeamTab } from "./team-panel";
import { modeChangeRule, modeOf } from "@/lib/team/mode";

const TABS = [["brief", "Brief"], ["draft", "Draft"], ["evidence", "Evidence"], ["critiques", "Agent critiques"], ["seo", "SEO/AEO/GEO"], ["diff", "Diff"], ["approvals", "Approvals"], ["preview", "Preview"], ["team", "Team"]] as const;

function Actions({ article, unit, status }: { article: string; unit: string; status: string }) {
  const kinds = status === "LOCKED" ? [["reopen", "Reopen for revision"]] : ["ESCALATED", "BLOCKED_CLAIM", "BLOCKED_PRIVACY"].includes(status) ? [["request_revision", "Send back to writer with this directive"], ["hold", "Hold"]] : [];
  if (!kinds.length) return null;
  return (
    <form action={sectionAction} className="mt-1 flex flex-wrap gap-2 border p-2">
      <input type="hidden" name="article" value={article} /><input type="hidden" name="unit" value={unit} />
      <input name="text" placeholder="Directive (required except Hold; saved in the audit log)" className="min-w-80 flex-1 border px-1" />
      {kinds.map(([k, label]) => <button key={k} name="kind" value={k} className="border px-2">{label}</button>)}
    </form>
  );
}

async function Detail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" && TABS.some(([k]) => k === sp.tab) ? sp.tab : "draft";
  const db = supabaseAdmin();
  const L = await load(db, id);
  const secIds = L.sections.map((s) => s.id);
  const { data: allVers } = await db.from("section_versions").select("*").in("section_id", secIds).order("version_no");
  const { data: reviews } = await db.from("section_reviews").select("*").in("section_id", secIds).order("created_at");
  const { data: esc } = await db.from("escalations").select("*").eq("article_id", id).eq("status", "OPEN");
  const { data: props } = await db.from("proposals").select("*").eq("article_id", id).order("created_at");
  const { data: ver } = L.article.locked_version_id ? await db.from("article_versions").select("*").eq("id", L.article.locked_version_id).single() : { data: null };
  const keyOf = (sid: string) => L.sections.find((s) => s.id === sid)?.section_key;
  const mode = modeOf(L.article);
  const teamView = mode === "team" ? await loadTeamView(db, id) : null;
  const otherMode = mode === "classic" ? "team" : "classic";
  const change = modeChangeRule({ current: mode, next: otherMode, isBranch: !!L.article.branch_of, sectionsWritten: L.sections.filter((s) => s.status !== "NEEDS_WRITE" || s.current_version_id).length, hasProposal: (props ?? []).length > 0 });
  const blockers = L.sections.map((s) => ({ s, st: stateOf(s) })).filter((x) => ["ESCALATED", "BLOCKED_CLAIM", "BLOCKED_PRIVACY"].includes(x.st.status));
  return (
    <main className="space-y-4 text-sm">
      <p><Link className="underline" href="/studio">← Content Studio</Link></p>
      <h1 className="text-xl font-semibold">{L.article.title}</h1>
      {typeof sp.error === "string" && <p className="border border-red-600 p-2">Not done: {sp.error}</p>}
      {typeof sp.done === "string" && <p className="border border-green-700 p-2">Recorded. Section is now {sp.done}.</p>}
      <form action={modeAction} className="flex flex-wrap items-center gap-2 border p-2">
        <input type="hidden" name="article" value={id} /><input type="hidden" name="mode" value={otherMode} />
        <span>Pipeline: <b>{mode}</b>{L.article.branch_of ? " (team branch)" : ""}</span>
        {change.ok ? <button className="border px-2">Switch to {otherMode} mode</button> : <span className="text-neutral-600">Mode locked: {change.reason}</span>}
      </form>
      <p>State <b>{L.article.state}</b> · slug {L.article.slug} · keyword &quot;{L.article.primary_keyword}&quot; · version {L.article.version_hash ? L.article.version_hash.slice(0, 12) : "not assembled"} · approved {L.article.approved_hash ? "yes (hash matches)" : "no"}</p>
      {blockers.length > 0 && (
        <div className="border border-red-600 p-2">
          <b>Blockers</b>
          <ul className="list-disc pl-5">{blockers.map(({ s, st }) => <li key={s.id}><b>{st.key}</b> {st.status}: {st.blockedBy ?? st.escalation?.reason}</li>)}</ul>
        </div>
      )}
      {(esc ?? []).filter((e) => e.issue_key.startsWith("article:")).length > 0 && <div className="border border-red-600 p-2"><b>Article checks failed</b><ul className="list-disc pl-5">{(esc ?? []).filter((e) => e.issue_key.startsWith("article:")).map((e) => <li key={e.id}>{e.reason}</li>)}</ul></div>}
      {teamView && <StuckInbox article={id} items={teamView.stuck} />}
      <nav className="flex gap-3">{TABS.map(([k, label]) => <Link key={k} href={`/studio/${id}?tab=${k}`} className={k === tab ? "font-semibold underline" : "underline-offset-2 hover:underline"}>{label}</Link>)}</nav>

      {tab === "brief" && (
        <div className="space-y-2">
          <p><b>Answer first:</b> {L.brief.outline.answer_first}</p>
          <p><b>Target reader:</b> {L.brief.outline.target_reader}</p>
          <ol className="list-decimal pl-5">{L.brief.outline.outline.map((o: any) => <li key={o.h2}><b>{o.h2}</b> — {o.purpose} {o.claim_ids.length ? `[${o.claim_ids.join(", ")}]` : ""}</li>)}</ol>
          <p><b>Link plan:</b> {L.brief.outline.link_plan.map((l: any) => l.to_url).join(" · ")}</p>
          <b>Open items</b><ul className="list-disc pl-5">{L.brief.outline.open_items.map((t: string) => <li key={t}>{t}</li>)}</ul>
        </div>
      )}

      {tab === "draft" && (
        <div className="space-y-4">
          <p>Body only: the header, footer, nav and review widget come from the site template. Composed blocks (About Juan, Related Guides, Sources, CTA) are added by the app. See Preview.</p>
          {L.sections.map((s) => {
            const st = stateOf(s);
            const cur = (allVers ?? []).find((v) => v.id === s.current_version_id);
            return (
              <section key={s.id} className="border p-3">
                <h2 className="font-semibold">{st.key}: {s.brief_h2} <span className="font-normal">— {st.status}{st.versionNo ? ` · v${st.versionNo}` : ""}{st.status === "LOCKED" ? " (locked)" : ""}</span></h2>
                {st.issues.length > 0 && <ul className="list-disc pl-5 text-xs">{st.issues.map((i) => <li key={i.key}>open issue <b>{i.key}</b> (revision attempts {i.attempts} of 2): {i.text}</li>)}</ul>}
                {(() => { const dl = declinesOfRow(s); return dl.declined.length > 0 ? <div className="mt-1 text-xs"><b>Declined by the writer (for Leo)</b><ul className="list-disc pl-5">{dl.declined.map((d) => <li key={d.key}><b>{d.key}</b> (raised {d.raised}x): {d.text} <i>Writer&apos;s reason: {d.reason}</i></li>)}</ul></div> : null; })()}
                {cur ? <div className="mt-2 space-y-1 whitespace-pre-wrap">{unitStrings(cur.content as Unit).slice((cur.content as Unit).kind === "faq" ? 0 : 1).map((t, i) => <p key={i}>{t}</p>)}</div> : <p className="text-xs">Not written yet.</p>}
                <Actions article={id} unit={st.key} status={st.status} />
              </section>
            );
          })}
        </div>
      )}

      {tab === "evidence" && (
        <div className="space-y-2">
          <p>Claim ledger. Agents cite these ids; the writer cannot add claims.</p>
          <table className="w-full text-xs"><thead><tr className="text-left"><th>Id</th><th>Claim (locked wording once verified)</th><th>Risk</th><th>Support</th><th>Source</th></tr></thead>
            <tbody>{[...L.claims.values()].map((c) => <tr key={c.id} className="border-t align-top"><td>{c.id}</td><td>{c.text}{c.lockedText ? " 🔒" : ""}</td><td>{c.risk}</td><td>{c.support}</td><td>{c.sourceId ? L.sources.get(c.sourceId)?.title : "—"}</td></tr>)}</tbody></table>
        </div>
      )}

      {(tab === "critiques" || tab === "seo") && (
        <div className="space-y-2">
          {(reviews ?? []).filter((r) => (tab === "seo" ? r.agent_key === "thb-06-seo-aeo-geo-auditor" : r.agent_key !== "thb-06-seo-aeo-geo-auditor")).map((r) => (
            <div key={r.id} className="border p-2">
              <b>{keyOf(r.section_id)}</b> · {r.agent_key} · {r.decision}{r.advisory_score != null ? ` · advisory score ${r.advisory_score}${r.advisory_score < 85 ? " (revise recommended; advisory only)" : ""}` : ""}
              <ul className="list-disc pl-5 text-xs">{(r.findings as any[]).map((f, i) => <li key={i}>[{f.severity}] {f.issue_key}: {f.note}</li>)}</ul>
            </div>
          ))}
          {!(reviews ?? []).length && <p>No reviews yet.</p>}
        </div>
      )}

      {tab === "diff" && (
        <div className="space-y-3">
          <p>This is a CREATE, so there is no live text to compare. Below: each section&apos;s version history, before vs after. (For an UPDATE the live text is shown against the proposed patch.)</p>
          {L.sections.map((s) => {
            const vs = (allVers ?? []).filter((v) => v.section_id === s.id);
            return vs.length < 1 ? null : (
              <section key={s.id} className="border p-2">
                <b>{s.section_key}</b>
                {vs.map((v, i) => {
                  const prev = i ? unitStrings(vs[i - 1].content) : [];
                  const d = lineDiff(prev, unitStrings(v.content));
                  return <div key={v.id} className="mt-1 text-xs"><div>v{v.version_no} by {v.created_by}: {v.reason}</div>{d.map((l, j) => <div key={j} className={l.kind === "add" ? "text-green-800" : l.kind === "del" ? "text-red-700 line-through" : "opacity-60"}>{l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}{l.text}</div>)}</div>;
                })}
              </section>
            );
          })}
        </div>
      )}

      {tab === "approvals" && (
        <div className="space-y-2">
          <p>Final sign-off comes from Juan through the THB Approval Room. Create the proposal with <code>npm run studio -- proposal {id} &lt;file&gt;</code> (Claude Code republishes the Approval Room), then read the decisions back with <code>sync-approvals</code>. A decision counts only for a confirmed approver, on the exact stored version.</p>
          <ul className="list-disc pl-5">{(props ?? []).map((p) => <li key={p.id}>proposal {p.id} · {p.status} · created {p.created_at}{p.voice_snapshot ? " · includes the voice reference" : ""}</li>)}</ul>
          {!(props ?? []).length && <p>No proposal yet (the article must be in HUMAN_REVIEW).</p>}
        </div>
      )}

      {tab === "team" && (mode === "team" ? <TeamTab view={teamView} /> : <p>This article runs in classic mode. The Team tab appears for team-mode articles.</p>)}

      {tab === "preview" && (
        ver ? <iframe title="Preview" sandbox="" srcDoc={ver.body.html} className="h-[80vh] w-full border" /> : <p>The preview appears when every section is locked and the article is assembled.</p>
      )}
    </main>
  );
}

export default function StudioArticle(props: PageProps<"/studio/[id]">) {
  return <Suspense fallback={<p className="text-sm">Loading…</p>}><Detail params={props.params} searchParams={props.searchParams} /></Suspense>;
}
