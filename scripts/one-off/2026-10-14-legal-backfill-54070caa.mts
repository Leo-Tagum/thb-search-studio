/* eslint-disable @typescript-eslint/no-explicit-any -- DB rows in a one-off script */
// One-off backfill of the legal-claim verification record (migration 0020) for ONE branch: 54070caa… (the hoarder guide, hybrid branch). Leo, 2026-10-13.
// The original article e2b915e3… is NEVER touched (its claim rows are part of its fingerprint 23f8dd72…4611), and neither is the team comparison branch.
// Every quote was compared word for word with the authenticated leginfo prints Leo stored on 2026-10-10 (evidence library PDFs); the live site blocks automated fetches (HTTP 403).
// clm:1 is backfilled with reader_impact "changes" until FAQ answer 3 cites clm:8; a follow-up step then sets it to "none".
//   npx tsx --env-file=.env.local scripts/one-off/2026-10-14-legal-backfill-54070caa.mts          (checks only)
//   npx tsx --env-file=.env.local scripts/one-off/2026-10-14-legal-backfill-54070caa.mts --apply  (applies, once)
//   npx tsx --env-file=.env.local scripts/one-off/2026-10-14-legal-backfill-54070caa.mts --clm1-none   (after the FAQ fix: clm:1 reader_impact -> none)
import { createClient } from "@supabase/supabase-js";

const BRANCH = "54070caa-bd79-4184-a82a-9235b1c33b64";
const ORIGINAL = "e2b915e3-af97-4ea6-8979-4861ec729027";
const CHECKED = "2026-10-13";
const AGAINST = "authenticated leginfo print stored 2026-10-10 (evidence library PDF); live fetch blocked, HTTP 403, 2026-10-13; Leo's fresh print pending before publishing";
const THRESHOLD = "to an extent that endangers the life, limb, health, property, safety, or welfare of the occupants of the building, nearby residents, or the public";
const gateThreshold = { kind: "threshold", text: THRESHOLD, stated_in_claim: false, carried_by: "clm:8" };

type Row = { label: "MATCH" | "NARROWER"; section: string; quote: string; reason: string; gates: Record<string, unknown>[]; impact: "none" | "changes" };
const ROWS: Record<string, Row> = {
  "clm:1": { label: "NARROWER", section: "H&S 17920.3(j)", impact: "changes",
    quote: "(j) Those premises on which an accumulation of weeds, vegetation, junk, dead organic matter, debris, garbage, offal, rodent harborages, stagnant water, combustible materials, and similar materials or conditions constitute fire, health, or safety hazards.",
    reason: "Subset of the materials listed in (j) (junk, debris, garbage and similar materials); the threshold of the opening paragraph is carried by clm:8. reader_impact stays 'changes' until FAQ answer 3 cites clm:8.", gates: [gateThreshold] },
  "clm:2": { label: "MATCH", section: "H&S 17920.3(a)(12)", impact: "none",
    quote: "(12) Infestation of insects, vermin, or rodents as determined by a health officer or, if an agreement does not exist with an agency that has a health officer, the infestation can be determined by a code enforcement officer, as defined in Section 829.5 of the Penal Code, upon successful completion of a course of study in the appropriate subject matter as determined by the local jurisdiction.",
    reason: "Updated 2026-10-13 to include the code enforcement officer alternative; the opening-paragraph threshold is carried by clm:8.", gates: [{ kind: "alternative_decider", text: "code enforcement officer (Penal Code 829.5) when no agreement exists with an agency that has a health officer", stated_in_claim: true }, gateThreshold] },
  "clm:3": { label: "MATCH", section: "H&S 17920.3(a)(16)", impact: "none",
    quote: "(16) Lack of adequate garbage and rubbish storage and removal facilities, as determined by a health officer or, if an agreement does not exist with an agency that has a health officer, the lack of adequate garbage and rubbish removal facilities can be determined by a code enforcement officer as defined in Section 829.5 of the Penal Code.",
    reason: "Updated 2026-10-13 to include the code enforcement officer alternative; the opening-paragraph threshold is carried by clm:8.", gates: [{ kind: "alternative_decider", text: "code enforcement officer (Penal Code 829.5) when no agreement exists with an agency that has a health officer", stated_in_claim: true }, gateThreshold] },
  "clm:4": { label: "MATCH", section: "H&S 17920.3(h)", impact: "none",
    quote: "(h) Any building or portion thereof, device, apparatus, equipment, combustible waste, or vegetation that, in the opinion of the chief of the fire department or the chief's deputy, is in such a condition as to cause a fire or explosion or provide a ready fuel to augment the spread and intensity of fire or explosion arising from any cause.",
    reason: "Faithful paraphrase of the combustible waste and vegetation part; the opening-paragraph threshold is carried by clm:8.", gates: [gateThreshold] },
  "clm:5": { label: "MATCH", section: "Civil Code 1102.6(a)", impact: "none",
    quote: "(a) The disclosures required by this article pertaining to the property proposed to be transferred are set forth in, and shall be made on a copy of, the following disclosure form:",
    reason: "The official section names the form only through its notice: \"NOTICE OF INCOMPLETE TEXT: The Real Estate Transfer Disclosure Statement appears in the published bill. See Sec. 25, Chapter 370 (pp. 34-38), Statutes of 2020.\"", gates: [] },
  "clm:6": { label: "NARROWER", section: "Civil Code 1102(a)", impact: "none",
    quote: "(a) Except as provided in Section 1102.2, this article applies to any transfer by sale, exchange, real property sales contract as defined in Section 2985, lease with an option to purchase, any other option to purchase, or ground lease coupled with improvements of any single-family residential property.",
    reason: "Leo's ruling 2026-10-13: 'sale' only is accepted for a guide written for sellers; the omitted transfer types do not change what its reader would believe or do. The article uses the statute's own words ('single-family residential property') and does not interpret them.",
    gates: [{ kind: "scope", text: "also exchange, real property sales contract as defined in Section 2985, lease with an option to purchase, any other option to purchase, or ground lease coupled with improvements", stated_in_claim: false }, { kind: "exception", text: "Except as provided in Section 1102.2", stated_in_claim: true }] },
  "clm:7": { label: "MATCH", section: "Civil Code 1102(c)", impact: "none",
    quote: "(c) Any waiver of the requirements of this article is void as against public policy.", reason: "Word for word.", gates: [] },
  "clm:8": { label: "MATCH", section: "H&S 17920.3, opening paragraph (before subdivision (a))", impact: "none",
    quote: "in which there exists any of the following listed conditions to an extent that endangers the life, limb, health, property, safety, or welfare of the occupants of the building, nearby residents, or the public shall be deemed and hereby is declared to be a substandard building",
    reason: "Added 2026-10-13; the threshold for every listed condition in 17920.3.", gates: [] },
};

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const refuse = (why: string): never => { console.error(`REFUSED: ${why}`); process.exit(1); };
if ((BRANCH as string) === ORIGINAL) refuse("never the original");
const { data: a } = await db.from("articles").select("id,branch_of,state").eq("id", BRANCH).single();
if (!a || !a.branch_of) refuse("not a branch");
const { data: claims } = await db.from("claims").select("id,claim_key,verification_label,reader_impact").eq("article_id", BRANCH);
const by = new Map((claims ?? []).map((c: any) => [c.claim_key, c]));

if (process.argv.includes("--clm1-none")) {
  const c = by.get("clm:1");
  if (!c || c.reader_impact !== "changes") refuse("clm:1 is not at reader_impact 'changes'");
  const reason = "threshold carried by clm:8; all citing units cite clm:8";
  await db.from("audit_events").insert({ actor: "leo", subject_type: "article", subject_id: BRANCH, event_type: "claim_verification_updated", accepted: true, detail: { claim: "clm:1", reader_impact_from: "changes", reader_impact_to: "none", reason, script: "scripts/one-off/2026-10-14-legal-backfill-54070caa.mts" } });
  const { error } = await db.from("claims").update({ reader_impact: "none", verification_reason: reason }).eq("id", c.id);
  if (error) refuse(error.message);
  console.log("clm:1 reader_impact -> none"); process.exit(0);
}

for (const k of Object.keys(ROWS)) { const c = by.get(k); if (!c) refuse(`${k} missing on the branch`); if (c.verification_label) refuse(`${k} already has a verification label (one-time)`); }
console.log(`checks passed: ${Object.keys(ROWS).length} claims on the branch, none labelled yet`);
if (!process.argv.includes("--apply")) { console.log("dry run: nothing written. Re-run with --apply."); process.exit(0); }
await db.from("audit_events").insert({ actor: "leo", subject_type: "article", subject_id: BRANCH, event_type: "claims_backfilled", accepted: true, detail: { claims: Object.fromEntries(Object.entries(ROWS).map(([k, r]) => [k, { label: r.label, section: r.section, reader_impact: r.impact }])), verified_against: AGAINST, checked: CHECKED, script: "scripts/one-off/2026-10-14-legal-backfill-54070caa.mts" } });
for (const [k, r] of Object.entries(ROWS)) {
  const { error } = await db.from("claims").update({ quote_full: r.quote, section_cite: r.section, verification_label: r.label, verification_reason: r.reason, verified_against: AGAINST, gates: r.gates, reader_impact: r.impact, checked_date: CHECKED }).eq("id", by.get(k).id);
  if (error) refuse(`${k}: ${error.message}`);
}
console.log("applied: legal verification record written for clm:1-8 on the branch");
