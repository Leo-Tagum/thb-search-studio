import { describe, expect, it } from "vitest";
import { markProtection, updateWarning, type ProtectionDb, type Protection } from "./protection";
import type { AuditEvent } from "./orchestrator";

describe("protection", () => {
  it("marking writes an audit event with the reason and prior status", async () => {
    let status: Protection = "unknown";
    const audit: AuditEvent[] = [];
    const db: ProtectionDb = {
      getStatus: async () => status,
      setStatus: async (_id, s) => { status = s; },
      appendAudit: async (e) => { audit.push(e); },
    };
    await markProtection(db, "p1", "protected", "Used by Google Ads", "leo");
    expect(status).toBe("protected");
    expect(audit[0]).toMatchObject({ event_type: "protection_marked", prior_state: "unknown", new_state: "protected", detail: { reason: "Used by Google Ads" } });
  });
  it("refuses a blank reason", async () => {
    const db = { getStatus: async () => "unknown", setStatus: async () => {}, appendAudit: async () => {} } as ProtectionDb;
    await expect(markProtection(db, "p1", "protected", "  ", "leo")).rejects.toThrow();
  });
  it("unknown status warns and requires acknowledgement", () => {
    expect(updateWarning("unknown")).toMatchObject({ allowed: true, requiresAcknowledgement: true });
    expect(updateWarning("not_protected").warning).toBeNull();
    expect(updateWarning("protected").allowed).toBe(false);
  });
});
