// Phase 3c: ticket types and the feedback card. Strict: unknown keys, unknown ticket types and non-V1 blockers are rejected.
// Mirrors the CHECK constraints in migration 0015 (roles, types, severities, only_v1_blocks, no_self_ticket).
import { z } from "zod";

export const TICKET_TYPES = ["EVIDENCE_REQUEST", "ROOT_CAUSE_NOTE", "QUALITY_CORRECTION", "HUMAN_ESCALATION"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TEAM_ROLES = ["R1", "R2", "R3", "S1", "S2", "W1", "W2", "V1", "V2", "V3"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
export const SEVERITIES = ["must fix", "should fix", "suggestion"] as const;
export type Severity = (typeof SEVERITIES)[number];

const role = z.enum(TEAM_ROLES);
const text = (max: number) => z.string().trim().min(3).max(max);
// One issue per card: no line breaks and no bullet or numbered lists.
const oneIssue = text(600).refine((s) => !/[\r\n]/.test(s) && !/(^|\s)(\d+[.)]|[-*•])\s+\S.*(\s(\d+[.)]|[-*•])\s+\S)/.test(s), "one issue per ticket");

export const feedbackCard = z
  .strictObject({
    ticket: z.enum(TICKET_TYPES),
    from: z.array(role).min(1).max(3).refine((a) => new Set(a).size === a.length, "duplicate roles in FROM"),  // "V2 + V3 (agreed)" is ["V2","V3"]
    to: z.union([role, z.literal("LEO")]),
    section: z.string().trim().min(1).max(60),
    issue: oneIssue,
    severity: z.enum(SEVERITIES),
    evidence: text(1000),                       // query / rule / source id; a card without evidence is rejected
    fix: text(1500).nullish(),
    blocking: z.boolean(),
  })
  .superRefine((c, ctx) => {
    if (c.blocking && !(c.from.length === 1 && c.from[0] === "V1")) ctx.addIssue({ code: "custom", path: ["blocking"], message: "BLOCKING: yes is accepted only from V1" });
    if (c.from.includes(c.to as TeamRole)) ctx.addIssue({ code: "custom", path: ["to"], message: "a ticket cannot be addressed to its own sender" });
    if ((c.ticket === "HUMAN_ESCALATION") !== (c.to === "LEO")) ctx.addIssue({ code: "custom", path: ["to"], message: "HUMAN_ESCALATION goes to LEO, and only HUMAN_ESCALATION does" });
    if (c.ticket === "ROOT_CAUSE_NOTE" && c.to !== "S2") ctx.addIssue({ code: "custom", path: ["to"], message: "ROOT_CAUSE_NOTE goes to S2 (the brief owner)" });
    if (c.ticket === "EVIDENCE_REQUEST" && !["R1", "R2", "R3"].includes(c.to)) ctx.addIssue({ code: "custom", path: ["to"], message: "EVIDENCE_REQUEST goes to Research (R1, R2 or R3)" });
    if (c.ticket === "QUALITY_CORRECTION" && c.to !== "W1") ctx.addIssue({ code: "custom", path: ["to"], message: "QUALITY_CORRECTION goes to W1 only (W2 suggests, it never receives corrections)" });
  });
export type FeedbackCard = z.infer<typeof feedbackCard>;

export const parseFeedbackCard = (raw: unknown) => feedbackCard.safeParse(raw);

// Renders the card in the proposal's text layout (for the Team tab and the operator packets).
export const formatFeedbackCard = (c: FeedbackCard): string =>
  [`TICKET:   ${c.ticket}`, `FROM:     ${c.from.join(" + ")}${c.from.length > 1 ? " (agreed)" : ""}`, `TO:       ${c.to}`, `SECTION:  ${c.section}`, `ISSUE:    ${c.issue}`, `SEVERITY: ${c.severity}`, `EVIDENCE: ${c.evidence}`, `FIX:      ${c.fix ?? "-"}`, `BLOCKING: ${c.blocking ? "yes" : "no"}`].join("\n");
