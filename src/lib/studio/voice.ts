// Voice reference (Phase 3 Task 3). Built from posts already stored by the Phase 2b fetch (no new site requests).
// STYLE ONLY: the source pages contain facts that are blocked or pending (closing times, "$32M", "since 2002" as company history,
// "founder", "we buy as-is"). Each excerpt must (1) appear verbatim in its stored body, (2) contain no digit, legal, permit or
// insurance wording and no company capability claim, and (3) pass every blocked-fact check. Nothing here counts as a fact.
import { experienceYearHits, pendingJuanHits, ratingRuleHits, sourcedFactViolations } from "../agents/bridge";
import { contentHash } from "./hash";

export type VoiceSourceKey = "older_home" | "juan_page" | "belongings";
export const VOICE_SOURCES: Record<VoiceSourceKey, { url: string; use: "primary" | "company" | "warmth"; rule: string }> = {
  older_home: { url: "https://www.twinhomebuyer.com/selling-an-older-home-in-san-francisco-repairs-options/", use: "primary", rule: "Primary voice: first person, direct, honest about options." },
  juan_page: { url: "https://www.twinhomebuyer.com/from-the-desk-of-juan-diaz/", use: "company", rule: "Only for 'we' / company-attitude sentences. None of its facts or capability claims." },
  belongings: { url: "https://www.twinhomebuyer.com/sell-bay-area-house-full-of-belongings/", use: "warmth", rule: "Only for warmth toward the family. Never its claims (leave-behind, as-is, privacy, timeline)." },
};

/** Curated by hand (Leo's rule: older-home primary, Juan's page for we/company, belongings for warmth only). */
export const CANDIDATES: { source: VoiceSourceKey; text: string }[] = [
  { source: "older_home", text: "Age alone isn't the problem." },
  { source: "older_home", text: "What matters is the condition of the property today, and whether the paperwork tells the same story as the house." },
  { source: "older_home", text: "This is the part most homeowners get backwards when selling an older home in San Francisco. The repairs that feel most important, like the dated kitchen, are often the ones that matter least to the sale. The repairs that remove uncertainty usually matter most." },
  { source: "older_home", text: "Before a homeowner writes a check to a contractor, I ask them to answer these honestly. If the answer to all three isn't yes, the repair probably isn't the right first move." },
  { source: "older_home", text: "Not always. When you're selling an older home in San Francisco, renovation can make sense when you have time, the scope is clear, and the work fixes something buyers will actually object to." },
  { source: "older_home", text: "Renovation usually makes less sense when you inherited the property, don't want to manage construction, the repair list keeps growing, or your timeline matters more than finishing improvements." },
  { source: "older_home", text: "When a homeowner tells me they're selling an older home in San Francisco, the first question I ask is not how much renovation can we do. It's what situation is this homeowner actually in?" },
  { source: "older_home", text: "None of these mean the house can't sell. They mean you want to know about them before you pick a path." },
  { source: "older_home", text: "Maybe the property was inherited and the family needs to decide what comes next. Maybe the home needs work, but the homeowner doesn't know where to begin. Each of those leads to a different answer, and a good decision starts with the right information." },
  { source: "older_home", text: "Getting clarity early usually creates more options, not fewer." },
  { source: "juan_page", text: "A legitimate buyer should be honest about that tradeoff rather than pretending every property is best sold to them." },
  { source: "juan_page", text: "Credibility is often easier to spot in how clearly someone explains risk than in how confidently they make promises." },
  { source: "juan_page", text: "At Twin Home Buyer, we want homeowners to feel informed before they make any decision, whether they choose to work with us or not." },
  { source: "juan_page", text: "Confidence does not need urgency to survive scrutiny." },
  { source: "belongings", text: "Most people do not delay selling because they want the process to be harder. They delay because the house feels too heavy to deal with." },
  { source: "belongings", text: "A house full of belongings is not always a junk problem. Sometimes it is a family history problem." },
  { source: "belongings", text: "Many families do not need to be judged. They need time, clarity, and a practical way to move forward." },
  { source: "belongings", text: "For adult children, heirs, or family members, deciding what to keep can be emotional." },
];

const ENTITIES: Record<string, string> = { "&amp;": "&", "&nbsp;": " ", "&#8217;": "'", "&#8216;": "'", "&#8220;": '"', "&#8221;": '"', "&#8211;": "-", "&#8212;": "-", "&quot;": '"', "&#039;": "'", "&lt;": "<", "&gt;": ">" };
export function plainText(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&[#a-z0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}
const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

const LEGAL_WORDS = /\b(law|laws|legal|legally|statute|code|required|requires|must|disclos\w*|permits?|insurance|insurer|lender|lenders|licen[sc]e\w*)\b/i;
const CAPABILITY = /\b(we|our)\b[^.]{0,60}\b(buy|purchase|close|operate|offer|charge|pay|cover|handle|guarantee|can|will)\b/i;

export function excerptProblems(text: string): string[] {
  const p: string[] = [];
  if (/\d/.test(text)) p.push("contains a digit (figures, years and timelines are never style)");
  if (LEGAL_WORDS.test(text)) p.push("contains legal, permit, insurance or disclosure wording (style excerpts carry no law)");
  if (CAPABILITY.test(text)) p.push("contains a company capability claim");
  const wrap = { text };
  for (const h of pendingJuanHits(wrap)) p.push(`PENDING JUAN fact: ${h}`);
  for (const h of ratingRuleHits(wrap)) p.push(`rating rule: ${h}`);
  for (const h of experienceYearHits(text)) p.push(`experience wording: ${h}`);
  for (const h of sourcedFactViolations(wrap)) p.push(h);
  if (/\b(founder|owner|ceo)\b/i.test(text)) p.push("founder/owner/title claim");
  if (/\bas-?is\b/i.test(text) && /\b(we|our|twin home buyer)\b/i.test(text)) p.push("as-is purchase claim");
  return p;
}

export type VoiceExcerpt = { id: string; source: VoiceSourceKey; source_url: string; use: string; text: string };
export type VoiceReference = {
  version: 1; built: string; sources: typeof VOICE_SOURCES; excerpts: VoiceExcerpt[];
  imitate: string[]; avoid: string[]; banned_phrases: { dont: string; write_like_juan: string }[]; content_hash: string;
};

/** Editorial standards section 4 (the rewrite table), carried as banned phrases for Agent 7. */
export const BANNED_PHRASES = [
  { dont: "Selling your house can be stressful.", write_like_juan: "The stressful part is not always the sale. Sometimes the real problem is title, repairs, tenants, family disagreement, or whether escrow can actually close." },
  { dont: "We buy houses fast for cash.", write_like_juan: "A fast cash offer only helps if the right person can sign, the paperwork is clean, and the deal can close without surprises." },
  { dont: "Contact us today for a fair offer.", write_like_juan: "Before you decide what to do, understand the house, the paperwork, the repairs, and the timeline. Then you can decide whether listing, keeping it, or selling directly makes sense." },
  { dont: "We make selling easy.", write_like_juan: "We look at the actual situation: condition, title, tenants, liens, timing, and what the seller really needs." },
  { dont: "Sell your inherited house quickly.", write_like_juan: "If you inherited a house, the first question is whether you have legal authority to sell. A trust, will, probate case, or multiple heirs can all change the process." },
];

export const IMITATE = [
  "Speak as Juan explaining the truth to a homeowner: first person where advice is given ('I'd want these answered', 'the first question I ask'), plain words, short declarative sentences.",
  "Name the real question first ('The real question is usually...'), then answer it. Say 'Not always.' or 'It depends on...' when that is the honest answer.",
  "Be honest about options, including ones that are not Twin Home Buyer. Say what each fits and what it costs the seller in time, certainty or control.",
  "Treat the family and the person living in the house with respect. No judgment, no pity, no sales energy.",
  "Close a section on what the seller can do next or what to confirm, not on a pitch.",
];
export const AVOID = [
  "Any number, year, price, timeline, count or percentage that is not in the claim ledger (the excerpts contain none on purpose).",
  "Past-tense claims about deals, outcomes or what 'I have seen' or 'we have bought'. First person is for explaining and advising, not for evidence.",
  "The belongings post's hedged 'may be able to' promises, its leave-behind / as-is / privacy / timeline claims, and its sales-flavored closes.",
  "Juan's page's company-capability claims ('we can purchase', 'we close'), its track-record line and anything about founding, ownership or licences.",
  "Generic seller filler, fake motivation, and any sentence that could sit unchanged on another investor's site.",
];

export function buildVoiceReference(bodies: Record<VoiceSourceKey, string>, built: string): { ref: VoiceReference; rejected: { text: string; problems: string[] }[] } {
  const plain = Object.fromEntries(Object.entries(bodies).map(([k, v]) => [k, norm(plainText(v))])) as Record<VoiceSourceKey, string>;
  const excerpts: VoiceExcerpt[] = []; const rejected: { text: string; problems: string[] }[] = [];
  CANDIDATES.forEach((c) => {
    const problems = excerptProblems(c.text);
    if (!plain[c.source]?.includes(norm(c.text))) problems.unshift("not found verbatim in the stored page body");
    if (problems.length) { rejected.push({ text: c.text, problems }); return; }
    excerpts.push({ id: `v${excerpts.length + 1}`, source: c.source, source_url: VOICE_SOURCES[c.source].url, use: VOICE_SOURCES[c.source].use, text: c.text });
  });
  const core = { version: 1 as const, built, sources: VOICE_SOURCES, excerpts, imitate: IMITATE, avoid: AVOID, banned_phrases: BANNED_PHRASES };
  return { ref: { ...core, content_hash: contentHash(core) }, rejected };
}
