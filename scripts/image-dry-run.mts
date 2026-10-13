/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 3e build step 8: a FIXTURE dry run of the whole image path. No database, no bucket, no real article, no model call from here, nothing saved except files in <dir>.
//   npx tsx scripts/image-dry-run.mts prepare <dir>   writes <dir>/a8-packet.json (the task packet for thb-08-image-planner: FAKE locked units, claim ledger, limits)
//        -> the operator dispatches thb-08-image-planner (output <dir>/a8-out.json), then thb-v1-fact-privacy in image-check mode (<dir>/v1-out.json)
//   npx tsx scripts/image-dry-run.mts verify <dir>    validates both outputs with the production checks; then, from the accepted plan, makes synthetic uploaded files, runs the
//        pull (checks, metadata stripping), places the images in the fixture article (text proof), builds the Approval Room payload and page (<dir>/room.html), and prints the report
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { wrapUntrusted } from "../src/lib/agents/bridge";
import { imagePlanSubmitErrors, v1ImageCheckErrors, v1ImageCheckOutput } from "../src/lib/studio/image-agents";
import { imagePlanFindings, MAX_CARDS, MAX_MUST_HAVE, type ImageCtx } from "../src/lib/studio/image-cards";
import { pullImages, buildImageVersion, type BoardWork, type PlanCardRef } from "../src/lib/studio/image-pull";
import { makeDrawnPng, makeSvg, realTextChunk, textBytes } from "../src/lib/studio/image-files.testlib";
import { buildImagesPayload, type ApprovalCard } from "../src/lib/studio/images-payload";
import { composeAuthor, composeCta, renderBody, type BrandFactRow, type Composed } from "../src/lib/studio/template";
import { sha256 } from "../src/lib/studio/hash";
import { unitText, type Draft, type Unit } from "../src/lib/studio/schema";
import type { LedgerClaim } from "../src/lib/studio/checks";

const [cmd, dir] = process.argv.slice(2);
if (!cmd || !dir) throw new Error("usage: image-dry-run.mts <prepare|verify> <dir>");
mkdirSync(dir, { recursive: true });

// ---------- the FAKE article: five sections and an FAQ, made up for this test ----------
const SENT1 = "California's Health and Safety Code lists conditions that can make a building substandard, such as junk and debris that are fire, health or safety hazards.";
const SENT2 = "The law counts them only when they endanger life, limb, health, property, safety or welfare.";
const units: Unit[] = [
  { kind: "section", key: "s1", h2: "Can you sell a packed house in California?", capsule: "Yes, you can sell a packed house in California. The route depends on who has authority, the condition and your timeline.", blocks: [{ t: "p", text: "Start with who holds title and what is owed. Then look at what the house needs." }, { t: "ol", items: ["Who has authority to sign?", "What is owed?", "What does the house need?"] }, { t: "p", text: "Your answers decide which route fits." }], claim_ids: [], roles: [] },
  { kind: "section", key: "s2", h2: "What does state law say about a packed house?", blocks: [{ t: "p", text: `${SENT1} ${SENT2}` }, { t: "p", text: "Whether a home meets them is for a local official. Ask your city or county what applies to your house." }], claim_ids: ["clm:1"], roles: [] },
  { kind: "section", key: "s3", h2: "What are your options?", blocks: [{ t: "ul", items: ["Keep the house for now", "Clear it first", "Sell it as it is"] }, { t: "p", text: "Each route costs something different in time, money or control. None of them is wrong for every family." }], claim_ids: [], roles: [] },
  { kind: "section", key: "s4", h2: "What can you do this week?", blocks: [{ t: "p", text: "List the people who can sign. Gather the paperwork. Talk to a professional." }], claim_ids: [], roles: [] },
  { kind: "section", key: "s5", h2: "How do you choose?", blocks: [{ t: "p", text: "Decide what matters most to you: speed, certainty, privacy or the highest price. Then compare the routes against that." }, { t: "p", text: "A real estate attorney or a title company can confirm who has authority to sign." }], claim_ids: [], roles: [] },
  { kind: "faq", key: "faq", items: [{ q: "Do I have to clean out first?", a: "Not always. It depends on your time, your money and who has authority to sell.", claim_ids: [] }, { q: "Who can sell the house?", a: "Whoever has legal authority to sign.", claim_ids: [] }, { q: "Can I skip the disclosure?", a: "Ask an agent or attorney how the disclosure rules apply to your sale.", claim_ids: [] }] },
];
const unitHash = (u: Unit) => sha256(JSON.stringify(u));
const unitHashes = Object.fromEntries(units.map((u) => [u.key, unitHash(u)]));
const textHash = sha256(units.map(unitText).join("\n"));
const claims = new Map<string, LedgerClaim>([["clm:1", { id: "clm:1", text: `${SENT1} ${SENT2}`, risk: "high", support: "supported", sourceId: "fx-src", sourceRecheckBy: null, jurisdiction: "California", verification: { quote: "(a) Any building or portion thereof ... in which there exists any of the following listed conditions to an extent that endangers the life, limb, health, property, safety, or welfare of the public or the occupants thereof shall be deemed and hereby is declared to be a substandard building ...", section: "H&S 17920.3", label: "MATCH", reason: null, against: "fixture print (made up)", gates: [{ kind: "threshold", text: "to an extent that endangers the life, limb, health, property, safety, or welfare", stated_in_claim: true, carried_by: null }] as any, readerImpact: "none" } }]]);
const ctx: ImageCtx = { units, unitHashes, claims };
const OPP = "dryrun-opportunity", ART = "dryrun-article";
const facts: BrandFactRow[] = [{ fact_key: "experience_total", fact_value: "25+ years of experience in Bay Area real estate", status: "approved" }, { fact_key: "industry_experience", fact_value: "Juan Diaz has been investing in Bay Area real estate since 2002", status: "approved" }, { fact_key: "homes_purchased", fact_value: "1,000+", status: "approved" }, { fact_key: "company_name", fact_value: "Twin Home Buyer", status: "approved" }];
const composed: Composed = { author: composeAuthor(facts, "https://www.twinhomebuyer.com/from-the-desk-of-juan-diaz/"), related: [], sources: [{ label: "California Legislative Information, California Health & Safety Code §17920.3", url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=17920.3&lawCode=HSC" }], cta: composeCta("https://www.twinhomebuyer.com/hoarder-houses/") };
const draft: Draft = { title: "Selling a Packed House (fixture)", slug: "fixture", units };

if (cmd === "prepare") {
  const data = {
    locked_units: units.map((u) => ({ unit_key: u.key, unit_hash: unitHashes[u.key], unit: u })),
    claim_ledger: [...claims.values()].map((c) => ({ id: c.id, text: c.text, risk: c.risk, jurisdiction: c.jurisdiction, quote: c.verification?.quote, section: c.verification?.section, label: c.verification?.label, reader_impact: c.verification?.readerImpact, gates: c.verification?.gates })),
    brand_facts: facts.map((f) => ({ key: f.fact_key, value: f.fact_value })),
    limits: { max_cards: MAX_CARDS, max_must_have: MAX_MUST_HAVE, faq_gets_no_card: true, max_words_per_overlay_line: 12 },
    note: "FIXTURE: made-up article text for a dry run. Not a real article.",
  };
  const packet = { run_id: "dryrun-a8", attempts_used: 0, last_error: null, agent_key: "thb-08-image-planner", prompt_version: "1.4.0", article_id: ART, opportunity_id: OPP, text_version_hash: textHash, input_version_ids: [textHash], instructions: "Plan the images for this fixture article as thb-08-image-planner. Write ONE JSON output (the Output shape in your prompt). Use article_id, opportunity_id and the text_version_hash from this packet; input_version_ids must contain the text_version_hash.", untrusted_data_block: wrapUntrusted(data) };
  writeFileSync(join(dir, "a8-packet.json"), JSON.stringify(packet, null, 2));
  writeFileSync(join(dir, "units.json"), JSON.stringify({ textHash, unitHashes }, null, 2));
  console.log(`prepared: ${units.length} fixture units, text hash ${textHash.slice(0, 12)}; wrote a8-packet.json (nothing saved anywhere else)`);
} else if (cmd === "v1packet") {
  const a8 = JSON.parse(readFileSync(join(dir, "a8-out.json"), "utf8"));
  const data = {
    image_plan: a8.result,
    locked_units: units.map((u) => ({ unit_key: u.key, unit_hash: unitHashes[u.key], unit: u })),
    claim_ledger: [...claims.values()].map((c) => ({ id: c.id, text: c.text, risk: c.risk, jurisdiction: c.jurisdiction, quote: c.verification?.quote, section: c.verification?.section, label: c.verification?.label, reader_impact: c.verification?.readerImpact, gates: c.verification?.gates })),
    note: "FIXTURE: made-up article text for a dry run. Not a real article.",
  };
  const packet = { run_id: "dryrun-v1", attempts_used: 0, last_error: null, agent_key: "thb-v1-fact-privacy", prompt_version: "1.6.0", mode: "IMAGE_TEXT_CHECK", article_id: ART, opportunity_id: OPP, text_version_hash: textHash, input_version_ids: [textHash], instructions: "This is an IMAGE PLAN check (see 'Image text check' in your prompt): check every card of the image_plan against the locked units and the claim ledger. Write ONE JSON output with a result that has plan_text_hash (= the text_version_hash of this packet) and card_checks. Use article_id, opportunity_id and the text_version_hash from this packet.", untrusted_data_block: wrapUntrusted(data) };
  writeFileSync(join(dir, "v1-packet.json"), JSON.stringify(packet, null, 2));
  console.log("wrote v1-packet.json");
} else if (cmd === "verify") {
  const lines: string[] = [];
  const say = (s: string) => { lines.push(s); console.log(s); };
  const a8File = join(dir, "a8-out.json");
  if (!existsSync(a8File)) throw new Error("a8-out.json is missing: dispatch thb-08-image-planner first");
  const a8 = JSON.parse(readFileSync(a8File, "utf8"));
  const planErrs = imagePlanSubmitErrors(a8, { ...ctx, agent: "thb-08-image-planner", opportunityId: OPP, articleId: ART, textVersionHash: textHash });
  say(`Agent 8 output: decision ${a8.decision}, ${a8.result?.cards?.length ?? 0} card(s), ${a8.result?.skipped_units?.length ?? 0} skipped unit(s): ${planErrs.length ? `REFUSED by the production checks (${planErrs.length})` : "ACCEPTED by the production checks"}`);
  for (const e of planErrs.slice(0, 20)) say(`   - ${e.slice(0, 300)}`);
  for (const c of a8.result?.cards ?? []) say(`   ${c.card_id} ${c.unit_key} ${c.type} [${c.priority}] "${c.purpose}"\n      overlay: ${c.text_overlay.map((l: any) => `"${l.text.slice(0, 60)}"`).join(" | ")}`);
  const direct = a8.result ? imagePlanFindings(a8.result, ctx) : [];
  say(`   direct card checks: ${direct.length} finding(s)`);
  const v1File = join(dir, "v1-out.json");
  if (existsSync(v1File)) {
    const v1 = JSON.parse(readFileSync(v1File, "utf8"));
    const sch = v1ImageCheckOutput.safeParse(v1);
    const errs = sch.success ? v1ImageCheckErrors(v1, a8.result, textHash) : sch.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    say(`V1 image text check: decision ${v1.decision}: ${errs.length ? `REFUSED (${errs.length})` : "ACCEPTED by the production checks"}`);
    for (const e of errs.slice(0, 12)) say(`   - ${e.slice(0, 300)}`);
    for (const k of v1.result?.card_checks ?? []) say(`   ${k.card_id}: overlay ${k.overlay_matches_locked_text ? "matches" : "DIFFERS"}, prompt ${k.prompt_ok ? "ok" : "NOT ok"}${k.quote_comparison ? `, quote ${k.quote_comparison}/${k.reader_impact}` : ""}`);
  } else say("V1 image text check: not run (v1-out.json missing)");
  if (planErrs.length) { writeFileSync(join(dir, "report.txt"), lines.join("\n")); say("stopping: the plan was refused, so no files are made"); process.exit(0); }

  // ---------- the rest of the path, from the accepted plan ----------
  const planned = a8.result.cards as any[];
  const refs: PlanCardRef[] = planned.map((c) => ({ card_id: c.card_id, unit_key: c.unit_key, anchor: c.anchor, card_version: 1, aspect_ratio: c.aspect_ratio, base_file_name: `dryrun_${c.unit_key}_${c.card_id.replace(":", "-")}`, alt_text: c.alt_text }));
  const files = new Map<string, Uint8Array>(); const work: BoardWork[] = [];
  planned.forEach((c, i) => {
    const w = c.aspect_ratio.width_px, h = c.aspect_ratio.height_px;
    // a different kind of REAL, viewable picture per card (drawn boxes, not photos), each carrying metadata that must be stripped (all synthetic): PNG with a text chunk, SVG with a comment and a metadata block
    const navy: [number, number, number] = [20, 33, 61], orange: [number, number, number] = [232, 89, 12];
    const rects = [0, 1, 2].flatMap((k) => [{ x: 120, y: 140 + k * 220, w: 70, h: 70, color: navy }, { x: 240, y: 160 + k * 220, w: 900 - k * 150, h: 30, color: orange }]);
    const bytes = i % 2 === 0 ? makeDrawnPng(w, h, rects, [realTextChunk("Comment\0 GPS 37.5,-122.2")]) : makeSvg(`<!-- made at 12 Main Street GPS 37.5 --><metadata>GPS 37.5,-122.2</metadata><g fill="#14213d"><rect x="100" y="140" width="380" height="620" rx="30"/><rect x="560" y="140" width="380" height="620" rx="30"/><rect x="1020" y="140" width="380" height="620" rx="30"/></g><g fill="#e8590c"><rect x="100" y="720" width="380" height="14"/><rect x="560" y="720" width="380" height="14"/><rect x="1020" y="720" width="380" height="14"/></g>`);
    files.set(`asset${i}`, bytes);
    work.push({ card_id: c.card_id, read: true, made: true, words: true, done: true, base: 0, uploads: [{ v: 1, for_card_version: 1, file_name: i % 2 === 0 ? "finished.png" : "finished.svg", date: "2026-10-14", asset_id: `asset${i}` }], uploaded_by: "Lawrence (fixture)" });
  });
  const pulled = pullImages({ articleId: ART, cards: refs, work, files });
  say(`\nPull: ${pulled.ready.length} of ${pulled.cards.length} card(s) ready`);
  for (const c of pulled.cards) say(`   ${c.card_id} ${c.status}${c.image ? ` ${c.image.width}x${c.image.height} ${c.image.mime} stripped: ${c.image.stripped.join(", ") || "nothing"}` : ""}${c.reasons.length ? ` | ${c.reasons.join("; ")}` : ""}`);
  const leak = [...pulled.files.values()].filter((b) => /GPS/.test(new TextDecoder("latin1").decode(b))).length;
  say(`   stored files that still contain the fake GPS text: ${leak}`);
  const idFor = (img: { card_id: string; sha256: string }) => `${img.sha256.slice(0, 8)}-${img.sha256.slice(8, 12)}-4${img.sha256.slice(13, 16)}-8${img.sha256.slice(17, 20)}-${img.sha256.slice(20, 32)}`;
  const v = buildImageVersion(draft, composed, pulled.ready, refs, idFor);
  say(`\nPlacement: ${v.figures} figure(s); text-only hash ${v.textOnlyHash.slice(0, 12)}, image-bearing hash ${v.hash.slice(0, 12)}; stripping the figures gives the text-only render byte for byte: ${v.html.length > v.textOnlyHtml.length ? "yes (checked in code)" : "n/a"}`);
  say(`   text-only render equals the plain render of the article: ${v.textOnlyHtml === renderBody(draft, composed)}`);
  // ---------- the Approval Room with images ----------
  const cardsForRoom: ApprovalCard[] = planned.map((c, i) => ({ ...refs[i], title: c.purpose.slice(0, 70), text_overlay: c.text_overlay, claim_ids: c.claim_ids }));
  const vision = new Map<string, string[]>(); const leo = new Map<string, { by: string; at: string; note: string }>();
  planned.forEach((c) => { /* the picture check (a model reading each image) is NOT run in this dry run: no entry in `vision` */ leo.set(c.card_id, { by: "Leo", at: "2026-10-14", note: "Looked at it: fits the section, no people, no address." }); });
  const img = buildImagesPayload({ cards: cardsForRoom, ready: pulled.ready, units, claims, vision, leoChecks: leo, imageIdFor: idFor, urlFor: (i) => `data:${i.mime};base64,${Buffer.from(pulled.files.get(i.storage_path)!).toString("base64")}`, history: [{ step: "Image plan", who: "Agent 8 (fixture dry run)", at: "2026-10-14", detail: `${planned.length} card(s) accepted by the card checks` }, { step: "Image text check", who: "V1", at: "2026-10-14", detail: existsSync(v1File) ? "overlay text and prompts checked" : "not run" }, { step: "Images made", who: "Lawrence (fixture)", at: "2026-10-14", detail: "uploaded and marked done" }, { step: "Image check", who: "Leo", at: "2026-10-14", detail: "looked at every image" }] });
  say(`\nApproval Room images block: ${img.images.length} image(s); same words as the article: ${img.images.map((i) => i.matches_locked_text).join(", ")}`);
  say(`   statement: ${img.images_statement}`);
  const payload = {
    proposal_id: "00000000-0000-0000-0000-00000000d0d0", created_at: "2026-10-14T00:00:00Z", requires_secondary: false,
    article: { id: ART, title: draft.title, slug: draft.slug, state: "HUMAN_REVIEW", kind: "CREATE (new page): FIXTURE DRY RUN, not a real article" },
    items: [{ kind: "article", label: `Article: ${draft.title}`, hash: v.hash }], html: v.html,
    sections: units.map((u) => ({ key: u.key, heading: u.kind === "faq" ? "Frequently Asked Questions" : u.h2, words: unitText(u).split(/\s+/).length, claims: u.kind === "faq" ? [] : u.claim_ids, status: "LOCKED" })),
    claims: [{ id: "clm:1", text: claims.get("clm:1")!.text, risk: "high", support: "supported", source: "fixture print (made up)", source_url: null }],
    review_summary: { reviews: 0, advisory_editorial_score_avg: null, note: "Fixture dry run: no reviews." }, open_items: ["FIXTURE: this page was built by the image dry run. Nothing here is a real article, proposal or approval."], voice_reference: null,
    top: { purpose: "A test of how images appear in the Approval Room. Not a real article.", question: "FIXTURE ONLY: do not approve." }, ...img,
  };
  writeFileSync(join(dir, "room-payload.json"), JSON.stringify(payload));
  say(`   wrote room-payload.json (${payload.html.length} chars of article HTML, version hash ${v.hash.slice(0, 12)}); build the page with: npx tsx scripts/build-approval-room.mts ${join(dir, "room-payload.json")} ${join(dir, "room.html")}`);
  writeFileSync(join(dir, "report.txt"), lines.join("\n"));
}
