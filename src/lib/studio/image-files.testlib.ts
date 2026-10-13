import { deflateSync } from "node:zlib";
// Synthetic image files for tests and the fixture dry run. Nothing here is a real picture and no real photo is ever used in a test.
const enc = (s: string) => new TextEncoder().encode(s);
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const be32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

export const pngChunk = (type: string, data: Uint8Array) => cat(be32(data.length), enc(type), data, new Uint8Array(4));
/** A minimal valid-looking PNG of the given size (the pixel data is a stub): enough for the checks, which read the header and the chunk list. `seed` makes files differ. */
export const makePng = (w: number, h: number, extra: Uint8Array[] = [], seed = 1) => cat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", cat(be32(w), be32(h), new Uint8Array([8, 2, 0, 0, 0]))), ...extra, pngChunk("IDAT", new Uint8Array([1, 2, 3, seed & 255])), pngChunk("IEND", new Uint8Array(0)));
const jseg = (marker: number, data: Uint8Array) => cat(new Uint8Array([0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 255]), data);
export const makeJpeg = (w: number, h: number, extra: Uint8Array[] = [], seed = 1) => cat(new Uint8Array([0xff, 0xd8]), jseg(0xe0, enc("JFIF\0\u0001\u0001")), ...extra, jseg(0xc0, new Uint8Array([8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0])), jseg(0xda, new Uint8Array([1, 1, 0, 0, 63, 0])), new Uint8Array([9, 9, seed & 255]), new Uint8Array([0xff, 0xd9]));
export const jpegSegment = jseg;
export const makeSvg = (inner = "", attrs = 'width="1600" height="900"') => enc(`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><rect width="10" height="10"/>${inner}</svg>`);
export const textBytes = enc;

const crcTable = (() => { const t: number[] = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const realChunk = (type: string, data: Uint8Array) => { const body = cat(enc(type), data); return cat(be32(data.length), body, be32(crc32(body))); };
export type Rect = { x: number; y: number; w: number; h: number; color: [number, number, number] };
/** A REAL, decodable PNG (so a browser shows it): a flat light background with simple colored rectangles. Synthetic: it is a drawing of boxes, not a photo. */
export function makeDrawnPng(w: number, h: number, rects: Rect[], extra: Uint8Array[] = []): Uint8Array {
  const rows = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { const o = y * (w * 3 + 1); rows[o] = 0; for (let x = 0; x < w; x++) { rows[o + 1 + x * 3] = 244; rows[o + 2 + x * 3] = 246; rows[o + 3 + x * 3] = 251; } }
  for (const r of rects) for (let y = r.y; y < Math.min(h, r.y + r.h); y++) for (let x = r.x; x < Math.min(w, r.x + r.w); x++) { const o = y * (w * 3 + 1) + 1 + x * 3; rows[o] = r.color[0]; rows[o + 1] = r.color[1]; rows[o + 2] = r.color[2]; }
  return cat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), realChunk("IHDR", cat(be32(w), be32(h), new Uint8Array([8, 2, 0, 0, 0]))), ...extra, realChunk("IDAT", new Uint8Array(deflateSync(rows))), realChunk("IEND", new Uint8Array(0)));
}
export const realTextChunk = (text: string) => realChunk("tEXt", enc(text));
