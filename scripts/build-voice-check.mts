// Builds the one-time Voice Check page (for Juan only) from the fixed template and a payload. Local file only: nothing is published or shared by this script.
//   npx tsx --env-file=.env.local scripts/build-voice-check.mts <out.html> [payload.json]
// Without a payload file it reads the voice reference from the database (read-only) and builds the payload with voicePagePayload.
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { voicePagePayload } from "../src/lib/studio/voice-approval";

const [out, file] = process.argv.slice(2);
if (!out) throw new Error("usage: build-voice-check.mts <out.html> [payload.json]");
let payload: unknown;
if (file) payload = JSON.parse(readFileSync(file, "utf8"));
else {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data } = await db.from("brand_facts").select("fact_value,status").eq("fact_key", "voice_reference").single();
  if (!data) throw new Error("no voice reference stored");
  if (data.status === "approved") console.log("note: the voice reference is already approved; the page would only repeat the question");
  payload = voicePagePayload(data.fact_value);
  if (!payload) throw new Error("the stored voice reference has no excerpts");
}
// Keep the JSON safe inside a <script> element: no "</script>", no HTML comment starts, no line separators.
const safe = JSON.stringify(payload).replace(/</g, "\\u003c").split(String.fromCharCode(0x2028)).join("\\u2028").split(String.fromCharCode(0x2029)).join("\\u2029");
const html = readFileSync("src/voice-check/template.html", "utf8").replace("__PAYLOAD__", () => safe);
writeFileSync(out, html);
console.log(`wrote ${out} (${html.length} bytes)`);
