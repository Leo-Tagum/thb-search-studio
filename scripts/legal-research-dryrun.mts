/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 3e stage 5: a dry run of Agent 2 and R1 on the stored official prints. NO DATABASE WRITES, no fixture rows, no article: the real agents (the
// thb-02-research-evidence and thb-r1-legal-official subagents, dispatched by the operator) get a task packet built here from the real Evidence Library
// (read-only) and the real opportunity packet (read-only); their output is validated here by the real submit checks (schema, semantic checks, legal checks,
// recheck dates) and printed next to the labels worked out by hand for the hoarder guide. Nothing is submitted, saved or queued.
//   npx tsx --env-file=.env.local scripts/legal-research-dryrun.mts prepare <dir>   writes <dir>/a2-packet.json and <dir>/r1-packet.json
//                                         then dispatch Agent 2 -> <dir>/a2-out.json and R1 -> <dir>/r1-out.json, and:
//   npx tsx --env-file=.env.local scripts/legal-research-dryrun.mts verify  <dir>   validates both outputs with the production checks
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { buildTaskPacket, semanticChecks } from "../src/lib/agents/bridge";
import { outputSchemas } from "../src/lib/agents/schemas";
import { buildTeamPacket, teamSchema, teamSchemaKey, teamSemanticChecks } from "../src/lib/team/bridge";
import { memoryStore } from "../src/lib/team/snapshots";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const [cmd, dir] = process.argv.slice(2);
if (!cmd || !dir) throw new Error("usage: legal-research-dryrun.mts <prepare|verify> <dir>");
mkdirSync(dir, { recursive: true });
const OPP = "1d78c9e3-6b2d-4434-88ed-56b905e67c24";

/** The three state prints only: the question is whether the agents can build a correct, fully recorded claim from the stored official text. */
async function library() {
  const { data: lib } = await db.from("evidence_sources").select("id,title,source_tier,jurisdiction,effective_date,retrieved_date,recheck_by,source_url,provenance_note").in("title", ["California Health & Safety Code §17920.3", "California Civil Code §1102", "California Civil Code §1102.6"]);
  const { data: pas } = await db.from("evidence_passages").select("id,source_id,passage,locator").limit(2000);
  return (lib ?? []).map((l: any) => ({ ...l, passages: (pas ?? []).filter((p: any) => p.source_id === l.id).map((p: any) => ({ passage_id: p.id, locator: p.locator, text: p.passage })) }));
}

if (cmd === "prepare") {
  const { data: o } = await db.from("opportunities").select("packet,agent_decision,human_reason,version_hash").eq("id", OPP).single();
  const lib = await library();
  const a2data = {
    candidate_packet: o!.packet, agent1_decision: o!.agent_decision, human_reason: "DRY RUN (no article, nothing is saved): research the legal points the hoarder guide needs, from the Evidence Library only. The prints stored for this run are Health and Safety Code 17920.3, Civil Code 1102 and Civil Code 1102.6.",
    evidence_library: lib,
    library_first_rule: "Use Evidence Library sources FIRST. Cite them with kind=library, library_source_id, passage_ids and a short verbatim quote. For high-risk legal claims the library is the only allowed source (standing rules SR-4 to SR-6).",
  };
  const p2 = buildTaskPacket("thb-02-research-evidence", { id: "dryrun-opportunity", versionHash: "dryrun" }, a2data, "agent-defined");
  writeFileSync(`${dir}/a2-packet.json`, JSON.stringify({ run_id: "dryrun-a2", attempts_used: 0, last_error: null, ...p2 }, null, 2));
  const ticket = {
    ticket_id: "T1", ticket_type: "EVIDENCE_REQUEST", from: "V1", to: "R1", severity: "must fix", section: "s3",
    issue: "DRY RUN. V1 asks R1 to prove, from the stored official prints only: (1) when a listed condition in H&S 17920.3 makes a building substandard (what threshold the section puts on every listed condition); (2) who determines infestation under 17920.3(a)(12); (3) whether Civil Code 1102(c) makes a waiver of the disclosure requirements void. Answer each as its own claim with the full record, or say which official print Leo must supply.",
    note: "A claim that no print supports stays unsupported; never guess.",
  };
  const r1 = buildTeamPacket("R1", { articleId: "dryrun-article", opportunityId: "dryrun-opportunity", unitKey: "s3", versionHash: "dryrun", ticketId: "T1" }, { ticket, evidence_library: lib, library_first_rule: a2data.library_first_rule });
  writeFileSync(`${dir}/r1-packet.json`, JSON.stringify({ run_id: "dryrun-r1", attempts_used: 0, last_error: null, ...r1 }, null, 2));
  console.log(`prepared: library of ${lib.length} prints (${lib.reduce((n, l) => n + l.passages.length, 0)} passages); a2-packet.json and r1-packet.json written; nothing saved`);
} else if (cmd === "verify") {
  const lib = await library();
  const { data: pas } = await db.from("evidence_passages").select("id,source_id,passage").limit(4000);
  const libraryPassages = new Map((pas ?? []).map((p: any) => [p.id, { source_id: p.source_id, text: p.passage }]));
  const { data: srcs } = await db.from("evidence_sources").select("id,recheck_by");
  const librarySources = new Map((srcs ?? []).map((s: any) => [s.id, { recheck_by: s.recheck_by ?? null }]));
  const legal = { librarySources };
  const show = (name: string, out: any, errs: string[]) => {
    console.log(`\n=== ${name}: decision ${out.decision}; ${errs.length ? `REFUSED by the production checks (${errs.length})` : "ACCEPTED by the production checks"}`);
    for (const e of errs.slice(0, 12)) console.log(`   - ${e.slice(0, 260)}`);
    for (const c of out.result.claims ?? []) {
      const v = c.verification;
      console.log(`   ${c.id} [${c.support}, ${c.risk}] ${c.section ?? "(no section)"} ${v ? `${v.label}/impact ${v.reader_impact}` : "(no verification)"}${c.claim_type === "statute_absence" ? " [absence]" : ""}\n      claim: ${String(c.text).slice(0, 230)}\n      gates: ${(c.gates ?? []).map((g: any) => `${g.kind}${g.carried_by ? "->" + g.carried_by : g.stated_in_claim ? " (stated)" : " (NOT stated)"}`).join("; ") || "none"}${v?.reason ? `\n      reason: ${String(v.reason).slice(0, 200)}` : ""}`);
    }
    for (const u of out.result.unresolved ?? []) console.log(`   unresolved: ${String(u).slice(0, 220)}`);
  };
  const a2File = `${dir}/a2-out.json`;
  if (existsSync(a2File)) {
    const out = JSON.parse(readFileSync(a2File, "utf8"));
    const p = outputSchemas["thb-02-research-evidence"].safeParse(out);
    const packet = JSON.parse(readFileSync(`${dir}/a2-packet.json`, "utf8"));
    const errs = p.success ? semanticChecks("thb-02-research-evidence", p.data as Record<string, any>, { packet, libraryPassages, legal }) : p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    show("Agent 2", out, errs);
  }
  const r1File = `${dir}/r1-out.json`;
  if (existsSync(r1File)) {
    const out = JSON.parse(readFileSync(r1File, "utf8"));
    const key = teamSchemaKey("R1", out);
    const p = teamSchema(key).safeParse(out);
    const packet = JSON.parse(readFileSync(`${dir}/r1-packet.json`, "utf8"));
    const errs = p.success ? await teamSemanticChecks("R1", p.data, { packet, legacy: { libraryPassages, legal } as any, snapshotStore: memoryStore() } as any) : p.error.issues.map((i: any) => `${i.path.join(".")}: ${i.message}`);
    show("R1", out, errs);
  }
  void lib;
} else throw new Error(`unknown command ${cmd}`);
