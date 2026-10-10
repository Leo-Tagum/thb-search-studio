// Manual protection marking (audited) and the UPDATE warning for unknown status (design §7).
import type { AuditEvent } from "./orchestrator";

export type Protection = "unknown" | "protected" | "not_protected";

export type ProtectionDb = {
  getStatus(pageId: string): Promise<Protection>;
  setStatus(pageId: string, status: Protection, reason: string, actor: string): Promise<void>;
  appendAudit(e: AuditEvent): Promise<void>;
};

export async function markProtection(db: ProtectionDb, pageId: string, status: Protection, reason: string, actor: string) {
  if (!reason.trim()) throw new Error("A reason is required to mark protection status");
  const prior = await db.getStatus(pageId);
  await db.setStatus(pageId, status, reason.trim(), actor);
  await db.appendAudit({
    actor, subject_type: "page", subject_id: pageId, event_type: "protection_marked",
    prior_state: prior, new_state: status, version_hash: null, accepted: true, detail: { reason: reason.trim() },
  });
}

export type UpdateCheck =
  | { allowed: true; warning: null }
  | { allowed: true; warning: string; requiresAcknowledgement: true }
  | { allowed: false; warning: string };

/** UPDATE on an unknown page shows a warning needing acknowledgement; a protected page is not a normal target. */
export function updateWarning(status: Protection): UpdateCheck {
  if (status === "protected") return { allowed: false, warning: "Protected page: route to a Developer Change Request, not a normal UPDATE." };
  if (status === "unknown") return { allowed: true, requiresAcknowledgement: true, warning: "Protection status is UNKNOWN (protected-URL list not imported). Acknowledge explicitly before proposing an UPDATE." };
  return { allowed: true, warning: null };
}
