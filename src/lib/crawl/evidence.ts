// Evidence capture helpers (Playwright). Used only by scripts/crawl-pages.mts --evidence. Read-only: the page is scrolled (to load lazy images) and measured; privacy redactions are
// painted into the rendered copy before screenshots are taken, inside Chrome, so the saved image already carries solid black boxes (not an overlay added later).
import type { Browser, Page } from "playwright-core";
import { neutralName, PATTERN_SOURCES } from "./privacy";
import { FEATURES_JS, REDACT_JS } from "./evidence-in-page";

export type Rect = { x: number; y: number; w: number; h: number; kind: string };
export type ShotMeta = { kind: "desktop-top" | "desktop-full" | "mobile-top" | "mobile-full"; file: string; width: number; height: number; bytes: number; redactRects: Rect[] };
export type RedactReport = { counts: Record<string, number>; remaining: number; rects: Rect[]; pageHeight: number };

/** Scrolls top to bottom and back so lazy-loaded images appear. Scrolling is not a click: nothing is activated. */
export async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(`(async () => { document.documentElement.style.scrollBehavior = 'auto'; document.body.style.scrollBehavior = 'auto'; const h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight); for (let y = 0; y < h; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); for (let i = 0; i < 20 && window.scrollY > 1; i++) { window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 100)); } await new Promise((r) => setTimeout(r, 400)); })()`);
}
export const measureFeatures = (page: Page) => page.evaluate(`(${FEATURES_JS})()`) as Promise<Record<string, unknown>>;
export const redact = (page: Page) => page.evaluate(`(${REDACT_JS})(${JSON.stringify({ patterns: PATTERN_SOURCES })})`) as Promise<RedactReport>;

/** Re-encodes a screenshot inside Chrome (a canvas): no image package is needed. Returns the JPEG bytes and the scale applied. */
export async function downscale(browser: Browser, jpeg: Buffer, targetWidth: number | null, quality: number): Promise<{ buf: Buffer; width: number; height: number; scale: number }> {
  const ctx = await browser.newContext({ javaScriptEnabled: true }); const p = await ctx.newPage();
  try {
    const code = `(async () => { const b64 = ${JSON.stringify(jpeg.toString("base64"))}, tw = ${JSON.stringify(targetWidth)}, q = ${JSON.stringify(quality)}; const img = new Image(); img.src = "data:image/jpeg;base64," + b64; await img.decode(); const scale = tw && img.width > tw ? tw / img.width : 1; const w = Math.round(img.width * scale), h = Math.round(img.height * scale); const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h); return { data: c.toDataURL("image/jpeg", q).split(",")[1], width: w, height: h, scale }; })()`;
    const r = (await p.evaluate(code)) as { data: string; width: number; height: number; scale: number };
    return { buf: Buffer.from(r.data, "base64"), width: r.width, height: r.height, scale: r.scale };
  } finally { await ctx.close(); }
}

/** Takes the top-of-page and capped full-page screenshots of the current (already redacted) page and returns the files' bytes with their metadata. */
export async function shoot(browser: Browser, page: Page, url: string, which: "desktop" | "mobile", rects: Rect[], maxFullHeight = 8000): Promise<{ meta: ShotMeta; buf: Buffer }[]> {
  const vp = page.viewportSize()!; const outW = which === "desktop" ? 700 : null; const out: { meta: ShotMeta; buf: Buffer }[] = [];
  const full = (await page.evaluate("Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)")) as number;
  for (const part of ["top", "full"] as const) {
    const h = part === "top" ? vp.height : Math.min(full, maxFullHeight);
    const raw = await page.screenshot({ type: "jpeg", quality: 82, fullPage: part === "full", clip: { x: 0, y: 0, width: vp.width, height: h }, animations: "disabled", scale: "css" });
    const d = await downscale(browser, raw, outW, part === "top" ? 0.72 : 0.6);
    const kind = `${which}-${part}` as ShotMeta["kind"];
    // keep only the part of each box that falls inside the saved image (cards in a sideways carousel or below the height cap are not in the picture)
    const scaled = rects.map((r) => { const x0 = Math.max(0, r.x), x1 = Math.min(vp.width, r.x + r.w), y1 = Math.min(h, r.y + r.h); return { x: x0 * d.scale, y: r.y * d.scale, w: (x1 - x0) * d.scale, h: (y1 - r.y) * d.scale, kind: r.kind }; }).filter((r) => r.w > 20 && r.h > 20 && r.y >= 0);   // slivers under 20 px cannot hold legible text (a carousel arrow can overlap them)
    out.push({ buf: d.buf, meta: { kind, file: neutralName(`${url}|${kind}`, kind), width: d.width, height: d.height, bytes: d.buf.length, redactRects: scaled } });
  }
  return out;
}
