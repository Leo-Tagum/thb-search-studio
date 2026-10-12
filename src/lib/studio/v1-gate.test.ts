import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyDeterministic, applyReview, editLocked, editorRevision, gateOnly, isV1FixPass, newSection, recordVersion, reopen, resolveByHuman, reviewerFor, type HedgeVerdict, type Outcome, type SectionState } from "./loop";
import { citedSentences, fixChurn, splitSentences } from "./v1-gate";
import { hedgeFlagsInText, checkUnit, type CheckCtx, type LedgerClaim } from "./checks";
import { studioSemanticChecks, studioOutputSchemas, type StudioValidationCtx } from "./agents";
import { buildTeamPacket, teamSchema, teamSemanticChecks } from "../team/bridge";

const ok = (o: Outcome): SectionState => { if (!o.ok) throw new Error(o.error); return o.state; };
const err = (o: Outcome): string => (o.ok ? "" : o.error);
const T1 = "Ask a probate attorney who can sign. Most owners want to know how fast the house can be emptied. A cleanout takes planning.";
const sig = "sigA";

const written = (hash = "h1", text = T1, s = newSection("s1")) => ok(applyDeterministic(ok(recordVersion(s, { hash, sig, text })), []));
const rule = (s: SectionState, ruling: "proven" | "reword" | "drop", note = "clm:1 supports this"): HedgeVerdict[] => (s.hedges ?? []).filter((h) => h.ruling !== "proven").map((h) => ({ key: h.key, ruling, note }));
const v1 = (s: SectionState, decision: "PASS" | "REVISION" | "BLOCKED", o: { issues?: { key: string; text: string }[]; rulings?: HedgeVerdict[] | null; blockKind?: "BLOCKED_CLAIM" | "BLOCKED_PRIVACY" } = {}) =>
  // rulings: undefined = V1 rules every flagged sentence proven (so a test about something else is not about hedges); null = V1 rules none
  applyReview(s, { agent: "V1", versionHash: s.versionHash!, decision, issues: o.issues ?? [], hedgeRulings: o.rulings === null ? [] : (o.rulings ?? rule(s, "proven")), blockKind: o.blockKind });
const v1Pass = (s: SectionState) => ok(v1(s, "PASS", { rulings: rule(s, "proven") }));
const a6 = (s: SectionState) => ok(applyReview(s, { agent: 6, versionHash: s.versionHash!, decision: "PASS", issues: [] }));
const a7 = (s: SectionState) => ok(applyReview(s, { agent: 7, versionHash: s.versionHash!, decision: "PASS", issues: [] }));

describe("V1 gate: the lock needs a V1 PASS on the exact content", () => {
  it("write -> V1 -> SEO -> editorial -> lock", () => {
    let s = written();
    expect(s.status).toBe("NEEDS_FACT");
    expect(reviewerFor(s)).toBe("V1");
    s = v1Pass(s);
    expect(s.status).toBe("NEEDS_SEO");
    s = a7(a6(s));
    expect(s.status).toBe("LOCKED");
    expect(s.lockedHash).toBe("h1");
    expect(s.v1Passed?.hash).toBe("h1");
  });
  it("Agent 5 can no longer review a section under the gate", () => {
    const s = written();
    expect(err(applyReview(s, { agent: 5, versionHash: "h1", decision: "PASS", issues: [] }))).toMatch(/cannot review.*V1 gate/);
  });
  it("a section saved before the gate (no gate field) is still reviewed by Agent 5 and refuses V1", () => {
    const legacy: SectionState = { ...newSection("s1"), gate: undefined };
    const s = ok(recordVersion(legacy, { hash: "h1", sig }));                 // no text supplied: the earlier flow
    expect(s.status).toBe("NEEDS_FACT");
    expect(reviewerFor(s)).toBe(5);
    expect(err(v1(s, "PASS"))).toMatch(/cannot review/);
  });
  it("the editorial pass cannot lock text V1 has not passed: it goes back to V1", () => {
    let s = v1Pass(written());
    s = a6(s);
    const tampered: SectionState = { ...s, v1Passed: { hash: "other", sig, sentences: null } };
    const o = ok(applyReview(tampered, { agent: 7, versionHash: "h1", decision: "PASS", issues: [] }));
    expect(o.status).toBe("NEEDS_FACT");
    expect(o.status).not.toBe("LOCKED");
  });
  it("V1 BLOCKED stops the section", () => {
    const s = ok(v1(written(), "BLOCKED", { issues: [{ key: "priv:x", text: "identifies a seller" }], blockKind: "BLOCKED_PRIVACY" }));
    expect(s.status).toBe("BLOCKED_PRIVACY");
  });
});

describe("V1 gate: hedge sentences need an explicit ruling", () => {
  it("a review that leaves a flagged sentence unruled is refused; proven needs its evidence; a PASS cannot carry reword or drop", () => {
    const s = written();
    expect(s.hedges).toHaveLength(1);
    expect(err(v1(s, "PASS", { rulings: null }))).toMatch(/must rule/);
    expect(err(v1(s, "PASS", { rulings: rule(s, "proven", "") }))).toMatch(/needs the evidence/);
    expect(err(v1(s, "PASS", { rulings: rule(s, "drop") }))).toMatch(/cannot carry required issues/);
    expect(err(v1(s, "PASS", { rulings: [{ key: "hedge:ffffffffffff", ruling: "proven", note: "clm:1 supports" }] }))).toMatch(/not a flagged sentence/);
  });
  it("a reword or drop ruling becomes a required issue, and an unchanged flagged sentence is flagged again on the next version", () => {
    let s = ok(v1(written(), "REVISION", { rulings: rule(written(), "reword", "say what the evidence supports") }));
    expect(s.status).toBe("NEEDS_REVISION");
    expect(s.issues.some((i) => /unsourced generalization \(most owners\)/.test(i.text))).toBe(true);
    s = ok(applyDeterministic(ok(recordVersion(s, { hash: "h2", sig, text: T1 + " Ask your title company about liens." })), []));
    expect(s.hedges!.filter((h) => h.ruling !== "proven")).toHaveLength(1);     // the sentence is still there, so V1 must rule on it again
  });
  it("a sentence V1 ruled proven keeps its ruling while its words are unchanged", () => {
    let s = v1Pass(written());
    s = ok(applyReview(s, { agent: 6, versionHash: "h1", decision: "REVISION", issues: [{ key: "seo:x", text: "Add the direct answer first." }] }));
    s = ok(applyDeterministic(ok(recordVersion(s, { hash: "h2", sig, text: "Direct answer first. " + T1 })), []));
    expect(s.hedges!.every((h) => h.ruling === "proven")).toBe(true);
    expect(s.v1Scope).toEqual({ kind: "changed", sentences: ["Direct answer first."] });
  });
});

describe("V1 gate: changed-sentence scope, the fix pass and the round limit", () => {
  it("after a REVISION the writer's version goes back to V1 with the changed sentences and the cited ones still present", () => {
    let s = ok(v1(written(), "REVISION", { issues: [{ key: "fact:authority", text: 'The sentence "A cleanout takes planning." says more than the ledger supports.' }] }));
    expect(s.fixCited).toEqual(["A cleanout takes planning."]);
    expect(isV1FixPass(s)).toBe(true);
    s = ok(applyDeterministic(ok(recordVersion(s, { hash: "h2", sig, text: T1.replace("A cleanout takes planning.", "A cleanout needs a plan.") })), []));
    expect(s.status).toBe("NEEDS_FACT");
    expect(s.v1Scope).toEqual({ kind: "changed", sentences: ["A cleanout needs a plan."] });
  });
  it("two fix attempts, then escalation to Leo; a reworded sentence (new key each time) cannot loop forever", () => {
    let s = written();
    const texts = ["Ask a probate attorney who can sign. Most owners care about speed. A cleanout takes planning.", "Ask a probate attorney who can sign. Most owners know speed matters. A cleanout takes planning."];
    for (let i = 0; i < 3; i++) {
      s = ok(v1(s, "REVISION", { rulings: rule(s, "reword", "unsupported") }));
      if (i < 2) { expect(s.status).toBe("NEEDS_REVISION"); s = ok(applyDeterministic(ok(recordVersion(s, { hash: `h${i + 2}`, sig, text: texts[i] })), [])); }
    }
    expect(s.status).toBe("ESCALATED");
    expect(s.escalation?.reason).toMatch(/after 2 fix attempts/);
    expect(s.v1Rounds).toBe(3);
  });
  it("the counters are per unit: one unit escalating does not touch another", () => {
    const a = written("h1", T1, newSection("s1")), b = written("h1", T1, newSection("s2"));
    const a2 = ok(v1(a, "REVISION", { rulings: rule(a, "drop") }));
    expect(a2.v1Rounds).toBe(1);
    expect(b.v1Rounds).toBe(0);
  });
  it("Leo's resolution restarts the cycle", () => {
    let s = written();
    for (let i = 0; i < 3; i++) { s = ok(v1(s, "REVISION", { issues: [{ key: "fact:same", text: "Still unsupported." }] })); if (i < 2) s = ok(applyDeterministic(ok(recordVersion(s, { hash: `h${i + 2}`, sig, text: T1 + " ".repeat(i + 1) + "More." })), [])); }
    expect(s.status).toBe("ESCALATED");
    s = ok(resolveByHuman(s, { kind: "request_revision", issueText: "Leo: remove the claim." }));
    expect(s.status).toBe("NEEDS_REVISION");
    expect(s.v1Rounds).toBe(0);
  });
  it("V1 PASS clears the cycle", () => {
    let s = ok(v1(written(), "REVISION", { issues: [{ key: "fact:x", text: "Fix this." }] }));
    s = ok(applyDeterministic(ok(recordVersion(s, { hash: "h2", sig, text: T1 + " Changed." })), []));
    s = v1Pass(s);
    expect(s.v1Rounds).toBe(0);
    expect(s.fixCited).toEqual([]);
  });
});

describe("V1 gate: what goes back through V1, and what the churn check applies to", () => {
  it("only the writer's V1-fix pass is a fix pass: Agent 6 revisions, Agent 7 revisions, reopens and human edits are not", () => {
    const passed = v1Pass(written());
    const a6rev = ok(applyReview(passed, { agent: 6, versionHash: "h1", decision: "REVISION", issues: [{ key: "seo:x", text: "Add the direct answer." }] }));
    expect(isV1FixPass(a6rev)).toBe(false);
    expect(isV1FixPass(ok(reopen(a7(a6(passed)), "Leo: tighten the opening.")))).toBe(false);
    expect(isV1FixPass(ok(v1(written(), "REVISION", { issues: [{ key: "fact:x", text: "Fix." }] })))).toBe(true);
    expect(isV1FixPass(ok(v1(written(), "REVISION", { issues: [{ key: "fact:x", text: "Fix." }] })).status === "NEEDS_REVISION" ? { ...ok(v1(written(), "REVISION", { issues: [{ key: "fact:x", text: "Fix." }] })), issues: [{ key: "det:LINK_NOT_ALLOWED", stage: "fact", text: "x", attempts: 0 }] } : written())).toBe(false);
  });
  it("an Agent 7 revision goes back to V1 for the changed sentences (never flagged as churn, never skipping V1)", () => {
    let s = a6(v1Pass(written()));
    s = ok(editorRevision(s, { hash: "h2", sig, text: T1.replace("Ask a probate attorney who can sign.", "Ask a probate attorney who can sign for the estate.") }));
    expect(s.status).toBe("NEEDS_FACT");
    expect(reviewerFor(s)).toBe("V1");
    expect(s.v1Scope).toEqual({ kind: "changed", sentences: ["Ask a probate attorney who can sign for the estate."] });
    expect(s.v1Passed).toBeNull();
  });
  it("a human reopen goes back to the writer and then through V1; a human edit of a locked section goes through V1 in full", () => {
    const locked = a7(a6(v1Pass(written())));
    const r = ok(reopen(locked, "Leo: tighten the opening."));
    expect(r.status).toBe("NEEDS_REVISION");
    expect(r.gate).toBe("v1");
    const after = ok(applyDeterministic(ok(recordVersion(r, { hash: "h2", sig, text: T1 + " Added." })), []));
    expect(after.status).toBe("NEEDS_FACT");
    const e = ok(editLocked(locked, { hash: "h3", sig: "sigB", text: "Brand new text." }));
    expect(e.status).toBe("NEEDS_FACT");
    expect(e.v1Scope).toEqual({ kind: "full" });
    expect(e.v1Passed).toBeNull();
  });
  it("gate-only: a locked section is sent through V1 without a text change; identical text keeps the SEO and editorial passes", () => {
    const locked = a7(a6(v1Pass(written())));
    const legacyLocked: SectionState = { ...locked, gate: undefined, v1Passed: null, v1Reviewed: null, seoPassedHash: null, edPassedHash: null, sentences: null, hedges: [] };
    let g = ok(gateOnly(legacyLocked, { text: T1 }));
    expect(g.status).toBe("NEEDS_FACT");
    expect(g.gate).toBe("v1");
    expect(g.lockedHash).toBeNull();
    g = v1Pass(g);
    expect(g.status).toBe("LOCKED");                                           // V1 passed the identical text: Agents 6 and 7 do not repeat
    expect(g.lockedHash).toBe("h1");
  });
  it("gate-only with a V1 REVISION runs the fix loop, then SEO and editorial run on the new text", () => {
    const legacyLocked: SectionState = { ...a7(a6(v1Pass(written()))), gate: undefined, v1Passed: null, seoPassedHash: null, edPassedHash: null };
    let g = ok(gateOnly(legacyLocked, { text: T1 }));
    g = ok(v1(g, "REVISION", { rulings: rule(g, "reword", "unsupported") }));
    expect(g.status).toBe("NEEDS_REVISION");
    g = ok(applyDeterministic(ok(recordVersion(g, { hash: "h2", sig, text: T1.replace("Most owners want", "Many owners ask") })), []));
    g = v1Pass(g);
    expect(g.status).toBe("NEEDS_SEO");                                        // new text: Agents 6 and 7 review it
  });
});

describe("V1 gate: helpers", () => {
  const S = splitSentences(T1);
  it("cited sentences: a hedge sentence by key, other sentences by the passage the item quotes", () => {
    expect(citedSentences(S, [], ["Most owners want to know how fast the house can be emptied."])).toEqual(["Most owners want to know how fast the house can be emptied."]);
    expect(citedSentences(S, ['"A cleanout takes planning." is not in the ledger'])).toEqual(["A cleanout takes planning."]);
    expect(citedSentences(S, ["something vague with no quote"])).toEqual([]);
  });
  it("the churn check: only cited sentences may change", () => {
    const cited = ["A cleanout takes planning."];
    expect(fixChurn(S, S.map((x) => (x === cited[0] ? "A cleanout needs a plan." : x)), cited)).toBeNull();
    expect(fixChurn(S, S.map((x) => (x.startsWith("Ask") ? "Ask an attorney." : x === cited[0] ? "A cleanout needs a plan." : x)), cited)?.detail).toMatch(/did not cite/);
    expect(fixChurn(S, [...S.filter((x) => x !== cited[0]), "One.", "Two.", "Three.", "Four."], cited)?.detail).toMatch(/added/);
    expect(fixChurn(null, S, cited)).toBeNull();                                  // no sentence data: V1 still reviews the version
  });
});

// ---------- Agent 5's checks, and where each is covered after the change (any uncovered check is a failing test) ----------
describe("Agent 5 audit: every check it performed is covered by V1 (rules and code) or checks.ts", () => {
  const rulesOf = (f: string) => { const t = readFileSync(`.claude/agents/${f}.md`, "utf8").replace(/\r\n/g, "\n"); return t.slice(t.indexOf("## Rules"), t.indexOf("## Output")).trim(); };
  it("V1's rules 1-9 are Agent 5's rules, word for word", () => {
    expect(rulesOf("thb-v1-fact-privacy")).toBe(rulesOf("thb-05-fact-privacy-auditor"));
  });

  const claims = new Map<string, LedgerClaim>([["clm:1", { id: "clm:1", text: "Civil Code section 1102 applies to a transfer by sale.", risk: "high", support: "supported", sourceId: "src", sourceRecheckBy: null, jurisdiction: "California" }]]);
  const check: CheckCtx = { today: "2026-10-12", claims, approvedFactTexts: [], allowedLinks: [], sourceUrls: [], internalPassages: [], allowedJurisdictions: ["California"], blockedPhrases: [], briefH2: { s2: "What do you have to disclose?" }, keyword: "x" };
  const good = { kind: "section", key: "s2", h2: "What do you have to disclose?", blocks: [{ t: "p", text: "Civil Code section 1102 applies to a transfer by sale. Ask an attorney." }], claim_ids: ["clm:1"], roles: [] };
  const studio = (unit: object, o: Partial<StudioValidationCtx> = {}): StudioValidationCtx => ({ packet: { agent_key: "thb-05-fact-privacy-auditor", prompt_version: "1.0.0", unit_key: "s2", unit_hash: "h1", allowed_claim_ids: ["clm:1"], opportunity_id: "o1", article_id: "a1" }, currentUnit: unit as never, currentHash: "h1", check, voiceUsable: true, requiredIssuesOpen: [], ...o });
  const result = (o: Record<string, unknown> = {}) => ({ unit_key: "s2", version_hash: "h1", claim_checks: [{ claim_id: "clm:1", verdict: "supported_as_written", note: "ok" }], privacy_ok: true, legal_qualification_ok: true, ...o });
  const envelope = (decision: string, res: object, version: string, findings: object[] = []) => ({ article_id: "a1", opportunity_id: "o1", agent_name: "x", agent_prompt_version: version, model_version: "claude-code/test", input_version_ids: ["h1"], decision, findings, evidence_ids: [], required_actions: [], output_version_id: "v1", timestamp: "2026-10-12T12:00:00Z", result: res });
  const req = (key: string) => ({ issue_key: key, severity: "required", note: "exact words and why", claim_id: null });

  type Case = { name: string; covers: string; unit?: object; decision: string; res: Record<string, unknown>; findings?: object[]; ctx?: Partial<StudioValidationCtx> };
  const CASES: Case[] = [
    { name: "claim_checks must cover every cited claim", covers: "rule 1: V1 file rule 1 + shared semantic check", decision: "PASS", res: { claim_checks: [] } },
    { name: "claim_checks may not name a claim the unit does not cite", covers: "rule 1", decision: "PASS", res: { claim_checks: [{ claim_id: "clm:1", verdict: "supported_as_written", note: "ok" }, { claim_id: "clm:9", verdict: "supported_as_written", note: "ok" }] } },
    { name: "PASS refused when a claim is overstated", covers: "rule 1 / 6", decision: "PASS", res: { claim_checks: [{ claim_id: "clm:1", verdict: "overstated", note: "may became must" }] } },
    { name: "PASS refused when legal qualification is not ok", covers: "rule 3: legal_qualification_ok", decision: "PASS", res: { legal_qualification_ok: false } },
    { name: "PASS refused when privacy is not ok", covers: "rule 4: privacy_ok", decision: "PASS", res: { privacy_ok: false } },
    { name: "PASS refused with a required finding", covers: "rule 6", decision: "PASS", res: {}, findings: [req("fact:x")] },
    { name: "PASS refused when a deterministic check finds a blocking problem the reviewer missed (uncovered figure)", covers: "rule 2/7: checks.ts UNCOVERED_FIGURE", unit: { ...good, blocks: [{ t: "p", text: "Civil Code section 1102 applies to a transfer by sale. The fee is $4,500." }] }, decision: "PASS", res: {} },
    { name: "PASS refused when a deterministic check finds a seller story", covers: "rule 4/7: checks.ts SELLER_STORY_NOT_CLEARED", unit: { ...good, blocks: [{ t: "p", text: "Civil Code section 1102 applies to a transfer by sale. One of our sellers told us a story." }] }, decision: "PASS", res: {} },
    { name: "PASS refused for a pending brand fact", covers: "rule 5/7: checks.ts PENDING_JUAN", unit: { ...good, blocks: [{ t: "p", text: "Civil Code section 1102 applies to a transfer by sale. Our founder runs the company." }] }, decision: "PASS", res: {} },
    { name: "REVISION needs a required finding", covers: "rule 6", decision: "REVISION", res: {} },
    { name: "BLOCKED needs a block_kind", covers: "rule 6", decision: "BLOCKED", res: {}, findings: [req("fact:x")] },
    { name: "a review of a different version is refused", covers: "version check", decision: "PASS", res: { version_hash: "other" } },
  ];

  for (const c of CASES) {
    it(`${c.name} (${c.covers})`, async () => {
      const sc = studio(c.unit ?? good, c.ctx);
      const a5out = envelope(c.decision, result(c.res), "1.0.0", c.findings);
      const p5 = studioOutputSchemas["thb-05-fact-privacy-auditor"].safeParse(a5out);
      expect(p5.success).toBe(true);
      const e5 = studioSemanticChecks("thb-05-fact-privacy-auditor", (p5 as unknown as { data: never }).data, sc).filter((e) => !/^agent_prompt_version/.test(e));
      expect(e5.length, "the check must bite on Agent 5").toBeGreaterThan(0);
      // the same output, as V1 submits it (cards and hedge_rulings added), through the classic V1 path (teamSemanticChecks)
      const v1out = envelope(c.decision, { ...result(c.res), cards: [], hedge_rulings: [] }, "1.1.0", c.findings);
      const pv = teamSchema("V1").safeParse(v1out);
      expect(pv.success, JSON.stringify(pv.success ? "" : pv.error.issues)).toBe(true);
      const packet = buildTeamPacket("V1", { articleId: "a1", opportunityId: "o1", unitKey: "s2", versionHash: "h1" }, {});
      const ev1 = await teamSemanticChecks("V1", (pv as unknown as { data: never }).data, { packet, currentHash: "h1", studio: sc, pendingHedgeKeys: [] });
      for (const e of e5) expect(ev1, `V1 must refuse what Agent 5 refused: ${e}`).toContain(e);
    });
  }

  it("a clean output is accepted by both, and the deterministic checks Agent 5 relied on still exist for the code families the fixtures use", () => {
    expect(checkUnit(good as never, check)).toEqual([]);
    const codes = (blocks: { t: string; text: string }[]) => checkUnit({ ...good, blocks } as never, check).map((f) => f.code);
    expect(codes([{ t: "p", text: "Civil Code section 1102 applies to a transfer by sale. The fee is $4,500." }])).toContain("UNCOVERED_FIGURE");
    expect(codes([{ t: "p", text: "Civil Code section 1102 applies to a transfer by sale. One of our sellers told us a story." }])).toContain("SELLER_STORY_NOT_CLEARED");
    expect(codes([{ t: "p", text: "Civil Code section 1102 applies to a transfer by sale. Our founder runs the company." }])).toContain("PENDING_JUAN");
  });
  it("V1's schema is strict and carries Agent 5's required fields: no output can set an approval, a lock or a state", () => {
    const base = envelope("PASS", { ...result(), cards: [], hedge_rulings: [] }, "1.1.0");
    expect(teamSchema("V1").safeParse(base).success).toBe(true);
    for (const k of ["approved", "locked", "state", "next_state"]) expect(teamSchema("V1").safeParse({ ...base, [k]: true }).success, k).toBe(false);
    expect(teamSchema("V1").safeParse({ ...base, result: { ...base.result, approved: true } }).success).toBe(false);
    for (const field of ["claim_checks", "privacy_ok", "legal_qualification_ok"]) { const r: Record<string, unknown> = { ...base.result }; delete r[field]; expect(teamSchema("V1").safeParse({ ...base, result: r }).success, field).toBe(false); }
  });
  it("the hedge flag still flags the generalizations Agent 5 never caught", () => {
    expect(hedgeFlagsInText("Most owners want speed. Getting clear usually creates more options. Nobody looks twice.").map((h) => h.term)).toEqual(["most owners", "usually", "nobody"]);
  });
});
