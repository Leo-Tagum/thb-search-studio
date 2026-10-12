// Who may act on a section as a human. resolveSection, which sends a blocked, escalated or locked section back or holds it, is Leo's action:
// reached only from the Studio UI action and the operator CLI, never by an agent role or the bridge. Agent-like actor ids are refused outright,
// and on a team-mode article only Leo (or the fixture actor the smoke tests use) is accepted.
import { TEAM_AGENT_FILE } from "../team/bridge";
import { STUDIO_AGENT_KEYS } from "./agents";

const ROLE_IDS = new Set(Object.keys(TEAM_AGENT_FILE).map((r) => r.toLowerCase()));
const AGENT_KEYS = new Set<string>([...STUDIO_AGENT_KEYS, ...Object.values(TEAM_AGENT_FILE), "thb-01-seo-strategist", "thb-02-research-evidence", "thb-03-content-architect"]);
const SYSTEM_IDS = new Set(["orchestrator", "agent-bridge", "bridge", "studio", "system", "agent", "router", "code"]);

/** True when the id names an agent role, an agent key, the bridge, the orchestrator or any "agent:" / "system:" actor. */
export function agentLikeActor(id: string): boolean {
  const a = id.trim().toLowerCase();
  return ROLE_IDS.has(a) || AGENT_KEYS.has(a) || SYSTEM_IDS.has(a) || /^(agent|system|bot|role)[:/_-]/.test(a) || /^thb-/.test(a);
}

/** The human operators allowed to resolve sections on a team-mode article. "smoke-test" is the fixture actor of the live smoke scripts (fixture articles only). */
export const TEAM_RESOLVERS: readonly string[] = ["leo", "smoke-test"];

export function resolveActorError(actorId: string, mode: "classic" | "team" | null): string | null {
  if (!actorId.trim()) return "actor required";
  if (agentLikeActor(actorId)) return `${actorId} is an agent or system actor; resolving a section is a human action (Leo)`;
  if (mode === "team" && !TEAM_RESOLVERS.includes(actorId.trim().toLowerCase())) return `on a team-mode article only Leo can resolve a section (not ${actorId})`;
  return null;
}
