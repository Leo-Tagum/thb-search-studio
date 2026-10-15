// Builds the review page's data payload and the final HTML. Images are never inlined: a screenshot is referenced by its uploaded asset id only (the page limit is 16MB, and inline images would also
// travel with every republish). The payload is checked for size and for seller-identifying text before it is allowed into the page.
import { scanText } from "../crawl/privacy";
import { PAGE_TYPES, type Card, type Unflagged } from "./types";

export const PAYLOAD_VERSION = 1;
export const MAX_PAYLOAD_BYTES = 600_000;
export const DECISION_CHOICES = ["REDIRECT RECOMMENDATION", "MAIN", "REWRITE", "REMOVE RECOMMENDATION", "HOLD"] as const;

export type Payload = { version: number; lede: string; types: readonly string[]; decisions: readonly string[]; cards: Card[]; unflagged: Unflagged[] };

export function buildPayload(cards: Card[], unflagged: Unflagged[], lede: string): Payload {
  return { version: PAYLOAD_VERSION, lede, types: PAGE_TYPES, decisions: DECISION_CHOICES, cards, unflagged };
}

/** Throws when the payload would break a rule: too big, an inline image, a screenshot file that is not in the upload list, or seller-identifying text in any card text. */
export function checkPayload(p: Payload): { bytes: number; problems: string[] } {
  const json = JSON.stringify(p); const problems: string[] = [];
  const bytes = Buffer.byteLength(json);
  if (bytes > MAX_PAYLOAD_BYTES) problems.push(`payload is ${bytes} bytes, over the ${MAX_PAYLOAD_BYTES} limit`);
  if (bytes > MAX_PAYLOAD_BYTES) return { bytes, problems };   // the text scan below is quadratic on huge runs (email pattern), and an oversized payload is refused anyway
  if (/data:image\//i.test(json)) problems.push("payload contains an inline image");
  const text = JSON.stringify({ ...p, cards: p.cards.map((c) => ({ ...c, source: { ...c.source, shots: [] }, destination: c.destination && { ...c.destination, shots: [] } })) });
  for (const f of scanText(text.replace(/\\"/g, '"'))) problems.push(`seller-identifying text in card text (${f.kind}): ${f.sample}`);
  for (const c of p.cards) for (const side of [c.source, c.destination]) for (const s of side?.shots ?? []) { if (!/^[0-9a-f]{8}-[a-z-]+\.jpg$/.test(s.file)) problems.push(`non-neutral screenshot filename ${s.file}`); if (s.assetId !== undefined && !/^[0-9a-f]{32}$/.test(s.assetId)) problems.push(`bad asset id ${s.assetId}`); }
  return { bytes, problems };
}

/** Puts the payload into the template. "<" is escaped so no page text can close the script tag. */
export function renderPage(template: string, p: Payload): string {
  if (!template.includes("__PAYLOAD__")) throw new Error("template has no __PAYLOAD__ marker");
  const json = JSON.stringify(p).split("<").join("\\u003c").split(String.fromCharCode(0x2028)).join("\\u2028").split(String.fromCharCode(0x2029)).join("\\u2029");
  return template.replace("__PAYLOAD__", () => json);
}
