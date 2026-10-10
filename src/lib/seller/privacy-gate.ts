// Privacy gate: blocks drafts / evidence packets that carry internal-only seller details.
import { findIssues } from "./identity";

export type InternalPassage = { text: string; reasons: string[] };

export type GateResult =
  | { ok: true }
  | { ok: false; state: "BLOCKED_PRIVACY"; findings: { kind: string; detail: string }[] };

/** Words that make an internal passage identifying when copied (min length keeps short phrases from false-matching). */
function fragments(text: string): string[] {
  const parts = text.split(/[.;:()]|\s[-–—]\s/).map((s) => s.trim()).filter((s) => s.length >= 25);
  return parts;
}

/**
 * `output` = draft text or serialized evidence packet.
 * Blocks if it contains (a) any identity pattern (address, name, amount, exact date, seller quote), or
 * (b) a substantial fragment copied from an internal-only passage.
 */
export function checkOutputPrivacy(output: string, internal: InternalPassage[]): GateResult {
  const findings: { kind: string; detail: string }[] = [];
  for (const i of findIssues(output)) findings.push({ kind: i.kind, detail: i.match });
  const lower = output.toLowerCase();
  for (const p of internal) {
    for (const f of fragments(p.text)) {
      if (lower.includes(f.toLowerCase())) findings.push({ kind: "internal_only_passage", detail: f.slice(0, 40) + "…" });
    }
  }
  return findings.length ? { ok: false, state: "BLOCKED_PRIVACY", findings } : { ok: true };
}

/** Evidence packets for writers may carry publishable passages only. */
export function packetPassages<T extends { visibility: string }>(passages: T[]): T[] {
  return passages.filter((p) => p.visibility === "publishable");
}
