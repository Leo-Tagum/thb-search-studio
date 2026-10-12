import { describe, expect, it } from "vitest";
import { allLocked, applyDeterministic, briefRevised, decline, editLocked, escalateGap, forLeo, newTeamSection, recordReview, recordVersion, reopen, resolveByHuman, type CouncilReview, type Outcome, type ReviewItem, type TeamSectionState } from "./loop";

const ok = (o: Outcome): TeamSectionState => { if (!o.ok) throw new Error(o.error); return o.state; };
const v = (hash: string, sig = "sigA") => ({ hash, sig });
const pass = (role: string, s: TeamSectionState, items: ReviewItem[] = []): CouncilReview => ({ role, versionHash: s.versionHash!, decision: "PASS", items });
const rev = (role: string, s: TeamSectionState, key: string, severity: ReviewItem["severity"] = "must fix"): CouncilReview => ({ role, versionHash: s.versionHash!, decision: "REVISION", items: [{ key, severity, text: `problem ${key}` }] });
const review = (s: TeamSectionState, r: CouncilReview) => ok(recordReview(s, r));
const written = (hash = "h1", sig = "sigA") => ok(applyDeterministic(ok(recordVersion(newTeamSection("s1"), v(hash, sig))), []));
const passAll = (s: TeamSectionState) => s.pending.reduce((acc, role) => review(acc, pass(role, acc)), s);

describe("team section loop: the happy path", () => {
  it("write -> council passes -> locked, by code", () => {
    const s = passAll(written());
    expect(s.status).toBe("LOCKED");
    expect(s.lockedHash).toBe("h1");
    expect(allLocked([s])).toBe(true);
  });
  it("the council reviews in any order and the lock waits for the last member", () => {
    let s = written();
    s = review(s, pass("V3", s));
    s = review(s, pass("V1", s));
    expect(s.status).toBe("NEEDS_COUNCIL");
    s = review(s, pass("V2", s));
    expect(s.status).toBe("LOCKED");
  });
  it("a must-fix goes back to the writer, then re-review of the new version locks", () => {
    let s = written();
    s = review(review(review(s, pass("V1", s)), rev("V3", s, "ed:h1")), pass("V2", s));
    expect(s.status).toBe("NEEDS_REVISION");
    expect(s.mustFix.map((i) => i.key)).toEqual(["ed:h1"]);
    s = ok(applyDeterministic(ok(recordVersion(s, v("h2"))), []));
    expect(s.pending).toEqual(["V1", "V2", "V3"]);              // changed hash: V1 passes again, a carried pass is only for an identical version
    s = review(review(review(s, pass("V1", s)), pass("V3", s)), pass("V2", s));
    expect(s.status).toBe("LOCKED");
    expect(s.lockedHash).toBe("h2");
    expect(s.mustFix).toEqual([]);
  });
});

describe("only V1 can block, and its veto cannot be argued away", () => {
  it("V2 and V3 cannot BLOCK", () => {
    const s = written();
    for (const role of ["V2", "V3"]) expect(recordReview(s, { role, versionHash: "h1", decision: "BLOCKED", items: [{ key: "x", severity: "must fix", text: "no" }] }).ok).toBe(false);
  });
  it("V1 BLOCKED stops the section for a human", () => {
    const s = written();
    const b = review(s, { role: "V1", versionHash: "h1", decision: "BLOCKED", blockKind: "BLOCKED_PRIVACY", items: [{ key: "priv", severity: "must fix", text: "seller identifiable" }] });
    expect(b.status).toBe("BLOCKED_PRIVACY");
    expect(recordVersion(b, v("h2")).ok).toBe(false);
  });
  it("a V1 must-fix cannot be declined, and V2/V3 passing does not clear it", () => {
    let s = written();
    s = review(review(review(s, rev("V1", s, "fact:c1")), pass("V2", s)), pass("V3", s));
    expect(s.status).toBe("NEEDS_REVISION");
    expect(decline(s, "fact:c1", "I disagree, the claim is fine").ok).toBe(false);
    s = ok(applyDeterministic(ok(recordVersion(s, v("h2"))), []));      // writer resubmits the same content
    expect(s.pending).toEqual(["V1", "V2", "V3"]);                      // V1 reviews again
    s = review(review(s, pass("V2", s)), pass("V3", s));
    expect(s.status).toBe("NEEDS_COUNCIL");                              // still waiting for V1: no lock
    expect(s.pending).toEqual(["V1"]);
    s = review(s, pass("V1", s));                                        // only V1's own pass clears it
    expect(s.status).toBe("LOCKED");
  });
  it("a V1 item repeated after two revision attempts escalates to Leo instead of looping", () => {
    let s = written("h1");
    s = review(review(review(s, rev("V1", s, "fact:c1")), pass("V2", s)), pass("V3", s));
    s = ok(applyDeterministic(ok(recordVersion(s, v("h2"))), []));
    s = review(review(review(s, rev("V1", s, "fact:c1")), pass("V2", s)), pass("V3", s));
    s = ok(applyDeterministic(ok(recordVersion(s, v("h3"))), []));
    s = review(s, rev("V1", s, "fact:c1"));
    expect(s.status).toBe("ESCALATED");
    expect(s.escalation?.issueKey).toBe("fact:c1");
  });
  it("an edit after V1 passed re-enters V1 when the material content changed", () => {
    let s = written("h1", "sigA");
    s = review(review(review(s, pass("V1", s)), rev("V2", s, "seo:answer")), pass("V3", s));
    expect(s.v1Passed?.sig).toBe("sigA");
    s = ok(applyDeterministic(ok(recordVersion(s, v("h2", "sigB"))), []));   // the SEO fix changed a figure
    expect(s.pending).toEqual(["V1", "V2", "V3"]);
    expect(s.v1Passed).toBeNull();
    expect(s.v1Scope).toEqual({ kind: "full" });
    s = review(review(s, pass("V2", s)), pass("V3", s));
    expect(s.status).toBe("NEEDS_COUNCIL");                                   // V2 and V3 alone cannot lock a changed fact
    s = review(s, pass("V1", s));
    expect(s.status).toBe("LOCKED");
    expect(s.v1Passed?.sig).toBe("sigB");
  });
});

describe("V1 re-reviews wording changes, scoped to the changed sentences", () => {
  const text1 = "Hoarded homes can still sell as-is. A buyer who pays cash can close without repairs. Ask an attorney about your situation.";
  // V1 passes h1; V2 asks for a SEO fix, so the writer sends a wording-only revision (same material signature).
  const afterSeoFix = (text2: string) => {
    let s = ok(applyDeterministic(ok(recordVersion(newTeamSection("s1"), { hash: "h1", sig: "sigA", text: text1 })), []));
    s = review(review(review(s, pass("V1", s)), rev("V2", s, "seo:answer")), pass("V3", s));
    return ok(applyDeterministic(ok(recordVersion(s, { hash: "h2", sig: "sigA", text: text2 })), []));
  };
  it("a wording-only edit that introduces an unsourced generalization is caught by V1 (the material signature misses it)", () => {
    let s = afterSeoFix("Hoarded homes can still sell as-is. Most owners never check what a buyer will actually pay. Ask an attorney about your situation.");
    expect(s.pending).toEqual(["V1", "V2", "V3"]);
    expect(s.v1Scope).toEqual({ kind: "changed", sentences: ["Most owners never check what a buyer will actually pay."] });
    s = review(review(s, pass("V2", s)), pass("V3", s));
    expect(s.status).toBe("NEEDS_COUNCIL");                                   // V2 and V3 cannot lock it
    expect(s.hedges.map((h) => h.term)).toEqual(["most owners"]);               // code flagged it; V1 must now rule on it
    expect(recordReview(s, pass("V1", s)).ok).toBe(false);
    s = review(s, { ...rev("V1", s, "fact:unsourced-most-owners"), hedgeRulings: [{ key: s.hedges[0].key, ruling: "reword", note: "no source for how many owners" }] });
    expect(s.status).toBe("NEEDS_REVISION");
    expect(s.mustFix.map((i) => i.key)).toContain("fact:unsourced-most-owners");
    expect(s.mustFix.find((i) => i.key.startsWith("hedge:"))).toMatchObject({ role: "V1" });
    expect(s.v1Passed).toBeNull();
  });
  it("V1's scope is only what changed, and it is a full review after a V1 item, a material change, or when no text is given", () => {
    const s = afterSeoFix("Hoarded homes can still sell as-is. A buyer who pays cash can close without repairs. Ask an attorney about your own situation.");
    expect(s.v1Scope).toEqual({ kind: "changed", sentences: ["Ask an attorney about your own situation."] });
    let m = ok(applyDeterministic(ok(recordVersion(newTeamSection("s1"), { hash: "h1", sig: "sigA", text: text1 })), []));
    m = review(review(review(m, pass("V1", m)), rev("V2", m, "seo:x")), pass("V3", m));
    expect(ok(recordVersion(m, { hash: "h2", sig: "sigB", text: text1 + " New fact." })).v1Scope).toEqual({ kind: "full" });
    expect(ok(recordVersion(m, { hash: "h2", sig: "sigA" })).v1Scope).toEqual({ kind: "full" });
    let r = ok(applyDeterministic(ok(recordVersion(newTeamSection("s1"), { hash: "h1", sig: "sigA", text: text1 })), []));
    r = review(review(review(r, rev("V1", r, "fact:c1")), pass("V2", r)), pass("V3", r));
    expect(ok(recordVersion(r, { hash: "h2", sig: "sigA", text: text1 + " More." })).v1Scope).toEqual({ kind: "full" });
  });
  it("a version identical to the one V1 passed carries the pass; V2 and V3 still re-review", () => {
    let s = ok(applyDeterministic(ok(recordVersion(newTeamSection("s1"), { hash: "h1", sig: "sigA", text: text1 })), []));
    s = review(review(review(s, pass("V1", s)), rev("V2", s, "seo:x")), pass("V3", s));
    s = ok(applyDeterministic(ok(recordVersion(s, { hash: "h1", sig: "sigA", text: text1 })), []));
    expect(s.pending).toEqual(["V2", "V3"]);
    expect(s.v1Scope).toBeNull();
    s = review(review(s, pass("V2", s)), pass("V3", s));
    expect(s.status).toBe("LOCKED");
  });
});

describe("should-fix and suggestions never block", () => {
  it("a V2 that keeps repeating a suggestion does not deadlock the lock; Leo sees it", () => {
    let s = written();
    s = review(review(review(s, pass("V1", s)), pass("V3", s)), pass("V2", s, [{ key: "seo:faq", severity: "suggestion", text: "add a fifth FAQ" }]));
    expect(s.status).toBe("LOCKED");
    expect(forLeo(s).open.map((c) => c.key)).toEqual(["seo:faq"]);
  });
  it("a declined suggestion stays declined when the reviewer repeats it, and is listed with its reason", () => {
    let s = written();
    s = review(review(review(s, pass("V1", s)), pass("V3", s, [{ key: "ed:cta", severity: "should fix", text: "softer CTA" }])), rev("V2", s, "seo:x"));
    s = ok(decline(s, "ed:cta", "The CTA follows the approved wording."));
    s = ok(applyDeterministic(ok(recordVersion(s, v("h2"))), []));
    s = review(review(review(s, pass("V1", s)), pass("V3", s, [{ key: "ed:cta", severity: "should fix", text: "softer CTA" }])), pass("V2", s));
    expect(s.status).toBe("LOCKED");
    expect(forLeo(s).open).toEqual([]);
    expect(forLeo(s).declined[0]).toMatchObject({ key: "ed:cta", declined: "The CTA follows the approved wording." });
  });
  it("declining needs a reason and an existing item", () => {
    const s = written();
    expect(decline(s, "nope", "why").ok).toBe(false);
  });
  it("a must-fix from V2 or V3 is not optional: the section does not lock with one open", () => {
    let s = written();
    s = review(review(review(s, pass("V1", s)), pass("V2", s)), rev("V3", s, "ed:voice"));
    expect(s.status).toBe("NEEDS_REVISION");
    expect(decline(s, "ed:voice", "no").ok).toBe(false);
  });
});

describe("no role can lock", () => {
  it("non-council roles cannot post a review", () => {
    const s = written();
    for (const role of ["W1", "W2", "S1", "S2", "R1", "ORCHESTRATOR", "LEO"]) expect(recordReview(s, pass(role, s)).ok).toBe(false);
  });
  it("V2 and V3 passing without V1 never locks", () => {
    let s = written();
    s = review(review(s, pass("V2", s)), pass("V3", s));
    expect(s.status).toBe("NEEDS_COUNCIL");
    expect(s.lockedHash).toBeNull();
  });
  it("a review of an older version, a repeat review, and a PASS carrying must-fix are refused", () => {
    const s = written("h2");
    expect(recordReview(s, { ...pass("V1", s), versionHash: "h1" }).ok).toBe(false);
    expect(recordReview(s, pass("V1", s, [{ key: "x", severity: "must fix", text: "x" }])).ok).toBe(false);
    expect(recordReview(review(s, pass("V1", s)), pass("V1", s)).ok).toBe(false);
    expect(recordReview(s, { role: "V2", versionHash: "h2", decision: "REVISION", items: [] }).ok).toBe(false);
  });
  it("a locked section refuses writes and reviews; the writer cannot touch it", () => {
    const s = passAll(written());
    expect(recordVersion(s, v("h9")).ok).toBe(false);
    expect(recordReview(s, pass("V1", s)).ok).toBe(false);
  });
  it("an edit to a locked section clears the lock and every pass", () => {
    const e = ok(editLocked(passAll(written()), v("h2", "sigB")));
    expect(e).toMatchObject({ status: "NEEDS_COUNCIL", lockedHash: null, v1Passed: null, v1Scope: { kind: "full" }, pending: ["V1", "V2", "V3"] });
  });
  it("reopen by a human sends it back through the full council", () => {
    const e = ok(reopen(passAll(written()), "Re-check the probate wording"));
    expect(e.status).toBe("NEEDS_REVISION");
    const w = ok(recordVersion(e, v("h2")));
    expect(w.pending).toEqual(["V1", "V2", "V3"]);
    expect(w.mustFix).toEqual([]);                                           // the directive is consumed by the new version
  });
});

describe("deterministic checks run before the council", () => {
  it("a blocking finding stops the section; a revision finding returns it to the writer", () => {
    const fresh = ok(recordVersion(newTeamSection("s1"), v("h1")));
    expect(ok(applyDeterministic(fresh, [{ code: "rating_text", severity: "BLOCKED_CLAIM", detail: "typed rating" }])).status).toBe("BLOCKED_CLAIM");
    expect(ok(applyDeterministic(fresh, [{ code: "seller_quote", severity: "BLOCKED_PRIVACY", detail: "quoted seller" }])).status).toBe("BLOCKED_PRIVACY");
    const r = ok(applyDeterministic(fresh, [{ code: "link", severity: "REVISION", detail: "unapproved link" }]));
    expect(r).toMatchObject({ status: "NEEDS_REVISION", pending: [] });
    expect(r.mustFix[0]).toMatchObject({ key: "det:link", role: "CODE" });
  });
  it("a deterministic finding that keeps coming back escalates after two revision attempts", () => {
    const f = [{ code: "link", severity: "REVISION" as const, detail: "unapproved link" }];
    let s = ok(applyDeterministic(ok(recordVersion(newTeamSection("s1"), v("h1"))), f));
    s = ok(applyDeterministic(ok(recordVersion(s, v("h2"))), f));
    expect(s.status).toBe("NEEDS_REVISION");
    s = ok(applyDeterministic(ok(recordVersion(s, v("h3"))), f));
    expect(s.status).toBe("ESCALATED");
  });
  it("a clean re-check removes the deterministic item", () => {
    let s = ok(applyDeterministic(ok(recordVersion(newTeamSection("s1"), v("h1"))), [{ code: "link", severity: "REVISION", detail: "x" }]));
    s = ok(applyDeterministic(ok(recordVersion(s, v("h2"))), []));
    expect(s.mustFix).toEqual([]);
    expect(s.status).toBe("NEEDS_COUNCIL");
  });
});

describe("humans", () => {
  it("Leo resolves an escalation into a directive and the full council re-reviews", () => {
    let s = ok(escalateGap(newTeamSection("s2"), "needs a fact we do not have"));
    expect(s.status).toBe("ESCALATED");
    expect(recordVersion(s, v("h2")).ok).toBe(false);
    s = ok(resolveByHuman(s, { kind: "request_revision", issueText: "Write it without the figure." }));
    expect(s.status).toBe("NEEDS_REVISION");
    s = ok(recordVersion(s, v("h2")));
    expect(s.pending).toEqual(["V1", "V2", "V3"]);
    expect(ok(resolveByHuman(ok(escalateGap(newTeamSection("s3"), "gap")), { kind: "hold" })).status).toBe("ESCALATED");
    expect(resolveByHuman(newTeamSection("s4"), { kind: "hold" }).ok).toBe(false);
  });
});

describe("hedge phrases: flagged by code, V1 rules on each one", () => {
  const clean = "Hoarded homes can still sell as-is. Ask an attorney about your situation.";
  const hedged = "Hoarded homes can still sell as-is. Most owners never check what a buyer will pay. Nobody looks twice at a cluttered porch.";
  const withText = (text: string, hash = "h1") => ok(applyDeterministic(ok(recordVersion(newTeamSection("s1"), { hash, sig: "sigA", text })), []));
  const rule = (s: TeamSectionState, ruling: "proven" | "reword" | "drop", note?: string) => s.hedges.map((h) => ({ key: h.key, ruling, note }));

  it("flags each hedge sentence on the new version and does not block or send it to the writer", () => {
    const s = withText(hedged);
    expect(s.hedges.map((h) => h.term)).toEqual(["most owners", "nobody"]);
    expect(s.status).toBe("NEEDS_COUNCIL");
    expect(s.mustFix).toEqual([]);
    expect(withText(clean).hedges).toEqual([]);
  });
  it("V1 cannot pass or revise without ruling on every flagged sentence", () => {
    const s = withText(hedged);
    expect(recordReview(s, pass("V1", s)).ok).toBe(false);
    expect(recordReview(s, { ...pass("V1", s), hedgeRulings: [{ key: s.hedges[0].key, ruling: "proven", note: "clm:4 supports this" }] }).ok).toBe(false);   // the second is unruled
    expect(recordReview(s, { ...rev("V1", s, "fact:other"), hedgeRulings: [] }).ok).toBe(false);
    expect(recordReview(s, { ...pass("V1", s), hedgeRulings: [{ key: "hedge:nope", ruling: "proven", note: "clm:1 evidence" }, ...rule(s, "proven", "clm:4 supports this")] }).ok).toBe(false);
  });
  it("only V1 rules on hedge sentences", () => {
    const s = withText(hedged);
    expect(recordReview(s, { ...pass("V2", s), hedgeRulings: rule(s, "proven", "clm:4 supports this") }).ok).toBe(false);
  });
  it("a proven ruling needs its evidence", () => {
    const s = withText(hedged);
    expect(recordReview(s, { ...pass("V1", s), hedgeRulings: rule(s, "proven") }).ok).toBe(false);
    expect(recordReview(s, { ...pass("V1", s), hedgeRulings: rule(s, "proven", " ") }).ok).toBe(false);
  });
  it("all proven (with evidence) lets the section lock", () => {
    let s = withText(hedged);
    s = review(s, { ...pass("V1", s), hedgeRulings: rule(s, "proven", "clm:4 supports this") });
    s = review(review(s, pass("V2", s)), pass("V3", s));
    expect(s.status).toBe("LOCKED");
  });
  it("reword or drop becomes a V1 must-fix: a PASS cannot carry it, a REVISION does, and no lock follows", () => {
    let s = withText(hedged);
    expect(recordReview(s, { ...pass("V1", s), hedgeRulings: rule(s, "drop") }).ok).toBe(false);
    s = review(s, { ...rev("V1", s, "fact:other"), hedgeRulings: [{ key: s.hedges[0].key, ruling: "reword", note: "say what the data shows" }, { key: s.hedges[1].key, ruling: "drop" }] });
    s = review(review(s, pass("V2", s)), pass("V3", s));
    expect(s.status).toBe("NEEDS_REVISION");
    expect(s.mustFix.filter((i) => i.key.startsWith("hedge:")).map((i) => i.role)).toEqual(["V1", "V1"]);
    expect(s.mustFix.find((i) => i.key === s.hedges[0].key)?.text).toContain("Most owners never check");
  });
  it("a REVISION made only of hedge rulings is accepted (no other must-fix needed)", () => {
    const s = withText(hedged);
    const r = recordReview(s, { role: "V1", versionHash: "h1", decision: "REVISION", items: [], hedgeRulings: rule(s, "reword") });
    expect(r.ok).toBe(true);
  });
  it("the reworded sentence passes; a repeated hedge in new words needs a fresh ruling", () => {
    let s = withText(hedged);
    s = review(review(review(s, { role: "V1", versionHash: "h1", decision: "REVISION", items: [], hedgeRulings: rule(s, "drop") }), pass("V2", s)), pass("V3", s));
    s = ok(recordVersion(s, { hash: "h2", sig: "sigA", text: "Hoarded homes can still sell as-is. Buyers price in the cleanout cost. Usually the porch is the first thing a buyer sees." }));
    expect(s.hedges.map((h) => h.term)).toEqual(["usually"]);
    expect(s.hedges[0].ruling).toBeNull();
    s = review(review(s, pass("V2", s)), pass("V3", s));
    expect(recordReview(s, pass("V1", s)).ok).toBe(false);                    // V1 has not ruled on "Usually ..."
    s = review(s, { ...pass("V1", s), hedgeRulings: rule(s, "proven", "src:7 quote shows this") });
    expect(s.status).toBe("LOCKED");
  });
  it("a proven ruling carries to an unchanged sentence in a later version, but not to a changed one", () => {
    let s = withText(hedged);
    s = review(review(review(s, { ...pass("V1", s), hedgeRulings: rule(s, "proven", "clm:4 supports this") }), rev("V2", s, "seo:x")), pass("V3", s));
    const same = ok(recordVersion(s, { hash: "h2", sig: "sigA", text: hedged + " Another fix." }));
    expect(same.hedges.map((h) => h.ruling)).toEqual(["proven", "proven"]);
    expect(same.v1Scope).toEqual({ kind: "changed", sentences: ["Another fix."] });
    const changed = ok(recordVersion(s, { hash: "h3", sig: "sigA", text: hedged.replace("Most owners never", "Most owners rarely").replace("Nobody", "No one") }));
    expect(changed.hedges.map((h) => [h.term, h.ruling])).toEqual([["most owners", null]]);
  });
  it("an edit to a locked section re-flags from scratch", () => {
    const e = ok(editLocked(passAll(withText(clean)), { hash: "h2", sig: "sigB", text: hedged }));
    expect(e.hedges).toHaveLength(2);
    expect(e.hedges.every((h) => h.ruling === null)).toBe(true);
  });
});

describe("briefRevised: the brief changed under a unit", () => {
  it("reopens a locked unit through the full council, and the directive is consumed by the next version", () => {
    let s = briefRevised2(passAll(written()));
    expect(s.status).toBe("NEEDS_REVISION");
    expect(s.lockedHash).toBeNull();
    expect(s.mustFix).toEqual([expect.objectContaining({ key: "brief:T3", role: "LEO" })]);
    s = ok(recordVersion(s, v("h2")));
    expect(s.pending).toEqual(["V1", "V2", "V3"]);
    expect(s.mustFix).toEqual([]);
  });
  it("sends a unit in review back to the writer, and leaves an unwritten unit alone", () => {
    const inReview = ok(briefRevised(written(), { key: "brief:T3", text: "The brief changed." }));
    expect(inReview).toMatchObject({ status: "NEEDS_REVISION", pending: [] });
    const fresh = ok(briefRevised(newTeamSection("s9"), { key: "brief:T3", text: "x" }));
    expect(fresh.status).toBe("NEEDS_WRITE");
  });
  it("a repeated directive replaces itself; escalated and blocked units wait for Leo", () => {
    let s = ok(briefRevised(written(), { key: "brief:T3", text: "first" }));
    s = ok(briefRevised(s, { key: "brief:T3", text: "second" }));
    expect(s.mustFix.filter((i) => i.key === "brief:T3")).toHaveLength(1);
    expect(s.mustFix[0].text).toBe("second");
    expect(briefRevised(ok(escalateGap(newTeamSection("s1"), "gap")), { key: "brief:T3", text: "x" }).ok).toBe(false);
  });
});
const briefRevised2 = (s: TeamSectionState) => ok(briefRevised(s, { key: "brief:T3", text: "The brief changed: the section purpose is now cost ranges." }));
