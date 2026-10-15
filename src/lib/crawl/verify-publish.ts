// Post-publish verification: after the approved sections are pasted into a page, a fresh crawl must show (1) each section live with the exact text, in the right place,
// (2) nothing else on the page changed, (3) the page-level fields unchanged. Pure functions over two PageRead objects (before and after); no network.
import { parseJsonLd } from "./analyze";
import { wordCount } from "./text";
import type { Block, PageRead } from "./types";

export type ManifestSection = {
  id: string; source: string;
  /** Heading level the draft uses (H2 or H3). A different level on the page is a warning, not a failure. */
  level: number; heading: string;
  /** The heading that must be the nearest one BEFORE this section, and the heading that must follow the section. */
  afterHeading: string; beforeHeading: string;
  /** The exact text to paste, as markdown: a heading line, paragraphs, "- " bullets and pipe tables. */
  markdown: string;
  /** Links the pasted text is meant to contain (absolute URLs). Any other change in the page's links fails the check. */
  expectedLinks?: string[];
};
export type ManifestPage = { url: string; slug: string; editor: string; sections: ManifestSection[]; ignoreHeadings?: string[] };
export type Manifest = { generated: string; note: string; pages: ManifestPage[] };
export type Check = { name: string; ok: boolean; detail: string; warn?: boolean };
export type PageVerdict = { url: string; ok: boolean; checks: Check[] };

/** Folds typographic quotes and dashes and collapses whitespace, so a CMS that curls quotes does not fail a match. */
export const fold = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const clean = (s: string) => fold(s.replace(/\*\*/g, "").replace(/`/g, "").replace(/(^|\s)\*(\S)/g, "$1$2"));

/** Parses the section markdown into blocks: heading, then p / li / table blocks. */
export function parseSection(md: string): { level: number; heading: string; blocks: Block[] } {
  const lines = md.split(/\r?\n/); let level = 0, heading = ""; const blocks: Block[] = []; let table: string[][] | null = null;
  const flush = () => { if (table) { blocks.push({ t: "table", rows: table }); table = null; } };
  for (const raw of lines) {
    const l = raw.trimEnd(); if (!l.trim()) { flush(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h && !heading) { level = h[1].length; heading = clean(h[2]); continue; }
    if (/^\|/.test(l)) { if (/^\|\s*:?-{2,}/.test(l)) continue; (table ??= []).push(l.replace(/^\||\|$/g, "").split("|").map((c) => clean(c))); continue; }
    flush();
    const li = /^[-*]\s+(.*)$/.exec(l);
    if (li) blocks.push({ t: "li", text: clean(li[1]) }); else blocks.push({ t: "p", text: clean(l) });
  }
  flush();
  return { level, heading, blocks };
}

const key = (b: Block): string => (b.t === "h" ? `h${b.level}:${fold(b.text)}` : b.t === "table" ? "table:" + b.rows.map((r) => r.map(fold).join("|")).join("//") : `${b.t}:${fold(b.text)}`);
const blockWords = (b: Block) => wordCount([b]);

/** Drops every block under a heading that matches an ignore pattern (for example a blog-feed widget), up to the next heading. */
function withoutIgnored(blocks: Block[], ignore: string[]): Block[] {
  const out: Block[] = []; let skipping = false;
  for (const b of blocks) {
    if (b.t === "h") skipping = ignore.some((p) => fold(b.text).toLowerCase().startsWith(p.toLowerCase()));
    if (!skipping) out.push(b);
  }
  return out;
}

function lcsDiff(a: string[], b: string[]): { removed: string[]; added: string[] } {
  const n = a.length, m = b.length; const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const removed: string[] = [], added: string[] = []; let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) removed.push(a[i++]); else added.push(b[j++]); }
  while (i < n) removed.push(a[i++]); while (j < m) added.push(b[j++]);
  return { removed, added };
}

export function verifyPage(before: PageRead, after: PageRead, page: ManifestPage): PageVerdict {
  const checks: Check[] = []; const add = (name: string, ok: boolean, detail: string, warn = false) => checks.push({ name, ok, detail, warn });
  if (!after.ok || !after.rendered) return { url: page.url, ok: false, checks: [{ name: "page read", ok: false, detail: `fresh crawl failed: ${after.failure ?? "no content"}` }] };
  if (!before.ok || !before.rendered) return { url: page.url, ok: false, checks: [{ name: "baseline", ok: false, detail: "no completed baseline crawl to compare with" }] };
  add("page read", after.status === 200, `HTTP ${after.status}, ${after.words} words (baseline ${before.words})`);
  const aBlocks = after.rendered.blocks; const removeIdx = new Set<number>(); let expectedWords = 0;

  for (const s of page.sections) {
    const exp = parseSection(s.markdown); const want = [{ t: "h", level: exp.level, text: exp.heading } as Block, ...exp.blocks];
    expectedWords += want.reduce((n, b) => n + blockWords(b), 0);
    const hi = aBlocks.findIndex((b) => b.t === "h" && fold(b.text) === exp.heading);
    if (hi < 0) { add(`${s.id}: section live`, false, `heading "${exp.heading}" not found on the page`); continue; }
    const hb = aBlocks[hi] as Extract<Block, { t: "h" }>;
    if (hb.level !== exp.level) add(`${s.id}: heading level`, true, `page shows H${hb.level}, draft says H${exp.level} (fine if intended)`, true);
    let ok = true; const bad: string[] = [];
    exp.blocks.forEach((eb, k) => { const ab = aBlocks[hi + 1 + k]; if (!ab || key(ab) !== key(eb)) { ok = false; bad.push(`block ${k + 1}: expected "${fold(eb.t === "table" ? "table" : (eb as { text: string }).text).slice(0, 70)}", found "${ab ? key(ab).slice(0, 90) : "nothing"}"`); } });
    const nextIdx = hi + 1 + exp.blocks.length; const next = aBlocks[nextIdx];
    add(`${s.id}: exact text`, ok, ok ? `${exp.blocks.length} blocks match` : bad.slice(0, 3).join(" | "));
    if (ok) for (let k = hi; k < nextIdx; k++) removeIdx.add(k);
    // position: the nearest heading before, and the heading after the section
    const prevH = [...aBlocks.slice(0, hi)].reverse().find((b) => b.t === "h") as Extract<Block, { t: "h" }> | undefined;
    add(`${s.id}: after heading`, !!prevH && fold(prevH.text) === fold(s.afterHeading), `nearest heading before is "${prevH?.text ?? "none"}", expected "${s.afterHeading}"`);
    const nextH = aBlocks.slice(nextIdx).find((b) => b.t === "h") as Extract<Block, { t: "h" }> | undefined;
    // another new section of this page may follow directly: skip over headings of expected sections
    const expectedHeadings = new Set(page.sections.map((x) => fold(parseSection(x.markdown).heading)));
    const nextReal = aBlocks.slice(nextIdx).find((b) => b.t === "h" && !expectedHeadings.has(fold(b.text))) as Extract<Block, { t: "h" }> | undefined;
    add(`${s.id}: before heading`, !!nextReal && fold(nextReal.text) === fold(s.beforeHeading), `next heading after is "${(nextReal ?? nextH)?.text ?? "none"}", expected "${s.beforeHeading}"${next ? "" : " (section ends the page)"}`);
  }

  // nothing else changed: remove the verified new blocks, compare the rest with the baseline
  const ignore = page.ignoreHeadings ?? [];
  const rest = withoutIgnored(aBlocks.filter((_, i) => !removeIdx.has(i)), ignore).map(key);
  const base = withoutIgnored(before.rendered.blocks, ignore).map(key);
  const d = lcsDiff(base, rest);
  add("nothing else changed (text)", d.removed.length === 0 && d.added.length === 0, d.removed.length + d.added.length === 0 ? `${base.length} other blocks identical to the baseline` : `removed ${d.removed.length}: ${d.removed.slice(0, 3).map((x) => x.slice(0, 80)).join(" | ")}; added ${d.added.length}: ${d.added.slice(0, 3).map((x) => x.slice(0, 80)).join(" | ")}`);

  const bR = before.rendered, aR = after.rendered; const same = (n: string, x: unknown, y: unknown) => add(`unchanged: ${n}`, JSON.stringify(x) === JSON.stringify(y), JSON.stringify(x) === JSON.stringify(y) ? "same" : `before ${JSON.stringify(x)?.slice(0, 80)} / after ${JSON.stringify(y)?.slice(0, 80)}`);
  same("title", bR.title, aR.title); same("meta description", bR.metaDescription, aR.metaDescription); same("H1", bR.h1s, aR.h1s); same("canonical", bR.canonical, aR.canonical); same("meta robots", bR.metaRobots, aR.metaRobots);
  same("schema types", parseJsonLd(bR.jsonLdRaw).map((j) => j.types), parseJsonLd(aR.jsonLdRaw).map((j) => j.types));
  same("forms", bR.forms.map((f) => `${f.method}:${f.fields}`), aR.forms.map((f) => `${f.method}:${f.fields}`));
  same("calls to action", bR.ctas.map((c) => `${c.text}|${c.href}`), aR.ctas.map((c) => `${c.text}|${c.href}`));
  const newLinks = page.sections.flatMap((s) => s.expectedLinks ?? []);
  same("links (in the page body; new links only where a section declares one)", [...bR.links.filter((l) => l.inMain).map((l) => l.href), ...newLinks].sort(), aR.links.filter((l) => l.inMain).map((l) => l.href).sort());
  const delta = after.words - before.words;
  add("word count change", Math.abs(delta - expectedWords) <= 12, `page grew by ${delta} words; the sections add about ${expectedWords}`);
  return { url: page.url, ok: checks.every((c) => c.ok), checks };
}
