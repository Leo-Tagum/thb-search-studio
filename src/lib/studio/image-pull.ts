// Phase 3e build step 6: pulling Lawrence's finished images off the Image board, and placing them in an article.
// Pure functions: the board rows and the downloaded files come in as data, the checked records and the image-bearing article HTML come out. Nothing here reads or writes a
// database, a bucket or an article: the caller (the CLI, or a test) decides what to do with the result. An image is only ever ADDED to an article as a new version of the
// HTML; the locked text is never touched, and the text-only render must come out byte for byte the same (the "text proof").
import { brandRuleFindings } from "./brand-check";
import { checkImageFile, type ImageMime } from "./image-files";
import { auditHtml, renderBody, stripFigures, type Composed, type PlacedImage } from "./template";
import { sha256 } from "./hash";
import type { Draft } from "./schema";

export type PlanCardRef = { card_id: string; unit_key: string; anchor: { after: string; block_index: number }; card_version: number; aspect_ratio: { ratio: string; width_px: number; height_px: number }; base_file_name: string; alt_text: string; caption?: string };
export type BoardUpload = { v: number; for_card_version: number; file_name: string; date: string; asset_id: string | null };
export type BoardWork = { card_id: string; read: boolean; made: boolean; words: boolean; done: boolean; base: number; uploads: BoardUpload[]; uploaded_by?: string };

export type PulledImage = {
  card_id: string; version_no: number; for_card_version: number; file_name: string; storage_path: string; asset_id: string | null;
  sha256: string; bytes: number; mime: ImageMime; width: number; height: number; uploaded_by: string; uploaded_at: string; stripped: string[]; notes: string[];
};
/** One line per card in the pull report. */
export type PullStatus = "READY" | "NOT_HANDED_IN" | "NO_CURRENT_IMAGE" | "OUTDATED_ONLY" | "REJECTED" | "FILE_MISSING";
export type PullResult = {
  cards: { card_id: string; status: PullStatus; reasons: string[]; image?: PulledImage }[];
  /** The checked, cleaned files to store, by storage path. */
  files: Map<string, Uint8Array>;
  /** READY images only: handed in by Lawrence, valid, current. */
  ready: PulledImage[];
};

const ratioOf = (r: string) => { const [a, b] = r.split(":").map(Number); return a / b; };

/**
 * For every card: the current image is the newest upload made for the card's CURRENT version after the last restart; older uploads (an earlier card version, or before a
 * requested change) are kept but never used. Only an image Lawrence has marked Done counts as handed in. Each file is checked and cleaned (image-files.ts).
 */
export function pullImages(input: { articleId: string; cards: PlanCardRef[]; work: BoardWork[]; files: Map<string, Uint8Array>; uploader?: string }): PullResult {
  const out: PullResult = { cards: [], files: new Map(), ready: [] };
  for (const card of input.cards) {
    const w = input.work.find((x) => x.card_id === card.card_id);
    if (!w || !w.uploads.length) { out.cards.push({ card_id: card.card_id, status: "NO_CURRENT_IMAGE", reasons: ["nothing uploaded yet"] }); continue; }
    const current = w.uploads.filter((u) => u.for_card_version === card.card_version && u.v > w.base).sort((a, b) => b.v - a.v)[0];
    if (!current) { out.cards.push({ card_id: card.card_id, status: "OUTDATED_ONLY", reasons: [`all ${w.uploads.length} upload(s) are for an earlier version of the card or were replaced after a requested change; a new image is needed`] }); continue; }
    const bytes = current.asset_id ? input.files.get(current.asset_id) : undefined;
    if (!bytes) { out.cards.push({ card_id: card.card_id, status: "FILE_MISSING", reasons: [`the file for version ${current.v} was not downloaded`] }); continue; }
    const r = checkImageFile(bytes, current.file_name);
    if (!r.ok) { out.cards.push({ card_id: card.card_id, status: "REJECTED", reasons: r.errors }); continue; }
    const notes: string[] = [];
    if (r.stripped.length) notes.push(`stripped: ${r.stripped.join(", ")}`);
    const want = ratioOf(card.aspect_ratio.ratio), got = r.width / r.height;
    if (Math.abs(got - want) / want > 0.05) notes.push(`the picture is ${r.width} x ${r.height} (ratio ${got.toFixed(2)}); the card asked for ${card.aspect_ratio.ratio}`);
    const fileName = `${card.base_file_name}_v${current.v}.${r.ext}`;
    const storagePath = `articles/${input.articleId}/${card.card_id.replace(":", "-")}/v${current.v}_${r.sha256}.${r.ext}`;
    const image: PulledImage = { card_id: card.card_id, version_no: current.v, for_card_version: current.for_card_version, file_name: fileName, storage_path: storagePath, asset_id: current.asset_id, sha256: r.sha256, bytes: r.bytes, mime: r.mime, width: r.width, height: r.height, uploaded_by: w.uploaded_by ?? input.uploader ?? "board", uploaded_at: current.date, stripped: r.stripped, notes };
    if (!w.done) { out.cards.push({ card_id: card.card_id, status: "NOT_HANDED_IN", reasons: ["the image is uploaded but Lawrence has not marked it done"], image }); continue; }
    out.cards.push({ card_id: card.card_id, status: "READY", reasons: notes, image });
    out.files.set(storagePath, r.data); out.ready.push(image);
  }
  return out;
}

export type ImageVersion = { html: string; hash: string; textOnlyHtml: string; textOnlyHash: string; figures: number };
/**
 * The article with its images: the same locked text, figures added at each card's anchor with studio-image tokens. Refuses unless (1) the HTML passes the allowlist, (2) the
 * brand-rule check passes (alt text and captions included), (3) the text-only render is byte for byte the render without images, and (4) every figure has alt text.
 * `imageIdFor` gives each stored image its id (the token carries it with the file's SHA-256).
 */
export function buildImageVersion(draft: Draft, composed: Composed, ready: PulledImage[], cards: PlanCardRef[], imageIdFor: (img: PulledImage) => string): ImageVersion {
  const placed: PlacedImage[] = ready.map((img) => {
    const c = cards.find((x) => x.card_id === img.card_id);
    if (!c) throw new Error(`image ${img.file_name} belongs to card ${img.card_id}, which is not in the plan`);
    if (img.for_card_version !== c.card_version) throw new Error(`image ${img.file_name} was made for an earlier version of ${c.card_id}; it cannot be placed`);
    return { unitKey: c.unit_key, afterBlock: c.anchor.block_index, imageId: imageIdFor(img), sha256: img.sha256, alt: c.alt_text, caption: c.caption, width: img.width, height: img.height };
  });
  const textOnlyHtml = renderBody(draft, composed);
  const html = renderBody(draft, composed, placed);
  const bad = auditHtml(html); if (bad.length) throw new Error(`the image-bearing HTML failed the allowlist: ${bad.join("; ")}`);
  const brand = brandRuleFindings(html); if (brand.length) throw new Error(`the image-bearing HTML failed the brand-rule check: ${brand.map((f) => f.detail).join("; ")}`);
  if (stripFigures(html) !== textOnlyHtml) throw new Error("text proof failed: the text of the image-bearing article differs from the text-only render");
  return { html, hash: sha256(html), textOnlyHtml, textOnlyHash: sha256(textOnlyHtml), figures: placed.length };
}
