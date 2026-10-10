// Phase 3 Task 3: build the voice reference from the three stored post bodies (no site requests) and store it as the
// voice_reference brand fact with status 'proposed'. Provisional approval is a separate human act (npm run studio -- voice-approve).
import { createClient } from "@supabase/supabase-js";
import { buildVoiceReference, VOICE_SOURCES, type VoiceSourceKey } from "../src/lib/studio/voice";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const bodies = {} as Record<VoiceSourceKey, string>;
for (const [key, src] of Object.entries(VOICE_SOURCES) as [VoiceSourceKey, (typeof VOICE_SOURCES)[VoiceSourceKey]][]) {
  const { data: pg } = await db.from("pages").select("id").eq("canonical_url", src.url).single();
  const { data: snap } = await db.from("page_snapshots").select("body_text").eq("page_id", pg!.id).not("body_text", "is", null).order("fetched_at", { ascending: false }).limit(1).single();
  bodies[key] = snap!.body_text as string;
}
const { ref, rejected } = buildVoiceReference(bodies, new Date().toISOString().slice(0, 10));
console.log(`excerpts kept: ${ref.excerpts.length}; rejected: ${rejected.length}`);
for (const r of rejected) console.log("REJECTED:", r.text.slice(0, 80), "->", r.problems.join("; "));
for (const e of ref.excerpts) console.log(`[${e.id}] (${e.use}) ${e.text}`);
if (ref.excerpts.length < 12) throw new Error("too few clean excerpts; not storing");

const { data: cur } = await db.from("brand_facts").select("id,status,provisional_by").eq("fact_key", "voice_reference").single();
if (cur?.status === "approved") throw new Error("voice_reference is already approved; refusing to overwrite");
const { error } = await db.from("brand_facts").update({
  fact_value: JSON.stringify(ref), status: "proposed", source_ref: "Phase 3 Task 3: excerpts from 3 stored posts (style only; no facts count)",
  usage_rule: "Style only. Provisionally approved by Leo (when done); Juan confirms in the Approval Room with the first article.", provisional_by: null, provisional_at: null,
}).eq("fact_key", "voice_reference");
if (error) throw error;
await db.from("audit_events").insert({ actor: "system:studio", subject_type: "brand_fact", subject_id: "voice_reference", event_type: "voice_reference_built", accepted: true, version_hash: ref.content_hash, detail: { kept: ref.excerpts.length, rejected: rejected.length } });
console.log("stored voice_reference (proposed). hash", ref.content_hash);
