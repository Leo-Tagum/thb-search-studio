/* eslint-disable @typescript-eslint/no-explicit-any -- DB JSON columns */
// The data the THB Approval Room shows for one proposal. Everything here is read from stored rows; the page only displays it.
// Hashes are recomputed from the stored version here, and again on sync. The page's own hash is a claim to check.
import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256 } from "./hash";
import { voiceHash } from "./proposals";
import { unitClaimIds, unitText, type Unit } from "./schema";

export async function buildProposalPayload(db: SupabaseClient, proposalId: string) {
  const { data: p } = await db.from("proposals").select("*").eq("id", proposalId).single();
  const { data: art } = await db.from("articles").select("*").eq("id", p.article_id).single();
  const { data: ver } = await db.from("article_versions").select("*").eq("id", p.article_version_id).single();
  const html: string = ver.body.html;
  const articleHash = sha256(html);
  if (articleHash !== art.version_hash) throw new Error("stored version hash does not match the article; refusing to build a proposal");
  const { data: secs } = await db.from("article_sections").select("*").eq("article_id", art.id).order("position");
  const units: Unit[] = [];
  for (const s of secs ?? []) { const { data: v } = await db.from("section_versions").select("content").eq("id", s.locked_version_id).single(); units.push(v!.content as Unit); }
  const { data: claims } = await db.from("claims").select("*").eq("article_id", art.id);
  const { data: srcs } = await db.from("evidence_sources").select("id,title,source_url");
  const { data: reviews } = await db.from("section_reviews").select("agent_key,decision,advisory_score,section_id,created_at").in("section_id", (secs ?? []).map((s: any) => s.id));
  const scores = (reviews ?? []).filter((r: any) => r.advisory_score != null).map((r: any) => r.advisory_score as number);
  const used = new Set(units.flatMap(unitClaimIds));
  const items: { kind: string; label: string; hash: string }[] = [{ kind: "article", label: `Article: ${art.title}`, hash: articleHash }];
  if (p.voice_snapshot) items.push({ kind: "voice_reference", label: "Voice reference (provisionally approved by Leo)", hash: voiceHash(JSON.stringify(p.voice_snapshot))! });
  const { data: brief } = await db.from("briefs").select("outline").eq("id", art.brief_id).single();
  return {
    proposal_id: p.id, created_at: p.created_at, requires_secondary: p.requires_secondary,
    article: { id: art.id, title: art.title, slug: art.slug, state: art.state, kind: "CREATE (new page): no live text to compare" },
    items, html,
    sections: units.map((u, i) => ({ key: u.key, heading: u.kind === "faq" ? "Frequently Asked Questions" : u.h2, words: unitText(u).split(/\s+/).length, claims: unitClaimIds(u), status: (secs as any[])[i].status })),
    claims: (claims ?? []).filter((c: any) => used.has(c.claim_key)).map((c: any) => ({ id: c.claim_key, text: c.locked_text ?? c.claim_text, risk: c.risk_level, support: c.support, source: (srcs ?? []).find((s: any) => s.id === c.source_id)?.title ?? null, source_url: (srcs ?? []).find((s: any) => s.id === c.source_id)?.source_url ?? null })),
    review_summary: { reviews: (reviews ?? []).length, advisory_editorial_score_avg: scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : null, note: "Editorial score is advisory (under 85 = revise recommended). It never approves or blocks." },
    open_items: brief?.outline?.open_items ?? [],
    voice_reference: p.voice_snapshot ? { excerpts: (p.voice_snapshot as any).excerpts, imitate: (p.voice_snapshot as any).imitate, avoid: (p.voice_snapshot as any).avoid } : null,
  };
}
