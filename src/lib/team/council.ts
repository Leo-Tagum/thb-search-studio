// Phase 3c: the Review council's one combined feedback set. Done by code, so agreement between agents is never what protects a rule:
//   - every V1 card is kept exactly as raised (V1 can block; its items are never merged away or softened);
//   - the same issue raised by V2 and V3 becomes one card from both (FROM: V2 + V3), at the strongest severity either gave;
//   - a must-fix is never dropped or downgraded, whoever raised it;
//   - a V2/V3 card that repeats a V1 card is folded into it only when V1's card is at least as strong;
//   - disagreements (different severity or different suggested fix for the same issue) are listed for Leo, not hidden;
//   - cards for other teams (EVIDENCE_REQUEST, ROOT_CAUSE_NOTE, HUMAN_ESCALATION) pass through untouched, to the router.
// The combiner checks its own output against these rules and throws if it ever breaks one.
import { feedbackCard, type FeedbackCard, type Severity } from "./tickets";

export type Disagreement = { section: string; kind: "severity" | "fix"; roles: string[]; detail: string };
export type Combined = {
  toWriter: FeedbackCard[];                                     // one set for W1: V1 cards first, then by severity
  passThrough: FeedbackCard[];                                  // other ticket types, unchanged
  disagreements: Disagreement[];
  absorbedByV1: { section: string; from: string; issue: string }[];
};

const RANK: Record<Severity, number> = { "must fix": 3, "should fix": 2, suggestion: 1 };
const words = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
const similar = (a: FeedbackCard, b: FeedbackCard) => {
  if (a.section !== b.section) return false;
  if (a.key && b.key && a.key === b.key) return true;
  const x = words(a.issue), y = words(b.issue);
  if (!x.size || !y.size) return false;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  return inter / (x.size + y.size - inter) >= 0.5;
};
const sameText = (a: string, b: string) => a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();
const isQC = (c: FeedbackCard) => c.ticket === "QUALITY_CORRECTION";

export function combineFeedback(input: FeedbackCard[]): Combined {
  for (const c of input) {
    const p = feedbackCard.safeParse(c);
    if (!p.success) throw new Error(`invalid card in the council set: ${p.error.issues.map((i) => i.message).join("; ")}`);
    if (c.from.length !== 1 || !["V1", "V2", "V3"].includes(c.from[0])) throw new Error("the council combines single-reviewer cards from V1, V2 and V3 only");
  }
  const qc = input.filter(isQC);
  const passThrough = input.filter((c) => !isQC(c));
  const v1 = qc.filter((c) => c.from[0] === "V1");
  const rest = qc.filter((c) => c.from[0] !== "V1");

  // Cluster V2/V3 cards that describe the same issue.
  const clusters: FeedbackCard[][] = [];
  for (const c of rest) {
    const hit = clusters.find((cl) => cl.some((m) => similar(m, c)));
    if (hit) hit.push(c); else clusters.push([c]);
  }
  const disagreements: Disagreement[] = [];
  const absorbedByV1: Combined["absorbedByV1"] = [];
  const merged: FeedbackCard[] = [];
  for (const cl of clusters) {
    const top = cl.reduce((a, b) => (RANK[b.severity] > RANK[a.severity] ? b : a));
    const roles = [...new Set(cl.map((c) => c.from[0]))].sort();
    // A V1 card on the same issue absorbs the cluster only if it is at least as strong: a must-fix is never lost.
    const v1Hit = v1.find((c) => cl.some((m) => similar(c, m)) && RANK[c.severity] >= RANK[top.severity]);
    if (v1Hit) { for (const m of cl) absorbedByV1.push({ section: m.section, from: m.from[0], issue: m.issue }); continue; }
    const severities = new Set(cl.map((c) => c.severity));
    if (severities.size > 1) disagreements.push({ section: top.section, kind: "severity", roles, detail: cl.map((c) => `${c.from[0]}: ${c.severity}`).join("; ") + ` (kept ${top.severity}) - ${top.issue}` });
    const fixes = cl.filter((c) => c.fix);
    if (fixes.length > 1 && fixes.some((f) => !sameText(f.fix!, fixes[0].fix!))) disagreements.push({ section: top.section, kind: "fix", roles, detail: fixes.map((c) => `${c.from[0]}: ${c.fix}`).join(" | ") });
    merged.push({
      ticket: "QUALITY_CORRECTION", ...(top.key ? { key: top.key } : {}), from: roles as FeedbackCard["from"], to: "W1", section: top.section, issue: top.issue, severity: top.severity,
      evidence: [...new Set(cl.map((c) => c.evidence))].join(" | ").slice(0, 1000), fix: top.fix ?? fixes[0]?.fix ?? null, blocking: false,
    });
  }
  merged.sort((a, b) => RANK[b.severity] - RANK[a.severity]);   // stable: input order within a severity
  const out: Combined = { toWriter: [...v1.map((c) => ({ ...c })), ...merged], passThrough, disagreements, absorbedByV1 };
  const errs = combinedSetErrors(input, out);
  if (errs.length) throw new Error(`combined feedback set broke a rule: ${errs.join("; ")}`);
  return out;
}

/** Rules every combined set must satisfy. Used by the combiner itself and by tests. */
export function combinedSetErrors(input: FeedbackCard[], out: Combined): string[] {
  const errs: string[] = [];
  for (const c of input.filter((x) => isQC(x) && x.from[0] === "V1")) if (!out.toWriter.some((o) => JSON.stringify(o) === JSON.stringify(c))) errs.push(`V1 card dropped or changed: ${c.issue}`);
  for (const c of input.filter((x) => isQC(x) && x.from[0] !== "V1")) {
    const covered = out.toWriter.some((o) => o.section === c.section && RANK[o.severity] >= RANK[c.severity] && (o.from as string[]).includes(c.from[0]));
    const absorbed = out.absorbedByV1.some((a) => a.section === c.section && a.issue === c.issue && a.from === c.from[0]) && out.toWriter.some((o) => (o.from as string[]).includes("V1") && o.section === c.section && RANK[o.severity] >= RANK[c.severity]);
    if (!covered && !absorbed) errs.push(`${c.severity} from ${c.from[0]} was dropped or downgraded: ${c.issue}`);
  }
  if (out.toWriter.some((o) => o.blocking && !(o.from.length === 1 && o.from[0] === "V1"))) errs.push("only V1 can block");
  for (const c of input.filter((x) => !isQC(x))) if (!out.passThrough.includes(c)) errs.push(`a ${c.ticket} card was lost`);
  return errs;
}
