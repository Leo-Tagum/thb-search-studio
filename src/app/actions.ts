"use server";
import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-server";
import { markProtection, type Protection } from "@/lib/protection";

const ACTOR = "leo"; // local single-operator app; no login yet (see Phase 1 handoff)

export async function markProtectionAction(formData: FormData) {
  const db = supabaseAdmin();
  const pageId = String(formData.get("pageId"));
  const status = String(formData.get("status")) as Protection;
  const reason = String(formData.get("reason") ?? "");
  if (!["unknown", "protected", "not_protected"].includes(status)) throw new Error("bad status");
  await markProtection({
    getStatus: async (id) => (await db.from("pages").select("protection_status").eq("id", id).single()).data!.protection_status as Protection,
    setStatus: async (id, s, r, actor) => {
      const { error } = await db.from("pages").update({ protection_status: s, protection_reason: r, protection_marked_by: actor, protection_marked_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    appendAudit: async (e) => { const { error } = await db.from("audit_events").insert(e); if (error) throw error; },
  }, pageId, status, reason, ACTOR);
  revalidatePath("/inventory");
}

const MAX_BYTES = 25 * 1024 * 1024;

export async function uploadEvidenceAction(formData: FormData) {
  const db = supabaseAdmin();
  const file = formData.get("file") as File | null;
  const title = String(formData.get("title") ?? "").trim();
  const provenance = String(formData.get("provenance") ?? "").trim();
  const tier = Number(formData.get("tier"));
  if (!file || !file.size) throw new Error("A file is required");
  if (file.size > MAX_BYTES) throw new Error("File too large (25 MB max)");
  if (!title || !provenance) throw new Error("Title and provenance note are required");
  if (!(tier >= 1 && tier <= 6)) throw new Error("Source tier must be 1-6");
  const buf = Buffer.from(await file.arrayBuffer());
  const path = `${randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const up = await db.storage.from("evidence").upload(path, buf, { contentType: file.type || "application/octet-stream" });
  if (up.error) throw up.error;
  const orNull = (k: string) => (String(formData.get(k) ?? "").trim() || null);
  const { error } = await db.from("evidence_sources").insert({
    title, storage_path: path, source_tier: tier, source_url: orNull("sourceUrl"), jurisdiction: orNull("jurisdiction"),
    effective_date: orNull("effectiveDate"), retrieved_date: orNull("retrievedDate"), recheck_by: orNull("recheckBy"), uploaded_by: ACTOR,
    provenance_note: provenance, content_sha256: createHash("sha256").update(buf).digest("hex"),
  });
  if (error) throw error;
  await db.from("audit_events").insert({ actor: ACTOR, subject_type: "evidence_source", subject_id: path, event_type: "evidence_uploaded", accepted: true, detail: { tier, bytes: file.size } });
  revalidatePath("/evidence");
}
