/* eslint-disable @typescript-eslint/no-explicit-any */
// V1 calibration run (prompt 1.2.0). FIXTURE ONLY. The REAL V1 (the thb-v1-fact-privacy subagent, dispatched by the operator) reviews Leo's ten blind-card sentences,
// unchanged, through the production path: fixture article -> classic V1 queue -> task packet -> real agent output -> validated submit. This script only sets up, reads the
// results and cleans up; it simulates no classification. Nothing here touches a real article, WordPress, approvals or publishing.
//   npm run calibrate -- setup   <dir>   three fixture articles, one unit per card, V1 queued on each; writes <dir>/card<NN>-packet.json and <dir>/state.json
//                                        then dispatch V1 on each packet, write <dir>/card<NN>-out.json, and:  npm run studio -- submit-dir <dir>
//   npm run calibrate -- verify  <dir>   expected vs actual per card, match rate; writes <dir>/result.json
//   npm run calibrate -- cleanup <dir>   removes every fixture row
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { approveBrief, load, queueStudioRun, stateOf, submitStudio } from "../src/lib/studio/service";
import { CLASSIC_V1_KEY, STUDIO_AGENT_META } from "../src/lib/studio/agents";
import type { Unit } from "../src/lib/studio/schema";
import { LEO_CARDS } from "./fixtures/leo-v1-cards";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const [cmd, dir] = process.argv.slice(2);
if (!cmd || !dir) throw new Error("usage: npm run calibrate -- <setup|verify|cleanup> <dir>");
mkdirSync(dir, { recursive: true });
const stateFile = `${dir}/state.json`;
const pad = (n: number) => String(n).padStart(2, "0");

/** What Leo's judgment and the release rule say each card must produce. "should_or_none": a should-fix or no finding both count. */
const EXPECTED: Record<number, "must" | "should" | "should_or_none"> = { 1: "should", 2: "must", 3: "should_or_none", 4: "should_or_none", 5: "should_or_none", 6: "should_or_none", 7: "should_or_none", 8: "should", 9: "must", 10: "should_or_none" };
const FAQ_Q = "Who can sell the house if the owner cannot or will not?";
const FAQ_CARDS = new Set([1, 8, 9]);
// the faq unit needs at least three items; the other two are neutral referrals that state nothing
const FAQ_FILLER = [{ q: "Who can help me with liens on the house?", a: "Your title company can tell you what is recorded against the property.", claim_ids: [] }, { q: "Who can help me with tax questions?", a: "A CPA can answer tax questions about a sale.", claim_ids: [] }];

if (cmd === "setup") {
  const real = (await db.from("briefs").select("outline,evidence_packet").eq("opportunity_id", "1d78c9e3-6b2d-4434-88ed-56b905e67c24").single()).data!;
  const H = (i: number) => real.outline.outline[i].h2 as string;
  const arts: { opp: string; art: string }[] = [];
  const state: { arts: typeof arts; cards: Record<number, { art: string; unit: string; runId: string }> } = { arts, cards: {} };
  const meta = STUDIO_AGENT_META["thb-04-section-writer"];
  // three fixture articles: the three FAQ-answer cards each need their own faq unit
  const slots = [{ faq: 1, sections: [2, 3, 4, 5] }, { faq: 8, sections: [6, 7, 10] }, { faq: 9, sections: [] as number[] }];
  for (const slot of slots) {
    const o = await db.from("opportunities").insert({ title: "CALIBRATION fixture (delete me)", state: "BRIEF_REVIEW", human_decision: "approve", version_hash: "calibration" }).select("id").single();
    const opp = o.data!.id as string;
    await db.from("briefs").insert({ opportunity_id: opp, outline: real.outline, evidence_packet: real.evidence_packet, notes: "calibration fixture" });
    const ab = await approveBrief(db, opp, "smoke-test");
    if (!ab.ok) throw new Error(ab.reason);
    const art = (ab as any).articleId as string;
    await db.from("articles").update({ is_fixture: true }).eq("id", art);
    arts.push({ opp, art });
    writeFileSync(stateFile, JSON.stringify(state));
    const jobs: { card: number; unit: string }[] = [{ card: slot.faq, unit: "faq" }, ...slot.sections.map((c, i) => ({ card: c, unit: `s${i + 2}` }))];
    for (const j of jobs) {
      const card = LEO_CARDS.find((c) => c.card === j.card)!;
      const unit: Unit = FAQ_CARDS.has(card.card)
        ? ({ kind: "faq", key: "faq", items: [{ q: FAQ_Q, a: card.sentence, claim_ids: [] }, ...FAQ_FILLER] } as Unit)
        : ({ kind: "section", key: j.unit, h2: H(Number(j.unit.slice(1)) - 1), blocks: [{ t: "p", text: "Ask an attorney or your title company what applies to your sale." }, { t: "p", text: card.sentence }], claim_ids: [], roles: [] } as Unit);
      const { runId } = await queueStudioRun(db, "thb-04-section-writer", art, j.unit);
      const body = { article_id: art, opportunity_id: opp, agent_name: "Section Writer", agent_prompt_version: meta.promptVersion, model_version: "claude-code/calibration-fixture", input_version_ids: ["fixture"], decision: "PASS", findings: [], evidence_ids: [], required_actions: [], output_version_id: `cal-${card.card}`, timestamp: new Date().toISOString(), result: { unit_key: j.unit, unit, addresses: [], change_note: `fixture: card ${card.card}`, declines: [] } };
      const res = await submitStudio(db, runId, JSON.stringify(body));
      if (!res.ok) throw new Error(`card ${card.card}: the fixture writer was refused: ${res.errors.join(" | ")}`);
      const st = stateOf((await load(db, art)).sections.find((s) => s.section_key === j.unit));
      if (st.status !== "NEEDS_FACT") { console.log(`card ${pad(card.card)} (${j.unit}): ${st.status}${st.blockedBy ? ` BLOCKED BY CODE: ${st.blockedBy}` : ""}; V1 will not run`); state.cards[card.card] = { art, unit: j.unit, runId: "" }; continue; }
      const q = await queueStudioRun(db, CLASSIC_V1_KEY, art, j.unit);
      const { data: run } = await db.from("agent_runs").select("task_packet").eq("id", q.runId).single();
      writeFileSync(`${dir}/card${pad(card.card)}-packet.json`, JSON.stringify({ run_id: q.runId, attempts_used: 0, last_error: null, ...run!.task_packet }, null, 2));
      state.cards[card.card] = { art, unit: j.unit, runId: q.runId };
      console.log(`card ${pad(card.card)} (${j.unit}, hedge flags ${(st.hedges ?? []).length}): V1 queued`);
    }
  }
  writeFileSync(stateFile, JSON.stringify(state));
  console.log(`setup done: ${Object.keys(state.cards).length} cards in ${arts.length} fixture articles`);
} else if (cmd === "verify") {
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const cites = (note: string, sentence: string) => { const n = note.toLowerCase(); if (n.includes(sentence.toLowerCase().slice(0, 25))) return true; const sw = words(sentence); const nw = new Set(words(note)); return sw.length > 0 && sw.filter((w) => nw.has(w)).length / sw.length >= 0.6; };
  const rows: any[] = [];
  for (const c of LEO_CARDS) {
    const slot = state.cards[c.card];
    const outFile = `${dir}/card${pad(c.card)}-out.json`;
    const out = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : null;
    const sec = (await load(db, slot.art)).sections.find((s: any) => s.section_key === slot.unit);
    const st = stateOf(sec);
    const { data: revs } = await db.from("section_reviews").select("decision,findings,created_at").eq("section_id", sec.id).eq("agent_key", CLASSIC_V1_KEY).order("created_at");
    const rev = (revs ?? []).at(-1);
    const findings: any[] = out?.findings ?? rev?.findings ?? [];
    const rulings: any[] = out?.result?.hedge_rulings ?? [];
    const sentenceOfHedge = new Map((st.hedges ?? []).map((h: any) => [h.key, h.sentence]));
    const mustFindings = findings.filter((f) => f.severity === "required" && cites(f.note, c.sentence));
    const mustRuling = rulings.filter((r) => (r.ruling === "reword" || r.ruling === "drop") && (!sentenceOfHedge.has(r.key) || cites(String(sentenceOfHedge.get(r.key)), c.sentence)));
    const shouldFindings = findings.filter((f) => f.severity === "optional" && cites(f.note, c.sentence));
    const shouldRuling = rulings.filter((r) => r.ruling === "soften");
    const otherFindings = findings.filter((f) => !cites(f.note, c.sentence));
    const codeBlocked = st.status === "BLOCKED_CLAIM" || st.status === "BLOCKED_PRIVACY";
    const actual: "must" | "should" | "none" = mustFindings.length || mustRuling.length || (out?.decision === "BLOCKED" && !otherFindings.length) ? "must" : shouldFindings.length || shouldRuling.length ? "should" : "none";
    const expected = EXPECTED[c.card];
    const match = expected === "should_or_none" ? actual === "should" || actual === "none" : expected === actual;
    rows.push({ card: c.card, sentence: c.sentence, leo: c.leo, expected, actual, match, decision: out?.decision ?? rev?.decision ?? null, status: st.status, codeBlocked, mustFindings: mustFindings.map((f) => f.note), shouldFindings: shouldFindings.map((f) => f.note), rulings: rulings.map((r) => ({ ruling: r.ruling, note: r.note })), otherFindings: otherFindings.map((f) => `${f.severity}: ${f.note}`) });
  }
  writeFileSync(`${dir}/result.json`, JSON.stringify(rows, null, 2));
  for (const r of rows) console.log(`${r.match ? "MATCH   " : "MISMATCH"} card ${pad(r.card)}  expected ${r.expected.padEnd(14)} actual ${r.actual.padEnd(6)} (V1 ${r.decision}, unit ${r.status})${r.otherFindings.length ? `  [+${r.otherFindings.length} finding(s) about other text]` : ""}`);
  const n = rows.filter((r) => r.match).length;
  console.log(`match rate ${n}/${rows.length}`);
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
