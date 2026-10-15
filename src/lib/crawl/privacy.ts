// Privacy scan for evidence screenshots (standing rule SR-7: no seller-identifying data). A page screenshot may show a testimonial name, a street name in a seller story,
// an email or a personal phone number. This module finds those in text, filenames and URLs; the crawler then blacks the elements out inside Chrome before the screenshot is taken.
// Company contact details that the brand facts approve (name, address, phone, site) are allowed.

/** The pattern sources. The scan below and the in-page redaction both use these, so they can never disagree. Raw strings: backslashes are real regex escapes. */
export const STREET_WORDS = String.raw`(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Way|Boulevard|Blvd|Place|Pl|Terrace|Circle)`;
export const PATTERN_SOURCES = {
  streetAddress: String.raw`\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}${STREET_WORDS}\b`,
  streetStory: String.raw`\b(?:on|from|at|of)\s+(?:[A-Z][a-z]+\s+){1,2}${STREET_WORDS}\b`,
  email: String.raw`[\w.+-]+@[\w-]+\.[\w.-]+`,
  phone: String.raw`(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b`,
  zip: String.raw`\bCA\s+9\d{4}\b`,
  reviewer: String.raw`^[A-Z][a-z]{2,}\s+[A-Z]\.?$`,
  allowed: [String.raw`170 Glenn Way`, String.raw`\(?415\)?[\s-]*415[\s-]*(?:8946|TWIN)`, String.raw`twinhomebuyer\.com`, String.raw`San Carlos, CA 94070`],
};

export type PrivacyFinding = { kind: "street-address" | "street-story" | "reviewer-name" | "email" | "phone" | "zip"; sample: string };

const stripAllowed = (s: string) => PATTERN_SOURCES.allowed.reduce((t, src) => t.replace(new RegExp(src, "gi"), " "), s);

/** Findings in a piece of visible text. */
export function scanText(text: string): PrivacyFinding[] {
  const t = stripAllowed(text); const out: PrivacyFinding[] = [];
  const P = PATTERN_SOURCES;
  for (const m of t.matchAll(new RegExp(P.streetAddress, "g"))) out.push({ kind: "street-address", sample: m[0] });
  for (const m of t.matchAll(new RegExp(P.streetStory, "g"))) out.push({ kind: "street-story", sample: m[0] });
  for (const m of t.matchAll(new RegExp(P.email, "g"))) out.push({ kind: "email", sample: m[0] });
  for (const m of t.matchAll(new RegExp(P.phone, "g"))) out.push({ kind: "phone", sample: m[0] });
  for (const m of t.matchAll(new RegExp(P.zip, "g"))) out.push({ kind: "zip", sample: m[0] });
  return out;
}

/** A reviewer or seller shown as "First L." (a first name and a last initial). */
export const isReviewerName = (s: string) => new RegExp(PATTERN_SOURCES.reviewer).test(s.trim());

/** Findings in an image filename, alt text or URL path. Our own page addresses are public and fine; a street address or a person's name in a media filename is not. */
export function scanFilename(name: string): PrivacyFinding[] {
  const n = name.replace(/[-_]+/g, " ").replace(/\.(webp|jpe?g|png|gif|svg)$/i, "");
  const out = scanText(n.replace(/\b([a-z])/g, (c) => c.toUpperCase()));
  if (/\b\d{2,5}\s+[a-z]+\s+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|way|blvd)\b/i.test(n)) out.push({ kind: "street-address", sample: n.slice(0, 60) });
  return out;
}

/** Neutral evidence filename: a short hash, never the page slug or any text from the page. */
export function neutralName(seed: string, kind: string): string {
  let h = 2166136261; for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return `${h.toString(16).padStart(8, "0")}-${kind}.jpg`;
}

/** True only when every redaction rectangle (scaled to the uploaded image) is solid black in the pixels: used on the downloaded uploaded copy. */
export function rectsAreSolid(pixels: { w: number; h: number; data: Uint8ClampedArray }, rects: { x: number; y: number; w: number; h: number }[], threshold = 40, minShare = 0.97): { ok: boolean; worst: number } {
  let worst = 1;
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y)), x1 = Math.min(pixels.w, Math.ceil(r.x + r.w)), y1 = Math.min(pixels.h, Math.ceil(r.y + r.h));
    let dark = 0, total = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * pixels.w + x) * 4; total++; if (pixels.data[i] < threshold && pixels.data[i + 1] < threshold && pixels.data[i + 2] < threshold) dark++; }
    if (total > 0) worst = Math.min(worst, dark / total);
  }
  return { ok: worst >= minShare, worst };
}
