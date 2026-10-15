// Flag rules for the review loop. A flag means "Leo should look at this"; it never changes a decision. Visual type is ONE input: a commercial family match (money page and
// city page) does not skip the geography, seller-problem and purpose checks. Protected pages stay binding.
import { INFORMATIONAL, citiesIn } from "../crawl/page-type";
import { COMMERCIAL, type Flag, type PageInfo, type PageType, type Proposed } from "./types";

const PURPOSE_RULES: [string, RegExp][] = [
  ["divorce", /\bdivorc/i], ["rental or tenants", /\b(rental|tenant|landlord)/i], ["inherited or probate", /\b(inherit|probate|estate|heir)/i], ["title or liens", /\b(title|lien|judgment)/i],
  ["as-is or repairs", /\b(as[- ]is|repairs?|fixer|bad condition|major repairs|damaged|old houses?)/i], ["foreclosure or hardship", /\b(foreclos|bankruptcy|hardship|behind on)/i],
  ["relocation", /\b(relocat|moving|leaving california)/i], ["process", /\b(how it works|how we buy|our process|steps)/i], ["buyer types or legitimacy", /\b(legit|credible|scam|ibuyer|red flags?|who are the cash buyers|cash buyers? (work|vs)|wholesaler)/i],
  ["timing", /\b(best time|when to sell|spring|fall)/i], ["pricing or offers", /\b(how much|price|pricing|worth)/i], ["buyer-side advice", /\b(mortgage|loan|budget|inspection checklist|home buying|renovation)/i],
  ["selling options", /\b(ways to sell|privately|by owner|realtor)/i],
];
export const purposesOf = (text: string): string[] => PURPOSE_RULES.filter(([, re]) => re.test(text)).map(([p]) => p);

// Statewide only when the heading offers the service across California ("We Buy Houses For Cash In California"). A guide title that merely mentions California ("How Cash Home Buyers Work in California")
// is not a service-area statement.
const SERVICE_AREA_CA = /\b(we buy (houses|homes)|we pay cash|sell (my|your) (house|home|property)|(sell|buy)ing? (houses|homes)|cash (offers?|home buyers?|buyers?)|sell (house|home)s? fast)\b[^:?|]{0,40}\b(in|across|throughout) california\b/i;
export function geographyOf(text: string, url: string): string {
  const c = citiesIn(`${text} ${url}`);
  if (c.length) return `city:${c[0]}`;
  if (SERVICE_AREA_CA.test(text) && !INFORMATIONAL.test(text) && !/\bbay area\b/i.test(text)) return "statewide";
  return "general";
}

export type FlagInput = { source: PageInfo; destination: PageInfo | null; isMG8Exception?: boolean };

export function flagsFor(i: FlagInput): { flags: Flag[]; proposed: Proposed } {
  const { source: s, destination: d } = i; const flags: Flag[] = [];
  const add = (id: string, rule: string, severity: Flag["severity"]) => flags.push({ id, rule, severity });
  if (s.protected) add("protected-source", "Rule: a protected (Ads list) page can only be KEEP / AD; it is the redirect source here.", "hold");
  if (d?.protected) add("protected-destination", "Rule: a protected page cannot receive content or be a redirect destination without Ads-team involvement.", "hold");
  for (const [label, p] of [["source", s], ["destination", d]] as const) if (p && p.confidence === "low") add(`low-confidence-${label}`, `Rule: the ${label} page type is low confidence (${p.visualType}).`, "confirm");
  for (const [label, p] of [["source", s], ["destination", d]] as const) if (p) {
    const commercial = COMMERCIAL.includes(p.visualType);
    if ((p.wpType === "post" && commercial) || (p.wpType === "page" && (p.visualType === "guide/blog" || p.visualType === "story/case study"))) add(`wp-visual-${label}`, `Rule: the ${label} looks like a ${p.visualType} but WordPress calls it a ${p.wpType}.`, "confirm");
  }
  if (d) {
    const sameFamily = s.visualType === d.visualType || (COMMERCIAL.includes(s.visualType) && COMMERCIAL.includes(d.visualType));
    if (!sameFamily) add("crosses-type", `Rule: the redirect crosses page types (${s.visualType} → ${d.visualType}).`, "hold");
    const sg = s.geography, dg = d.geography;
    if (sg.startsWith("city:") && dg === "general") add("geography-city-to-general", `Rule: a ${sg.slice(5)} page redirects to a general page, so the place is lost.`, "hold");
    else if (sg.startsWith("city:") && dg.startsWith("city:") && sg !== dg) add("geography-different-city", `Rule: the source is for ${sg.slice(5)} and the destination for ${dg.slice(5)}.`, "hold");
    else if (sg === "statewide" && dg !== "statewide") add("geography-statewide", "Rule: a statewide page redirects to a page with a different (smaller) geography.", "confirm");
    // Approved sections that are written and waiting to be published count as coverage, but only as "confirm": the redirect stays blocked until they are live and verified.
    const pending = d.pendingHeadings ?? [];
    const lost = s.purposes.filter((p) => !d.purposes.includes(p) && p !== "process");
    const coveredByPending = lost.filter((p) => pending.some((h) => purposesOf(h).includes(p)));
    const reallyLost = lost.filter((p) => !coveredByPending.includes(p));
    if (reallyLost.length) add("purpose-mismatch", `Rule: the source's purpose (${reallyLost.join(", ")}) is not named by the destination${pending.length ? ` or by its approved sections waiting to be published (${pending.join("; ")})` : ""}.`, "hold");
    if (coveredByPending.length) add("purpose-pending", `Rule: the source's purpose (${coveredByPending.join(", ")}) is covered only by approved section(s) not yet published on the destination: ${pending.filter((h) => purposesOf(h).some((p) => coveredByPending.includes(p))).join("; ")}. The redirect stays blocked until they are live and verified.`, "confirm");
  }
  for (const [label, p] of [["source", s], ["destination", d]] as const) if (p?.changedSinceDecision) add(`changed-${label}`, `Rule: the ${label} looks different from what the decision assumed (${p.changedSinceDecision}).`, "hold");
  const hold = flags.filter((f) => f.severity === "hold");
  const proposed: Proposed = i.isMG8Exception && hold.every((f) => f.id === "crosses-type")
    ? { kind: "none", text: "No change proposed: the previously confirmed exception (Leo, 2026-10-14) still stands; no new evidence contradicts it." }
    : hold.length ? { kind: "hold", text: `HOLD recommended: ${hold[0].rule}` } : flags.length ? { kind: "none", text: "No change proposed; please confirm the type." } : { kind: "none", text: "No new issue detected; existing decision unchanged." };
  return { flags, proposed };
}

export const typeFamily = (t: PageType) => (COMMERCIAL.includes(t) ? "commercial" : t);
