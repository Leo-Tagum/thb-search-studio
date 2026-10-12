/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 3d verification. READ-ONLY: prints real numbers and checks the invariants of Phase 3c and Phase 3d against the live state. Exit code 1 on any FAIL.
// It replaces the Phase 3c verify script that was never written: the Phase 3c invariants (migrations, branches, the untouched original) are checked here too.
//   npm run verify:phase3d
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { fingerprint } from "../src/lib/studio/branch";
import { stateOf } from "../src/lib/studio/service";
import { V1_PROMPT_VERSION, STUDIO_AGENT_META } from "../src/lib/studio/agents";
import { TEAM_PROMPT_VERSIONS } from "../src/lib/team/bridge";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = (cmd: string) => { try { return execSync(cmd, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }); } catch (e: any) { return `${e.stdout ?? ""}${e.stderr ?? ""}`; } };
let fails = 0;
const check = (ok: boolean, what: string, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`); if (!ok) fails++; };

const ORIGINAL = "e2b915e3-af97-4ea6-8979-4861ec729027";
const TEAM_BRANCH = "d7f03fff-22d0-48fe-9ee0-3d6d5102c856";
const CLASSIC_BRANCH = "54070caa-bd79-4184-a82a-9235b1c33b64";

// ---- code and tests ----
const branch = run("git rev-parse --abbrev-ref HEAD").trim(), head = run("git rev-parse --short HEAD").trim(), dirty = run("git status --porcelain").split("\n").filter((l) => l && !l.startsWith("warning")).length;
console.log(`git: branch ${branch}, HEAD ${head}, ${dirty} uncommitted path(s)`);
const vtFile = `${tmpdir()}/phase3d-vitest-${process.pid}.json`;
run(`npx vitest run --reporter=json --outputFile="${vtFile}"`);
const vt = JSON.parse(readFileSync(vtFile, "utf8")) as any;
check(vt.numFailedTests === 0, "Vitest", `${vt.numPassedTests} passed, ${vt.numFailedTests} failed, ${vt.testResults.length} files`);
const byFile = (re: RegExp) => { const f = vt.testResults.filter((t: any) => re.test(t.name)); const all = f.flatMap((t: any) => t.assertionResults); return `${all.filter((x: any) => x.status === "passed").length} of ${all.length}`; };
console.log(`  declines (module, classic, team 6.1):        ${byFile(/studio[\\/](declines|classic-declines)\.test/)}`);
console.log(`  V1 gate, Agent 5 audit, escalation:          ${byFile(/studio[\\/]v1-gate\.test/)}`);
console.log(`  adversarial fixtures:                        ${byFile(/studio[\\/]adversarial\.test/)}`);

// ---- migrations: 0015-0019 only (Phase 3d adds none) ----
const migs = readdirSync("supabase/migrations").filter((f) => /^\d{4}_/.test(f)).sort();
check(migs.at(-1)?.startsWith("0019_") === true, "no migration after 0019 (Phase 3d adds none)", migs.at(-1));

// ---- prompt versions: files and code agree; only the declines roles moved ----
const fileVersion = (f: string) => /^prompt_version:\s*(\S+)/m.exec(readFileSync(`.claude/agents/${f}.md`, "utf8"))?.[1];
const moved = [...Object.entries(STUDIO_AGENT_META).filter(([, m]) => m.promptVersion !== "1.0.0").map(([k]) => k), ...Object.entries(TEAM_PROMPT_VERSIONS).filter(([, v]) => v !== "1.0.0").map(([r]) => r)];
check(fileVersion("thb-v1-fact-privacy") === V1_PROMPT_VERSION, "the V1 file carries the version the code demands", V1_PROMPT_VERSION);
console.log(`  roles at 1.1.0 (declines wording only): ${moved.join(", ")}`);

// ---- the original article, untouched ----
const { data: orig } = await db.from("articles").select("id,state,version_hash,pipeline_mode,is_fixture").eq("id", ORIGINAL).single();
const fp = await fingerprint(db, ORIGINAL);
check(orig?.state === "HUMAN_REVIEW" && orig?.version_hash?.startsWith("4db42fea93cc") === true, "original article: HUMAN_REVIEW, version 4db42fea93cc", `${orig?.state} ${orig?.version_hash?.slice(0, 12)}`);
check(fp.total.startsWith("23f8dd72") && fp.total.endsWith("4611"), "original article fingerprint is 23f8dd72…4611", `${fp.total.slice(0, 8)}…${fp.total.slice(-4)}`);

// ---- the two Phase 3c branches ----
for (const [name, id] of [["team branch", TEAM_BRANCH], ["classic-revision branch", CLASSIC_BRANCH]] as const) {
  const { data: a } = await db.from("articles").select("state,version_hash,pipeline_mode,branch_of,is_fixture").eq("id", id).maybeSingle();
  check(!!a && a.branch_of === ORIGINAL && a.is_fixture === false, `${name} exists and is a real branch of the original`, a ? `${a.state} ${a.version_hash?.slice(0, 12)} ${a.pipeline_mode}` : "missing");
}

// ---- Phase 3d invariants over every article ----
const { data: arts } = await db.from("articles").select("id,title,state,pipeline_mode,is_fixture");
let gated = 0, legacyLocked = 0, bad = 0, declines = 0, escalated = 0;
for (const a of arts ?? []) {
  if (a.pipeline_mode === "team") continue;
  const { data: secs } = await db.from("article_sections").select("*").eq("article_id", a.id);
  for (const s of secs ?? []) {
    const st = stateOf(s);
    declines += (st.declines ?? []).length;
    if (st.status === "ESCALATED") escalated++;
    if (st.status !== "LOCKED") continue;
    if (st.gate === "v1") { gated++; if (st.v1Passed?.hash !== st.lockedHash) { bad++; console.log(`  VIOLATION: ${a.id} ${st.key} is locked without a V1 pass on the locked hash`); } }
    else legacyLocked++;
  }
}
check(bad === 0, "no V1-gated classic unit is locked without a V1 pass on its exact locked content", `${gated} gated and locked, ${bad} violations`);
console.log(`  locked before the gate existed (grandfathered, not retroactive): ${legacyLocked}; writer declines stored: ${declines}; units escalated to Leo now: ${escalated}`);
const fixtures = (arts ?? []).filter((a) => a.is_fixture).length;
check(fixtures === 0, "no fixture article left behind by the smokes", `${fixtures} found`);
for (const a of (arts ?? []).filter((x) => !x.is_fixture)) console.log(`  article ${a.id} ${a.pipeline_mode} ${a.state}  ${a.title.slice(0, 50)}`);

// ---- the live agent runs of Phase 3d ----
const { data: runs } = await db.from("agent_runs").select("agent_key,status").eq("agent_key", "thb-v1-fact-privacy");
console.log(`  V1 runs in the database: ${(runs ?? []).length} (${["SUBMITTED", "QUEUED", "FAILED"].map((s) => `${s} ${(runs ?? []).filter((r: any) => r.status === s).length}`).join(", ")})`);
console.log(existsSync("docs/phases/phase-3d-hybrid.md") ? "  docs/phases/phase-3d-hybrid.md exists" : "  docs/phases/phase-3d-hybrid.md not written yet");
console.log(fails ? `\n${fails} CHECK(S) FAILED` : "\nall checks passed");
process.exitCode = fails ? 1 : 0;
