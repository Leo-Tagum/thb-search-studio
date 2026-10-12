/* eslint-disable @typescript-eslint/no-explicit-any */
// V1 calibration, card 1 in its ORIGINAL context. FIXTURE ONLY. The FAQ unit V1 originally reviewed (the classic-revised FAQ, version b30a408c09e1…, read from the
// database and used verbatim: every item, every sentence, every claim id) is written into three fixture articles, and the REAL V1 (the thb-v1-fact-privacy subagent,
// dispatched by the operator) reviews each one through the production path. The sentence, the context, the prompt and the guard are not changed.
//   npm run calibrate-context -- setup   <dir>   three fixture articles; writes <dir>/run<N>-packet.json and <dir>/state.json
//                                                then dispatch V1 on each packet -> <dir>/run<N>-out.json, and:  npm run studio -- submit-dir <dir>
//   npm run calibrate-context -- verify  <dir>   what V1 ruled on card 1's sentence in each run, and everything else it raised
//   npm run calibrate-context -- cleanup <dir>   removes every fixture row
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { approveBrief, load, queueStudioRun, stateOf, submitStudio } from "../src/lib/studio/service";
import { CLASSIC_V1_KEY, STUDIO_AGENT_META } from "../src/lib/studio/agents";
import { LEO_CARDS } from "./fixtures/leo-v1-cards";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const [cmd, dir] = process.argv.slice(2);
if (!cmd || !dir) throw new Error("usage: npm run calibrate-context -- <setup|verify|cleanup> <dir>");
mkdirSync(dir, { recursive: true });
const stateFile = `${dir}/state.json`;
const CLASSIC_REVISED_BRANCH = "54070caa-bd79-4184-a82a-9235b1c33b64";
const HASH_PREFIX = "b30a408c09e1";   // the FAQ version V1 reviewed in the Phase 3c follow-up (phase-3c-data/4-v1-on-classic-revised-text/V1r-faq-*)
const CARD1 = LEO_CARDS.find((c) => c.card === 1)!.sentence;
const RUNS = 3;

if (cmd === "setup") {
  // read-only on the real branch: find the exact FAQ version
  const { data: sec } = await db.from("article_sections").select("id").eq("article_id", CLASSIC_REVISED_BRANCH).eq("section_key", "faq").single();
  const { data: vers } = await db.from("section_versions").select("content,content_hash").eq("section_id", sec!.id);
  const v = (vers ?? []).find((x: any) => String(x.content_hash).startsWith(HASH_PREFIX));
  if (!v) throw new Error(`the FAQ version ${HASH_PREFIX} was not found`);
  const unit = v.content as any;
  const answers = unit.items.map((i: any) => i.a as string).join(" ");
  if (!answers.includes(CARD1)) throw new Error("card 1's sentence is not in this FAQ version");
  console.log(`FAQ version ${String(v.content_hash).slice(0, 12)}: ${unit.items.length} items, card 1's sentence found in item ${unit.items.findIndex((i: any) => i.a.includes(CARD1)) + 1}`);
  const real = (await db.from("briefs").select("outline,evidence_packet").eq("opportunity_id", "1d78c9e3-6b2d-4434-88ed-56b905e67c24").single()).data!;
  const arts: { opp: string; art: string }[] = [];
  const state: any = { arts, runs: {} };
  const meta = STUDIO_AGENT_META["thb-04-section-writer"];
  for (let n = 1; n <= RUNS; n++) {
    const o = await db.from("opportunities").insert({ title: "CALIBRATION context fixture (delete me)", state: "BRIEF_REVIEW", human_decision: "approve", version_hash: "calibration-context" }).select("id").single();
    const opp = o.data!.id as string;
    await db.from("briefs").insert({ opportunity_id: opp, outline: real.outline, evidence_packet: real.evidence_packet, notes: "calibration context fixture" });
    const ab = await approveBrief(db, opp, "smoke-test");
    if (!ab.ok) throw new Error(ab.reason);
    const art = (ab as any).articleId as string;
    await db.from("articles").update({ is_fixture: true }).eq("id", art);
    arts.push({ opp, art });
    writeFileSync(stateFile, JSON.stringify(state));
    const { runId } = await queueStudioRun(db, "thb-04-section-writer", art, "faq");
    const body = { article_id: art, opportunity_id: opp, agent_name: "Section Writer", agent_prompt_version: meta.promptVersion, model_version: "claude-code/calibration-fixture", input_version_ids: ["fixture"], decision: "PASS", findings: [], evidence_ids: [], required_actions: [], output_version_id: `ctx-${n}`, timestamp: new Date().toISOString(), result: { unit_key: "faq", unit, addresses: [], change_note: "fixture: the FAQ exactly as V1 reviewed it", declines: [] } };
    const res = await submitStudio(db, runId, JSON.stringify(body));
    if (!res.ok) throw new Error(`run ${n}: the fixture writer was refused: ${res.errors.join(" | ")}`);
    const st = stateOf((await load(db, art)).sections.find((s) => s.section_key === "faq"));
    if (st.status !== "NEEDS_FACT") throw new Error(`run ${n}: the unit is ${st.status}${st.blockedBy ? ` (${st.blockedBy})` : ""}; V1 will not run`);
    const q = await queueStudioRun(db, CLASSIC_V1_KEY, art, "faq");
    const { data: run } = await db.from("agent_runs").select("task_packet").eq("id", q.runId).single();
    writeFileSync(`${dir}/run${n}-packet.json`, JSON.stringify({ run_id: q.runId, attempts_used: 0, last_error: null, ...run!.task_packet }, null, 2));
    state.runs[n] = { art, runId: q.runId };
    console.log(`run ${n}: fixture article ${art.slice(0, 8)}, hedge flags ${(st.hedges ?? []).length}, V1 queued`);
  }
  writeFileSync(stateFile, JSON.stringify(state));
} else if (cmd === "verify") {
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const cites = (note: string) => { if (note.toLowerCase().includes(CARD1.toLowerCase().slice(0, 25))) return true; const sw = words(CARD1); const nw = new Set(words(note)); return sw.filter((w) => nw.has(w)).length / sw.length >= 0.6; };
  const rows: any[] = [];
  for (let n = 1; n <= RUNS; n++) {
    const out = JSON.parse(readFileSync(`${dir}/run${n}-out.json`, "utf8"));
    const findings: any[] = out.findings ?? [];
    const rulings: any[] = out.result?.hedge_rulings ?? [];
    const st = stateOf((await load(db, state.runs[n].art)).sections.find((s: any) => s.section_key === "faq"));
    const about = findings.filter((f) => cites(f.note));
    const must = about.filter((f) => f.severity === "required");
    const should = about.filter((f) => f.severity === "optional");
    const actual = must.length ? "must" : should.length ? "should" : "none";
    rows.push({ run: n, decision: out.decision, unitStatus: st.status, card1: actual, card1Findings: about.map((f) => ({ severity: f.severity, key: f.issue_key, note: f.note })), otherFindings: findings.filter((f) => !cites(f.note)).map((f) => ({ severity: f.severity, key: f.issue_key, note: f.note })), hedgeRulings: rulings });
  }
  writeFileSync(`${dir}/result.json`, JSON.stringify(rows, null, 2));
  for (const r of rows) console.log(`run ${r.run}: V1 ${r.decision}; card 1 sentence -> ${r.card1.toUpperCase()}; ${r.card1Findings.length} finding(s) cite it, ${r.otherFindings.length} about other text`);
  const should = rows.filter((r) => r.card1 === "should").length, none = rows.filter((r) => r.card1 === "none").length, must = rows.filter((r) => r.card1 === "must").length;
  console.log(`card 1 in context: should-fix ${should}, no finding ${none}, must-fix ${must} of ${rows.length}`);
} else if (cmd === "cleanup") {
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  for (const { art, opp } of state.arts) {
    const { data: secs } = await db.from("article_sections").select("id").eq("article_id", art);
    const sids = (secs ?? []).map((s) => s.id);
    await db.from("article_sections").update({ current_version_id: null, locked_version_id: null }).in("id", sids);
    await db.from("section_reviews").delete().in("section_id", sids);
    await db.from("escalations").delete().eq("article_id", art);
    await db.from("section_versions").delete().in("section_id", sids);
    await db.from("article_sections").delete().in("id", sids);
    await db.from("article_versions").delete().eq("article_id", art);
    await db.from("claims").delete().eq("article_id", art);
    await db.from("agent_runs").delete().eq("subject_id", art);
    await db.from("articles").delete().eq("id", art).eq("is_fixture", true);
    await db.from("decisions").delete().eq("opportunity_id", opp);
    await db.from("briefs").delete().eq("opportunity_id", opp);
    await db.from("agent_runs").delete().eq("subject_id", opp);
    await db.from("opportunities").delete().eq("id", opp);
  }
  console.log("fixture rows removed");
} else throw new Error(`unknown command ${cmd}`);
