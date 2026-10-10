// Task 6 check: dummy upload with provenance lands in the private bucket; no public access; then cleans up.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const path = `check-${Date.now()}-dummy.txt`;
const up = await db.storage.from("evidence").upload(path, Buffer.from("DUMMY evidence file, not real content"), { contentType: "text/plain" });
if (up.error) throw up.error;
const ins = await db.from("evidence_sources").insert({
  title: "DUMMY check upload", storage_path: path, source_tier: 4, uploaded_by: "leo", provenance_note: "Dummy file created by the Phase 1 check script",
}).select("id").single();
if (ins.error) throw ins.error;
const listed = await db.from("evidence_sources").select("title,source_tier,provenance_note,uploaded_by").eq("id", ins.data.id).single();
const pub = await fetch(`${url}/storage/v1/object/public/evidence/${path}`);
const bucket = (await db.storage.getBucket("evidence")).data;
console.log(JSON.stringify({ listed: listed.data, bucketPublic: bucket?.public, publicUrlStatus: pub.status }));
await db.storage.from("evidence").remove([path]);
await db.from("evidence_sources").delete().eq("id", ins.data.id);
if (bucket?.public || pub.ok) { console.error("FAIL"); process.exit(1); }
console.log("PASS");
