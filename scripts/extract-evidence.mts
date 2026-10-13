// Extracts text passages from PDFs in the private "evidence" bucket into evidence_passages (so agents can cite them).
// Usage: npm run evidence:extract            (all PDF sources with no passages yet)
//        npm run evidence:extract -- --rename <source_id> "<new title>"   (title change, written to the audit log)
//        npm run evidence:extract -- --recheck <source_id> <yyyy-mm-dd>    (sets the recheck-by date, written to the audit log)
// Files are untrusted: they are downloaded to a fresh temp directory and only passed to pdftotext as an argument.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

if (process.argv[2] === "--recheck") {
  // Sets the "recheck by" date of one source (Agents 2 and R1 refuse a legal claim whose source has none, or one that has passed). Audited.
  const [id, date] = [process.argv[3], process.argv[4]];
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error("usage: npm run evidence:extract -- --recheck <source_id> <yyyy-mm-dd>");
  const { data: before } = await db.from("evidence_sources").select("title,recheck_by").eq("id", id).single();
  if (!before) throw new Error("source not found");
  const { error } = await db.from("evidence_sources").update({ recheck_by: date }).eq("id", id);
  if (error) throw error;
  await db.from("audit_events").insert({ actor: "leo", subject_type: "evidence_source", subject_id: id, event_type: "evidence_recheck_by_set", accepted: true, detail: { title: before.title, old: before.recheck_by, new: date } });
  console.log(`"${before.title}": recheck by ${before.recheck_by ?? "(none)"} -> ${date} (audited)`);
  process.exit(0);
}

if (process.argv[2] === "--rename") {
  const [id, title] = [process.argv[3], process.argv[4]];
  const { data: before } = await db.from("evidence_sources").select("title").eq("id", id).single();
  if (!before) throw new Error("source not found");
  const { error } = await db.from("evidence_sources").update({ title }).eq("id", id);
  if (error) throw error;
  await db.from("audit_events").insert({ actor: "leo", subject_type: "evidence_source", subject_id: id, event_type: "evidence_title_changed", accepted: true, detail: { old_title: before.title, new_title: title, applied_by: "claude (on Leo's instruction)" } });
  console.log(`renamed "${before.title}" -> "${title}" (audited)`);
  process.exit(0);
}

const { data: sources } = await db.from("evidence_sources").select("id,title,storage_path");
for (const s of sources ?? []) {
  if (!s.storage_path?.toLowerCase().endsWith(".pdf")) continue;
  const { count } = await db.from("evidence_passages").select("id", { count: "exact", head: true }).eq("source_id", s.id);
  if (count) { console.log("skip (has passages):", s.title); continue; }
  const dl = await db.storage.from("evidence").download(s.storage_path);
  if (dl.error) throw dl.error;
  const dir = mkdtempSync(join(tmpdir(), "thb-evidence-"));
  try {
    const file = join(dir, "in.pdf");
    writeFileSync(file, Buffer.from(await dl.data.arrayBuffer()));
    const text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, cwd: dir });
    const rows: { source_id: string; passage: string; locator: string }[] = [];
    text.split("\f").forEach((page, pi) => {
      const clean = page.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      if (!clean) return;
      // chunk each page at paragraph boundaries, <= 1800 chars
      let buf = ""; let n = 0;
      const flush = () => { if (buf.trim()) rows.push({ source_id: s.id, passage: buf.trim(), locator: `page ${pi + 1}, part ${++n}` }); buf = ""; };
      for (const para of clean.split(/\n\s*\n/)) { if ((buf + para).length > 1800) flush(); buf += (buf ? "\n\n" : "") + para; }
      flush();
    });
    if (!rows.length) { console.log("NO TEXT extracted (scanned image PDF?):", s.title); continue; }
    const { error } = await db.from("evidence_passages").insert(rows);
    if (error) throw error;
    await db.from("audit_events").insert({ actor: "system:evidence-extract", subject_type: "evidence_source", subject_id: s.id, event_type: "evidence_text_extracted", accepted: true, detail: { passages: rows.length, chars: text.length } });
    console.log(`extracted ${rows.length} passages (${text.length} chars) from "${s.title}"`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
void readFileSync;
