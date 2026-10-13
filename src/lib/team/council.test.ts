import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { combineFeedback, combinedSetErrors, toTicketCard, type CouncilItem } from "./council";
import { newRouter, raiseTicket } from "./router";
import type { FeedbackCard } from "./tickets";

const card = (from: string, o: Partial<FeedbackCard> & Record<string, unknown> = {}): FeedbackCard => ({
  ticket: "QUALITY_CORRECTION", from: [from], to: "W1", section: "h1", issue: "The H1 does not name the seller situation clearly.", severity: "should fix", evidence: "rule: authenticity q1", fix: null,
  blocking: false, ...o,
}) as FeedbackCard;
const v1 = (o: Record<string, unknown> = {}) => card("V1", { severity: "must fix", blocking: true, issue: "Claim clm:3 is stated as a flat rule but the source says may.", evidence: "clm:3 text", section: "s2", ...o });
const items = (cards: FeedbackCard[]): CouncilItem[] => cards.map((c, i) => ({ id: `c${i + 1}`, card: c }));
const combine = (cards: FeedbackCard[]) => combineFeedback(items(cards));
const errs = (cards: FeedbackCard[], out: ReturnType<typeof combine>) => combinedSetErrors(items(cards), out);
const cards = (out: ReturnType<typeof combine>) => out.toWriter.map((o) => o.card);

describe("combined feedback set: V1 items are always kept", () => {
  it("keeps every V1 card exactly as raised, including identical-looking ones", () => {
    const a = v1(), b = v1({ issue: "Claim clm:3 is stated as a flat rule but the source says may." }), c = v1({ section: "s4", issue: "Seller identifiable by the town and date.", evidence: "privacy gate" });
    const input = [a, b, c, card("V2", { section: "s2", issue: "The direct answer is missing from the opening sentences.", severity: "must fix" })];
    const out = combine(input);
    for (const x of [a, b, c]) expect(cards(out).filter((o) => JSON.stringify(o) === JSON.stringify(x)).length).toBeGreaterThanOrEqual(1);
    expect(cards(out).filter((o) => o.from.length === 1 && o.from[0] === "V1")).toHaveLength(3);
    expect(cards(out)[0].from).toEqual(["V1"]);                                  // V1 first
    expect(cards(out).filter((o) => o.blocking)).toHaveLength(3);
    expect(errs(input, out)).toEqual([]);
  });
  it("never merges a V1 card into a V2/V3 card, and never lets a non-V1 card carry blocking", () => {
    const out = combine([v1(), card("V2", { section: "s2", issue: "Claim clm:3 is stated as a flat rule but the source says may.", severity: "must fix" })]);
    expect(cards(out).filter((o) => o.from.length > 1)).toEqual([]);
    expect(cards(out).filter((o) => o.blocking).every((o) => o.from.join() === "V1")).toBe(true);
  });
  it("a V2 card that repeats a stronger-or-equal V1 card is folded into it, listed as absorbed, and linked from the V1 card", () => {
    const out = combine([v1(), card("V2", { section: "s2", issue: "Claim clm:3 is stated as a flat rule but the source says may.", severity: "should fix" })]);
    expect(out.toWriter).toHaveLength(1);
    expect(out.absorbedByV1).toEqual([expect.objectContaining({ id: "c2", into: "c1" })]);
    expect(out.toWriter[0].mergedFrom).toEqual(["c1", "c2"]);                       // the absorbed original is visible from the V1 card
    expect(out.toWriter[0].mergeBasis).toBe("wording");
  });
  it("but a V2 must-fix is NOT absorbed by a weaker V1 card: nothing is downgraded", () => {
    const weak = v1({ severity: "should fix", blocking: false });
    const out = combine([weak, card("V2", { section: "s2", issue: "Claim clm:3 is stated as a flat rule but the source says may.", severity: "must fix" })]);
    expect(out.toWriter).toHaveLength(2);
    expect(cards(out).some((o) => o.from.join() === "V2" && o.severity === "must fix")).toBe(true);
    expect(out.absorbedByV1).toEqual([]);
  });
});

describe("combined feedback set: de-duplicates V2/V3 without dropping a must-fix", () => {
  it("the same issue from V2 and V3 becomes one card from both, at the strongest severity", () => {
    const out = combine([
      card("V2", { key: "seo:h1-situation", issue: "The H1 names the keyword but not the seller situation.", severity: "should fix", evidence: "AEO question match" }),
      card("V3", { key: "seo:h1-situation", issue: "H1 reads like an investor ad and misses the situation.", severity: "must fix", evidence: "copy-paste test" }),
    ]);
    expect(out.toWriter).toHaveLength(1);
    expect(out.toWriter[0].card).toMatchObject({ from: ["V2", "V3"], severity: "must fix", blocking: false, to: "W1", section: "h1" });
    expect(out.toWriter[0].card.evidence).toContain("AEO question match");
    expect(out.toWriter[0].card.evidence).toContain("copy-paste test");
    expect(out.disagreements).toEqual([expect.objectContaining({ kind: "severity", roles: ["V2", "V3"], cardIds: ["c1", "c2"] })]);
  });
  it("matches the same issue by wording when keys differ, within the same section only", () => {
    const a = card("V2", { issue: "The opening hides the direct answer to the question the heading asks." });
    const b = card("V3", { issue: "Opening hides the direct answer to the question the heading asks." });
    expect(combine([a, b]).toWriter).toHaveLength(1);
    expect(combine([a, { ...b, section: "s3" }]).toWriter).toHaveLength(2);
    expect(combine([a, card("V3", { issue: "The FAQ answers run longer than sixty words and cannot be quoted." })]).toWriter).toHaveLength(2);
  });
  it("every merged card keeps links to its original cards and says how it was matched, so a wrong merge is visible", () => {
    const a = card("V2", { issue: "The opening hides the direct answer to the question the heading asks.", evidence: "v2 evidence", fix: "Move the answer up." });
    const b = card("V3", { issue: "Opening hides the direct answer to the question the heading asks.", evidence: "v3 evidence" });
    const keyed = [card("V2", { key: "x:one", issue: "Alpha beta gamma delta epsilon.", section: "s2" }), card("V3", { key: "x:one", issue: "Completely other phrasing here entirely.", section: "s2" })];
    const lone = card("V3", { issue: "Examples are generic and could be on any site.", section: "s5" });
    const input = [a, b, ...keyed, lone];
    const out = combine(input);
    const byBasis = Object.fromEntries(out.toWriter.map((o) => [o.mergeBasis, o]));
    expect(byBasis.wording.mergedFrom).toEqual(["c1", "c2"]);
    expect(byBasis.key.mergedFrom).toEqual(["c3", "c4"]);
    expect(byBasis.single.mergedFrom).toEqual(["c5"]);
    expect(out.toWriter.find((o) => o.mergeBasis === "single")!.id).toBe("c5");   // a card that was not merged keeps its own id
    // the originals open on click: every link resolves to the exact card as raised
    for (const o of out.toWriter) for (const id of o.mergedFrom) expect(out.originals[id]).toEqual(input[Number(id.slice(1)) - 1]);
    expect(out.originals.c2.evidence).toBe("v3 evidence");
    expect(out.originals.c1.fix).toBe("Move the answer up.");
    expect(new Set(out.toWriter.map((o) => o.id)).size).toBe(out.toWriter.length);
  });
  it("different suggested fixes for the same issue are listed as a disagreement, not hidden", () => {
    const out = combine([card("V2", { key: "x:cta", issue: "The call to action pushes too hard.", fix: "Soften it." }), card("V3", { key: "x:cta", issue: "The call to action pushes too hard.", fix: "Cut it to one line." })]);
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
    const out = combine(input);
    expect(errs(input, out)).toEqual([]);
    for (const c of input.filter((x) => x.severity === "must fix")) expect(cards(out).some((o) => o.section === c.section && o.severity === "must fix")).toBe(true);
    expect(cards(out).map((o) => o.severity)).toEqual(["must fix", "must fix", "must fix", "must fix", "should fix", "suggestion"]);
  });
  it("the self-check catches a set that lost a must-fix, a V1 card, or a link to an original", () => {
    const input = [v1(), card("V3", { issue: "Generic opening that fits any investor site.", severity: "must fix" })];
    const good = combine(input);
    expect(errs(input, { ...good, toWriter: good.toWriter.slice(1) })).toEqual(expect.arrayContaining([expect.stringMatching(/V1 card dropped/)]));
    expect(errs(input, { ...good, toWriter: good.toWriter.filter((o) => o.card.from[0] !== "V3") }).join()).toMatch(/dropped or downgraded/);
    expect(errs(input, { ...good, toWriter: good.toWriter.map((o) => (o.card.from[0] === "V3" ? { ...o, card: { ...o.card, severity: "suggestion" as const } } : o)) }).join()).toMatch(/downgraded/);
    expect(errs(input, { ...good, toWriter: good.toWriter.map((o) => (o.card.from[0] === "V3" ? { ...o, mergedFrom: ["c99"] } : o)) }).join()).toMatch(/unknown original c99/);
  });
});

describe("combined feedback set: other cards and bad input", () => {
  it("cards for other teams pass through unchanged, so a ROOT_CAUSE_NOTE or EVIDENCE_REQUEST is never swallowed", () => {
    const rc = card("V2", { ticket: "ROOT_CAUSE_NOTE", to: "S2", issue: "The brief gives s3 the wrong purpose.", severity: "must fix" });
    const er = card("V1", { ticket: "EVIDENCE_REQUEST", to: "R1", section: "s2", issue: "Is a transfer disclosure always required?", severity: "must fix", blocking: false });
    const out = combine([rc, er, card("V3", {})]);
    expect(out.passThrough.map((p) => p.card)).toEqual([rc, er]);
    expect(out.toWriter).toHaveLength(1);
  });
  it("every card in the set is accepted by the router as it stands", () => {
    const out = combine([v1(), card("V2", { key: "a:b", severity: "must fix" }), card("V3", { key: "a:b" })]);
    let s = newRouter();
    for (const c of out.toWriter) { const r = raiseTicket(s, toTicketCard(c), { at: "2026-10-12T12:00:00Z", versionHash: "v1" }); expect(r.ok, JSON.stringify(c)).toBe(true); s = r.state; }
  });
  it("rejects a V2/V3 card that tries to block, a combined-author input, an unknown reviewer, an invalid card, and duplicate ids", () => {
    expect(() => combine([{ ...card("V2"), blocking: true } as FeedbackCard])).toThrow(/invalid card/);
    expect(() => combine([{ ...card("V2"), from: ["V2", "V3"] } as FeedbackCard])).toThrow(/single-reviewer/);
    expect(() => combine([card("S1")])).toThrow(/single-reviewer/);
    expect(() => combine([{ ...card("V2"), evidence: "" } as FeedbackCard])).toThrow(/invalid card/);
    expect(() => combineFeedback([{ id: "x", card: card("V2") }, { id: "x", card: card("V3", { section: "s9" }) }])).toThrow(/duplicate card id/);
  });
  it("an empty set combines to nothing", () => {
    expect(combine([])).toEqual({ toWriter: [], passThrough: [], originals: {}, disagreements: [], absorbedByV1: [] });
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
    it(`${k}: exists, versioned (V1 1.3.0, V2 and V3 1.2.0), quotes its Prohibited action, Read/Write only, emits feedback cards, treats ticket text as data`, () => {
      const t = read(k);
      expect(t).toMatch(k === "thb-v1-fact-privacy" ? /prompt_version: 1\.3\.0/ : /prompt_version: 1\.2\.0/);   // V1: 1.3.0 (legal claims, standing rules); V2 and V3: 1.2.0 (standing rules)
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
