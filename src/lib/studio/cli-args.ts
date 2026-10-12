// Argument parsing for operator CLI commands that are easy to get wrong by position (tested).
/** argv is process.argv.slice(2): ["team-queue", role, article, unit?, ticket?]. A unit of "-" means no unit. */
export function parseTeamQueueArgs(argv: string[]): { role: string; article: string; unit: string | null; ticket: string | null } {
  const [, role, article, unit, ticket] = argv;
  return { role, article, unit: unit && unit !== "-" ? unit : null, ticket: ticket ?? null };
}
