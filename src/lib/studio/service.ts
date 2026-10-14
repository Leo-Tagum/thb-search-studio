/* eslint-disable @typescript-eslint/no-explicit-any -- DB JSON columns and agent outputs are validated by zod / checks at the boundary */
// Content Studio service: brief approval, queueing Agents 4-7, validated submit, the section loop on Supabase, article assembly.
// Only this module moves article/section state, and always through the orchestrator or the pure loop functions.
import type { SupabaseClient } from "@supabase/supabase-js";
import { Orchestrator, type Actor } from "../orchestrator";
import { SupabaseRepo } from "../orchestrator/supabase-repo";
import { MAX_ATTEMPTS, wrapUntrusted } from "../agents/bridge";
import { checkArticle, checkUnit, type CheckCtx, type LedgerClaim } from "./checks";
import { contentHash, sha256 } from "./hash";
import { allLocked, applyDeterministic, applyReview, declineOptional, editorRevision, escalateGap, gateOnly, isV1FixPass, recordVersion, reopen, resolveByHuman, type SectionState } from "./loop";
import { fixChurn, splitSentences } from "./v1-gate";
import { needsRuling } from "./hedge-rulings";
import { materialSig } from "./tokens";
import { unitClaimIds, unitText, type Draft, type Unit } from "./schema";
import { brandRuleFindings } from "./brand-check";
import { RECEIPT_INSTRUCTION } from "../agents/prompt-receipt";
import { allowedJurisdictionsOf } from "./jurisdictions";
import { auditHtml, composeAuthor, composeCta, renderBody, type BrandFactRow, type Composed } from "./template";
import { modeChangeRule, modeOf, pipelineGuard, type PipelineMode } from "../team/mode";
import { agentLikeActor, resolveActorError } from "./actors";
import { ledgerRecord, verificationColumns, verificationFromRow } from "./legal-claims";
import { envelopeOf, saveEnvelope } from "./team-envelope";
import { reopen as teamReopen, resolveByHuman as teamResolveByHuman } from "../team/loop";
import { CLASSIC_V1_KEY, STUDIO_AGENT_META, V1_PROMPT_VERSION, isStudioAgent, studioOutputSchemas, studioSemanticChecks, type StudioAgentKey, type StudioValidationCtx } from "./agents";
import { teamSchema, teamSemanticChecks, type TeamPacket } from "../team/bridge";

export const SYSTEM: Actor = { kind: "system", id: "studio" };
export const AUTHOR_URL = "https://www.twinhomebuyer.com/from-the-desk-of-juan-diaz/";
export const MONEY_URL = "https://www.twinhomebuyer.com/hoarder-houses/";
const slash = (u: string) => u.replace(/\/+$/, "");
const today = () => new Date().toISOString().slice(0, 10);
const orch = (db: SupabaseClient) => new Orchestrator(new SupabaseRepo(db));

/** Statements about what THB does that are still PENDING JUAN for this article (as-is / no-cleanout purchase). */
export const ARTICLE_BLOCKED: [string, RegExp][] = [
  ["THB buys as-is or without a seller cleanout (PENDING JUAN)", /\b(?:we|our team|twin home buyer|thb)\b[^.]{0,80}\b(?:buy|buys|purchase|purchases|take|takes)\b[^.]{0,80}(?:as-is|as is|with (?:everything|all (?:the )?belongings)|without (?:any )?(?:clean|clear)|no (?:clean|clear)|leave (?:it )?behind|everything (?:inside|in the house))/i],
  ["a price, offer or closing-time promise", /\b(?:fair|cash)\s+offer\s+(?:in|within)\b|\bguarantee[sd]?\b/i],
];

// ---------- brief approval (human gate) ----------
export async function approveBrief(db: SupabaseClient, oppId: string, actorId: string): Promise<{ ok: true; articleId: string } | { ok: false; reason: string }> {
  const { data: o } = await db.from("opportunities").select("*").eq("id", oppId).single();
  const { data: b } = await db.from("briefs").select("*").eq("opportunity_id", oppId).maybeSingle();
  if (!o || !b?.outline) return { ok: false, reason: "No brief found for this opportunity." };
  if (o.state !== "BRIEF_REVIEW") return { ok: false, reason: `A brief is approved from BRIEF_REVIEW (this is ${o.state}).` };
  if (b.outline.decision !== "PASS") return { ok: false, reason: "Agent 3's brief did not PASS." };
  // A team-mode branch (Task 14) shares the opportunity with its original: only the original article counts here, so two rows never break this lookup.
  const { data: existing } = await db.from("articles").select("id").eq("opportunity_id", oppId).is("branch_of", null).maybeSingle();
  if (existing) return { ok: false, reason: "An article already exists for this opportunity." };
  const human: Actor = { kind: "human", id: actorId };
  const t = await orch(db).transition("opportunity", oppId, "BRIEF_APPROVED", human, { reason: "brief approved by Leo" });
  if (!t.ok) return { ok: false, reason: t.reason };
  await db.from("decisions").insert({ opportunity_id: oppId, decision: "brief_approve", rationale: "Brief approved to start drafting", decided_by: actorId });

  const brief = b.outline as any;
  const slugMatch = (brief.open_items as string[]).join(" ").match(/\/([a-z0-9-]+)\/\s*\(for human approval/i) ?? (brief.open_items as string[]).join(" ").match(/slug[^/]*\/([a-z0-9-]+)\//i);
  const keyword = /hoard/i.test(brief.working_title) ? "hoarded house" : String(brief.working_title).toLowerCase();
  const { data: art, error } = await db.from("articles").insert({ opportunity_id: oppId, brief_id: b.id, title: brief.working_title, slug: slugMatch?.[1] ?? null, primary_keyword: keyword, state: "BRIEF_APPROVED" }).select("*").single();
  if (error) throw error;

  // Sections from the approved outline, plus the FAQ unit.
  const outline = brief.outline as { h2: string; claim_ids: string[] }[];
  const rows = outline.map((s, i) => ({ article_id: art.id, position: i + 1, section_key: `s${i + 1}`, heading: s.h2, brief_h2: s.h2, claim_ids: s.claim_ids, status: "NEEDS_WRITE", body: null, locked: false }));
  rows.push({ article_id: art.id, position: rows.length + 1, section_key: "faq", heading: "Frequently Asked Questions", brief_h2: "Frequently Asked Questions", claim_ids: [], status: "NEEDS_WRITE", body: null, locked: false });
  await db.from("article_sections").insert(rows);

  // Claim ledger from Agent 2's accepted packet.
  const ep = b.evidence_packet as any;
  const claims = (ep.claims as any[]).map((c) => {
    const src = (ep.sources as any[]).find((s) => s.id === c.source_ids[0]);
    return {
      article_id: art.id, claim_key: c.id, claim_text: c.text, claim_type: c.claim_type ?? "statute", risk_level: c.risk, source_id: src?.library_source_id ?? null,
      supporting_passage: c.quote ?? null, jurisdiction: c.jurisdiction, applicability: "California residential sale", effective_or_verified_date: src?.effective_date ?? null,
      checked_date: today(), confidence_status: c.support, publication_permission: "public_law", requires_human_review: false, support: c.support, declared_by: "thb-02-research-evidence",
      text_hash: sha256(c.text), ...verificationColumns(c),
    };
  });
  await db.from("claims").insert(claims);
  const toDrafting = await orch(db).transition("article", art.id, "DRAFTING", SYSTEM, { reason: "brief approved; drafting starts" });
  if (!toDrafting.ok) return { ok: false, reason: toDrafting.reason };
  await db.from("audit_events").insert({ actor: actorId, subject_type: "article", subject_id: art.id, event_type: "article_created", accepted: true, detail: { opportunity: oppId, sections: rows.length, claims: claims.length } });
  return { ok: true, articleId: art.id };
}

// ---------- context ----------
export type Loaded = {
  article: any; brief: any; sections: any[]; claims: Map<string, LedgerClaim>; sources: Map<string, any>;
  facts: BrandFactRow[]; versions: Map<string, any>; check: CheckCtx;
};
export async function load(db: SupabaseClient, articleId: string): Promise<Loaded> {
  const { data: article } = await db.from("articles").select("*").eq("id", articleId).single();
  const { data: brief } = await db.from("briefs").select("*").eq("id", article.brief_id).single();
  const { data: sections } = await db.from("article_sections").select("*").eq("article_id", articleId).order("position");
  const { data: cl } = await db.from("claims").select("*").eq("article_id", articleId);
  const { data: srcs } = await db.from("evidence_sources").select("*");
  const { data: facts } = await db.from("brand_facts").select("fact_key,fact_value,status");
  const { data: internal } = await db.from("seller_brief_passages").select("text,internal_reasons").eq("visibility", "internal_only");
  const vids = (sections ?? []).flatMap((s: any) => [s.current_version_id, s.locked_version_id]).filter(Boolean);
  const { data: vers } = vids.length ? await db.from("section_versions").select("*").in("id", vids) : { data: [] as any[] };
  const sources = new Map((srcs ?? []).map((s: any) => [s.id, s]));
  const claims = new Map<string, LedgerClaim>((cl ?? []).map((c: any) => [c.claim_key, {
    id: c.claim_key, text: c.locked_text ?? c.claim_text, risk: c.risk_level, support: c.support, sourceId: c.source_id,
    sourceRecheckBy: c.source_id ? (sources.get(c.source_id)?.recheck_by ?? null) : null, jurisdiction: c.jurisdiction ?? "", claimType: c.claim_type, lockedText: c.locked_text, verification: verificationFromRow(c),
  }]));
  const approved = (facts ?? []).filter((f: any) => f.status === "approved");
  const name = approved.find((f: any) => f.fact_key === "company_name")?.fact_value ?? "Twin Home Buyer";
  const homes = approved.find((f: any) => f.fact_key === "homes_purchased")?.fact_value;
  const approvedFactTexts = [...approved.map((f: any) => f.fact_value), ...(homes ? [`${name} has purchased ${homes} homes.`, `${homes} homes`] : []), "Juan Diaz has 25+ years of experience in Bay Area real estate and has been investing since 2002."];
  const links = (brief.outline.link_plan as { to_url: string }[]).map((l) => l.to_url);
  const check: CheckCtx = {
    today: today(), claims, approvedFactTexts, allowedLinks: [...links, MONEY_URL, AUTHOR_URL], sourceUrls: [...sources.values()].map((s: any) => s.source_url).filter(Boolean),
    internalPassages: (internal ?? []).map((p: any) => ({ text: p.text, reasons: p.internal_reasons ?? [] })), allowedJurisdictions: allowedJurisdictionsOf(brief.outline), blockedPhrases: ARTICLE_BLOCKED,
    briefH2: Object.fromEntries((sections ?? []).filter((s: any) => s.section_key !== "faq").map((s: any) => [s.section_key, s.brief_h2])), keyword: article.primary_keyword ?? "",
    legalRecord: true,      // Phase 3e: a cited high-risk legal claim needs its exact quote, section and label; deciders are not shown as a closed list
  };
  return { article, brief, sections: sections ?? [], claims, sources, facts: facts ?? [], versions: new Map((vers ?? []).map((v: any) => [v.id, v])), check };
}

// State columns kept inside the issues jsonb envelope, so no extra migration is needed for each loop field.
type Envelope = { issues: SectionState["issues"]; meta: { versionNo: number; versionHash: string | null; sig: string | null; factPassedSig: string | null; resumeStage: string | null; lockedHash: string | null; escalation: SectionState["escalation"]; blockedBy: string | null; collected?: SectionState["collected"]; declines?: SectionState["declines"]; v1?: V1Fields } };
/** The V1 gate fields of a classic section (Phase 3d), stored beside the rest of the loop state. */
type V1Fields = Pick<SectionState, "gate" | "sentences" | "v1Passed" | "v1Reviewed" | "v1Scope" | "hedges" | "fixCited" | "v1Rounds" | "seoPassedHash" | "edPassedHash">;
const v1Of = (s: SectionState): V1Fields => ({ gate: s.gate, sentences: s.sentences ?? null, v1Passed: s.v1Passed ?? null, v1Reviewed: s.v1Reviewed ?? null, v1Scope: s.v1Scope ?? null, hedges: s.hedges ?? [], fixCited: s.fixCited ?? [], v1Rounds: s.v1Rounds ?? 0, seoPassedHash: s.seoPassedHash ?? null, edPassedHash: s.edPassedHash ?? null });
export const toRow = (s: SectionState): Record<string, unknown> => ({
  status: s.status, locked: s.status === "LOCKED",
  issues: { issues: s.issues, meta: { versionNo: s.versionNo, versionHash: s.versionHash, sig: s.sig, factPassedSig: s.factPassedSig, resumeStage: s.resumeStage, lockedHash: s.lockedHash, escalation: s.escalation, blockedBy: s.blockedBy, collected: s.collected ?? [], declines: s.declines ?? [], v1: v1Of(s) } } satisfies Envelope,
});
export const stateOf = (row: any): SectionState => {
  const env = (row.issues ?? {}) as Partial<Envelope>;
  const m = env.meta;
  return { key: row.section_key, status: row.status, versionNo: m?.versionNo ?? 0, versionHash: m?.versionHash ?? null, sig: m?.sig ?? null, factPassedSig: m?.factPassedSig ?? null, resumeStage: (m?.resumeStage as any) ?? null, issues: env.issues ?? [], lockedHash: m?.lockedHash ?? null, escalation: m?.escalation ?? null, blockedBy: m?.blockedBy ?? null, collected: m?.collected ?? [], declines: m?.declines ?? [], ...(m?.v1 ?? {}) };
};

// ---------- queue ----------
type ClassicAgent = StudioAgentKey | typeof CLASSIC_V1_KEY;
const V1_META = { n: 5 as const, name: "V1 Fact and Privacy", promptVersion: V1_PROMPT_VERSION, decisions: ["PASS", "REVISION", "BLOCKED"] as readonly string[] };
const metaOf = (agent: ClassicAgent) => (agent === CLASSIC_V1_KEY ? V1_META : STUDIO_AGENT_META[agent]);

export async function queueStudioRun(db: SupabaseClient, agent: ClassicAgent, articleId: string, unitKey: string) {
  const L = await load(db, articleId);
  const wrongPipeline = pipelineGuard(modeOf(L.article), agent);
  if (wrongPipeline) throw new Error(wrongPipeline);
  const row = L.sections.find((s) => s.section_key === unitKey);
  if (!row) throw new Error(`no unit ${unitKey}`);
  const st = stateOf(row);
  const needs: Record<ClassicAgent, string[]> = { "thb-04-section-writer": ["NEEDS_WRITE", "NEEDS_REVISION"], "thb-05-fact-privacy-auditor": ["NEEDS_FACT"], [CLASSIC_V1_KEY]: ["NEEDS_FACT"], "thb-06-seo-aeo-geo-auditor": ["NEEDS_SEO"], "thb-07-editorial-critic": ["NEEDS_EDITORIAL"] };
  if (!needs[agent].includes(st.status)) throw new Error(`${agent} cannot run on ${unitKey}: the section is ${st.status}`);
  // V1 is the fact gate: Agent 5 is retired from the classic path and reviews only a section that was saved before the gate existed and has not been touched since.
  if (agent === "thb-05-fact-privacy-auditor" && st.gate === "v1") throw new Error(`Agent 5 is retired from the classic path: ${unitKey} is under the V1 gate. Queue V1 (${CLASSIC_V1_KEY}).`);
  if (agent === CLASSIC_V1_KEY && st.gate !== "v1") throw new Error(`${unitKey} has no V1 gate yet (it was saved before Phase 3d); its fact reviewer is Agent 5 until its text is revised or Leo sends it through the gate.`);
  if (agent === "thb-07-editorial-critic" && !(await voiceUsable(db))) throw new Error("Agent 7 is blocked: no usable voice reference (provisional or approved). Build and approve it first.");
  const { data: open } = await db.from("agent_runs").select("id").eq("agent_key", agent).eq("subject_id", articleId).eq("status", "QUEUED").eq("task_packet->>unit_key", unitKey).maybeSingle();
  if (open) return { runId: open.id, duplicate: true };

  const cur = row.current_version_id ? (await db.from("section_versions").select("*").eq("id", row.current_version_id).single()).data : null;
  const outlineIdx = L.sections.indexOf(row);
  const brief = L.brief.outline;
  const ledger = [...L.claims.values()].map((c) => ({ id: c.id, text: c.text, risk: c.risk, support: c.support, source: c.sourceId ? { title: L.sources.get(c.sourceId)?.title, url: L.sources.get(c.sourceId)?.source_url } : null, jurisdiction: c.jurisdiction, ...ledgerRecord(c.verification) }));
  const { data: vr } = await db.from("brand_facts").select("fact_value,status,provisional_by,provisional_at").eq("fact_key", "voice_reference").single();
  const approvedFacts = L.facts.filter((f: any) => f.status === "approved");
  const data: Record<string, unknown> = {
    article: { id: articleId, title: L.article.title, slug: L.article.slug, primary_keyword: L.article.primary_keyword },
    unit_key: unitKey,
    brief_for_this_unit: unitKey === "faq" ? { note: "FAQ unit: 5-7 short question-and-answer items drawn from the brief's fan_out hypotheses and the sections; answers 60 words or fewer; cite claim_ids only from the ledger.", fan_out: brief.fan_out } : { ...brief.outline[outlineIdx], section_key: unitKey, is_first_section: outlineIdx === 0 },
    brief_global: { target_reader: brief.target_reader, answer_first: brief.answer_first, honest_options: brief.honest_options, real_world_warnings: brief.real_world_warnings, professional_confirmation: brief.professional_confirmation, seller_situation_map: brief.seller_situation_map, link_plan: brief.link_plan, open_items: brief.open_items, outline_h2s: brief.outline.map((s: any, i: number) => ({ key: `s${i + 1}`, h2: s.h2 })) },
    allowed_jurisdictions: allowedJurisdictionsOf(L.brief.outline),   // Stage 6: the layers of law this article may speak about (SR-2); a claim for any other jurisdiction is refused
    claim_ledger: ledger,
    approved_brand_facts: approvedFacts.map((f: any) => ({ key: f.fact_key, value: f.fact_value })),
    pending_juan_blocked: "hours/24h, closing time, ownership/founder/title, contractor license, address vs service area, Equity Track, $32M+, 100% on time, East Oakland roots; and any statement that THB buys as-is or without a cleanout. Never write a rating or review count.",
    current_version: cur ? { version_hash: cur.content_hash, unit: cur.content } : null,
    open_issues: st.issues,
    ...(agent === CLASSIC_V1_KEY ? {
      review_scope: st.v1Scope ?? { kind: "full" },
      hedge_flags: (st.hedges ?? []).filter(needsRuling).map((h) => ({ key: h.key, term: h.term, sentence: h.sentence })),
      previously_passed: st.v1Passed ? { version_hash: st.v1Passed.hash } : null,
      previously_declined: (st.declines ?? []).map((d) => ({ key: d.key, issue: d.text, writer_reason: d.reason, raised: d.raised })),
      declines_rule: "The writer declined these items and the code recorded them. Do not raise one again under a new key or new wording: it is counted once and not reopened. To raise it again, put what is new (a claim id, a stored passage, or the changed text) in new_evidence on the card and the finding.",
    } : {}),
    ...(agent === "thb-04-section-writer" && isV1FixPass(st) ? { v1_fix_pass: { fix_only_cited_sentences: st.fixCited ?? [], rule: "V1 returned REVISION. Change only the sentences listed in fix_only_cited_sentences, as the open issues say, and keep every other sentence exactly as it is. The code rejects a version that changes other sentences." } } : {}),
    ...(agent === "thb-04-section-writer" ? { declined_so_far: (st.declines ?? []).map((d) => ({ key: d.key, reason: d.reason, raised: d.raised })), open_optional_items: (st.collected ?? []).filter((c) => !c.declined).map((c) => ({ key: c.key, from: c.role, severity: c.severity, issue: c.text })), declines_rule: "To not apply an optional item (never a required issue), list it in result.declines as {key, reason} with the exact key from open_optional_items. The code stores it and shows it to Leo." } : {}),
    ...(agent === "thb-06-seo-aeo-geo-auditor" || agent === "thb-07-editorial-critic" ? { previously_declined: (st.declines ?? []).map((d) => ({ key: d.key, issue: d.text, writer_reason: d.reason, raised: d.raised })), declines_rule: "The writer declined these items and the code recorded them. Do not raise one again under a new key or new wording: it is counted once and not reopened. To raise it again, put what is new (a claim id, a stored passage, or the changed text) in new_evidence on the finding." } : {}),
    editorial_rules: "docs/references/editorial-standards.md",
  };
  if (agent === "thb-04-section-writer" || agent === "thb-07-editorial-critic") data.voice_reference = { status: vr?.provisional_by ? `provisionally approved by ${vr.provisional_by}; Juan confirms with the first article` : vr?.status, excerpts: safeJson(vr?.fact_value) };
  const allowed = [...L.claims.keys()];
  const fixPass = agent === "thb-04-section-writer" && isV1FixPass(st);
  const packet = {
    agent_key: agent, prompt_version: metaOf(agent).promptVersion,
    instructions: `You are ${agent === CLASSIC_V1_KEY ? "V1 (Fact and Privacy, the fact gate of the classic loop)" : `Agent ${STUDIO_AGENT_META[agent as StudioAgentKey].n}`}. Follow .claude/agents/${agent}.md exactly.${agent === CLASSIC_V1_KEY ? ` ${RECEIPT_INSTRUCTION(agent)}` : ""} Work on ONE unit (${unitKey}) of ONE article using only the data block. You never approve, lock or set a state.${fixPass ? " This is a V1 fix pass: change only the sentences V1 cited (v1_fix_pass.fix_only_cited_sentences) and keep every other sentence exactly as it is; a version that changes other sentences is rejected by code." : ""}`,
    ...(agent === CLASSIC_V1_KEY ? { prompt_receipt_required: true } : {}),      // Leo, 2026-10-14: V1 must load its prompt file; the output carries the receipt
    opportunity_id: L.article.opportunity_id, article_id: articleId, unit_key: unitKey, unit_hash: cur?.content_hash ?? null, allowed_claim_ids: allowed,
    input_version_ids: [cur?.content_hash ?? `unit:${unitKey}:none`],
    output_contract: { schema: agent === CLASSIC_V1_KEY ? "blueprint-§5-common+team-role-result" : "blueprint-§5-common+studio-agent-result", decisions: metaOf(agent).decisions, submit: "npm run studio -- submit <run_id> <file.json>" },
    untrusted_data_block: wrapUntrusted(data),
  };
  const { data: run, error } = await db.from("agent_runs").insert({ agent_key: agent, subject_type: "article", subject_id: articleId, status: "QUEUED", task_packet: packet, prompt_version: metaOf(agent).promptVersion }).select("id").single();
  if (error) throw error;
  await db.from("audit_events").insert({ actor: "system:studio", subject_type: "article", subject_id: articleId, event_type: "agent_run_queued", accepted: true, detail: { run: run.id, agent, unit: unitKey } });
  return { runId: run.id, duplicate: false };
}
const safeJson = (s: string | undefined | null) => { try { return s ? JSON.parse(s) : null; } catch { return s ?? null; } };

export async function voiceUsable(db: SupabaseClient): Promise<boolean> {
  const { data } = await db.from("brand_facts").select("status,provisional_by,fact_value").eq("fact_key", "voice_reference").single();
  return !!data && (data.status === "approved" || (!!data.provisional_by && !/^NEEDED/.test(data.fact_value)));
}

// ---------- submit ----------
export type StudioSubmit = { ok: true; note?: string } | { ok: false; errors: string[]; final: boolean; attempt: number };

async function modeError(db: SupabaseClient, run: any): Promise<string | null> {
  const { data: art } = await db.from("articles").select("pipeline_mode").eq("id", run.subject_id).single();
  return pipelineGuard(modeOf(art ?? {}), run.agent_key);
}

/** Switch an article between the classic and team pipelines (Leo). Allowed only before any section is written, or on a team-mode branch; recorded in the audit log. */
export async function setPipelineMode(db: SupabaseClient, articleId: string, next: unknown, actorId: string): Promise<{ ok: true; mode: PipelineMode; noop: boolean } | { ok: false; reason: string }> {
  const { data: art } = await db.from("articles").select("id,pipeline_mode,branch_of,is_fixture").eq("id", articleId).single();
  if (!art) return { ok: false, reason: "no such article" };
  const denied = resolveActorError(actorId, art);
  if (denied) return { ok: false, reason: denied };
  const { data: secs } = await db.from("article_sections").select("status,current_version_id").eq("article_id", articleId);
  const { count } = await db.from("proposals").select("id", { count: "exact", head: true }).eq("article_id", articleId);
  const current = modeOf(art);
  const rule = modeChangeRule({ current, next, isBranch: !!art.branch_of, sectionsWritten: (secs ?? []).filter((x: any) => x.status !== "NEEDS_WRITE" || x.current_version_id).length, hasProposal: (count ?? 0) > 0 });
  if (!rule.ok) return rule;
  if (rule.noop) return { ok: true, mode: current, noop: true };
  const { error } = await db.from("articles").update({ pipeline_mode: next }).eq("id", articleId);
  if (error) return { ok: false, reason: error.message };
  await audit(db, articleId, "pipeline_mode_changed", { from: current, to: next }, actorId);
  return { ok: true, mode: next as PipelineMode, noop: false };
}

export async function validateStudio(db: SupabaseClient, runId: string, raw: string): Promise<{ run: any; parsed: any | null; errors: string[]; L: Loaded | null; row: any | null }> {
  const { data: run } = await db.from("agent_runs").select("*").eq("id", runId).single();
  const errors: string[] = [];
  let parsed: any = null; let L: Loaded | null = null; let row: any = null;
  if (!isStudioAgent(run.agent_key) && run.agent_key !== CLASSIC_V1_KEY) return { run, parsed, errors: ["not a Content Studio agent run"], L, row };
  const wrong = await modeError(db, run);
  if (wrong) return { run, parsed, errors: [wrong], L, row };
  try {
    const r = (run.agent_key === CLASSIC_V1_KEY ? teamSchema("V1") : studioOutputSchemas[run.agent_key as StudioAgentKey]).safeParse(JSON.parse(raw));
    if (!r.success) for (const i of r.error.issues) errors.push(`${i.path.join(".") || "(root)"}: ${i.message}`);
    else {
      parsed = r.data;
      L = await load(db, run.subject_id);
      row = L.sections.find((s) => s.section_key === run.task_packet.unit_key);
      const cur = row?.current_version_id ? (await db.from("section_versions").select("*").eq("id", row.current_version_id).single()).data : null;
      const ctx: StudioValidationCtx = { packet: run.task_packet, currentUnit: cur?.content ?? null, currentHash: cur?.content_hash ?? null, check: L.check, voiceUsable: await voiceUsable(db), requiredIssuesOpen: stateOf(row).issues.map((i) => i.key).filter((k) => !k.startsWith("det:")), declinableKeys: (stateOf(row).collected ?? []).map((c) => c.key) };
      if (run.agent_key === CLASSIC_V1_KEY) {
        const pendingH = (stateOf(row).hedges ?? []).filter(needsRuling);
        errors.push(...(await teamSemanticChecks("V1", parsed, { packet: { ...run.task_packet, role: "V1" } as TeamPacket, currentHash: ctx.currentHash, studio: ctx, pendingHedgeKeys: pendingH.map((h) => h.key), pendingHedges: pendingH.map((h) => ({ key: h.key, sentence: h.sentence })) })));
      } else errors.push(...studioSemanticChecks(run.agent_key as StudioAgentKey, parsed, ctx));
    }
  } catch (e) { errors.push(`not valid JSON: ${e instanceof Error ? e.message : String(e)}`); }
  return { run, parsed, errors, L, row };
}

export async function submitStudio(db: SupabaseClient, runId: string, raw: string): Promise<StudioSubmit> {
  const { run, parsed, errors, L, row } = await validateStudio(db, runId, raw);
  if (run.status === "SUBMITTED") return { ok: false, errors: ["this run already has an accepted output"], final: true, attempt: run.retries };
  if (run.status === "FAILED") return { ok: false, errors: ["this run already failed; the article is in INTEGRATION_ERROR"], final: true, attempt: run.retries };
  // A submit for the other pipeline is refused outright: it does not use an attempt and cannot push the article to INTEGRATION_ERROR.
  const wrong = await modeError(db, run);
  if (wrong) return { ok: false, errors: [wrong], final: false, attempt: run.retries };
  if (errors.length === 0 && parsed && L && row) {
    await db.from("agent_runs").update({ status: "SUBMITTED", output: parsed, model_version: parsed.model_version, error: null, updated_at: new Date().toISOString() }).eq("id", runId);
    await db.from("audit_events").insert({ actor: `agent:${run.agent_key}`, subject_type: "article", subject_id: run.subject_id, event_type: "agent_run_submitted", accepted: true, detail: { run: runId, unit: run.task_packet.unit_key, decision: parsed.decision } });
    const note = await applyAccepted(db, run, parsed, L, row);
    return { ok: true, note };
  }
  const retries = run.retries + 1;
  const final = retries >= MAX_ATTEMPTS;
  await db.from("agent_runs").update({ retries, status: final ? "FAILED" : "QUEUED", error: errors.slice(0, 20).join(" | "), updated_at: new Date().toISOString() }).eq("id", runId);
  if (final) await orch(db).transition("article", run.subject_id, "INTEGRATION_ERROR", { kind: "system", id: "agent-bridge" }, { agent_run: runId, agent: run.agent_key, attempts: retries, error: errors.slice(0, 5).join(" | ") });
  return { ok: false, errors, final, attempt: retries };
}

async function saveSection(db: SupabaseClient, id: string, s: SectionState, extra: Record<string, unknown> = {}) {
  const { error } = await db.from("article_sections").update({ ...toRow(s), ...extra }).eq("id", id);
  if (error) throw error;
}
async function audit(db: SupabaseClient, articleId: string, type: string, detail: Record<string, unknown>, actor = "system:studio", hash: string | null = null) {
  await db.from("audit_events").insert({ actor, subject_type: "article", subject_id: articleId, event_type: type, accepted: true, version_hash: hash, detail });
}

async function newVersion(db: SupabaseClient, row: any, u: Unit, by: string, runId: string | null, reason: string) {
  const hash = contentHash(u);
  const sig = materialSig(unitText(u), unitClaimIds(u));
  const st = stateOf(row);
  const { data, error } = await db.from("section_versions").insert({ section_id: row.id, version_no: st.versionNo + 1, content: u, content_hash: hash, material_sig: sig, reason, created_by: by, agent_run_id: runId }).select("id").single();
  if (error) throw error;
  return { id: data.id as string, hash, sig };
}

async function blockArticle(db: SupabaseClient, articleId: string, kind: "BLOCKED_CLAIM" | "BLOCKED_PRIVACY", detail: Record<string, unknown>) {
  const { data: a } = await db.from("articles").select("state").eq("id", articleId).single();
  if (a?.state === "DRAFTING") await orch(db).transition("article", articleId, kind, SYSTEM, detail);
}

async function applyAccepted(db: SupabaseClient, run: any, out: any, L: Loaded, row: any): Promise<string | undefined> {
  const agent = run.agent_key as StudioAgentKey;
  const isV1 = run.agent_key === CLASSIC_V1_KEY;
  const r = out.result;
  const st = stateOf(row);
  const articleId = run.subject_id as string;
  const issuesOf = (): { key: string; text: string }[] => (out.findings as any[]).filter((f) => f.severity === "required").map((f) => ({ key: f.issue_key, text: f.note }));
  let note: string | undefined;

  if (agent === "thb-04-section-writer") {
    if (out.decision === "BLOCKED") {
      const o = escalateGap(st, out.required_actions.join("; "));
      if (!o.ok) throw new Error(o.error);
      await saveSection(db, row.id, o.state);
      await db.from("escalations").insert({ article_id: articleId, section_id: row.id, issue_key: "writer:gap", reason: out.required_actions.join("; "), attempts: 0 });
      return "writer reported a gap: escalated to Leo";
    }
    const u = r.unit as Unit;
    const v = await newVersion(db, row, u, agent, run.id, r.change_note);
    const o = recordVersion(st, { hash: v.hash, sig: v.sig, text: unitText(u) });
    if (!o.ok) throw new Error(o.error);
    let next = o.state;
    const findings = checkUnit(u, L.check);
    // The writer's V1-fix pass may change only the sentences V1 cited. Agent 7 revisions, human edits and reopens are not fix passes and are not checked here.
    if (isV1FixPass(st)) { const churn = fixChurn(st.v1Reviewed?.sentences ?? st.sentences, splitSentences(unitText(u)), st.fixCited ?? []); if (churn) findings.push(churn); }
    const d = applyDeterministic(next, findings);
    if (!d.ok) throw new Error(d.error);
    next = d.state;
    const declined: { key: string; reason: string }[] = r.declines ?? [];
    if (declined.length) {
      const dm = declineOptional(next, declined);
      if (!dm.ok) throw new Error(dm.error);
      next = dm.state;
      await audit(db, articleId, "writer_declines", { unit: u.key, declines: declined });
    }
    await saveSection(db, row.id, next, { current_version_id: v.id, body: JSON.stringify(u) });
    await audit(db, articleId, "section_version", { unit: u.key, version: next.versionNo, hash: v.hash, status: next.status, deterministic_findings: findings.map((f) => `${f.code}: ${f.detail}`), note: o.note });
    if (next.status === "BLOCKED_CLAIM" || next.status === "BLOCKED_PRIVACY") await blockArticle(db, articleId, next.status, { unit: u.key, blockedBy: next.blockedBy });
    if (next.status === "ESCALATED") await db.from("escalations").insert({ article_id: articleId, section_id: row.id, issue_key: next.escalation!.issueKey, reason: next.escalation!.reason, attempts: 2 });
    note = `section ${u.key} is now ${next.status}`;
  } else {
    const dec = out.decision as "PASS" | "REVISION" | "BLOCKED";
    const optional = (out.findings as any[]).filter((f) => f.severity === "optional").map((f) => ({ key: f.issue_key as string, text: f.note as string, newEvidence: f.new_evidence as string | undefined }));
    const review = applyReview(st, { agent: isV1 ? "V1" : (STUDIO_AGENT_META[agent].n as 5 | 6 | 7), versionHash: r.version_hash, decision: dec, issues: issuesOf(), blockKind: r.block_kind, optional, hedgeRulings: isV1 ? r.hedge_rulings : undefined });
    if (!review.ok) throw new Error(review.error);
    let next = review.state;
    let versionId: string | null = row.current_version_id;
    if (agent === "thb-07-editorial-critic" && r.revised_unit && dec === "PASS") {
      // The editor's replacement is a new version. Anything material sends it back to Agent 5; it can never lock a changed fact.
      const u = r.revised_unit as Unit;
      const v = await newVersion(db, row, u, agent, run.id, "editorial focused revision");
      const e = editorRevision({ ...st, collected: next.collected, declines: next.declines, status: "NEEDS_EDITORIAL" }, { hash: v.hash, sig: v.sig, text: unitText(u) });
      if (!e.ok) throw new Error(e.error);
      next = e.state; versionId = v.id; note = e.note;
      const findings = checkUnit(u, L.check);
      const d = applyDeterministic(next, findings);
      if (d.ok) next = d.state;
      await saveSection(db, row.id, next, { current_version_id: v.id, body: JSON.stringify(u) });
    } else {
      note = review.note;
      await saveSection(db, row.id, next);
    }
    await db.from("section_reviews").insert({ section_id: row.id, version_id: versionId, agent_key: agent, decision: dec, findings: out.findings, required_actions: out.required_actions, advisory_score: agent === "thb-07-editorial-critic" ? Math.round(r.score.total) : null, agent_run_id: run.id });
    await audit(db, articleId, "section_review", { unit: run.task_packet.unit_key, agent: run.agent_key, decision: dec, status: next.status, note, v1_scope: isV1 ? (st.v1Scope?.kind ?? "full") : undefined, v1_round: isV1 ? next.v1Rounds : undefined });
    if (next.status === "LOCKED") {
      await db.from("article_sections").update({ locked_version_id: versionId }).eq("id", row.id);
      // Lock the verified wording of every claim this section relies on.
      const { data: ver } = await db.from("section_versions").select("content").eq("id", versionId).single();
      for (const id of unitClaimIds(ver!.content as Unit)) { const c = L.claims.get(id); if (c) await db.from("claims").update({ locked_text: c.text, text_hash: sha256(c.text) }).eq("article_id", articleId).eq("claim_key", id); }
    }
    // Phase 3e: V1 could not verify a legal point from the official text: an escalation to Leo that names the reference needed (shown in the Studio and the CLI).
    if (isV1 && next.status === "BLOCKED_CLAIM") for (const ref of (r.leo_reference_needed ?? []) as { claim: string | null; section: string | null; why: string }[]) await db.from("escalations").insert({ article_id: articleId, section_id: row.id, issue_key: `legal:reference-needed:${run.task_packet.unit_key}`, reason: `Leo, a reference is needed: ${ref.why}`, attempts: 0, reference_needed: ref });
    if (next.status === "BLOCKED_CLAIM" || next.status === "BLOCKED_PRIVACY") await blockArticle(db, articleId, next.status, { unit: run.task_packet.unit_key, blockedBy: next.blockedBy });
    if (next.status === "ESCALATED") await db.from("escalations").insert({ article_id: articleId, section_id: row.id, issue_key: next.escalation!.issueKey, reason: next.escalation!.reason, attempts: 2 });
  }
  const adv = await advanceArticle(db, articleId);
  return [note, adv].filter(Boolean).join("; ");
}

// ---------- human actions on sections ----------
export async function resolveSection(db: SupabaseClient, articleId: string, unitKey: string, action: { kind: "request_revision"; text: string } | { kind: "hold" } | { kind: "reopen"; text: string } | { kind: "v1_gate" }, actorId: string) {
  // Leo's action only: an agent-like actor is refused before anything is read or written.
  if (agentLikeActor(actorId) || !actorId.trim()) return { ok: false as const, reason: resolveActorError(actorId, null)! };   // before any read or write
  const L = await load(db, articleId);
  const denied = resolveActorError(actorId, L.article);
  if (denied) return { ok: false as const, reason: denied };
  const row = L.sections.find((s) => s.section_key === unitKey);
  if (!row) return { ok: false as const, reason: "no such section" };
  // A team article keeps its loop state in the team envelope: Leo's resolve goes through the team loop functions and never rewrites it in the classic shape.
  const team = modeOf(L.article) === "team";
  let newStatus: string;
  const humanAction = action.kind === "hold" ? { kind: "hold" as const } : { kind: "request_revision" as const, issueText: "text" in action ? action.text : "" };
  if (team && action.kind === "v1_gate") return { ok: false as const, reason: "the V1 gate action is for classic articles; a team article has V1 in its council" };
  if (team) {
    const env = envelopeOf(row);
    const o = action.kind === "reopen" ? teamReopen(env.team, action.text) : teamResolveByHuman(env.team, humanAction);
    if (!o.ok) return { ok: false as const, reason: o.error };
    if (action.kind !== "hold") await saveEnvelope(db, row, { ...env, team: o.state, councilCards: {}, waitingOn: [] });
    newStatus = o.state.status;
  } else {
    const st = stateOf(row);
    let o: ReturnType<typeof reopen>;
    if (action.kind === "v1_gate") {
      // Leo sends a locked section through the V1 gate without changing its text (a section locked before Phase 3d has no V1 pass).
      const cur = row.current_version_id ? (await db.from("section_versions").select("content").eq("id", row.current_version_id).single()).data : null;
      o = gateOnly(st, { text: cur ? unitText(cur.content as Unit) : undefined });
    } else o = action.kind === "reopen" ? reopen(st, action.text) : resolveByHuman(st, humanAction);
    if (!o.ok) return { ok: false as const, reason: o.error };
    await saveSection(db, row.id, o.state);
    newStatus = o.state.status;
  }
  if (action.kind !== "hold") await db.from("escalations").update({ status: "RESOLVED", resolution: action.kind === "reopen" ? "reopened" : action.kind === "v1_gate" ? "v1_gate" : action.text, resolved_by: actorId, resolved_at: new Date().toISOString() }).eq("section_id", row.id).eq("status", "OPEN");
  await audit(db, articleId, `section_${action.kind}`, { unit: unitKey, text: "text" in action ? action.text : null }, actorId);
  // Anything that reopens work after assembly invalidates the old sign-off and returns the article to drafting.
  const { data: a } = await db.from("articles").select("state").eq("id", articleId).single();
  const o2 = orch(db);
  if (a && ["BLOCKED_CLAIM", "BLOCKED_PRIVACY"].includes(a.state) && action.kind !== "hold") { await o2.transition("article", articleId, "REVISION_REQUIRED", { kind: "human", id: actorId }, { unit: unitKey }); await o2.transition("article", articleId, "DRAFTING", { kind: "human", id: actorId }, { unit: unitKey }); }
  else if (a && ["HUMAN_REVIEW", "APPROVED_FOR_WP_DRAFT"].includes(a.state) && (action.kind === "reopen" || action.kind === "v1_gate")) {
    // Any edit after assembly invalidates the sign-off: close the open proposal, clear the approval, and replace the version hash with a
    // sentinel so no earlier Approval Room record can ever match the article again.
    await db.from("proposals").update({ status: "SUPERSEDED" }).eq("article_id", articleId).eq("status", "OPEN");
    await db.from("articles").update({ approved_hash: null }).eq("id", articleId);
    await db.from("approvals").update({ invalidated_at: new Date().toISOString() }).eq("subject_id", articleId).is("invalidated_at", null);
    await o2.recordEdit("article", articleId, `reopened:${Date.now()}`, { kind: "human", id: actorId });
    const { data: b } = await db.from("articles").select("state").eq("id", articleId).single();
    if (b!.state !== "REVISION_REQUIRED") {
      const t = await o2.transition("article", articleId, "REVISION_REQUIRED", { kind: "human", id: actorId }, { unit: unitKey, reason: "section reopened" });
      if (!t.ok) return { ok: false as const, reason: t.reason };
    }
    const t2 = await o2.transition("article", articleId, "DRAFTING", { kind: "human", id: actorId }, { unit: unitKey });
    if (!t2.ok) return { ok: false as const, reason: t2.reason };
  }
  return { ok: true as const, status: newStatus };
}

// ---------- assembly ----------
export function composeFor(L: Loaded, units: Unit[]): Composed {
  const used = new Set(units.flatMap(unitClaimIds));
  const srcIds = new Set([...used].map((id) => L.claims.get(id)?.sourceId).filter(Boolean) as string[]);
  const related = (L.brief.outline.link_plan as { to_url: string; anchor_intent: string }[]).filter((l) => slash(l.to_url) !== slash(MONEY_URL));
  return {
    author: composeAuthor(L.facts, AUTHOR_URL),
    related: related.map((l) => ({ url: l.to_url, text: (L as any).titles?.get(slash(l.to_url)) ?? l.to_url })),
    sources: [...srcIds].map((id) => { const s = L.sources.get(id); return { label: `California Legislative Information, ${s.title}`, url: s.source_url ?? null }; }),
    cta: composeCta(MONEY_URL),
  };
}

export async function advanceArticle(db: SupabaseClient, articleId: string): Promise<string | undefined> {
  const L = await load(db, articleId);
  if (L.article.state !== "DRAFTING") return undefined;
  const states = L.sections.map(stateOf);
  if (!allLocked(states)) return undefined;
  const units: Unit[] = L.sections.map((s) => L.versions.get(s.locked_version_id)!.content as Unit);
  const findings = checkArticle(units, { briefH2: L.check.briefH2, keyword: L.check.keyword, title: L.article.title, requiredUnitKeys: L.sections.map((s) => s.section_key) });
  if (findings.length) {
    await audit(db, articleId, "article_check_failed", { findings });
    for (const f of findings) await db.from("escalations").insert({ article_id: articleId, issue_key: `article:${f.code}`, reason: f.detail, attempts: 0 });
    return `article checks failed (${findings.map((f) => f.code).join(", ")}); Leo must reopen a section`;
  }
  const { data: pages } = await db.from("pages").select("canonical_url,title,meta_title");
  const titles = new Map((pages ?? []).map((p: any) => [slash(p.canonical_url), (p.meta_title ?? p.title ?? "").replace(/\s+[|—-]\s+Twin Home Buyer.*$/i, "")]));
  (L as any).titles = titles;
  const draft: Draft = { title: L.article.title, slug: L.article.slug ?? "", units };
  const composed = composeFor(L, units);
  const html = renderBody(draft, composed);
  const bad = auditHtml(html);
  if (bad.length) throw new Error(`rendered body failed the HTML allowlist: ${bad.join("; ")}`);
  // Phase 3e: the brand-rule check on the WHOLE rendered article, template parts included (editorial standards section 7, SR-3). A hit stops the assembly.
  const brand = brandRuleFindings(html);
  if (brand.length) {
    await audit(db, articleId, "article_check_failed", { findings: brand, stage: "assembly_brand_rules" });
    for (const f of brand) await db.from("escalations").insert({ article_id: articleId, issue_key: `article:${f.code}`, reason: f.detail, attempts: 0 });
    return `assembly stopped by the brand-rule check (${[...new Set(brand.map((f) => f.code))].join(", ")}); Leo must look at the template text or the wording`;
  }
  const hash = sha256(html);
  const { data: ver, error } = await db.from("article_versions").insert({ article_id: articleId, version_hash: hash, body: { draft, composed, html }, reason: "assembled from locked sections", created_by: "studio" }).select("id").single();
  if (error) throw error;
  const o = orch(db);
  await o.recordEdit("article", articleId, hash, SYSTEM);
  for (const to of ["FACT_PRIVACY_REVIEW", "SEO_AEO_GEO_REVIEW", "EDITORIAL_REVIEW", "HUMAN_REVIEW"] as const) {
    const t = await o.transition("article", articleId, to, SYSTEM, { stage_passed_by_sections: true, article_version: ver.id });
    if (!t.ok) throw new Error(t.reason);
  }
  await db.from("articles").update({ locked_version_id: ver.id }).eq("id", articleId);
  return `article assembled (${hash.slice(0, 12)}…) and is in HUMAN_REVIEW`;
}

// Used by the team runtime (team-service.ts), which lives beside this module and moves state only through the same helpers.
export { audit as auditArticle, blockArticle as blockArticleFor, newVersion as newSectionVersion, orch as orchestratorFor, safeJson, today as todayISO, slash as stripSlash };
