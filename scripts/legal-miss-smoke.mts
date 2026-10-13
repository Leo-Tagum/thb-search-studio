/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 3e stage 5: the three REAL MISSES of the hoarder guide, run through the REAL V1 (the thb-v1-fact-privacy subagent, dispatched by the operator). FIXTURE ONLY.
// Each miss has a bad version and a clean control (the corrected unit as it is locked on the hoarder branch, read-only). The fixture ledger carries the hoarder
// branch's legal-claim records (clm:1-8, gates kept). This script only sets up, reads results and cleans up; it simulates no agent. Nothing here touches a real
// article, WordPress, approvals or publishing.
//   MISS 1  "The statute does not mention hoarding."                      (an absence-of-law claim; V1 must rule reword or drop)
//   MISS 2  a flat rule with no threshold ("California law says junk ... make a building substandard")  (V1 must find NARROWER / reader impact changes)
//   MISS 3  who decides shown as a closed list the code cannot see ("the county health department or the fire marshal")  (V1 must find it; the exact old wording
//           "the health officer or the fire official" is caught by CODE, shown with no agent)
//   npm run legal-miss -- setup   <dir>   three fixture articles; writes <dir>/<label>-packet.json and <dir>/state.json
//                                          then dispatch V1 on each packet -> <dir>/<label>-out.json, and:  npm run studio -- submit-dir <dir>
//   npm run legal-miss -- verify  <dir>   caught or MISSED per miss, control passes, and what the code caught alone
//   npm run legal-miss -- cleanup <dir>   removes every fixture row
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { approveBrief, load, queueStudioRun, stateOf, submitStudio } from "../src/lib/studio/service";
import { CLASSIC_V1_KEY, STUDIO_AGENT_META } from "../src/lib/studio/agents";
import type { Unit } from "../src/lib/studio/schema";
import { copyLedgerRecords } from "./fixtures/ledger-records";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const [cmd, dir] = process.argv.slice(2);
if (!cmd || !dir) throw new Error("usage: npm run legal-miss -- <setup|verify|cleanup> <dir>");
mkdirSync(dir, { recursive: true });
const stateFile = `${dir}/state.json`;
const BRANCH = "54070caa-bd79-4184-a82a-9235b1c33b64";

type Variant = { label: string; art: "A" | "B" | "C"; unit: "s3" | "s7"; kind: "bad" | "control" | "code"; miss: 1 | 2 | 3 | 0; sentence?: RegExp; make: (clean: Unit) => Unit };
const clone = (u: Unit) => structuredClone(u) as any;
const VARIANTS: Variant[] = [
  { label: "rm1-bad", art: "A", unit: "s3", kind: "bad", miss: 1, sentence: /does not mention hoarding/i,
    make: (c) => { const u = clone(c); u.blocks.splice(2, 0, { t: "p", text: "The statute does not mention hoarding." }); return u; } },
  { label: "rm3-bad", art: "A", unit: "s7", kind: "bad", miss: 3, sentence: /(health department|fire marshal)/i,
    make: (c) => { const u = clone(c); const b = u.blocks.find((x: any) => x.t === "p" && x.text.startsWith("Notice who decides.")); b.text = b.text.replace("It is a local official, such as a health officer, a code enforcement officer or a fire official, not you and not me.", "It is the county health department or the fire marshal, not you and not me."); return u; } },
  { label: "rm2-bad", art: "B", unit: "s3", kind: "bad", miss: 2, sentence: /(junk|substandard|threshold|endanger)/i,
    make: (c) => {
      const u = clone(c);
      u.blocks[0].text = u.blocks[0].text.replace(/ Even then, the law treats[^]*$/, "");                                                                                     // the threshold sentence is gone
      const b = u.blocks.find((x: any) => x.t === "p" && x.text.startsWith("California's Health and Safety Code"));
      b.text = b.text.replace("California's Health and Safety Code, section 17920.3, lists conditions that can make a building substandard.", "California law says junk, debris, garbage and pests make a building substandard.");   // a flat rule
      return u;
    } },
  { label: "control-s7", art: "B", unit: "s7", kind: "control", miss: 0, make: (c) => c },
  { label: "control-s3", art: "C", unit: "s3", kind: "control", miss: 0, make: (c) => c },
  { label: "rm3-code", art: "C", unit: "s7", kind: "code", miss: 3, sentence: /health officer or the fire official/i,
    make: (c) => { const u = clone(c); const b = u.blocks.find((x: any) => x.t === "p" && x.text.startsWith("Notice who decides.")); b.text = b.text.replace("It is a local official, such as a health officer, a code enforcement officer or a fire official, not you and not me.", "It is the health officer or the fire official, not you and not me."); return u; } },
];

if (cmd === "setup") {
  const real = (await db.from("briefs").select("outline,evidence_packet").eq("opportunity_id", "1d78c9e3-6b2d-4434-88ed-56b905e67c24").single()).data!;
  const clean: Record<string, Unit> = {};
  for (const key of ["s3", "s7"]) {
    const { data: sec } = await db.from("article_sections").select("locked_version_id").eq("article_id", BRANCH).eq("section_key", key).single();
    clean[key] = (await db.from("section_versions").select("content").eq("id", sec!.locked_version_id).single()).data!.content as Unit;
  }
  const state: any = { arts: [], variants: {} };
  const artIds: Record<string, string> = {};
  const meta = STUDIO_AGENT_META["thb-04-section-writer"];
  for (const A of ["A", "B", "C"] as const) {
    const o = await db.from("opportunities").insert({ title: "LEGAL-MISS fixture (delete me)", state: "BRIEF_REVIEW", human_decision: "approve", version_hash: "legal-miss" }).select("id").single();
    const opp = o.data!.id as string;
    await db.from("briefs").insert({ opportunity_id: opp, outline: real.outline, evidence_packet: real.evidence_packet, notes: "legal-miss fixture" });
    const ab = await approveBrief(db, opp, "smoke-test");
    if (!ab.ok) throw new Error(ab.reason);
    const art = (ab as any).articleId as string;
    await db.from("articles").update({ is_fixture: true }).eq("id", art);
    await copyLedgerRecords(db, art);                      // gates kept: the carried-gate check is part of the real behavior
    artIds[A] = art; state.arts.push({ opp, art });
    writeFileSync(stateFile, JSON.stringify(state));
  }
  for (const v of VARIANTS) {
    const art = artIds[v.art];
    const u = v.make(clean[v.unit]);
    const { runId } = await queueStudioRun(db, "thb-04-section-writer", art, v.unit);
    const body = { article_id: art, opportunity_id: state.arts[0].opp, agent_name: "Section Writer", agent_prompt_version: meta.promptVersion, model_version: "claude-code/legal-miss-fixture", input_version_ids: ["fixture"], decision: "PASS", findings: [], evidence_ids: [], required_actions: [], output_version_id: `fixture-${v.label}`, timestamp: new Date().toISOString(), result: { unit_key: v.unit, unit: u, addresses: [], change_note: `legal-miss fixture ${v.label}`, declines: [] } };
    const opp = (await db.from("articles").select("opportunity_id").eq("id", art).single()).data!.opportunity_id;
    body.opportunity_id = opp;
    const res = await submitStudio(db, runId, JSON.stringify(body));
    if (!res.ok) throw new Error(`${v.label}: the fixture writer was refused: ${res.errors.join(" | ")}`);
    const st = stateOf((await load(db, art)).sections.find((s) => s.section_key === v.unit));
    console.log(`${v.label.padEnd(11)} ${v.art}.${v.unit}: ${st.status}${st.issues.length ? ` issues ${st.issues.map((i) => i.key).join(",")}` : ""}${st.blockedBy ? ` BLOCKED BY CODE: ${st.blockedBy.slice(0, 120)}` : ""}; flags ${(st.hedges ?? []).filter((h) => (h as any).legal?.length).length} legal / ${(st.hedges ?? []).length} total`);
    state.variants[v.label] = { art, unit: v.unit, status: st.status };
    if (st.status === "NEEDS_FACT") {
      const q = await queueStudioRun(db, CLASSIC_V1_KEY, art, v.unit);
      const { data: run } = await db.from("agent_runs").select("task_packet").eq("id", q.runId).single();
      writeFileSync(`${dir}/${v.label}-packet.json`, JSON.stringify({ run_id: q.runId, attempts_used: 0, last_error: null, ...run!.task_packet }, null, 2));
      state.variants[v.label].runId = q.runId;
    }
  }
  writeFileSync(stateFile, JSON.stringify(state));
  console.log(`setup done: ${Object.values(state.variants).filter((x: any) => x.runId).length} V1 runs queued, ${Object.values(state.variants).filter((x: any) => !x.runId).length} caught or held by code`);
} else if (cmd === "verify") {
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  const rows: any[] = [];
  for (const v of VARIANTS) {
    const slot = state.variants[v.label];
    const sec = (await load(db, slot.art)).sections.find((s: any) => s.section_key === v.unit);
    const st = stateOf(sec);
    const out = existsSync(`${dir}/${v.label}-out.json`) ? JSON.parse(readFileSync(`${dir}/${v.label}-out.json`, "utf8")) : null;
    const findings: any[] = out?.findings ?? [];
    const rulings: any[] = out?.result?.hedge_rulings ?? [];
    const sentenceOf = new Map((st.hedges ?? []).map((h: any) => [h.key, h.sentence]));
    const cites = (s: string) => !!v.sentence && v.sentence.test(s);
    const citedFindings = findings.filter((f) => f.severity === "required" && cites(f.note));
    const citedRulings = rulings.filter((r) => (r.ruling === "reword" || r.ruling === "drop") && cites(String(sentenceOf.get(r.key) ?? "")));
    const claimChecks = (out?.result?.claim_checks ?? []).filter((c: any) => c.quote_comparison && c.quote_comparison !== "MATCH");
    const codeIssues = st.issues.filter((i: any) => i.key.startsWith("det:"));
    let ok = false, how = "";
    if (v.kind === "control") { ok = out?.decision === "PASS"; how = `V1 ${out?.decision ?? "has not reviewed"}${(out?.findings ?? []).filter((f: any) => f.severity === "required").length ? ` with ${(out?.findings ?? []).filter((f: any) => f.severity === "required").length} required finding(s)` : ""}`; }
    else if (v.kind === "code") { ok = codeIssues.some((i: any) => /LEGAL_DECIDER_CLOSED/.test(i.key + i.text)) || st.status !== "NEEDS_FACT"; how = `unit ${st.status} by code, V1 not needed; issues: ${st.issues.map((i: any) => i.key).join(", ")}`; }
    else { ok = !!out && out.decision !== "PASS" && (citedFindings.length > 0 || citedRulings.length > 0 || claimChecks.length > 0); how = `V1 ${out?.decision ?? "has not reviewed"}; cites the sentence: ${citedFindings.length + citedRulings.length > 0 ? "yes" : "no"}; non-MATCH quote comparisons: ${claimChecks.map((c: any) => `${c.claim_id} ${c.quote_comparison}/${c.reader_impact}`).join(", ") || "none"}`; }
    rows.push({ label: v.label, miss: v.miss, kind: v.kind, unit: v.unit, ok, how, status: st.status, v1Decision: out?.decision ?? null, requiredFindings: findings.filter((f) => f.severity === "required").map((f) => ({ key: f.issue_key, note: f.note })), rulings: rulings.map((r) => ({ ruling: r.ruling, sentence: sentenceOf.get(r.key), note: r.note })), nonMatch: claimChecks });
  }
  writeFileSync(`${dir}/result.json`, JSON.stringify(rows, null, 2));
  for (const r of rows) console.log(`${r.ok ? (r.kind === "control" ? "PASS (control)" : "CAUGHT") : r.kind === "control" ? "FALSE ALARM" : "MISSED"}  ${r.label.padEnd(11)} ${r.unit}: ${r.how}${r.requiredFindings[0] ? `\n      "${String(r.requiredFindings[0].note).slice(0, 170)}"` : ""}`);
  const bad = rows.filter((r) => !r.ok);
  console.log(bad.length ? `${bad.length} not as expected: ${bad.map((r) => r.label).join(", ")}` : "all three misses caught, controls pass");
  if (bad.length) process.exitCode = 2;
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
