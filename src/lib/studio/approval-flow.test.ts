/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { confirmApprover, syncApprovals } from "./proposals";
import { sha256 } from "./hash";
import { memDb } from "./memdb.testlib";
import type { RoomRecord } from "./approvals";

// The simple registration flow Leo asked about (2026-10-13), end to end against the real sync code with an in-memory database:
//  1. an approver clicks their REAL decision; 2. sync: the account is pending, the click is stored but never counts; 3. Leo confirms the account;
//  4. sync again: the SAME click is evaluated and counts exactly once (and a third read does not count it again).
const HTML = "<h1>The guide</h1>";
const HASH = sha256(HTML);

function world() {
  const m = memDb({
    articles: [{ id: "a1", state: "HUMAN_REVIEW", prior_state: "DRAFTING", revision_count: 0, version_hash: HASH, approved_hash: null }],
    article_versions: [{ id: "v1", article_id: "a1", body: { html: HTML } }],
    proposals: [{ id: "p1", article_id: "a1", article_version_id: "v1", voice_snapshot: null, requires_secondary: false, status: "OPEN", created_at: "2026-10-13T10:00:00.000Z" }],
    brand_facts: [{ fact_key: "voice_reference", fact_value: "NEEDED", status: "approved" }],
    approver_registry: [], approval_sync_log: [], approvals: [], audit_events: [],
  });
  // the in-memory client has no upsert: a small shim with the same meaning (insert, or update the row matching onConflict; ignoreDuplicates leaves it alone)
  const from = m.db.from.bind(m.db);
  m.db.from = (table: string) => {
    const b = from(table);
    b.upsert = (row: any, o: { onConflict: string; ignoreDuplicates?: boolean }) => {
      const keys = o.onConflict.split(",");
      const hit = (m.t[table] ??= []).find((r: any) => keys.every((k) => r[k] === row[k]));
      if (hit) { if (!o.ignoreDuplicates) Object.assign(hit, row); } else m.t[table].push({ id: `${table}-${m.t[table].length}`, ...row });
      return Promise.resolve({ data: null, error: null });
    };
    return b;
  };
  return m;
}
const click = (over: Partial<RoomRecord> = {}): RoomRecord => ({ recordId: "u_juan/p1__article", proposalId: "p1", itemKind: "article", decision: "approve", claimedHash: HASH, viewerId: "u_juan", displayName: "Juan", serverUpdatedAt: "2026-10-13T12:00:00.000Z", note: "looks right", ...over });
const state = (m: ReturnType<typeof world>) => m.t.articles[0].state;

describe("register by first click: an unconfirmed click never counts, and after confirmation the same click counts exactly once", () => {
  it("step 2: the first sync stores the click as feedback, queues the account, and changes nothing about the article", async () => {
    const m = world();
    const rep = await syncApprovals(m.db, [click()], "2026-10-13T12:05:00.000Z");
    expect(rep.feedback).toBe(1);
    expect(rep.approvals).toBe(0);
    expect(rep.pendingRegistrations).toEqual(["Juan [u_juan]"]);
    expect(m.t.approvals).toHaveLength(0);                                   // nothing can count
    expect(m.t.approval_sync_log[0]).toMatchObject({ classification: "FEEDBACK", accepted: false, viewer_id: "u_juan" });
    expect(m.t.approver_registry[0]).toMatchObject({ viewer_id: "u_juan", status: "PENDING" });
    expect(state(m)).toBe("HUMAN_REVIEW");
    expect(m.t.articles[0].approved_hash).toBeNull();
  });

  it("an unconfirmed (pending) account can be synced as often as you like and still never counts, whatever it clicked", async () => {
    const m = world();
    for (const decision of ["approve", "hold", "request_changes"] as const) await syncApprovals(m.db, [click({ decision })], "2026-10-13T12:05:00.000Z");
    expect(m.t.approvals).toHaveLength(0);
    expect(state(m)).toBe("HUMAN_REVIEW");
  });

  it("steps 3 and 4: after Leo confirms the account, the SAME click is evaluated and signs the article off exactly once", async () => {
    const m = world();
    await syncApprovals(m.db, [click()], "2026-10-13T12:05:00.000Z");
    expect((await confirmApprover(m.db, "u_juan", "approver", "Juan", "leo")).ok).toBe(true);
    const rep = await syncApprovals(m.db, [click()], "2026-10-13T12:10:00.000Z");   // the very same record, read again
    expect(rep.approvals).toBe(1);
    expect(m.t.approvals).toHaveLength(1);
    expect(m.t.approvals[0]).toMatchObject({ item_kind: "article", decision: "approve", version_hash: HASH, approver_identity: "Juan (u_juan)" });
    expect(m.t.approval_sync_log).toHaveLength(1);                           // one log row for the record: the second read updated it in place
    expect(m.t.approval_sync_log[0]).toMatchObject({ classification: "APPROVAL", accepted: true });
    expect(state(m)).toBe("APPROVED_FOR_WP_DRAFT");
    expect(m.t.articles[0].approved_hash).toBe(HASH);
    // a third read of the same record: still exactly one approval row
    await syncApprovals(m.db, [click()], "2026-10-13T12:15:00.000Z");
    expect(m.t.approvals).toHaveLength(1);
  });

  it("the click time that counts is the platform's server time, which must be after the proposal existed (a click from before it cannot approve it)", async () => {
    const m = world();
    await syncApprovals(m.db, [click({ serverUpdatedAt: "2026-10-13T09:00:00.000Z" })], "2026-10-13T12:05:00.000Z");
    await confirmApprover(m.db, "u_juan", "approver", "Juan", "leo");
    const rep = await syncApprovals(m.db, [click({ serverUpdatedAt: "2026-10-13T09:00:00.000Z" })], "2026-10-13T12:10:00.000Z");
    expect(rep.rejected).toBe(1);
    expect(m.t.approvals).toHaveLength(0);
  });

  it("a confirmed approver's HOLD, read after confirmation, is a hold: it counts once and sends the article back, it never approves", async () => {
    const m = world();
    await syncApprovals(m.db, [click({ decision: "hold" })], "2026-10-13T12:05:00.000Z");
    await confirmApprover(m.db, "u_juan", "approver", "Juan", "leo");
    await syncApprovals(m.db, [click({ decision: "hold" })], "2026-10-13T12:10:00.000Z");
    await syncApprovals(m.db, [click({ decision: "hold" })], "2026-10-13T12:15:00.000Z");
    expect(m.t.approvals).toHaveLength(1);
    expect(m.t.approvals[0].decision).toBe("hold");
    expect(state(m)).toBe("DRAFTING");                                       // sent back (REVISION_REQUIRED then DRAFTING), never approved
    expect(m.t.articles[0].approved_hash).toBeNull();
  });

  it("if the article changes after the click but before confirmation, the click no longer counts", async () => {
    const m = world();
    await syncApprovals(m.db, [click()], "2026-10-13T12:05:00.000Z");
    await confirmApprover(m.db, "u_juan", "approver", "Juan", "leo");
    m.t.articles[0].version_hash = "someotherhash";                         // an edit after the proposal
    const rep = await syncApprovals(m.db, [click()], "2026-10-13T12:10:00.000Z");
    expect(rep.rejected).toBe(1);
    expect(m.t.approvals).toHaveLength(0);
  });

  it("Leo's own account is never an approver: it cannot be confirmed as one", async () => {
    const m = world();
    await syncApprovals(m.db, [click({ viewerId: "u_leo", displayName: "Leo", recordId: "u_leo/p1__article" })], "2026-10-13T12:05:00.000Z");
    const r = await confirmApprover(m.db, "u_leo", "approver", "Leo", "leo");
    expect(r.ok).toBe(false);
  });
});
