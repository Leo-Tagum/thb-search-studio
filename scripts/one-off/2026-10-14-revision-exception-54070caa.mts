/* eslint-disable @typescript-eslint/no-explicit-any -- DB rows in a one-off script */
// One-time, owner-approved exception to the article revision limit, for ONE branch only.
// Approved by Leo (2026-10-13 session): "one-time third-revision exception, for the s3 sentence only".
// It does NOT change REVISION_LIMIT (src/lib/orchestrator/states.ts stays 2). It sets this branch's revision_count 2 -> 1 and writes
// an append-only audit_events row (type revision_exception). The next reopen then takes the count back to 2 through the normal path.
//   npx tsx --env-file=.env.local scripts/one-off/2026-10-14-revision-exception-54070caa.mts          (checks only, writes nothing)
//   npx tsx --env-file=.env.local scripts/one-off/2026-10-14-revision-exception-54070caa.mts --apply  (applies, once)
import { createClient } from "@supabase/supabase-js";

const BRANCH = "54070caa-bd79-4184-a82a-9235b1c33b64";
const ORIGINAL = "e2b915e3-af97-4ea6-8979-4861ec729027";
const VERSION_PREFIX = "204aa5725284";
const REASON = "Remove unsupported absence-of-law sentence in s3 (V1 gap); owner-approved one-time exception";
const apply = process.argv.includes("--apply");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const refuse = (why: string): never => { console.error(`REFUSED: ${why}`); process.exit(1); };

const { data: a } = await db.from("articles").select("id,state,revision_count,version_hash,approved_hash,branch_of").eq("id", BRANCH).single();
if (!a) refuse("branch not found");
if (a!.id === ORIGINAL || !a!.branch_of) refuse("not a branch (the original article is never touched)");
if (a!.state !== "HUMAN_REVIEW") refuse(`article state is ${a!.state}, not HUMAN_REVIEW`);
if (a!.revision_count !== 2) refuse(`revision_count is ${a!.revision_count}, not 2 (exception already used or not needed)`);
if (!String(a!.version_hash).startsWith(VERSION_PREFIX)) refuse(`version is ${String(a!.version_hash).slice(0, 12)}, not ${VERSION_PREFIX}`);
if (a!.approved_hash) refuse("the article has an approved hash");
const { count: props } = await db.from("proposals").select("id", { count: "exact", head: true }).eq("article_id", BRANCH);
if (props) refuse(`${props} proposal(s) exist`);
const { count: apps } = await db.from("approvals").select("id", { count: "exact", head: true }).eq("subject_id", BRANCH);
if (apps) refuse(`${apps} approval(s) exist`);
const { count: used } = await db.from("audit_events").select("id", { count: "exact", head: true }).eq("subject_id", BRANCH).eq("event_type", "revision_exception");
if (used) refuse("a revision_exception for this branch is already on record (one-time)");

console.log(`checks passed: ${a!.state}, revision_count ${a!.revision_count}, version ${a!.version_hash.slice(0, 12)}, no proposal, no approval`);
if (!apply) { console.log("dry run: nothing written. Re-run with --apply."); process.exit(0); }

const { error: e1 } = await db.from("audit_events").insert({
  actor: "leo", subject_type: "article", subject_id: BRANCH, event_type: "revision_exception",
  prior_state: a!.state, new_state: a!.state, version_hash: a!.version_hash, accepted: true,
  detail: { approver: "leo", reason: REASON, revision_count_from: 2, revision_count_to: 1, revision_limit_unchanged: 2, scope: "this branch only", script: "scripts/one-off/2026-10-14-revision-exception-54070caa.mts" },
});
if (e1) refuse(`audit row not written: ${e1.message}`);
const { error: e2 } = await db.from("articles").update({ revision_count: 1 }).eq("id", BRANCH).eq("revision_count", 2).eq("state", "HUMAN_REVIEW");
if (e2) refuse(`count not changed after the audit row: ${e2.message}`);
console.log("applied: audit row written, revision_count 2 -> 1 for this branch only");
