// READ-ONLY. Verifies the privacy redactions in the evidence screenshots by looking at the PIXELS of the image file itself (the copy that is uploaded or was downloaded back), not at an overlay:
// every redaction rectangle recorded in evidence.json must be solid black in the JPEG. Also checks that no screenshot was saved for a page that still had a visible seller-identifying match.
// Decoding is done inside the installed Chrome (a canvas): no image package. Writes nothing.
//   npx tsx scripts/verify-evidence.mts <crawl dir with <slug>/evidence.json> [--files <dir with <slug>/shots copies>]
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { rectsAreSolid } from "../src/lib/crawl/privacy";

const argv = process.argv.slice(2); const root = argv.find((a) => !a.startsWith("--")); const filesDir = argv.includes("--files") ? argv[argv.indexOf("--files") + 1] : null;
if (!root) throw new Error("usage: verify-evidence.mts <crawl dir> [--files <dir>]");
const chromePath = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"].find((p) => existsSync(p));
if (!chromePath) throw new Error("local Chrome not found");
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const page = await (await browser.newContext()).newPage();
let bad = 0, checked = 0, rectTotal = 0;
for (const slug of readdirSync(root)) {
  const ef = `${root}/${slug}/evidence.json`; if (!existsSync(ef)) continue;
  const ev = JSON.parse(readFileSync(ef, "utf8"));
  const remaining = (ev.redaction.desktop?.remainingVisibleMatches ?? 0) + (ev.redaction.mobile?.remainingVisibleMatches ?? 0);
  if (remaining > 0 && ev.shots.length > 0) { console.log(`FAIL ${slug}: ${remaining} visible matches remained but screenshots were saved`); bad++; }
  for (const s of ev.shots as { kind: string; file: string; width: number; height: number; redactRects: { x: number; y: number; w: number; h: number }[] }[]) {
    const path = `${filesDir ?? root}/${slug}/shots/${s.file}`; if (!existsSync(path)) { console.log(`FAIL ${slug} ${s.kind}: file missing at ${path}`); bad++; continue; }
    if (s.redactRects.length === 0) { checked++; console.log(`ok   ${slug} ${s.kind}: no redaction boxes (nothing to check)`); continue; }   // decoding every full-page image is very slow and proves nothing here
    const b64 = readFileSync(path).toString("base64");
    const px = (await page.evaluate(`(async () => { const img = new Image(); img.src = "data:image/jpeg;base64,${b64}"; await img.decode(); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); return { w: img.width, h: img.height, data: Array.from(g.getImageData(0, 0, img.width, img.height).data) }; })()`)) as { w: number; h: number; data: number[] };
    checked++; rectTotal += s.redactRects.length;
    if (px.w !== s.width || px.h !== s.height) { console.log(`FAIL ${slug} ${s.kind}: image is ${px.w}x${px.h}, record says ${s.width}x${s.height}`); bad++; continue; }
    const r = rectsAreSolid({ w: px.w, h: px.h, data: Uint8ClampedArray.from(px.data) }, s.redactRects);
    console.log(`${r.ok ? "ok  " : "FAIL"} ${slug} ${s.kind}: ${s.redactRects.length} redaction box(es), darkest-share ${(r.worst * 100).toFixed(1)}%`); if (!r.ok) bad++;
  }
}
await browser.close();
console.log(`${checked} images checked, ${rectTotal} redaction boxes, ${bad ? bad + " problem(s)" : "all solid"}`);
process.exit(bad ? 1 : 0);
