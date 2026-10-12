/* eslint-disable @typescript-eslint/no-explicit-any -- DB rows */
// Phase 3c task 14: a team-mode BRANCH of a classic article, for the comparison run. The branch is a new real article (is_fixture = false,
// pipeline_mode = 'team', branch_of = the original). The original is only read: a fingerprint of everything attached to it is taken before the
// first write and compared after the load, and any difference is reported (the caller stops).
//   - the brief is COPIED (opportunity_id null, so no lookup by opportunity can ever find two briefs, and a ROOT_CAUSE_NOTE revision edits the copy);
//   - the claim ledger is COPIED under the branch's article id (claim keys line up with the sections' claim ids; the row ids are new);
//   - each locked unit is copied as the branch's first version (same content, same hash), then reopened by Leo's directive;
//   - the optional findings of every review of each locked version become declinable should-fix items in the unit's team
//     envelope (not tickets, so the 10-ticket budget stays free). A count other than the expected one stops everything before any write.
// Nothing here approves, publishes, locks (beyond the copied locked state it immediately reopens) or writes to WordPress.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { agentLikeActor, resolveActorError } from "./actors";
import { auditArticle, orchestratorFor, SYSTEM } from "./service";
import { contentHash, sha256, stableStringify } from "./hash";
import { unitText } from "./schema";
import { saveEnvelope, type Envelope } from "./team-envelope";
import { newTeamSection, reopen, splitSentences, type Collected, type CouncilRole, type TeamSectionState } from "../team/loop";
import { snapshotKey } from "../team/snapshots";

export const COUNCIL_OF_AGENT: Record<string, CouncilRole> = { "thb-05-fact-privacy-auditor": "V1", "thb-06-seo-aeo-geo-auditor": "V2", "thb-07-editorial-critic": "V3" };
export const BRANCH_DIRECTIVE = "Team comparison revision. Revise this unit for the corrections listed for you: fix each one, or decline it with a reason. Keep every verified claim and the approved identity (keyword, H2, slug) unchanged. Change nothing else.";

// ---------- findings ----------
export type SeededFinding = { unit: string; role: CouncilRole; key: string; text: string; claimId: string | null; reviewId: string };

/** Every optional finding in every review of each unit's LOCKED version (a reviewer may review the same locked version more than once),
 *  deduplicated by reviewer, unit and key (the first review that raised a key keeps it). Pure. */
export function collectFindings(sections: any[], reviews: any[]): SeededFinding[] {
  const out: SeededFinding[] = [];
  const seen = new Set<string>();
  for (const s of [...sections].sort((a, b) => a.position - b.position)) {
    const mine = reviews.filter((r) => r.section_id === s.id && r.version_id === s.locked_version_id && COUNCIL_OF_AGENT[r.agent_key])
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
    for (const r of mine) {
      for (const f of (r.findings ?? []) as any[]) {
        if (f.severity !== "optional") continue;
        const id = `${s.section_key}|${COUNCIL_OF_AGENT[r.agent_key]}|${f.issue_key}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ unit: s.section_key, role: COUNCIL_OF_AGENT[r.agent_key], key: f.issue_key, text: f.note, claimId: f.claim_id ?? null, reviewId: r.id });
      }
    }
  }
  return out;
}

// ---------- fingerprint of the original (read only) ----------
const PAGE = 1000;
async function fetchAll(db: SupabaseClient, table: string, filter: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await filter(db.from(table).select("*")).order("id").range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}
export type Fingerprint = { total: string; parts: Record<string, { count: number; hash: string }> };

/** Row counts and content hashes of everything attached to one article. Reads only. */
export async function fingerprint(db: SupabaseClient, articleId: string): Promise<Fingerprint> {
  const art = await fetchAll(db, "articles", (q) => q.eq("id", articleId));
  const briefId = art[0]?.brief_id as string | undefined;
  const brief = briefId ? await fetchAll(db, "briefs", (q) => q.eq("id", briefId)) : [];
  const secs = await fetchAll(db, "article_sections", (q) => q.eq("article_id", articleId));
  const sids = secs.map((s) => s.id);
  const inSecs = (t: string) => (sids.length ? fetchAll(db, t, (q) => q.in("section_id", sids)) : Promise.resolve([]));
  const parts: Record<string, any[]> = {
    articles: art, briefs: brief, article_sections: secs, section_versions: await inSecs("section_versions"), section_reviews: await inSecs("section_reviews"),
    claims: await fetchAll(db, "claims", (q) => q.eq("article_id", articleId)), article_versions: await fetchAll(db, "article_versions", (q) => q.eq("article_id", articleId)),
    escalations: await fetchAll(db, "escalations", (q) => q.eq("article_id", articleId)), proposals: await fetchAll(db, "proposals", (q) => q.eq("article_id", articleId)),
    approvals: await fetchAll(db, "approvals", (q) => q.eq("subject_id", articleId)), tickets: await fetchAll(db, "tickets", (q) => q.eq("article_id", articleId)),
    team_runs: await fetchAll(db, "team_runs", (q) => q.eq("article_id", articleId)), agent_runs: await fetchAll(db, "agent_runs", (q) => q.eq("subject_id", articleId)),
    audit_events: await fetchAll(db, "audit_events", (q) => q.eq("subject_id", articleId)),
  };
  const out: Fingerprint["parts"] = {};
  for (const [k, rows] of Object.entries(parts)) out[k] = { count: rows.length, hash: sha256(stableStringify(rows)) };
  return { total: sha256(stableStringify(out)), parts: out };
}
export const fingerprintDiff = (a: Fingerprint, b: Fingerprint): string[] => Object.keys(a.parts).filter((k) => a.parts[k].hash !== b.parts[k]?.hash || a.parts[k].count !== b.parts[k]?.count).map((k) => `${k}: ${a.parts[k].count} rows -> ${b.parts[k]?.count ?? "missing"}`);

// ---------- the plan (pure) ----------
export type OriginalRows = { article: any; brief: any; sections: any[]; versions: any[]; reviews: any[]; claims: any[] };
export type BranchPlan = {
  articleId: string; briefId: string; findings: SeededFinding[];
  article: Record<string, unknown>; brief: Record<string, unknown>; claims: Record<string, unknown>[];
  units: { section: Record<string, unknown>; version: Record<string, unknown>; pointers: { current_version_id: string; locked_version_id: string }; env: Envelope; findings: number }[];
};

export function planBranch(o: OriginalRows, ids: { uuid: () => string } = { uuid: randomUUID }): BranchPlan {
  const articleId = ids.uuid(), briefId = ids.uuid();
  const findings = collectFindings(o.sections, o.reviews);
  const sorted = [...o.sections].sort((a, b) => a.position - b.position);
  const units = sorted.map((s) => {
    const v = o.versions.find((x) => x.id === s.locked_version_id);
    if (!v) throw new Error(`unit ${s.section_key} has no locked version to copy`);
    const sid = ids.uuid(), vid = ids.uuid();
    const text = unitText(v.content);
    const locked: TeamSectionState = { ...newTeamSection(s.section_key), status: "LOCKED", versionNo: v.version_no, versionHash: v.content_hash, sig: v.material_sig, sentences: splitSentences(text), lockedHash: v.content_hash };
    const re = reopen(locked, BRANCH_DIRECTIVE);
    if (!re.ok) throw new Error(re.error);
    const mine = findings.filter((f) => f.unit === s.section_key);
    const collected: Collected[] = mine.map((f) => ({ key: f.key, role: f.role, severity: "should fix", text: f.text, versionHash: v.content_hash, declined: null }));
    return {
      section: { id: sid, article_id: articleId, position: s.position, heading: s.heading, body: s.body, section_key: s.section_key, brief_h2: s.brief_h2, claim_ids: s.claim_ids, status: "NEEDS_REVISION", locked: false },
      version: { id: vid, section_id: sid, version_no: v.version_no, content: v.content, content_hash: v.content_hash, material_sig: v.material_sig, reason: `branch copy of version ${v.id} (article ${o.article.id})`, created_by: "branch-copy", agent_run_id: null },
      pointers: { current_version_id: vid, locked_version_id: vid },
      env: { team: { ...re.state, collected }, councilCards: {}, waitingOn: [] } as Envelope, findings: mine.length,
    };
  });
  const briefCols: Record<string, unknown> = { ...o.brief }; delete briefCols.id; delete briefCols.created_at;
  const claims = o.claims.map((c) => { const cols: Record<string, unknown> = { ...c }; delete cols.id; return { ...cols, article_id: articleId }; });
  return {
    articleId, briefId, findings, units, claims,
    brief: { ...briefCols, id: briefId, opportunity_id: null },
    article: { id: articleId, opportunity_id: o.article.opportunity_id, title: o.article.title, slug: o.article.slug, primary_keyword: o.article.primary_keyword, brief_id: briefId, state: "BRIEF_APPROVED", pipeline_mode: "team", branch_of: o.article.id, is_fixture: false },
  };
}

// ---------- isolation proof (the branch references nothing of the original's) ----------
export type IsolationReport = { ok: boolean; problems: string[]; counts: Record<string, number> };
export function checkIsolation(b: { branch: any; original: any; branchBrief: any; originalBrief: any; branchSections: any[]; originalSections: any[]; branchVersions: any[]; originalVersions: any[]; branchClaims: any[]; originalClaims: any[] }): IsolationReport {
  const problems: string[] = [];
  const origClaimIds = new Set(b.originalClaims.map((c) => c.id)), branchKeys = new Set(b.branchClaims.map((c) => c.claim_key));
  if (b.branch.branch_of !== b.original.id) problems.push("branch_of does not point at the original");
  if (b.branch.pipeline_mode !== "team" || b.branch.is_fixture !== false) problems.push("branch must be pipeline_mode team and is_fixture false");
  if (b.branch.brief_id === b.original.brief_id || b.branchBrief?.id === b.originalBrief?.id) problems.push("the branch shares the original's brief row");
  if (b.branchBrief?.opportunity_id != null) problems.push("the branch brief carries an opportunity_id (a lookup by opportunity could find it)");
  if (b.branchClaims.some((c) => c.article_id !== b.branch.id)) problems.push("a branch claim is attached to another article");
  if (b.branchClaims.some((c) => origClaimIds.has(c.id))) problems.push("a branch claim row IS an original claim row");
  if (b.branchClaims.length !== b.originalClaims.length) problems.push(`claim count differs: ${b.originalClaims.length} original, ${b.branchClaims.length} branch`);
  for (const oc of b.originalClaims) { const bc = b.branchClaims.find((c) => c.claim_key === oc.claim_key); if (!bc) problems.push(`original claim ${oc.claim_key} missing on the branch`); else if ((bc.locked_text ?? bc.claim_text) !== (oc.locked_text ?? oc.claim_text) || bc.source_id !== oc.source_id) problems.push(`claim ${oc.claim_key} differs from the original`); }
  const origSecIds = new Set(b.originalSections.map((s) => s.id)), origVerIds = new Set(b.originalVersions.map((v) => v.id));
  for (const s of b.branchSections) {
    if (s.article_id !== b.branch.id || origSecIds.has(s.id)) problems.push(`section ${s.section_key} is not the branch's own row`);
    for (const k of s.claim_ids ?? []) if (!branchKeys.has(k)) problems.push(`section ${s.section_key} cites claim ${k}, which is not in the branch ledger`);
    for (const p of [s.current_version_id, s.locked_version_id]) if (p && (origVerIds.has(p) || !b.branchVersions.some((v) => v.id === p && v.section_id === s.id))) problems.push(`section ${s.section_key} points at a version that is not its own`);
    const o = b.originalSections.find((x) => x.section_key === s.section_key);
    const ov = b.originalVersions.find((v) => v.id === o?.locked_version_id), bv = b.branchVersions.find((v) => v.id === s.locked_version_id);
    if (!ov || !bv || ov.content_hash !== bv.content_hash || contentHash(ov.content) !== contentHash(bv.content)) problems.push(`section ${s.section_key}: copied content differs from the original's locked version`);
  }
  for (const v of b.branchVersions) {
    if (origVerIds.has(v.id)) problems.push("a branch version row IS an original version row");
    const cited = JSON.stringify(v.content).match(/"(?:clm:\d+|new:[a-z0-9_-]+:\d+)"/g) ?? [];
    for (const m of cited) if (!branchKeys.has(m.slice(1, -1))) problems.push(`version ${v.id} cites ${m}, which is not in the branch ledger`);
  }
  if (b.branch.locked_version_id) problems.push("the branch article already has a locked article version");
  return { ok: problems.length === 0, problems, counts: { claims: b.branchClaims.length, sections: b.branchSections.length, versions: b.branchVersions.length } };
}
async function isolationFor(db: SupabaseClient, branchId: string, originalId: string): Promise<IsolationReport> {
  const one = async (t: string, id: string) => (await db.from(t).select("*").eq("id", id).single()).data;
  const branch = await one("articles", branchId), original = await one("articles", originalId);
  const [bs, os] = [await fetchAll(db, "article_sections", (q) => q.eq("article_id", branchId)), await fetchAll(db, "article_sections", (q) => q.eq("article_id", originalId))];
  const vers = async (secs: any[]) => (secs.length ? fetchAll(db, "section_versions", (q) => q.in("section_id", secs.map((s) => s.id))) : []);
  return checkIsolation({
    branch, original, branchBrief: await one("briefs", branch.brief_id), originalBrief: await one("briefs", original.brief_id),
    branchSections: bs, originalSections: os, branchVersions: await vers(bs), originalVersions: await vers(os),
    branchClaims: await fetchAll(db, "claims", (q) => q.eq("article_id", branchId)), originalClaims: await fetchAll(db, "claims", (q) => q.eq("article_id", originalId)),
  });
}

// ---------- create ----------
export type BranchResult =
  | { ok: false; reason: string; findingsFound?: number; byUnit?: Record<string, number> }
  | { ok: true; dryRun: true; findings: number; byUnit: Record<string, number>; units: number; claims: number; fingerprint: Fingerprint }
  | { ok: true; dryRun: false; branchId: string; findings: number; byUnit: Record<string, number>; before: Fingerprint; after: Fingerprint; changed: string[]; isolation: IsolationReport };

/** Supabase errors are plain objects, not Error instances. */
const errText = (e: any): string => (e instanceof Error ? e.message : e?.message ?? JSON.stringify(e));
const countBy = (f: SeededFinding[]) => f.reduce<Record<string, number>>((m, x) => ({ ...m, [x.unit]: (m[x.unit] ?? 0) + 1 }), {});

export async function branchArticle(db: SupabaseClient, originalId: string, opts: { actor: string; expectedFindings: number; dryRun?: boolean }): Promise<BranchResult> {
  if (agentLikeActor(opts.actor) || !opts.actor.trim()) return { ok: false, reason: resolveActorError(opts.actor, null)! };   // before any read or write
  const article = (await db.from("articles").select("*").eq("id", originalId).single()).data;
  if (!article) return { ok: false, reason: "no such article" };
  const denied = resolveActorError(opts.actor, article);
  if (denied) return { ok: false, reason: denied };
  if (article.branch_of) return { ok: false, reason: "this article is itself a branch; branch the original" };
  if (article.pipeline_mode !== "classic") return { ok: false, reason: "only a classic article is branched" };
  const brief = (await db.from("briefs").select("*").eq("id", article.brief_id).single()).data;
  if (!brief) return { ok: false, reason: "the article has no brief row" };
  const sections = await fetchAll(db, "article_sections", (q) => q.eq("article_id", originalId));
  if (!sections.length) return { ok: false, reason: "the article has no sections" };
  const unlocked = sections.filter((s) => !s.locked_version_id || s.status !== "LOCKED");
  if (unlocked.length) return { ok: false, reason: `every unit must be locked before branching; not locked: ${unlocked.map((s) => s.section_key).join(", ")}` };
  const sids = sections.map((s) => s.id);
  const versions = await fetchAll(db, "section_versions", (q) => q.in("section_id", sids));
  const reviews = await fetchAll(db, "section_reviews", (q) => q.in("section_id", sids));
  const claims = await fetchAll(db, "claims", (q) => q.eq("article_id", originalId));

  const plan = planBranch({ article, brief, sections, versions, reviews, claims });
  const byUnit = countBy(plan.findings);
  if (plan.findings.length !== opts.expectedFindings) return { ok: false, reason: `expected exactly ${opts.expectedFindings} optional findings, found ${plan.findings.length}; nothing was written`, findingsFound: plan.findings.length, byUnit };
  const before = await fingerprint(db, originalId);
  if (opts.dryRun) return { ok: true, dryRun: true, findings: plan.findings.length, byUnit, units: plan.units.length, claims: plan.claims.length, fingerprint: before };

  try {
    const w = async (p: PromiseLike<{ error: any }>) => { const { error } = await p; if (error) throw error; };
    await w(db.from("briefs").insert(plan.brief));
    await w(db.from("articles").insert(plan.article));
    await w(db.from("article_sections").insert(plan.units.map((u) => u.section)));
    await w(db.from("section_versions").insert(plan.units.map((u) => u.version)));
    for (const u of plan.units) await w(db.from("article_sections").update(u.pointers).eq("id", u.section.id as string));
    if (plan.claims.length) await w(db.from("claims").insert(plan.claims));
    for (const u of plan.units) await saveEnvelope(db, { id: u.section.id }, u.env);
    const t = await orchestratorFor(db).transition("article", plan.articleId, "DRAFTING", SYSTEM, { reason: "team branch created; drafting resumes from the copied units" });
    if (!t.ok) throw new Error(t.reason);
    await auditArticle(db, plan.articleId, "branch_created", {
      original: originalId, branch_of_version: article.version_hash ?? null, units: plan.units.length, claims: plan.claims.length, findings: plan.findings.length,
      seeded: plan.findings.map((f) => ({ unit: f.unit, role: f.role, key: f.key, review: f.reviewId, claim: f.claimId })),
    }, opts.actor);
  } catch (e) {
    const rolled = await deleteBranchRows(db, plan.articleId).catch((x) => `rollback failed: ${errText(x)}`);
    return { ok: false, reason: `branch creation failed (${errText(e)}); partial rows removed (${typeof rolled === "string" ? rolled : "ok"}); the original was only read` };
  }
  const after = await fingerprint(db, originalId);
  return { ok: true, dryRun: false, branchId: plan.articleId, findings: plan.findings.length, byUnit, before, after, changed: fingerprintDiff(before, after), isolation: await isolationFor(db, plan.articleId, originalId) };
}

// ---------- delete (rollback) ----------
async function del(db: SupabaseClient, table: string, col: string, vals: string[] | string) {
  const arr = Array.isArray(vals) ? vals : [vals];
  if (!arr.length) return;
  const { error } = await (Array.isArray(vals) ? db.from(table).delete().in(col, arr) : db.from(table).delete().eq(col, vals));
  if (error) throw error;
}

/** Removes the evidence snapshots R1 created for this branch (never one created earlier or still referenced by anything else). Returns what it removed and kept. */
async function removeBranchSnapshots(db: SupabaseClient, branch: any): Promise<{ removed: string[]; kept: { id: string; why: string }[] }> {
  const ev = await fetchAll(db, "audit_events", (q) => q.eq("subject_id", branch.id).eq("event_type", "r1_fetch"));
  const urls = new Set(ev.flatMap((e) => ((e.detail?.fetched ?? []) as string[]).map(snapshotKey)));
  const removed: string[] = [], kept: { id: string; why: string }[] = [];
  if (!urls.size) return { removed, kept };
  const cands = (await fetchAll(db, "evidence_sources", (q) => q.eq("uploaded_by", "system:r1-snapshot"))).filter((r) => r.source_url && urls.has(snapshotKey(r.source_url)));
  const others = (await fetchAll(db, "audit_events", (q) => q.eq("event_type", "r1_fetch"))).filter((e) => e.subject_id !== branch.id);
  const otherUrls = new Set(others.flatMap((e) => ((e.detail?.fetched ?? []) as string[]).map(snapshotKey)));
  const briefs = await fetchAll(db, "briefs", (q) => q);
  for (const s of cands) {
    if (String(s.created_at) < String(branch.created_at)) { kept.push({ id: s.id, why: "created before this branch (not ours)" }); continue; }
    if (otherUrls.has(snapshotKey(s.source_url))) { kept.push({ id: s.id, why: "another article's R1 fetch lists the same URL" }); continue; }
    const claimRef = (await db.from("claims").select("id", { count: "exact", head: true }).eq("source_id", s.id)).count ?? 0;
    if (claimRef) { kept.push({ id: s.id, why: `${claimRef} claim(s) still reference it` }); continue; }
    if (briefs.some((b) => (b.source_ids ?? []).includes(s.id))) { kept.push({ id: s.id, why: "a brief lists it" }); continue; }
    await del(db, "evidence_passages", "source_id", s.id); await del(db, "evidence_sources", "id", s.id); removed.push(s.id);
  }
  return { removed, kept };
}

/** Deletes the rows of one branch (children first). Guarded by the caller. audit_events are append-only and stay. */
async function deleteBranchRows(db: SupabaseClient, branchId: string): Promise<string> {
  const branch = (await db.from("articles").select("*").eq("id", branchId).single()).data;
  if (!branch) return "nothing to delete";
  if (!branch.branch_of || branch.is_fixture || branch.id === branch.branch_of) throw new Error("refusing: not a branch");
  const snaps = await purgeBranch(db, branch);
  return `snapshots removed ${snaps.removed.length}${snaps.kept.length ? `, kept ${snaps.kept.length} (${snaps.kept.map((k) => `${k.id}: ${k.why}`).join("; ")})` : ""}`;
}
async function purgeBranch(db: SupabaseClient, branch: any) {
  const id = branch.id as string;
  const ts = await fetchAll(db, "tickets", (q) => q.eq("article_id", id)); const tids = ts.map((t) => t.id);
  if (tids.length) { await db.from("tickets").update({ parent_ticket_id: null }).in("id", tids); await del(db, "ticket_messages", "ticket_id", tids); await del(db, "tickets", "id", tids); }
  await del(db, "team_runs", "article_id", id);
  const secs = await fetchAll(db, "article_sections", (q) => q.eq("article_id", id)); const sids = secs.map((s) => s.id);
  if (sids.length) {
    await db.from("article_sections").update({ current_version_id: null, locked_version_id: null }).in("id", sids);
    await del(db, "section_reviews", "section_id", sids); await del(db, "section_versions", "section_id", sids); await del(db, "article_sections", "id", sids);
  }
  await del(db, "escalations", "article_id", id); await del(db, "proposals", "article_id", id); await del(db, "approvals", "subject_id", id);
  await db.from("articles").update({ locked_version_id: null }).eq("id", id);
  await del(db, "article_versions", "article_id", id); await del(db, "claims", "article_id", id);
  const snaps = await removeBranchSnapshots(db, branch);          // after the branch's claims are gone, so "still referenced" means referenced by someone else
  await del(db, "agent_runs", "subject_id", id);
  await del(db, "articles", "id", id);
  const brief = (await db.from("briefs").select("id,opportunity_id").eq("id", branch.brief_id).single()).data;
  const orig = (await db.from("articles").select("brief_id").eq("id", branch.branch_of).single()).data;
  if (brief && brief.opportunity_id == null && brief.id !== orig?.brief_id) await del(db, "briefs", "id", brief.id);
  return snaps;
}

export async function branchDelete(db: SupabaseClient, branchId: string, opts: { actor: string; yes: boolean }): Promise<{ ok: true; summary: string; before?: Fingerprint; after?: Fingerprint; originalChanged?: string[] } | { ok: false; reason: string }> {
  if (agentLikeActor(opts.actor) || !opts.actor.trim()) return { ok: false, reason: resolveActorError(opts.actor, null)! };
  if (!opts.yes) return { ok: false, reason: "pass --yes to delete the branch (Leo confirms)" };
  const branch = (await db.from("articles").select("*").eq("id", branchId).single()).data;
  if (!branch) return { ok: false, reason: "no such article" };
  const denied = resolveActorError(opts.actor, branch);
  if (denied) return { ok: false, reason: denied };
  if (!branch.branch_of) return { ok: false, reason: "refusing: this article is not a branch (branch_of is empty)" };
  if (branch.is_fixture) return { ok: false, reason: "refusing: a fixture article is removed by npm run smoke:cleanup" };
  if (branch.id === branch.branch_of) return { ok: false, reason: "refusing: an article cannot be its own original" };
  const before = await fingerprint(db, branch.branch_of);
  const summary = await deleteBranchRows(db, branchId);
  const after = await fingerprint(db, branch.branch_of);
  return { ok: true, summary, before, after, originalChanged: fingerprintDiff(before, after) };
}
