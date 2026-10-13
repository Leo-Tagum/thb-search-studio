import { describe, expect, it } from "vitest";
import { checkImageFile, detectMime, MAX_IMAGE_BYTES, sha256Bytes } from "./image-files";

// Build step 6: uploaded files are checked as bytes. Every file below is synthetic (no real image, no real photo).
const enc = (s: string) => new TextEncoder().encode(s);
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const be32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const le32 = (n: number) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);

const pngChunk = (type: string, data: Uint8Array) => cat(be32(data.length), enc(type), data, new Uint8Array(4));
const png = (w: number, h: number, extra: Uint8Array[] = []) => cat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", cat(be32(w), be32(h), new Uint8Array([8, 2, 0, 0, 0]))), ...extra, pngChunk("IDAT", new Uint8Array([1, 2, 3])), pngChunk("IEND", new Uint8Array(0)));
const jseg = (marker: number, data: Uint8Array) => cat(new Uint8Array([0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 255]), data);
const jpeg = (w: number, h: number, extra: Uint8Array[] = []) => cat(new Uint8Array([0xff, 0xd8]), jseg(0xe0, enc("JFIF\0\u0001\u0001")), ...extra, jseg(0xc0, new Uint8Array([8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0])), jseg(0xda, new Uint8Array([1, 1, 0, 0, 63, 0])), new Uint8Array([9, 9, 9]), new Uint8Array([0xff, 0xd9]));
const wchunk = (type: string, data: Uint8Array) => cat(enc(type), le32(data.length), data, data.length & 1 ? new Uint8Array(1) : new Uint8Array(0));
const webp = (chunks: Uint8Array[]) => { const body = cat(enc("WEBP"), ...chunks); return cat(enc("RIFF"), le32(body.length), body); };
const vp8x = (w: number, h: number, flags: number) => wchunk("VP8X", new Uint8Array([flags, 0, 0, 0, (w - 1) & 255, ((w - 1) >> 8) & 255, ((w - 1) >> 16) & 255, (h - 1) & 255, ((h - 1) >> 8) & 255, ((h - 1) >> 16) & 255]));
const svg = (inner = "", attrs = 'width="1600" height="900"') => enc(`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><rect width="10" height="10"/>${inner}</svg>`);

describe("which file is what: the bytes decide, not the name", () => {
  it("recognizes PNG, JPEG, WebP and SVG, and refuses everything else", () => {
    expect(detectMime(png(1600, 900))).toBe("image/png");
    expect(detectMime(jpeg(1600, 900))).toBe("image/jpeg");
    expect(detectMime(webp([vp8x(1600, 900, 0)]))).toBe("image/webp");
    expect(detectMime(svg())).toBe("image/svg+xml");
    expect(detectMime(enc("GIF89a....."))).toBeNull();
    expect(detectMime(enc("%PDF-1.4"))).toBeNull();
    expect(checkImageFile(enc("GIF89a....."), "a.png")).toEqual({ ok: false, errors: ["the file is not a PNG, JPEG, WebP or SVG image"] });
  });
  it("a mismatch between the name or the declared type and the bytes is refused", () => {
    expect(checkImageFile(png(1600, 900), "a.jpg").ok).toBe(false);
    expect(checkImageFile(png(1600, 900), "a.png", "image/jpeg").ok).toBe(false);
    expect(checkImageFile(png(1600, 900), "a.png", "image/png").ok).toBe(true);
    expect(checkImageFile(jpeg(1600, 900), "a.jpeg").ok).toBe(true);
  });
  it("an empty file and a file over 10 MB are refused", () => {
    expect(checkImageFile(new Uint8Array(0), "a.png").ok).toBe(false);
    const big = cat(png(1600, 900), new Uint8Array(MAX_IMAGE_BYTES));
    const r = checkImageFile(big, "a.png"); expect(r.ok).toBe(false); if (!r.ok) expect(r.errors[0]).toContain("10 MB");
  });
});

describe("PNG", () => {
  it("reads the size and records the hash of the stored bytes", () => {
    const r = checkImageFile(png(1600, 900), "a.png");
    expect(r.ok && [r.width, r.height, r.mime, r.ext]).toEqual([1600, 900, "image/png", "png"]);
    if (r.ok) { expect(r.sha256).toBe(sha256Bytes(r.data)); expect(r.bytes).toBe(r.data.length); }
  });
  it("strips text chunks, EXIF and the time stamp, and says what it stripped; the picture data stays", () => {
    const dirty = png(1600, 900, [pngChunk("tEXt", enc("Comment\0 GPS 37.5,-122.2")), pngChunk("eXIf", enc("Exif\0\0")), pngChunk("tIME", new Uint8Array(7))]);
    const r = checkImageFile(dirty, "a.png");
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.stripped).toEqual(["PNG tEXt", "PNG eXIf", "PNG tIME"]); expect(new TextDecoder("latin1").decode(r.data)).not.toContain("GPS"); expect(new TextDecoder("latin1").decode(r.data)).toContain("IDAT"); expect(r.sha256).not.toBe(sha256Bytes(dirty)); }
  });
  it("refuses an animated PNG, a cut-off file and a picture that is too small or too large", () => {
    expect(checkImageFile(png(1600, 900, [pngChunk("acTL", new Uint8Array(8))]), "a.png").ok).toBe(false);
    expect(checkImageFile(png(1600, 900).slice(0, 40), "a.png").ok).toBe(false);
    expect(checkImageFile(png(100, 60), "a.png").ok).toBe(false);
    expect(checkImageFile(png(9000, 4000), "a.png").ok).toBe(false);
  });
});

describe("JPEG", () => {
  it("reads the size; strips EXIF/GPS, XMP and comments; keeps JFIF", () => {
    const dirty = jpeg(1600, 900, [jseg(0xe1, enc("Exif\0\0GPSLatitude=37.5")), jseg(0xfe, enc("made at 12 Main Street")), jseg(0xed, enc("Photoshop 3.0"))]);
    const r = checkImageFile(dirty, "a.jpg");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect([r.width, r.height]).toEqual([1600, 900]);
      const text = new TextDecoder("latin1").decode(r.data);
      expect(text).not.toContain("GPSLatitude"); expect(text).not.toContain("Main Street"); expect(text).toContain("JFIF");
      expect(r.stripped).toEqual(["JPEG EXIF/XMP", "JPEG comment", "JPEG APP13"]);
      expect(r.data[0]).toBe(0xff); expect(r.data[1]).toBe(0xd8); expect(r.data[r.data.length - 2]).toBe(0xff); expect(r.data[r.data.length - 1]).toBe(0xd9);
      expect(checkImageFile(r.data, "a.jpg").ok).toBe(true);        // the cleaned file is still a valid JPEG of the same size
    }
  });
  it("refuses a damaged JPEG", () => {
    expect(checkImageFile(jpeg(1600, 900).slice(0, 30), "a.jpg").ok).toBe(false);
  });
});

describe("WebP", () => {
  it("reads the size from the extended header and strips EXIF and XMP, clearing their flags", () => {
    const dirty = webp([vp8x(1600, 900, 0x0c), wchunk("VP8L", new Uint8Array([0x2f, 0, 0, 0, 0, 1, 2, 3])), wchunk("EXIF", enc("GPS 37.5")), wchunk("XMP ", enc("<x:xmpmeta/>"))]);
    const r = checkImageFile(dirty, "a.webp");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect([r.width, r.height]).toEqual([1600, 900]); expect(r.stripped).toEqual(["WebP EXIF", "WebP XMP"]);
      const text = new TextDecoder("latin1").decode(r.data); expect(text).not.toContain("GPS"); expect(text).not.toContain("xmpmeta");
      expect(r.data[20] & 0x0c).toBe(0);                                  // flags cleared
      const riffSize = r.data[4] | (r.data[5] << 8) | (r.data[6] << 16) | (r.data[7] << 24);
      expect(riffSize).toBe(r.data.length - 8);                           // the RIFF size is right again
    }
  });
  it("refuses an animated WebP", () => {
    expect(checkImageFile(webp([vp8x(1600, 900, 0x02), wchunk("ANIM", new Uint8Array(6))]), "a.webp").ok).toBe(false);
    expect(checkImageFile(webp([vp8x(1600, 900, 0), wchunk("ANMF", new Uint8Array(16))]), "a.webp").ok).toBe(false);
  });
});

describe("SVG: nothing active, nothing external", () => {
  it("a plain SVG passes, with its size from width and height or from the viewBox; comments and metadata are stripped", () => {
    const a = checkImageFile(svg(), "a.svg"); expect(a.ok && [a.width, a.height]).toEqual([1600, 900]);
    const b = checkImageFile(svg("", 'viewBox="0 0 1600 900"'), "a.svg"); expect(b.ok && [b.width, b.height]).toEqual([1600, 900]);
    const c = checkImageFile(svg("<!-- by Jo at 12 Main St --><metadata>GPS</metadata>"), "a.svg");
    expect(c.ok).toBe(true); if (c.ok) { expect(new TextDecoder().decode(c.data)).not.toMatch(/Main St|GPS/); expect(c.stripped).toEqual(["SVG comments", "SVG metadata"]); }
  });
  it("a script, foreignObject, event handler, javascript: link, animation, entity or @import is refused", () => {
    for (const inner of ["<script>alert(1)</script>", "<foreignObject><div/></foreignObject>", '<rect onload="x()"/>', '<a href="javascript:x()"><rect/></a>', '<animate attributeName="x"/>', "<style>@import 'x.css';</style>", "<iframe src='x'/>"]) expect(checkImageFile(svg(inner), "a.svg").ok, inner).toBe(false);
    expect(checkImageFile(enc('<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"/>'), "a.svg").ok).toBe(false);
  });
  it("a link or url() to anything outside the file is refused; a link inside it or to an embedded picture is fine", () => {
    expect(checkImageFile(svg('<image href="https://evil.example/x.png"/>'), "a.svg").ok).toBe(false);
    expect(checkImageFile(svg('<rect style="fill:url(https://evil.example/p)"/>'), "a.svg").ok).toBe(false);
    expect(checkImageFile(svg('<use href="#a"/><rect fill="url(#g)"/>'), "a.svg").ok).toBe(true);
    expect(checkImageFile(svg('<image href="data:image/png;base64,AAAA"/>'), "a.svg").ok).toBe(true);
  });
  it("an SVG with no size is refused", () => {
    expect(checkImageFile(svg("", ""), "a.svg").ok).toBe(false);
  });
});
