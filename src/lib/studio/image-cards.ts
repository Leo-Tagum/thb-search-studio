// Phase 3e: the image plan (Agent 8 in hybrid mode, D1 in team mode): the card schema and the deterministic checks run on every submitted plan.
// The planner is READ-ONLY on the article: its strict schema has no field that could carry text, a lock, an approval or a state, and every line of text
// inside an image must be copied word for word from a named locked block (standing rules SR-11 to SR-17, docs/references/standing-rules.md).
// No database, no migration, no prompt here: schema and checks only (build step 2). Agents never replace these checks.
import { z } from "zod";
import { experienceYearViolations, pendingJuanHits, ratingRuleHits, sourcedFactViolations } from "../agents/bridge";
import { parseInline } from "./inline";
import { deciderFindings, legalKindsOf, legalRecordFindings, localNamesIn } from "./legal-flags";
import type { Finding, LedgerClaim } from "./checks";
import { unitClaimIds, unitStrings, unitText, type Unit } from "./schema";

export const IMAGE_TYPES = ["infographic", "diagram_flowchart", "checklist_graphic", "comparison_graphic", "illustration", "stock_photo", "icon_set"] as const;
export const IMAGE_PRIORITIES = ["must_have", "nice_to_have"] as const;
/** The status of a whole plan and of a card. Aligned with the image planner plan (section 2.1); migration 0021 uses the same words. */
export const IMAGE_PLAN_STATUSES = ["PLANNED", "V1_CHECKED", "ON_BOARD", "IN_PROGRESS", "ALL_DONE", "LEO_CHECKED", "STALE", "SUPERSEDED"] as const;
export const IMAGE_CARD_STATES = ["PLANNED", "V1_CHECKED", "ON_BOARD", "IN_PROGRESS", "DONE", "STALE", "SUPERSEDED"] as const;
export const MAX_CARDS = 6;
export const MAX_MUST_HAVE = 3;

const txt = (max: number) => z.string().trim().min(1).max(max);
/** Where a line comes from: "h2", "capsule", "block:<i>" (a block of a section, i from 0) or "faq:<i>:q" / "faq:<i>:a". */
const blockRef = z.string().regex(/^(h2|capsule|block:\d{1,2}|faq:\d{1,2}:[qa])$/);
export const imageCard = z.strictObject({
  card_id: z.string().regex(/^img:\d{1,2}$/),
  unit_key: z.string().regex(/^(s\d{1,2}|faq)$/),
  unit_hash: txt(100),                                   // the locked version the card was planned on; a changed hash makes the card STALE
  anchor: z.strictObject({ after: txt(200), block_index: z.number().int().min(0).max(40) }),   // the figure goes after this heading or block
  type: z.enum(IMAGE_TYPES),
  purpose: txt(300),
  designer_description: txt(1200),
  image_text: z.array(z.strictObject({ text: txt(400), source_unit: z.string().regex(/^(s\d{1,2}|faq)$/), source_block: blockRef })).max(12),
  claim_ids: z.array(z.string()).max(12),
  alt_text: txt(250),
  aspect_ratio: z.strictObject({ ratio: z.string().regex(/^\d{1,2}:\d{1,2}$/), width_px: z.number().int().min(200).max(4000), height_px: z.number().int().min(200).max(4000) }),
  priority: z.enum(IMAGE_PRIORITIES),
  privacy_notes: txt(400),
});
export type ImageCard = z.infer<typeof imageCard>;
/** The `result` of an image-plan output. Strict: `unit`, `revised_unit`, `approved`, `locked`, `state` and any other key are refused. */
export const imagePlanResult = z.strictObject({
  cards: z.array(imageCard).max(MAX_CARDS),
  skipped_units: z.array(z.strictObject({ unit_key: z.string().regex(/^(s\d{1,2}|faq)$/), reason: txt(300).refine((r) => r.length >= 8, "give a one-line reason") })).max(12),
});
export type ImagePlanResult = z.infer<typeof imagePlanResult>;

export type ImageCtx = {
  units: Unit[];                                         // the locked units
  unitHashes: Record<string, string>;                    // unit key -> locked version hash
  claims: Map<string, LedgerClaim>;                      // the claim ledger
};

// ---------- resolving "where a line comes from" ----------
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const plain = (s: string) => norm(parseInline(s).plain);

/** The separate strings of a block (a paragraph, one list item, one table cell...), reader-visible, markup stripped. Undefined if the reference does not exist. */
export function blockStrings(u: Unit, ref: string): string[] | undefined {
  if (u.kind === "faq") {
    const m = /^faq:(\d+):([qa])$/.exec(ref); if (!m) return undefined;
    const it = u.items[Number(m[1])]; return it ? [plain(m[2] === "q" ? it.q : it.a)] : undefined;
  }
  if (ref === "h2") return [plain(u.h2)];
  if (ref === "capsule") return u.capsule ? [plain(u.capsule)] : undefined;
  const m = /^block:(\d+)$/.exec(ref); if (!m) return undefined;
  const b = u.blocks[Number(m[1])]; if (!b) return undefined;
  if (b.t === "table") return [...b.headers, ...b.rows.flat()].map(plain);
  if (b.t === "ul" || b.t === "ol") return b.items.map(plain);
  if (b.t === "callout") return [...(b.text ? [b.text] : []), ...(b.items ?? [])].map(plain);
  return [plain(b.text)];
}
const sentencesOf = (s: string) => s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);

// ---------- word lists for the checks ----------
const MAP_OR_COVERAGE = /\b(maps?|skyline|landmarks?|golden gate|bay bridge|coverage|serv(?:es|ing|ice area)\s+\w+|we buy in|badges?|seals?|accredited|bbb)\b/i;
const BANNED_IMAGERY = /\b(speech bubbles?|quotation[- ]marks?|quote marks?|before[- ]and[- ]after|before\/after|testimonials?)\b/i;
const INVENTED_DATA = /\b(bar|pie|line|area)\s+(chart|graph)s?\b|\bstatistics?\b|\bpercent(age)?s?\b|\bdata points?\b/i;
const PEOPLE = /\b(faces?|people|persons?|man|woman|men|women|family|families|child|children|couple|seller|sellers|homeowners?|owners?|portrait|neighbors?|crowd)\b/i;
const NO_PEOPLE = /\b(no|without|never|nobody)\b[^.;]{0,40}\b(faces?|people|persons?|identifiable|portraits?|sellers?|homeowners?)\b[^.;]{0,30}/gi;
const IDENTIFYING = /\b(house numbers?|street numbers?|addresses|address|license plates?|licence plates?|real home|real house|actual home|actual house|client'?s? home|seller'?s? home|\d{2,5}\s+[A-Z][a-z]+\s+(?:st|street|ave|avenue|blvd|rd|road|dr|drive|way|ln|lane|ct|court)\b)/i;
const LEGAL_CUES = /\b(statute|laws?|code|section|ordinance|civil code|health (?:and|&) safety|requires?|required|prohibits?|prohibited|void|substandard|waiver|enforce\w*|officers?|officials?)\b/i;
const NUMBER = /\d[\d,.]*/g;

const F = (code: string, severity: Finding["severity"], detail: string): Finding => ({ code, severity, detail });

/** Every check on a schema-valid plan. Returns findings; an empty list means the plan may go to V1 (the model checks still follow, in V1's image-text mode). */
export function imagePlanFindings(plan: ImagePlanResult, ctx: ImageCtx): Finding[] {
  const out: Finding[] = [];
  const byKey = new Map(ctx.units.map((u) => [u.key, u]));
  const articleText = norm(ctx.units.map(unitText).join("\n"));
  const articleNumbers = new Set(articleText.match(NUMBER) ?? []);

  // proportions
  if (plan.cards.length > MAX_CARDS) out.push(F("IMAGE_TOO_MANY_CARDS", "REVISION", `${plan.cards.length} cards; the cap is ${MAX_CARDS} per article`));
  const must = plan.cards.filter((c) => c.priority === "must_have").length;
  if (must > MAX_MUST_HAVE) out.push(F("IMAGE_TOO_MANY_MUST_HAVE", "REVISION", `${must} must-have cards; the cap is ${MAX_MUST_HAVE}`));
  const half = Math.ceil(ctx.units.length / 2);
  if (plan.cards.length > half) out.push(F("IMAGE_TOO_MANY_CARDS", "REVISION", `${plan.cards.length} cards for ${ctx.units.length} units; at most about half the units get a card (${half})`));
  const seen = new Set<string>(); const ids = new Set<string>();
  for (const c of plan.cards) {
    if (ids.has(c.card_id)) out.push(F("IMAGE_DUPLICATE_CARD", "REVISION", `card id ${c.card_id} is used twice`)); ids.add(c.card_id);
    if (seen.has(c.unit_key)) out.push(F("IMAGE_ONE_PER_UNIT", "REVISION", `unit ${c.unit_key} has more than one card; the cap is one per unit`)); seen.add(c.unit_key);
    if (c.unit_key === "faq") out.push(F("IMAGE_FAQ", "REVISION", "the FAQ gets no card"));
  }
  const skipped = new Set(plan.skipped_units.map((s) => s.unit_key));
  for (const s of plan.skipped_units) { if (!byKey.has(s.unit_key)) out.push(F("IMAGE_UNKNOWN_UNIT", "REVISION", `skipped unit ${s.unit_key} is not a locked unit of this article`)); if (seen.has(s.unit_key)) out.push(F("IMAGE_SKIPPED_AND_CARDED", "REVISION", `unit ${s.unit_key} is both skipped and given a card`)); }
  for (const u of ctx.units) if (!seen.has(u.key) && !skipped.has(u.key)) out.push(F("IMAGE_UNIT_UNACCOUNTED", "REVISION", `unit ${u.key} has neither a card nor a skip reason`));

  for (const c of plan.cards) {
    const at = `${c.card_id} (${c.unit_key})`;
    const u = byKey.get(c.unit_key);
    if (!u) { out.push(F("IMAGE_UNKNOWN_UNIT", "REVISION", `${at}: unit ${c.unit_key} is not a locked unit of this article`)); continue; }
    if (ctx.unitHashes[c.unit_key] !== c.unit_hash) out.push(F("IMAGE_STALE_UNIT_HASH", "REVISION", `${at}: planned on unit hash ${c.unit_hash.slice(0, 12)}, but the locked version is ${(ctx.unitHashes[c.unit_key] ?? "unknown").slice(0, 12)}`));
    const maxIdx = u.kind === "faq" ? u.items.length - 1 : u.blocks.length - 1;
    if (c.anchor.block_index > maxIdx) out.push(F("IMAGE_BAD_ANCHOR", "REVISION", `${at}: anchor block ${c.anchor.block_index} does not exist (the unit has ${maxIdx + 1})`));

    // SR-11: text inside the image is the locked text
    const lineSentences: { text: string; legal: boolean }[] = [];
    for (const l of c.image_text) {
      const src = byKey.get(l.source_unit); const strs = src ? blockStrings(src, l.source_block) : undefined;
      if (!src || !strs) { out.push(F("IMAGE_TEXT_SOURCE_MISSING", "REVISION", `${at}: "${l.text.slice(0, 60)}" names ${l.source_unit}/${l.source_block}, which does not exist`)); continue; }
      const t = norm(l.text);
      const home = strs.find((s) => s.includes(t));
      if (!home) { out.push(F("IMAGE_TEXT_NOT_VERBATIM", "BLOCKED_CLAIM", `${at}: "${t.slice(0, 100)}" is not word for word in ${l.source_unit}/${l.source_block} (no paraphrase, no new words, no new numbers)`)); continue; }
      const legal = legalKindsOf(t).length > 0 || LEGAL_CUES.test(t);
      if (legal) {
        // SR-12: a legal line is a whole sentence, table cell or list item
        const whole = strs.some((s) => s === t) || strs.some((s) => sentencesOf(s).includes(t));
        if (!whole) out.push(F("IMAGE_LEGAL_FRAGMENT", "BLOCKED_CLAIM", `${at}: "${t.slice(0, 100)}" is a legal line but only a fragment of the locked sentence; a threshold, condition or decider could be dropped (SR-5, SR-12). Use the whole sentence, table cell or list item`));
        if (legalKindsOf(t).some((k) => k !== "LEGAL_ABSENCE")) out.push(F("IMAGE_LAYER_BLEND", "BLOCKED_CLAIM", `${at}: "${t.slice(0, 100)}" puts a local rule and California law, or two cities or counties, in one line; split it into lines with their own claims (SR-2, SR-14)`));
        if (legalKindsOf(t).includes("LEGAL_ABSENCE")) out.push(F("IMAGE_LEGAL_ABSENCE", "BLOCKED_CLAIM", `${at}: "${t.slice(0, 100)}" states what a law does not say; it needs its own statute_absence claim (SR-6) and is not put in an image`));
      }
      lineSentences.push({ text: t, legal });
    }
    const legalLines = lineSentences.filter((l) => l.legal);
    // SR-12: claims for the legal lines
    if (legalLines.length) {
      const unitIds = new Set(unitClaimIds(u)); const cited: LedgerClaim[] = [];
      if (!c.claim_ids.length) out.push(F("IMAGE_LEGAL_NO_CLAIM", "BLOCKED_CLAIM", `${at}: the card shows a legal line but cites no claim id`));
      for (const id of c.claim_ids) {
        const claim = ctx.claims.get(id);
        if (!claim) out.push(F("IMAGE_CLAIM_UNKNOWN", "BLOCKED_CLAIM", `${at}: ${id} is not in the claim ledger`));
        else { cited.push(claim); if (!unitIds.has(id) && !c.image_text.some((l) => byKey.get(l.source_unit) && unitClaimIds(byKey.get(l.source_unit)!).includes(id))) out.push(F("IMAGE_CLAIM_NOT_CITED_BY_TEXT", "BLOCKED_CLAIM", `${at}: ${id} is not cited by the unit the line comes from`)); }
      }
      out.push(...legalRecordFindings(cited).map((f) => ({ ...f, detail: `${at}: ${f.detail}` })));
      for (const cl of cited) if (cl.verification?.label && cl.verification.label !== "MATCH" && !(cl.verification.label === "NARROWER" && cl.verification.readerImpact === "none")) out.push(F("IMAGE_CLAIM_NOT_MATCH", "BLOCKED_CLAIM", `${at}: ${cl.id} is labelled ${cl.verification.label}; an image may only rest on a MATCH claim (or NARROWER with no reader impact)`));
      out.push(...deciderFindings(legalLines.map((l) => l.text), cited).map((f) => ({ ...f, detail: `${at}: ${f.detail}` })));
      // a line that names a city or county needs a claim for that jurisdiction (SR-2)
      for (const l of legalLines) for (const n of localNamesIn(l.text)) if (!cited.some((cl) => cl.jurisdiction.toLowerCase().includes(n))) out.push(F("IMAGE_LOCAL_NO_CLAIM", "BLOCKED_CLAIM", `${at}: the line names ${n} but no cited claim is for ${n}'s own official code (SR-2)`));
    }

    // free text of the card: description, alt text, purpose
    const free = [c.designer_description, c.alt_text, c.purpose].join("\n");
    const everything = [free, c.image_text.map((l) => l.text).join("\n")].join("\n");
    // SR-11: no figure that is not in the locked text
    for (const n of new Set(free.match(NUMBER) ?? [])) { const k = n.replace(/[.,]+$/, ""); if (k && !articleNumbers.has(k) && !articleNumbers.has(n)) out.push(F("IMAGE_NEW_NUMBER", "BLOCKED_CLAIM", `${at}: the number ${k} in the description, alt text or purpose is not in the locked text (SR-11)`)); }
    // SR-13: brand and service area
    if (MAP_OR_COVERAGE.test(free)) out.push(F("IMAGE_BRAND_COVERAGE", "BLOCKED_CLAIM", `${at}: a map, skyline, landmark, coverage or "serving X" badge, or a BBB/accreditation badge, is not allowed in an image (SR-13)`));
    for (const n of localNamesIn(free)) if (!articleText.toLowerCase().includes(n)) out.push(F("IMAGE_CITY_NOT_IN_TEXT", "BLOCKED_CLAIM", `${at}: ${n} appears in the description or alt text but not in the locked text; no place names that imply coverage (SR-3, SR-13)`));
    const wrap = { text: everything };
    for (const h of pendingJuanHits(wrap)) out.push(F("IMAGE_PENDING_JUAN", "BLOCKED_CLAIM", `${at}: ${h} is pending Juan and cannot appear in an image (SR-13)`));
    for (const h of ratingRuleHits(wrap)) out.push(F("IMAGE_RATING", "BLOCKED_CLAIM", `${at}: ${h} (permanent rating rule, SR-13)`));
    for (const h of experienceYearViolations(wrap)) out.push(F("IMAGE_EXPERIENCE", "BLOCKED_CLAIM", `${at}: experience wording ${h} is not approved`));
    for (const h of sourcedFactViolations(wrap)) out.push(F("IMAGE_SOURCED_FACT", "BLOCKED_CLAIM", `${at}: ${h}`));
    // SR-15 / SR-16
    const peopleFree = c.designer_description.replace(NO_PEOPLE, " ");     // what the picture shows; alt text may quote locked text about people ("endanger people")
    if (PEOPLE.test(peopleFree)) out.push(F("IMAGE_PEOPLE", "BLOCKED_PRIVACY", `${at}: the description mentions people, a seller, a family or faces; images are generic with no identifiable people (SR-15). Say "no people" if that is what you mean`));
    if (IDENTIFYING.test(free) || IDENTIFYING.test(c.privacy_notes.replace(/\b(no|without|never)\b[^.;]{0,40}/gi, " "))) out.push(F("IMAGE_IDENTIFYING", "BLOCKED_PRIVACY", `${at}: an address, house number, license plate or a real home is named (SR-15)`));
    if (c.type === "stock_photo" && !/\bgeneric\b/i.test(c.designer_description)) out.push(F("IMAGE_STOCK_NOT_GENERIC", "REVISION", `${at}: a stock photo must be described as generic`));
    if (BANNED_IMAGERY.test(free)) out.push(F("IMAGE_BANNED_IMAGERY", "BLOCKED_CLAIM", `${at}: speech bubbles, quotation marks, before-and-after or testimonial framing are banned (SR-16)`));
    if (INVENTED_DATA.test(free) || (c.type === "infographic" && /\b(chart|graph)\b/i.test(free))) out.push(F("IMAGE_INVENTED_DATA", "BLOCKED_CLAIM", `${at}: charts, statistics and data values are not allowed unless the locked text states them (SR-11, SR-16)`));
  }
  return out;
}

/** Strings of the locked article a reviewer can compare a card against. Exported for the board and the pull step (later build steps). */
export const articleStringsOf = (units: Unit[]): string[] => units.flatMap(unitStrings).map(plain);
