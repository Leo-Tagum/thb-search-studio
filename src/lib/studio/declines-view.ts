/* eslint-disable @typescript-eslint/no-explicit-any -- DB JSON column */
// Leo's list: the declines and open optional items of one unit, whichever pipeline wrote the state (classic keeps them in issues.meta, team in issues.team).
import { declinesForLeo, type Collected, type DeclineRecord } from "./declines";

export function declinesOfRow(row: { issues?: any }): { open: Collected[]; declined: DeclineRecord[] } {
  const e = row?.issues;
  if (e && typeof e === "object" && !Array.isArray(e)) {
    if (e.team) return declinesForLeo(e.team.declines ?? [], e.team.collected ?? []);
    if (e.meta) return declinesForLeo(e.meta.declines ?? [], e.meta.collected ?? []);
  }
  return { open: [], declined: [] };
}
