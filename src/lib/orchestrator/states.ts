// Blueprint §7 workflow states and the ONLY allowed transitions. Pure module: no I/O.

export const STATES = [
  "CANDIDATE", "SEO_REVIEW",
  "REJECTED", "HOLD_DUPLICATION", "HOLD_EVIDENCE", "RESEARCH_PENDING",
  "EVIDENCE_REVIEW", "BRIEF_REVIEW", "BRIEF_APPROVED", "DRAFTING",
  "FACT_PRIVACY_REVIEW", "SEO_AEO_GEO_REVIEW", "EDITORIAL_REVIEW", "HUMAN_REVIEW",
  "APPROVED_FOR_WP_DRAFT", "WP_DRAFT_CREATED", "WP_RENDER_QA",
  "READY_FOR_MANUAL_PUBLICATION", "PUBLISHED", "MONITORING", "REFRESH_CANDIDATE",
  "REVISION_REQUIRED", "BLOCKED_PRIVACY", "BLOCKED_CLAIM", "INTEGRATION_ERROR", "CANCELLED",
] as const;
export type State = (typeof STATES)[number];

export const REVISION_LIMIT = 2;

const REVIEW_STATES: State[] = [
  "EVIDENCE_REVIEW", "BRIEF_REVIEW", "FACT_PRIVACY_REVIEW",
  "SEO_AEO_GEO_REVIEW", "EDITORIAL_REVIEW", "HUMAN_REVIEW",
];
// After sign-off, any edit sends the work back (approval is invalidated).
const POST_SIGNOFF: State[] = ["APPROVED_FOR_WP_DRAFT", "WP_DRAFT_CREATED", "WP_RENDER_QA", "READY_FOR_MANUAL_PUBLICATION"];
const BLOCKABLE: State[] = ["DRAFTING", "FACT_PRIVACY_REVIEW", "SEO_AEO_GEO_REVIEW", "EDITORIAL_REVIEW", "HUMAN_REVIEW", "BRIEF_REVIEW", "EVIDENCE_REVIEW"];
const TERMINAL: State[] = ["REJECTED", "CANCELLED"];

const base: Partial<Record<State, State[]>> = {
  CANDIDATE: ["SEO_REVIEW"],
  SEO_REVIEW: ["REJECTED", "HOLD_DUPLICATION", "HOLD_EVIDENCE", "RESEARCH_PENDING", "EVIDENCE_REVIEW"],
  HOLD_DUPLICATION: ["SEO_REVIEW"],
  HOLD_EVIDENCE: ["SEO_REVIEW"],
  RESEARCH_PENDING: ["SEO_REVIEW"],
  EVIDENCE_REVIEW: ["BRIEF_REVIEW"],
  BRIEF_REVIEW: ["BRIEF_APPROVED"],
  BRIEF_APPROVED: ["DRAFTING"],
  DRAFTING: ["FACT_PRIVACY_REVIEW"],
  FACT_PRIVACY_REVIEW: ["SEO_AEO_GEO_REVIEW"],
  SEO_AEO_GEO_REVIEW: ["EDITORIAL_REVIEW"],
  EDITORIAL_REVIEW: ["HUMAN_REVIEW"],
  HUMAN_REVIEW: ["APPROVED_FOR_WP_DRAFT"],
  APPROVED_FOR_WP_DRAFT: ["WP_DRAFT_CREATED"],
  WP_DRAFT_CREATED: ["WP_RENDER_QA"],
  WP_RENDER_QA: ["READY_FOR_MANUAL_PUBLICATION"],
  READY_FOR_MANUAL_PUBLICATION: ["PUBLISHED"],
  PUBLISHED: ["MONITORING", "REFRESH_CANDIDATE"],
  REFRESH_CANDIDATE: ["SEO_REVIEW"],
  REVISION_REQUIRED: ["DRAFTING", "EVIDENCE_REVIEW", "BRIEF_REVIEW"],
  BLOCKED_PRIVACY: ["REVISION_REQUIRED"],
  BLOCKED_CLAIM: ["REVISION_REQUIRED"],
};

function build(): Record<State, Set<State>> {
  const t = Object.fromEntries(STATES.map((s) => [s, new Set<State>(base[s] ?? [])])) as Record<State, Set<State>>;
  for (const s of [...REVIEW_STATES, ...POST_SIGNOFF]) t[s].add("REVISION_REQUIRED");
  for (const s of BLOCKABLE) { t[s].add("BLOCKED_PRIVACY"); t[s].add("BLOCKED_CLAIM"); }
  for (const s of STATES) {
    if (TERMINAL.includes(s) || s === "CANCELLED") continue;
    if (s !== "INTEGRATION_ERROR") t[s].add("INTEGRATION_ERROR");
    t[s].add("CANCELLED");
  }
  // MONITORING is a resting state; it can only go back through a refresh candidate.
  t.MONITORING.add("REFRESH_CANDIDATE");
  t.INTEGRATION_ERROR = new Set(); // recovery returns to prior_state (see orchestrator)
  t.INTEGRATION_ERROR.add("CANCELLED");
  return t;
}
export const TRANSITIONS = build();

// Moves an agent may never make: these are human gates (blueprint §7 / core rule 7).
export const HUMAN_ONLY_TARGETS: State[] = [
  "BRIEF_APPROVED", "APPROVED_FOR_WP_DRAFT", "READY_FOR_MANUAL_PUBLICATION", "PUBLISHED",
  "REJECTED", "CANCELLED",
];
export const REQUIRES_VALID_APPROVAL: State[] = ["APPROVED_FOR_WP_DRAFT"];

export function isAllowed(from: State, to: State): boolean {
  return TRANSITIONS[from].has(to);
}
