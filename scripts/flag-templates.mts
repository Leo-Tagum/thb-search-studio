// Sets template_flag='city' on pages whose slug matches city patterns. Only touches rows still 'unknown'.
import { createClient } from "@supabase/supabase-js";
import { templateFlagFor } from "../src/lib/ingest/template-flag";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data, error } = await db.from("pages").select("id,slug,wp_type,template_flag");
if (error) throw error;
const ids = data.filter((p) => p.template_flag === "unknown" && templateFlagFor(p.slug, p.wp_type) === "city").map((p) => p.id);
if (ids.length) {
  const { error: e2 } = await db.from("pages").update({ template_flag: "city" }).in("id", ids);
  if (e2) throw e2;
}
await db.from("audit_events").insert({ actor: "ingest", subject_type: "pages", subject_id: "bulk", event_type: "template_flag_inferred", accepted: true, detail: { flagged: ids.length, basis: "slug pattern", confirmed: false } });
console.log(JSON.stringify({ flaggedCity: ids.length, pagesTotal: data.length }));
