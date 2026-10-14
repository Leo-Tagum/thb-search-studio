// Compare a source page with a destination page (both already read). Pure. Tells missing content apart from content that was
// rewritten or reorganized, lists what a redirect would lose, and keeps unsupported claims apart from genuinely useful content.
import { claimDensity, scanClaims } from "./claims";
import { parseJsonLd } from "./analyze";
import { containment, contentWords, jaccard, norm, toSections, type Section } from "./text";
import type { Block, ClaimFinding, PageRead } from "./types";

export type SectionStatus = "PRESENT" | "REORGANIZED" | "REWRITTEN" | "ONLY_ON_SOURCE";
export type ContentClass = "useful" | "mixed" | "unsupported-claims";
export type SectionResult = {
  heading: string; level: number; words: number; status: SectionStatus;
  bestMatch: { heading: string; score: number } | null; coverageOnWholeDestination: number;
  contentClass: ContentClass; claims: ClaimFinding[];
};
export type TableInfo = { header: string[]; rows: number; claims: ClaimFinding[]; contentClass: ContentClass };
export type CompareResult = {
  sourceUrl: string; destinationUrl: string; sourceFinalUrl: string | null; destinationFinalUrl: string | null;
  sections: SectionResult[];
  destinationOnlySections: { heading: string; words: number }[];
  headings: { onlyOnSource: string[]; onlyOnDestination: string[] };
  tables: { onlyOnSource: TableInfo[]; onlyOnDestination: TableInfo[]; matched: number };
  faqs: { onlyOnSource: string[]; onlyOnDestination: string[]; matched: number };
  schema: { onlyOnSource: string[]; onlyOnDestination: string[]; both: string[] };
  /** Content a redirect would lose that is genuinely useful (or mixed): must be moved first, or declared INTENTIONALLY DROPPED by the owner. */
  requiredUniqueContent: { kind: "section" | "table" | "faq"; label: string; contentClass: ContentClass; words?: number }[];
  /** Content only on the source whose text is mostly unsupported claims: not a reason to transfer; flagged for removal or rewrite. */
  unsupportedOnlyOnSource: { kind: "section" | "table"; label: string; claims: string[] }[];
  /** Claims on either page (own-site claims, never evidence). */
  claimsOnSource: ClaimFinding[]; claimsOnDestination: ClaimFinding[];
};

export const THRESHOLDS = { samePresent: 0.55, partial: 0.3, reorganized: 0.7, minWordsToMatter: 12, faq: 0.6, table: 0.5 } as const;

function classify(text: string): { cls: ContentClass; claims: ClaimFinding[] } {
  const claims = scanClaims(text);
  if (!claims.length) return { cls: "useful", claims };
  const d = claimDensity(text);
  const ratio = d.sentences ? d.flagged / d.sentences : 0;
  return { cls: ratio >= 0.5 ? "unsupported-claims" : "mixed", claims };
}

const isQuestion = (t: string) => t.trim().endsWith("?") && t.length < 220;
const questionsOf = (r: PageRead): string[] => {
  const q = new Set<string>();
  // An H1 phrased as a question is a title, not an FAQ item.
  for (const b of r.rendered?.blocks ?? []) if (b.t !== "table" && !(b.t === "h" && b.level === 1) && isQuestion(b.text)) q.add(b.text.trim());
  for (const j of parseJsonLd(r.rendered?.jsonLdRaw ?? [])) j.questions.forEach((x) => q.add(x));
  return [...q];
};
const schemaTypes = (r: PageRead) => [...new Set(parseJsonLd(r.rendered?.jsonLdRaw ?? []).flatMap((j) => j.types))].sort();
const tablesOf = (blocks: Block[]) => blocks.filter((b): b is Extract<Block, { t: "table" }> => b.t === "table");
const tableWords = (rows: string[][]) => contentWords(rows.flat().join(" "));
const tableText = (rows: string[][]) => rows.map((r) => r.join(". ")).join(". ");

export function compare(source: PageRead, destination: PageRead): CompareResult {
  if (!source.rendered || !destination.rendered) throw new Error("compare needs a completed read of both pages");
  const sSecs = toSections(source.rendered.blocks), dSecs = toSections(destination.rendered.blocks);
  const destAll = contentWords(dSecs.map((s) => s.text).join(" "));
  const dSets = dSecs.map((s) => ({ s, set: contentWords(s.heading + " " + s.text) }));

  const sections: SectionResult[] = sSecs.map((s: Section) => {
    const set = contentWords(s.heading + " " + s.text);
    let best: { heading: string; score: number } | null = null;
    for (const d of dSets) { const sc = jaccard(set, d.set); if (!best || sc > best.score) best = { heading: d.s.heading, score: Math.round(sc * 100) / 100 }; }
    const cov = Math.round(containment(set, destAll) * 100) / 100;
    // A section with the same heading on the destination is never "missing": its text may be reworded, which is a different thing.
    const sameSec = s.heading === "(intro)" ? undefined : dSets.find((d) => norm(d.s.heading) === norm(s.heading));
    const sameScore = sameSec ? jaccard(set, sameSec.set) : 0;
    let status: SectionStatus;
    if ((best && best.score >= THRESHOLDS.samePresent) || sameScore >= 0.4) status = "PRESENT";
    else if (cov >= THRESHOLDS.reorganized) status = "REORGANIZED";
    else if ((best && best.score >= THRESHOLDS.partial) || sameSec) status = "REWRITTEN";
    else status = "ONLY_ON_SOURCE";
    const c = classify(s.text);
    return { heading: s.heading, level: s.level, words: s.words, status, bestMatch: best, coverageOnWholeDestination: cov, contentClass: c.cls, claims: c.claims };
  });
  const sAll = contentWords(sSecs.map((s) => s.text).join(" "));
  const destinationOnlySections = dSecs.filter((d) => containment(contentWords(d.heading + " " + d.text), sAll) < 0.5 && d.words >= THRESHOLDS.minWordsToMatter).map((d) => ({ heading: d.heading, words: d.words }));

  const hs = (r: PageRead) => (r.rendered!.headings).map((h) => h.text);
  const hn = (xs: string[]) => new Map(xs.map((x) => [norm(x), x]));
  const sh = hn(hs(source)), dh = hn(hs(destination));
  const headings = { onlyOnSource: [...sh].filter(([k]) => !dh.has(k)).map(([, v]) => v), onlyOnDestination: [...dh].filter(([k]) => !sh.has(k)).map(([, v]) => v) };

  const sT = tablesOf(source.rendered.blocks), dT = tablesOf(destination.rendered.blocks);
  const info = (t: { rows: string[][] }): TableInfo => { const c = classify(tableText(t.rows)); return { header: t.rows[0] ?? [], rows: t.rows.length, claims: c.claims, contentClass: c.cls }; };
  const sOnlyT = sT.filter((t) => !dT.some((d) => jaccard(tableWords(t.rows), tableWords(d.rows)) >= THRESHOLDS.table));
  const dOnlyT = dT.filter((d) => !sT.some((t) => jaccard(tableWords(t.rows), tableWords(d.rows)) >= THRESHOLDS.table));
  const tables = { onlyOnSource: sOnlyT.map(info), onlyOnDestination: dOnlyT.map(info), matched: sT.length - sOnlyT.length };

  const sQ = questionsOf(source), dQ = questionsOf(destination);
  const same = (a: string, b: string) => jaccard(contentWords(a), contentWords(b)) >= THRESHOLDS.faq;
  const faqs = { onlyOnSource: sQ.filter((q) => !dQ.some((d) => same(q, d))), onlyOnDestination: dQ.filter((q) => !sQ.some((s) => same(q, s))), matched: sQ.filter((q) => dQ.some((d) => same(q, d))).length };

  const sS = schemaTypes(source), dS = schemaTypes(destination);
  const schema = { onlyOnSource: sS.filter((x) => !dS.includes(x)), onlyOnDestination: dS.filter((x) => !sS.includes(x)), both: sS.filter((x) => dS.includes(x)) };

  const requiredUniqueContent: CompareResult["requiredUniqueContent"] = [];
  const unsupportedOnlyOnSource: CompareResult["unsupportedOnlyOnSource"] = [];
  for (const s of sections) {
    if (s.status !== "ONLY_ON_SOURCE" || s.words < THRESHOLDS.minWordsToMatter) continue;
    if (s.contentClass === "unsupported-claims") unsupportedOnlyOnSource.push({ kind: "section", label: s.heading, claims: [...new Set(s.claims.map((c) => c.id))] });
    else requiredUniqueContent.push({ kind: "section", label: s.heading, contentClass: s.contentClass, words: s.words });
  }
  for (const t of tables.onlyOnSource) {
    const label = `table: ${t.header.join(" | ")} (${t.rows} rows)`;
    if (t.contentClass === "unsupported-claims") unsupportedOnlyOnSource.push({ kind: "table", label, claims: [...new Set(t.claims.map((c) => c.id))] });
    else requiredUniqueContent.push({ kind: "table", label, contentClass: t.contentClass });
  }
  for (const q of faqs.onlyOnSource) requiredUniqueContent.push({ kind: "faq", label: q, contentClass: "useful" });

  return {
    sourceUrl: source.requestedUrl, destinationUrl: destination.requestedUrl, sourceFinalUrl: source.finalUrl, destinationFinalUrl: destination.finalUrl,
    sections, destinationOnlySections, headings, tables, faqs, schema, requiredUniqueContent, unsupportedOnlyOnSource,
    claimsOnSource: source.claims, claimsOnDestination: destination.claims,
  };
}
