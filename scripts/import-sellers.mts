// Imports seller-library-fixed.md (read in place; not copied into the repo) into the database.
// Usage: tsx --env-file=.env.local scripts/import-sellers.mts [--dry]   Prints counts only, never seller text.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseLibrary } from "../src/lib/seller/parse";

const SRC = resolve(process.cwd(), "..", "seller-library-fixed.md");
const PENDING = new Set(["C-01", "C-02", "C-04", "C-05", "C-12", "C-17", "C-23", "C-41"]);
const dry = process.argv.includes("--dry");
const briefs = parseLibrary(readFileSync(SRC, "utf8"));

const reasons: Record<string, number> = {};
let pub = 0, internal = 0;
for (const b of briefs) for (const p of b.passages) {
  if (p.visibility === "publishable") pub++; else internal++;
  for (const r of p.internalReasons) reasons[r] = (reasons[r] ?? 0) + 1;
}
const flagged = briefs.flatMap((b) => b.rejected.map((r) => `${b.caseId}/${r.section}/${r.issue.kind}`));
console.log(JSON.stringify({ briefs: briefs.length, passages: pub + internal, publishable: pub, internalOnly: internal, internalReasons: reasons, rejectedForLeo: flagged }));
if (dry) process.exit(0);
if (flagged.length) { console.error("STOP: names/addresses found; nothing imported. Leo must review the flagged passages."); process.exit(1); }

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
for (const b of briefs) {
  const { data, error } = await db.from("seller_briefs").upsert({
    case_id: b.caseId, title: b.title, use_level: b.useLevel,
    review_status: PENDING.has(b.caseId) ? "pending_review" : "cleared",
    review_note: PENDING.has(b.caseId) ? "Juan's open review flag; unresolved" : null,
    permission_text: b.permissionText, source_file: "seller-library-fixed.md",
  }, { onConflict: "case_id" }).select("id").single();
  if (error) throw error;
  await db.from("seller_brief_passages").delete().eq("brief_id", data.id);
  const { error: e2 } = await db.from("seller_brief_passages").insert(b.passages.map((p) => ({
    brief_id: data.id, section: p.section, position: p.position, text: p.text, visibility: p.visibility,
    internal_reasons: p.internalReasons, not_for_publication: p.notForPublication,
  })));
  if (e2) throw e2;
  // publication is NOT cleared for any brief until someone documents it
  const { count } = await db.from("seller_permissions").select("id", { count: "exact", head: true }).eq("brief_id", data.id);
  if (!count) await db.from("seller_permissions").insert({ brief_id: data.id, publication_cleared: false, note: "Imported; no publication clearance documented" });
}
console.log("imported", briefs.length);
