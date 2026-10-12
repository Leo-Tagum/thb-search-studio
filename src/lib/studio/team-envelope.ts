/* eslint-disable @typescript-eslint/no-explicit-any -- DB JSON columns */
// The team loop state of one unit lives in article_sections.issues (no extra columns): the loop state itself, the co-writer's suggestions for the
// current version, the council's cards for the current version, and the tickets W1 is waiting on. Shared by the team runtime and by Leo's
// resolveSection, so a team article's state is never rewritten in the classic shape.
import type { SupabaseClient } from "@supabase/supabase-js";
import { newTeamSection, type CouncilRole, type TeamSectionState } from "../team/loop";
import type { FeedbackCard } from "../team/tickets";

export type CouncilStored = { versionHash: string; decision: string; cards: FeedbackCard[]; findings: any[] };
export type Envelope = { team: TeamSectionState; suggestions?: { versionHash: string; items: any[] }; councilCards?: Partial<Record<CouncilRole, CouncilStored>>; waitingOn?: string[]; disagreements?: any[] };

export const envelopeOf = (row: any): Envelope => (row.issues && typeof row.issues === "object" && !Array.isArray(row.issues) && row.issues.team ? (row.issues as Envelope) : { team: newTeamSection(row.section_key) });

export async function saveEnvelope(db: SupabaseClient, row: any, env: Envelope, extra: Record<string, unknown> = {}) {
  const { error } = await db.from("article_sections").update({ status: env.team.status, locked: env.team.status === "LOCKED", issues: env, ...extra }).eq("id", row.id);
  if (error) throw error;
  row.issues = env; row.status = env.team.status;
}
