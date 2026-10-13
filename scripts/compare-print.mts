/* eslint-disable @typescript-eslint/no-explicit-any */
// Compares a FRESH official print with the print stored in the Evidence Library (for example the 2026-10-10 prints), and checks that every claim quote
// that rests on the stored print is still word for word in the fresh one. Read-only: it writes nothing to the database.
//   npm run compare-print -- <stored_source_id> <fresh_source_id | path-to-fresh.pdf> [article_id]
// - <stored_source_id>: the Evidence Library source of the old print (id, or its first 8 characters).
// - fresh: the id of a source Leo uploaded as a NEW record (the old record is never replaced, so the history stays), or a local PDF path.
// - article_id: the article whose claims are checked (default: the hoarder branch 54070caa…).
// Text is extracted with pdftotext; only whitespace, the page furniture of a print (title page banner, "Page n of m", print dates) and case are ignored. A single changed
// word, number or subsection letter is reported.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const [oldRef, newRef, articleArg] = process.argv.slice(2);
if (!oldRef || !newRef) throw new Error("usage: compare-print.mts <stored_source_id> <fresh_source_id | fresh.pdf> [article_id]");
const ARTICLE = articleArg ?? "54070caa-bd79-4184-a82a-9235b1c33b64";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const dir = mkdtempSync(join(tmpdir(), "thb-compare-"));

async function source(ref: string) {
  const { data } = await db.from("evidence_sources").select("id,title,storage_path,retrieved_date,effective_date,recheck_by,jurisdiction,source_url");
  const hit = (data ?? []).filter((s: any) => s.id === ref || s.id.startsWith(ref));
  if (hit.length !== 1) throw new Error(`"${ref}" matched ${hit.length} sources`);
  return hit[0] as any;
}
async function textOf(label: string, ref: string): Promise<{ text: string; what: string }> {
  let file = ref; let what = ref;
  if (!existsSync(ref)) {
    const s = await source(ref);
    const dl = await db.storage.from("evidence").download(s.storage_path);
    if (dl.error) throw dl.error;
    file = join(dir, `${label}.pdf`);
    writeFileSync(file, Buffer.from(await dl.data.arrayBuffer()));
    what = `${s.title} (retrieved ${s.retrieved_date ?? "?"}, effective ${s.effective_date ?? "?"}, recheck by ${s.recheck_by ?? "none"}, ${s.jurisdiction ?? "no jurisdiction"})`;
  }
  const text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024, cwd: dir });
  return { text, what };
}
const FURNITURE = /^\s*(state of california|authenticated|electronic legal material|page \d+( of \d+)?|printed\b.*|https?:\/\/\S+|\d{1,2}\/\d{1,2}\/\d{2,4},? .*)\s*$/i;
const clean = (t: string) => t.split(/\r?\n/).filter((l) => !FURNITURE.test(l)).join(" ").replace(/\f/g, " ").replace(/\s+/g, " ").trim();
const norm = (t: string) => clean(t).toLowerCase();
const pieces = (t: string) => clean(t).split(/(?<=[.;:])\s+(?=\(?[A-Za-z0-9])/).map((x) => x.trim()).filter(Boolean);

try {
  const oldS = await source(oldRef);
  const [o, n] = await Promise.all([textOf("old", oldRef), textOf("new", newRef)]);
  console.log(`stored print: ${o.what}\nfresh print : ${n.what}`);
  const a = norm(o.text), b = norm(n.text);
  console.log(`\ntext (whitespace, page furniture and case ignored): stored ${a.length} chars, fresh ${b.length} chars`);
  if (a === b) console.log("RESULT: IDENTICAL. The fresh print says exactly what the stored print says.");
  else {
    const pa = pieces(o.text), pb = pieces(n.text);
    const sa = new Set(pa.map((x) => x.toLowerCase())), sb = new Set(pb.map((x) => x.toLowerCase()));
    const gone = pa.filter((x) => !sb.has(x.toLowerCase())), added = pb.filter((x) => !sa.has(x.toLowerCase()));
    console.log(`RESULT: DIFFERENT. ${gone.length} piece(s) only in the stored print, ${added.length} only in the fresh print.`);
    for (const x of gone.slice(0, 25)) console.log(`  - STORED ONLY: ${x.slice(0, 260)}`);
    for (const x of added.slice(0, 25)) console.log(`  + FRESH ONLY : ${x.slice(0, 260)}`);
    if (gone.length > 25 || added.length > 25) console.log("  (list cut at 25 each)");
  }
  const { data: claims } = await db.from("claims").select("claim_key,section_cite,quote_full,verification_label").eq("article_id", ARTICLE).eq("source_id", oldS.id).order("claim_key");
  console.log(`\nclaims resting on the stored print (${(claims ?? []).length}); is each exact quote still word for word in the fresh print?`);
  let bad = 0;
  for (const c of claims ?? []) {
    const ok = !!c.quote_full && b.includes(norm(c.quote_full));
    if (!ok) bad++;
    console.log(`  ${c.claim_key.padEnd(6)} ${String(c.section_cite ?? "").padEnd(34)} ${c.verification_label ?? "no label"}  ${!c.quote_full ? "NO STORED QUOTE" : ok ? "quote still verbatim" : "QUOTE NOT FOUND in the fresh print: re-verify this claim"}`);
  }
  console.log(`\nverdict: ${a === b && !bad ? "SAFE: no change in the print, every quote still matches." : bad ? "NOT SAFE: at least one quote no longer matches; stop and ask Leo." : "REVIEW: the text differs but every quote still matches; read the differences above."}`);
} finally { rmSync(dir, { recursive: true, force: true }); }
