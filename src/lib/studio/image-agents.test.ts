import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IMAGE_AGENT_KEYS, IMAGE_AGENT_META, imagePlanOutput, imagePlanSubmitErrors, v1ImageCheckErrors, v1ImageCheckOutput } from "./image-agents";
import { teamSchemaKey } from "../team/bridge";
import type { ImageCard, ImageCtx, ImagePlanResult } from "./image-cards";
import type { LedgerClaim } from "./checks";
import type { Unit } from "./schema";

// Build step 3: prompt files, registration, V1's image text check shape, and the new card fields. FAKE fixture text only.
const SENT = "The law counts them only when they endanger life, limb, health, property, safety or welfare.";
const units: Unit[] = [
  { kind: "section", key: "s1", h2: "Can you sell a packed house?", blocks: [{ t: "p", text: "Start with who holds title." }, { t: "ol", items: ["Who has authority to sign?", "What is owed?", "What does the house need?"] }], claim_ids: [], roles: [] },
  { kind: "section", key: "s2", h2: "What does state law list?", blocks: [{ t: "p", text: SENT }], claim_ids: ["clm:1"], roles: [] },
];
const claims = new Map<string, LedgerClaim>([["clm:1", { id: "clm:1", text: "t", risk: "high", support: "supported", sourceId: "s", sourceRecheckBy: null, jurisdiction: "California", verification: { quote: "q", section: "H&S 17920.3", label: "MATCH", reason: null, against: "p", gates: [], readerImpact: "none" } }]]);
const ctx: ImageCtx = { units, unitHashes: { s1: "h1", s2: "h2" }, claims };
const base = (over: Partial<ImageCard> = {}): ImageCard => ({
  card_id: "img:1", unit_key: "s1", unit_hash: "h1", anchor: { after: "Can you sell a packed house?", block_index: 1 }, type: "checklist_graphic", purpose: "Show the three first questions at a glance.",
  designer_description: "A plain checklist with three rows, no people.", generation_prompt: "A plain checklist graphic, flat shapes in navy with orange accents on a light background, wide 16:9 composition with clear empty space on the right where the text will go. Calm mood. No text, no letters, no people.",
  avoid: ["people or faces", "real-looking identifiable house exteriors", "addresses", "street numbers or street signs", "logos", "documents", "any text or letters in the image"],
  text_overlay: [{ text: "Who has authority to sign?", source_unit: "s1", source_block: "block:1" }], claim_ids: [], alt_text: "A checklist of three first questions.", aspect_ratio: { ratio: "16:9", width_px: 1600, height_px: 900 }, priority: "must_have", privacy_notes: "No people or addresses.", ...over,
});
const plan = (cards: ImageCard[]): ImagePlanResult => ({ cards, skipped_units: units.filter((u) => !cards.some((c) => c.unit_key === u.key)).map((u) => ({ unit_key: u.key, reason: "No image helps this unit more than its text." })) });
const legal = base({ card_id: "img:2", unit_key: "s2", unit_hash: "h2", type: "comparison_graphic", anchor: { after: "What does state law list?", block_index: 0 }, text_overlay: [{ text: SENT, source_unit: "s2", source_block: "block:0" }], claim_ids: ["clm:1"] });
const out = (over: Record<string, unknown> = {}, result: ImagePlanResult = plan([base()])) => ({ article_id: "a1", opportunity_id: "o1", agent_name: "Image Planner", agent_prompt_version: "1.0.0", model_version: "claude-code/test", input_version_ids: ["th"], decision: "PASS", findings: [], evidence_ids: [], required_actions: [], output_version_id: "v1", timestamp: "2026-10-13T12:00:00Z", result, ...over });
const sctx = { ...ctx, agent: "thb-08-image-planner" as const, opportunityId: "o1", articleId: "a1", textVersionHash: "th" };

describe("the two image planner prompt files share one rules body", () => {
  const read = (f: string) => readFileSync(`.claude/agents/${f}.md`, "utf8").replace(/\r\n/g, "\n");
  const rulesOf = (f: string) => { const t = read(f); return t.slice(t.indexOf("## Rules"), t.indexOf("## Output")).trim(); };
  it("Agent 8 and D1 rules are word for word the same, and say what Lawrence needs", () => {
    expect(rulesOf("thb-08-image-planner")).toBe(rulesOf("thb-d1-image-planner"));
    const r = rulesOf("thb-08-image-planner");
    for (const k of ["generation_prompt", "avoid", "text_overlay", "No text, no letters, no people", "AI image tools never generate the words", "navy and orange", "clear empty space", "read-only on the article"]) expect(r, k).toContain(k);
  });
  it("each file is registered, versioned 1.0.0, read/write only, and quotes its Prohibited action", () => {
    for (const k of IMAGE_AGENT_KEYS) {
      const t = read(k);
      expect(t).toMatch(new RegExp(`^name: ${k}$`, "m"));
      expect(t).toMatch(/^prompt_version: 1\.0\.0$/m);
      expect(t).toMatch(/^tools: Read, Write$/m);
      expect(t).toContain("**Prohibited action: Changing, adding or paraphrasing article text");
      expect(t).toContain(`"agent_prompt_version": "${IMAGE_AGENT_META[k].promptVersion}"`);
    }
  });
  it("the output example uses every field name the strict schema needs", () => {
    const t = read("thb-08-image-planner");
    for (const f of ["card_id", "unit_key", "unit_hash", "anchor", "type", "purpose", "designer_description", "generation_prompt", "avoid", "text_overlay", "claim_ids", "alt_text", "aspect_ratio", "priority", "privacy_notes", "skipped_units"]) expect(t, f).toContain(`"${f}"`);
  });
});

describe("the planner's output: envelope and card checks together", () => {
  it("a clean plan is accepted", () => expect(imagePlanSubmitErrors(out(), sctx)).toEqual([]));
  it("keys that could carry text, a lock or an approval are refused", () => {
    for (const k of ["unit", "revised_unit", "approved", "locked", "state"]) expect(imagePlanOutput.safeParse({ ...out(), [k]: "x" }).success, k).toBe(false);
    expect(imagePlanSubmitErrors(out({ result: { ...plan([base()]), approved: true } }), sctx).length).toBeGreaterThan(0);
  });
  it("wrong version, wrong article, model id, a missing text hash and a decision outside PASS/BLOCKED are refused", () => {
    expect(imagePlanSubmitErrors(out({ agent_prompt_version: "0.9" }), sctx).join()).toContain("agent_prompt_version");
    expect(imagePlanSubmitErrors(out({ article_id: "zz" }), sctx).join()).toContain("article_id");
    expect(imagePlanSubmitErrors(out({ model_version: "gpt" }), sctx).join()).toContain("model_version");
    expect(imagePlanSubmitErrors(out({ input_version_ids: ["other"] }), sctx).join()).toContain("text version hash");
    expect(imagePlanSubmitErrors(out({ decision: "REVISION" }), sctx).length).toBeGreaterThan(0);
  });
  it("a BLOCKED plan has no cards and a required finding; a PASS plan runs every card check", () => {
    expect(imagePlanSubmitErrors(out({ decision: "BLOCKED", findings: [] }, plan([])), sctx).join()).toContain("required finding");
    expect(imagePlanSubmitErrors(out({ decision: "BLOCKED", findings: [{ issue_key: "image:why", severity: "required", note: "no unit needs an image" }] }), sctx).join()).toContain("no cards");
    expect(imagePlanSubmitErrors(out({}, plan([base({ text_overlay: [{ text: "Who can sign for the owner?", source_unit: "s1", source_block: "block:1" }] })])), sctx).join()).toContain("IMAGE_TEXT_NOT_VERBATIM");
  });
  it("the planner's own prompt may not draw words or hold the overlay text", () => {
    expect(imagePlanSubmitErrors(out({}, plan([base({ generation_prompt: base().generation_prompt + " Write Who has authority to sign? on the first row." })])), sctx).join()).toContain("IMAGE_PROMPT_HAS_TEXT");
  });
});

describe("V1's image text check", () => {
  const p = plan([base(), legal]);
  const check = (c: string, over: Record<string, unknown> = {}) => ({ card_id: c, overlay_matches_locked_text: true, prompt_ok: true, note: "Matches the locked block.", ...over });
  const v1 = (cardChecks: object[], decision = "PASS", result: Record<string, unknown> = {}) => ({ article_id: "a1", opportunity_id: "o1", agent_name: "V1", agent_prompt_version: "1.5.0", model_version: "claude-code/test", input_version_ids: ["th"], decision, findings: [], evidence_ids: [], required_actions: [], output_version_id: "v", timestamp: "2026-10-13T12:00:00Z", result: { plan_text_hash: "th", card_checks: cardChecks, cards: [], leo_reference_needed: [], ...result } });
  it("has its own schema key, picked from card_checks", () => {
    expect(teamSchemaKey("V1", v1([]))).toBe("V1_IMAGE");
    expect(v1ImageCheckOutput.safeParse(v1([check("img:1")])).success).toBe(true);
    expect(v1ImageCheckOutput.safeParse({ ...v1([check("img:1")]), approved: true }).success).toBe(false);
  });
  it("a PASS needs a check for every card, every check true, and a MATCH comparison for a legal overlay line", () => {
    expect(v1ImageCheckErrors(v1([check("img:1"), check("img:2", { quote_comparison: "MATCH", reader_impact: "none" })]), p, "th")).toEqual([]);
    expect(v1ImageCheckErrors(v1([check("img:1")]), p, "th").join()).toContain("img:2: V1 PASS needs a card_check");
    expect(v1ImageCheckErrors(v1([check("img:1", { overlay_matches_locked_text: false }), check("img:2", { quote_comparison: "MATCH" })]), p, "th").join()).toContain("not the locked text");
    expect(v1ImageCheckErrors(v1([check("img:1", { prompt_ok: false }), check("img:2", { quote_comparison: "MATCH" })]), p, "th").join()).toContain("prompt or avoid list wrong");
    expect(v1ImageCheckErrors(v1([check("img:1"), check("img:2")]), p, "th").join()).toContain("needs V1's quote_comparison");
    expect(v1ImageCheckErrors(v1([check("img:1"), check("img:2", { quote_comparison: "BROADER" })]), p, "th").join()).toContain("BROADER");
    expect(v1ImageCheckErrors(v1([check("img:1"), check("img:2", { quote_comparison: "NARROWER", reader_impact: "changes" })]), p, "th").join()).toContain("NARROWER");
    expect(v1ImageCheckErrors(v1([check("img:1"), check("img:2", { quote_comparison: "NARROWER", reader_impact: "none" })]), p, "th")).toEqual([]);
  });
  it("a REVISION may report a failing card; a check of a card that is not in the plan, or for another text version, is refused", () => {
    expect(v1ImageCheckErrors(v1([check("img:1", { overlay_matches_locked_text: false })], "REVISION"), plan([base()]), "th")).toEqual([]);
    expect(v1ImageCheckErrors(v1([check("img:1"), check("img:7")]), plan([base()]), "th").join()).toContain("img:7");
    expect(v1ImageCheckErrors(v1([check("img:1")], "PASS", { plan_text_hash: "old" }), plan([base()]), "th").join()).toContain("plan_text_hash");
  });
});
