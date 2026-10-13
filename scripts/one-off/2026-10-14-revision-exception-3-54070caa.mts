// Third one-time, owner-approved exception to the article revision limit, for ONE branch only (Leo, 2026-10-13).
// Reason: legal accuracy: FAQ 3 missing statutory threshold (FAQ answer 3 cites clm:8 and states the threshold).
// It does NOT change REVISION_LIMIT (src/lib/orchestrator/states.ts stays 2). It sets this branch's revision_count 2 -> 1, supersedes the open
// proposal 01a193a4… (written for version d559196108e0, which the corrected version replaces) in a logged step, and writes append-only audit rows.
//   npx tsx --env-file=.env.local scripts/one-off/2026-10-14-revision-exception-3-54070caa.mts          (checks only)
//   npx tsx --env-file=.env.local scripts/one-off/2026-10-14-revision-exception-3-54070caa.mts --apply  (applies, once)
import { createClient } from "@supabase/supabase-js";

const BRANCH = "54070caa-bd79-4184-a82a-9235b1c33b64";
const ORIGINAL = "e2b915e3-af97-4ea6-8979-4861ec729027";
const VERSION_PREFIX = "d559196108e0";
const PROPOSAL = "01a193a4-05c5-471e-9a3c-32590523923d";
const REASON = "legal accuracy: FAQ 3 missing statutory threshold";
const apply = process.argv.includes("--apply");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const refuse = (why: string): never => { console.error(`REFUSED: ${why}`); process.exit(1); };

const { data: a } = await db.from("articles").select("id,state,revision_count,version_hash,approved_hash,branch_of").eq("id", BRANCH).single();
if (!a) refuse("branch not found");
if (a!.id === ORIGINAL || !a!.branch_of) refuse("not a branch (the original article is never touched)");
if (a!.state !== "HUMAN_REVIEW") refuse(`article state is ${a!.state}, not HUMAN_REVIEW`);
if (a!.revision_count !== 2) refuse(`revision_count is ${a!.revision_count}, not 2`);
if (!String(a!.version_hash).startsWith(VERSION_PREFIX)) refuse(`version is ${String(a!.version_hash).slice(0, 12)}, not ${VERSION_PREFIX}`);
if (a!.approved_hash) refuse("the article has an approved hash");
const { count: apps } = await db.from("approvals").select("id", { count: "exact", head: true }).eq("subject_id", BRANCH);
if (apps) refuse(`${apps} approval(s) exist`);
const { data: props } = await db.from("proposals").select("id,status,article_version_id").eq("article_id", BRANCH);
const other = (props ?? []).filter((p: any) => p.id !== PROPOSAL && p.status === "OPEN");
if (other.length) refuse(`unexpected open proposal(s): ${other.map((p: any) => p.id).join(", ")}`);
const open = (props ?? []).find((p: any) => p.id === PROPOSAL);
if (!open || open.status !== "OPEN") refuse(`proposal ${PROPOSAL} is not open (${open?.status ?? "missing"})`);
const { count: used } = await db.from("audit_events").select("id", { count: "exact", head: true }).eq("subject_id", BRANCH).eq("event_type", "revision_exception").contains("detail", { reason: REASON });
if (used) refuse("a revision_exception with this reason is already on record (one-time)");

console.log(`checks passed: ${a!.state}, revision_count ${a!.revision_count}, version ${a!.version_hash.slice(0, 12)}, no approval, proposal ${PROPOSAL} open`);
if (!apply) { console.log("dry run: nothing written. Re-run with --apply."); process.exit(0); }

const audit = async (event_type: string, detail: Record<string, unknown>) => {
  const { error } = await db.from("audit_events").insert({ actor: "leo", subject_type: "article", subject_id: BRANCH, event_type, prior_state: a!.state, new_state: a!.state, version_hash: a!.version_hash, accepted: true, detail: { approver: "leo", reason: REASON, script: "scripts/one-off/2026-10-14-revision-exception-3-54070caa.mts", ...detail } });
  if (error) refuse(`audit row not written: ${error.message}`);
};
await audit("revision_exception", { revision_count_from: 2, revision_count_to: 1, revision_limit_unchanged: 2, scope: "this branch only", exception_number: 3 });
const { error: e1 } = await db.from("articles").update({ revision_count: 1 }).eq("id", BRANCH).eq("revision_count", 2).eq("state", "HUMAN_REVIEW");
if (e1) refuse(`count not changed after the audit row: ${e1.message}`);
await audit("proposal_superseded", { proposal: PROPOSAL, note: "superseded by Leo's decision: the corrected version replaces it; no approval had been recorded" });
const { error: e2 } = await db.from("proposals").update({ status: "SUPERSEDED" }).eq("id", PROPOSAL).eq("status", "OPEN");
if (e2) refuse(`proposal not superseded: ${e2.message}`);
console.log("applied: audit rows written, revision_count 2 -> 1 for this branch only, proposal superseded");
