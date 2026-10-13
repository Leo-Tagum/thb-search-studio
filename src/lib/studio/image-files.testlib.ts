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
