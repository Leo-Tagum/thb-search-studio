import { describe, expect, it } from "vitest";
import { applyDeterministic, applyReview, declineOptional, forLeo, newSection, recordVersion, reopen, type Outcome, type SectionState } from "./loop";
import { studioOutputSchemas, studioSemanticChecks, type StudioValidationCtx } from "./agents";

const ANCHOR = "No local fact anchors this section to the Bay Area, so the local angle stays generic.";
const ok = (o: Outcome): SectionState => { if (!o.ok) throw new Error(o.error); return o.state; };

/** A section that has passed the V1 gate and is waiting for SEO. */
const atSeo = () => {
  let s = ok(applyDeterministic(ok(recordVersion(newSection("s2"), { hash: "h1", sig: "sig" })), []));
  s = ok(applyReview(s, { agent: "V1", versionHash: "h1", decision: "PASS", issues: [] }));
  return s;
};

type Opt = { key: string; text: string; newEvidence?: string };
/** Agent 6 reviews the current version with a required issue (so the unit goes back to the writer) and these optional findings. */
const seoRevision = (s: SectionState, optional: Opt[]): SectionState => ok(applyReview(s, { agent: 6, versionHash: s.versionHash!, decision: "REVISION", issues: [{ key: "seo:must", text: "Add the direct answer." }], optional }));
/** The writer answers with a new version and V1 passes it (the V1 gate): back at SEO on the new hash. */
const rewrite = (s: SectionState, hash: string): SectionState => ok(applyReview(ok(applyDeterministic(ok(recordVersion(s, { hash, sig: "sig" })), [])), { agent: "V1", versionHash: hash, decision: "PASS", issues: [] }));

describe("classic loop: optional findings and declines (report 6.1 in classic)", () => {
  it("optional findings are collected for Leo and never block", () => {
    let s = atSeo();
    s = ok(applyReview(s, { agent: 6, versionHash: "h1", decision: "PASS", issues: [], optional: [{ key: "seo:anchor", text: ANCHOR }] }));
    expect(s.status).toBe("NEEDS_EDITORIAL");
    expect(forLeo(s).open.map((c) => c.key)).toEqual(["seo:anchor"]);
  });
  it("a decline is stored, listed for Leo, and survives the reviewer re-keying and rewording it", () => {
    let s = atSeo();
    s = seoRevision(s, [{ key: "seo:anchor", text: ANCHOR }]);
    s = ok(declineOptional(s, [{ key: "seo:anchor", reason: "No local fact exists in the ledger or the library." }]));
    expect(forLeo(s).declined).toHaveLength(1);
    // a new version; Agent 6 raises it again under a new key and new words, twice
    for (const [i, h] of ["h2", "h3"].entries()) {
      s = seoRevision(rewrite(s, h), [{ key: `seo:local-${i}`, text: ANCHOR + " Please add one." }]);
    }
    expect(s.declines).toHaveLength(1);
    expect(s.declines![0]).toMatchObject({ key: "seo:anchor", reason: "No local fact exists in the ledger or the library.", raised: 3 });
    expect(forLeo(s).open).toEqual([]);
  });
  it("new_evidence reopens a declined item", () => {
    let s = atSeo();
    s = seoRevision(s, [{ key: "seo:anchor", text: ANCHOR }]);
    s = ok(declineOptional(s, [{ key: "seo:anchor", reason: "No local fact exists in the ledger or the library." }]));
    s = seoRevision(rewrite(s, "h2"), [{ key: "seo:anchor", text: ANCHOR, newEvidence: "clm:12 is now in the ledger" }]);
    expect(s.declines).toEqual([]);
    expect(forLeo(s).open.map((c) => c.key)).toEqual(["seo:anchor"]);
  });
  it("a required issue cannot be declined", () => {
    let s = atSeo();
    s = ok(applyReview(s, { agent: 6, versionHash: "h1", decision: "REVISION", issues: [{ key: "seo:must", text: "Add the direct answer." }], optional: [{ key: "seo:anchor", text: ANCHOR }] }));
    const o = declineOptional(s, [{ key: "seo:must", reason: "I disagree with the reviewer." }]);
    expect(o.ok).toBe(false);
    expect(declineOptional(s, [{ key: "seo:anchor", reason: "No local fact exists in the ledger." }]).ok).toBe(true);
  });
  it("declines survive a human reopen", () => {
    let s = atSeo();
    s = ok(applyReview(s, { agent: 6, versionHash: "h1", decision: "PASS", issues: [], optional: [{ key: "seo:anchor", text: ANCHOR }] }));
    s = ok(declineOptional(s, [{ key: "seo:anchor", reason: "No local fact exists in the ledger or the library." }]));
    const locked: SectionState = { ...s, status: "LOCKED", lockedHash: "h1" };
    expect(ok(reopen(locked, "Leo: tighten this")).declines).toHaveLength(1);
  });
  it("a state saved before Phase 3d (no collected or declines) still works", () => {
    const old = { ...atSeo() } as Partial<SectionState>;
    delete old.collected; delete old.declines;
    const s = ok(applyReview(old as SectionState, { agent: 6, versionHash: "h1", decision: "PASS", issues: [], optional: [{ key: "seo:a", text: "Some point to consider here." }] }));
    expect(forLeo(s).open).toHaveLength(1);
  });
});

describe("Agent 4 declines: validated against the packet", () => {
  const unit = { kind: "section", key: "s2", h2: "What now?", blocks: [{ t: "p", text: "Text." }], claim_ids: [], roles: [] };
  const ctx = (o: Partial<StudioValidationCtx> = {}): StudioValidationCtx => ({
    packet: { agent_key: "thb-04-section-writer", prompt_version: "1.6.0", unit_key: "s2", unit_hash: "h1", allowed_claim_ids: [], opportunity_id: "o1", article_id: "a1" },
    currentUnit: null, currentHash: null, check: {} as never, voiceUsable: true, requiredIssuesOpen: ["fact:must"], declinableKeys: ["seo:anchor"], ...o,
  });
  const out = (declines: unknown) => ({ article_id: "a1", opportunity_id: "o1", agent_name: "x", agent_prompt_version: "1.6.0", model_version: "claude-code/test", input_version_ids: ["h1"], decision: "PASS", findings: [], evidence_ids: [], required_actions: [], output_version_id: "v1", timestamp: "2026-10-12T12:00:00Z", result: { unit_key: "s2", unit, addresses: ["fact:must"], change_note: "fixed", declines } });
  const check = (declines: unknown) => { const p = studioOutputSchemas["thb-04-section-writer"].safeParse(out(declines)); return p.success ? studioSemanticChecks("thb-04-section-writer", p.data, ctx()) : p.error.issues.map((i) => i.message); };
  it("accepts a decline of an open optional key, and no declines field at all", () => {
    expect(check([{ key: "seo:anchor", reason: "No local fact exists in the ledger." }])).toEqual([]);
    const noField = out([]); delete (noField.result as Record<string, unknown>).declines;
    expect(studioOutputSchemas["thb-04-section-writer"].safeParse(noField).success).toBe(true);
  });
  it("refuses a must-fix key, an unknown key, and a reason that is too short", () => {
    expect(check([{ key: "fact:must", reason: "I disagree with the reviewer." }]).join()).toMatch(/must-fix/);
    expect(check([{ key: "made:up", reason: "No local fact exists in the ledger." }]).join()).toMatch(/not an open should-fix/);
    expect(check([{ key: "seo:anchor", reason: "no" }]).length).toBeGreaterThan(0);
  });
});

import { declinesOfRow } from "./declines-view";
describe("Leo's list reads both pipelines", () => {
  const d = { key: "k", role: "V2", text: "t", reason: "a reason long enough", raised: 2 };
  it("classic (issues.meta) and team (issues.team) rows both show their declines", () => {
    expect(declinesOfRow({ issues: { issues: [], meta: { declines: [d], collected: [] } } }).declined).toEqual([d]);
    expect(declinesOfRow({ issues: { team: { declines: [d], collected: [] } } }).declined).toEqual([d]);
    expect(declinesOfRow({ issues: null }).declined).toEqual([]);
    expect(declinesOfRow({ issues: { issues: [], meta: {} } }).declined).toEqual([]);
  });
});
