/* eslint-disable @typescript-eslint/no-explicit-any */
// Stage 6 parts A and C: a TEST (never published) of the Bay Area / local-law revision of the hoarder guide. READ-ONLY on the database (the real Evidence Library, the real opportunity packet,
// stored Search Console rows); nothing is written there, no article, proposal, approval or WordPress write exists. The real agents are dispatched by the operator; their outputs are checked here
// by the PRODUCTION checks and printed. Everything the agents write stays in <dir>.
//   Part A (local law):  a-prepare <dir>   -> Agent 2 packet (a2-packet.json)           [dispatch thb-02-research-evidence -> a2-out.json]
//                        a-verify  <dir>   -> checks it; writes the writer packet (a4-packet.json)   [dispatch thb-04-section-writer -> a4-out.json]
//                        a-writer-verify <dir> -> checks the unit; writes four V1 packets for the layer check (v1-*-packet.json)   [dispatch V1 x4 -> v1-*-out.json]
//                        a-v1-verify <dir> -> V1's verdicts against what the layer rules call for
//   Part C (Bay Area):   c-prepare <dir>   -> Agent 1 packet (c1-packet.json)            [dispatch thb-01-seo-strategist -> c1-out.json]
//                        c-brief   <dir>   -> checks it; writes the Agent 3 packet (c3-packet.json)  [dispatch thb-03-content-architect -> c3-out.json]
//                        c-verify  <dir>   -> checks it and runs the cannibalization check on stored Search Console rows
import { noQueryDataNote } from "../src/lib/studio/cannibalization-note";
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildTaskPacket, semanticChecks, wrapUntrusted } from "../src/lib/agents/bridge";
import { outputSchemas } from "../src/lib/agents/schemas";
import { STUDIO_AGENT_META, studioSemanticChecks, V1_PROMPT_VERSION, type StudioValidationCtx } from "../src/lib/studio/agents";
import { teamSchema } from "../src/lib/team/bridge";
import { checkUnit, hedgeFlagsInText, type CheckCtx, type LedgerClaim } from "../src/lib/studio/checks";
import { legalKindsOf } from "../src/lib/studio/legal-flags";
import { sha256 } from "../src/lib/studio/hash";
import { RECEIPT_INSTRUCTION } from "../src/lib/agents/prompt-receipt";
import { unitText, unit as unitSchema, type Unit } from "../src/lib/studio/schema";
import { jurisdictionAllowed, isLocalJurisdiction } from "../src/lib/studio/jurisdictions";
import { computeOverlaps } from "../src/lib/audit/overlap";

const [cmd, dir] = process.argv.slice(2);
if (!cmd || !dir) throw new Error("usage: stage6-dryrun.mts <command> <dir>");
mkdirSync(dir, { recursive: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const OPP = "1d78c9e3-6b2d-4434-88ed-56b905e67c24";
const ALLOWED = ["California", "City and County of San Francisco", "San Mateo County"];
const TEST_ARTICLE = { id: "stage6-test-article", title: "Selling a Packed or Hoarded House in the SF Bay Area (TEST, never published)", slug: "stage6-test", primary_keyword: "sell a hoarder house bay area" };
const read = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8"));
const write = (f: string, o: unknown) => writeFileSync(join(dir, f), JSON.stringify(o, null, 2));
const log: string[] = []; const say = (s: string) => { log.push(s); console.log(s); };

async function library() {
  const { data: lib } = await db.from("evidence_sources").select("id,title,source_tier,jurisdiction,effective_date,retrieved_date,recheck_by,source_url,provenance_note");
  const { data: pas } = await db.from("evidence_passages").select("id,source_id,passage,locator").limit(5000);
  return (lib ?? []).map((l: any) => ({ ...l, passages: (pas ?? []).filter((p: any) => p.source_id === l.id).map((p: any) => ({ passage_id: p.id, locator: p.locator, text: p.passage })) }));
}
async function opportunity() { const { data } = await db.from("opportunities").select("packet,agent_decision,human_reason,version_hash,redirect").eq("id", OPP).single(); return data as any; }
const isToc = (title: string) => /table of contents/i.test(title);

if (cmd === "a-prepare") {
  const o = await opportunity(); const lib = await library();
  const data = {
    candidate_packet: o.packet, agent1_decision: o.agent_decision,
    human_reason: "STAGE 6 PART A DRY RUN (a test; no article exists and nothing is saved): research the LOCAL-LAW points a Bay Area revision of the hoarder guide needs, for the jurisdictions in allowed_jurisdictions. Use the Evidence Library only. State-law points already stored (H&S 17920.3, Civil Code 1102 and 1102.6) are not part of this task. Where the library does not support a local point (it holds a table of contents but not the section), do NOT write a supported claim: give Leo a print request.",
    local_points: [
      "San Francisco: what the City and County of San Francisco's own code requires when a residential building is sold (the library holds Housing Code section 351).",
      "San Francisco: what the Housing Code or Health Code Article 11 says about hazardous or unsafe conditions in a home and who deals with them (the library holds only tables of contents for these).",
      "San Mateo County (unincorporated areas): the county's rules on property maintenance or nuisance conditions in a home (the library holds only the Ordinance Code table of contents).",
      "The City of San Mateo is NOT on the list: do not research it.",
    ],
    allowed_jurisdictions: ALLOWED,
    evidence_library: lib,
    library_first_rule: "Use Evidence Library sources FIRST. Cite them with kind=library, library_source_id, passage_ids and a short verbatim quote. For high-risk legal claims the library is the only allowed source (standing rules SR-4 to SR-6). A missing print is a print request, never a claim.",
  };
  const p = buildTaskPacket("thb-02-research-evidence", { id: "stage6-a-opportunity", versionHash: "stage6" }, data, "agent-defined");
  write("a2-packet.json", { run_id: "stage6-a2", attempts_used: 0, last_error: null, ...p });
  say(`prepared: library of ${lib.length} sources (${lib.reduce((n: number, l: any) => n + l.passages.length, 0)} passages); allowed jurisdictions ${ALLOWED.join(" | ")}; wrote a2-packet.json`);
} else if (cmd === "a-verify") {
  const lib = await library();
  const passages = new Map(lib.flatMap((l: any) => l.passages.map((p: any) => [p.passage_id, { source_id: l.id, text: p.text }])));
  const out = read("a2-out.json"); const packet = read("a2-packet.json");
  const parsed = outputSchemas["thb-02-research-evidence"].safeParse(out);
  const errs = parsed.success ? semanticChecks("thb-02-research-evidence", parsed.data as any, { packet, libraryPassages: passages as any, legal: { librarySources: new Map(lib.map((l: any) => [l.id, { recheck_by: l.recheck_by, needs_reprint: /^NEEDS REPRINT/i.test(l.provenance_note ?? "") }])), allowedJurisdictions: ALLOWED, library: lib.map((l: any) => ({ title: l.title, jurisdiction: l.jurisdiction })) } }) : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  say(`Agent 2: decision ${out.decision}: ${errs.length ? `REFUSED by the production checks (${errs.length})` : "ACCEPTED by the production checks"}`);
  for (const e of errs.slice(0, 15)) say(`   - ${String(e).slice(0, 300)}`);
  const srcBy = new Map((out.result?.sources ?? []).map((s: any) => [s.id, s]));
  let sanMateoSupported = 0, tocSupported = 0, layerFlags = 0;
  say("\nclaims:");
  for (const c of out.result?.claims ?? []) {
    const libSrc = (c.source_ids ?? []).map((id: string) => srcBy.get(id)).map((s: any) => lib.find((l: any) => l.id === s?.library_source_id)).filter(Boolean);
    const onToc = libSrc.some((l: any) => isToc(l.title));
    if (c.support === "supported" && /san mateo/i.test(c.jurisdiction)) sanMateoSupported++;
    if (c.support === "supported" && onToc) tocSupported++;
    const kinds = legalKindsOf(c.text); if (kinds.length) layerFlags++;
    say(`  ${c.id} [${c.support}, ${c.risk}] ${c.jurisdiction} | ${c.section ?? "no section"} | ${c.verification ? `${c.verification.label}/impact ${c.verification.reader_impact}` : "no verification"}${onToc ? " | RESTS ON A TABLE OF CONTENTS" : ""}${kinds.length ? ` | flags ${kinds.join(",")}` : ""}\n      ${String(c.text).slice(0, 250)}`);
  }
  say("\nprint requests:");
  for (const r of out.result?.print_requests ?? []) say(`  ${r.jurisdiction} | ${r.code} | section ${r.section} | ${r.title}${r.url ? ` | ${r.url}` : ""}\n      why: ${String(r.why).slice(0, 220)}`);
  if (!(out.result?.print_requests ?? []).length) say("  (none)");
  for (const u of out.result?.unresolved ?? []) say(`unresolved: ${String(u).slice(0, 220)}`);
  say(`\nmeasures: supported San Mateo claims ${sanMateoSupported} (must be 0 while only the table of contents is stored); supported claims resting on a table of contents ${tocSupported} (must be 0); claims with layer flags ${layerFlags}; print requests ${(out.result?.print_requests ?? []).length}; claims outside the allowed list ${(out.result?.claims ?? []).filter((c: any) => !jurisdictionAllowed(c.jurisdiction, ALLOWED)).length}`);
  writeFileSync(join(dir, "a-report.txt"), log.join("\n"));
  if (errs.length) { say("stopping: the output was refused"); process.exit(0); }

  // the ledger the writer may use: the supported local claims (state claims are not part of this test unit)
  const supported = (out.result.claims as any[]).filter((c) => c.support === "supported" && isLocalJurisdiction(c.jurisdiction));
  const ledger = supported.map((c) => { const s: any = srcBy.get(c.source_ids[0]); const l = lib.find((x: any) => x.id === s?.library_source_id); return { id: c.id, text: c.text, risk: c.risk, support: c.support, jurisdiction: c.jurisdiction, source: { title: l?.title, url: l?.source_url }, quote: c.quote, section: c.section, verification_label: c.verification?.label, verification_reason: c.verification?.reason ?? null, reader_impact: c.verification?.reader_impact, gates: c.gates ?? [], verified_against: c.verification?.against } });
  const unresolved = out.result.unresolved ?? [];
  const data = {
    article: TEST_ARTICLE, unit_key: "s10",
    brief_for_this_unit: { section_key: "s10", h2: "What San Francisco's own code adds", purpose: "A SHORT section (about 80 to 140 words) telling a San Francisco reader which local rule, if any, the ledger supports, kept separate from California law. Local points with no ledger claim are NOT stated: use exactly the sentence \"Local rules vary; check with your city or county.\" for them.", is_first_section: false },
    brief_global: { target_reader: "A Bay Area owner or family member dealing with a packed or hoarded house", answer_first: true, honest_options: true, professional_confirmation: "an attorney or title company", link_plan: [], open_items: unresolved },
    allowed_jurisdictions: ALLOWED, claim_ledger: ledger,
    approved_brand_facts: [{ key: "company_name", value: "Twin Home Buyer" }],
    pending_juan_blocked: "hours/24h, closing time, ownership/founder/title, contractor license, address vs service area, Equity Track, $32M+, 100% on time, East Oakland roots; and any statement that THB buys as-is or without a cleanout. Never write a rating or review count. No service-area claims: never say where Twin Home Buyer buys.",
    current_version: null, open_issues: [], editorial_rules: "docs/references/editorial-standards.md",
    voice_reference: { status: "not provided for this dry run" },
  };
  const w = { agent_key: "thb-04-section-writer", prompt_version: STUDIO_AGENT_META["thb-04-section-writer"].promptVersion, instructions: "You are Agent 4. Follow .claude/agents/thb-04-section-writer.md exactly. Work on ONE unit (s10) of ONE test article using only the data block. You never approve, lock or set a state. If the claim ledger is empty, write ONLY what the brief allows without claims (the exact \"Local rules vary; check with your city or county.\" sentence plus a short plain sentence telling the reader to check with their city), and never describe what a local code says.", opportunity_id: "stage6-a-opportunity", article_id: TEST_ARTICLE.id, unit_key: "s10", unit_hash: null, allowed_claim_ids: ledger.map((c) => c.id), input_version_ids: ["unit:s10:none"], untrusted_data_block: wrapUntrusted(data) };
  write("a4-packet.json", { run_id: "stage6-a4", attempts_used: 0, last_error: null, ...w });
  write("a-ledger.json", ledger);
  say(`wrote a4-packet.json: ${ledger.length} supported local claim(s) in the writer's ledger`);
} else if (cmd === "a-writer-verify") {
  const out = read("a4-out.json"); const ledger = read("a-ledger.json"); const packet = read("a4-packet.json");
  const lib = await library();
  const claims = new Map<string, LedgerClaim>(ledger.map((c: any) => [c.id, { id: c.id, text: c.text, risk: c.risk, support: "supported", sourceId: "x", sourceRecheckBy: "2027-01-13", jurisdiction: c.jurisdiction, verification: { quote: c.quote, section: c.section, label: c.verification_label, reason: c.verification_reason, against: c.verified_against, gates: c.gates ?? [], readerImpact: c.reader_impact } } as LedgerClaim]));
  const check: CheckCtx = { today: new Date().toISOString().slice(0, 10), claims, approvedFactTexts: [], allowedLinks: [], sourceUrls: lib.map((l: any) => l.source_url).filter(Boolean), internalPassages: [], allowedJurisdictions: ALLOWED, blockedPhrases: [], briefH2: { s10: "What San Francisco's own code adds" }, keyword: "packed house", legalRecord: true };
  const ctx: StudioValidationCtx = { packet: { ...packet, agent_key: "thb-04-section-writer" } as any, currentUnit: null, currentHash: null, check, voiceUsable: true, requiredIssuesOpen: [] };
  const errs = studioSemanticChecks("thb-04-section-writer", out, ctx);
  say(`Agent 4: decision ${out.decision}: ${errs.length ? `REFUSED by the production checks (${errs.length})` : "ACCEPTED by the production checks"}`);
  for (const e of errs.slice(0, 15)) say(`   - ${String(e).slice(0, 300)}`);
  const u: Unit | undefined = out.result?.unit;
  if (!u) { say("no unit written"); writeFileSync(join(dir, "a-writer-report.txt"), log.join("\n")); process.exit(0); }
  say(`\nthe unit (${unitText(u).split(/\s+/).length} words):\n${unitText(u).split("\n").map((l) => "   " + l).join("\n")}`);
  say(`deterministic findings: ${checkUnit(u, check).map((f) => f.code).join(", ") || "none"}`);
  // four V1 layer checks: the writer's own unit, and three planted breaks
  const variants: { key: string; label: string; expect: string; unit: Unit }[] = [{ key: "writer", label: "the writer's own unit", expect: "PASS or REVISION, judged on its merits", unit: u }];
  const withBlock = (text: string, ids: string[] = []): Unit => ({ ...(u as any), blocks: [...(u as any).blocks, { t: "p", text }], claim_ids: [...new Set([...(u as any).claim_ids, ...ids])] });
  variants.push({ key: "blend", label: "planted: a local rule and California law in one rule", expect: "REVISION or BLOCKED", unit: withBlock("Under California law and San Francisco's housing code, the same conditions count as a substandard building.", ledger.slice(0, 1).map((c: any) => c.id)) });
  variants.push({ key: "cross", label: "planted: San Francisco and San Mateo County treated as the same", expect: "REVISION or BLOCKED", unit: withBlock("San Francisco and San Mateo County handle these conditions the same way.") });
  variants.push({ key: "invented", label: "planted: a San Mateo County rule with no claim and no print", expect: "REVISION or BLOCKED", unit: withBlock("San Mateo County's code requires owners to clear a hoarded home within 30 days.") });
  const keep: any[] = [];
  for (const v of variants) {
    const hash = sha256(JSON.stringify(v.unit));
    const flags = hedgeFlagsInText(unitText(v.unit));
    const det = checkUnit(v.unit, check).map((f) => f.code);
    keep.push({ key: v.key, label: v.label, expect: v.expect, deterministic_findings: det, legal_flags: flags.flatMap((f) => f.legal ?? []) });
    const data = { article: TEST_ARTICLE, unit_key: "s10", brief_for_this_unit: { section_key: "s10", h2: "What San Francisco's own code adds" }, allowed_jurisdictions: ALLOWED, claim_ledger: ledger, approved_brand_facts: [{ key: "company_name", value: "Twin Home Buyer" }], current_version: { version_hash: hash, unit: v.unit }, open_issues: [], review_scope: { kind: "full" }, hedge_flags: flags.map((h) => ({ key: h.key, term: h.term, sentence: h.sentence })), editorial_rules: "docs/references/editorial-standards.md", note: "STAGE 6 PART A DRY RUN: a test article, never published." };
    write(`v1-${v.key}-packet.json`, { run_id: `stage6-v1-${v.key}`, attempts_used: 0, last_error: null, agent_key: "thb-v1-fact-privacy", prompt_version: V1_PROMPT_VERSION, prompt_receipt_required: true, instructions: RECEIPT_INSTRUCTION("thb-v1-fact-privacy") + " You are V1 (Fact and Privacy, the fact gate of the classic loop). Follow .claude/agents/thb-v1-fact-privacy.md exactly (including 'Local law layers'). Work on ONE unit (s10) of ONE test article using only the data block. You never approve, lock or set a state.", opportunity_id: "stage6-a-opportunity", article_id: TEST_ARTICLE.id, unit_key: "s10", unit_hash: hash, allowed_claim_ids: ledger.map((c: any) => c.id), input_version_ids: [hash], untrusted_data_block: wrapUntrusted(data) });
  }
  write("v1-variants.json", keep);
  for (const k of keep) say(`variant ${k.key}: deterministic findings: ${k.deterministic_findings.join(", ") || "none"}; legal flags: ${k.legal_flags.join(", ") || "none"}`);
  writeFileSync(join(dir, "a-writer-report.txt"), log.join("\n"));
} else if (cmd === "a-v1-verify") {
  const keep = read("v1-variants.json");
  for (const k of keep) {
    const f = join(dir, `v1-${k.key}-out.json`);
    if (!existsSync(f)) { say(`${k.key}: no V1 output`); continue; }
    const out = JSON.parse(readFileSync(f, "utf8"));
    const p = teamSchema("V1").safeParse(out);
    say(`${k.key.padEnd(9)} ${k.label}\n   V1 decision ${out.decision}${p.success ? "" : ` (SCHEMA REFUSED: ${p.error.issues.slice(0, 2).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")})`}; expected ${k.expect}; code flags: ${k.deterministic_findings.join(", ") || "none"}`);
    for (const c of (out.result?.claim_checks ?? []).slice(0, 4)) say(`   claim ${c.claim_id}: ${c.verdict}${c.quote_comparison ? ` / ${c.quote_comparison}` : ""} ${String(c.note).slice(0, 120)}`);
    for (const x of (out.findings ?? []).slice(0, 4)) say(`   finding ${x.severity}: ${String(x.note).slice(0, 160)}`);
    for (const r of out.result?.leo_reference_needed ?? []) say(`   LEO REFERENCE NEEDED: ${r.section ?? ""} ${String(r.why).slice(0, 160)}`);
  }
  writeFileSync(join(dir, "a-v1-report.txt"), log.join("\n"));
} else if (cmd === "c-prepare") {
  const o = await opportunity();
  const data = { candidate_packet: o.packet };
  const directive = "STAGE 6 PART C DRY RUN (a test; nothing is saved): give your recommendation for a BAY AREA framing of this topic, as a separate informational guide that sits next to the money page /hoarder-houses/ (which must not change) and the existing post /sell-bay-area-house-full-of-belongings/. Default geography is the San Francisco Bay Area (SR-1); say nothing about where Twin Home Buyer buys (SR-3). In `rationale` and `fan_out` say what the Bay Area angle is, which existing page it could cannibalize, and how to keep the intents apart. The existing post is a known page: judge the overlap from the candidate packet and say what data you would need if it is not in the packet.";
  const allowed = [`gsc:${o.packet.window.start}..${o.packet.window.end}`, ...o.packet.pages.map((p: any) => `inv:${p.page_id ?? p.url}`), ...o.packet.queries.map((q: any) => `q:${q.query}`)];
  const p = buildTaskPacket("thb-01-seo-strategist", { id: OPP, versionHash: o.version_hash ?? "" }, data, allowed, { directive });
  write("c1-packet.json", { run_id: "stage6-c1", attempts_used: 0, last_error: null, ...p });
  say(`prepared c1-packet.json (candidate packet of the hoarder opportunity, read-only; ${o.packet.queries.length} queries)`);
} else if (cmd === "c-brief") {
  const o = await opportunity(); const out = read("c1-out.json"); const packet = read("c1-packet.json");
  const parsed = outputSchemas["thb-01-seo-strategist"].safeParse(out);
  const errs = parsed.success ? semanticChecks("thb-01-seo-strategist", parsed.data as any, { packet, candidate: o.packet }) : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  say(`Agent 1: decision ${out.decision}: ${errs.length ? `REFUSED by the production checks (${errs.length})` : "ACCEPTED by the production checks"}`);
  for (const e of errs.slice(0, 12)) say(`   - ${String(e).slice(0, 300)}`);
  say(`rationale: ${String(out.result?.rationale ?? "").slice(0, 700)}`);
  for (const f of out.result?.fan_out ?? []) say(`   fan-out (${f.map_to}, ${f.status}): ${String(f.question).slice(0, 160)}`);
  writeFileSync(join(dir, "c1-report.txt"), log.join("\n"));
  if (errs.length) { say("stopping: refused"); process.exit(0); }
  // Agent 3 needs an Agent 2 evidence packet: use Part A's accepted output if there is one, else the packet stored for the real opportunity.
  const a2 = existsSync(join(dir, "a2-out.json")) ? read("a2-out.json") : null;
  const ep = a2 ? { ...a2.result, decision: a2.decision, run_id: "stage6-a2" } : null;
  if (!ep) { say("no a2-out.json: run Part A first (Agent 3 needs an evidence packet)"); process.exit(0); }
  const allowedIds = [...(ep.sources as any[]).map((s) => s.id), `gsc:${o.packet.window.start}..${o.packet.window.end}`, ...o.packet.pages.map((p: any) => `inv:${p.page_id ?? p.url}`), ...o.packet.queries.map((q: any) => `q:${q.query}`)];
  const { data: posts } = await db.from("pages").select("canonical_url,title,meta_title,wp_type").eq("wp_type", "post").order("canonical_url");
  const links = (posts ?? []).filter((p: any) => /(lien|code-violation|title-issue|inherit|authority|as-is|delay|belongings|hoarder)/i.test(p.canonical_url) && !/cash-home-buyer|we-buy-houses/.test(p.canonical_url)).map((p: any) => ({ url: p.canonical_url, title: p.meta_title ?? p.title }));
  const money = "https://www.twinhomebuyer.com/hoarder-houses/";
  links.push({ url: money, title: "REQUIRED next-step page (money page, do not change)" } as any);
  const data3 = { candidate_packet: o.packet, agent1_decision: out, evidence_packet: ep, human_redirect: { directive: "STAGE 6 PART C DRY RUN (a test; nothing is saved): build a BAY AREA brief for a separate informational guide (title option: \"Selling a Packed or Hoarded House in the SF Bay Area: What to Disclose and Whether to Clean Out First\"). Address Bay Area readers (SR-1); say nothing about where Twin Home Buyer buys (SR-3). Include a short section for each allowed jurisdiction ONLY as far as the evidence packet supports it; for a local point with no supported claim the outline says \"local rules vary; check with your city or county\" and lists the print request in open_items. Link to /hoarder-houses/ as the next step and to the existing post /sell-bay-area-house-full-of-belongings/ only where it helps the reader. Name in open_items how this guide's intent differs from that existing post so the two do not compete for the same queries.", required_links: [money] }, previous_brief_for_reference: null, link_candidates: links, allowed_jurisdictions: ALLOWED };
  const p3 = buildTaskPacket("thb-03-content-architect", { id: OPP, versionHash: o.version_hash ?? "" }, data3, allowedIds, { directive: data3.human_redirect.directive, allowed_link_urls: links.map((l) => l.url), required_links: [money] });
  write("c3-packet.json", { run_id: "stage6-c3", attempts_used: 0, last_error: null, ...p3 });
  say(`wrote c3-packet.json (evidence packet from Part A: ${ep.claims.length} claims, ${(ep.print_requests ?? []).length} print requests)`);
} else if (cmd === "c-verify") {
  const o = await opportunity(); const out = read("c3-out.json"); const packet = read("c3-packet.json"); const a2 = read("a2-out.json");
  const parsed = outputSchemas["thb-03-content-architect"].safeParse(out);
  const errs = parsed.success ? semanticChecks("thb-03-content-architect", parsed.data as any, { packet, candidate: o.packet, agent2Claims: (a2.result.claims ?? []).map((c: any) => ({ id: c.id, support: c.support })), agent2SourceIds: (a2.result.sources ?? []).map((s: any) => s.id) }) : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  say(`Agent 3: decision ${out.decision}: ${errs.length ? `REFUSED by the production checks (${errs.length})` : "ACCEPTED by the production checks"}`);
  for (const e of errs.slice(0, 15)) say(`   - ${String(e).slice(0, 300)}`);
  const b = out.result?.brief;
  if (b) {
    say(`target: ${b.target_reader ?? ""}`);
    for (const s of b.outline ?? []) say(`   ${s.section_key ?? s.key ?? ""}: ${String(s.h2 ?? s.heading ?? "").slice(0, 110)}`);
    for (const i of b.open_items ?? []) say(`   open: ${String(i).slice(0, 220)}`);
  }
  // the cannibalization check, on the stored Search Console rows: which queries does the existing post already rank for, and does this guide's wording share them?
  const { data: imp } = await db.from("gsc_imports").select("id,start_date,end_date").order("fetched_at", { ascending: false }).limit(1).single();
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) { const { data } = await db.from("search_metrics").select("page_url,page_id,query,impressions,clicks,position").eq("import_id", imp!.id).range(from, from + 999); if (!data?.length) break; rows.push(...data); if (data.length < 1000) break; }
  const { data: pages } = await db.from("pages").select("id,canonical_url,title,wp_type,protection_status");
  const known = (pages ?? []).map((p: any) => ({ id: p.id, url: p.canonical_url, title: p.title, wp_type: p.wp_type, protection: p.protection_status }));
  const existing = rows.filter((r) => /sell-bay-area-house-full-of-belongings/.test(r.page_url));
  const top = [...existing].sort((a, c) => c.impressions - a.impressions).slice(0, 8);
  // Leo, 2026-10-14: with no query rows in the main import, read the page total from the blog-audit import and say "no query data, page total X (window)"; never "no overlap".
  if (!existing.length) {
    const { data: aimp } = await db.from("audit_gsc_imports").select("id,start_date,end_date").order("fetched_at", { ascending: false }).limit(1).maybeSingle();
    const { data: tot } = aimp ? await db.from("audit_gsc_rows").select("page_url,impressions,clicks,position").eq("import_id", aimp.id).is("query", null).ilike("page_url", "%sell-bay-area-house-full-of-belongings%").limit(1) : { data: null };
    const t = tot?.[0];
    say(`\ncannibalization check: ${noQueryDataNote("/sell-bay-area-house-full-of-belongings/", t && aimp ? { impressions: t.impressions, clicks: t.clicks, position: Number(t.position), start: aimp.start_date, end: aimp.end_date } : null)}`);
  }
  say(`\ncannibalization check (stored Search Console rows ${imp!.start_date}..${imp!.end_date}, ${rows.length} rows): the existing post /sell-bay-area-house-full-of-belongings/ has ${existing.length} query rows; top: ${top.map((r) => `"${r.query}" (${r.impressions})`).join("; ") || "none"}`);
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 3 && !["house", "that", "with", "your", "what", "when", "sell", "selling"].includes(w)));
  const guide = [b?.primary_keyword, b?.h1, ...(out.result?.brief?.outline ?? []).map((s: any) => s.h2), ...(o.packet.queries ?? []).map((q: any) => q.query)].filter(Boolean).join(" ");
  const gw = words(guide);
  const shared = existing.filter((r) => { const qw = words(r.query); return qw.size && [...qw].every((w) => gw.has(w)); }).sort((a, c) => c.impressions - a.impressions);
  say(`   queries of the existing post whose key words all appear in this guide's keyword, headings or target queries: ${shared.length}${shared.length ? ` (${shared.slice(0, 6).map((r) => `"${r.query}" ${r.impressions}`).join("; ")})` : ""}`);
  const ov = computeOverlaps(rows, known as any);
  const pair = [...ov.entries()].flatMap(([k, v]) => v.map((x: any) => ({ k, ...x }))).filter((x: any) => /belongings|hoarder/.test(JSON.stringify(x)));
  say(`   the engine's own overlap check on stored data (pairs involving the belongings or hoarder pages): ${pair.length ? pair.slice(0, 4).map((x: any) => `${x.other_url ?? x.url ?? x.k}: shared ${((x.shared_queries ?? []) as string[]).length} queries, supported ${x.supported}`).join("; ") : "no overlapping pair found"}`);
  writeFileSync(join(dir, "c3-report.txt"), log.join("\n"));
} else throw new Error(`unknown command ${cmd}`);
