import { createHash } from "node:crypto";

/** Canonical JSON: object keys sorted at every level, so a hash does not depend on key order. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const contentHash = (v: unknown) => sha256(stableStringify(v));
