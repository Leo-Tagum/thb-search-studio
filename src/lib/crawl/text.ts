// Small text helpers for the crawler: markdown from blocks, sections, normalization, similarity. No parsing packages.
import type { Block } from "./types";

export const norm = (s: string) =>
  s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/&nbsp;/g, " ").replace(/[^a-z0-9$%+.' ]+/g, " ").replace(/\s+/g, " ").trim();

const STOP = new Set(("a an the and or but if of to in on at by for with from as is are was were be been it its this that these those you your we our they their i my me us he she his her not no do does did can could will would should may might have has had so than then there here what which who whom when where how why also into over out up down about more most any all each other such only own same too very just")
  .split(" "));

export const words = (s: string): string[] => norm(s).split(" ").filter(Boolean);
export const contentWords = (s: string): Set<string> => new Set(words(s).filter((w) => w.length > 2 && !STOP.has(w)));
export const wordCount = (blocks: Block[]) => blocks.reduce((n, b) => n + (b.t === "table" ? b.rows.flat().join(" ").split(/\s+/).filter(Boolean).length : b.text.split(/\s+/).filter(Boolean).length), 0);

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
/** Fraction of a that is in b. */
export function containment(a: Set<string>, b: Set<string>): number {
  if (!a.size) return 0;
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  return inter / a.size;
}

export function toMarkdown(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.t === "h") out.push(`${"#".repeat(Math.min(Math.max(b.level, 1), 6))} ${b.text}`, "");
    else if (b.t === "p") out.push(b.text, "");
    else if (b.t === "li") out.push(`- ${b.text}`);
    else {
      const rows = b.rows.filter((r) => r.length);
      if (!rows.length) continue;
      const w = Math.max(...rows.map((r) => r.length));
      const pad = (r: string[]) => `| ${Array.from({ length: w }, (_, i) => (r[i] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`;
      out.push("", pad(rows[0]), `|${" --- |".repeat(w)}`, ...rows.slice(1).map(pad), "");
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export type Section = { heading: string; level: number; blocks: Block[]; text: string; words: number };

/** Splits main content into sections at every heading; text before the first heading is the "(intro)" section. */
export function toSections(blocks: Block[]): Section[] {
  const secs: Section[] = []; let cur: Section = { heading: "(intro)", level: 0, blocks: [], text: "", words: 0 };
  const flush = () => { if (cur.blocks.length || cur.heading !== "(intro)") secs.push(cur); };
  for (const b of blocks) {
    if (b.t === "h") { flush(); cur = { heading: b.text, level: b.level, blocks: [], text: "", words: 0 }; } else cur.blocks.push(b);
  }
  flush();
  for (const s of secs) { s.text = s.blocks.map((b) => (b.t === "table" ? b.rows.map((r) => r.join(" ")).join(" ") : b.text)).join(" "); s.words = s.text.split(/\s+/).filter(Boolean).length; }
  return secs;
}

export const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
export const slugOf = (url: string) => { try { return new URL(url).pathname.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9-]+/gi, "-") || "home"; } catch { return "page"; } };
