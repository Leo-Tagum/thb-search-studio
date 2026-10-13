// Deterministic checks run on every submitted draft unit and on the whole article. Agents never replace them.
// Each finding says what is wrong, and whether it BLOCKS (claim or privacy) or only needs REVISION.
import { experienceYearViolations, pendingJuanHits, ratingRuleHits, sourcedFactViolations } from "../agents/bridge";
import { checkOutputPrivacy, type InternalPassage } from "../seller/privacy-gate";
import { parseInline, wordCount } from "./inline";
import { riskyKeys, uncoveredKeys } from "./tokens";
import { sha256 } from "./hash";
import type { ClaimVerification } from "./legal-claims";
import { deciderFindings, legalFlagReason, legalKindsOf, legalRecordFindings, LEGAL_FLAG_TERMS, type LegalFlagKind } from "./legal-flags";
import { unitClaimIds, unitStrings, unitText, type Unit } from "./schema";

export type LedgerClaim = {
  id: string; text: string; risk: "low" | "medium" | "high" | "critical";
  support: "supported" | "unsupported" | "conflicting";
  sourceId: string | null; sourceRecheckBy: string | null; jurisdiction: string;
  claimType?: string; lockedText?: string | null;
  verification?: ClaimVerification;                // Phase 3e: the legal-claim verification record (absent on claims written before the rule)
};
export type Finding = { code: string; severity: "BLOCKED_CLAIM" | "BLOCKED_PRIVACY" | "REVISION"; detail: string };

export type CheckCtx = {
  today: string;                                  // yyyy-mm-dd
  claims: Map<string, LedgerClaim>;
  approvedFactTexts: string[];                    // approved brand-fact wordings that may appear as-is
  allowedLinks: string[];                         // inventory / link-plan URLs (compared without trailing slash)
  sourceUrls: string[];                           // official source URLs from the ledger
  internalPassages: InternalPassage[];            // internal-only seller passages (must never be copied)
  allowedJurisdictions: string[];
  blockedPhrases: [string, RegExp][];             // article-specific PENDING JUAN items
  briefH2: Record<string, string>;                // unit key -> approved H2 from the brief
  keyword: string;
  legalRecord?: boolean;                          // Phase 3e: enforce the legal-claim verification record (quote, label, gates) and the decider check; set by the service, off in fixtures that predate it
};

const slash = (u: string) => u.replace(/\/+$/, "");
const wrap = (text: string) => ({ text }) as Record<string, unknown>;

const OWNERSHIP_TITLE = /\b(founder|co-?founder|owner of|ceo|president of twin home buyer|our founder)\b/i;
const HISTORY = /\b(?:we|i)(?:'ve|\s+have|\s+had)?\s+(?:bought|purchased|closed|helped|seen|handled|worked\s+with|talked\s+to|paid)\b|\bin\s+(?:my|our)\s+(?:\d+\s+|many\s+|all\s+my\s+)?years\b|\b(?:most|many)\s+(?:sellers|homeowners|families|owners)\s+(?:i|we)\s+(?:talk|work|speak|meet)/i;
const SELLER_STORY = /\b(?:a|one|another|this)\s+(?:seller|homeowner|family|client|owner|widow|couple)\s+(?:we|i)\s+(?:helped|worked|bought|met|spoke|talked)|\bone\s+of\s+our\s+(?:sellers|clients|homeowners)|\bcase\s+study\b/i;

export function checkUnit(u: Unit, ctx: CheckCtx): Finding[] {
  const f: Finding[] = [];
  const text = unitText(u);
  const strings = unitStrings(u);

  // markup and links
  const links: { text: string; url: string }[] = [];
  for (const s of strings) {
    const p = parseInline(s);
    for (const e of p.errors) f.push({ code: "MARKUP", severity: "REVISION", detail: e });
    links.push(...p.links);
  }
  const okLinks = new Set([...ctx.allowedLinks, ...ctx.sourceUrls].map(slash));
  for (const l of links) if (!okLinks.has(slash(l.url))) f.push({ code: "LINK_NOT_ALLOWED", severity: "REVISION", detail: `link ${l.url} is not an inventory/brief link or a ledger source` });

  // section shape
  if (u.kind === "section") {
    const want = ctx.briefH2[u.key];
    if (want === undefined) f.push({ code: "UNKNOWN_SECTION", severity: "REVISION", detail: `section ${u.key} is not in the approved brief` });
    else if (want.trim().toLowerCase() !== u.h2.trim().toLowerCase()) f.push({ code: "H2_CHANGED", severity: "REVISION", detail: `H2 must match the approved brief: "${want}"` });
    if (!u.h2.trim().endsWith("?")) f.push({ code: "H2_NOT_QUESTION", severity: "REVISION", detail: "H2s are phrased as the questions sellers ask" });
    if (u.key === "s1") {
      if (!u.capsule) f.push({ code: "CAPSULE_MISSING", severity: "REVISION", detail: "the first section needs the 40-60 word answer capsule" });
      else { const n = wordCount(parseInline(u.capsule).plain); if (n < 40 || n > 60) f.push({ code: "CAPSULE_LENGTH", severity: "REVISION", detail: `answer capsule is ${n} words; it must be 40-60` }); }
    } else if (u.capsule) f.push({ code: "CAPSULE_MISPLACED", severity: "REVISION", detail: "only the first section carries the capsule" });
  } else {
    for (const i of u.items) { const n = wordCount(parseInline(i.a).plain); if (n > 60) f.push({ code: "FAQ_LONG", severity: "REVISION", detail: `FAQ answer "${i.q}" is ${n} words; keep it short (60 or fewer)` }); }
  }

  // ledger
  const ids = unitClaimIds(u);
  const cited: LedgerClaim[] = [];
  for (const id of ids) {
    const c = ctx.claims.get(id);
    if (!c) f.push({ code: "UNKNOWN_CLAIM", severity: "BLOCKED_CLAIM", detail: `cites claim ${id}, which is not in the ledger` });
    else cited.push(c);
  }
  for (const c of cited) {
    if (c.support !== "supported") f.push({ code: "UNSUPPORTED_CLAIM_CITED", severity: "BLOCKED_CLAIM", detail: `claim ${c.id} is ${c.support}` });
    if ((c.risk === "high" || c.risk === "critical") && !c.sourceId) f.push({ code: "HIGH_RISK_NO_EVIDENCE", severity: "BLOCKED_CLAIM", detail: `${c.risk}-risk claim ${c.id} has no source` });
    if (c.risk === "critical") f.push({ code: "CRITICAL_NEEDS_HUMAN", severity: "BLOCKED_CLAIM", detail: `critical claim ${c.id} needs explicit human escalation` });
    if (c.sourceRecheckBy && c.sourceRecheckBy < ctx.today) f.push({ code: "STALE_RULE", severity: "BLOCKED_CLAIM", detail: `claim ${c.id}: its source was due for re-verification by ${c.sourceRecheckBy}` });
    if (!ctx.allowedJurisdictions.some((j) => c.jurisdiction.toLowerCase().includes(j.toLowerCase()))) f.push({ code: "WRONG_JURISDICTION", severity: "BLOCKED_CLAIM", detail: `claim ${c.id} is for "${c.jurisdiction}", not this article's jurisdiction` });
  }
  if (ctx.legalRecord) f.push(...legalRecordFindings(cited), ...deciderFindings(strings.map((s) => parseInline(s).plain), cited));
  const unc = uncoveredKeys(text, [...cited.map((c) => c.text), ...ctx.approvedFactTexts]);
  for (const k of unc) f.push({ code: "UNCOVERED_FIGURE", severity: "BLOCKED_CLAIM", detail: `the text states ${k}, which no cited ledger claim or approved brand fact contains (unsupported or altered detail)` });
  if (HISTORY.test(text) && !cited.some((c) => c.claimType === "thb_history")) f.push({ code: "UNDECLARED_HISTORY_CLAIM", severity: "BLOCKED_CLAIM", detail: "states what THB or Juan has done or seen without a declared, evidenced thb_history claim" });

  // brand facts, ratings, pending items
  for (const h of pendingJuanHits(wrap(text))) f.push({ code: "PENDING_JUAN", severity: "BLOCKED_CLAIM", detail: `uses a PENDING JUAN fact (${h})` });
  for (const h of ratingRuleHits(wrap(text))) f.push({ code: "RATING_RULE", severity: "BLOCKED_CLAIM", detail: `violates the permanent rating rule (${h})` });
  for (const h of experienceYearViolations(wrap(text))) f.push({ code: "EXPERIENCE_WORDING", severity: "BLOCKED_CLAIM", detail: `experience wording not allowed (${h})` });
  for (const h of sourcedFactViolations(wrap(text))) f.push({ code: "SOURCED_FACT_WORDING", severity: "BLOCKED_CLAIM", detail: h });
  if (OWNERSHIP_TITLE.test(text)) f.push({ code: "PENDING_JUAN", severity: "BLOCKED_CLAIM", detail: "uses a founder/owner/title claim (ownership is PENDING JUAN)" });
  for (const [name, re] of ctx.blockedPhrases) if (re.test(text)) f.push({ code: "PENDING_JUAN", severity: "BLOCKED_CLAIM", detail: `uses a blocked statement (${name})` });

  // privacy: no seller identity, no internal-only passages, no seller story (no brief is publication-cleared)
  const gate = checkOutputPrivacy(text, ctx.internalPassages);
  if (!gate.ok) for (const x of gate.findings) f.push({ code: "SELLER_IDENTITY", severity: "BLOCKED_PRIVACY", detail: `${x.kind}: ${x.detail}` });
  if (SELLER_STORY.test(text)) f.push({ code: "SELLER_STORY_NOT_CLEARED", severity: "BLOCKED_PRIVACY", detail: "refers to a seller story; no seller brief is cleared for publication" });
  return f;
}

// ---------- whole article ----------
const OPTION_RES: Record<string, RegExp> = {
  keep_it: /\bkeep(?:ing)?\b[^.]{0,30}\b(?:it|the (?:house|home|property))\b|\bhold(?:ing)? (?:on )?(?:to )?(?:it|the (?:house|home|property))/i,
  list_it: /\blist(?:ing)?\b[^.]{0,40}\b(?:agent|market|mls|it|house|home|property)\b|\btraditional (?:sale|listing)/i,
  fix_it: /\b(?:fix|repair|renovat|clear(?:ing)?\s+(?:it\s+)?out|clean(?:ing)?\s*-?out|declutter)/i,
  get_professional_help: /\b(?:attorney|title company|probate|cpa|insurance professional|real estate agent|licensed professional)\b/i,
  sell_directly: /\b(?:sell(?:ing)?\s+(?:it\s+|the (?:house|home) )?(?:directly|as-is|as is)|direct (?:sale|buyer)|cash buyer|investor)\b/i,
};
const PRO_TERMS = /\b(attorney|title company|cpa|tax professional|insurance professional|city|county|code enforcement|building department)\b/i;

export type ArticleCtx = Pick<CheckCtx, "briefH2" | "keyword"> & { title: string; requiredUnitKeys: string[] };

export function checkArticle(units: Unit[], ctx: ArticleCtx): Finding[] {
  const f: Finding[] = [];
  const keys = units.map((u) => u.key);
  for (const k of ctx.requiredUnitKeys) if (!keys.includes(k)) f.push({ code: "UNIT_MISSING", severity: "REVISION", detail: `missing ${k}` });
  const order = ctx.requiredUnitKeys.filter((k) => keys.includes(k));
  if (JSON.stringify(order) !== JSON.stringify(keys.filter((k) => order.includes(k)))) f.push({ code: "ORDER", severity: "REVISION", detail: "sections are out of the approved brief order" });

  const sections = units.filter((u): u is Extract<Unit, { kind: "section" }> => u.kind === "section");
  const roleText = (r: string) => sections.filter((s) => s.roles.includes(r as never)).map((s) => unitStrings(s).slice(1).join("\n")).join("\n"); // body text only: a heading must not count as coverage
  const first = sections[0];
  if (!first || !first.roles.includes("opening")) f.push({ code: "NO_SELLER_PROBLEM_OPENING", severity: "REVISION", detail: "the first section must open from a real seller problem (role: opening)" });
  const opts = roleText("options");
  if (!opts) f.push({ code: "NO_HONEST_OPTIONS", severity: "REVISION", detail: "an honest-options section (role: options) is required" });
  else {
    const hit = Object.entries(OPTION_RES).filter(([, re]) => re.test(opts)).map(([k]) => k);
    if (hit.length < 3) f.push({ code: "OPTIONS_TOO_FEW", severity: "REVISION", detail: `the options section covers ${hit.length} of keep/list/fix/professional help/sell directly; it needs at least 3 where they apply` });
    if (!hit.some((k) => k !== "sell_directly")) f.push({ code: "OPTIONS_ONLY_THB", severity: "REVISION", detail: "options must include choices other than selling directly" });
  }
  if (!roleText("real_world_warning")) f.push({ code: "NO_REAL_WORLD_WARNING", severity: "REVISION", detail: "at least one real-world warning section (role: real_world_warning) is required" });
  const pro = roleText("professional_confirmation");
  if (!pro || !PRO_TERMS.test(pro)) f.push({ code: "NO_PROFESSIONAL_CONFIRMATION", severity: "REVISION", detail: "a professional-confirmation section naming who to confirm with is required" });

  // keyword: natural, in the title, the capsule and one question H2
  const kw = ctx.keyword.toLowerCase().split(/\s+/).filter(Boolean);
  const has = (s: string) => kw.every((w) => s.toLowerCase().includes(w.replace(/s$/, "")));
  if (!has(ctx.title)) f.push({ code: "KEYWORD_TITLE", severity: "REVISION", detail: `the title should carry the main keyword "${ctx.keyword}" naturally` });
  if (first?.capsule && !has(first.capsule)) f.push({ code: "KEYWORD_CAPSULE", severity: "REVISION", detail: `the answer capsule should carry "${ctx.keyword}" naturally` });
  if (!sections.some((s) => s.h2.trim().endsWith("?") && has(s.h2))) f.push({ code: "KEYWORD_H2", severity: "REVISION", detail: `one question H2 should carry "${ctx.keyword}"` });
  return f;
}

// ---------- hedge phrases (team mode) ----------
// Unsourced generalizations ("most owners", "usually", "nobody looks twice") are usually wording, so the material signature misses them.
// This is NOT a block and is not part of checkUnit (classic behavior is unchanged): it flags the sentence, and team-mode V1 must rule on each one
// explicitly as proven (with its evidence), reword, or drop (see team/loop.ts).
export const HEDGE_TERMS = ["most owners", "most people", "usually", "always", "never", "nobody", "everyone"] as const;
const HEDGE_RE = new RegExp("\\b(" + HEDGE_TERMS.join("|") + ")\\b", "i");
export type HedgeFlag = { key: string; term: string; sentence: string; legal?: LegalFlagKind[]; why?: string };
const normSentence = (x: string) => x.replace(/\s+/g, " ").trim();

export function hedgeFlagsInText(text: string): HedgeFlag[] {
  const out: HedgeFlag[] = [];
  const seen = new Set<string>();
  for (const sentence of text.split(/\n+/).flatMap((line) => normSentence(line).split(/(?<=[.!?])\s+/)).map(normSentence).filter(Boolean)) {
    const m = HEDGE_RE.exec(sentence);
    const legal = legalKindsOf(sentence);                     // Phase 3e: absence-of-law claims and layer blending are flagged the same way and need V1's explicit ruling
    if (!m && !legal.length) continue;
    const key = `hedge:${sha256(sentence.toLowerCase()).slice(0, 12)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(legal.length ? { key, term: m ? m[1].toLowerCase() : LEGAL_FLAG_TERMS[legal[0]], sentence, legal, why: legal.map(legalFlagReason).join("; ") } : { key, term: m![1].toLowerCase(), sentence });
  }
  return out;
}
export const hedgeFlags = (u: Unit): HedgeFlag[] => hedgeFlagsInText(unitStrings(u).map((x) => parseInline(x).plain).join("\n"));

export { riskyKeys };
