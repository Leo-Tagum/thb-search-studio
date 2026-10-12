// Phase 3c: the Review council's one combined feedback set. Done by code, so agreement between agents is never what protects a rule:
//   - every V1 card is kept exactly as raised (V1 can block; its items are never merged away or softened);
//   - the same issue raised by V2 and V3 becomes one card from both (FROM: V2 + V3), at the strongest severity either gave;
//   - a must-fix is never dropped or downgraded, whoever raised it;
//   - a V2/V3 card that repeats a V1 card is folded into it only when V1's card is at least as strong;
//   - disagreements (different severity or different suggested fix for the same issue) are listed for Leo, not hidden;
//   - cards for other teams (EVIDENCE_REQUEST, ROOT_CAUSE_NOTE, HUMAN_ESCALATION) pass through untouched, to the router.
// Every combined card keeps links to the original cards it came from (mergedFrom ids, with the originals in `originals`) and says how it was
// matched (mergeBasis), so a wrong merge by similar wording is visible and the originals open on click.
// The combiner checks its own output against these rules and throws if it ever breaks one.
import { feedbackCard, type FeedbackCard, type Severity } from "./tickets";

export type CouncilItem = { id: string; card: FeedbackCard };       // id: stable id of the original card as stored (for example a ticket_messages id)
export type MergeBasis = "single" | "key" | "wording";               // single: nothing merged; key: same issue key; wording: matched by similar text (check these)
export type CombinedCard = { id: string; card: FeedbackCard; mergedFrom: string[]; mergeBasis: MergeBasis };
export type Disagreement = { section: string; kind: "severity" | "fix"; roles: string[]; detail: string; cardIds: string[] };
export type Combined = {
  toWriter: CombinedCard[];                                     // one set for W1: V1 cards first, then by severity
  passThrough: CouncilItem[];                                   // other ticket types, unchanged
  originals: Record<string, FeedbackCard>;                      // every input card by id, so any merged card can show what it came from
  disagreements: Disagreement[];
  absorbedByV1: { id: string; into: string; section: string; from: string; issue: string }[];
};

const RANK: Record<Severity, number> = { "must fix": 3, "should fix": 2, suggestion: 1 };
const words = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
type Match = "key" | "wording" | null;
const match = (a: FeedbackCard, b: FeedbackCard): Match => {
  if (a.section !== b.section) return null;
  if (a.key && b.key && a.key === b.key) return "key";
  const x = words(a.issue), y = words(b.issue);
  if (!x.size || !y.size) return null;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  return inter / (x.size + y.size - inter) >= 0.5 ? "wording" : null;
};
const sameText = (a: string, b: string) => a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();
const isQC = (c: FeedbackCard) => c.ticket === "QUALITY_CORRECTION";

export function combineFeedback(input: CouncilItem[]): Combined {
  const ids = new Set<string>();
  for (const { id, card: c } of input) {
    if (ids.has(id)) throw new Error(`duplicate card id ${id}`);
    ids.add(id);
    const p = feedbackCard.safeParse(c);
    if (!p.success) throw new Error(`invalid card in the council set: ${p.error.issues.map((i) => i.message).join("; ")}`);
    if (c.from.length !== 1 || !["V1", "V2", "V3"].includes(c.from[0])) throw new Error("the council combines single-reviewer cards from V1, V2 and V3 only");
  }
  const originals = Object.fromEntries(input.map((i) => [i.id, i.card]));
  const qc = input.filter((i) => isQC(i.card));
  const passThrough = input.filter((i) => !isQC(i.card));
  const v1 = qc.filter((i) => i.card.from[0] === "V1");
  const rest = qc.filter((i) => i.card.from[0] !== "V1");

  // Cluster V2/V3 cards that describe the same issue.
  const clusters: { items: CouncilItem[]; joined: Set<"key" | "wording"> }[] = [];
  for (const it of rest) {
    let hit: (typeof clusters)[number] | undefined;
    let how: Match = null;
    for (const cl of clusters) for (const m of cl.items) { const r = match(m.card, it.card); if (r && (!how || r === "key")) { hit = cl; how = r; } }
    if (hit && how) { hit.items.push(it); hit.joined.add(how); }
    else clusters.push({ items: [it], joined: new Set() });
  }

  const disagreements: Disagreement[] = [];
  const absorbedByV1: Combined["absorbedByV1"] = [];
  const absorbedInto = new Map<string, string[]>();     // V1 card id -> ids of V2/V3 cards folded into it
  const merged: CombinedCard[] = [];
  let n = 0;
  for (const cl of clusters) {
    const cards = cl.items.map((i) => i.card);
    const top = cards.reduce((a, b) => (RANK[b.severity] > RANK[a.severity] ? b : a));
    const roles = [...new Set(cards.map((c) => c.from[0]))].sort();
    // A V1 card on the same issue absorbs the cluster only if it is at least as strong: a must-fix is never lost.
    const v1Hit = v1.find((c) => cards.some((m) => match(c.card, m)) && RANK[c.card.severity] >= RANK[top.severity]);
    if (v1Hit) {
      for (const i of cl.items) { absorbedByV1.push({ id: i.id, into: v1Hit.id, section: i.card.section, from: i.card.from[0], issue: i.card.issue }); }
      absorbedInto.set(v1Hit.id, [...(absorbedInto.get(v1Hit.id) ?? []), ...cl.items.map((i) => i.id)]);
      continue;
    }
    const cardIds = cl.items.map((i) => i.id);
    const severities = new Set(cards.map((c) => c.severity));
    if (severities.size > 1) disagreements.push({ section: top.section, kind: "severity", roles, cardIds, detail: cards.map((c) => `${c.from[0]}: ${c.severity}`).join("; ") + ` (kept ${top.severity}) - ${top.issue}` });
    const fixes = cards.filter((c) => c.fix);
    if (fixes.length > 1 && fixes.some((f) => !sameText(f.fix!, fixes[0].fix!))) disagreements.push({ section: top.section, kind: "fix", roles, cardIds, detail: fixes.map((c) => `${c.from[0]}: ${c.fix}`).join(" | ") });
    const only = cl.items.length === 1;
    merged.push({
      id: only ? cl.items[0].id : `m:${++n}`, mergedFrom: cardIds, mergeBasis: only ? "single" : cl.joined.has("wording") ? "wording" : "key",
      card: {
        ticket: "QUALITY_CORRECTION", ...(top.key ? { key: top.key } : {}), from: roles as FeedbackCard["from"], to: "W1", section: top.section, issue: top.issue, severity: top.severity,
        evidence: [...new Set(cards.map((c) => c.evidence))].join(" | ").slice(0, 1000), fix: top.fix ?? fixes[0]?.fix ?? null, blocking: false,
      },
    });
  }
  merged.sort((a, b) => RANK[b.card.severity] - RANK[a.card.severity]);   // stable: input order within a severity
  const v1Cards: CombinedCard[] = v1.map((i) => ({ id: i.id, card: { ...i.card }, mergedFrom: [i.id, ...(absorbedInto.get(i.id) ?? [])], mergeBasis: absorbedInto.get(i.id) ? "wording" : "single" }));
  const out: Combined = { toWriter: [...v1Cards, ...merged], passThrough, originals, disagreements, absorbedByV1 };
  const errs = combinedSetErrors(input, out);
  if (errs.length) throw new Error(`combined feedback set broke a rule: ${errs.join("; ")}`);
  return out;
}

/** The card exactly as the router accepts it (without the combiner's links). */
export const toTicketCard = (c: CombinedCard): FeedbackCard => c.card;

/** Rules every combined set must satisfy. Used by the combiner itself and by tests. */
export function combinedSetErrors(input: CouncilItem[], out: Combined): string[] {
  const errs: string[] = [];
  const ids = new Set(input.map((i) => i.id));
  for (const i of input.filter((x) => isQC(x.card) && x.card.from[0] === "V1")) if (!out.toWriter.some((o) => o.id === i.id && JSON.stringify(o.card) === JSON.stringify(i.card))) errs.push(`V1 card dropped or changed: ${i.card.issue}`);
  for (const i of input.filter((x) => isQC(x.card) && x.card.from[0] !== "V1")) {
    const c = i.card;
    const covered = out.toWriter.some((o) => o.mergedFrom.includes(i.id) && o.card.section === c.section && RANK[o.card.severity] >= RANK[c.severity] && (o.card.from as string[]).includes(c.from[0]));
    const absorbed = out.absorbedByV1.some((a) => a.id === i.id) && out.toWriter.some((o) => o.mergedFrom.includes(i.id) && (o.card.from as string[]).includes("V1") && o.card.section === c.section && RANK[o.card.severity] >= RANK[c.severity]);
    if (!covered && !absorbed) errs.push(`${c.severity} from ${c.from[0]} was dropped or downgraded: ${c.issue}`);
  }
  for (const o of out.toWriter) {
    for (const id of o.mergedFrom) if (!ids.has(id) || !(id in out.originals)) errs.push(`card ${o.id} links to unknown original ${id}`);
    if (o.card.blocking && !(o.card.from.length === 1 && o.card.from[0] === "V1")) errs.push("only V1 can block");
  }
  for (const i of input.filter((x) => !isQC(x.card))) if (!out.passThrough.some((p) => p.id === i.id)) errs.push(`a ${i.card.ticket} card was lost`);
  return errs;
}
