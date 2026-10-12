import { describe, expect, it } from "vitest";
import { allLocked, applyDeterministic, applyReview, editLocked, editorRevision, newSection as newGatedSection, recordVersion, resolveByHuman, type Outcome, type SectionState } from "./loop";

// These tests cover the flow of a section saved before Phase 3d (no V1 gate, Agent 5 as the fact auditor): such a state stays valid until its text is touched.
// The V1 gate has its own tests in v1-gate.test.ts.
const newSection = (key: string): SectionState => ({ ...newGatedSection(key), gate: undefined });

const ok = (o: Outcome): SectionState => { if (!o.ok) throw new Error(o.error); return o.state; };
const v = (hash: string, sig = "sigA") => ({ hash, sig });
const passAll = (s: SectionState) => ok(applyReview(ok(applyReview(ok(applyReview(s, { agent: 5, versionHash: s.versionHash!, decision: "PASS", issues: [] })), { agent: 6, versionHash: s.versionHash!, decision: "PASS", issues: [] })), { agent: 7, versionHash: s.versionHash!, decision: "PASS", issues: [] }));

describe("section loop", () => {
  it("write -> fact -> SEO -> editorial -> lock", () => {
    let s = ok(recordVersion(newSection("s1"), v("h1")));
    expect(s.status).toBe("NEEDS_FACT");
    s = passAll(s);
    expect(s.status).toBe("LOCKED");
    expect(s.lockedHash).toBe("h1");
  });
  it("a targeted fix passes re-review and locks", () => {
    let s = ok(recordVersion(newSection("s1"), v("h1")));
    s = ok(applyReview(s, { agent: 5, versionHash: "h1", decision: "PASS", issues: [] }));
    s = ok(applyReview(s, { agent: 6, versionHash: "h1", decision: "REVISION", issues: [{ key: "seo:capsule", text: "capsule too long" }] }));
    expect(s.status).toBe("NEEDS_REVISION");
    s = ok(recordVersion(s, v("h2")));            // same material signature: only SEO runs again, not fact review
    expect(s.status).toBe("NEEDS_SEO");
    s = ok(applyReview(s, { agent: 6, versionHash: "h2", decision: "PASS", issues: [] }));
    s = ok(applyReview(s, { agent: 7, versionHash: "h2", decision: "PASS", issues: [] }));
    expect(s.status).toBe("LOCKED");
  });
  it("a changed material claim always re-enters fact review, even when SEO asked for the edit", () => {
    let s = ok(recordVersion(newSection("s1"), v("h1", "sigA")));
    s = ok(applyReview(s, { agent: 5, versionHash: "h1", decision: "PASS", issues: [] }));
    s = ok(applyReview(s, { agent: 6, versionHash: "h1", decision: "REVISION", issues: [{ key: "seo:x", text: "x" }] }));
    const r = recordVersion(s, v("h2", "sigB"));
    expect(ok(r).status).toBe("NEEDS_FACT");
  });
  it("Agent 7 cannot lock a section whose material content changed since fact review", () => {
    let s = ok(recordVersion(newSection("s1"), v("h1", "sigA")));
    s = ok(applyReview(s, { agent: 5, versionHash: "h1", decision: "PASS", issues: [] }));
    s = ok(applyReview(s, { agent: 6, versionHash: "h1", decision: "PASS", issues: [] }));
    const e = ok(editorRevision(s, v("h2", "sigB")));        // editor swaps a fact
    expect(e.status).toBe("NEEDS_FACT");
    const w = ok(editorRevision(s, v("h3", "sigA")));        // wording only
    expect(w.status).toBe("NEEDS_SEO");
  });
  it("two revision attempts per issue, then escalation (no endless loop)", () => {
    let s = ok(recordVersion(newSection("s1"), v("h1")));
    const rev = (hash: string) => applyReview(s, { agent: 5, versionHash: hash, decision: "REVISION", issues: [{ key: "fact:clm:2", text: "applicability unclear" }] });
    s = ok(rev("h1")); expect(s.status).toBe("NEEDS_REVISION");
    s = ok(recordVersion(s, v("h2"))); s = ok(rev("h2")); expect(s.status).toBe("NEEDS_REVISION");   // attempt 1 used
    s = ok(recordVersion(s, v("h3"))); const third = rev("h3"); const t = ok(third);               // attempt 2 used, third failure
    expect(t.status).toBe("ESCALATED");
    expect(t.escalation?.issueKey).toBe("fact:clm:2");
    expect(recordVersion(t, v("h4")).ok).toBe(false);          // the writer cannot keep trying
    const back = ok(resolveByHuman(t, { kind: "request_revision", issueText: "Leo: say it this way" }));
    expect(back.status).toBe("NEEDS_REVISION");
    expect(back.issues[0].attempts).toBe(0);
  });
  it("no agent can lock: only the editorial PASS on the current version locks; stale or wrong-stage reviews are refused", () => {
    const s = ok(recordVersion(newSection("s1"), v("h1")));
    expect(applyReview(s, { agent: 7, versionHash: "h1", decision: "PASS", issues: [] }).ok).toBe(false);   // wrong stage
    expect(applyReview(s, { agent: 5, versionHash: "old", decision: "PASS", issues: [] }).ok).toBe(false);  // stale version
    expect(applyReview(s, { agent: 5, versionHash: "h1", decision: "PASS", issues: [{ key: "k", text: "t" }] }).ok).toBe(false);
  });
  it("BLOCKED from Agent 5 stops the section; the writer cannot edit it", () => {
    let s = ok(recordVersion(newSection("s1"), v("h1")));
    s = ok(applyReview(s, { agent: 5, versionHash: "h1", decision: "BLOCKED", issues: [{ key: "k", text: "claim not supported" }], blockKind: "BLOCKED_CLAIM" }));
    expect(s.status).toBe("BLOCKED_CLAIM");
    expect(recordVersion(s, v("h2")).ok).toBe(false);
  });
  it("deterministic findings: a blocked claim or privacy issue blocks; revision-only findings go to the writer", () => {
    const s = ok(recordVersion(newSection("s1"), v("h1")));
    expect(ok(applyDeterministic(s, [{ code: "UNCOVERED_FIGURE", severity: "BLOCKED_CLAIM", detail: "x" }])).status).toBe("BLOCKED_CLAIM");
    expect(ok(applyDeterministic(s, [{ code: "SELLER_IDENTITY", severity: "BLOCKED_PRIVACY", detail: "x" }])).status).toBe("BLOCKED_PRIVACY");
    const r = ok(applyDeterministic(s, [{ code: "MARKUP", severity: "REVISION", detail: "x" }]));
    expect(r.status).toBe("NEEDS_REVISION");
    expect(r.issues[0].key).toBe("det:MARKUP");
  });
  it("a locked section refuses writer edits; a human edit clears the lock and all passes", () => {
    const s = passAll(ok(recordVersion(newSection("s1"), v("h1"))));
    expect(recordVersion(s, v("h2")).ok).toBe(false);
    const e = ok(editLocked(s, v("h2", "sigB")));
    expect(e.status).toBe("NEEDS_FACT");
    expect(e.lockedHash).toBeNull();
    expect(e.factPassedSig).toBeNull();
  });
  it("article is ready only when every section is locked", () => {
    const a = passAll(ok(recordVersion(newSection("s1"), v("h1"))));
    const b = ok(recordVersion(newSection("s2"), v("h1")));
    expect(allLocked([a, b])).toBe(false);
    expect(allLocked([a, passAll(b)])).toBe(true);
  });
});
