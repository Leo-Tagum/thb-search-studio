// Phase 3c: Strategy team (S1, S2) rules that live in code. S2 answers a ROOT_CAUSE_NOTE with a brief revision.
//   - The brief Leo approved has a fixed identity (Leo, 2026-10-12): target keyword, working title, H2 questions (text, order, count), slug/URL,
//     the action and target page (CREATE or UPDATE), the required links (for example /hoarder-houses/), the never-target keyword list, and any
//     protected or money-page constraint. A change to any of them is never applied here: it is returned as a HUMAN_ESCALATION (trigger brief_change).
//   - Anything else in the brief may be fixed, and the revision must list the affected units, exactly. Code computes what changed
//     and checks S2's list against it, so only the affected units are redone and every other locked unit stays locked.
//   - Every claim the revised brief cites must be a supported ledger claim (no new facts through the brief).
// Pure: it validates and classifies. The service applies a "revise" outcome (new brief version, reopen the listed units).
import { z } from "zod";
import { agent3Result } from "../agents/schemas";
import { stableStringify } from "../studio/hash";
import { feedbackCard, type FeedbackCard } from "./tickets";

export const briefSchema = agent3Result.shape.brief;
export type Brief = z.infer<typeof briefSchema>;

export const rootCauseResult = z.strictObject({
  ticket_id: z.string().min(1),
  root_cause: z.string().min(10),
  target_keyword: z.string().min(2),
  slug: z.string().nullable(),                                  // approved identity, echoed so code can compare it
  action: z.enum(["CREATE", "UPDATE"]),
  target_page: z.string().nullable(),                           // the existing page an UPDATE changes
  brief: briefSchema,
  affected_units: z.array(z.strictObject({ unit_key: z.string().regex(/^(s\d+|faq)$/), reason: z.string().min(5) })),
  tickets: z.array(feedbackCard),
});
export type RootCauseResult = z.infer<typeof rootCauseResult>;

export type RootCauseOutcome =
  | { kind: "invalid"; errors: string[] }
  | { kind: "escalate"; trigger: "brief_change"; changed: string[]; reason: string; card: FeedbackCard }
  | { kind: "no_brief_change"; rootCause: string }
  | { kind: "revise"; brief: Brief; affectedUnits: string[]; reasons: Record<string, string>; globalChanges: string[]; tickets: FeedbackCard[] };

const norm = (x: string) => x.replace(/\s+/g, " ").trim().toLowerCase();
const GLOBAL_FIELDS = ["seller_situation_map", "honest_options", "real_world_warnings", "professional_confirmation", "target_reader", "fan_out", "visuals", "link_plan", "cta", "open_items"] as const;

/** What Leo approved and S2 may not change. Lists may be empty; the values come from the approved brief, the opportunity decision and the redirect/protection records. */
export type ApprovedIdentity = {
  brief: Brief; keyword: string;
  slug: string | null;
  action: "CREATE" | "UPDATE";
  targetPage: string | null;
  requiredLinks: string[];              // e.g. https://www.twinhomebuyer.com/hoarder-houses/
  forbiddenTargetPhrases: string[];     // the "never target" keyword list
  protectedUrls: string[];              // money pages and protected pages: the brief may not start or stop touching them
};

const slash = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();
const slugNorm = (x: string | null) => (x ?? "").trim().replace(/^\/+|\/+$/g, "").toLowerCase();
const count = (hay: string, needle: string) => (needle ? hay.split(needle.toLowerCase()).length - 1 : 0);
/** The text a brief uses to aim at a keyword: title, answer plan, headings, purposes, notes, fan-out questions, link anchors, reader, CTA. */
const targetingText = (b: Brief) => [b.working_title, b.answer_first, b.target_reader, b.cta, ...b.outline.flatMap((o) => [o.h2, o.purpose, o.notes ?? ""]), ...b.fan_out.map((f) => f.question), ...b.link_plan.map((l) => l.anchor_intent)].join("\n").toLowerCase();

export function resolveRootCause(a: {
  ticket: { id: string; type: string; to: string; unitKey: string | null };
  approved: ApprovedIdentity;
  output: unknown;
  supportedClaimIds: ReadonlySet<string>;
}): RootCauseOutcome {
  if (a.ticket.type !== "ROOT_CAUSE_NOTE" || a.ticket.to !== "S2") return { kind: "invalid", errors: ["S2 answers ROOT_CAUSE_NOTE tickets addressed to S2"] };
  const p = rootCauseResult.safeParse(a.output);
  if (!p.success) return { kind: "invalid", errors: p.error.issues.map((i) => `${i.path.join(".") || "result"}: ${i.message}`) };
  const out = p.data;
  const errors: string[] = [];
  if (out.ticket_id !== a.ticket.id) errors.push(`ticket_id ${out.ticket_id} does not match the ticket being answered (${a.ticket.id})`);
  for (const t of out.tickets) {
    if (t.from.length !== 1 || t.from[0] !== "S2") errors.push("S2 may only raise tickets as S2");
    else if (t.ticket !== "EVIDENCE_REQUEST" && t.ticket !== "HUMAN_ESCALATION") errors.push(`S2 raises EVIDENCE_REQUEST or HUMAN_ESCALATION, not ${t.ticket}`);
  }
  if (errors.length) return { kind: "invalid", errors };

  // Identity of the approved brief: keyword, title, H2 questions. A change is Leo's decision.
  const old = a.approved.brief;
  const changed: string[] = [];
  if (norm(out.target_keyword) !== norm(a.approved.keyword)) changed.push(`target keyword "${a.approved.keyword}" -> "${out.target_keyword}"`);
  if (norm(out.brief.working_title) !== norm(old.working_title)) changed.push(`working title "${old.working_title}" -> "${out.brief.working_title}"`);
  const oldH2 = old.outline.map((o) => norm(o.h2));
  const newH2 = out.brief.outline.map((o) => norm(o.h2));
  if (JSON.stringify(oldH2) !== JSON.stringify(newH2)) changed.push(`H2 questions (${oldH2.length} -> ${newH2.length}, text or order changed)`);
  if (slugNorm(out.slug) !== slugNorm(a.approved.slug)) changed.push(`slug/URL "${a.approved.slug ?? ""}" -> "${out.slug ?? ""}"`);
  if (out.action !== a.approved.action) changed.push(`action ${a.approved.action} -> ${out.action}`);
  if (slash(out.target_page ?? "") !== slash(a.approved.targetPage ?? "")) changed.push(`target page "${a.approved.targetPage ?? ""}" -> "${out.target_page ?? ""}"`);
  const links = new Set(out.brief.link_plan.map((l) => slash(l.to_url)));
  for (const u of a.approved.requiredLinks) if (!links.has(slash(u))) changed.push(`required link ${u} is no longer in the link plan`);
  const newTarget = targetingText(out.brief);
  const oldTarget = targetingText(old);
  for (const ph of a.approved.forbiddenTargetPhrases) if (count(newTarget, ph) > count(oldTarget, ph)) changed.push(`the brief now aims at "${ph}", a never-target keyword`);
  const newAll = JSON.stringify(out.brief).toLowerCase();
  const oldAll = JSON.stringify(old).toLowerCase();
  for (const u of a.approved.protectedUrls) if (count(newAll, slash(u)) !== count(oldAll, slash(u))) changed.push(`protected / money page ${u} is touched differently (${count(oldAll, slash(u))} -> ${count(newAll, slash(u))} references)`);
  if (changed.length) {
    const reason = `A fix for ${a.ticket.id} would alter what was approved: ${changed.join("; ")}.`;
    const card: FeedbackCard = { ticket: "HUMAN_ESCALATION", trigger: "brief_change", from: ["S2"], to: "LEO", section: a.ticket.unitKey ?? "brief", issue: reason.slice(0, 600), severity: "must fix", evidence: `ROOT_CAUSE_NOTE ${a.ticket.id}: ${out.root_cause}`.slice(0, 1000), fix: "Recommendation: approve the change only if the root cause cannot be fixed inside the approved brief.", blocking: false };
    return { kind: "escalate", trigger: "brief_change", changed, reason, card };
  }

  // What actually changed, computed by code.
  const outlineChanged = out.brief.outline.map((o, i) => (stableStringify(o) !== stableStringify(old.outline[i]) ? `s${i + 1}` : null)).filter((x): x is string => !!x);
  const required = new Set(outlineChanged);
  if (out.brief.answer_first !== old.answer_first) required.add("s1");
  const globalChanges = GLOBAL_FIELDS.filter((f) => stableStringify(out.brief[f]) !== stableStringify(old[f]));
  if (!required.size && !globalChanges.length) {
    return out.affected_units.length ? { kind: "invalid", errors: ["affected_units lists units but the brief did not change"] } : { kind: "no_brief_change", rootCause: out.root_cause };
  }

  const valid = new Set([...out.brief.outline.map((_, i) => `s${i + 1}`), "faq"]);
  const declared = out.affected_units.map((u) => u.unit_key);
  if (new Set(declared).size !== declared.length) errors.push("affected_units lists a unit twice");
  for (const k of declared) if (!valid.has(k)) errors.push(`affected unit ${k} is not a unit of this article`);
  for (const k of required) if (!declared.includes(k)) errors.push(`the change touches ${k}, but it is not in affected_units`);
  if (!declared.length) errors.push("a brief revision must name the affected units");
  if (!globalChanges.length) for (const k of declared) if (!required.has(k)) errors.push(`${k} is listed as affected but the change does not touch it (only affected units are redone)`);

  // No new facts through the brief: every cited claim is a supported ledger claim.
  const cited = [...out.brief.outline.flatMap((o) => o.claim_ids), ...out.brief.honest_options.flatMap((o) => o.claim_ids), ...out.brief.real_world_warnings.flatMap((o) => o.claim_ids), ...out.brief.seller_situation_map.flatMap((o) => o.claim_ids)];
  for (const id of new Set(cited)) if (!a.supportedClaimIds.has(id)) errors.push(`the brief cites ${id}, which is not a supported claim in the ledger`);
  if (errors.length) return { kind: "invalid", errors };

  const order = (k: string) => (k === "faq" ? Infinity : Number(k.slice(1)));
  return { kind: "revise", brief: out.brief, affectedUnits: [...declared].sort((x, y) => order(x) - order(y)), reasons: Object.fromEntries(out.affected_units.map((u) => [u.unit_key, u.reason])), globalChanges: [...globalChanges], tickets: out.tickets };
}
