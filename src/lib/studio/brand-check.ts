// Phase 3e: the brand-rule check on EVERY assembly. The unit checks scan what the writers wrote; this scans the whole rendered article, template parts
// included (author box, related guides, sources, CTA), against editorial standards section 7 (brand facts) and SR-3 (no service-area claims).
// It reads the HTML the assembler produced, so a wording that lives only in a template cannot slip past. The approved wordings it relies on
// (the experience facts, the sourced facts, the pending-Juan list, the rating rule) are the ones in agents/bridge.ts, the same code the agents are held to.
import { experienceYearViolations, pendingJuanHits, ratingRuleHits, sourcedFactViolations } from "../agents/bridge";
import type { Finding } from "./checks";
import { STYLE_BLOCK } from "./style-block";

const entity = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, "&");
/** The reader-visible text of an assembled article: the style block and every tag removed, entities decoded, blocks on their own lines. */
export function htmlPlainText(html: string): string {
  const body = html.replace(STYLE_BLOCK, "");
  return entity(body.replace(/<(?:\/?(?:p|div|h[1-6]|li|tr|ul|ol|table|thead|tbody)\b)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t ]+/g, " ").replace(/\n\s*/g, "\n").trim();
}

// SR-3: no service-area claim. Where Twin Home Buyer buys is pending Juan.
const SERVICE_AREA: [string, RegExp][] = [
  ['a "we buy / we serve in <place>" claim', /\b(?:we|twin home buyer)\s+(?:buy|buys|purchase|purchases|serve|serves|serving|operate|operates|work|works)\s+(?:homes?\s+|houses?\s+|properties\s+)?(?:in|across|throughout|all over)\b/i],
  ['a "we serve <place>" claim', /\b(?:[Ww]e|Twin Home Buyer)\s+(?:serve|serves)\s+[A-Z][a-z]+/],
  ['a "serving <place>" badge or line', /\b[Ss]erving\s+(?:the\s+)?[A-Z][a-z]+/],
  ['a "we buy houses in <place>" claim', /\b(?:we\s+buy|buying)\s+houses\s+in\b/i],
  ["a service-area or coverage statement", /\b(?:service area|areas? we (?:serve|cover)|cities we (?:serve|buy in)|we cover)\b/i],
];
// Promises the page may not make (pending Juan): as-is / no-cleanout purchase, price, speed.
const PROMISES: [string, RegExp][] = [
  ['an "we buy as-is" or no-cleanout promise', /\b(?:we|twin home buyer)\s+(?:buy|buys|purchase|purchases)\b[^.]{0,40}\bas[- ]is\b|\bno\s+(?:clean[- ]?out|repairs?|cleaning)\s+(?:needed|required)\b|\bwithout\s+(?:any\s+)?clean(?:ing|[- ]?out)\b[^.]{0,30}\bwe\b/i],
  ["a guaranteed price or offer", /\b(?:guarantee[sd]?|guaranteed)\s+(?:cash\s+)?(?:offer|price)\b|\bfair\s+cash\s+offer\b/i],
];

/** Findings (BLOCKED_CLAIM) for everything in the assembled HTML that editorial standards section 7 or SR-3 do not allow. Empty means the assembly may continue. */
export function brandRuleFindings(html: string): Finding[] {
  const text = htmlPlainText(html);
  const wrap = { text };
  const out: Finding[] = [];
  const add = (code: string, detail: string) => out.push({ code, severity: "BLOCKED_CLAIM", detail });
  for (const h of experienceYearViolations(wrap)) add("BRAND_EXPERIENCE", `experience wording ${h} is not one of the approved wordings (editorial standards section 7)`);
  for (const h of pendingJuanHits(wrap)) add("BRAND_PENDING_JUAN", `${h} is pending Juan and cannot appear anywhere in the article, template text included (section 7)`);
  for (const h of ratingRuleHits(wrap)) add("BRAND_RATING", `${h} appears; ratings and review counts are never written (permanent rating rule, section 7)`);
  for (const h of sourcedFactViolations(wrap)) add("BRAND_SOURCED_FACT", h);
  for (const [name, re] of SERVICE_AREA) { const m = re.exec(text); if (m) add("BRAND_SERVICE_AREA", `${name}: "${m[0]}" (SR-3: no service-area claims until Juan confirms the cities)`); }
  for (const [name, re] of PROMISES) { const m = re.exec(text); if (m) add("BRAND_PROMISE", `${name}: "${m[0]}" (pending Juan)`); }
  return out;
}
