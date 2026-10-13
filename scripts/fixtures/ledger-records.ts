/* eslint-disable @typescript-eslint/no-explicit-any */
// Fixture helper (Phase 3e stage 5): gives a FIXTURE article's claim ledger the same legal-claim verification records the real hoarder branch carries
// (clm:1-8: exact quote, section, label, gates, reader impact), read-only from the branch. Since stage 3 a unit that cites a high-risk claim without its record is
// blocked by code before V1 sees it, so a fixture that cites clm:N needs the record. `dropGates` keeps the records but removes the gates, for fixtures that
// test V1's judgment of one sentence (card 1 in its original context) and must not be sent back by the carried-gate check.
import type { SupabaseClient } from "@supabase/supabase-js";

const BRANCH = "54070caa-bd79-4184-a82a-9235b1c33b64";
const COLUMNS = ["claim_text", "locked_text", "text_hash", "supporting_passage", "quote_full", "section_cite", "verification_label", "verification_reason", "verified_against", "gates", "reader_impact", "checked_date", "effective_or_verified_date", "source_id"] as const;

export async function copyLedgerRecords(db: SupabaseClient, fixtureArticle: string, opts: { dropGates?: boolean } = {}) {
  const { data: src } = await db.from("claims").select("*").eq("article_id", BRANCH);
  if (!src?.length) throw new Error("the hoarder branch claims were not found");
  const { data: have } = await db.from("claims").select("id,claim_key").eq("article_id", fixtureArticle);
  const byKey = new Map((have ?? []).map((c: any) => [c.claim_key, c.id as string]));
  for (const c of src as any[]) {
    const cols: Record<string, unknown> = {};
    for (const k of COLUMNS) cols[k] = k === "gates" && opts.dropGates ? [] : c[k];
    if (byKey.has(c.claim_key)) await db.from("claims").update(cols).eq("id", byKey.get(c.claim_key)!);
    else { const { id: _id, article_id: _a, ...row } = c; void _id; void _a; await db.from("claims").insert({ ...row, ...cols, article_id: fixtureArticle }); }
  }
}
