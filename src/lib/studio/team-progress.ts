// Read-only progress of a team branch against its seeded (baseline) findings. Pure; scripts/team-progress.mts feeds it from the database.
//   fixed = a seeded key no longer in the unit's collected list (its reviewer did not report it again on the newest version)
//   declined = still listed but declined by W1 with a reason; still present = a seeded key still reported (same reviewer and key)
// "fixed" is a key-matching proxy: a reviewer that rewords an item counts as fixed plus a new item. The final comparison matches by text as well.
export type Seeded = { unit: string; role: string; key: string };
export type SectionLike = { section_key: string; status: string; issues?: { team?: { collected?: { role: string; key: string; declined?: string | null }[] } } | null };
export type UnitProgress = { unit: string; status: string; seeded: number; fixed: number; declined: number; stillPresent: number; newOpen: number };

export function progressOf(seeded: Seeded[], sections: SectionLike[]): { units: UnitProgress[]; fixed: number; declined: number; stillPresent: number; seeded: number } {
  const units = sections.map((s) => {
    const mine = seeded.filter((x) => x.unit === s.section_key);
    const col = s.issues?.team?.collected ?? [];
    const has = (x: Seeded) => col.find((c) => c.role === x.role && c.key === x.key);
    const fixed = mine.filter((x) => !has(x)).length;
    const declined = mine.filter((x) => !!has(x)?.declined).length;
    return { unit: s.section_key, status: s.status, seeded: mine.length, fixed, declined, stillPresent: mine.length - fixed - declined, newOpen: col.filter((c) => !mine.some((x) => x.role === c.role && x.key === c.key)).length };
  });
  const sum = (f: (u: UnitProgress) => number) => units.reduce((n, u) => n + f(u), 0);
  return { units, fixed: sum((u) => u.fixed), declined: sum((u) => u.declined), stillPresent: sum((u) => u.stillPresent), seeded: seeded.length };
}
