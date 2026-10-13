/* eslint-disable @typescript-eslint/no-explicit-any -- agent outputs and DB JSON columns are validated by zod at the boundary */
// Supabase-backed storage for the agent bridge. Pass a service-role client (server side / CLI only).
import type { SupabaseClient } from "@supabase/supabase-js";
import { Orchestrator, type Actor } from "../orchestrator";
import { SupabaseRepo } from "../orchestrator/supabase-repo";
import { buildScore } from "../engine/score";
import { AGENT_META, type AgentKey } from "./schemas";
import { buildTaskPacket, type AgentRun, type BridgeStore, type TaskPacket, type ValidationContext } from "./bridge";

/** Flags follow the decision that would change a page (the agent's, once it exists), not the engine's first proposal. */
export function deriveFlags(packet: { pages: { url: string; protection_status: string | null; template_flag: string | null; in_inventory: boolean; impressions: number }[]; covering_pages: unknown[] }, decision: string) {
  const changes = decision === "UPDATE" || decision === "MERGE";
  const target = packet.pages.find((p) => p.in_inventory && !/^https?:\/\/[^/]+\/?$/.test(p.url)) ?? packet.pages[0];
  const template = target?.template_flag ?? null;
  return {
    protected_warning: changes && packet.pages.some((p) => p.protection_status !== "not_protected"),
    template_flag: template,
    dev_change_request: changes && template === "city",
  };
}

const SYSTEM: Actor = { kind: "system", id: "agent-bridge" };

export class SupabaseBridgeStore implements BridgeStore {
  constructor(private db: SupabaseClient) {}
  private fromRow = (d: any): AgentRun => ({
    id: d.id, agent_key: d.agent_key, subject_type: d.subject_type, subject_id: d.subject_id, status: d.status, task_packet: d.task_packet,
    output: d.output, prompt_version: d.prompt_version, model_version: d.model_version, retries: d.retries, error: d.error,
  });
  async getRun(id: string) {
    const { data, error } = await this.db.from("agent_runs").select("*").eq("id", id).single();
    if (error) throw error;
    return this.fromRow(data);
  }
  async saveRun(r: AgentRun) {
    const { error } = await this.db.from("agent_runs").update({ status: r.status, output: r.output, model_version: r.model_version, retries: r.retries, error: r.error, updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) throw error;
    await this.db.from("audit_events").insert({ actor: `agent:${r.agent_key}`, subject_type: "opportunity", subject_id: r.subject_id, event_type: `agent_run_${r.status.toLowerCase()}`, accepted: r.status !== "FAILED", detail: { run: r.id, retries: r.retries, error: r.error } });
  }
  async applyAccepted(run: AgentRun, out: Record<string, any>, orch: Orchestrator) {
    const oppId = run.subject_id;
    if (run.agent_key === "thb-01-seo-strategist") {
      const { data: o } = await this.db.from("opportunities").select("packet,state").eq("id", oppId).single();
      const t = (o!.packet as any).totals;
      const score = buildScore({ impressions: t.impressions, position: t.position }, out.result.score_estimates);
      const flags = deriveFlags(o!.packet as any, out.decision);
      await this.db.from("opportunities").update({ agent_decision: out, score, protected_warning: flags.protected_warning, dev_change_request: flags.dev_change_request, template_flag: flags.template_flag }).eq("id", oppId);
      if (o!.state === "CANDIDATE") await orch.transition("opportunity", oppId, "SEO_REVIEW", SYSTEM, { reason: "Agent 1 recommendation recorded; awaiting human decision", run: run.id });
    } else if (run.agent_key === "thb-02-research-evidence") {
      const { data: b } = await this.db.from("briefs").select("id").eq("opportunity_id", oppId).maybeSingle();
      const row = { evidence_packet: { ...out.result, decision: out.decision, run_id: run.id }, notes: "evidence packet recorded; brief not yet built" };
      if (b) await this.db.from("briefs").update(row).eq("id", b.id);
      else await this.db.from("briefs").insert({ opportunity_id: oppId, ...row });
    } else {
      const { data: prev } = await this.db.from("briefs").select("outline,outline_history").eq("opportunity_id", oppId).single();
      const history = prev?.outline ? [...((prev.outline_history as any[]) ?? []), { superseded_at: new Date().toISOString(), outline: prev.outline }] : (prev?.outline_history ?? []);
      await this.db.from("briefs").update({ outline_history: history, outline: { ...out.result.brief, decision: out.decision, run_id: run.id }, notes: out.decision === "PASS" ? "brief awaiting human review" : `Agent 3 returned ${out.decision}` }).eq("opportunity_id", oppId);
      if (out.decision === "PASS") await orch.transition("opportunity", oppId, "BRIEF_REVIEW", SYSTEM, { reason: "Agent 3 brief ready for human review", run: run.id });
    }
  }
}

export function validationContext(db: SupabaseClient) {
  return async (run: AgentRun): Promise<ValidationContext> => {
    const ctx: ValidationContext = { packet: run.task_packet };
    const { data: o } = await db.from("opportunities").select("packet").eq("id", run.subject_id).single();
    if (run.agent_key === "thb-01-seo-strategist") ctx.candidate = o!.packet as any;
    if (run.agent_key === "thb-02-research-evidence") {
      const { data: pas } = await db.from("evidence_passages").select("id,source_id,passage").limit(2000);
      ctx.libraryPassages = new Map((pas ?? []).map((p: any) => [p.id, { source_id: p.source_id, text: p.passage }]));
      const { data: lib } = await db.from("evidence_sources").select("id,recheck_by");
      ctx.legal = { librarySources: new Map((lib ?? []).map((x: any) => [x.id, { recheck_by: x.recheck_by ?? null }])) };
    }
    if (run.agent_key === "thb-03-content-architect") {
      const { data: b } = await db.from("briefs").select("evidence_packet").eq("opportunity_id", run.subject_id).single();
      const ep = b?.evidence_packet as any;
      ctx.agent2Claims = ep?.claims ?? []; ctx.agent2SourceIds = (ep?.sources ?? []).map((s: any) => s.id);
    }
    return ctx;
  };
}

/** Create (or return the open) QUEUED run for one agent on one opportunity. Prerequisites are enforced here. */
export async function queueRun(db: SupabaseClient, agent: AgentKey, oppId: string): Promise<{ run: AgentRun; duplicate: boolean }> {
  const { data: o, error } = await db.from("opportunities").select("*").eq("id", oppId).single();
  if (error) throw error;
  const { data: open } = await db.from("agent_runs").select("*").eq("agent_key", agent).eq("subject_id", oppId).eq("status", "QUEUED").maybeSingle();
  if (open) return { run: new SupabaseBridgeStore(db)["fromRow"](open), duplicate: true };

  let data: unknown; let allowed: string[] | "agent-defined"; let extra: Parameters<typeof buildTaskPacket>[4] = {};
  const pkt = o.packet as any;
  if (agent === "thb-01-seo-strategist") {
    if (!["CANDIDATE", "SEO_REVIEW"].includes(o.state)) throw new Error(`Agent 1 needs a CANDIDATE/SEO_REVIEW opportunity (is ${o.state})`);
    data = { candidate_packet: pkt };
    allowed = [`gsc:${pkt.window.start}..${pkt.window.end}`, ...pkt.pages.map((p: any) => `inv:${p.page_id ?? p.url}`), ...pkt.queries.map((q: any) => `q:${q.query}`)];
  } else if (agent === "thb-02-research-evidence") {
    if (o.state !== "EVIDENCE_REVIEW" || o.human_decision !== "approve") throw new Error("Agent 2 runs only after Leo approved this opportunity (state EVIDENCE_REVIEW)");
    if (o.dev_change_request) throw new Error("This opportunity changes a template-rendered page: it routes to a Developer Change Request (Phase 4), not an Elementor brief.");
    const { data: lib } = await db.from("evidence_sources").select("id,title,source_tier,jurisdiction,effective_date,retrieved_date,source_url,provenance_note").limit(100);
    const { data: pas } = await db.from("evidence_passages").select("id,source_id,passage,locator").limit(2000);
    const library = (lib ?? []).map((l: any) => ({ ...l, passages: (pas ?? []).filter((p: any) => p.source_id === l.id).map((p: any) => ({ passage_id: p.id, locator: p.locator, text: p.passage })) }));
    const { data: facts } = await db.from("brand_facts").select("*").limit(50);
    data = { candidate_packet: pkt, agent1_decision: o.agent_decision, human_reason: o.human_reason, evidence_library: library, library_first_rule: "Use Evidence Library sources FIRST. Cite them with kind=library, library_source_id, passage_ids and a short verbatim quote. Fetch official web pages only for points the library does not cover.", brand_facts_status: (facts ?? []).map((f: any) => ({ key: f.key ?? f.fact_key ?? f.id, status: f.status })), seller_library: { publication_cleared_briefs: 0, note: "No seller story is cleared for publication; do not use seller material." } };
    allowed = "agent-defined";
  } else {
    const { data: b } = await db.from("briefs").select("evidence_packet,outline").eq("opportunity_id", oppId).maybeSingle();
    const ep = b?.evidence_packet as any;
    if (!["EVIDENCE_REVIEW", "REVISION_REQUIRED"].includes(o.state) || !ep || ep.decision !== "PASS") throw new Error("Agent 3 needs an accepted Agent 2 evidence packet with decision PASS (state EVIDENCE_REVIEW or REVISION_REQUIRED)");
    // Agent 3 may cite Agent 2's sources plus the GSC/inventory/query ids that were in the candidate packet (Agent 1's evidence).
    allowed = [...(ep.sources as any[]).map((s) => s.id), `gsc:${pkt.window.start}..${pkt.window.end}`, ...pkt.pages.map((p: any) => `inv:${p.page_id ?? p.url}`), ...pkt.queries.map((q: any) => `q:${q.query}`), ...(pkt.folded_candidates ?? []).flatMap((f: any) => (f.queries ?? []).map((q: any) => `q:${q.query}`))];
    const rd = o.redirect as any;
    let linkCandidates: { url: string; title: string | null }[] | undefined;
    if (rd) {
      const { data: posts } = await db.from("pages").select("canonical_url,title,meta_title,wp_type").eq("wp_type", "post").order("canonical_url");
      const re = new RegExp(rd.link_topic_regex ?? "(lien|code-violation|title-issue|inherit|authority|executor|as-is|delay|repair|tenant|probate)", "i");
      linkCandidates = [...(posts ?? []).filter((p: any) => re.test(p.canonical_url) && !/cash-home-buyer|we-buy-houses/.test(p.canonical_url)).map((p: any) => ({ url: p.canonical_url, title: p.meta_title ?? p.title })), ...(rd.required_links ?? []).map((u: string) => ({ url: u, title: "REQUIRED next-step page (money page, do not change it)" }))];
    }
    data = { candidate_packet: pkt, agent1_decision: o.agent_decision, evidence_packet: ep, ...(rd ? { human_redirect: rd, previous_brief_for_reference: b?.outline, link_candidates: linkCandidates } : {}) };
    extra = rd ? { directive: rd.directive, allowed_link_urls: linkCandidates!.map((l) => l.url), required_links: rd.required_links, forbidden_target_phrases: rd.forbidden_target_phrases } : {};
  }
  const packet: TaskPacket = buildTaskPacket(agent, { id: oppId, versionHash: o.version_hash ?? "" }, data, allowed, extra);
  const { data: row, error: e2 } = await db.from("agent_runs").insert({ agent_key: agent, subject_type: "opportunity", subject_id: oppId, status: "QUEUED", task_packet: packet, prompt_version: AGENT_META[agent].promptVersion }).select("*").single();
  if (e2) throw e2;
  await db.from("audit_events").insert({ actor: "system:agent-bridge", subject_type: "opportunity", subject_id: oppId, event_type: "agent_run_queued", accepted: true, detail: { run: row.id, agent } });
  return { run: new SupabaseBridgeStore(db)["fromRow"](row), duplicate: false };
}

export const makeOrchestrator = (db: SupabaseClient) => new Orchestrator(new SupabaseRepo(db));
