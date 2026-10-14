// The version of docs/references/standing-rules.md that every agent prompt in .claude/agents/ must reference (Leo's standing rules; only Leo changes them).
// A change bumps three things together: the version line in that file, this constant, and the `standing_rules_version:` line of every agent prompt.
// standing-rules.test.ts fails until they agree, and until every agent prompt's version matches the constant the code uses for it.
export const STANDING_RULES_VERSION = "1.3.1";
export const STANDING_RULES_FILE = "docs/references/standing-rules.md";
