// Phase 3e build step 6: what the Studio does with a file Lawrence uploads, before it is stored or placed in an article.
// Allowed formats: PNG, JPEG, WebP and SVG, up to 10 MB. Per file: detect the real format from the bytes (never from the name), read the pixel size, refuse an animated
// file, strip metadata (EXIF and other embedded text, which can hold GPS data and so an address: SR-15), refuse an SVG with anything active in it, and record the SHA-256
// of the bytes that will actually be stored. Pure functions on bytes: nothing here touches a database, a bucket or the network.
import { createHash } from "node:crypto";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MIN_SIDE_PX = 200;
export const MAX_SIDE_PX = 8000;
export type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";
const EXT: Record<ImageMime, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };

export type ImageCheck =
  | { ok: true; mime: ImageMime; ext: string; width: number; height: number; bytes: number; sha256: string; data: Uint8Array; stripped: string[] }
  | { ok: false; errors: string[] };

export const sha256Bytes = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const le32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const tag = (b: Uint8Array, o: number, n = 4) => String.fromCharCode(...b.slice(o, o + n));
const concat = (parts: Uint8Array[]): Uint8Array => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

export function detectMime(b: Uint8Array): ImageMime | null {
  if (b.length >= 8 && b[0] === 0x89 && tag(b, 1, 3) === "PNG") return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && tag(b, 0) === "RIFF" && tag(b, 8) === "WEBP") return "image/webp";
  const head = new TextDecoder().decode(b.slice(0, 512)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

// ---------- PNG ----------
function checkPng(b: Uint8Array): { width: number; height: number; data: Uint8Array; stripped: string[]; errors: string[] } {
  const errors: string[] = []; const stripped: string[] = []; const keep: Uint8Array[] = [b.slice(0, 8)];
  let width = 0, height = 0, o = 8, sawEnd = false;
  while (o + 12 <= b.length) {
    const len = u32(b, o), type = tag(b, o + 4), end = o + 12 + len;
    if (end > b.length) { errors.push("the PNG file is cut off (a chunk runs past the end)"); break; }
    if (type === "IHDR") { width = u32(b, o + 8); height = u32(b, o + 12); }
    if (type === "acTL" || type === "fcTL" || type === "fdAT") { errors.push("animated PNG is not allowed"); break; }
    if (["tEXt", "zTXt", "iTXt", "eXIf", "tIME"].includes(type)) stripped.push(`PNG ${type}`);
    else keep.push(b.slice(o, end));
    o = end; if (type === "IEND") { sawEnd = true; break; }
  }
  if (!errors.length && !sawEnd) errors.push("the PNG file is cut off (it has no end marker)");
  if (!width || !height) errors.push("the PNG has no readable size");
  return { width, height, data: concat(keep), stripped, errors };
}

// ---------- JPEG ----------
function checkJpeg(b: Uint8Array): { width: number; height: number; data: Uint8Array; stripped: string[]; errors: string[] } {
  const errors: string[] = []; const stripped: string[] = []; const keep: Uint8Array[] = [b.slice(0, 2)];
  let width = 0, height = 0, o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) { errors.push("the JPEG file is damaged (a segment marker is missing)"); break; }
    const m = b[o + 1];
    if (m === 0xd9) { keep.push(b.slice(o, o + 2)); o += 2; break; }
    const len = u16(b, o + 2), end = o + 2 + len;
    if (end > b.length) { errors.push("the JPEG file is cut off"); break; }
    if ((m >= 0xc0 && m <= 0xcf) && ![0xc4, 0xc8, 0xcc].includes(m)) { height = u16(b, o + 5); width = u16(b, o + 7); }
    const drop = m === 0xe1 || m === 0xed || m === 0xfe || (m >= 0xe3 && m <= 0xec) || m === 0xef;      // EXIF/XMP, Photoshop data, comments, other application data; JFIF (E0), ICC (E2) and Adobe (EE) stay
    if (drop) stripped.push(m === 0xe1 ? "JPEG EXIF/XMP" : m === 0xfe ? "JPEG comment" : `JPEG APP${m - 0xe0}`); else keep.push(b.slice(o, end));
    if (m === 0xda) { keep.push(b.slice(end)); break; }                    // start of scan: the rest is picture data
    o = end;
  }
  if (!errors.length && !(b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9)) errors.push("the JPEG file is cut off (it has no end marker)");
  if (!width || !height) errors.push("the JPEG has no readable size");
  return { width, height, data: concat(keep), stripped, errors };
}

// ---------- WebP ----------
function checkWebp(b: Uint8Array): { width: number; height: number; data: Uint8Array; stripped: string[]; errors: string[] } {
  const errors: string[] = []; const stripped: string[] = []; const chunks: { type: string; bytes: Uint8Array }[] = [];
  let width = 0, height = 0, o = 12;
  while (o + 8 <= b.length) {
    const type = tag(b, o), len = le32(b, o + 4), padded = len + (len & 1), end = o + 8 + padded;
    if (o + 8 + len > b.length) { errors.push("the WebP file is cut off"); break; }
    const body = b.slice(o + 8, o + 8 + len);
    if (type === "ANIM" || type === "ANMF") { errors.push("animated WebP is not allowed"); break; }
    if (type === "VP8X") { if (body[0] & 0x02) { errors.push("animated WebP is not allowed"); break; } width = (body[4] | (body[5] << 8) | (body[6] << 16)) + 1; height = (body[7] | (body[8] << 8) | (body[9] << 16)) + 1; }
    if (type === "VP8 " && !width) { width = (body[6] | (body[7] << 8)) & 0x3fff; height = (body[8] | (body[9] << 8)) & 0x3fff; }
    if (type === "VP8L" && !width) { const bits = body[1] | (body[2] << 8) | (body[3] << 16) | (body[4] << 24); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1; }
    if (type === "EXIF" || type === "XMP ") stripped.push(`WebP ${type.trim()}`); else chunks.push({ type, bytes: b.slice(o, o + 8 + padded) });
    o = end;
  }
  if (stripped.length) for (const c of chunks) if (c.type === "VP8X") c.bytes[8] = c.bytes[8] & ~0x0c;       // clear the EXIF and XMP flags
  const body = concat(chunks.map((c) => c.bytes)); const out = new Uint8Array(12 + body.length);
  out.set(b.slice(0, 4), 0); out.set(b.slice(8, 12), 8); out.set(body, 12);
  const size = out.length - 8; out[4] = size & 0xff; out[5] = (size >> 8) & 0xff; out[6] = (size >> 16) & 0xff; out[7] = (size >>> 24) & 0xff;
  if (!width || !height) errors.push("the WebP has no readable size");
  return { width, height, data: out, stripped, errors };
}

// ---------- SVG: nothing active, nothing external ----------
const SVG_BAD: [string, RegExp][] = [
  ["a script", /<\s*script\b/i], ["foreignObject (embedded web page)", /<\s*foreignObject\b/i], ["an iframe, object or embed", /<\s*(iframe|object|embed)\b/i], ["an event handler (onclick, onload...)", /\son[a-z]+\s*=/i],
  ["a javascript: link", /javascript\s*:/i], ["an entity declaration", /<!\s*(ENTITY|DOCTYPE[^>]*\[)/i], ["a CSS @import", /@import/i], ["an animation tag (animate, set)", /<\s*(animate|animateTransform|animateMotion|set)\b/i],
];
function checkSvg(b: Uint8Array): { width: number; height: number; data: Uint8Array; stripped: string[]; errors: string[] } {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(b); const errors: string[] = []; const stripped: string[] = [];
  for (const [name, re] of SVG_BAD) if (re.test(text)) errors.push(`the SVG contains ${name}`);
  for (const m of text.matchAll(/\b(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi)) if (!/^#|^data:image\/(png|jpeg|webp);base64,/i.test(m[1].trim())) errors.push(`the SVG links to something outside itself (${m[1].slice(0, 40)})`);
  for (const m of text.matchAll(/url\(\s*["']?([^)"']*)/gi)) if (!m[1].trim().startsWith("#") && !/^data:image\/(png|jpeg|webp);base64,/i.test(m[1].trim())) errors.push(`the SVG loads something outside itself (${m[1].slice(0, 40)})`);
  const svg = /<svg\b[^>]*>/i.exec(text)?.[0] ?? "";
  const num = (a: string) => { const m = new RegExp(`\\b${a}\\s*=\\s*["']\\s*([\\d.]+)\\s*(?:px)?\\s*["']`, "i").exec(svg); return m ? Math.round(Number(m[1])) : 0; };
  let width = num("width"), height = num("height");
  if (!width || !height) { const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(svg); if (vb) { width = Math.round(Number(vb[1])); height = Math.round(Number(vb[2])); } }
  let clean = text.replace(/<!--[\s\S]*?-->/g, () => { if (!stripped.includes("SVG comments")) stripped.push("SVG comments"); return ""; });
  clean = clean.replace(/<metadata[\s\S]*?<\/metadata>/gi, () => { stripped.push("SVG metadata"); return ""; });
  if (!width || !height) errors.push("the SVG has no readable size (give it a width and height or a viewBox)");
  return { width, height, data: new TextEncoder().encode(clean), stripped, errors };
}

/**
 * Check one uploaded file. `declaredMime` is what the uploader's tool said it was; it must agree with the bytes. On success the returned `data` is what to store: metadata
 * stripped, and `sha256` is the hash of exactly those bytes (so the version hash of an article pins the stored file, not the upload).
 */
export function checkImageFile(input: Uint8Array, name: string, declaredMime?: string): ImageCheck {
  const errors: string[] = [];
  if (input.length === 0) return { ok: false, errors: ["the file is empty"] };
  if (input.length > MAX_IMAGE_BYTES) return { ok: false, errors: [`the file is ${(input.length / 1048576).toFixed(1)} MB; the limit is 10 MB`] };
  const mime = detectMime(input);
  if (!mime) return { ok: false, errors: ["the file is not a PNG, JPEG, WebP or SVG image"] };
  if (declaredMime && declaredMime !== mime) errors.push(`the file says it is ${declaredMime} but it is really ${mime}`);
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase();
  if (ext && ![EXT[mime], ...(mime === "image/jpeg" ? ["jpeg"] : [])].includes(ext)) errors.push(`the file name ends in .${ext} but the file is ${mime}`);
  const r = mime === "image/png" ? checkPng(input) : mime === "image/jpeg" ? checkJpeg(input) : mime === "image/webp" ? checkWebp(input) : checkSvg(input);
  errors.push(...r.errors);
  if (r.width && r.height && mime !== "image/svg+xml" && (Math.min(r.width, r.height) < MIN_SIDE_PX || Math.max(r.width, r.height) > MAX_SIDE_PX)) errors.push(`the picture is ${r.width} x ${r.height} px; sides must be between ${MIN_SIDE_PX} and ${MAX_SIDE_PX} px`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, mime, ext: EXT[mime], width: r.width, height: r.height, bytes: r.data.length, sha256: sha256Bytes(r.data), data: r.data, stripped: r.stripped };
}
