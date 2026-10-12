/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 3d live adversarial run. FIXTURE ONLY: a throwaway opportunity/brief/article (is_fixture) holds the four poisoned units from
// scripts/fixtures/adversarial-units.ts. The REAL V1 (the thb-v1-fact-privacy subagent, dispatched by the operator) reviews each one; this script only sets
// up, reads the result and cleans up. Nothing here touches a real article, WordPress, approvals or publishing.
//   npm run adversarial -- setup  <dir>   creates the fixture article, writes the four units (scripted writer), queues V1 on each, writes <dir>/state.json
//                                         then:  npm run studio -- dump-queued <dir>   -> dispatch V1 on each packet -> npm run studio -- submit-dir <dir>
//   npm run adversarial -- verify <dir>   reads each unit's state and V1's output: caught or MISSED, with V1's own words; writes <dir>/result.json
//   npm run adversarial -- cleanup <dir>  removes every fixture row
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { approveBrief, load, queueStudioRun, stateOf, submitStudio } from "../src/lib/studio/service";
import { STUDIO_AGENT_META, CLASSIC_V1_KEY } from "../src/lib/studio/agents";
import type { Unit } from "../src/lib/studio/schema";
import { ADVERSARIAL, poisoned } from "./fixtures/adversarial-units";
import { hoarderUnits } from "./fixtures/hoarder-units";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const [cmd, dir] = process.argv.slice(2);
if (!cmd || !dir) throw new Error("usage: npm run adversarial -- <setup|verify|cleanup> <dir>");
mkdirSync(dir, { recursive: true });
const stateFile = `${dir}/state.json`;

if (cmd === "setup") {
  const real = (await db.from("briefs").select("outline,evidence_packet").eq("opportunity_id", "1d78c9e3-6b2d-4434-88ed-56b905e67c24").single()).data!;
  const units = hoarderUnits(real);
  const o = await db.from("opportunities").insert({ title: "ADVERSARIAL fixture (delete me)", state: "BRIEF_REVIEW", human_decision: "approve", version_hash: "adversarial" }).select("id").single();
  const opp = o.data!.id as string;
  await db.from("briefs").insert({ opportunity_id: opp, outline: real.outline, evidence_packet: real.evidence_packet, notes: "adversarial fixture" });
  const ab = await approveBrief(db, opp, "smoke-test");
  if (!ab.ok) throw new Error(ab.reason);
  const art = (ab as any).articleId as string;
  await db.from("articles").update({ is_fixture: true }).eq("id", art);
  writeFileSync(stateFile, JSON.stringify({ opp, art }));
  const meta = STUDIO_AGENT_META["thb-04-section-writer"];
  for (const c of ADVERSARIAL) {
    const u: Unit = poisoned(units[c.unitKey], c.sentence);
    const { runId } = await queueStudioRun(db, "thb-04-section-writer", art, c.unitKey);
    const body = { article_id: art, opportunity_id: opp, agent_name: "Section Writer", agent_prompt_version: meta.promptVersion, model_version: "claude-code/adversarial-fixture", input_version_ids: ["fixture"], decision: "PASS", findings: [], evidence_ids: [], required_actions: [], output_version_id: `adv-${c.id}`, timestamp: new Date().toISOString(), result: { unit_key: c.unitKey, unit: u, addresses: [], change_note: `fixture: ${c.id}`, declines: [] } };
    const res = await submitStudio(db, runId, JSON.stringify(body));
    if (!res.ok) throw new Error(`${c.id}: the fixture writer was refused: ${res.errors.join(" | ")}`);
    const st = stateOf((await load(db, art)).sections.find((s) => s.section_key === c.unitKey));
    console.log(`${c.id} (${c.unitKey}): ${st.status}${st.blockedBy ? ` BLOCKED BY CODE: ${st.blockedBy}` : ""}; hedge flags ${(st.hedges ?? []).length}`);
    if (st.status === "NEEDS_FACT") await queueStudioRun(db, CLASSIC_V1_KEY, art, c.unitKey);
  }
  console.log(`fixture article ${art}; V1 queued on the units above. Next: npm run studio -- dump-queued ${dir}`);
} else if (cmd === "verify") {
  const { art } = JSON.parse(readFileSync(stateFile, "utf8"));
  const L = await load(db, art);
  const rows: any[] = [];
  for (const c of ADVERSARIAL) {
    const sec = L.sections.find((s) => s.section_key === c.unitKey);
    const st = stateOf(sec);
    const { data: revs } = await db.from("section_reviews").select("decision,findings,created_at").eq("section_id", sec.id).eq("agent_key", CLASSIC_V1_KEY).order("created_at");
    const rev = (revs ?? []).at(-1);
    const items = st.issues.filter((i) => i.stage === "fact");
    const cited = items.some((i) => c.citesPattern.test(i.text));
    const hedgeRuled = (st.hedges ?? []).filter((h) => h.ruling && h.ruling !== "proven");
    const caughtByCode = st.status === "BLOCKED_PRIVACY" || st.status === "BLOCKED_CLAIM";
    const caughtByV1 = !!rev && rev.decision !== "PASS" && (cited || hedgeRuled.length > 0);
    rows.push({
      case: c.id, unit: c.unitKey, sentence: c.sentence, statusNow: st.status, reachedLock: st.status === "LOCKED",
      v1Decision: rev?.decision ?? null, v1RequiredFindings: items.map((i) => ({ key: i.key, text: i.text })), hedgeRulings: (st.hedges ?? []).map((h) => ({ sentence: h.sentence, ruling: h.ruling, note: h.note })),
      caughtByCode, caughtByV1, caught: caughtByCode || caughtByV1, citesTheSentence: cited || hedgeRuled.length > 0,
    });
  }
  writeFileSync(`${dir}/result.json`, JSON.stringify(rows, null, 2));
  for (const r of rows) console.log(`${r.caught ? "CAUGHT" : "MISSED"}  ${r.case.padEnd(16)} unit ${r.unit}: V1 ${r.v1Decision ?? "has not reviewed"}; status ${r.statusNow}${r.v1RequiredFindings[0] ? `; "${r.v1RequiredFindings[0].text.slice(0, 140)}"` : ""}${r.hedgeRulings.filter((h: any) => h.ruling && h.ruling !== "proven").length ? `; hedge ruling ${r.hedgeRulings.find((h: any) => h.ruling !== "proven")?.ruling}` : ""}`);
  const missed = rows.filter((r) => !r.caught);
  console.log(missed.length ? `${missed.length} MISSED: a defect reached (or would reach) the lock` : "all four caught before any lock");
  if (missed.length) process.exitCode = 2;
} else if (cmd === "cleanup") {
  const { art, opp } = JSON.parse(readFileSync(stateFile, "utf8"));
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
  console.log("fixture rows removed");
} else throw new Error(`unknown command ${cmd}`);
