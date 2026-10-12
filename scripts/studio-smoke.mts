/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 3 live smoke. FIXTURE ONLY: a throwaway opportunity/brief (copy of the real brief) is driven through the real Studio service with
// scripted agent outputs, forged Approval Room records and an edit after approval. Everything is removed afterwards; the real voice
// reference row is restored; audit_events are append-only and stay (actors "smoke-test"). Nothing here touches WordPress.
import { createClient } from "@supabase/supabase-js";
import { advanceArticle, approveBrief, load, queueStudioRun, resolveSection, setPipelineMode, stateOf, submitStudio } from "../src/lib/studio/service";
import { confirmApprover, createProposal, syncApprovals } from "../src/lib/studio/proposals";
import { buildProposalPayload } from "../src/lib/studio/proposal-payload";
import { sha256 } from "../src/lib/studio/hash";
import type { Unit } from "../src/lib/studio/schema";
import { CLASSIC_V1_KEY, STUDIO_AGENT_META, V1_PROMPT_VERSION, type StudioAgentKey } from "../src/lib/studio/agents";
import { declinesOfRow } from "../src/lib/studio/declines-view";
import type { RoomRecord } from "../src/lib/studio/approvals";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const out: Record<string, unknown> = {};
const fail = (m: string): never => { throw new Error(`SMOKE FAILED: ${m}`); };
const expect = (c: unknown, m: string) => { if (!c) fail(m); };
const P = "https://www.twinhomebuyer.com/";

// ---- fixture content (every figure is covered by the ledger; links are from the brief's link plan) ----
const sec = (key: string, h2: string, blocks: any[], claim_ids: string[], roles: string[] = [], capsule?: string): Unit => ({ kind: "section", key, h2, blocks, claim_ids, roles, ...(capsule ? { capsule } : {}) }) as Unit;
const L = await db.from("briefs").select("outline,evidence_packet").eq("opportunity_id", "1d78c9e3-6b2d-4434-88ed-56b905e67c24").single();
const real = L.data!;
const H = (i: number) => real.outline.outline[i].h2 as string;
const units: Record<string, Unit> = {
  s1: sec("s1", H(0), [{ t: "p", text: "If you are looking at a house that is packed to the walls, the hard part is rarely the house itself. It is the people, the paperwork and not knowing where to start. I want you to see the whole picture before you spend money or sign anything." }, { t: "ul", items: ["Who has the right to sign?", "What condition is the house in?", "Who is affected, including whoever lives there?", "What is owed?", "How soon do you need to move?"] }], [], ["opening"],
    "You can sell a packed or hoarded house in California, but the right route depends on who can sign, what condition the house is in, who is affected, what is owed and how soon you need to move. You have real options: keep it, clear it out, list it, get professional help, or sell directly."),
  s2: sec("s2", H(1), [{ t: "p", text: "Before anything else, find out who holds title and who can sign. That might be one owner, a trust, an estate or several heirs, and each one changes the steps. See [legal authority to sell inherited property](" + P + "inherited-property-bay-area-legal-authority-to-sell/)." }, { t: "p", text: "If someone is still living in the house, make them part of the decision. Respect matters here, and so does time." }, { t: "note", text: "Confirm who can sign with a probate attorney or your title company." }], []),
  s3: sec("s3", H(2), [{ t: "p", text: "Clutter by itself is not a code violation. Health and Safety Code section 17920.3 lists specific conditions that can make a building substandard, and the local enforcement authority decides whether a particular home meets them." }, { t: "ul", items: ["Accumulated junk, debris or garbage that creates a fire hazard, as judged by the fire authority.", "Infestation of insects, vermin or rodents, as determined by a health officer.", "A lack of adequate garbage and rubbish storage and removal, as determined by a health officer."] }, { t: "note", text: "Whether your home meets any of these is the city or county's call. Confirm with your local enforcement office. For background on enforcement, see [code violations in the Oakland area](" + P + "oakland-code-violations-2026/)." }], ["clm:1", "clm:2", "clm:3", "clm:4"]),
  s4: sec("s4", H(3), [{ t: "p", text: "For most sales of single-family homes in California, the seller gives the buyer a Real Estate Transfer Disclosure Statement, and a waiver of those requirements is void (Civil Code section 1102). The disclosures are made on that form (Civil Code section 1102.6). The law has exceptions, so check whether one applies to your sale." }, { t: "note", text: "Which items belong on the form is a question for your agent or an attorney." }], ["clm:5", "clm:6", "clm:7"]),
  s5: sec("s5", H(4), [{ t: "p", text: "Not necessarily, but a cleanout changes what you and a buyer can see. It shows the real condition of the house. It does not remove your duty to tell the buyer what you know. Some families choose not to clear everything first, because the cost, the time and the emotional weight are real." }, { t: "p", text: "If this is a parent's home, see [selling a house full of belongings](" + P + "sell-bay-area-house-full-of-belongings/) and [what selling as-is means](" + P + "what-does-selling-your-house-as-is-mean/)." }], ["clm:6", "clm:7"]),
  s6: sec("s6", H(5), [{ t: "table", headers: ["Option", "When it fits", "What to confirm"], rows: [["Keep it for now", "There is no pressure to sell and the house still works for the family.", "What it costs to hold, and whether anyone's safety is at risk."], ["Clear it out first", "You have the time, the help and the money, and the cleanout will change what buyers see.", "Who decides what stays, and where the hauling and storage will happen."], ["List it with an agent", "The house can be shown and you want exposure to the open market.", "Ask a listing agent about disclosure and what condition buyers expect."], ["Get professional help first", "Ownership, authority, liens or code questions are still open.", "An attorney, your title company or the city or county has to answer first."], ["Sell directly to a buyer", "Certainty matters more to you than the highest price.", "Compare written offers and confirm what is included. You can [talk through a direct sale](" + P + "hoarder-houses/)."]] }], [], ["options"]),
  s7: sec("s7", H(6), [{ t: "ul", items: ["An enforcement notice can land in the middle of a sale if the local authority decides the home meets one of the listed conditions.", "A disclosure that was missed or minimized can turn into a dispute after closing.", "Heirs or family members who disagree can stall everything until someone with authority signs.", "Liens and unpaid bills that surface late in title can change the numbers. See [title issues and liens](" + P + "bay-area-title-issues-and-liens/) and [what can delay an as-is sale](" + P + "what-can-delay-as-is-home-sale-bay-area/)."] }], ["clm:1", "clm:5", "clm:7"], ["real_world_warning"]),
  s8: sec("s8", H(7), [{ t: "p", text: "Confirm legal, tax, title and code questions with the right professional: a real estate or probate attorney for authority and disclosure, your title company for liens and ownership, a CPA for tax questions, your insurance professional for coverage, and the city or county for any code or safety concern." }, { t: "note", text: "A direct sale is one option among these. If you want to talk it through, you can start at our [Hoarder Houses page](" + P + "hoarder-houses/)." }], [], ["professional_confirmation"]),
  faq: { kind: "faq", key: "faq", items: [
    { q: "Can I sell a hoarded house in California?", a: "Yes. Whether you should list it, clear it out, keep it or sell directly depends on who can sign, the condition, who is affected, what is owed and your timing. Confirm the legal points with an attorney.", claim_ids: [] },
    { q: "Do I have to disclose a packed or hoarded house?", a: "In most single-family sales, California requires a Real Estate Transfer Disclosure Statement, and a waiver of that requirement is void. Ask your agent or an attorney what applies to your sale.", claim_ids: ["clm:6", "clm:7"] },
    { q: "Do I have to clean out the house before selling?", a: "Not necessarily. A cleanout shows the real condition but does not change what you must disclose. Weigh the cost and time against your options.", claim_ids: ["clm:6"] },
    { q: "Can the city or county force me to clean up?", a: "The local enforcement authority decides whether a home meets the conditions listed in Health and Safety Code section 17920.3. Check with your city or county.", claim_ids: ["clm:1"] },
    { q: "Who can sell the house if the owner cannot?", a: "It depends on who holds title and whether there is a trust, an estate or another authority. A probate attorney or title company can tell you who may sign.", claim_ids: [] },
  ] } as Unit,
};

// ---- scripted agents (they go through the real queue, packet, validation and submit) ----
let art = ""; let opp = "";
const env = (agent: string, decision: string, result: any, findings: any[] = [], required: string[] = []) => ({
  article_id: art, opportunity_id: opp, agent_name: agent, agent_prompt_version: "1.0.0", model_version: "claude-code/smoke-script", input_version_ids: ["smoke"],
  decision, findings, evidence_ids: [], required_actions: required, output_version_id: `smoke-${Date.now()}-${Math.random()}`, timestamp: new Date().toISOString(), result,
});
async function step(agent: StudioAgentKey | typeof CLASSIC_V1_KEY, unit: string, build: (ctx: { hash: string | null; cited: string[]; data: any }) => any, expectOk = true) {
  const { runId } = await queueStudioRun(db, agent, art, unit);
  const { data: run } = await db.from("agent_runs").select("task_packet").eq("id", runId).single();
  const hash = run!.task_packet.unit_hash as string | null;
  const block = run!.task_packet.untrusted_data_block as string;
  const data = JSON.parse(block.slice(block.indexOf("\n") + 1, block.lastIndexOf("\n<<<END")));
  const cur = hash ? (await db.from("section_versions").select("content").eq("content_hash", hash).limit(1).single()).data?.content : null;
  const cited: string[] = cur ? (cur.kind === "faq" ? [...new Set(cur.items.flatMap((i: any) => i.claim_ids))] : cur.claim_ids) as string[] : [];
  const res = await submitStudio(db, runId, JSON.stringify({ ...build({ hash, cited, data }), agent_prompt_version: agent === CLASSIC_V1_KEY ? V1_PROMPT_VERSION : STUDIO_AGENT_META[agent].promptVersion }));
  if (res.ok !== expectOk) fail(`${agent} ${unit}: ${res.ok ? "accepted" : "rejected: " + res.errors.join(" | ")}`);
  return res;
}
const writer = (unit: string, u: Unit | null, addresses: string[] = [], decision = "PASS", gap: string[] = [], declines: { key: string; reason: string }[] = []) => step("thb-04-section-writer", unit, () => env("Section Writer", decision, { unit_key: unit, ...(u ? { unit: u } : {}), addresses, change_note: "scripted fixture version", declines }, [], gap));
// The fact gate is V1 (Phase 3d). Scripted: it rules every flagged sentence "proven" (the fixture units are clean) unless the test says otherwise.
const fact = (unit: string, decision = "PASS", findings: any[] = [], extra: any = {}, cards: any[] = [], rulings?: any[]) => step(CLASSIC_V1_KEY, unit, ({ hash, cited, data }) => env("V1 Fact and Privacy", decision, { unit_key: unit, version_hash: hash, claim_checks: cited.map((c) => ({ claim_id: c, verdict: "supported_as_written", note: "ok" })), privacy_ok: true, legal_qualification_ok: true, cards, hedge_rulings: rulings ?? (data.hedge_flags ?? []).map((h: any) => ({ key: h.key, ruling: "proven", note: "clm:1 fixture ledger" })), ...extra }, findings));
const v1Card = (unit: string, key: string, issue: string) => ({ ticket: "QUALITY_CORRECTION", from: ["V1"], to: "W1", key, section: unit, issue, severity: "must fix", evidence: "no ledger claim supports it", fix: "say only what the ledger supports", blocking: false });
const v1Revision = (unit: string, key: string, quote: string) => fact(unit, "REVISION", [{ issue_key: key, severity: "required", note: `The sentence "${quote}" says more than the ledger supports.` }], {}, [v1Card(unit, key, `Unsupported: "${quote}"`)]);
const issueKeys = async (k: string) => stateOf((await load(db, art)).sections.find((s) => s.section_key === k)).issues.map((i) => i.key);
const seo = (unit: string, decision = "PASS", findings: any[] = []) => step("thb-06-seo-aeo-geo-auditor", unit, ({ hash }) => env("SEO/AEO/GEO Auditor", decision, { unit_key: unit, version_hash: hash, checks: { direct_answer_near_start: true, question_h2: true, local_modifiers_true_and_useful: true, keyword_natural_not_forced: true, short_direct_faq: true, citation_ready: true }, tested_http_or_schema: false }, findings));
const ed = (unit: string, decision = "PASS", findings: any[] = [], revised?: Unit) => step("thb-07-editorial-critic", unit, ({ hash }) => env("Editorial Critic", decision, { unit_key: unit, version_hash: hash, voice_reference_used: true, copy_paste_test: { passed: true, flagged: [] }, authenticity: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`q${i + 1}`, true])), score: { voice: 18, education: 18, deal_logic: 18, local: 13, structure: 13, trust: 10, total: 90 }, ...(revised ? { revised_unit: revised } : {}) }, findings));
const issue = (key: string, note = "scripted required finding for the fixture") => ({ issue_key: key, severity: "required", note });
const status = async (k: string) => stateOf((await load(db, art)).sections.find((s) => s.section_key === k)).status;

const vrBefore = (await db.from("brand_facts").select("*").eq("fact_key", "voice_reference").single()).data!;
const viewers = ["u_smoke_juan", "u_smoke_cherry", "u_smoke_leo", "u_smoke_stranger"];
try {
  // fixture opportunity + brief
  const o = await db.from("opportunities").insert({ title: "SMOKE fixture (delete me)", state: "BRIEF_REVIEW", human_decision: "approve", version_hash: "smoke" }).select("id").single();
  opp = o.data!.id;
  await db.from("briefs").insert({ opportunity_id: opp, outline: real.outline, evidence_packet: real.evidence_packet, notes: "smoke fixture" });

  // Task 1: an agent cannot approve a brief; the human gate works
  const { Orchestrator } = await import("../src/lib/orchestrator");
  const { SupabaseRepo } = await import("../src/lib/orchestrator/supabase-repo");
  const refused = await new Orchestrator(new SupabaseRepo(db)).transition("opportunity", opp, "BRIEF_APPROVED", { kind: "agent", id: "thb-03-content-architect" });
  expect(!refused.ok, "an agent reached BRIEF_APPROVED");
  const ab = await approveBrief(db, opp, "smoke-test");
  if (!ab.ok) fail(ab.reason);
  art = (ab as any).articleId;
  await db.from("articles").update({ is_fixture: true }).eq("id", art);   // only a fixture article accepts the "smoke-test" actor
  out.task1 = { agentRefused: !refused.ok, articleCreated: !!art, articleState: (await load(db, art)).article.state };

  // Phase 3c task 10: the pipeline switch. A new article is classic; a team article refuses classic queueing and submits (without using an attempt).
  expect((await load(db, art)).article.pipeline_mode === "classic", "a new article is not classic");
  const { runId: modeRun } = await queueStudioRun(db, "thb-04-section-writer", art, "s1");
  const toTeam = await setPipelineMode(db, art, "team", "smoke-test");
  expect(toTeam.ok, "switching an unwritten article to team failed");
  const queueOnTeam = await queueStudioRun(db, "thb-05-fact-privacy-auditor", art, "s1").then(() => "queued", (e) => String(e.message).slice(0, 90));
  const submitOnTeam = await submitStudio(db, modeRun, "{}");
  expect(queueOnTeam.includes("team mode"), `classic queue accepted on a team article: ${queueOnTeam}`);
  expect(!submitOnTeam.ok && !submitOnTeam.final && submitOnTeam.attempt === 0, "a classic submit on a team article was not refused cleanly");
  expect((await setPipelineMode(db, art, "classic", "smoke-test")).ok, "switching back to classic failed");
  out.task10 = { default: "classic", queueOnTeam, submitOnTeam: submitOnTeam.ok ? "accepted" : submitOnTeam.errors[0].slice(0, 70) };

  // voice reference: provisional only for the duration of the smoke
  const { error: vErr } = await db.from("brand_facts").update({ provisional_by: "smoke-test", provisional_at: new Date().toISOString() }).eq("fact_key", "voice_reference");
  if (vErr) throw vErr;
  const blocked7 = await queueStudioRun(db, "thb-07-editorial-critic", art, "s1").then(() => "queued", (e) => String(e.message).slice(0, 60));
  out.agent7BlockedBeforeFactAndSeo = blocked7;

  // the loop, section by section
  for (const k of ["s1", "s2", "s3", "s6", "s8", "faq"]) { await writer(k, units[k]); await fact(k); await seo(k); await ed(k); expect((await status(k)) === "LOCKED", `${k} did not lock`); }

  // s4: targeted fix passes re-review; wording-only change does not re-enter fact review
  await writer("s4", units.s4); await fact("s4");
  await seo("s4", "REVISION", [issue("seo:keyword-forced")]);
  expect((await status("s4")) === "NEEDS_REVISION", "s4 should need revision");
  const s4b = structuredClone(units.s4) as any; s4b.blocks[1].text = "Which items belong on the form is a question for your listing agent or an attorney.";
  await writer("s4", s4b, ["seo:keyword-forced"]);
  const s4after = await status("s4");
  expect(s4after === "NEEDS_FACT", `a changed sentence must go back through V1 (${s4after})`);
  const s4scope = stateOf((await load(db, art)).sections.find((s) => s.section_key === "s4")).v1Scope;
  expect(s4scope?.kind === "changed", `V1 should re-review changed sentences only (${JSON.stringify(s4scope)})`);
  await fact("s4"); await seo("s4"); await ed("s4"); expect((await status("s4")) === "LOCKED", "s4 did not lock after the targeted fix");
  out.targetedFix = { afterWordingOnlyRevision: s4after, final: "LOCKED" };

  // s5: a changed material claim (claim ids) re-enters fact review even when SEO asked for the edit
  await writer("s5", units.s5); await fact("s5"); await seo("s5", "REVISION", [issue("seo:answer-first")]);
  const s5b = structuredClone(units.s5) as any; s5b.claim_ids = ["clm:6"];
  await writer("s5", s5b, ["seo:answer-first"]);
  const s5after = await status("s5");
  expect(s5after === "NEEDS_FACT", `material change did not re-enter fact review (${s5after})`);
  await fact("s5"); await seo("s5"); await ed("s5"); expect((await status("s5")) === "LOCKED", "s5 did not lock");
  out.materialChange = { afterMaterialRevision: s5after };

  // ---- Phase 3d: V1 is the fact gate (run while s7 is still open, so the article stays in DRAFTING and the orchestrator's article-level revision count is not used up) ----
  const para = (u: Unit, i: number, text: string): Unit => { const c = structuredClone(u) as any; c.blocks[i].text = text; return c as Unit; };
  const queueRefused = (agent: any, unit: string) => queueStudioRun(db, agent, art, unit).then(() => "queued", (e) => String(e.message).slice(0, 90));
  const stOf = async (k: string) => stateOf((await load(db, art)).sections.find((s) => s.section_key === k));

  // (a) Leo sends a locked unit through the gate with no text change: V1 passes identical text, so Agents 6 and 7 do not repeat. Agent 5 is retired.
  const g6 = await resolveSection(db, art, "s6", { kind: "v1_gate" }, "smoke-test");
  expect(g6.ok && (g6 as any).status === "NEEDS_FACT", "the v1_gate action did not send s6 through V1");
  const agent5Refused = await queueRefused("thb-05-fact-privacy-auditor", "s6");
  expect(agent5Refused.includes("retired"), `Agent 5 was queued under the V1 gate: ${agent5Refused}`);
  await fact("s6");
  expect((await status("s6")) === "LOCKED", "s6 did not lock again after V1 passed identical text");
  out.gateOnly = { statusAfterGate: "NEEDS_FACT", agent5: agent5Refused, afterV1PassIdenticalText: "LOCKED" };

  // (b) declines in classic: the writer's decline is stored, and the reviewer re-raising it under a new key and new words is counted once
  const ANCHOR = "No local fact anchors this section to the Bay Area, so the local angle stays generic.";
  const T8 = (units.s8 as any).blocks[0].text as string;
  expect((await resolveSection(db, art, "s8", { kind: "reopen", text: "Leo: declines smoke" }, "smoke-test")).ok, "reopen s8 failed");
  await writer("s8", para(units.s8, 0, T8 + " Ask who holds the keys."), ["human:directive"]); await fact("s8");
  await seo("s8", "PASS", [{ issue_key: "seo:anchor", severity: "optional", note: ANCHOR }]);
  await ed("s8", "REVISION", [issue("ed:tighten")]);
  await writer("s8", para(units.s8, 0, T8 + " Ask who holds the keys, please."), ["ed:tighten"], "PASS", [], [{ key: "seo:anchor", reason: "No local fact exists in the ledger or the library." }]);
  expect((await declinesOfRow((await load(db, art)).sections.find((s) => s.section_key === "s8")).declined).length === 1, "the writer's decline was not stored");
  await fact("s8");
  await seo("s8", "PASS", [{ issue_key: "seo:local-anchor-again", severity: "optional", note: ANCHOR + " Please add one." }]);
  const dl = declinesOfRow((await load(db, art)).sections.find((s) => s.section_key === "s8"));
  expect(dl.declined.length === 1 && dl.declined[0].raised === 2 && dl.open.length === 0, `a re-raised declined item was not counted once: ${JSON.stringify(dl)}`);
  await ed("s8"); expect((await status("s8")) === "LOCKED", "s8 did not lock");
  const afterRelock = declinesOfRow((await load(db, art)).sections.find((s) => s.section_key === "s8"));
  expect(afterRelock.declined.length === 1, "the decline did not survive to the lock");
  out.declines = { stored: dl.declined[0].key, reason: dl.declined[0].reason, raisedCount: dl.declined[0].raised, openAfter: dl.open.length };

  // (c) the fix pass, the churn check, the round limit and the escalation to Leo (unit s3)
  const T3 = (units.s3 as any).blocks[0].text as string;
  const X = "Some owners wait until a notice arrives.";
  const reopen3 = await resolveSection(db, art, "s3", { kind: "reopen", text: "Leo: V1 escalation smoke" }, "smoke-test");
  expect(reopen3.ok, `reopen s3 failed: ${JSON.stringify(reopen3)} (status ${await status("s3")})`);
  await writer("s3", para(units.s3, 0, `${T3} ${X}`), ["human:directive"]);
  await v1Revision("s3", "fact:wait", X);                                    // V1 round 1
  expect(((await stOf("s3")).fixCited ?? []).includes(X), "the cited sentence was not recorded");
  await writer("s3", para(units.s3, 0, `${T3.replace("Clutter by itself is not a code violation.", "Clutter alone is not a violation.")} ${X}`), ["fact:wait"]);   // churn: an uncited sentence changed
  const churnKeys = await issueKeys("s3");
  expect((await status("s3")) === "NEEDS_REVISION" && churnKeys.includes("det:V1_FIX_CHURN"), `the churn check did not fire (${churnKeys.join(",")})`);
  await writer("s3", units.s3, ["fact:wait"]);                              // the proper fix: only the cited sentence goes
  expect((await status("s3")) === "NEEDS_FACT", "the fixed unit did not go back to V1");
  const SENT = "Health and Safety Code section 17920.3 lists specific conditions that can make a building substandard, and the local enforcement authority decides whether a particular home meets them.";
  await v1Revision("s3", "fact:law", SENT);                                  // V1 round 2
  const NEW = "Health and Safety Code section 17920.3 lists specific conditions, and the local enforcement authority decides whether a home meets them.";
  await writer("s3", para(units.s3, 0, T3.replace(SENT, NEW)), ["fact:law"]);   // only the cited sentence changes: no churn finding
  expect(!(await issueKeys("s3")).includes("det:V1_FIX_CHURN") && (await status("s3")) === "NEEDS_FACT", "a clean fix pass was flagged as churn");
  await v1Revision("s3", "fact:law2", NEW);                                  // V1 round 3: the limit
  const escSt = await status("s3");
  expect(escSt === "ESCALATED", `the third V1 REVISION did not escalate (${escSt})`);
  const { data: escRows } = await db.from("escalations").select("issue_key,status").eq("article_id", art).eq("status", "OPEN");
  const writerOnEscalated = await queueRefused("thb-04-section-writer", "s3");
  expect((escRows ?? []).length >= 1 && writerOnEscalated.includes("cannot run"), `escalation not recorded or the writer was not refused (${writerOnEscalated})`);
  expect((await resolveSection(db, art, "s3", { kind: "request_revision", text: "Leo: smoke resolution" }, "smoke-test")).ok, "Leo's resolution failed");
  await writer("s3", units.s3, ["fact:law2"]); await fact("s3"); await seo("s3"); await ed("s3");
  expect((await status("s3")) === "LOCKED", "s3 did not lock after Leo's resolution");
  out.v1Loop = { churnFinding: "det:V1_FIX_CHURN", rounds: 3, escalated: escSt, escalations: (escRows ?? []).map((e) => e.issue_key), writerRefused: writerOnEscalated, final: "LOCKED" };

  // s7: an editor who swaps a claim cannot lock: back to fact review
  await writer("s7", units.s7); await fact("s7"); await seo("s7");
  const s7e = structuredClone(units.s7) as any; s7e.claim_ids = ["clm:1", "clm:5"];
  await ed("s7", "PASS", [], s7e);
  const s7after = await status("s7");
  expect(s7after === "NEEDS_FACT", `editor material change did not return to fact review (${s7after})`);
  await fact("s7"); await seo("s7"); await ed("s7"); expect((await status("s7")) === "LOCKED", "s7 did not lock");
  out.editorChangesFact = { statusAfterEditorMaterialChange: s7after };


  // Blocked cases through the real submit path: a section with an unsupported figure is BLOCKED_CLAIM and the article follows; Leo resolves it.
  const bad = structuredClone(units.s2) as any; bad.blocks[0].text += " You have 30 days to disclose under Civil Code section 1102.9.";
  const s2status0 = await status("s2");
  expect(s2status0 === "LOCKED", "s2 should be locked before the reopen test");
  // (s2 is locked, so the writer is refused; reopen it as Leo, then try the unsupported version)
  const writerOnLocked = await queueStudioRun(db, "thb-04-section-writer", art, "s2").then(() => "queued", (e) => String(e.message).slice(0, 70));
  const lateSwitch = await setPipelineMode(db, art, "team", "smoke-test");
  expect(!lateSwitch.ok, "the mode switched to team after sections were written");
  (out.task10 as any).switchAfterWritingRefused = !lateSwitch.ok ? lateSwitch.reason.slice(0, 80) : "NOT REFUSED";
  const reopened = await resolveSection(db, art, "s2", { kind: "reopen", text: "Leo: smoke test reopen" }, "smoke-test");
  expect(reopened.ok, "reopen failed");
  await writer("s2", bad, ["human:directive"]);
  const blockedStatus = await status("s2");
  const artState = (await load(db, art)).article.state;
  expect(blockedStatus === "BLOCKED_CLAIM" && artState === "BLOCKED_CLAIM", `unsupported figure not blocked (${blockedStatus}/${artState})`);
  const writerBlocked = await queueStudioRun(db, "thb-04-section-writer", art, "s2").then(() => "queued", (e) => String(e.message).slice(0, 70));
  const res = await resolveSection(db, art, "s2", { kind: "request_revision", text: "Leo: remove the unsupported figure" }, "smoke-test");
  expect(res.ok, "resolve failed");
  await writer("s2", units.s2, ["human:directive"]); await fact("s2"); await seo("s2"); await ed("s2");
  out.blockedClaim = { writerRefusedOnLocked: writerOnLocked, afterUnsupportedFigure: `${blockedStatus} / article ${artState}`, writerRefusedWhenBlocked: writerBlocked, finalArticleState: (await load(db, art)).article.state };

  // the article assembles itself when every section is locked
  const adv = await advanceArticle(db, art);
  const A = (await load(db, art)).article;
  out.assembled = { note: adv, state: A.state, hash: A.version_hash?.slice(0, 16) };
  expect(A.state === "HUMAN_REVIEW", `article did not reach HUMAN_REVIEW (${A.state})`);

  // proposal + payload + hash checks
  const prop = await createProposal(db, art, "smoke-test");
  const payload = await buildProposalPayload(db, prop.id);
  const hArticle = payload.items.find((i: any) => i.kind === "article")!.hash;
  const hVoice = payload.items.find((i: any) => i.kind === "voice_reference")?.hash;
  expect(hArticle === sha256(payload.html) && hArticle === A.version_hash, "payload hash is not the recomputed hash of the stored version");
  out.proposal = { id: prop.id, items: payload.items.map((i: any) => i.kind), htmlBytes: payload.html.length };

  // approvers: first click registers pending; Leo confirms by account id; never Leo as secondary
  const now = new Date(Date.now() + 1000).toISOString();
  const rec = (n: string, viewerId: string, kind: "article" | "voice_reference", hash: string, o: Partial<RoomRecord> = {}): RoomRecord => ({ recordId: `smoke-${n}`, proposalId: prop.id, itemKind: kind, decision: "approve", claimedHash: hash, viewerId, displayName: viewerId, serverUpdatedAt: now, browserDecidedAt: new Date().toISOString(), ...o });
  const first = await syncApprovals(db, [rec("juan1", viewers[0], "article", hArticle), rec("leo1", viewers[2], "article", hArticle), rec("x1", viewers[3], "article", hArticle)]);
  expect(first.pendingRegistrations.length === 3 && first.approvals === 0, "first clicks must be feedback");
  const secLeo = await confirmApprover(db, viewers[2], "operator", "Leo", "smoke-test");
  const asSecondaryLeo = await confirmApprover(db, viewers[2], "secondary", "Cherry", "smoke-test");
  const leoNamed = await confirmApprover(db, viewers[3], "secondary", "Leo", "smoke-test");
  expect(secLeo.ok && !asSecondaryLeo.ok && !leoNamed.ok, "Leo-as-secondary guard failed");
  await confirmApprover(db, viewers[0], "approver", "Juan", "smoke-test");
  await confirmApprover(db, viewers[1], "secondary", "Cherry", "smoke-test");

  // forged records
  const forged = await syncApprovals(db, [rec("forged-hash", viewers[0], "article", "f".repeat(64)), rec("backdated", viewers[0], "article", hArticle, { browserDecidedAt: "2020-01-01T00:00:00Z" }), rec("leo-click", viewers[2], "article", hArticle), rec("stranger", viewers[3], "article", hArticle)]);
  const { data: log } = await db.from("approval_sync_log").select("record_id,classification,accepted,reason,server_updated_at,browser_decided_at,claimed_hash,recomputed_hash").like("record_id", "smoke-%");
  const L1 = (id: string) => log!.find((r) => r.record_id === id)!;
  expect(L1("smoke-forged-hash").classification === "REJECTED" && L1("smoke-forged-hash").recomputed_hash === hArticle, "forged hash not rejected with both hashes");
  expect(L1("smoke-backdated").classification === "APPROVAL" && new Date(L1("smoke-backdated").server_updated_at).getFullYear() === new Date(now).getFullYear() && L1("smoke-backdated").browser_decided_at === "2020-01-01T00:00:00Z", "backdated browser time was not ignored");
  expect(L1("smoke-leo-click").classification === "FEEDBACK" && L1("smoke-stranger").classification === "FEEDBACK", "operator/unknown clicks must be feedback");
  const { data: rej } = await db.from("audit_events").select("accepted,detail").eq("subject_id", prop.id).eq("event_type", "approval_record_rejected");
  expect(rej!.length >= 1 && rej![0].accepted === false && (rej![0].detail as any).claimed_hash && (rej![0].detail as any).recomputed_hash, "rejection not audited with both hashes");
  const stateAfterArticleOnly = (await load(db, art)).article.state;
  expect(stateAfterArticleOnly === "HUMAN_REVIEW", "article signed off before the voice reference was confirmed");
  out.forgedRecords = { rejectedForgedHash: true, backdatedTimeIgnored: true, serverTimeUsed: L1("smoke-backdated").server_updated_at, operatorAndStrangerAreFeedback: true, stateWhileVoicePending: stateAfterArticleOnly, report: forged.signoff };

  // Juan confirms the voice reference too -> sign-off
  const signed = await syncApprovals(db, [rec("juan-voice", viewers[0], "voice_reference", hVoice!)]);
  const A2 = (await load(db, art)).article;
  const vr2 = (await db.from("brand_facts").select("status,approved_by").eq("fact_key", "voice_reference").single()).data!;
  expect(A2.state === "APPROVED_FOR_WP_DRAFT" && A2.approved_hash === A.version_hash && vr2.status === "approved", `sign-off failed: ${JSON.stringify(signed.signoff)}`);
  const { data: ap } = await db.from("approvals").select("approver_identity,decided_at,item_kind").eq("proposal_id", prop.id);
  out.signoff = { state: A2.state, approvals: ap!.map((a) => `${a.item_kind}: ${a.approver_identity}`), voice: vr2.status };

  // edit after approval invalidates it, and old records can no longer match
  const re = await resolveSection(db, art, "s3", { kind: "reopen", text: "Leo: smoke edit after approval" }, "smoke-test");
  expect(re.ok, "reopen after approval failed");
  const A3 = (await load(db, art)).article;
  const replay = await syncApprovals(db, [rec("juan1-replay", viewers[0], "article", hArticle, { serverUpdatedAt: new Date(Date.now() + 2000).toISOString() })]);
  const lr = (await db.from("approval_sync_log").select("classification,reason").eq("record_id", "smoke-juan1-replay").single()).data!;
  expect(A3.approved_hash === null && A3.state === "DRAFTING" && lr.classification === "REJECTED", `edit after approval did not invalidate (${A3.state}, ${lr.classification})`);
  out.editAfterApproval = { articleState: A3.state, approvedHash: A3.approved_hash, replayOfOldApproval: lr.classification, reason: lr.reason, replayReport: replay.lines[0] };
  console.log(JSON.stringify(out, null, 1));
  console.log("SMOKE PASSED");
} finally {
  // cleanup: fixture rows out, the real voice reference row restored
  try {
    await db.from("brand_facts").update({ status: vrBefore.status, approved_by: vrBefore.approved_by, approved_at: vrBefore.approved_at, provisional_by: vrBefore.provisional_by, provisional_at: vrBefore.provisional_at, fact_value: vrBefore.fact_value }).eq("fact_key", "voice_reference");
    if (art) {
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
    await db.from("approval_sync_log").delete().like("record_id", "smoke-%");
    await db.from("approver_registry").delete().in("viewer_id", viewers);
    if (opp) { await db.from("decisions").delete().eq("opportunity_id", opp); await db.from("briefs").delete().eq("opportunity_id", opp); await db.from("agent_runs").delete().eq("subject_id", opp); await db.from("opportunities").delete().eq("id", opp); }
    const { data: vr } = await db.from("brand_facts").select("status,provisional_by").eq("fact_key", "voice_reference").single();
    console.log(`cleanup done; voice_reference restored (status ${vr!.status}, provisional_by ${vr!.provisional_by})`);
  } catch (e) { console.error("CLEANUP PROBLEM:", e); process.exitCode = 1; }
}
