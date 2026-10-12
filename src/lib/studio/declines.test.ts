import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findDecline, mergeReview, recordWriterDeclines, similarity, type Collected, type DeclineRecord } from "./declines";
import { applyDeterministic, declineMany, editLocked, forLeo, newTeamSection, recordReview, recordVersion, reopen, type CouncilReview, type Outcome, type ReviewItem, type TeamSectionState } from "../team/loop";
import { teamPromptVersion, TEAM_PROMPT_VERSIONS } from "../team/bridge";
import { STUDIO_AGENT_META } from "./agents";

const ANCHOR = "No local fact anchors this section to the Bay Area, so the local angle stays generic.";
const ANCHOR_REWORDED = "The section has no local anchor in the Bay Area; add a local fact so it does not read generic.";
const col = (key: string, role: string, text: string): Collected => ({ key, role, severity: "should fix", text, versionHash: "h1", declined: null });
const ok = (o: Outcome): TeamSectionState => { if (!o.ok) throw new Error(o.error); return o.state; };
const item = (key: string, text: string, newEvidence?: string) => ({ key, severity: "should fix" as const, text, newEvidence });

describe("similarity and matching", () => {
  it("the same point reworded matches; a different point does not", () => {
    expect(similarity(ANCHOR, ANCHOR_REWORDED)).toBeGreaterThanOrEqual(0.3);
    expect(similarity(ANCHOR, "Shorten the opening paragraph to two sentences.")).toBeLessThan(0.2);
  });
  it("an exact key matches whatever the text", () => {
    const d: DeclineRecord[] = [{ key: "loc:anchor", role: "V2", text: ANCHOR, reason: "No local fact exists in the ledger.", raised: 1 }];
    expect(findDecline(d, { key: "loc:anchor", text: "anything at all" })).toBe(d[0]);
    expect(findDecline(d, { key: "other", text: "Shorten the opening paragraph to two sentences." })).toBeNull();
  });
  it("very similar text under a new key matches", () => {
    const d: DeclineRecord[] = [{ key: "loc:anchor", role: "V2", text: ANCHOR, reason: "No local fact exists in the ledger.", raised: 1 }];
    expect(findDecline(d, { key: "seo:new-key", text: ANCHOR + " Please fix." })?.key).toBe("loc:anchor");
  });
});

describe("recordWriterDeclines", () => {
  const collected = [col("loc:anchor", "V2", ANCHOR)];
  it("stores a decline for an open should-fix and marks the item declined", () => {
    const r = recordWriterDeclines([], collected, [{ key: "loc:anchor", reason: "No local fact exists in the ledger." }], { mustFixKeys: [] });
    expect(r.ok && r.declines[0]).toMatchObject({ key: "loc:anchor", role: "V2", raised: 1, text: ANCHOR });
    expect(r.ok && r.collected[0].declined).toBe("No local fact exists in the ledger.");
  });
  it("refuses a must-fix, an unknown key, a missing reason and a duplicate", () => {
    const bad = (list: { key: string; reason: string }[], must: string[] = []) => { const r = recordWriterDeclines([], collected, list, { mustFixKeys: must }); return r.ok ? "" : r.errors.join("|"); };
    expect(bad([{ key: "loc:anchor", reason: "A good enough reason." }], ["loc:anchor"])).toMatch(/must-fix/);
    expect(bad([{ key: "nope", reason: "A good enough reason." }])).toMatch(/not an open should-fix/);
    expect(bad([{ key: "loc:anchor", reason: "no" }])).toMatch(/needs a reason/);
    expect(bad([{ key: "loc:anchor", reason: "A good enough reason." }, { key: "loc:anchor", reason: "Another good reason." }])).toMatch(/twice/);
  });
});

describe("mergeReview: a reviewer's new list never removes a decline", () => {
  const declines: DeclineRecord[] = [{ key: "loc:anchor", role: "V2", text: ANCHOR, reason: "No local fact exists in the ledger.", raised: 1 }];
  it("a re-raise under the same key counts once and stays declined", () => {
    const m = mergeReview(declines, [], "V2", [item("loc:anchor", ANCHOR)], "h2");
    expect(m.declines[0].raised).toBe(2);
    expect(m.collected[0].declined).toBe("No local fact exists in the ledger.");
    expect(m.counted).toEqual(["loc:anchor"]);
  });
  it("a re-raise under a NEW key and new words still matches by text", () => {
    const m = mergeReview(declines, [], "V3", [item("ed:local-anchor", ANCHOR + " Please fix.")], "h2");
    expect(m.declines).toHaveLength(1);
    expect(m.declines[0].raised).toBe(2);
    expect(m.collected[0]).toMatchObject({ key: "loc:anchor", declined: "No local fact exists in the ledger." });
  });
  it("the same point worded twice in one review counts once", () => {
    const m = mergeReview(declines, [], "V2", [item("a", ANCHOR), item("b", ANCHOR + " Again.")], "h2");
    expect(m.declines[0].raised).toBe(2);
    expect(m.collected).toHaveLength(1);
  });
  it("a review that no longer raises the item leaves the decline in place", () => {
    const m = mergeReview(declines, [col("loc:anchor", "V2", ANCHOR)], "V2", [], "h2");
    expect(m.declines).toEqual(declines);
    expect(m.collected).toEqual([]);
  });
  it("new_evidence lifts the decline and the item is open again", () => {
    const m = mergeReview(declines, [], "V2", [item("loc:anchor", ANCHOR, "clm:12 now gives the Oakland rule")], "h2");
    expect(m.declines).toEqual([]);
    expect(m.reopened).toEqual([{ key: "loc:anchor", evidence: "clm:12 now gives the Oakland rule" }]);
    expect(m.collected[0].declined).toBeNull();
  });
  it("an unrelated new item is just collected", () => {
    const m = mergeReview(declines, [], "V3", [item("ed:cta", "Make the call to action softer and shorter.")], "h2");
    expect(m.declines).toEqual(declines);
    expect(m.collected[0]).toMatchObject({ key: "ed:cta", declined: null });
  });
});

// ---------- the team loop: report 6.1 as a regression ----------
const v = (hash: string) => ({ hash, sig: "sigA" });
const pass = (role: string, s: TeamSectionState, items: ReviewItem[] = []): CouncilReview => ({ role, versionHash: s.versionHash!, decision: "PASS", items });
const written = (hash = "h1") => ok(applyDeterministic(ok(recordVersion(newTeamSection("s1"), v(hash))), []));
const rev = (role: string, s: TeamSectionState, key: string): CouncilReview => ({ role, versionHash: s.versionHash!, decision: "REVISION", items: [{ key, severity: "must fix", text: `problem ${key}` }] });
const soft = (key: string, text: string, newEvidence?: string): ReviewItem => ({ key, severity: "should fix", text, newEvidence });
const review = (s: TeamSectionState, r: CouncilReview) => ok(recordReview(s, r));

describe("team loop: lost declines (report 6.1)", () => {
  it("the writer's decline survives the reviewer re-keying and rewording it, over several rounds", () => {
    let s = written();
    s = review(review(review(s, pass("V1", s)), pass("V3", s, [soft("ed:anchor", ANCHOR)])), rev("V2", s, "seo:x"));
    s = ok(declineMany(s, [{ key: "ed:anchor", reason: "No local fact exists in the ledger or the library." }]));
    expect(s.declines).toHaveLength(1);
    for (const [i, h] of ["h2", "h3"].entries()) {
      s = ok(applyDeterministic(ok(recordVersion(s, v(h))), []));
      s = review(review(review(s, pass("V1", s)), pass("V3", s, [soft(`ed:local-${i}`, i === 0 ? ANCHOR_REWORDED + " Please add one." : ANCHOR + " Again, please.")])), i === 0 ? rev("V2", s, "seo:y") : pass("V2", s));
    }
    expect(s.status).toBe("LOCKED");
    expect(s.declines).toHaveLength(1);                              // not replaced, not duplicated
    expect(s.declines![0]).toMatchObject({ key: "ed:anchor", reason: "No local fact exists in the ledger or the library." });
    expect(s.declines![0].raised).toBeGreaterThanOrEqual(2);
    expect(forLeo(s).declined).toHaveLength(1);                      // on Leo's list
    expect(forLeo(s).open).toEqual([]);
  });
  it("declines survive reopen and unlock", () => {
    let s = written();
    s = review(review(review(s, pass("V1", s)), pass("V3", s, [soft("ed:anchor", ANCHOR)])), pass("V2", s));
    s = ok(declineMany(s, [{ key: "ed:anchor", reason: "No local fact exists in the ledger or the library." }]));
    expect(s.status).toBe("LOCKED");
    expect(ok(reopen(s, "Leo: tighten s1")).declines).toHaveLength(1);
    expect(ok(editLocked(s, { hash: "h9", sig: "sigB", text: "New text." })).declines).toHaveLength(1);
  });
  it("a must-fix cannot be declined", () => {
    let s = written();
    s = review(review(review(s, pass("V1", s)), rev("V3", s, "ed:must")), pass("V2", s));
    expect(declineMany(s, [{ key: "ed:must", reason: "I disagree with the reviewer." }]).ok).toBe(false);
  });
  it("new_evidence reopens the item", () => {
    let s = written();
    s = review(review(review(s, pass("V1", s)), pass("V3", s, [soft("ed:anchor", ANCHOR)])), rev("V2", s, "seo:x"));
    s = ok(declineMany(s, [{ key: "ed:anchor", reason: "No local fact exists in the ledger or the library." }]));
    s = ok(applyDeterministic(ok(recordVersion(s, v("h2"))), []));
    s = review(review(review(s, pass("V1", s)), pass("V3", s, [soft("ed:anchor", ANCHOR, "clm:12 is now in the ledger")])), pass("V2", s));
    expect(s.declines).toEqual([]);
    expect(forLeo(s).open.map((c) => c.key)).toEqual(["ed:anchor"]);
  });
});

describe("prompt versions: the agent files and the code agree", () => {
  const fileVersion = (f: string) => /^prompt_version:\s*(\S+)/m.exec(readFileSync(`.claude/agents/${f}.md`, "utf8"))![1];
  const FILE: Record<string, string> = { R1: "thb-r1-legal-official", R2: "thb-r2-search", R3: "thb-r3-experience", S1: "thb-s1-strategist", S2: "thb-s2-architect", W1: "thb-w1-writer", W2: "thb-w2-cowriter", V1: "thb-v1-fact-privacy", V2: "thb-v2-seo-aeo-geo", V3: "thb-v3-editorial" };
  it("every team role file carries the version the bridge demands", () => {
    for (const [role, ver] of Object.entries(TEAM_PROMPT_VERSIONS)) {
      expect(fileVersion(FILE[role]), role).toBe(ver);
      expect(teamPromptVersion(role as never)).toBe(ver);
    }
  });
  it("every classic agent file carries the version the code demands", () => {
    for (const [key, m] of Object.entries(STUDIO_AGENT_META)) expect(fileVersion(key), key).toBe(m.promptVersion);
  });
});
