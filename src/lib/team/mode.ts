// Phase 3c task 10: the per-article pipeline switch (classic or team). Pure rules; the service applies them and records the change.
//   - Classic stays the default and keeps working unchanged.
//   - A team article refuses classic agent runs and the reverse, so the two pipelines can never mix on one article.
//   - The mode can change only before any section is written, or on a team-mode branch (the comparison run, Task 14), and never once a proposal exists.
import { STUDIO_AGENT_KEYS } from "../studio/agents";
import { TEAM_AGENT_FILE } from "./bridge";

export const PIPELINE_MODES = ["classic", "team"] as const;
export type PipelineMode = (typeof PIPELINE_MODES)[number];
export const isPipelineMode = (x: unknown): x is PipelineMode => (PIPELINE_MODES as readonly unknown[]).includes(x);
export const modeOf = (article: { pipeline_mode?: string | null }): PipelineMode => (article.pipeline_mode === "team" ? "team" : "classic");

const CLASSIC_KEYS: readonly string[] = STUDIO_AGENT_KEYS;
const TEAM_KEYS: readonly string[] = Object.values(TEAM_AGENT_FILE);

/** Why this agent may not run on an article in this mode, or null when it may. Only article-level agents are checked (Agents 1-3 work on opportunities). */
export function pipelineGuard(mode: PipelineMode, agentKey: string): string | null {
  if (mode === "team" && CLASSIC_KEYS.includes(agentKey)) return `This article runs in team mode: the classic agent ${agentKey} cannot run on it. Use the team roles.`;
  if (mode === "classic" && TEAM_KEYS.includes(agentKey)) return `This article runs in classic mode: the team role ${agentKey} cannot run on it. Switch the article to team mode first (possible only before any section is written, or on a team branch).`;
  return null;
}

export type ModeChange = { ok: true; noop: boolean } | { ok: false; reason: string };
export function modeChangeRule(a: { current: PipelineMode; next: unknown; isBranch: boolean; sectionsWritten: number; hasProposal: boolean }): ModeChange {
  if (!isPipelineMode(a.next)) return { ok: false, reason: `unknown mode "${String(a.next)}"; use classic or team` };
  if (a.next === a.current) return { ok: true, noop: true };
  if (a.hasProposal) return { ok: false, reason: "a proposal already exists for this article; the pipeline cannot change" };
  if (a.sectionsWritten > 0 && !a.isBranch) return { ok: false, reason: `${a.sectionsWritten} section(s) are already written in ${a.current} mode; the mode can change only before any section is written, or on a team-mode branch` };
  return { ok: true, noop: false };
}
