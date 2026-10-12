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

/** The only human operator of a real article. */
export const OPERATOR = "leo";
/** The fixture actor of the live smoke scripts. Accepted only on an article flagged is_fixture (a throwaway article the smoke script created), never on a real one. */
export const FIXTURE_ACTOR = "smoke-test";

/**
 * Why this actor may not resolve a section or switch the pipeline of this article, or null when it may.
 * A real article accepts only "leo". A fixture article (is_fixture) also accepts "smoke-test". Agent-like actors are refused everywhere.
 */
export function resolveActorError(actorId: string, article: { is_fixture?: boolean | null } | null): string | null {
  const a = actorId.trim().toLowerCase();
  if (!a) return "actor required";
  if (agentLikeActor(actorId)) return `${actorId} is an agent or system actor; this is a human action (Leo)`;
  if (a === OPERATOR) return null;
  if (a === FIXTURE_ACTOR) return article?.is_fixture === true ? null : `${actorId} is accepted only on fixture articles created by the smoke scripts; a real article accepts only ${OPERATOR}`;
  return `only ${OPERATOR} can do this on an article (not ${actorId})`;
}
