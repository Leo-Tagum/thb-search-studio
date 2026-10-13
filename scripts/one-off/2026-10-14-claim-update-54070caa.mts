/* eslint-disable @typescript-eslint/no-explicit-any -- DB rows in a one-off script */
// One-off, owner-approved ledger change for ONE branch (Leo, 2026-10-13): legal accuracy, missing statutory threshold and decider.
// Adds clm:8 (H&S 17920.3 opening paragraph threshold) and updates clm:2 and clm:3 (code enforcement officer alternative).
// Every quote below was compared word for word with the authenticated leginfo print Leo stored on 2026-10-10 (evidence source 6904fefb…, HSC_17920.3.pdf).
// The live site returned HTTP 403 to automated fetches on 2026-10-13; Leo will print the sections again before publishing for a fresh date.
// The branch now intentionally differs from the original on clm:2, clm:3 and clm:8 (the branch-integrity check in branch.ts will report that; it is not loosened).
//   npx tsx --env-file=.env.local scripts/one-off/2026-10-14-claim-update-54070caa.mts          (checks only)
//   npx tsx --env-file=.env.local scripts/one-off/2026-10-14-claim-update-54070caa.mts --apply  (applies, once)
import { createClient } from "@supabase/supabase-js";
import { sha256 } from "../../src/lib/studio/hash";

const BRANCH = "54070caa-bd79-4184-a82a-9235b1c33b64";
const ORIGINAL = "e2b915e3-af97-4ea6-8979-4861ec729027";
const VERSION_PREFIX = "43cf7d36afd0";
const SOURCE = "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=17920.3&lawCode=HSC";
const CHECKED = "2026-10-13";
const REASON = "legal accuracy: missing statutory threshold and decider";
const apply = process.argv.includes("--apply");

const NEW: Record<string, { text: string; quote: string; section: string }> = {
  "clm:8": {
    text: "Under H&S 17920.3 (opening paragraph), a building in which a listed condition exists to an extent that endangers the life, limb, health, property, safety, or welfare of the occupants of the building, nearby residents, or the public is deemed a substandard building.",
    quote: "in which there exists any of the following listed conditions to an extent that endangers the life, limb, health, property, safety, or welfare of the occupants of the building, nearby residents, or the public shall be deemed and hereby is declared to be a substandard building",
    section: "H&S 17920.3, opening paragraph (before subdivision (a))",
  },
  "clm:2": {
    text: "H&S 17920.3(a)(12) lists infestation of insects, vermin, or rodents, as determined by a health officer or, if no agreement exists with an agency that has a health officer, by a code enforcement officer (Penal Code 829.5) who has completed the required course of study, as a condition of inadequate sanitation.",
    quote: "(12) Infestation of insects, vermin, or rodents as determined by a health officer or, if an agreement does not exist with an agency that has a health officer, the infestation can be determined by a code enforcement officer, as defined in Section 829.5 of the Penal Code, upon successful completion of a course of study in the appropriate subject matter as determined by the local jurisdiction.",
    section: "H&S 17920.3(a)(12)",
  },
  "clm:3": {
    text: "H&S 17920.3(a)(16) lists lack of adequate garbage and rubbish storage and removal facilities, as determined by a health officer or, if no agreement exists with an agency that has a health officer, by a code enforcement officer (Penal Code 829.5), as a condition of inadequate sanitation.",
    quote: "(16) Lack of adequate garbage and rubbish storage and removal facilities, as determined by a health officer or, if an agreement does not exist with an agency that has a health officer, the lack of adequate garbage and rubbish removal facilities can be determined by a code enforcement officer as defined in Section 829.5 of the Penal Code.",
    section: "H&S 17920.3(a)(16)",
  },
};

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const refuse = (why: string): never => { console.error(`REFUSED: ${why}`); process.exit(1); };

const { data: a } = await db.from("articles").select("id,state,revision_count,version_hash,approved_hash,branch_of").eq("id", BRANCH).single();
if (!a) refuse("branch not found");
if (a!.id === ORIGINAL || !a!.branch_of) refuse("not a branch (the original article is never touched)");
if (a!.state !== "HUMAN_REVIEW") refuse(`article state is ${a!.state}, not HUMAN_REVIEW`);
if (!String(a!.version_hash).startsWith(VERSION_PREFIX)) refuse(`version is ${String(a!.version_hash).slice(0, 12)}, not ${VERSION_PREFIX}`);
if (a!.approved_hash) refuse("the article has an approved hash");
const { count: apps } = await db.from("approvals").select("id", { count: "exact", head: true }).eq("subject_id", BRANCH);
if (apps) refuse(`${apps} approval(s) exist`);
const { data: claims } = await db.from("claims").select("*").eq("article_id", BRANCH);
const by = new Map((claims ?? []).map((c: any) => [c.claim_key, c]));
if (by.has("clm:8")) refuse("clm:8 already exists (one-time)");
for (const k of ["clm:2", "clm:3"]) if (!by.get(k) || by.get(k).claim_text === NEW[k].text) refuse(`${k} missing or already updated`);
const tpl = by.get("clm:1");
if (!tpl || tpl.source_id !== by.get("clm:2").source_id) refuse("template claim clm:1 missing or from another source");
console.log("checks passed: HUMAN_REVIEW, version " + String(a!.version_hash).slice(0, 12) + ", no approval; clm:8 absent; clm:2 and clm:3 at the old wording");
if (!apply) { console.log("dry run: nothing written. Re-run with --apply."); process.exit(0); }

const audit = async (event_type: string, detail: Record<string, unknown>) => {
  const { error } = await db.from("audit_events").insert({ actor: "leo", subject_type: "article", subject_id: BRANCH, event_type, prior_state: a!.state, new_state: a!.state, version_hash: a!.version_hash, accepted: true, detail: { approver: "leo", reason: REASON, script: "scripts/one-off/2026-10-14-claim-update-54070caa.mts", ...detail } });
  if (error) refuse(`audit row not written: ${error.message}`);
};
const verified = { verdict: "MATCH", url: SOURCE, checked: CHECKED, checked_against: "authenticated leginfo print stored 2026-10-10 (live fetch blocked, HTTP 403); fresh print by Leo pending before publishing" };

for (const k of ["clm:2", "clm:3"]) {
  const old = by.get(k);
  await audit("claim_updated", { claim: k, section: NEW[k].section, quote: NEW[k].quote, old_text: old.locked_text ?? old.claim_text, new_text: NEW[k].text, ...verified });
  const { error } = await db.from("claims").update({ claim_text: NEW[k].text, locked_text: NEW[k].text, text_hash: sha256(NEW[k].text), supporting_passage: NEW[k].quote, checked_date: CHECKED }).eq("id", old.id);
  if (error) refuse(`${k} not updated: ${error.message}`);
}
const { id: _drop, ...row } = tpl;
await audit("claim_added", { claim: "clm:8", section: NEW["clm:8"].section, quote: NEW["clm:8"].quote, new_text: NEW["clm:8"].text, ...verified });
const { error: e8 } = await db.from("claims").insert({ ...row, claim_key: "clm:8", claim_text: NEW["clm:8"].text, locked_text: NEW["clm:8"].text, text_hash: sha256(NEW["clm:8"].text), supporting_passage: NEW["clm:8"].quote, checked_date: CHECKED, effective_or_verified_date: "2025-01-01", section_key: null });
if (e8) refuse(`clm:8 not inserted: ${e8.message}`);
// The sections that will cite clm:8 list it in their brief claim ids.
for (const key of ["s3", "s7"]) {
  const { data: s } = await db.from("article_sections").select("id,claim_ids").eq("article_id", BRANCH).eq("section_key", key).single();
  if (s && !(s.claim_ids ?? []).includes("clm:8")) await db.from("article_sections").update({ claim_ids: [...(s.claim_ids ?? []), "clm:8"] }).eq("id", s.id);
}
console.log("applied: clm:2 and clm:3 updated, clm:8 added, audit rows written, s3 and s7 claim ids include clm:8");
