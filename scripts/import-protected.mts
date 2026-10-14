// Import the WP Ads Protection list: marks matched pages "protected" (reason "WP Ads Protection list, 2026-10-14", actor leo, audited).
// DRY RUN by default: reads the database, writes nothing. Real run only with --apply.
// It never sets not_protected, never adds a page row (retired pages stay unmatched), and never touches a page already marked.
//   npx tsx --env-file=.env.local scripts/import-protected.mts [--csv docs/references/protected-pages-2026-10-14.csv] [--apply]
//   npx tsx --env-file=.env.local scripts/import-protected.mts --label-pairs docs/phases/overlap-pairs-2026-10-07.csv --out <new.csv>
//     (read-only: writes a new CSV with protected labels; pairs with a retired protected URL are "stale (redirected)" and leave the supported count. Refuses to overwrite.)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { applyProtectedImport, labelPairsCsv, parseProtectedList, pathOf, planProtectedImport, PROTECTED_ACTOR, PROTECTED_REASON, type KnownPage } from "../src/lib/protected-import";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined; };
const apply = process.argv.includes("--apply");
const csvPath = arg("csv") ?? "docs/references/protected-pages-2026-10-14.csv";
const list = parseProtectedList(readFileSync(csvPath, "utf8"));

const pairsIn = arg("label-pairs");
if (pairsIn) {
  const out = arg("out"); if (!out) throw new Error("--label-pairs needs --out <new file>");
  if (existsSync(out)) throw new Error(`${out} already exists; not overwriting`);
  const { csv, summary } = labelPairsCsv(readFileSync(pairsIn, "utf8"), list);
  writeFileSync(out, csv, { flag: "wx" });
  console.log(`Wrote ${out}. Pairs ${summary.pairs}; supported before ${summary.supportedBefore}, after removing stale ${summary.supportedAfter}; stale (redirected) ${summary.stale}; other protected ${summary.protectedLive}; both sides protected ${summary.bothProtected}.`);
  process.exit(0);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const pages: KnownPage[] = [];
for (let f = 0; ; f += 1000) {
  const { data, error } = await db.from("pages").select("id,wp_id,url,protection_status").order("id").range(f, f + 999);
  if (error) throw error;
  pages.push(...(data as KnownPage[]));
  if (data.length < 1000) break;
}
const plan = planProtectedImport(list, pages);
console.log(`${apply ? "REAL RUN" : "DRY RUN (nothing written)"}: ${list.length} list rows, ${pages.length} pages. Reason "${PROTECTED_REASON}", actor ${PROTECTED_ACTOR}. Never sets not_protected.`);
console.log(`Would mark protected: ${plan.toMark.length}. Already protected: ${plan.alreadyProtected.length}. On the list but not_protected in the database (left as is): ${plan.conflicts.length}.`);
for (const m of plan.toMark) console.log(`  ${pathOf(m.page.url)} (${m.page.protection_status} -> protected, matched by ${m.how})`);
for (const m of plan.conflicts) console.log(`  CONFLICT, not changed: ${pathOf(m.page.url)}`);
console.log(`No page row, retired (no row added): ${plan.retiredUnmatched.length}. No page row, other: ${plan.otherUnmatched.length}.`);
for (const r of plan.otherUnmatched) console.log(`  unmatched: ${r.url || "(blank url)"} wp_id ${r.wpId} ${r.state}`);

if (apply) {
  const done = await applyProtectedImport(plan, {
    getStatus: async (id) => (await db.from("pages").select("protection_status").eq("id", id).single()).data!.protection_status,
    setStatus: async (id, s, r, actor) => {
      const { error } = await db.from("pages").update({ protection_status: s, protection_reason: r, protection_marked_by: actor, protection_marked_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    appendAudit: async (e) => { const { error } = await db.from("audit_events").insert(e); if (error) throw error; },
  });
  console.log(`Marked ${done.length} pages protected.`);
}
