// Merge-review recommendation gates. Proposals only: nothing here edits WordPress, redirects, deletes or approves.
// Decision words come from docs/references/merge-groups-handoff.md: MAIN, REWRITE, REDIRECT RECOMMENDATION, REMOVE RECOMMENDATION, KEEP / AD.
// A page that cannot be read gets "BLOCKED: content not reviewed". A protected page can only be KEEP / AD.
import type { CompareResult } from "../crawl/compare";
import type { PageRead } from "../crawl/types";

export type Decision = "MAIN" | "REWRITE" | "REDIRECT RECOMMENDATION" | "REMOVE RECOMMENDATION" | "KEEP / AD" | "BLOCKED: content not reviewed" | "BLOCKED: no destination given";
export type Gsc = { clicks: number; impressions: number; position: number | null; queries: { query: string; clicks: number; impressions: number; position: number }[] } | null;
export type Inspection = { coverageState: string; lastCrawl: string | null; googleCanonical: string | null; verdict: string } | null;
export type PageEvidence = { url: string; protected: boolean; crawl: PageRead | null; gsc: Gsc; inspection: Inspection };
export type Recommendation = {
  url: string; decision: Decision; destination: string | null;
  /** For a redirect: BLOCKED while any blocker remains. A redirect is never READY from this tool alone. */
  redirectStatus: "BLOCKED" | "READY FOR OWNER SIGN-OFF" | null;
  blockers: string[]; evidence: string[]; whatIsLost: string[]; unsupportedClaims: string[];
  confidence: "High" | "Medium" | "Low"; confidenceWhy: string; unknown: string[];
};

const UNKNOWN = ["leads: unknown, Leo to fill", "backlinks: unknown, Leo to fill"];
const crawlOk = (c: PageRead | null) => !!c && c.ok && !!c.rendered && !!c.raw;

export function evidenceLines(e: PageEvidence): string[] {
  const out: string[] = [];
  out.push(e.gsc ? `12-month Search Console: ${e.gsc.clicks} clicks, ${e.gsc.impressions} impressions (context), average position ${e.gsc.position === null ? "n/a" : e.gsc.position.toFixed(1)}, ${e.gsc.queries.length} queries returned` : "12-month Search Console: not fetched");
  out.push(e.inspection ? `URL Inspection: ${e.inspection.coverageState} (${e.inspection.verdict}), last crawl ${e.inspection.lastCrawl ?? "none"}, Google canonical ${e.inspection.googleCanonical ?? "none"}. Index status is a hypothesis about cause, not proof of cannibalization.` : "URL Inspection: not available");
  out.push(`protected (Ads list): ${e.protected ? "YES" : "no (status 'unknown' in the studio means not on the list)"}`);
  return out;
}

export type Input = {
  page: PageEvidence;
  /** Present when this page is proposed to redirect into a destination. */
  destination?: PageEvidence;
  compare?: CompareResult;
  /** True when this page is itself the destination of another page's proposed redirect. */
  isDestination?: boolean;
  /** REWRITE needs all three; REMOVE needs noSensibleTarget plus a completed compare. Set by the owner, never inferred. */
  rewriteCriteria?: { distinctIntent: boolean; realSellerQuestion: boolean; substantiallyDifferentContent: boolean };
  noSensibleTarget?: boolean;
  ownerApproved?: boolean;
};

export function recommend(i: Input): Recommendation {
  const { page } = i;
  const base = { url: page.url, destination: null as string | null, redirectStatus: null as Recommendation["redirectStatus"], blockers: [] as string[], evidence: evidenceLines(page), whatIsLost: [] as string[], unsupportedClaims: [] as string[], unknown: UNKNOWN };
  if (page.protected) return { ...base, decision: "KEEP / AD", confidence: "High", confidenceWhy: "Protected page (Ads list): the only allowed decision.", blockers: ["Protected pages are never edited, merged, redirected or rewritten by us."] };

  if (!crawlOk(page.crawl)) return { ...base, decision: "BLOCKED: content not reviewed", confidence: "Low", confidenceWhy: "The page could not be read.", blockers: [`Crawl incomplete: ${page.crawl?.failure ?? "no crawl on file"}`] };

  if (i.destination) {
    const d = i.destination, blockers: string[] = [];
    if (d.protected) blockers.push("The destination is a protected page: nothing may be added to it, so no content can move there.");
    if (!crawlOk(d.crawl)) return { ...base, decision: "BLOCKED: content not reviewed", destination: d.url, confidence: "Low", confidenceWhy: "The destination could not be read.", blockers: [`Destination crawl incomplete: ${d.crawl?.failure ?? "no crawl on file"}`], evidence: [...base.evidence, ...evidenceLines(d).map((x) => `destination: ${x}`)] };
    if (!i.compare) return { ...base, decision: "BLOCKED: content not reviewed", destination: d.url, confidence: "Low", confidenceWhy: "No completed comparison.", blockers: ["Comparison of source and destination has not been run."] };
    const c = i.compare;
    for (const r of c.requiredUniqueContent) blockers.push(`Unique content only on the source, must move to the destination first (or the owner declares it INTENTIONALLY DROPPED): ${r.kind} "${r.label}" [${r.contentClass}]`);
    if (c.requiredUniqueContent.length) blockers.push("That content must be published on the destination and verified by a fresh crawl and comparison (a local draft is not proof the destination was updated).");
    if (!i.ownerApproved) blockers.push("The owner has not approved the final recommendation.");
    const lost = [
      ...c.sections.filter((s) => s.status === "ONLY_ON_SOURCE" && s.words >= 12).map((s) => `section only on source: "${s.heading}" (${s.words} words, ${s.contentClass})`),
      ...c.sections.filter((s) => s.status === "REWRITTEN").map((s) => `section partly present on destination (reworded): "${s.heading}" (best match ${s.bestMatch?.score})`),
      ...c.tables.onlyOnSource.map((t) => `table only on source: ${t.header.join(" | ")} (${t.rows} rows, ${t.contentClass})`),
      ...c.faqs.onlyOnSource.map((q) => `FAQ only on source: ${q}`),
      ...c.schema.onlyOnSource.map((s) => `schema type only on source: ${s}`),
    ];
    const thin = (page.gsc?.impressions ?? 0) < 100 && (d.gsc?.impressions ?? 0) < 1000;
    const confidence: Recommendation["confidence"] = thin || c.requiredUniqueContent.length ? "Low" : "Medium";
    const why = [thin ? "thin search data (source under 100 impressions)" : "", c.requiredUniqueContent.length ? `${c.requiredUniqueContent.length} unique content item(s) still to move` : "", "leads and backlinks unknown"].filter(Boolean).join("; ");
    return {
      ...base, decision: "REDIRECT RECOMMENDATION", destination: d.url, redirectStatus: blockers.length ? "BLOCKED" : "READY FOR OWNER SIGN-OFF", blockers,
      evidence: [...base.evidence, ...evidenceLines(d).map((x) => `destination: ${x}`)], whatIsLost: lost,
      unsupportedClaims: [...new Set(c.unsupportedOnlyOnSource.map((u) => `${u.kind} "${u.label}": ${u.claims.join(", ")}`).concat(c.claimsOnSource.map((x) => `${x.id}: "${x.match}"`)))],
      confidence, confidenceWhy: why,
    };
  }

  if (i.isDestination) return { ...base, decision: "MAIN", confidence: "Medium", confidenceWhy: "Stays as the destination; leads and backlinks unknown.", unsupportedClaims: [...new Set((page.crawl?.claims ?? []).map((x) => `${x.id}: "${x.match}"`))] };

  const rc = i.rewriteCriteria;
  if (rc && rc.distinctIntent && rc.realSellerQuestion && rc.substantiallyDifferentContent) return { ...base, decision: "REWRITE", confidence: "Low", confidenceWhy: "Owner confirmed all three REWRITE tests; leads and backlinks unknown.", unsupportedClaims: [...new Set((page.crawl?.claims ?? []).map((x) => `${x.id}: "${x.match}"`))] };
  if (i.noSensibleTarget && i.compare && (page.gsc?.clicks ?? 1) === 0) return { ...base, decision: "REMOVE RECOMMENDATION", confidence: "Low", confidenceWhy: "No clicks, no sensible target; leads and backlinks unknown.", blockers: ["Owner approval required; nothing is deleted by this tool."] };
  return { ...base, decision: "BLOCKED: no destination given", confidence: "Low", confidenceWhy: "No destination, no owner-confirmed REWRITE tests and no completed compare for REMOVE.", blockers: ["Give a destination page, or confirm the three REWRITE tests, or confirm there is no sensible target."] };
}
