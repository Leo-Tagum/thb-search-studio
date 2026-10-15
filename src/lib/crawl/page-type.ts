// Page-type rules: a first, repeatable guess from what a visitor would see (offer form or button near the top, the H1, a byline and date, the address) plus the WordPress type.
// The agent then looks at the screenshots and either confirms the guess or overrides it; an override is recorded with source "visual-review". Pure functions, no network.
import { PAGE_TYPES, type Confidence, type PageType } from "../review/types";

export type PageFeatures = {
  url: string; title: string; h1: string; wpType: "page" | "post" | "unknown"; protectedAd: boolean; words: number;
  /** Distance from the top of the page, in CSS pixels, of the first form and of the first offer-style button; null when absent. */
  firstFormY: number | null; firstCtaY: number | null; ctaCount: number; ctaCountAfterFold: number;
  hasByline: boolean; hasDate: boolean; hasArticleSchema: boolean; hasLocalBusinessSchema: boolean;
  navLinks: number;
};
export type TypeGuess = { type: PageType; confidence: Confidence; evidence: string[] };

export const CITY_NAMES = ["Alameda", "San Jose", "San Bruno", "San Ramon", "Calistoga", "Cotati", "El Cerrito", "Moraga", "Pinole", "Pleasant Hill", "Windsor", "Cupertino", "Dublin", "Los Altos", "Novato", "Piedmont", "Vacaville", "Stanford", "Fremont", "Lafayette", "San Rafael", "Saratoga", "San Francisco", "Oakland", "San Mateo", "Daly City", "Burlingame", "Redwood City", "Palo Alto", "Hayward", "Walnut Creek", "Santa Rosa", "Berkeley", "Orinda", "Sunnyvale", "Milpitas", "Mountain View", "San Carlos", "San Leandro", "Colma", "Santa Clara", "Concord", "Richmond", "Vallejo", "Fairfield", "Napa"];
const slugWords = (u: string) => { try { return new URL(u).pathname.replace(/[-/]+/g, " ").trim().toLowerCase(); } catch { return ""; } };
export function citiesIn(text: string): string[] { const t = ` ${text.toLowerCase().replace(/[-_/]+/g, " ")} `; return CITY_NAMES.filter((c) => t.includes(` ${c.toLowerCase()} `) || t.includes(` ${c.toLowerCase()}, `)); }

const UTILITY = /\/(contact(-us)?|about(-[a-z-]+)?|thank-you|reviews?|privacy(-policy)?|terms(-[a-z-]+)?|sitemap|disclaimer|accessibility)\/?$/i;
// A heading is a sell-to-us message only when it speaks to the seller or offers to buy ("We buy houses", "Sell my house fast", "Get a cash offer"). Nouns such as "cash home buyers" or "as-is"
// also appear in informational headings ("How Cash Home Buyers Work", "iBuyers: Who Are They?"), so they never count on their own, and an informational heading never counts at all.
const MONEY_H1 = /\b(we buy|we pay|sell (my|your|any|the) (house|home|property)|get (a|your) [a-z ]{0,20}offer|(cash|fair|fast) offers? (for|in|today)|sell .{0,30}(fast|for cash))\b/i;
export const INFORMATIONAL = /\b(guide|how (to|do|does|can|it|cash|ibuyers?)|what (is|are|does|to)|who (is|are)|why|when|which|tips|checklist|should (you|i)|can (i|you)|vs\.?|versus|explained)\b|\?/i;
/** Cuts a heading for display at a word boundary, never mid-word ("...(2025-2026 Guide): T"). Headings up to max characters are shown whole. */
export function shorten(s: string, max = 140): string { const t = s.replace(/\s+/g, " ").trim(); if (t.length <= max) return t; const cut = t.slice(0, max); const sp = cut.lastIndexOf(" "); return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s:,;(-]+$/, "") + "..."; }
const STORY = /\b(story|stories|case study|how we helped|what it teaches|real (people|stories))\b/i;

export function guessType(f: PageFeatures): TypeGuess {
  const ev: string[] = []; const text = `${f.title} ${f.h1}`;
  if (UTILITY.test(f.url)) return { type: "utility", confidence: "high", evidence: ["address is a utility page (contact, about, thank-you, reviews or legal)"] };
  if (f.protectedAd) return { type: "ads landing page", confidence: "high", evidence: ["on the Ads protected list"] };
  let money = 0, guide = 0, story = 0;
  const top = 900;
  if (f.firstFormY !== null && f.firstFormY < top) { money += 2; ev.push(`offer form ${Math.round(f.firstFormY)}px from the top`); }
  if (f.firstCtaY !== null && f.firstCtaY < top) { money += 1; ev.push(`offer button ${Math.round(f.firstCtaY)}px from the top`); }
  const infoH1 = INFORMATIONAL.test(f.h1), infoTitle = INFORMATIONAL.test(f.title);
  if (!infoH1 && MONEY_H1.test(f.h1)) { money += 2; ev.push(`H1 is a sell-to-us message ("${shorten(f.h1, 90)}")`); } else if (!infoH1 && !infoTitle && MONEY_H1.test(f.title)) { money += 1; ev.push("title is a sell-to-us message"); }
  if (f.wpType === "page") { money += 1; ev.push("WordPress page"); }
  if (f.hasArticleSchema) { guide += 2; ev.push("article schema"); }
  if (f.hasByline || f.hasDate) { guide += 2; ev.push(`${f.hasByline ? "byline" : ""}${f.hasByline && f.hasDate ? " and " : ""}${f.hasDate ? "date" : ""} shown`); }
  if (infoH1) { guide += 2; ev.push(`H1 reads like a guide ("${shorten(f.h1, 90)}")`); }
  if (f.wpType === "post") { guide += 1; ev.push("WordPress post"); }
  if (f.words > 1500 && f.ctaCountAfterFold >= f.ctaCount - 1 && f.ctaCount > 0) { guide += 1; ev.push("long page with calls to action mostly late"); }
  if (f.firstFormY !== null && f.firstFormY < top) guide -= 2;
  if (STORY.test(text)) { story += 3; ev.push("title or H1 names a story or case"); }
  const ranked = ([["story/case study", story], ["money page", money], ["guide/blog", guide]] as [PageType, number][]).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked; const margin = best[1] - second[1];
  let type: PageType = best[0]; let confidence: Confidence = margin >= 3 ? "high" : margin >= 2 ? "medium" : "low";
  if (best[1] <= 1) { type = "other"; confidence = "low"; ev.push("no strong signal either way"); }
  if (type === "money page" && (citiesIn(`${f.h1} ${f.title} ${slugWords(f.url)}`).length > 0)) { type = "city/location page"; ev.push(`city named: ${citiesIn(`${f.h1} ${f.title} ${slugWords(f.url)}`)[0]}`); }
  return { type, confidence, evidence: ev };
}

export const isPageType = (s: string): s is PageType => (PAGE_TYPES as readonly string[]).includes(s);
