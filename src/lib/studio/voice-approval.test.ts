/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyVoiceRecord, syncVoiceApproval, voiceItemId, voicePagePayload } from "./voice-approval";
import { voiceHash } from "./proposals";
import { memDb } from "./memdb.testlib";
import type { Registry, RoomRecord } from "./approvals";

// The voice reference is Juan's to confirm, once, on a separate page (Leo, 2026-10-14). FAKE reference text.
const REF = JSON.stringify({ excerpts: [{ use: "primary", text: "Age alone isn't the problem." }, { use: "warmth", text: "A house full of belongings is not always a junk problem." }, { use: "avoid", text: "usually" }, { use: "primary", text: "Most owners usually wait too long." }] });
const HASH = voiceHash(REF)!;
const rec = (over: Partial<RoomRecord> = {}): RoomRecord => ({ recordId: "u_juan/v", proposalId: voiceItemId(HASH), itemKind: "voice_reference", decision: "approve", claimedHash: HASH, viewerId: "u_juan", displayName: "Juan", serverUpdatedAt: "2026-10-14T10:00:00Z", ...over });
const reg = (over: Record<string, any> = {}): Registry => new Map([["u_juan", { role: "approver", status: "CONFIRMED", label: "Juan", ...over }]]);

describe("who can confirm the voice reference", () => {
  it("only a confirmed account labelled Juan counts; Cherry, the operator and unknown accounts are feedback", () => {
    expect(classifyVoiceRecord(rec(), HASH, reg(), "x")).toMatchObject({ classification: "APPROVAL", accepted: true });
    expect(classifyVoiceRecord(rec(), HASH, reg({ label: "Cherry" }), "x")).toMatchObject({ classification: "FEEDBACK", accepted: false });
    expect(classifyVoiceRecord(rec(), HASH, reg({ role: "operator", label: "Leo" }), "x")).toMatchObject({ classification: "FEEDBACK" });
    expect(classifyVoiceRecord(rec(), HASH, reg({ status: "PENDING" }), "x")).toMatchObject({ classification: "FEEDBACK" });
    expect(classifyVoiceRecord(rec(), HASH, new Map(), "x")).toMatchObject({ classification: "FEEDBACK", registerPending: true });
    expect(classifyVoiceRecord(rec(), HASH, reg({ label: "Juan Diaz" }), "x").classification).toBe("APPROVAL");
  });
  it("the decision must be for the CURRENT voice reference: another hash or an old item id is rejected", () => {
    expect(classifyVoiceRecord(rec({ claimedHash: "f".repeat(64) }), HASH, reg(), "x").classification).toBe("REJECTED");
    expect(classifyVoiceRecord(rec({ proposalId: voiceItemId("a".repeat(64)) }), HASH, reg(), "x").classification).toBe("REJECTED");
    expect(classifyVoiceRecord(rec(), null, reg(), "x").classification).toBe("REJECTED");
    expect(classifyVoiceRecord(rec({ itemKind: "article" as any }), HASH, reg(), "x").classification).toBe("REJECTED");
  });
  it("a hold or a request for changes is recorded as changes requested, never as an approval", () => {
    expect(classifyVoiceRecord(rec({ decision: "request_changes" }), HASH, reg(), "x")).toMatchObject({ classification: "CHANGES_REQUESTED", accepted: true });
    expect(classifyVoiceRecord(rec({ decision: "hold" }), HASH, reg(), "x").classification).toBe("CHANGES_REQUESTED");
  });
  it("uses the platform's time, not the browser's", () => {
    expect(classifyVoiceRecord(rec({ serverUpdatedAt: null, browserDecidedAt: "2001-01-01T00:00:00Z" }), HASH, reg(), "2026-10-14T11:00:00Z").countedTime).toBe("2026-10-14T11:00:00Z");
  });
});

function world(status = "provisional") {
  const m = memDb({ brand_facts: [{ fact_key: "voice_reference", fact_value: REF, status, provisional_by: "leo", provisional_at: "2026-10-13" }], approver_registry: [{ viewer_id: "u_juan", role: "approver", status: "CONFIRMED", label: "Juan" }, { viewer_id: "u_cherry", role: "approver", status: "CONFIRMED", label: "Cherry" }], audit_events: [] });
  const from = m.db.from.bind(m.db);
  m.db.from = (table: string) => { const b = from(table); b.upsert = (row: any, o: { onConflict: string; ignoreDuplicates?: boolean }) => { const keys = o.onConflict.split(","); const hit = (m.t[table] ??= []).find((r: any) => keys.every((k) => r[k] === row[k])); if (hit) { if (!o.ignoreDuplicates) Object.assign(hit, row); } else m.t[table].push({ id: `${table}-${m.t[table].length}`, ...row }); return Promise.resolve({ data: null, error: null }); }; return b; };
  return m;
}
describe("reading the decision back", () => {
  it("Juan's confirmation sets the voice reference to approved, once; the same record read again changes nothing more", async () => {
    const m = world();
    const r1 = await syncVoiceApproval(m.db as any, [rec()], "2026-10-14T12:00:00Z");
    expect(r1.confirmed).toBe(true);
    expect(m.t.brand_facts[0]).toMatchObject({ status: "approved", approved_by: "Juan (u_juan)", approved_at: "2026-10-14T10:00:00Z" });
    await syncVoiceApproval(m.db as any, [rec()], "2026-10-14T13:00:00Z");
    expect(m.t.brand_facts[0].approved_at).toBe("2026-10-14T10:00:00Z");
  });
  it("Cherry's click is feedback and changes nothing: she cannot confirm Juan's voice", async () => {
    const m = world();
    const r = await syncVoiceApproval(m.db as any, [rec({ viewerId: "u_cherry", recordId: "u_cherry/v", displayName: "Cherry" })]);
    expect(r.confirmed).toBe(false); expect(r.feedback).toBe(1);
    expect(m.t.brand_facts[0].status).toBe("provisional");
  });
  it("a request for changes clears Leo's provisional approval and records why", async () => {
    const m = world();
    await syncVoiceApproval(m.db as any, [rec({ decision: "request_changes", note: "less formal" })]);
    expect(m.t.brand_facts[0]).toMatchObject({ status: "provisional", provisional_by: null });
    expect(m.t.audit_events.some((e: any) => e.event_type === "voice_reference_changes_requested")).toBe(true);
  });
  it("an unknown account is queued for Leo to confirm, and its click does not count", async () => {
    const m = world();
    const r = await syncVoiceApproval(m.db as any, [rec({ viewerId: "u_new", recordId: "u_new/v", displayName: "Juan (new browser)" })]);
    expect(r.pendingRegistrations).toHaveLength(1);
    expect(m.t.brand_facts[0].status).toBe("provisional");
  });
});

describe("the page and the article proposal", () => {
  it("the page shows a few example lines with the same filter the Approval Room used, and the hash the decision is recorded against", () => {
    const p = voicePagePayload(REF)!;
    expect(p.excerpts.map((e) => e.text)).toEqual(["Age alone isn't the problem.", "A house full of belongings is not always a junk problem."]);
    expect(p.hash).toBe(HASH); expect(p.id).toBe(voiceItemId(HASH));
    expect(voicePagePayload("not json")).toBeNull();
  });
  it("the article Approval Room no longer has the voice question, and an article proposal no longer carries a voice item", () => {
    const room = readFileSync("src/approval-room/template.html", "utf8");
    expect(room).not.toContain("does this sound like you");
    expect(room).not.toContain("voice-sec");
    expect(room).not.toContain("Yes, sounds like me");
    const prop = readFileSync("src/lib/studio/proposals.ts", "utf8");
    expect(prop).toContain("const voice = null;");
  });
  it("the voice page records the same decision shape as the Approval Room", () => {
    const t = readFileSync("src/voice-check/template.html", "utf8");
    for (const k of ["proposalId:P.id", "itemKind:'voice_reference'", "decision:decision", "claimedHash:P.hash", "note:note.value", "decidedAt:", "displayName:"]) expect(t, k).toContain(k);
    expect(t).toContain("'decisions/'+state.uid+'/records'");
    expect(t).toContain("This is not an article approval");
  });
});
