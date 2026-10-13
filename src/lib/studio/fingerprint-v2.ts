/* eslint-disable @typescript-eslint/no-explicit-any -- DB rows */
// Fingerprint v2 (Leo, 2026-10-13): a stable fingerprint of everything attached to one article. It does not replace the v1 fingerprint in branch.ts
// (the historical baseline 23f8dd72…4611 stays valid and unchanged); it is what is reported from now on, next to v1, so both can be seen to agree.
// v1 hashes whole rows ("select *"), so adding a column to a table changes the hash even when no value changed (migration 0020 did exactly that).
// v2 selects only the columns listed in FP2_COLUMNS, ordered by primary key (id). A column added later is never read, so it cannot change v2.
// The list is the column set the v1 baseline was taken on: every column that existed before migration 0020 (2026-10-13), as proved by v2 on the original
// article today equalling the v1 baseline. Some of these columns (articles.is_fixture, tickets.merged_from / from_roles / escalation_trigger / issue_key) were
// added by migrations 0016-0019 on 2026-10-12, after 2026-10-11; they are in the list because the v1 baseline value includes them.
import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256, stableStringify } from "./hash";

export const FP2_COLUMNS: Record<string, string[]> = {
  articles: ["id", "opportunity_id", "title", "state", "prior_state", "revision_count", "locked_version_id", "created_at", "updated_at", "version_hash", "approved_hash", "slug", "brief_id", "proposal_note", "primary_keyword", "pipeline_mode", "branch_of", "is_fixture"],
  briefs: ["id", "opportunity_id", "outline", "source_ids", "state", "created_at", "evidence_packet", "notes", "outline_history"],
  article_sections: ["id", "article_id", "position", "heading", "body", "locked", "section_key", "status", "current_version_id", "locked_version_id", "fact_passed_version_id", "seo_passed_version_id", "issues", "brief_h2", "claim_ids"],
  section_versions: ["id", "section_id", "version_no", "content", "content_hash", "material_sig", "reason", "created_by", "agent_run_id", "created_at"],
  section_reviews: ["id", "section_id", "version_id", "agent_key", "decision", "findings", "required_actions", "advisory_score", "agent_run_id", "created_at"],
  claims: ["id", "article_id", "claim_text", "claim_type", "risk_level", "source_id", "supporting_passage", "jurisdiction", "applicability", "effective_or_verified_date", "checked_date", "confidence_status", "publication_permission", "requires_human_review", "claim_key", "section_key", "text_hash", "locked_text", "declared_by", "support"],
  article_versions: ["id", "article_id", "version_hash", "body", "reason", "created_by", "created_at"],
  escalations: ["id", "article_id", "section_id", "issue_key", "reason", "attempts", "status", "resolution", "resolved_by", "created_at", "resolved_at"],
  proposals: ["id", "article_id", "article_version_id", "voice_snapshot", "requires_secondary", "status", "created_by", "created_at"],
  approvals: ["id", "subject_type", "subject_id", "version_hash", "decision", "approver_identity", "decided_at", "recorded_at", "invalidated_at", "proposal_id", "item_kind"],
  tickets: ["id", "team_run_id", "article_id", "unit_key", "ticket_type", "from_role", "to_role", "issue", "severity", "evidence", "suggested_fix", "blocking", "status", "round", "parent_ticket_id", "version_hash", "resolution", "created_at", "closed_at", "merged_from", "from_roles", "escalation_trigger", "issue_key"],
  team_runs: ["id", "article_id", "mode", "ticket_budget", "round_limit", "budget_used", "status", "started_at", "ended_at"],
  agent_runs: ["id", "agent_key", "subject_type", "subject_id", "status", "task_packet", "output", "prompt_version", "model_version", "retries", "created_at", "error", "updated_at"],
  audit_events: ["id", "at", "actor", "subject_type", "subject_id", "event_type", "prior_state", "new_state", "version_hash", "accepted", "detail"],
};

export type Fingerprint2 = { total: string; parts: Record<string, { count: number; hash: string }> };

/** Pure: project rows to the listed columns (a column a row does not have is skipped), order by id, hash. Extra columns never matter. */
export const hashRowsV2 = (table: string, rows: Record<string, unknown>[]): { count: number; hash: string } => {
  const cols = FP2_COLUMNS[table];
  const sorted = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const projected = sorted.map((r) => Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]])));
  return { count: rows.length, hash: sha256(stableStringify(projected)) };
};

/** Pure: the v2 fingerprint from the rows of every table. Same shape as v1: a total over the per-table { count, hash } parts. */
export function fingerprintV2FromRows(rows: Record<string, Record<string, unknown>[]>): Fingerprint2 {
  const parts: Fingerprint2["parts"] = {};
  for (const t of Object.keys(FP2_COLUMNS)) parts[t] = hashRowsV2(t, rows[t] ?? []);
  return { total: sha256(stableStringify(parts)), parts };
}

const PAGE = 1000;
async function fetchAll(db: SupabaseClient, table: string, filter: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await filter(db.from(table).select(FP2_COLUMNS[table].join(","))).order("id").range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

/** Reads only. Selects exactly the listed columns, so a column added to a table later cannot change the result. */
export async function fingerprintV2(db: SupabaseClient, articleId: string): Promise<Fingerprint2> {
  const art = await fetchAll(db, "articles", (q) => q.eq("id", articleId));
  const briefId = art[0]?.brief_id as string | undefined;
  const secs = await fetchAll(db, "article_sections", (q) => q.eq("article_id", articleId));
  const sids = secs.map((s) => s.id);
  const inSecs = (t: string) => (sids.length ? fetchAll(db, t, (q) => q.in("section_id", sids)) : Promise.resolve([]));
  return fingerprintV2FromRows({
    articles: art, briefs: briefId ? await fetchAll(db, "briefs", (q) => q.eq("id", briefId)) : [], article_sections: secs,
    section_versions: await inSecs("section_versions"), section_reviews: await inSecs("section_reviews"),
    claims: await fetchAll(db, "claims", (q) => q.eq("article_id", articleId)), article_versions: await fetchAll(db, "article_versions", (q) => q.eq("article_id", articleId)),
    escalations: await fetchAll(db, "escalations", (q) => q.eq("article_id", articleId)), proposals: await fetchAll(db, "proposals", (q) => q.eq("article_id", articleId)),
    approvals: await fetchAll(db, "approvals", (q) => q.eq("subject_id", articleId)), tickets: await fetchAll(db, "tickets", (q) => q.eq("article_id", articleId)),
    team_runs: await fetchAll(db, "team_runs", (q) => q.eq("article_id", articleId)), agent_runs: await fetchAll(db, "agent_runs", (q) => q.eq("subject_id", articleId)),
    audit_events: await fetchAll(db, "audit_events", (q) => q.eq("subject_id", articleId)),
  });
}
