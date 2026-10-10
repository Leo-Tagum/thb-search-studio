// Deterministic content checks on one post body. Reuses the Phase 2 brand-fact / rating-rule patterns (not rewritten).
// Every finding carries the exact text matched so a human can judge it. Legal-claim and filler checks are heuristics.
import { PENDING_JUAN_PATTERNS, RATING_RULE_PATTERN, SOURCED_FACTS } from "../agents/bridge";
import { officialHost } from "../agents/official-sources";
import { extractImages, extractLinks, hasAuthorBox, hasSourcesSection, hostOf, htmlToText } from "./structure";

// Leo 2026-10-10: his list + homevestors, webuyuglyhouses, sundae, houzeo, zillow (offers). Local cash buyers to be added later.
export const COMPETITOR_DOMAINS = [
  "redfin.com", "zillow.com", "opendoor.com", "offerpad.com", "realtor.com", "trulia.com", "compass.com", "homelight.com",
  "homevestors.com", "webuyuglyhouses.com", "sundae.com", "houzeo.com",
];

// editorial-standards section 4 banned/generic phrases plus a few common fillers. Advisory only.
const FILLER: string[] = [
  "can be stressful", "we buy houses fast", "we make selling easy", "contact us today", "fair offer", "hassle-free", "hassle free", "stress-free", "stress free",
  "look no further", "in today's market", "in today’s market", "sell your house quickly", "sell your home quickly", "sell your inherited house quickly",
  "navigate the complex", "whether you're", "whether you’re", "unlock the", "game-changer", "at the end of the day",
];

const LEGAL = /\b(probate|statute|california\s+(civil|revenue|health|business|probate)\s+code|civil\s+code|section\s+\d{3,}|AB\s?\d+|SB\s?\d+|capital\s+gains|1031\s+exchange|transfer\s+tax|property\s+tax(es)?|proposition\s+\d+|prop\s+\d+|disclosure\s+(law|requirement|form)s?|natural\s+hazard\s+disclosure|must\s+disclose|legally\s+(required|obligated)|lien|code\s+violation|homestead|stepped[- ]up\s+basis|unpermitted|rent\s+control|just\s+cause|tenant\s+rights|eviction)\b/gi;
const PRO_CONFIRM = /(attorney|lawyer|\bcpa\b|tax\s+(professional|advisor|preparer)|title\s+company|licensed\s+professional|consult\s+(with\s+)?(a|an|your)\s+\w+|confirm\s+with)/i;

export type Hit = { text: string; context: string };
export type Findings = {
  competitors: { kind: "link" | "image"; domain: string; url: string }[];
  pendingFacts: { fact: string; hit: Hit }[];
  sourcedFactIssues: string[];
  ratingHits: Hit[];
  legal: { count: number; samples: Hit[]; officialLinks: string[]; professionalConfirmation: boolean; unsourced: boolean };
  missingSources: boolean;
  missingAuthorBox: boolean;
  filler: { phrase: string; count: number }[];
};

const ctx = (text: string, i: number, len: number) => text.slice(Math.max(0, i - 50), i + len + 50).replace(/\s+/g, " ").trim();
function all(re: RegExp, text: string): Hit[] {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return [...text.matchAll(g)].slice(0, 5).map((m) => ({ text: m[0], context: ctx(text, m.index ?? 0, m[0].length) }));
}

/** `ownText` lets the caller pass the post text with shared template blocks already removed (HTML-based checks still see the full HTML). */
export function runChecks(html: string, ownText?: string): Findings {
  const text = ownText ?? htmlToText(html);
  const competitors: Findings["competitors"] = [];
  const isComp = (h: string | null) => (h ? COMPETITOR_DOMAINS.find((d) => h === d || h.endsWith("." + d) || h.endsWith("-" + d)) : undefined);
  for (const l of extractLinks(html)) { const d = isComp(hostOf(l.href)); if (d) competitors.push({ kind: "link", domain: d, url: l.href }); }
  for (const s of extractImages(html)) { const d = isComp(hostOf(s)); if (d) competitors.push({ kind: "image", domain: d, url: s }); }

  const pendingFacts = PENDING_JUAN_PATTERNS.flatMap(([fact, re]) => all(re, text).map((hit) => ({ fact, hit })));
  const sourcedFactIssues: string[] = [];
  for (const f of SOURCED_FACTS) if (f.mentions.test(text) && !text.includes(f.exact)) sourcedFactIssues.push(`${f.name}: mentioned but not in the exact approved wording "${f.exact}"`);
  if (/(founded|established|started|began operations|in business)[^."\n]{0,40}2002/i.test(text)) sourcedFactIssues.push("2002 appears as a company founding year (it is Juan's experience start)");
  const ratingHits = all(RATING_RULE_PATTERN, text);

  const legalHits = all(LEGAL, text);
  const legalCount = [...text.matchAll(new RegExp(LEGAL.source, "gi"))].length;
  const officialLinks = extractLinks(html).map((l) => l.href).filter((h) => { const x = hostOf(h); return x ? officialHost(x).ok : false; });
  const professionalConfirmation = PRO_CONFIRM.test(text);
  const lower = text.toLowerCase();
  const filler = FILLER.map((phrase) => ({ phrase, count: lower.split(phrase).length - 1 })).filter((f) => f.count > 0);

  return {
    competitors, pendingFacts, sourcedFactIssues, ratingHits,
    legal: { count: legalCount, samples: legalHits, officialLinks, professionalConfirmation, unsourced: legalCount >= 2 && officialLinks.length === 0 },
    missingSources: !hasSourcesSection(html), missingAuthorBox: !hasAuthorBox(html), filler,
  };
}

/** Issues fixable on the same URL (these drive an UPDATE). */
export function blockingIssues(f: Findings): string[] {
  const out: string[] = [];
  if (f.competitors.length) out.push(`links/images to competitor sites (${[...new Set(f.competitors.map((c) => c.domain))].join(", ")})`);
  if (f.pendingFacts.length) out.push(`pending/unapproved brand facts (${[...new Set(f.pendingFacts.map((p) => p.fact))].join("; ")})`);
  if (f.sourcedFactIssues.length) out.push(...f.sourcedFactIssues);
  if (f.ratingHits.length) out.push("typed star rating / review count (permanent rating rule)");
  if (f.legal.unsourced) out.push(`${f.legal.count} legal/tax/permit-type statements with no official source link (heuristic)`);
  if (f.legal.count >= 2 && !f.legal.professionalConfirmation) out.push('legal/tax-type content without "confirm with a professional" language (editorial standards section 5)');
  return out;
}
/** Advisory only; never decides a verdict alone. */
export function advisoryIssues(f: Findings): string[] {
  const out: string[] = [];
  if (f.missingSources) out.push("no Sources section found in the body");
  if (f.missingAuthorBox) out.push("no author box found in the body (the theme may render one outside the content)");
  if (f.filler.length) out.push(`generic filler phrases: ${f.filler.map((x) => `"${x.phrase}" x${x.count}`).join(", ")}`);
  return out;
}

/** Brand-rule hits inside one shared (template) segment; reported once site-wide instead of once per post. */
export function segmentRuleHits(segment: string): string[] {
  const out: string[] = [];
  for (const [name, re] of PENDING_JUAN_PATTERNS) if (re.test(segment)) out.push(`pending brand fact: ${name}`);
  if (RATING_RULE_PATTERN.test(segment)) out.push("typed star rating / review count (permanent rating rule)");
  for (const f of SOURCED_FACTS) if (f.mentions.test(segment) && !segment.includes(f.exact.toLowerCase())) out.push(`${f.name} not in exact approved wording`);
  return out;
}
