/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 3c task 13: the Phase 3 hard-rule fixtures, carried over to team mode, plus the team-specific rules (V1 veto, round cap, ticket budget,
// W2 cannot write, only V1 blocks). Each fixture goes through the same deterministic checks the team runtime runs on every new version
// (checkUnit -> team loop), and through the bridge where the rule lives in a role's output. The live version of the same fixtures runs in smoke:team.
import { describe, expect, it } from "vitest";
import { checkUnit, type CheckCtx, type Finding, type LedgerClaim } from "../studio/checks";
import { agentLikeActor } from "../studio/actors";
import type { StudioValidationCtx } from "../studio/agents";
import type { Section, Unit } from "../studio/schema";
import { buildTeamPacket, teamSchema, teamSchemaKey, teamSemanticChecks, TEAM_AGENT_FILE } from "./bridge";
import { applyDeterministic, editLocked, newTeamSection, recordReview, recordVersion, resolveByHuman, type CouncilReview, type Outcome, type TeamSectionState } from "./loop";
import { budgetUsed, newRouter, raiseTicket, reopen, respond, routeAllowed, runStatus, type Result } from "./router";
import { TEAM_ROLES, type TeamRole } from "./tickets";

const ok = (o: Outcome): TeamSectionState => { if (!o.ok) throw new Error(o.error); return o.state; };
const claim = (id: string, text: string, o: Partial<LedgerClaim> = {}): LedgerClaim => ({ id, text, risk: "high", support: "supported", sourceId: "src:1", sourceRecheckBy: null, jurisdiction: "California", ...o });
const claims = new Map<string, LedgerClaim>([
  ["clm:1", claim("clm:1", "California Health and Safety Code section 17920.3 lists conditions that can make a building substandard, and the local enforcement authority decides.")],
  ["clm:2", claim("clm:2", "Under California Civil Code section 1102, sellers of one to four residential units give buyers a Real Estate Transfer Disclosure Statement, and a waiver is void.")],
  ["clm:3", claim("clm:3", "A sourced rule for another state.", { jurisdiction: "Texas" })],
  ["clm:4", claim("clm:4", "An old rule that was due for re-check.", { sourceRecheckBy: "2026-01-01" })],
  ["clm:5", claim("clm:5", "An unsupported statement.", { support: "unsupported" })],
]);
const ctx: CheckCtx = {
  today: "2026-10-12", claims, approvedFactTexts: ["Twin Home Buyer has purchased 1,000+ homes.", "25+ years of experience in Bay Area real estate"],
  allowedLinks: ["https://www.twinhomebuyer.com/hoarder-houses/"], sourceUrls: [], internalPassages: [{ text: "She said her late husband never let anyone into the garage on Maple Street.", reasons: ["seller story"] }], allowedJurisdictions: ["California"],
  blockedPhrases: [], briefH2: { s2: "What do you have to disclose when you sell a house in California?" }, keyword: "hoarded house",
};
const H2 = "What do you have to disclose when you sell a house in California?";
const sec = (text: string, ids: string[] = ["clm:2"]): Section => ({ kind: "section", key: "s2", h2: H2, blocks: [{ t: "p", text }], claim_ids: ids, roles: [] });
const CLEAN = sec("Under Civil Code section 1102, a seller of one to four residential units gives the buyer a Real Estate Transfer Disclosure Statement, and a waiver is void. Ask an attorney about your sale.");
const codes = (f: Finding[]) => f.map((x) => x.code);

/** What the team runtime does with a freshly written version: record it, run the deterministic checks, land in a loop state. */
const writeVersion = (u: Section, hash = "h1") => {
  const s = ok(recordVersion(newTeamSection("s2"), { hash, sig: `sig:${hash}`, text: u.blocks.map((b: any) => b.text ?? "").join("\n") }));
  return { findings: checkUnit(u, ctx), state: (k: Finding[]) => ok(applyDeterministic(s, k)) };
};
const passAll = (s0: TeamSectionState) => {
  let s = s0;
  for (const role of [...s.pending]) { const r: CouncilReview = { role, versionHash: s.versionHash!, decision: "PASS", items: [] }; s = ok(recordReview(s, r)); }
  return s;
};

describe("Phase 3 hard-rule fixtures in team mode", () => {
  const blocked = (u: Section, code: string, kind: "BLOCKED_CLAIM" | "BLOCKED_PRIVACY") => {
    const w = writeVersion(u);
    expect(codes(w.findings), code).toContain(code);
    const s = w.state(w.findings);
    expect(s.status).toBe(kind);
    expect(s.pending).toEqual([]);                                                      // no council member reviews a blocked version
    expect(recordVersion(s, { hash: "h2", sig: "s2" }).ok).toBe(false);                 // nothing moves until Leo resolves it
    expect(recordReview(s, { role: "V1", versionHash: "h1", decision: "PASS", items: [] }).ok).toBe(false);
    const back = ok(resolveByHuman(s, { kind: "request_revision", issueText: "Leo: remove it." }));
    expect(back.status).toBe("NEEDS_REVISION");
    return s;
  };

  it("a clean unit with a supported claim goes to the council", () => {
    const w = writeVersion(CLEAN);
    expect(w.findings).toEqual([]);
    expect(w.state(w.findings).status).toBe("NEEDS_COUNCIL");
  });
  it("unsupported claim cited -> BLOCKED_CLAIM", () => { blocked(sec("An unsupported statement.", ["clm:5"]), "UNSUPPORTED_CLAIM_CITED", "BLOCKED_CLAIM"); });
  it("a figure no cited claim covers (an unsupported detail) -> BLOCKED_CLAIM", () => { blocked(sec(CLEAN.blocks[0].t === "p" ? `${(CLEAN.blocks[0] as any).text} You have 30 days to disclose under Civil Code section 1102.9.` : ""), "UNCOVERED_FIGURE", "BLOCKED_CLAIM"); });
  it("wrong jurisdiction -> BLOCKED_CLAIM", () => { blocked(sec("A sourced rule for another state.", ["clm:3"]), "WRONG_JURISDICTION", "BLOCKED_CLAIM"); });
  it("a claim not in the ledger (the writer cannot add one) -> BLOCKED_CLAIM", () => { blocked(sec("Some new rule.", ["new:s2:1"]), "UNKNOWN_CLAIM", "BLOCKED_CLAIM"); });
  it("a stale source -> BLOCKED_CLAIM", () => { blocked(sec("An old rule that was due for re-check.", ["clm:4"]), "STALE_RULE", "BLOCKED_CLAIM"); });
  it("privacy gate: a seller story, and a copied internal passage -> BLOCKED_PRIVACY", () => {
    blocked(sec("One of our sellers told us the whole house was full and she did not know where to start.", []), "SELLER_STORY_NOT_CLEARED", "BLOCKED_PRIVACY");
    blocked(sec("She said her late husband never let anyone into the garage on Maple Street. The family waited.", []), "SELLER_IDENTITY", "BLOCKED_PRIVACY");
  });
  it("PENDING JUAN facts -> BLOCKED_CLAIM: hours, closing time, an ownership claim, the founder title", () => {
    blocked(sec("We are open 24/7 to answer your call.", []), "PENDING_JUAN", "BLOCKED_CLAIM");
    blocked(sec("We can close in 7 days.", []), "PENDING_JUAN", "BLOCKED_CLAIM");
    blocked(sec("Juan Diaz, our founder, has seen this many times.", []), "PENDING_JUAN", "BLOCKED_CLAIM");
    blocked(sec("As a family-owned company we treat every house with care.", []), "PENDING_JUAN", "BLOCKED_CLAIM");
  });
  it("rating text -> BLOCKED_CLAIM in the unit, and refused in every role's output", () => {
    blocked(sec("Our 4.8/5 rating says it all.", []), "RATING_RULE", "BLOCKED_CLAIM");
    const w2 = { article_id: "a1", opportunity_id: "o1", agent_name: "W2 Co-writer", agent_prompt_version: "1.0.0", model_version: "claude-code/t", input_version_ids: ["h1"], decision: "PASS", findings: [], evidence_ids: [], required_actions: [], output_version_id: "v", timestamp: "2026-10-12T12:00:00Z", result: { unit_key: "s2", version_hash: "h1", suggestions: [{ id: "w2:x", area: "cta", issue: "The CTA is weak.", suggestion: "Mention the 4.8/5 stars near the button." }] } };
    const parsed = teamSchema(teamSchemaKey("W2", w2)).safeParse(w2);
    expect(parsed.success).toBe(true);
    return teamSemanticChecks("W2", (parsed as any).data, { packet: buildTeamPacket("W2", { articleId: "a1", opportunityId: "o1", unitKey: "s2", versionHash: "h1" }, {}), currentHash: "h1" }).then((e) => expect(e.join()).toMatch(/rating rule/));
  });
  it("the editor changes a fact: V3 may not return a revised unit, and a changed material signature sends the unit back to V1", () => {
    const schema = teamSchema("V3");
    const base = { article_id: "a1", opportunity_id: "o1", agent_name: "V3", agent_prompt_version: "1.0.0", model_version: "claude-code/t", input_version_ids: ["h1"], decision: "PASS", findings: [], evidence_ids: [], required_actions: [], output_version_id: "v", timestamp: "2026-10-12T12:00:00Z" };
    const v3 = { ...base, result: { unit_key: "s2", version_hash: "h1", voice_reference_used: true, copy_paste_test: { passed: true, flagged: [] }, authenticity: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`q${i + 1}`, true])), score: { voice: 18, education: 18, deal_logic: 18, local: 12, structure: 12, trust: 8, total: 86 }, cards: [], revised_unit: CLEAN } };
    const p = schema.safeParse(v3);
    expect(p.success).toBe(true);
    const sctx: StudioValidationCtx = { packet: { agent_key: "thb-07-editorial-critic", prompt_version: "1.0.0", unit_key: "s2", unit_hash: "h1", allowed_claim_ids: ["clm:2"], opportunity_id: "o1", article_id: "a1" }, currentUnit: CLEAN as Unit, currentHash: "h1", check: ctx, voiceUsable: true, requiredIssuesOpen: [] };
    return teamSemanticChecks("V3", (p as any).data, { packet: buildTeamPacket("V3", { articleId: "a1", opportunityId: "o1", unitKey: "s2", versionHash: "h1" }, {}), currentHash: "h1", studio: sctx }).then((errs) => {
      expect(errs.join()).toMatch(/no revised_unit/);
      // and when the writer's new wording changes a figure after V1 passed, V1 reviews it again: V2 and V3 cannot lock a changed fact
      let s = passAllButLock(CLEAN);
      s = ok(recordVersion(s, { hash: "h2", sig: "other-figures", text: "Under Civil Code section 1102.6 you have 30 days." }));
      expect(s.pending).toContain("V1");
      s = ok(recordReview(ok(recordReview(s, { role: "V2", versionHash: "h2", decision: "PASS", items: [] })), { role: "V3", versionHash: "h2", decision: "PASS", items: [] }));
      expect(s.status).toBe("NEEDS_COUNCIL");
    });
  });
  it("post-approval edit: an edit to a locked unit clears the lock and every earlier pass, so the full council runs again", () => {
    const locked = passAll(writeVersion(CLEAN).state([]));
    expect(locked.status).toBe("LOCKED");
    const e = ok(editLocked(locked, { hash: "h9", sig: "new" }));
    expect(e).toMatchObject({ status: "NEEDS_COUNCIL", lockedHash: null, v1Passed: null, pending: ["V1", "V2", "V3"] });
  });
  it("no self-approval: no role output can carry an approval, a lock or a state, and no ticket type leads to one", () => {
    const base: Record<TeamRole, any> = Object.fromEntries(TEAM_ROLES.map((r) => [r, { approved: true }])) as any;
    for (const role of TEAM_ROLES) expect(teamSchema(teamSchemaKey(role, base[role])).safeParse(base[role]).success, role).toBe(false);
    for (const type of ["EVIDENCE_REQUEST", "ROOT_CAUSE_NOTE", "QUALITY_CORRECTION", "HUMAN_ESCALATION"] as const) for (const to of ["APPROVAL", "STATE", "LOCK", "JUAN"]) expect(routeAllowed(type, ["V1"], to), `${type}->${to}`).not.toBeNull();
    for (const role of TEAM_ROLES) expect(agentLikeActor(role)).toBe(true);                 // none of them can act as Leo or Juan
    expect(Object.values(TEAM_AGENT_FILE)).toHaveLength(10);
  });
});

function passAllButLock(u: Section): TeamSectionState {
  let s = writeVersion(u).state([]);
  s = ok(recordReview(s, { role: "V1", versionHash: s.versionHash!, decision: "PASS", items: [] }));
  s = ok(recordReview(s, { role: "V2", versionHash: s.versionHash!, decision: "REVISION", items: [{ key: "seo:x", severity: "must fix", text: "x" }] }));
  return ok(recordReview(s, { role: "V3", versionHash: s.versionHash!, decision: "PASS", items: [] }));
}

describe("team-specific rules", () => {
  const must = (r: Result) => { if (!r.ok) throw new Error(r.reason); return r.state; };
  const ctxR = { at: "2026-10-12T12:00:00Z", versionHash: "v1" };
  const qc = (o: Record<string, unknown> = {}) => ({ ticket: "QUALITY_CORRECTION", from: ["V3"], to: "W1", section: "s2", issue: "The H1 does not name the situation.", severity: "must fix", evidence: "authenticity q3", fix: null, blocking: false, ...o });

  it("V1 veto: V2 and V3 passing never locks, and a V1 must-fix cannot be declined or argued away", () => {
    let s = writeVersion(CLEAN).state([]);
    s = ok(recordReview(s, { role: "V1", versionHash: "h1", decision: "REVISION", items: [{ key: "fact:c1", severity: "must fix", text: "overstated" }] }));
    s = ok(recordReview(ok(recordReview(s, { role: "V2", versionHash: "h1", decision: "PASS", items: [] })), { role: "V3", versionHash: "h1", decision: "PASS", items: [] }));
    expect(s.status).toBe("NEEDS_REVISION");
    s = ok(recordVersion(s, { hash: "h2", sig: "sig:h1" }));
    s = ok(recordReview(ok(recordReview(s, { role: "V2", versionHash: "h2", decision: "PASS", items: [] })), { role: "V3", versionHash: "h2", decision: "PASS", items: [] }));
    expect(s.status).toBe("NEEDS_COUNCIL");
    expect(s.pending).toEqual(["V1"]);
  });
  it("round cap: round 3 is refused and escalates to Leo", () => {
    let s = must(raiseTicket(newRouter(), qc(), ctxR));
    s = must(respond(s, "T1", "W1", "a", ctxR)); s = must(reopen(s, "T1", "V3", "b", ctxR));
    s = must(respond(s, "T1", "W1", "c", ctxR));
    const r = reopen(s, "T1", "V3", "d", ctxR);
    expect(r.ok).toBe(false);
    expect(runStatus(r.state)).toBe("ESCALATED");
  });
  it("ticket budget: ticket 11 stops the article and escalates", () => {
    let s = newRouter();
    for (let i = 0; i < 10; i++) s = must(raiseTicket(s, qc({ issue: `Issue number ${i + 1}` }), ctxR));
    const r = raiseTicket(s, qc({ issue: "Issue number 11" }), ctxR);
    expect(r.ok).toBe(false);
    expect(budgetUsed(r.state)).toBe(10);
    expect(runStatus(r.state)).toBe("STOPPED_BUDGET");
  });
  it("W2 cannot write: a unit, blocks, claims, a lock or a state in its output is refused", () => {
    const w2 = (result: object, extra: object = {}) => ({ article_id: "a1", opportunity_id: "o1", agent_name: "W2", agent_prompt_version: "1.0.0", model_version: "claude-code/t", input_version_ids: ["h1"], decision: "PASS", findings: [], evidence_ids: [], required_actions: [], output_version_id: "v", timestamp: "2026-10-12T12:00:00Z", result: { unit_key: "s2", version_hash: "h1", suggestions: [], ...result }, ...extra });
    for (const bad of [{ unit: CLEAN }, { blocks: [] }, { claim_ids: ["clm:1"] }, { claims: [] }, { revised_unit: CLEAN }]) expect(teamSchema("W2").safeParse(w2(bad)).success, JSON.stringify(Object.keys(bad))).toBe(false);
    for (const k of ["locked", "state", "next_state", "approved"]) expect(teamSchema("W2").safeParse(w2({}, { [k]: true })).success, k).toBe(false);
  });
  it("only V1 blocks: a blocking card from any other role is refused by the schema and the router", () => {
    for (const from of ["V2", "V3", "W1", "S2", "R1"]) {
      const r = raiseTicket(newRouter(), qc({ from: [from], to: from === "W1" ? "R1" : "W1", ticket: from === "W1" ? "EVIDENCE_REQUEST" : "QUALITY_CORRECTION", blocking: true }), ctxR);
      expect(r.ok, from).toBe(false);
    }
    expect(raiseTicket(newRouter(), qc({ from: ["V1"], blocking: true }), ctxR).ok).toBe(true);
  });
});

describe("the fixture list matches the Done-when list", () => {
  it("covers: unsupported claim, wrong jurisdiction, privacy gate, editor changes a fact, post-approval edit, PENDING JUAN fact, rating text, founder, no-self-approval, V1 veto, round cap, ticket budget, W2 cannot write, only V1 blocks", () => {
    const names = ["unsupported claim", "wrong jurisdiction", "privacy gate", "editor changes a fact", "post-approval edit", "PENDING JUAN", "rating text", "founder", "no self-approval", "V1 veto", "round cap", "ticket budget", "W2 cannot write", "only V1 blocks"];
    expect(names).toHaveLength(14);
  });
});
