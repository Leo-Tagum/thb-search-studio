// Phase 3e stage 3: deterministic legal checks on a unit's text ("Legal claims: no guessing", Leo's standing rule 2026-10-13, and Juan's Bay Area direction
// of the same date). The code reads the sentences; agents never decide whether a flag exists. Two kinds of result:
//  - FLAGS (legalFlagsInText): a sentence that needs V1's explicit ruling, like the generalization flags: an absence-of-law claim ("the statute does not
//    mention X"), or a sentence that blends the two layers of law (a local rule next to California law, or two cities' rules in one sentence).
//  - FINDINGS (deciderFindings, legalRecordFindings): hard checks that send the unit back to the writer, or block it: a closed list of deciders the quoted
//    section does not make, a claim without its exact quote and label, a BROADER / WRONG claim, a gate that changes what a reader would believe and is
//    neither stated nor carried by a cited claim, a carried gate whose carrier claim the unit does not cite.
import type { Finding, LedgerClaim } from "./checks";

export type LegalFlagKind = "LEGAL_ABSENCE" | "LAYER_LOCAL_AS_STATE" | "LAYER_CROSS_LOCAL";
export const LEGAL_FLAG_KINDS: LegalFlagKind[] = ["LEGAL_ABSENCE", "LAYER_LOCAL_AS_STATE", "LAYER_CROSS_LOCAL"];

const SUBJECT = "(?:statutes?|laws?|codes?|sections?|ordinances?|acts?|regulations?|rules?|bills?|health code|housing code|building code|municipal code|ordinance code|property maintenance code)";
const NEGATION = "(?:does\\s+not|doesn['’]t|do\\s+not|don['’]t|did\\s+not|never|nowhere|fails?\\s+to|is\\s+silent|are\\s+silent|says?\\s+nothing|makes?\\s+no\\s+mention|has\\s+no\\s+mention)";
const VERB = "(?:mention|say|state|require|prohibit|address|define|list|include|cover|contain|provide|apply|refer|speak|name|forbid|allow|exempt|regulate)";
const ABSENCE_RES = [
  new RegExp(`\\b${SUBJECT}\\b[^.!?]{0,60}\\b${NEGATION}\\b[^.!?]{0,40}\\b${VERB}\\w*`, "i"),                 // "The statute does not mention hoarding."
  new RegExp(`\\b(?:there\\s+is|there['’]s|is)\\s+no\\s+${SUBJECT}\\s+(?:that|which|about|on|for|requiring|saying|against)\\b`, "i"),   // "There is no law that ..."
  new RegExp(`\\bno\\s+${SUBJECT}\\s+(?:says|requires|prohibits|mentions|addresses|covers|defines)\\b`, "i"),
  new RegExp(`\\b${SUBJECT}\\b[^.!?]{0,30}\\b(?:is|are)\\s+silent\\s+(?:on|about|regarding|concerning)\\b`, "i"),    // "The code is silent on hoarding."
];

// Named local jurisdictions (the Bay Area focus) and the generic "City of X" / "County of X" / "X County" forms.
const LOCAL_NAME_RES: RegExp[] = [
  /\b(san francisco|south san francisco|san mateo|daly city|redwood city|oakland|berkeley|alameda|san jose|palo alto|menlo park|burlingame|millbrae|pacifica|half moon bay|marin|contra costa|santa clara|sonoma|napa|solano)\b/gi,
  /\b(?:city|town)\s+(?:and\s+county\s+)?of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
  /\bcounty\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+county\b/g,
];
const STATE_LAW_RE = /\b(california\s+law|state\s+law|california['’]s\s+[a-z&' ]{0,30}(?:code|law|statute|article)|health\s+(?:and|&)\s+safety\s+code|h&s\b|civil\s+code|california\s+(?:health|civil|penal))\b/i;

/** The distinct named local jurisdictions in a sentence, lower-cased ("san francisco", "san mateo"). A name inside a longer one ("san francisco" in "south san francisco") is not counted twice. */
export function localNamesIn(sentence: string): string[] {
  const found: { name: string; start: number; end: number }[] = [];
  for (const re of LOCAL_NAME_RES) for (const m of sentence.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))) {
    const name = (m[1] ?? m[0]).toLowerCase().trim();
    if (name && !["the", "your", "this", "that", "a", "any", "each", "local", "which", "california", "bay area", "state"].includes(name)) found.push({ name, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  const kept = found.filter((x) => !found.some((y) => y !== x && y.start <= x.start && y.end >= x.end && (y.end - y.start > x.end - x.start || (y.end - y.start === x.end - x.start && found.indexOf(y) < found.indexOf(x)))));
  return [...new Set(kept.map((x) => x.name))];
}

/** Which legal flags a sentence raises (empty if none). A sentence can raise more than one. */
export function legalKindsOf(sentence: string): LegalFlagKind[] {
  const kinds: LegalFlagKind[] = [];
  if (ABSENCE_RES.some((re) => re.test(sentence))) kinds.push("LEGAL_ABSENCE");
  const locals = localNamesIn(sentence);
  if (locals.length && STATE_LAW_RE.test(sentence)) kinds.push("LAYER_LOCAL_AS_STATE");
  if (locals.length >= 2) kinds.push("LAYER_CROSS_LOCAL");
  return kinds;
}

export const LEGAL_FLAG_TERMS: Record<LegalFlagKind, string> = { LEGAL_ABSENCE: "legal:absence", LAYER_LOCAL_AS_STATE: "legal:layer-local-with-state", LAYER_CROSS_LOCAL: "legal:layer-cross-local" };

/** Why V1 must rule on this sentence, in plain words (shown in the packet next to the flag). */
export const legalFlagReason = (k: LegalFlagKind): string => ({
  LEGAL_ABSENCE: "states what a law does not say: needs a ledger claim of type statute_absence (official text read, term absent, with section and date) or must be reworded or dropped",
  LAYER_LOCAL_AS_STATE: "puts a local rule and California law in one sentence: each layer needs its own claim and attribution (ruling proven, naming both claim ids), or reword so the layers are separate",
  LAYER_CROSS_LOCAL: "names two or more cities or counties in one sentence: never imply their rules match; each local rule needs its own claim, or reword",
}[k]);

// ---------- deciders ----------
const ROLE_RES: Record<string, RegExp> = {
  "health officer": /\bhealth officers?\b/i,
  "code enforcement officer": /\bcode enforcement officers?\b/i,
  "fire official": /\b(?:fire chief|chief of the fire department|fire department chief|fire officials?|fire marshal|chief['’]s deputy|deputy chief)\b/i,
  "building official": /\b(?:building officials?|building inspectors?|chief building official)\b/i,
};
export const rolesIn = (text: string): Set<string> => new Set(Object.entries(ROLE_RES).filter(([, re]) => re.test(text)).map(([k]) => k));
const OPEN_PHRASE = /\b(such as|for example|for instance|including|among others|or another|or other|and others|a local official|local officials?|someone like|may include|for example)\b/i;
const DECIDER_CONTEXT = /\b(determined by|decid\w*|makes? (?:that|the) call|names?|in the opinion of|up to|is for|who|enforce\w*|not for you|(?:it|that|this) is)\b/i;
const sentencesOf = (text: string) => text.split(/\n+/).flatMap((l) => l.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)).map((s) => s.trim()).filter(Boolean);

/**
 * A sentence that presents who decides as a complete list when a cited claim's quoted section names more (REAL MISS: "It is the health officer or the
 * fire official" while 17920.3(a)(12) also names a code enforcement officer). Only against the roles a cited claim's stored quote names; an open phrase
 * ("such as", "a local official") is fine. Findings send the unit back to the writer.
 */
export function deciderFindings(strings: string[], cited: LedgerClaim[]): Finding[] {
  const out: Finding[] = [];
  const quotes = cited.map((c) => ({ id: c.id, roles: rolesIn(c.verification?.quote ?? "") })).filter((q) => q.roles.size > 0);
  if (!quotes.length) return out;
  for (const str of strings) for (const sentence of sentencesOf(str)) {
    const mine = rolesIn(sentence);
    if (!mine.size || OPEN_PHRASE.test(sentence)) continue;
    const ctxOk = DECIDER_CONTEXT.test(sentence) || (sentence.length <= 80 && !/[.!?]\s*$/.test(sentence));     // a sentence about who decides, or a bare table cell such as "A health officer"
    if (!ctxOk) continue;
    const hit = quotes.map((q) => ({ id: q.id, shared: [...q.roles].filter((r) => mine.has(r)), missing: [...q.roles].filter((r) => !mine.has(r)) })).filter((h) => h.shared.length && h.missing.length);
    if (!hit.length) continue;
    const missing = [...new Set(hit.flatMap((h) => h.missing))];
    out.push({ code: "LEGAL_DECIDER_CLOSED", severity: "REVISION", detail: `"${sentence.slice(0, 120)}" presents who decides as a complete list (${[...mine].join(", ")}), but the section quoted in ${hit.map((h) => h.id).join(", ")} also names ${missing.join(", ")}; name it too, or say "a local official, such as ..."` });
  }
  return out;
}

// ---------- the verification record of the cited claims ----------
/**
 * Findings from the cited claims' verification records. A cited high-risk claim must carry its exact quote, section and label; BROADER or WRONG, or a
 * reader impact of "changes", blocks it; a gate carried by another claim means this unit must cite that claim too.
 */
export function legalRecordFindings(cited: LedgerClaim[]): Finding[] {
  const out: Finding[] = [];
  const ids = new Set(cited.map((c) => c.id));
  for (const c of cited) {
    if (c.risk !== "high" && c.risk !== "critical") continue;
    const v = c.verification;
    if (!v || !v.quote?.trim() || !v.label || !v.section) {
      out.push({ code: "UNVERIFIED_LEGAL_CLAIM", severity: "BLOCKED_CLAIM", detail: `high-risk legal claim ${c.id} has no ${!v?.quote?.trim() ? "exact official quote" : !v?.section ? "section" : "label"} in the ledger; it cannot be cited until Leo's official print is claimed with the full record (ask Leo for a reference)` });
      continue;
    }
    if (v.label === "BROADER" || v.label === "WRONG") out.push({ code: "LEGAL_CLAIM_NOT_MATCHING", severity: "BLOCKED_CLAIM", detail: `claim ${c.id} is labelled ${v.label}: it says more than, or contradicts, the official text` });
    else if (v.readerImpact === "changes") out.push({ code: "LEGAL_GATE_UNCARRIED", severity: "BLOCKED_CLAIM", detail: `claim ${c.id} leaves out a gate of the quoted section that changes what a reader would believe or do and no cited claim states it; fix the claim or cite the claim that carries it` });
    else if (v.label === "NARROWER" && (!v.reason?.trim() || v.readerImpact !== "none")) out.push({ code: "LEGAL_NARROWER_UNRECORDED", severity: "BLOCKED_CLAIM", detail: `claim ${c.id} is NARROWER without a recorded reason and a reader impact of "none"` });
    for (const g of v.gates) if (g.carried_by && !ids.has(g.carried_by)) out.push({ code: "GATE_CLAIM_NOT_CITED", severity: "REVISION", detail: `claim ${c.id}: its gate "${g.text.slice(0, 60)}" is carried by ${g.carried_by}, which this unit does not cite; cite ${g.carried_by} and state the gate` });
  }
  return out;
}
