/* eslint-disable @typescript-eslint/no-explicit-any -- DB rows */
// Phase 3c task 12: the Evidence Library as the snapshot store for R1's official pages. A snapshot is an evidence_sources row (URL, retrieved date,
// content_sha256) with its passages in evidence_passages; reading it back rebuilds the snapshot and refuses rows that no longer hash to the stored sha256.
import type { SupabaseClient } from "@supabase/supabase-js";
import { snapshotFromRows, snapshotKey, snapshotToLibraryRows, type Snapshot, type SnapshotStore } from "./snapshots";

const SNAPSHOT_UPLOADER = "system:r1-snapshot";

export function dbSnapshotStore(db: SupabaseClient): SnapshotStore & { idForUrl(url: string): Promise<string | null>; effectiveDate(url: string): Promise<string | null> } {
  const find = async (url: string) => {
    const { data } = await db.from("evidence_sources").select("id,source_url,retrieved_date,content_sha256,effective_date").eq("uploaded_by", SNAPSHOT_UPLOADER);
    return (data ?? []).find((r: any) => r.source_url && snapshotKey(r.source_url) === snapshotKey(url)) ?? null;
  };
  return {
    async get(url) {
      const row = await find(url);
      if (!row) return null;
      const { data: ps } = await db.from("evidence_passages").select("passage,locator").eq("source_id", row.id);
      return snapshotFromRows(row.source_url, row.retrieved_date, row.content_sha256, ps ?? []);
    },
    async put(s: Snapshot) {
      if (await find(s.url)) return;
      let host = s.url;
      try { const u = new URL(s.url); host = `${u.hostname}${u.pathname}`; } catch { /* keep the raw url */ }
      const rows = snapshotToLibraryRows(s, { title: `Official page: ${host}`, tier: 3, jurisdiction: "California" });
      const { data, error } = await db.from("evidence_sources").insert(rows.source).select("id").single();
      if (error) throw error;
      const { error: e2 } = await db.from("evidence_passages").insert(rows.passages.map((p) => ({ ...p, source_id: data.id })));
      if (e2) throw e2;
    },
    async idForUrl(url) { return (await find(url))?.id ?? null; },
    async effectiveDate(url) { return (await find(url))?.effective_date ?? null; },
  };
}
