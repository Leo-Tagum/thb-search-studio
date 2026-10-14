/* eslint-disable @typescript-eslint/no-explicit-any -- DB JSON columns */
// Phase 3e, the pieces the FIRST REAL PILOT needs from the image plan (built and tested here, NOT run on any real article until Leo says): the plan and its cards in the database, the checked
// images in the private bucket with their image_uploads rows, Leo's check, the image-bearing article version, and the image block of the real proposal.
// Rules kept: nothing is ever overwritten (a stored image is immutable; a new upload is a new version); an image is only ADDED to an article as a new version of its HTML, whose text-only
// render must equal the text it was planned on, byte for byte; only Leo checks images; an article that is approved (or not in HUMAN_REVIEW) takes no images without a revision; the
// version hash covers text and images together, so one approval covers both.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Orchestrator } from "../orchestrator";
import { SupabaseRepo } from "../orchestrator/supabase-repo";
import { sha256 } from "./hash";
import { buildImageVersion, type PlanCardRef, type PullResult, type PulledImage } from "./image-pull";
import { buildImagesPayload, type ApprovalCard, type HistoryEntry, type ImagesPayload, type LeoImageCheck } from "./images-payload";
import type { LedgerClaim } from "./checks";
import { renderBody, stripFigures } from "./template";
import type { Draft, Unit } from "./schema";

export type ImageStore = { upload(path: string, data: Uint8Array, mime: string): Promise<void>; signedUrl(path: string): Promise<string> };
/** The private `article-images` bucket (migration 0021): never public, never overwritten. */
export const supabaseImageStore = (db: SupabaseClient): ImageStore => ({
  async upload(path, data, mime) { const r = await db.storage.from("article-images").upload(path, data, { contentType: mime, upsert: false }); if (r.error) throw new Error(`storing ${path} failed: ${r.error.message}`); },
  async signedUrl(path) { const r = await db.storage.from("article-images").createSignedUrl(path, 3600); if (r.error || !r.data) throw new Error(`no signed address for ${path}: ${r.error?.message ?? "none"}`); return r.data.signedUrl; },
});

export const PLAN_ORDER = ["PLANNED", "V1_CHECKED", "ON_BOARD", "IN_PROGRESS", "ALL_DONE", "LEO_CHECKED"] as const;
type Res<T = object> = ({ ok: true } & T) | { ok: false; reason: string };
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
const orch = (db: SupabaseClient) => new Orchestrator(new SupabaseRepo(db));

export type PlanCardInput = PlanCardRef & {
  title: string; unit_hash: string; type: string; purpose: string; design_brief: string; generation_prompt: string; avoid: string[]; priority: string; privacy_notes: string;
  text_overlay: { text: string; source_unit: string; source_block: string }[]; claim_ids: string[];
};
/** The text version an article's images are planned on: the plain render of its text (the same for a version with and without figures). */
export const textHashOfVersion = (v: { body: any }): string => v.body.text_only_hash ?? sha256(v.body.html);

async function articleAndVersion(db: SupabaseClient, articleId: string) {
  const { data: a } = await db.from("articles").select("*").eq("id", articleId).single();
  if (!a) throw new Error(`no article ${articleId}`);
  const { data: v } = await db.from("article_versions").select("*").eq("id", a.locked_version_id).single();
  if (!v) throw new Error("the article has no locked version");
  if (sha256(v.body.html) !== a.version_hash) throw new Error("the stored version does not match the article's current hash");
  return { a, v };
}

// ---------- the plan ----------
export async function recordImagePlan(db: SupabaseClient, articleId: string, cards: PlanCardInput[], actor: string): Promise<Res<{ planId: string; cardIds: Map<string, string> }>> {
  if (actor !== "leo") return fail("only leo records an image plan");
  const { a, v } = await articleAndVersion(db, articleId);
  if (a.state !== "HUMAN_REVIEW" || a.approved_hash) return fail(`images are planned for an assembled article in HUMAN_REVIEW with no approval (it is ${a.state}${a.approved_hash ? ", approved" : ""})`);
  if (!cards.length) return fail("a plan needs at least one card");
  await db.from("image_plans").update({ status: "SUPERSEDED" }).eq("article_id", articleId).in("status", ["PLANNED", "V1_CHECKED", "ON_BOARD", "IN_PROGRESS", "ALL_DONE"]);
  const { data: plan, error } = await db.from("image_plans").insert({ article_id: articleId, text_version_hash: textHashOfVersion(v), status: "PLANNED" }).select("*").single();
  if (error || !plan) return fail(`plan not stored: ${error?.message}`);
  const cardIds = new Map<string, string>();
  for (const c of cards) {
    const { data: row, error: e2 } = await db.from("image_cards").insert({ plan_id: plan.id, card_key: c.card_id, unit_key: c.unit_key, unit_hash: c.unit_hash, anchor: c.anchor, type: c.type, purpose: c.purpose, design_brief: c.design_brief, generation_prompt: c.generation_prompt, avoid: c.avoid, text_overlay: c.text_overlay, claim_ids: c.claim_ids, alt_text: c.alt_text, privacy_notes: c.privacy_notes, aspect: c.aspect_ratio, priority: c.priority, state: "PLANNED" }).select("*").single();
    if (e2 || !row) return fail(`card ${c.card_id} not stored: ${e2?.message}`);
    cardIds.set(c.card_id, row.id);
  }
  await db.from("audit_events").insert({ actor, subject_type: "article", subject_id: articleId, event_type: "image_plan_recorded", accepted: true, detail: { plan: plan.id, cards: cards.length, text_version_hash: plan.text_version_hash } });
  return { ok: true, planId: plan.id, cardIds };
}

const NEXT: Record<string, string[]> = { PLANNED: ["V1_CHECKED"], V1_CHECKED: ["ON_BOARD"], ON_BOARD: ["IN_PROGRESS", "ALL_DONE"], IN_PROGRESS: ["ALL_DONE"], ALL_DONE: ["LEO_CHECKED"] };
/** Statuses move forward only; LEO_CHECKED only through leoCheckImages. STALE and SUPERSEDED are end states. */
export async function advancePlan(db: SupabaseClient, planId: string, to: (typeof PLAN_ORDER)[number] | "STALE" | "SUPERSEDED", actor: string): Promise<Res> {
  const { data: p } = await db.from("image_plans").select("*").eq("id", planId).single();
  if (!p) return fail("no such plan");
  if (["STALE", "SUPERSEDED"].includes(p.status)) return fail(`the plan is ${p.status}; it cannot move`);
  if (p.status === "LEO_CHECKED" && to !== "STALE" && to !== "SUPERSEDED") return fail("the plan is LEO_CHECKED; it can only become STALE or SUPERSEDED");
  if (to === "LEO_CHECKED") return fail("only leoCheckImages sets LEO_CHECKED");
  if (to !== "STALE" && to !== "SUPERSEDED" && !(NEXT[p.status] ?? []).includes(to)) return fail(`a plan goes ${PLAN_ORDER.join(" -> ")}; ${p.status} cannot go to ${to}`);
  await db.from("image_plans").update({ status: to }).eq("id", planId);
  await db.from("audit_events").insert({ actor, subject_type: "article", subject_id: p.article_id, event_type: "image_plan_status", accepted: true, detail: { plan: planId, from: p.status, to } });
  return { ok: true };
}

// ---------- the files ----------
/** Store the checked, cleaned images of a pull (image-pull.ts): bucket first, then the row. Idempotent for the same bytes; a different file for the same card version is refused, never overwritten. */
export async function storeImages(db: SupabaseClient, planId: string, pulled: PullResult, store: ImageStore): Promise<Res<{ stored: number; skipped: number }>> {
  const { data: plan } = await db.from("image_plans").select("*").eq("id", planId).single();
  if (!plan) return fail("no such plan");
  if (!["ON_BOARD", "IN_PROGRESS", "ALL_DONE"].includes(plan.status)) return fail(`images are stored while the plan is ON_BOARD, IN_PROGRESS or ALL_DONE (it is ${plan.status})`);
  const { data: cards } = await db.from("image_cards").select("*").eq("plan_id", planId);
  let stored = 0, skipped = 0;
  for (const img of pulled.ready) {
    const card = (cards ?? []).find((c: any) => c.card_key === img.card_id);
    if (!card) return fail(`image ${img.file_name} belongs to ${img.card_id}, which is not in this plan`);
    const { data: existing } = await db.from("image_uploads").select("*").eq("card_id", card.id).eq("version_no", img.version_no).maybeSingle();
    if (existing) { if (existing.sha256 === img.sha256) { skipped++; continue; } return fail(`${img.card_id} version ${img.version_no} is already stored with different bytes; an image is never overwritten (upload a new version)`); }
    const bytes = pulled.files.get(img.storage_path); if (!bytes) return fail(`the cleaned file for ${img.file_name} is missing`);
    if (sha256Hex(bytes) !== img.sha256) return fail(`the cleaned file for ${img.file_name} does not hash to the recorded SHA-256`);
    await store.upload(img.storage_path, bytes, img.mime);
    const { error } = await db.from("image_uploads").insert({ card_id: card.id, version_no: img.version_no, file_name: img.file_name, storage_path: img.storage_path, asset_id: img.asset_id, sha256: img.sha256, bytes: img.bytes, mime: img.mime, width: img.width, height: img.height, uploaded_by: img.uploaded_by, vision_seen_text: null, vision_flags: [], leo_check: null });
    if (error) return fail(`row for ${img.file_name} not stored: ${error.message}`);
    await db.from("image_cards").update({ state: "DONE" }).eq("id", card.id);
    stored++;
  }
  const { data: after } = await db.from("image_cards").select("*").eq("plan_id", planId);
  const { data: ups } = await db.from("image_uploads").select("card_id").in("card_id", (after ?? []).map((c: any) => c.id));
  const done = (after ?? []).length > 0 && (after ?? []).every((c: any) => (ups ?? []).some((u: any) => u.card_id === c.id));
  if (done && plan.status !== "ALL_DONE") { if (plan.status === "ON_BOARD") await advancePlan(db, planId, "IN_PROGRESS", "system:images"); await advancePlan(db, planId, "ALL_DONE", "system:images"); }
  else if (stored && plan.status === "ON_BOARD") await advancePlan(db, planId, "IN_PROGRESS", "system:images");
  return { ok: true, stored, skipped };
}
const sha256Hex = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** Leo looks at every image himself (the picture check by a model is only a flagging aid) and records it. This is the only way a plan becomes LEO_CHECKED. */
export async function leoCheckImages(db: SupabaseClient, planId: string, note: string, actor: string, today = new Date().toISOString().slice(0, 10)): Promise<Res<{ checked: number }>> {
  if (actor !== "leo") return fail("only leo checks images");
  if (note.trim().length < 5) return fail("write what you checked (a few words)");
  const { data: plan } = await db.from("image_plans").select("*").eq("id", planId).single();
  if (!plan || plan.status !== "ALL_DONE") return fail(`the plan must be ALL_DONE (every card has an image); it is ${plan?.status ?? "missing"}`);
  const { data: cards } = await db.from("image_cards").select("*").eq("plan_id", planId);
  let checked = 0;
  for (const c of cards ?? []) {
    const { data: ups } = await db.from("image_uploads").select("*").eq("card_id", c.id).order("version_no", { ascending: false });
    const cur = ups?.[0]; if (!cur) return fail(`card ${c.card_key} has no image`);
    await db.from("image_uploads").update({ leo_check: { checked_by: "Leo", checked_at: today, note: note.trim() } }).eq("id", cur.id); checked++;
  }
  await db.from("image_plans").update({ status: "LEO_CHECKED" }).eq("id", planId);
  await db.from("audit_events").insert({ actor, subject_type: "article", subject_id: plan.article_id, event_type: "images_checked_by_leo", accepted: true, detail: { plan: planId, checked, note: note.trim() } });
  return { ok: true, checked };
}

// ---------- the article ----------
const currentUploads = async (db: SupabaseClient, planId: string) => {
  const { data: cards } = await db.from("image_cards").select("*").eq("plan_id", planId);
  const out: { card: any; up: any }[] = [];
  for (const c of cards ?? []) { const { data: ups } = await db.from("image_uploads").select("*").eq("card_id", c.id).order("version_no", { ascending: false }); if (ups?.[0]) out.push({ card: c, up: ups[0] }); }
  return { cards: cards ?? [], rows: out };
};

/**
 * A new version of the article HTML with the images added (never an edit of the text). Refused unless: the article is assembled in HUMAN_REVIEW with no approval, the plan is LEO_CHECKED and was
 * planned on the article's CURRENT text, every card has an image, and the text-only render equals that text byte for byte. The version hash covers text and images together.
 */
export async function createImageVersion(db: SupabaseClient, articleId: string, planId: string, actor: string): Promise<Res<{ versionId: string; hash: string; textOnlyHash: string; figures: number }>> {
  if (actor !== "leo") return fail("only leo creates the image-bearing version");
  const { a, v } = await articleAndVersion(db, articleId);
  if (a.state !== "HUMAN_REVIEW" || a.approved_hash) return fail(`the article must be assembled in HUMAN_REVIEW with no approval (it is ${a.state}${a.approved_hash ? ", approved" : ""}); images after sign-off are a revision`);
  const { data: plan } = await db.from("image_plans").select("*").eq("id", planId).single();
  if (!plan || plan.article_id !== articleId) return fail("that plan does not belong to this article");
  if (plan.status !== "LEO_CHECKED") return fail(`the plan must be LEO_CHECKED (Leo has looked at every image); it is ${plan.status}`);
  if (plan.text_version_hash !== textHashOfVersion(v)) { await advancePlan(db, planId, "STALE", "system:images"); return fail("the article's text changed after the plan was made: the plan is now STALE; plan the images again"); }
  const { cards, rows } = await currentUploads(db, planId);
  if (rows.length !== cards.length) return fail(`${cards.length - rows.length} card(s) have no image yet`);
  const refs: PlanCardRef[] = rows.map(({ card }) => ({ card_id: card.card_key, unit_key: card.unit_key, anchor: card.anchor, card_version: 1, aspect_ratio: card.aspect, base_file_name: card.card_key, alt_text: card.alt_text }));
  const ready: PulledImage[] = rows.map(({ card, up }) => ({ card_id: card.card_key, version_no: up.version_no, for_card_version: 1, file_name: up.file_name, storage_path: up.storage_path, asset_id: up.asset_id, sha256: up.sha256, bytes: up.bytes, mime: up.mime, width: up.width, height: up.height, uploaded_by: up.uploaded_by ?? "board", uploaded_at: String(up.created_at ?? "").slice(0, 10), stripped: [], notes: [] }));
  const uploadId = new Map(rows.map(({ up }) => [up.storage_path, up.id as string]));
  const draft: Draft = v.body.draft, composed = v.body.composed;
  let built;
  try { built = buildImageVersion(draft, composed, ready, refs, (img) => uploadId.get(img.storage_path)!); } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  if (sha256(built.textOnlyHtml) !== plan.text_version_hash) return fail("the plain render of the article's text is not the text the images were planned on; nothing was changed");
  if (sha256(stripFigures(v.body.html)) !== plan.text_version_hash && textHashOfVersion(v) !== plan.text_version_hash) return fail("internal: the stored version is not the planned text");
  const images = rows.map(({ card, up }) => ({ upload_id: up.id, card_key: card.card_key, sha256: up.sha256 }));
  const { data: ver, error } = await db.from("article_versions").insert({ article_id: articleId, version_hash: built.hash, body: { draft, composed, html: built.html, text_only_hash: built.textOnlyHash, images, plan_id: planId }, reason: "images added (text unchanged)", created_by: actor }).select("*").single();
  if (error || !ver) return fail(`version not stored: ${error?.message}`);
  const o = orch(db);
  await o.recordEdit("article", articleId, built.hash, { kind: "human", id: actor });
  await db.from("articles").update({ locked_version_id: ver.id }).eq("id", articleId);
  await db.from("proposals").update({ status: "SUPERSEDED" }).eq("article_id", articleId).eq("status", "OPEN");
  await db.from("audit_events").insert({ actor, subject_type: "article", subject_id: articleId, event_type: "image_version_created", accepted: true, version_hash: built.hash, detail: { plan: planId, figures: built.figures, text_only_hash: built.textOnlyHash } });
  return { ok: true, versionId: ver.id, hash: built.hash, textOnlyHash: built.textOnlyHash, figures: built.figures };
}

// ---------- the proposal ----------
/** The image block of the Approval Room payload for a version that carries images (null for a text-only version). Display addresses are signed, short-lived and not part of any hash. */
export async function imagesForProposal(db: SupabaseClient, version: { body: any }, claims: Map<string, LedgerClaim>, store: ImageStore): Promise<ImagesPayload | null> {
  const body = version.body;
  if (!body.images?.length) return null;
  const { data: plan } = await db.from("image_plans").select("*").eq("id", body.plan_id).single();
  const { data: ups } = await db.from("image_uploads").select("*").in("id", body.images.map((i: any) => i.upload_id));
  const { data: cards } = await db.from("image_cards").select("*").in("id", (ups ?? []).map((u: any) => u.card_id));
  const units: Unit[] = body.draft.units;
  const approval: ApprovalCard[] = (cards ?? []).map((c: any) => ({ card_id: c.card_key, unit_key: c.unit_key, anchor: c.anchor, card_version: 1, aspect_ratio: c.aspect, base_file_name: c.card_key, alt_text: c.alt_text, title: String(c.purpose).slice(0, 70), text_overlay: c.text_overlay, claim_ids: c.claim_ids ?? [] }));
  const ready: PulledImage[] = (ups ?? []).map((u: any) => ({ card_id: (cards ?? []).find((c: any) => c.id === u.card_id)!.card_key, version_no: u.version_no, for_card_version: 1, file_name: u.file_name, storage_path: u.storage_path, asset_id: u.asset_id, sha256: u.sha256, bytes: u.bytes, mime: u.mime, width: u.width, height: u.height, uploaded_by: u.uploaded_by ?? "board", uploaded_at: String(u.created_at ?? "").slice(0, 10), stripped: [], notes: [] }));
  const urls = new Map<string, string>(); for (const r of ready) urls.set(r.storage_path, await store.signedUrl(r.storage_path));
  const vision = new Map<string, string[]>(); const leo = new Map<string, LeoImageCheck>();
  for (const u of ups ?? []) { const key = (cards ?? []).find((c: any) => c.id === u.card_id)!.card_key; if (u.vision_seen_text !== null && u.vision_seen_text !== undefined) vision.set(key, u.vision_flags ?? []); if (u.leo_check) leo.set(key, { by: u.leo_check.checked_by, at: u.leo_check.checked_at, note: u.leo_check.note }); }
  const history: HistoryEntry[] = [
    { step: "Image plan", who: "Agent 8", at: String(plan?.created_at ?? "").slice(0, 10), detail: `${approval.length} card(s) accepted by the card checks` },
    { step: "Images made", who: "Lawrence", at: String((ups ?? [])[0]?.created_at ?? "").slice(0, 10), detail: "uploaded and marked done on the board" },
    ...(leo.size ? [{ step: "Image check", who: "Leo", at: [...leo.values()][0].at, detail: [...leo.values()][0].note }] : []),
  ];
  return buildImagesPayload({ cards: approval, ready, units, claims, vision, leoChecks: leo, history, urlFor: (i) => urls.get(i.storage_path)!, imageIdFor: (i) => (ups ?? []).find((u: any) => u.storage_path === i.storage_path)!.id });
}
export { renderBody };
