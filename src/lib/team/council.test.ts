import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { combineFeedback, combinedSetErrors } from "./council";
import { newRouter, raiseTicket } from "./router";
import type { FeedbackCard } from "./tickets";

const card = (from: string, o: Partial<FeedbackCard> & Record<string, unknown> = {}): FeedbackCard => ({
  ticket: "QUALITY_CORRECTION", from: [from], to: "W1", section: "h1", issue: "The H1 does not name the seller situation clearly.", severity: "should fix", evidence: "rule: authenticity q1", fix: null,
  blocking: from === "V1" ? false : false, ...o,
}) as FeedbackCard;
const v1 = (o: Record<string, unknown> = {}) => card("V1", { severity: "must fix", blocking: true, issue: "Claim clm:3 is stated as a flat rule but the source says may.", evidence: "clm:3 text", section: "s2", ...o });

describe("combined feedback set: V1 items are always kept", () => {
  it("keeps every V1 card exactly as raised, including identical-looking ones", () => {
    const a = v1(), b = v1({ issue: "Claim clm:3 is stated as a flat rule but the source says may." }), c = v1({ section: "s4", issue: "Seller identifiable by the town and date.", evidence: "privacy gate" });
    const out = combineFeedback([a, b, c, card("V2", { section: "s2", issue: "The direct answer is missing from the opening sentences.", severity: "must fix" })]);
    for (const x of [a, b, c]) expect(out.toWriter.filter((o) => JSON.stringify(o) === JSON.stringify(x)).length).toBeGreaterThanOrEqual(1);
    expect(out.toWriter.filter((o) => o.from[0] === "V1" && o.from.length === 1)).toHaveLength(3);
    expect(out.toWriter[0].from).toEqual(["V1"]);                                  // V1 first
    expect(out.toWriter.filter((o) => o.blocking)).toHaveLength(3);
    expect(combinedSetErrors([a, b, c], out)).toEqual([]);
  });
  it("never merges a V1 card into a V2/V3 card, and never lets a non-V1 card carry blocking", () => {
    const out = combineFeedback([v1(), card("V2", { section: "s2", issue: "Claim clm:3 is stated as a flat rule but the source says may.", severity: "must fix" })]);
    expect(out.toWriter.filter((o) => o.from.length > 1)).toEqual([]);
    expect(out.toWriter.filter((o) => o.blocking).every((o) => o.from.join() === "V1")).toBe(true);
  });
  it("a V2 card that repeats a stronger-or-equal V1 card is folded into it and listed as absorbed", () => {
    const out = combineFeedback([v1(), card("V2", { section: "s2", issue: "Claim clm:3 is stated as a flat rule but the source says may.", severity: "should fix" })]);
    expect(out.toWriter).toHaveLength(1);
    expect(out.absorbedByV1).toHaveLength(1);
  });
  it("but a V2 must-fix is NOT absorbed by a weaker V1 card: nothing is downgraded", () => {
    const weak = v1({ severity: "should fix", blocking: false });
    const out = combineFeedback([weak, card("V2", { section: "s2", issue: "Claim clm:3 is stated as a flat rule but the source says may.", severity: "must fix" })]);
    expect(out.toWriter).toHaveLength(2);
    expect(out.toWriter.some((o) => o.from.join() === "V2" && o.severity === "must fix")).toBe(true);
    expect(out.absorbedByV1).toEqual([]);
  });
});

describe("combined feedback set: de-duplicates V2/V3 without dropping a must-fix", () => {
  it("the same issue from V2 and V3 becomes one card from both, at the strongest severity", () => {
    const out = combineFeedback([
      card("V2", { key: "seo:h1-situation", issue: "The H1 names the keyword but not the seller situation.", severity: "should fix", evidence: "AEO question match" }),
      card("V3", { key: "seo:h1-situation", issue: "H1 reads like an investor ad and misses the situation.", severity: "must fix", evidence: "copy-paste test" }),
    ]);
    expect(out.toWriter).toHaveLength(1);
    expect(out.toWriter[0]).toMatchObject({ from: ["V2", "V3"], severity: "must fix", blocking: false, to: "W1", section: "h1" });
    expect(out.toWriter[0].evidence).toContain("AEO question match");
    expect(out.toWriter[0].evidence).toContain("copy-paste test");
    expect(out.disagreements).toEqual([expect.objectContaining({ kind: "severity", roles: ["V2", "V3"] })]);
  });
  it("matches the same issue by wording when keys differ, within the same section only", () => {
    const a = card("V2", { issue: "The opening hides the direct answer to the question the heading asks." });
    const b = card("V3", { issue: "Opening hides the direct answer to the question the heading asks." });
    expect(combineFeedback([a, b]).toWriter).toHaveLength(1);
    expect(combineFeedback([a, { ...b, section: "s3" }]).toWriter).toHaveLength(2);
    expect(combineFeedback([a, card("V3", { issue: "The FAQ answers run longer than sixty words and cannot be quoted." })]).toWriter).toHaveLength(2);
  });
  it("different suggested fixes for the same issue are listed as a disagreement, not hidden", () => {
    const out = combineFeedback([card("V2", { key: "x:cta", issue: "The call to action pushes too hard.", fix: "Soften it." }), card("V3", { key: "x:cta", issue: "The call to action pushes too hard.", fix: "Cut it to one line." })]);
    expect(out.toWriter).toHaveLength(1);
    expect(out.disagreements.map((d) => d.kind)).toEqual(["fix"]);
    expect(out.disagreements[0].detail).toContain("Soften it.");
    expect(out.disagreements[0].detail).toContain("Cut it to one line.");
  });
  it("never drops or downgrades a must-fix, over many mixed inputs", () => {
    const input: FeedbackCard[] = [
      card("V2", { section: "s1", issue: "Direct answer is buried under background paragraphs.", severity: "must fix" }),
      card("V3", { section: "s1", issue: "Direct answer is buried under background paragraphs.", severity: "suggestion" }),
      card("V3", { section: "s3", issue: "Generic opening that fits any investor site.", severity: "must fix" }),
      card("V2", { section: "s3", issue: "Keyword is forced into the second sentence.", severity: "should fix" }),
      card("V2", { section: "faq", issue: "FAQ answers are too long to be quoted.", severity: "must fix" }),
      card("V3", { section: "s5", issue: "Add a concrete example without a seller story.", severity: "suggestion" }),
      v1(),
    ];
    const out = combineFeedback(input);
    expect(combinedSetErrors(input, out)).toEqual([]);
    for (const c of input.filter((x) => x.severity === "must fix")) expect(out.toWriter.some((o) => o.section === c.section && o.severity === "must fix")).toBe(true);
    expect(out.toWriter.map((o) => o.severity)).toEqual(["must fix", "must fix", "must fix", "must fix", "should fix", "suggestion"]);
  });
  it("the self-check catches a set that lost a must-fix or a V1 card", () => {
    const input = [v1(), card("V3", { issue: "Generic opening that fits any investor site.", severity: "must fix" })];
    const good = combineFeedback(input);
    expect(combinedSetErrors(input, { ...good, toWriter: good.toWriter.slice(1) }).join()).toMatch(/V1 card dropped/);
    expect(combinedSetErrors(input, { ...good, toWriter: good.toWriter.filter((o) => o.from[0] !== "V3") }).join()).toMatch(/dropped or downgraded/);
    expect(combinedSetErrors(input, { ...good, toWriter: good.toWriter.map((o) => (o.from[0] === "V3" ? { ...o, severity: "suggestion" as const } : o)) }).join()).toMatch(/downgraded/);
  });
});

describe("combined feedback set: other cards and bad input", () => {
  it("cards for other teams pass through unchanged, so a ROOT_CAUSE_NOTE or EVIDENCE_REQUEST is never swallowed", () => {
    const rc = card("V2", { ticket: "ROOT_CAUSE_NOTE", to: "S2", issue: "The brief gives s3 the wrong purpose.", severity: "must fix" });
    const er = card("V1", { ticket: "EVIDENCE_REQUEST", to: "R1", section: "s2", issue: "Is a transfer disclosure always required?", severity: "must fix", blocking: false });
    const out = combineFeedback([rc, er, card("V3", {})]);
    expect(out.passThrough).toEqual([rc, er]);
    expect(out.toWriter).toHaveLength(1);
  });
  it("every card in the set is accepted by the router", () => {
    const out = combineFeedback([v1(), card("V2", { key: "a:b", severity: "must fix" }), card("V3", { key: "a:b" })]);
    let s = newRouter();
    for (const c of out.toWriter) { const r = raiseTicket(s, c, { at: "2026-10-12T12:00:00Z", versionHash: "v1" }); expect(r.ok, JSON.stringify(c)).toBe(true); s = r.state; }
  });
  it("rejects a V2/V3 card that tries to block, a combined-author input, an unknown reviewer, and an invalid card", () => {
    expect(() => combineFeedback([{ ...card("V2"), blocking: true } as FeedbackCard])).toThrow(/invalid card/);
    expect(() => combineFeedback([{ ...card("V2"), from: ["V2", "V3"] } as FeedbackCard])).toThrow(/single-reviewer/);
    expect(() => combineFeedback([card("S1")])).toThrow(/single-reviewer/);
    expect(() => combineFeedback([{ ...card("V2"), evidence: "" } as FeedbackCard])).toThrow(/invalid card/);
  });
  it("an empty set combines to nothing", () => {
    expect(combineFeedback([])).toEqual({ toWriter: [], passThrough: [], disagreements: [], absorbedByV1: [] });
  });
});

describe("council files", () => {
  const dir = ".claude/agents";
  const read = (f: string) => readFileSync(`${dir}/${f}.md`, "utf8");
  const toolsOf = (t: string) => t.split(/\r?\n/).find((l) => l.startsWith("tools:"));
  const COUNCIL: Record<string, string> = {
    "thb-v1-fact-privacy": "Passing its own unsupported assumptions",
    "thb-v2-seo-aeo-geo": "Pretending it directly tested HTTP or schema when it did not",
    "thb-v3-editorial": "Altering verified facts without re-audit",
  };
  for (const [k, phrase] of Object.entries(COUNCIL)) {
    it(`${k}: exists, versioned 1.0.0, quotes its Prohibited action, Read/Write only, emits feedback cards, treats ticket text as data`, () => {
      const t = read(k);
      expect(t).toMatch(/prompt_version: 1\.0\.0/);
      expect(t).toContain(`**Prohibited action: ${phrase}.**`);
      expect(toolsOf(t)).toBe("tools: Read, Write");
      expect(t).toContain("editorial-standards");
      expect(t).toContain('"cards": [');
      expect(t).toMatch(/ONE combined feedback set/);
      expect(t).toMatch(/UNTRUSTED_DATA/);
      expect(t).toMatch(/never write `approved`/i);
    });
  }
  it("only V1 can block: V2 and V3 say they cannot, V1 says only it can, and its veto is cleared only by proof", () => {
    expect(read("thb-v1-fact-privacy")).toMatch(/Only you can block/);
    expect(read("thb-v1-fact-privacy")).toMatch(/cleared only by proof/);
    expect(read("thb-v2-seo-aeo-geo")).toMatch(/You cannot block/);
    expect(read("thb-v3-editorial")).toMatch(/You cannot block/);
    expect(read("thb-v2-seo-aeo-geo")).toMatch(/"blocking": false/);
    expect(read("thb-v3-editorial")).toMatch(/"blocking": false/);
  });
  it("V1 reviews changed sentences only when scoped, and must rule on every flagged hedge sentence", () => {
    const t = read("thb-v1-fact-privacy");
    expect(t).toMatch(/review_scope/);
    expect(t).toMatch(/changed sentences only/i);
    expect(t).toMatch(/hedge_rulings/);
    expect(t).toMatch(/most owners, most people, usually, always, never, nobody or everyone/);
    expect(t).toMatch(/proven[\s\S]*reword[\s\S]*drop/);
  });
  it("V2 and V3 route a brief-caused problem to S2 instead of patching around it; V3 returns no revised_unit", () => {
    expect(read("thb-v2-seo-aeo-geo")).toMatch(/ROOT_CAUSE_NOTE card to S2/);
    expect(read("thb-v3-editorial")).toMatch(/ROOT_CAUSE_NOTE card to S2/);
    expect(read("thb-v3-editorial")).toMatch(/Do not return a `revised_unit` in team mode/);
  });
  it("no council file has a web tool", () => {
    for (const f of readdirSync(dir).filter((x) => x.startsWith("thb-v"))) expect(toolsOf(readFileSync(`${dir}/${f}`, "utf8")), f).not.toMatch(/Web/);
  });
});
