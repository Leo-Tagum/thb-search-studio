// Structural facts from a stored post body (HTML). Pure; the body is untrusted data and is only parsed, never executed.
import { normalizeUrl } from "../engine/match";

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: "-", mdash: "-", hellip: "..." };
export const decodeEntities = (s: string) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);

export function htmlToText(html: string): string {
  return decodeEntities(
    html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<\/(p|div|h[1-6]|li|tr|br)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "),
  ).replace(/[ \t ]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
export const wordCount = (text: string) => (text.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;

export type Link = { href: string; text: string };
export function extractLinks(html: string): Link[] {
  return [...html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ href: decodeEntities(m[1]).trim(), text: htmlToText(m[2]) }));
}
export const extractImages = (html: string): string[] => [...html.matchAll(/<img\b[^>]*?src\s*=\s*["']([^"']+)["']/gi)].map((m) => decodeEntities(m[1]).trim());

export const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; } };
export const isInternal = (href: string, siteHost: string) => (href.startsWith("/") && !href.startsWith("//")) || hostOf(href) === siteHost.replace(/^www\./, "");

/** Normalized (matchPages-style) keys of internal link targets; anchors, mailto/tel, media files and self-links are ignored. */
export function internalTargets(html: string, siteBase: string, selfUrl: string): string[] {
  const host = new URL(siteBase).hostname;
  const out = new Set<string>();
  for (const l of extractLinks(html)) {
    if (/^(mailto:|tel:|#|javascript:)/i.test(l.href)) continue;
    if (!isInternal(l.href, host)) continue;
    const abs = new URL(l.href, siteBase).toString();
    if (/\.(jpg|jpeg|png|gif|webp|svg|pdf)(\?|$)/i.test(abs)) continue;
    const n = normalizeUrl(abs);
    if (n !== normalizeUrl(selfUrl)) out.add(n);
  }
  return [...out];
}

export const hasSourcesSection = (html: string) => /<h[1-6][^>]*>\s*(<[^>]+>\s*)*(sources?|references?|citations?)\b/i.test(html);
/** Heuristic: the theme may render an author box outside post content, so "not found" means not found in the body. */
export const hasAuthorBox = (html: string) => /(about\s+the\s+author|written\s+by|author\s*bio|reviewed\s+by|class=["'][^"']*author[-_ ]?(box|bio)|\bby\s+juan\s+diaz)/i.test(html);

const segs = (text: string) => [...new Set(text.split(/\n|(?<=[.!?])\s+/).map((x) => x.trim().toLowerCase()).filter((x) => x.split(/\s+/).length >= 3))];

/** Segments (lines/sentences, 3+ words) that appear in at least `minPosts` posts: template or reusable blocks, not the post's own writing. */
export function findBoilerplate(texts: string[], minPosts = 8): Map<string, number> {
  const df = new Map<string, number>();
  for (const t of texts) for (const x of segs(t)) df.set(x, (df.get(x) ?? 0) + 1);
  return new Map([...df].filter(([, n]) => n >= minPosts));
}
/** The post's own text: shared template segments removed. */
export function stripBoilerplate(text: string, shared: Map<string, number>): string {
  return text.split("\n").map((line) => line.split(/(?<=[.!?])\s+/).filter((x) => !shared.has(x.trim().toLowerCase())).join(" ").trim()).filter(Boolean).join("\n");
}
