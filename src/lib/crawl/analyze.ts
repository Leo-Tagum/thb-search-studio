// Turns the raw extract and the rendered extract of one URL into the PageRead checks. Pure functions, no network.
import { scanClaims } from "./claims";
import { norm, toMarkdown, wordCount } from "./text";
import type { DocExtract, JsonLdInfo, MobileSummary, PageRead, RawChecks, RawVsRendered, TemplateIssue } from "./types";

export function parseJsonLd(raws: string[]): JsonLdInfo[] {
  return raws.map((raw) => {
    try {
      const data = JSON.parse(raw);
      const nodes: Record<string, unknown>[] = [];
      const visit = (n: unknown) => { if (Array.isArray(n)) n.forEach(visit); else if (n && typeof n === "object") { nodes.push(n as Record<string, unknown>); visit((n as Record<string, unknown>)["@graph"]); } };
      visit(data);
      const types = new Set<string>(); const questions: string[] = [];
      for (const n of nodes) {
        const t = n["@type"]; (Array.isArray(t) ? t : t ? [t] : []).forEach((x) => types.add(String(x)));
        if (n["@type"] === "Question" && typeof n.name === "string") questions.push(n.name);
        const me = n.mainEntity; (Array.isArray(me) ? me : me ? [me] : []).forEach((q) => { const o = q as Record<string, unknown>; if (o && o["@type"] === "Question" && typeof o.name === "string" && !questions.includes(o.name)) questions.push(o.name); });
      }
      return { ok: true, types: [...types].sort(), questions };
    } catch (e) { return { ok: false, types: [], questions: [], error: String((e as Error).message).slice(0, 120) }; }
  });
}

export function headingOrderIssues(h: { level: number; text: string }[]): string[] {
  const issues: string[] = []; let prev = 0;
  for (const x of h) { if (prev && x.level > prev + 1) issues.push(`H${prev} then H${x.level} ("${x.text.slice(0, 50)}")`); prev = x.level; }
  if (h.length && h[0].level !== 1 && h[0].level !== 2) issues.push(`first heading is H${h[0].level}`);
  return issues;
}

const pathKey = (u: string) => { try { const x = new URL(u); return x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/+$/, ""); } catch { return u; } };

export function rawChecks(raw: DocExtract, finalUrl: string | null, xRobotsTag: string | null, knownRedirected: string[] = []): RawChecks {
  const red = new Set(knownRedirected.map(pathKey));
  const own = raw.links.filter((l) => /(^|\.)twinhomebuyer\.com$/.test(safeHost(l.href)));
  return {
    canonical: raw.canonical, canonicalMatchesFinalUrl: raw.canonical && finalUrl ? pathKey(raw.canonical) === pathKey(finalUrl) : null,
    metaRobots: raw.metaRobots, xRobotsTag, hreflang: raw.hreflang, openGraph: raw.og, jsonLd: parseJsonLd(raw.jsonLdRaw),
    h1Count: raw.h1s.length, headingOrder: raw.headings.map((h) => `H${h.level}`), headingOrderIssues: headingOrderIssues(raw.headings),
    imagesMissingAlt: raw.images.filter((i) => i.alt === null).length, imagesEmptyAlt: raw.images.filter((i) => i.alt === "").length,
    // A link to the page itself (for example "#") is not a link to a redirected page.
    linksToKnownRedirected: [...new Set(own.filter((l) => red.has(pathKey(l.href)) && (!finalUrl || pathKey(l.href) !== pathKey(finalUrl))).map((l) => l.href))],
  };
}
const safeHost = (u: string) => { try { return new URL(u).hostname; } catch { return ""; } };

export function rawVsRendered(raw: DocExtract, rendered: DocExtract): RawVsRendered {
  const set = (xs: string[]) => new Set(xs.map(norm));
  const diff = (a: string[], b: string[]) => { const sb = set(b); const seen = new Set<string>(); return a.filter((x) => { const k = norm(x); if (!k || sb.has(k) || seen.has(k)) return false; seen.add(k); return true; }); };
  const bt = (d: DocExtract) => d.blocks.filter((b) => b.t !== "table").map((b) => (b as { text: string }).text);
  const hl = (d: DocExtract) => d.headings.map((h) => h.text);
  const ln = (d: DocExtract) => d.links.filter((l) => l.inMain).map((l) => l.href);
  return {
    onlyAfterJavaScript: { headings: diff(hl(rendered), hl(raw)), links: diff(ln(rendered), ln(raw)), blocks: diff(bt(rendered), bt(raw)).slice(0, 25) },
    onlyInRawHtml: { headings: diff(hl(raw), hl(rendered)), links: diff(ln(raw), ln(rendered)), blocks: diff(bt(raw), bt(rendered)).slice(0, 25) },
    rawWords: wordCount(raw.blocks), renderedWords: wordCount(rendered.blocks),
  };
}

/** Known template issues: the H1 repeated at the start of the hero paragraph, and a city-style meta description on a page whose address has no city. */
export function templateIssues(rendered: DocExtract, finalUrl: string | null): TemplateIssue[] {
  const out: TemplateIssue[] = [];
  const h1 = rendered.h1s[0];
  if (h1) {
    const n = norm(h1);
    const hero = rendered.blocks.filter((b) => b.t === "p").slice(0, 4).find((b) => { const t = norm((b as { text: string }).text); return t.length > n.length + 10 && t.startsWith(n); });
    if (hero) out.push({ id: "h1-in-hero-paragraph", detail: `A paragraph near the top starts with the H1 text: "${(hero as { text: string }).text.slice(0, 110)}"` });
  }
  const md = rendered.metaDescription ?? "";
  const m = /\b(?:cash\s+)?home\s+buyers?\s+in\s+([A-Z][A-Za-z.' -]{2,30})/.exec(md);
  if (m && finalUrl) {
    // The city template puts the page name where a city belongs ("cash home buyer in Relocation"): flag when the name after "in" is the page's own name.
    const name = norm(m[1]);
    const pageName = norm(`${rendered.h1s[0] ?? ""} ${rendered.title} ${new URL(finalUrl).pathname.replace(/[-/]+/g, " ")}`);
    if (name && pageName.includes(name.split(" ")[0])) out.push({ id: "city-style-meta-on-non-city-page", detail: `Meta description says "...home buyer in ${m[1].trim()}" but that is the page name, not a city: ${md.slice(0, 140)}` });
  }
  return out;
}

export function mobileSummary(status: number | null, m: DocExtract, desktop: DocExtract): MobileSummary {
  const dh = new Set(desktop.headings.map((h) => norm(h.text)));
  const mh = new Set(m.headings.map((h) => norm(h.text)));
  return { status, title: m.title, h1s: m.h1s, words: wordCount(m.blocks), headingCount: m.headings.length, headingsMissingVsDesktop: [...dh].filter((x) => !mh.has(x)) };
}

export function buildPageRead(i: {
  requestedUrl: string; finalUrl: string | null; redirectChain: { url: string; status: number }[]; status: number | null; fetchedAt: string; userAgent: string;
  raw: DocExtract | null; rendered: DocExtract | null; mobile: MobileSummary | null; xRobotsTag: string | null; knownRedirected?: string[]; failure?: string;
}): PageRead {
  const ok = !i.failure && !!i.raw && !!i.rendered && i.status === 200;
  const rendered = i.rendered;
  const text = rendered ? rendered.blocks.map((b) => (b.t === "table" ? b.rows.map((r) => r.join(" ")).join(" ") : b.text)).join("\n") : "";
  return {
    requestedUrl: i.requestedUrl, finalUrl: i.finalUrl, redirectChain: i.redirectChain, status: i.status, fetchedAt: i.fetchedAt, userAgent: i.userAgent, ok,
    ...(ok ? {} : { failure: i.failure ?? `HTTP ${i.status}` }),
    raw: i.raw, rendered, mobile: i.mobile,
    rawChecks: i.raw ? rawChecks(i.raw, i.finalUrl, i.xRobotsTag, i.knownRedirected) : null,
    rawVsRendered: i.raw && rendered ? rawVsRendered(i.raw, rendered) : null,
    templateIssues: rendered ? templateIssues(rendered, i.finalUrl) : [],
    claims: scanClaims(text), words: rendered ? wordCount(rendered.blocks) : 0, markdown: rendered ? toMarkdown(rendered.blocks) : "",
  };
}
