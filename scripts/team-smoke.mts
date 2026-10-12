/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 3c task 13: the team-mode live smoke. FIXTURE ONLY: a throwaway team-mode article (a copy of the real brief) is driven through the real
// operator functions (plan, queue, dump, submit-dir) with scripted role outputs written as files, exactly as /thb-run-agent would. Every unit goes
// through W1 and the council. It FORCES every path the real run may not reach:
//   - R1: a fetch request -> the page is fetched by code and stored as an Evidence Library source -> R1 quotes the stored passage by id -> a ledger claim is added
//   - R3: approved brand facts verbatim (V1 -> R1 request on s5, W1 -> R3 request on s1)
//   - S1 -> R2: a demand request from Strategy, answered with an evidence pack from stored GSC rows, then consumed by S1's next run
//   - V2 -> S2: ROOT_CAUSE_NOTE, the brief is fixed and ONLY the affected unit is redone
//   - V3 -> S2: a ROOT_CAUSE_NOTE whose only fix changes the approved target keyword: escalated to Leo, never applied
//   - V3 -> W1: QUALITY_CORRECTION, including a ticket that reaches the round limit (round 3 refused) and escalates to Leo
//   - the ticket budget: ticket 11 stops the article and escalates to Leo
//   - the Phase 3 hard-rule fixtures through the real submit path: unsupported figure, privacy gate, PENDING JUAN fact, "founder", rating text,
//     then assembly, the Approval Room hash checks, forged records, the operator-is-not-an-approver rule and an edit after approval.
// At the end it asserts that all four ticket types fired and all four teams sent and received. Everything is removed afterwards; audit_events are
// append-only and stay. Nothing here touches WordPress.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { approveBrief, load, resolveSection, setPipelineMode } from "../src/lib/studio/service";
import { confirmApprover, createProposal, syncApprovals } from "../src/lib/studio/proposals";
import { buildProposalPayload } from "../src/lib/studio/proposal-payload";
import { sha256 } from "../src/lib/studio/hash";
import type { RoomRecord } from "../src/lib/studio/approvals";
import type { Unit } from "../src/lib/studio/schema";
import { dumpTeamQueued, envelopeOf, queueNextTeam, queueTeamRun, setR1FetcherForTests, submitTeamDir } from "../src/lib/studio/team-service";
import { leoAnswerEscalation, loadRouter, loadTeamView, runRouterOp, startTeamRun } from "../src/lib/team/store";
import { raiseTicket } from "../src/lib/team/router";
import { teamCoverage } from "../src/lib/team/view";
import { hoarderUnits } from "./fixtures/hoarder-units";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const fail = (m: string): never => { throw new Error(`SMOKE FAILED: ${m}`); };
const expect = (c: unknown, m: string) => { if (!c) fail(m); };
const real = (await db.from("briefs").select("outline,evidence_packet").eq("opportunity_id", "1d78c9e3-6b2d-4434-88ed-56b905e67c24").single()).data!;
const units = hoarderUnits(real as any);
const UNIT_KEYS = [...Object.keys(units)];
let opp = "", art = "";
const dir = mkdtempSync(join(tmpdir(), "team-smoke-"));
const out: Record<string, unknown> = {};
const viewers = ["u_smoke_juan", "u_smoke_cherry", "u_smoke_leo", "u_smoke_stranger"];
const vrBefore = (await db.from("brand_facts").select("*").eq("fact_key", "voice_reference").single()).data!;

// ---------- the fixture official page R1's fetch request is served from (the real fetcher is swapped for this one; the allowlist still applies to the URL) ----------
const FIXTURE_URL = "https://www.dre.ca.gov/fixture/transfer-disclosure-statement";
const FIXTURE_QUOTE = "must deliver a Real Estate Transfer Disclosure Statement to the buyer";
const FIXTURE_HTML = `<html><body><h1>Transfer disclosure</h1><p>A seller of one to four residential units ${FIXTURE_QUOTE}.</p><p>Any waiver of these requirements is void.</p></body></html>`;
setR1FetcherForTests(async (url) => (url === FIXTURE_URL ? { ok: true, contentType: "text/html", body: FIXTURE_HTML } : { ok: false, error: "HTTP 404" }));

// ---------- fixture content: clean units plus the deliberately bad versions ----------
const addP = (u: Unit, text: string): Unit => { const c = structuredClone(u) as any; if (c.kind === "faq") c.items[0].a += ` ${text}`; else c.blocks.push({ t: "p", text }); return c; };
const FILLER = ["", "Take your time with this step.", "Ask for help early.", "Write things down as you go."];
const bad = {
  s1: addP(units.s1, "Juan Diaz, our founder, has seen houses like this many times."),                           // PENDING JUAN: a founder title
  s2: addP(units.s2, "One of our sellers told us the whole house was full and she did not know where to start."),    // privacy gate: a seller story
  s4: addP(units.s4, "You have 30 days to disclose under Civil Code section 1102.9."),                                // a figure no cited claim covers
  s8: addP(units.s8, "Our 4.8/5 rating says it all."),                                                              // rating text
  faq: addP(units.faq, "We are open 24/7 to answer your call."),                                                    // PENDING JUAN: hours
};
const NEW_CLAIM_TEXT = `A seller of one to four residential units ${FIXTURE_QUOTE}.`;

// ---------- scripted agents ----------
const dataOf = (p: any) => { const b = p.untrusted_data_block as string; return JSON.parse(b.slice(b.indexOf("\n") + 1, b.lastIndexOf("\n<<<END"))); };
const env = (role: string, p: any, decision: string, result: any, extra: Record<string, unknown> = {}) => ({
  article_id: p.article_id, opportunity_id: p.opportunity_id, agent_name: role, agent_prompt_version: "1.0.0", model_version: "claude-code/smoke-script", input_version_ids: p.input_version_ids,
  decision, findings: [], evidence_ids: [], required_actions: [], output_version_id: `smoke-${Date.now()}-${Math.random()}`, timestamp: new Date().toISOString(), result, ...extra,
});
const card = (from: string, to: string, ticket: string, section: string, o: Record<string, unknown> = {}) => ({ ticket, from: [from], to, section, issue: "One issue.", severity: "must fix", evidence: "rule or id", fix: null, blocking: false, ...o });
const req = (key: string, note: string) => ({ issue_key: key, severity: "required", note });
let sectionRows: any[] = [];
let s1Calls = 0;
const envOfUnit = (unit: string) => envelopeOf(sectionRows.find((s) => s.section_key === unit));
const citedOf = (u: any): string[] => (u ? (u.kind === "faq" ? [...new Set<string>(u.items.flatMap((i: any) => i.claim_ids))] : u.claim_ids) : []);
const rejections: { who: string; errors: string }[] = [];

function writerUnit(unit: string, n: number, d: any, attempts: number): Unit {
  if (unit === "s8" && attempts === 0) return bad.s8;                                       // rejected at submit by the rating rule, then corrected
  if (unit === "s1" && n === 1) return bad.s1;
  if (unit === "s2" && n === 1) return bad.s2;
  if (unit === "s4" && n === 1) return bad.s4;
  if (unit === "faq" && n === 1) return bad.faq;
  if (unit === "s5" && n >= 2) {
    const added = (d.claim_ledger as any[]).find((c) => c.text === NEW_CLAIM_TEXT);       // the claim R1 added, once it is in the ledger
    if (added) { const u = addP(units.s5, NEW_CLAIM_TEXT) as any; u.claim_ids = [...u.claim_ids, added.id]; return u; }
  }
  const filler = FILLER[Math.min(n - 1, 3)];
  return filler && (unit === "s2" || unit === "s3" || unit === "s6" || unit === "s7") && n >= 2 ? addP(units[unit], filler) : units[unit];
}

function councilOut(role: "V1" | "V2" | "V3", p: any, d: any) {
  const unit = p.unit_key as string;
  const e = envOfUnit(unit);
  const n = e.team.versionNo;
  const base = { unit_key: unit, version_hash: d.current_version?.version_hash };
  const cited = citedOf(d.current_version?.unit);
  if (role === "V1") {
    const flags = d.hedge_flags ?? [];
    const rulings = flags.map((h: any) => ({ key: h.key, ruling: "proven", note: `clm:1 supports the sentence (${h.term})` }));   // none are expected in the fixture units
    const revise = unit === "s5" && n === 1;
    const cards = revise ? [card("V1", "W1", "QUALITY_CORRECTION", unit, { key: "fact:s5-form-name", issue: "The sentence naming the disclosure form has no source in the ledger.", evidence: "no ledger claim names the form", fix: "Cite a supported claim or drop the sentence.", blocking: true }), card("V1", "R1", "EVIDENCE_REQUEST", unit, { issue: "Is a Real Estate Transfer Disclosure Statement required for this sale?", severity: "should fix", evidence: "V1 wants the rule verified directly from an official source" })] : [];
    return env("V1 Fact and Privacy", p, revise ? "REVISION" : "PASS", { ...base, claim_checks: cited.map((c) => ({ claim_id: c, verdict: "supported_as_written", note: "ok" })), privacy_ok: true, legal_qualification_ok: true, cards, hedge_rulings: rulings }, { findings: revise ? [req("fact:s5-form-name", "unsourced statement about the form")] : [] });
  }
  if (role === "V2") {
    const root = unit === "s6" && n === 1;
    const cards = root ? [card("V2", "S2", "ROOT_CAUSE_NOTE", unit, { key: "seo:s6-purpose", issue: "The brief gives the options table the wrong purpose: it should compare choices, not list steps.", evidence: "AEO: the section does not answer its heading", fix: null })] : [];
    return env("V2 SEO/AEO/GEO", p, root ? "REVISION" : "PASS", { ...base, checks: { direct_answer_near_start: !root, question_h2: true, local_modifiers_true_and_useful: true, keyword_natural_not_forced: true, short_direct_faq: true, citation_ready: true }, tested_http_or_schema: false, cards }, { findings: root ? [req("seo:s6-purpose", "the brief's purpose for this section is wrong")] : [] });
  }
  let card3: any = null; let key = "";
  if (unit === "s2" && n === 2) { key = "ed:opening-generic"; card3 = card("V3", "W1", "QUALITY_CORRECTION", unit, { key, issue: "The opening is generic and could sit on any investor site.", evidence: "copy-paste test", fix: "Open with what the homeowner is facing." }); }
  if (unit === "s3" && n <= 3) { key = "ed:generic-example"; card3 = card("V3", "W1", "QUALITY_CORRECTION", unit, { key, issue: "The example is generic and does not read like Juan explaining it.", evidence: "voice reference rhythm", fix: "Use a concrete, true, non-seller example." }); }
  if (unit === "s7" && n === 1) { key = "ed:s7-brief"; card3 = card("V3", "S2", "ROOT_CAUSE_NOTE", unit, { key, issue: "The brief frames this section around the wrong keyword, so the voice cannot work.", evidence: "authenticity q9", fix: null }); }
  return env("V3 Editorial Critic", p, card3 ? "REVISION" : "PASS", { ...base, voice_reference_used: true, copy_paste_test: { passed: !card3 || key !== "ed:opening-generic", flagged: [] }, authenticity: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`q${i + 1}`, true])), score: { voice: 16, education: 16, deal_logic: 16, local: 11, structure: 11, trust: 8, total: 78 }, cards: card3 ? [card3] : [] }, { findings: card3 ? [req(key, card3.issue)] : [] });
}

function s2Out(p: any, d: any) {
  const tk = d.ticket;
  const brief: any = Object.fromEntries(Object.entries(d.brief).filter(([k]) => !["decision", "run_id"].includes(k)));
  const ident = d.approved_identity;
  const changeKeyword = tk.unit === "s7";                                                  // the only "fix" S2 finds for s7 changes the approved target keyword
  if (!changeKeyword) {
    const i = Number(tk.unit.slice(1)) - 1;
    brief.outline = brief.outline.map((o: any, j: number) => (j === i ? { ...o, purpose: "Compare the choices side by side: when each fits and what to confirm first." } : o));
  }
  return env("S2 Architect", p, "PASS", { ticket_id: tk.id, root_cause: changeKeyword ? "The section would work better if the whole article targeted another keyword." : "The brief gave the options section the wrong purpose.", target_keyword: changeKeyword ? "cluttered house" : ident.target_keyword, slug: ident.slug, action: ident.action, target_page: ident.target_page, brief, affected_units: changeKeyword ? [] : [{ unit_key: tk.unit, reason: "its purpose changed" }], tickets: [] });
}

function runScriptedAgents() {
  for (const f of readdirSync(dir).filter((x) => x.endsWith("-packet.json"))) {
    const p = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const d = dataOf(p);
    const unit = p.unit_key as string | null;
    let o: any;
    if (p.role === "W1") {
      const e = envOfUnit(unit!);
      const n = e.team.versionNo + 1;
      const tickets = unit === "s1" && n === 2 ? [card("W1", "R3", "EVIDENCE_REQUEST", "s1", { issue: "What is the approved wording for the company name?", severity: "should fix", evidence: "the draft names the company" })] : [];
      o = env("W1 Writer", p, "PASS", { unit_key: unit, addresses: (d.open_corrections ?? []).map((c: any) => c.key), change_note: `scripted version ${n}`, unit: writerUnit(unit!, n, d, p.attempts_used ?? 0), tickets });
    } else if (p.role === "W2") {
      o = env("W2 Co-writer", p, "PASS", { unit_key: unit, version_hash: d.current_version?.version_hash, suggestions: [{ id: "w2:answer-first", area: "angle", issue: "The first paragraph buries the answer to the heading.", suggestion: "Lead with who must sign before the list of owner types." }] });
    } else if (p.role === "V1" || p.role === "V2" || p.role === "V3") {
      o = councilOut(p.role, p, d);
    } else if (p.role === "R1") {
      if (!(d.official_snapshots ?? []).length) {
        o = env("R1 Legal and official", p, "REVISION", { ticket_id: p.ticket_id, fetch_request: [{ url: FIXTURE_URL, why: "the official page that states the transfer disclosure rule" }] });
      } else {
        const snap = d.official_snapshots[0];
        const pass = snap.passages.find((x: any) => x.text.includes(FIXTURE_QUOTE));
        o = env("R1 Legal and official", p, "PASS", {
          ticket_id: p.ticket_id,
          sources: [{ id: "src:1", kind: "official_url", url: snap.url, title: "DRE transfer disclosure (fixture)", tier: 2, jurisdiction: "California", effective_date: null, retrieved_date: snap.retrievedDate, locality_matches: true }],
          claims: [{ id: "clm:1", text: NEW_CLAIM_TEXT, source_ids: ["src:1"], support: "supported", jurisdiction: "California", risk: "high", passage_ids: [pass.passage_id ?? pass.passageId], quote: FIXTURE_QUOTE, note: "confirm with an attorney or your title company" }],
          brand_facts_pending: [], first_party_proof: "restricted", unresolved: [],
        }, { findings: [{ claim: "the seller must deliver the transfer disclosure statement", basis: "official_source", evidence_ids: ["src:1"] }], evidence_ids: ["src:1"] });
      }
    } else if (p.role === "R2") {
      const q = d.candidate_packet.queries[0];
      o = env("R2 Search", p, "PASS", { ticket_id: p.ticket_id, window: d.candidate_packet.window, demand: [{ query: q.query, impressions: q.impressions, clicks: q.clicks, position: q.position, page: null, evidence_id: `q:${q.query}`, use: "strategy_only" }], questions: [], rankings: [], unresolved: [] },
        { findings: [{ claim: "stored demand row for the main query", basis: "gsc_data", evidence_ids: [`q:${q.query}`] }], evidence_ids: [`q:${q.query}`] });
    } else if (p.role === "R3") {
      const fact = d.approved_brand_facts.find((f: any) => f.key === "company_name");
      o = env("R3 Experience", p, "PASS", { ticket_id: p.ticket_id, sources: [], claims: [], facts: [{ fact_key: fact.key, wording: fact.value }], stories: [], brand_facts_pending: ["hours and closing time are pending Juan"], first_party_proof: "restricted", unresolved: [] });
    } else if (p.role === "S1") {
      const first = s1Calls++ === 0;                                                            // the first run asks; the next one consumes the answer
      o = env("S1 Strategist", p, "HOLD", { rationale: "The brief is approved; this run only checks whether demand data supports the section plan.", existing_urls: [], cannibalization: { warning: false, support: "" }, score_estimates: {}, unknowns_acknowledged: ["question phrasing is not in the export"], confidence: "low", fan_out: [],
        tickets: first ? [card("S1", "R2", "EVIDENCE_REQUEST", "topic", { issue: "What is the search demand for questions about selling a packed house?", severity: "should fix", evidence: "the candidate packet has few question queries" })] : [] },
        { findings: [{ claim: "question demand is unknown", basis: "assumption", evidence_ids: [] }] });
    } else if (p.role === "S2") {
      o = s2Out(p, d);
    } else fail(`no scripted answer for ${p.role}`);
    writeFileSync(join(dir, f.replace("-packet.json", "-out.json")), JSON.stringify(o));
  }
}

const log: string[] = [];
/** One operator cycle: queue the planned steps that match, dump their packets, run the scripted agents, submit; rejected outputs are corrected and resubmitted (3 attempts). */
async function cycle(label: string, only: (s: { role: string }) => boolean): Promise<boolean> {
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir);
  sectionRows = (await load(db, art)).sections;
  const made = await queueNextTeam(db, art, undefined, only as any);
  const queuedNow = await dumpTeamQueued(db, dir);                                          // everything queued, including a step an earlier run queued itself (R1's second step)
  if (!queuedNow.length) return false;
  const accepted: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    runScriptedAgents();
    const res = await submitTeamDir(db, dir);
    const rejected = res.filter((r) => r.includes("REJECTED"));
    for (const r of res.filter((x) => x.includes("ACCEPTED"))) accepted.push(r.replace(/^[^:]+: /, "").slice(0, 90));
    for (const r of rejected) rejections.push({ who: r.split(":")[0], errors: r });
    if (!rejected.length) break;
    for (const r of rejected) expect(r.startsWith("W1-s8:"), `an unexpected rejection: ${r}`);
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir);
    await dumpTeamQueued(db, dir);                                                            // the packets now carry attempts_used
    sectionRows = (await load(db, art)).sections;
  }
  const names = queuedNow.map((l) => l.split(" ").slice(1, 4).filter((x) => x !== "-").join(" "));
  log.push(`${label}: ${names.join(", ")}`);
  console.log(`-- ${label}: ${names.join(", ")}`);
  void made;
  return true;
}

const resolved: string[] = [];
async function leoPhase(): Promise<boolean> {
  let acted = false;
  const L = await load(db, art);
  const view = (await loadTeamView(db, art))!;
  for (const s of L.sections) {
    const st = envelopeOf(s).team;
    if (st.status === "BLOCKED_CLAIM" || st.status === "BLOCKED_PRIVACY") {
      const r = await resolveSection(db, art, s.section_key, { kind: "request_revision", text: `Leo: remove the problem the checks found (${(st.blockedBy ?? "").slice(0, 80)})` }, "smoke-test");
      expect(r.ok, `Leo could not resolve ${s.section_key}: ${JSON.stringify(r)}`);
      resolved.push(`${s.section_key}: ${st.status} (${(st.blockedBy ?? "").split(":")[0]})`); acted = true;
    } else if (st.status === "ESCALATED") {
      const r = await resolveSection(db, art, s.section_key, { kind: "request_revision", text: "Leo: the reviewer is right; rewrite the example with something concrete and true." }, "smoke-test");
      expect(r.ok, `Leo could not resolve ${s.section_key}: ${JSON.stringify(r)}`);
      const item = view.stuck.find((x) => x.unit === s.section_key && x.trigger === "round_limit");
      if (item) expect((await leoAnswerEscalation(db, art, item.dbId, "Keep the reviewer's position: rewrite the example.")).ok, "could not close the round-limit escalation");
      resolved.push(`${s.section_key}: ESCALATED (${item?.trigger ?? "gap"})`); acted = true;
    }
  }
  for (const item of (await loadTeamView(db, art))!.stuck.filter((x) => x.trigger === "brief_change")) {
    expect((await leoAnswerEscalation(db, art, item.dbId, "Keep the approved keyword and fix the section inside the approved brief.")).ok, "could not close the brief_change escalation");
    resolved.push(`${item.unit}: brief_change escalation answered`); acted = true;
  }
  return acted;
}

const allLocked = async () => (await load(db, art)).sections.every((s) => envelopeOf(s).team.status === "LOCKED");
const RESEARCH = ["R1", "R2", "R3", "S2", "S1"];

try {
  opp = (await db.from("opportunities").insert({ title: "SMOKE team fixture (delete me)", state: "BRIEF_REVIEW", human_decision: "approve", version_hash: "smoke" }).select("id").single()).data!.id;
  await db.from("briefs").insert({ opportunity_id: opp, outline: real.outline, evidence_packet: real.evidence_packet, notes: "smoke fixture" });
  const origOpp = (await db.from("opportunities").select("packet,agent_decision").eq("id", "1d78c9e3-6b2d-4434-88ed-56b905e67c24").single()).data!;
  await db.from("opportunities").update({ packet: origOpp.packet, agent_decision: origOpp.agent_decision }).eq("id", opp);
  const ab = await approveBrief(db, opp, "smoke-test");
  if (!ab.ok) fail(ab.reason);
  art = (ab as any).articleId;
  await db.from("articles").update({ is_fixture: true }).eq("id", art);                        // only a fixture article accepts the "smoke-test" actor
  expect((await setPipelineMode(db, art, "team", "smoke-test")).ok, "could not switch the fixture to team mode");
  const runId = await startTeamRun(db, art);                                                   // default budget 10 and round limit 2
  await db.from("brand_facts").update({ provisional_by: "smoke-test", provisional_at: new Date().toISOString() }).eq("fact_key", "voice_reference");   // V3 needs a usable voice reference
  const briefBefore = (await db.from("briefs").select("outline,outline_history").eq("id", (await load(db, art)).article.brief_id).single()).data!;

  // S1 -> R2: Strategy asks Research for demand (explicit, as Leo would)
  await queueTeamRun(db, art, "S1", null, null);
  let s2Queued = false;
  for (let i = 0; i < 40; i++) {
    if (await allLocked()) break;
    let progress = false;
    for (let k = 0; k < 6; k++) { if (await cycle(`research ${i}.${k}`, (s) => RESEARCH.includes(s.role))) progress = true; else break; }
    if (!s2Queued) { const e = envOfUnit("s2"); if (e && e.team.versionNo >= 2) { await queueTeamRun(db, art, "W2", "s2", null); s2Queued = true; } }
    const did = await cycle(`units ${i}`, (s) => !RESEARCH.includes(s.role) && !(s as any).unit?.startsWith?.("topic"));
    const leo = await leoPhase();
    if (!progress && !did && !leo) fail(`stuck at iteration ${i}: nothing runnable and nothing for Leo (${(await load(db, art)).sections.map((s) => `${s.section_key}:${envelopeOf(s).team.status}`).join(" ")})`);
    sectionRows = (await load(db, art)).sections;
  }
  const finalSections = (await load(db, art)).sections;
  expect(finalSections.every((s) => envelopeOf(s).team.status === "LOCKED"), `not every unit locked: ${finalSections.map((s) => `${s.section_key}:${envelopeOf(s).team.status}`).join(" ")}`);
  for (const k of UNIT_KEYS) expect(finalSections.some((s) => s.section_key === k), `unit ${k} missing`);
  // S1 runs again: it consumes the answered demand request (an answered request is closed when its sender's next run completes)
  await queueTeamRun(db, art, "S1", null, null);
  for (let k = 0; k < 3; k++) if (!(await cycle(`tail ${k}`, (s) => RESEARCH.includes(s.role)))) break;

  // ----- the forced paths, asserted from stored data -----
  let router = (await loadRouter(db, runId)).state;
  const view = (await loadTeamView(db, art))!;
  const T = (f: (t: any) => boolean) => router.tickets.find(f);
  const msgsOf = (id: string) => view.tickets.find((x) => x.routerId === id)!.messages;

  // hard-rule fixtures through the real submit path
  const { data: vers } = await db.from("audit_events").select("detail").eq("subject_id", art).eq("event_type", "section_version");
  const blockedBy = (vers ?? []).filter((v: any) => String(v.detail.status).startsWith("BLOCKED")).map((v: any) => `${v.detail.unit}: ${(v.detail.deterministic_findings as string[]).map((x) => x.split(":")[0]).join(",")}`);
  out.blockedThenResolved = blockedBy;
  const need = { s1: "PENDING_JUAN", s2: "SELLER_STORY_NOT_CLEARED", s4: "UNCOVERED_FIGURE", faq: "PENDING_JUAN" };
  for (const [u, code] of Object.entries(need)) expect(blockedBy.some((b) => b.startsWith(`${u}:`) && b.includes(code)), `fixture ${u}/${code} was not blocked: ${blockedBy.join(" | ")}`);
  expect(rejections.length >= 1 && rejections.every((r) => r.who === "W1-s8") && /rating rule/.test(rejections[0].errors), `the rating text was not rejected at submit: ${JSON.stringify(rejections)}`);
  expect(resolved.filter((r) => /BLOCKED/.test(r)).length === 4, `expected 4 blocked units resolved by Leo, got ${resolved.join(" | ")}`);

  // R1: fetch -> stored snapshot -> quote -> ledger claim
  const { data: snapRows } = await db.from("evidence_sources").select("id,content_sha256,retrieved_date,uploaded_by").eq("source_url", FIXTURE_URL);
  expect(snapRows?.length === 1 && snapRows[0].uploaded_by === "system:r1-snapshot" && /^[0-9a-f]{64}$/.test(snapRows[0].content_sha256), "the fetched page was not stored as an Evidence Library source with its sha256");
  const { data: snapPass } = await db.from("evidence_passages").select("passage").eq("source_id", snapRows![0].id);
  expect((snapPass ?? []).some((p: any) => p.passage.includes(FIXTURE_QUOTE)), "the stored passages do not contain the page text");
  const { data: newClaim } = await db.from("claims").select("claim_key,claim_text,declared_by,source_id,supporting_passage,support").eq("article_id", art).eq("declared_by", "thb-r1-legal-official");
  expect(newClaim?.length === 1 && newClaim[0].claim_text === NEW_CLAIM_TEXT && newClaim[0].source_id === snapRows![0].id && newClaim[0].supporting_passage === FIXTURE_QUOTE && newClaim[0].support === "supported", `the ledger claim from R1 is wrong: ${JSON.stringify(newClaim)}`);
  const s5 = (await load(db, art)).sections.find((s) => s.section_key === "s5");
  const s5unit = (await db.from("section_versions").select("content").eq("id", s5.locked_version_id).single()).data!.content as any;
  expect(s5unit.claim_ids.includes(newClaim![0].claim_key), "s5 was not rewritten with the new ledger claim");
  const r1ticket = T((t) => t.type === "EVIDENCE_REQUEST" && t.to === "R1")!;
  expect(r1ticket && r1ticket.from.join() === "V1" && r1ticket.status === "CLOSED" && msgsOf(r1ticket.id).some((m) => m.role === "R1" && m.body.includes("Added to the ledger")), "the V1 -> R1 request was not answered with a ledger claim and closed");
  const { data: fetchAudit } = await db.from("audit_events").select("detail").eq("subject_id", art).eq("event_type", "r1_fetch");
  expect((fetchAudit ?? []).some((a: any) => a.detail.fetched?.includes(FIXTURE_URL)), "the R1 fetch was not audited");

  // R3: approved facts verbatim
  const r3ticket = T((t) => t.to === "R3")!;
  expect(r3ticket && r3ticket.status === "CLOSED" && msgsOf(r3ticket.id).some((m) => m.role === "R3" && m.body.includes('company_name: "Twin Home Buyer"')), "the W1 -> R3 request was not answered with the approved company name");

  // S1 -> R2: demand request answered with an evidence pack, then consumed by S1's next run
  const s1ticket = T((t) => t.from.join() === "S1")!;
  expect(s1ticket && s1ticket.to === "R2" && s1ticket.status === "CLOSED" && msgsOf(s1ticket.id).some((m) => m.role === "R2" && m.body.includes("demand row")), `the S1 -> R2 demand request: ${s1ticket?.status}`);

  // V2 -> S2: the brief is fixed and only the affected unit is redone
  const rootOk = T((t) => t.type === "ROOT_CAUSE_NOTE" && t.unitKey === "s6")!;
  expect(rootOk && rootOk.from.join() === "V2" && rootOk.to === "S2" && rootOk.status === "CLOSED", "the V2 -> S2 root-cause ticket is not closed");
  const briefAfter = (await db.from("briefs").select("outline,outline_history").eq("id", (await load(db, art)).article.brief_id).single()).data!;
  const before = (briefBefore.outline as any).outline, after = (briefAfter.outline as any).outline;
  expect(after[5].purpose !== before[5].purpose && after.every((o: any, i: number) => i === 5 || JSON.stringify(o) === JSON.stringify(before[i])), "the brief changed somewhere other than the affected unit");
  expect(((briefAfter.outline_history as any[]) ?? []).length === ((briefBefore.outline_history as any[]) ?? []).length + 1, "the superseded brief was not kept in the history");
  const { data: briefAudit } = await db.from("audit_events").select("detail").eq("subject_id", art).eq("event_type", "brief_revised");
  expect((briefAudit ?? []).filter((a: any) => a.detail.kind === "revise").length === 1 && (briefAudit ?? []).find((a: any) => a.detail.kind === "revise")!.detail.units.join() === "s6", "the brief revision did not name only s6");
  const versionsBySection = Object.fromEntries((await load(db, art)).sections.map((s) => [s.section_key, envelopeOf(s).team.versionNo]));
  expect(versionsBySection.s8 === 1 && versionsBySection.s6 === 2, `only the affected unit should be redone: ${JSON.stringify(versionsBySection)}`);

  // V3 -> S2 with an approved-identity change: escalated to Leo, never applied
  const ident = T((t) => t.type === "ROOT_CAUSE_NOTE" && t.unitKey === "s7")!;
  const identEsc = T((t) => t.type === "HUMAN_ESCALATION" && t.trigger === "brief_change")!;
  expect(ident && ident.from.join() === "V3" && ident.status === "CLOSED" && identEsc && identEsc.from.join() === "S2" && identEsc.status === "CLOSED" && /keyword/i.test(identEsc.issue), "the identity change was not escalated to Leo and closed by him");
  expect((await load(db, art)).article.primary_keyword === "hoarded house" && after[6].h2 === before[6].h2 && ((briefAfter.outline_history as any[]) ?? []).length === ((briefBefore.outline_history as any[]) ?? []).length + 1, "the approved keyword or an H2 changed");

  // V3 -> W1 including the round limit
  const qc = T((t) => t.type === "QUALITY_CORRECTION" && t.from.join() === "V3" && t.unitKey === "s2")!;
  expect(qc && qc.to === "W1" && qc.status === "CLOSED" && qc.round === 1, "the V3 -> W1 correction on s2 did not resolve in one round");
  const lim = T((t) => t.unitKey === "s3" && t.type === "QUALITY_CORRECTION")!;
  const limEsc = T((t) => t.trigger === "round_limit")!;
  expect(lim && lim.round === 2 && lim.status === "CLOSED" && limEsc && limEsc.parentId === lim.id && limEsc.status === "CLOSED" && /Keep the reviewer's position/.test(limEsc.resolution ?? ""), `the round-limit path: ticket ${lim?.status} round ${lim?.round}, escalation ${limEsc?.status}`);

  // every ticket type fired, every team sent and received
  const cov = teamCoverage(view);
  out.coverage = { types: view.fired.types, teams: view.fired.teams, missing: cov };
  expect(cov.missingTypes.length === 0 && cov.missingTeams.length === 0, `coverage gaps: ${JSON.stringify(cov)}`);

  // the article assembled itself and the hash/approval checks hold in team mode
  const A = (await load(db, art)).article;
  expect(A.state === "HUMAN_REVIEW", `article did not reach HUMAN_REVIEW (${A.state})`);
  out.assembled = { state: A.state, hash: A.version_hash?.slice(0, 16), units: finalSections.length };
  const prop = await createProposal(db, art, "smoke-test");
  const payload = await buildProposalPayload(db, prop.id);
  const hArticle = payload.items.find((i: any) => i.kind === "article")!.hash;
  const hVoice = payload.items.find((i: any) => i.kind === "voice_reference")?.hash;
  expect(hArticle === sha256(payload.html) && hArticle === A.version_hash, "payload hash is not the recomputed hash of the stored version");
  const now = new Date(Date.now() + 1000).toISOString();
  const rec = (n: string, viewerId: string, kind: "article" | "voice_reference", hash: string, o: Partial<RoomRecord> = {}): RoomRecord => ({ recordId: `smoke-${n}`, proposalId: prop.id, itemKind: kind, decision: "approve", claimedHash: hash, viewerId, displayName: viewerId, serverUpdatedAt: now, browserDecidedAt: new Date().toISOString(), ...o });
  const first = await syncApprovals(db, [rec("juan1", viewers[0], "article", hArticle), rec("leo1", viewers[2], "article", hArticle), rec("x1", viewers[3], "article", hArticle)]);
  expect(first.pendingRegistrations.length === 3 && first.approvals === 0, "first clicks must be feedback");
  const secLeo = await confirmApprover(db, viewers[2], "operator", "Leo", "smoke-test");
  const asSecondaryLeo = await confirmApprover(db, viewers[2], "secondary", "Cherry", "smoke-test");
  const leoNamed = await confirmApprover(db, viewers[3], "secondary", "Leo", "smoke-test");
  expect(secLeo.ok && !asSecondaryLeo.ok && !leoNamed.ok, "no-self-approval: Leo-as-secondary guard failed");
  await confirmApprover(db, viewers[0], "approver", "Juan", "smoke-test");
  await confirmApprover(db, viewers[1], "secondary", "Cherry", "smoke-test");
  await syncApprovals(db, [rec("forged-hash", viewers[0], "article", "f".repeat(64)), rec("backdated", viewers[0], "article", hArticle, { browserDecidedAt: "2020-01-01T00:00:00Z" }), rec("leo-click", viewers[2], "article", hArticle), rec("stranger", viewers[3], "article", hArticle)]);
  const { data: slog } = await db.from("approval_sync_log").select("record_id,classification,server_updated_at,browser_decided_at,recomputed_hash").like("record_id", "smoke-%");
  const L1 = (id: string) => slog!.find((r) => r.record_id === id)!;
  expect(L1("smoke-forged-hash").classification === "REJECTED" && L1("smoke-forged-hash").recomputed_hash === hArticle, "forged hash not rejected with both hashes");
  expect(L1("smoke-backdated").classification === "APPROVAL" && L1("smoke-backdated").browser_decided_at === "2020-01-01T00:00:00Z", "backdated browser time was not ignored");
  expect(L1("smoke-leo-click").classification === "FEEDBACK" && L1("smoke-stranger").classification === "FEEDBACK", "operator/unknown clicks must be feedback");
  await syncApprovals(db, [rec("juan-voice", viewers[0], "voice_reference", hVoice!)]);
  const A2 = (await load(db, art)).article;
  expect(A2.state === "APPROVED_FOR_WP_DRAFT" && A2.approved_hash === A.version_hash, `sign-off failed (${A2.state})`);
  // edit after approval (Leo reopens a locked unit in team mode): the approval is invalidated and the old record can never match again
  const re = await resolveSection(db, art, "s3", { kind: "reopen", text: "Leo: smoke edit after approval" }, "smoke-test");
  expect(re.ok, "reopen after approval failed");
  const A3 = (await load(db, art)).article;
  await syncApprovals(db, [rec("juan1-replay", viewers[0], "article", hArticle, { serverUpdatedAt: new Date(Date.now() + 2000).toISOString() })]);
  const lr = (await db.from("approval_sync_log").select("classification").eq("record_id", "smoke-juan1-replay").single()).data!;
  expect(A3.approved_hash === null && A3.state === "DRAFTING" && lr.classification === "REJECTED", `edit after approval did not invalidate (${A3.state}, ${lr.classification})`);
  expect(envelopeOf((await load(db, art)).sections.find((s) => s.section_key === "s3")).team.status === "NEEDS_REVISION", "the reopened team unit is not back with the writer");
  out.approvals = { signedOff: A2.state, afterEdit: A3.state, replay: lr.classification };

  // ----- the ticket budget: ticket 11 stops the article and escalates to Leo -----
  router = (await loadRouter(db, runId)).state;
  const used0 = router.tickets.filter((t) => t.type !== "HUMAN_ESCALATION").length;
  let refused = false; let flooded = 0;
  for (let i = 0; i < 12 && !refused; i++) {
    const r = await runRouterOp(db, art, runId, (s) => raiseTicket(s, card("V3", "W1", "QUALITY_CORRECTION", "s4", { issue: `Budget fixture issue number ${i + 1} about the keyword placement.`, severity: "should fix" }), { at: new Date(Date.now() + i).toISOString(), versionHash: "smoke" }));
    if (r.ok) flooded++; else refused = true;
  }
  expect(refused && used0 + flooded === 10, `the budget did not stop the article at 10 (used ${used0} before, ${flooded} added, refused ${refused})`);
  const v2 = (await loadTeamView(db, art))!;
  expect(v2.budget.stopped && v2.runStatus === "STOPPED_BUDGET" && v2.stuck.some((x) => x.trigger === "budget_limit"), "the budget stop is not shown to Leo");
  const plan = await (await import("../src/lib/studio/team-service")).teamPlan(db, art);
  expect(plan.steps.length === 0, `something is still planned after the budget stop: ${plan.steps.map((s) => s.role).join()}`);
  const budgetEsc = v2.stuck.find((x) => x.trigger === "budget_limit")!;
  expect((await leoAnswerEscalation(db, art, budgetEsc.dbId, "Stop here: the open items are listed for review.")).ok, "Leo could not close the budget escalation");
  out.budget = { usedBeforeFlood: used0, stoppedAt: v2.budget.used, escalation: "budget_limit closed by Leo" };

  out.resolvedByLeo = resolved;
  out.tickets = (await loadTeamView(db, art))!.tickets.slice().reverse().map((t) => `${t.routerId} ${t.type} ${t.from.join("+")}->${t.to} [${t.unit || "-"}] ${t.status} r${t.round}${t.trigger ? ` ${t.trigger}` : ""}`);
  out.cycles = log.length;
  console.log(JSON.stringify(out, null, 1));
  console.log("TEAM SMOKE PASSED");
} finally {
  setR1FetcherForTests(null);
  rmSync(dir, { recursive: true, force: true });
  try {
    await db.from("brand_facts").update({ status: vrBefore.status, approved_by: vrBefore.approved_by, approved_at: vrBefore.approved_at, provisional_by: vrBefore.provisional_by, provisional_at: vrBefore.provisional_at, fact_value: vrBefore.fact_value }).eq("fact_key", "voice_reference");
    if (art) {
      const { data: ts } = await db.from("tickets").select("id").eq("article_id", art);
      const ids = (ts ?? []).map((t) => t.id);
      if (ids.length) { await db.from("tickets").update({ parent_ticket_id: null }).in("id", ids); await db.from("ticket_messages").delete().in("ticket_id", ids); await db.from("tickets").delete().in("id", ids); }
      await db.from("team_runs").delete().eq("article_id", art);
      const { data: secs } = await db.from("article_sections").select("id").eq("article_id", art);
      const sids = (secs ?? []).map((s) => s.id);
      await db.from("article_sections").update({ current_version_id: null, locked_version_id: null }).in("id", sids);
      await db.from("section_reviews").delete().in("section_id", sids);
      await db.from("escalations").delete().eq("article_id", art);
      await db.from("section_versions").delete().in("section_id", sids);
      await db.from("article_sections").delete().in("id", sids);
      await db.from("proposals").delete().eq("article_id", art);
      await db.from("approvals").delete().eq("subject_id", art);
      await db.from("article_versions").delete().eq("article_id", art);
      await db.from("claims").delete().eq("article_id", art);
      await db.from("agent_runs").delete().eq("subject_id", art);
      await db.from("articles").delete().eq("id", art);
    }
    const { data: snaps } = await db.from("evidence_sources").select("id").eq("source_url", FIXTURE_URL);
    for (const sn of snaps ?? []) { await db.from("evidence_passages").delete().eq("source_id", sn.id); await db.from("evidence_sources").delete().eq("id", sn.id); }
    await db.from("approval_sync_log").delete().like("record_id", "smoke-%");
    await db.from("approver_registry").delete().in("viewer_id", viewers);
    if (opp) { await db.from("decisions").delete().eq("opportunity_id", opp); await db.from("briefs").delete().eq("opportunity_id", opp); await db.from("agent_runs").delete().eq("subject_id", opp); await db.from("opportunities").delete().eq("id", opp); }
    const { data: vr } = await db.from("brand_facts").select("status,provisional_by").eq("fact_key", "voice_reference").single();
    console.log(`cleanup done; voice_reference restored (status ${vr!.status}, provisional_by ${vr!.provisional_by})`);
  } catch (e) { console.error("CLEANUP PROBLEM:", e); process.exitCode = 1; }
}
