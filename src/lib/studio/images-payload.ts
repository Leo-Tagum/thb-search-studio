// Phase 3e build step 7: what the Approval Room shows about the images of a proposal. Pure: it turns checked facts into display data and never states more than was checked.
// The room's version hash covers the article HTML with its image tokens (so text and images are approved together, in one visit); the URLs below are for display only.
import { blockStrings } from "./image-cards";
import type { LedgerClaim } from "./checks";
import type { PlanCardRef, PulledImage } from "./image-pull";
import { unitClaimIds, type Unit } from "./schema";

export type ApprovalCard = PlanCardRef & { title: string; text_overlay: { text: string; source_unit: string; source_block: string }[]; claim_ids: string[] };
export type LeoImageCheck = { by: string; at: string; note: string };
export type HistoryEntry = { step: string; who: string; at: string; detail: string };
export type ApprovalImage = {
  card_id: string; title: string; file_name: string; version_no: number; fingerprint: string; size: string; alt: string;
  text_lines: { text: string; source: string; claim_ids: string[]; label: string | null }[];
  matches_locked_text: boolean; stripped: string[]; vision_run: boolean; vision_flags: string[]; leo_check: LeoImageCheck | null;
};
export type ImagesPayload = { images: ApprovalImage[]; image_urls: Record<string, string>; image_history: HistoryEntry[]; images_statement: string };

/** "Section 2 (What does state law list?), paragraph 1" for a source reference like s2 / block:0, in words a reader of the notes understands. */
export function humanSource(units: Unit[], unitKey: string, ref: string): string {
  const u = units.find((x) => x.key === unitKey);
  if (!u) return `${unitKey} ${ref}`;
  if (u.kind === "faq") { const m = /^faq:(\d+):([qa])$/.exec(ref); return m ? `FAQ ${Number(m[1]) + 1}, ${m[2] === "q" ? "question" : "answer"}` : "FAQ"; }
  const sec = `Section ${u.key.replace(/^s/, "")} (${u.h2})`;
  if (ref === "h2") return `${sec}, heading`; if (ref === "capsule") return `${sec}, opening answer`;
  const m = /^block:(\d+)$/.exec(ref); if (!m) return sec;
  const b = u.blocks[Number(m[1])]; const kind = b?.t === "ul" || b?.t === "ol" ? "list" : b?.t === "table" ? "table" : b?.t === "callout" ? "callout" : "paragraph";
  return `${sec}, ${kind} ${Number(m[1]) + 1}`;
}

export function buildImagesPayload(input: {
  cards: ApprovalCard[]; ready: PulledImage[]; units: Unit[]; claims: Map<string, LedgerClaim>;
  vision: Map<string, string[]>;      // the picture check's flags per card; a card with no entry has NOT been checked
  leoChecks: Map<string, LeoImageCheck>; history: HistoryEntry[]; urlFor: (img: PulledImage) => string; imageIdFor: (img: PulledImage) => string;
}): ImagesPayload {
  const byKey = new Map(input.units.map((u) => [u.key, u]));
  const images: ApprovalImage[] = input.ready.map((img) => {
    const c = input.cards.find((x) => x.card_id === img.card_id)!;
    const lines = c.text_overlay.map((l) => {
      const strs = byKey.has(l.source_unit) ? blockStrings(byKey.get(l.source_unit)!, l.source_block) : undefined;
      const norm = l.text.replace(/\s+/g, " ").trim();
      const src = byKey.get(l.source_unit);
      const cited = src ? unitClaimIds(src).filter((id) => c.claim_ids.includes(id)) : [];
      const label = cited.length ? input.claims.get(cited[0])?.verification?.label ?? null : null;
      return { text: l.text, source: humanSource(input.units, l.source_unit, l.source_block), claim_ids: cited, label, ok: !!strs && strs.some((s) => s.includes(norm)) };
    });
    return {
      card_id: c.card_id, title: c.title, file_name: img.file_name, version_no: img.version_no, fingerprint: img.sha256.slice(0, 12), size: `${img.width} x ${img.height} px`, alt: c.alt_text,
      text_lines: lines.map(({ ok: _ok, ...rest }) => (void _ok, rest)), matches_locked_text: lines.every((l) => l.ok), stripped: img.stripped, vision_run: input.vision.has(c.card_id), vision_flags: input.vision.get(c.card_id) ?? [], leo_check: input.leoChecks.get(c.card_id) ?? null,
    };
  });
  const image_urls = Object.fromEntries(input.ready.map((img) => [`${input.imageIdFor(img)}#${img.sha256}`, input.urlFor(img)]));
  // The statement says only what was checked.
  const problems: string[] = [];
  if (!images.length) problems.push("there are no images");
  if (images.some((i) => !i.matches_locked_text)) problems.push("an image text line is not word for word in the locked article");
  if (images.some((i) => !i.vision_run)) problems.push("the picture check (a model reading each image) has not been run on every image");
  if (images.some((i) => i.vision_flags.length)) problems.push("the picture check raised flags (see below)");
  if (images.some((i) => !i.leo_check)) problems.push("Leo has not yet checked every image");
  const stripped = [...new Set(images.flatMap((i) => i.stripped))];
  const images_statement = problems.length
    ? `NOT CONFIRMED: ${problems.join("; ")}.`
    : `Checked: every image text line is word for word in the locked article; the picture check raised no flags${stripped.length ? `; embedded metadata was removed (${stripped.join(", ")})` : ""}; Leo looked at every image. No seller photo, address or identifying detail was found. This is a check, not a guarantee: the people who approve still look at the pictures.`;
  return { images, image_urls, image_history: input.history, images_statement };
}
