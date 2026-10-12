// Phase 3 regression fixtures (fixture data only, never real seller data). Blueprint §14 rows 4-8 + editorial required elements + PENDING JUAN facts.
import { describe, expect, it } from "vitest";
import { checkArticle, checkUnit, hedgeFlagsInText, type CheckCtx, type Finding, type LedgerClaim } from "./checks";
import { materialSig, riskyKeys } from "./tokens";
import type { Section, Unit } from "./schema";

const claim = (id: string, text: string, o: Partial<LedgerClaim> = {}): LedgerClaim => ({ id, text, risk: "high", support: "supported", sourceId: "src:1", sourceRecheckBy: null, jurisdiction: "California", ...o });
const claims = new Map<string, LedgerClaim>([
  ["clm:1", claim("clm:1", "California Health and Safety Code section 17920.3 lists conditions that can make a building substandard, and the local enforcement authority decides.")],
  ["clm:2", claim("clm:2", "Under California Civil Code section 1102, sellers of one to four residential units give buyers a Real Estate Transfer Disclosure Statement, and a waiver is void.")],
  ["clm:3", claim("clm:3", "A sourced rule for another state.", { jurisdiction: "Texas" })],
  ["clm:4", claim("clm:4", "An old rule that was due for re-check.", { sourceRecheckBy: "2026-01-01" })],
  ["clm:5", claim("clm:5", "An unsupported statement.", { support: "unsupported" })],
]);
const ctx = (o: Partial<CheckCtx> = {}): CheckCtx => ({
  today: "2026-10-10", claims, approvedFactTexts: ["Twin Home Buyer has purchased 1,000+ homes.", "25+ years of experience in Bay Area real estate"],
  allowedLinks: ["https://www.twinhomebuyer.com/hoarder-houses/"], sourceUrls: [], internalPassages: [], allowedJurisdictions: ["California"],
  blockedPhrases: [], briefH2: { s1: "What should you know first about a packed or hoarded house before you sell?", s2: "What do you have to disclose when you sell a house in California?" }, keyword: "hoarded house", ...o,
});
const sec = (key: string, h2: string, text: string, claim_ids: string[] = [], o: Partial<Section> = {}): Section => ({ kind: "section", key, h2, blocks: [{ t: "p", text }], claim_ids, roles: [], ...o });
const s2 = (text: string, ids: string[] = ["clm:2"]) => sec("s2", "What do you have to disclose when you sell a house in California?", text, ids);
const codes = (f: Finding[]) => f.map((x) => x.code);

describe("blueprint §14 blocked cases", () => {
  it("clean section with a supported claim passes", () => {
    expect(checkUnit(s2("California sellers of one to four residential units give buyers a Transfer Disclosure Statement under Civil Code section 1102. Ask an attorney what applies to you."), ctx())).toEqual([]);
  });
  it("row 4: unsupported law claim (a statute no cited claim contains) is BLOCKED_CLAIM", () => {
    const f = checkUnit(s2("Under Civil Code section 1102.9 you must disclose within 30 days."), ctx());
    expect(f.filter((x) => x.code === "UNCOVERED_FIGURE").length).toBeGreaterThan(0);
    expect(f.every((x) => x.severity === "BLOCKED_CLAIM" || x.severity === "REVISION")).toBe(true);
    expect(f.some((x) => x.severity === "BLOCKED_CLAIM")).toBe(true);
  });
  it("citing an unsupported or unknown claim is blocked", () => {
    expect(codes(checkUnit(s2("Text.", ["clm:5"]), ctx()))).toContain("UNSUPPORTED_CLAIM_CITED");
    expect(codes(checkUnit(s2("Text.", ["clm:99"]), ctx()))).toContain("UNKNOWN_CLAIM");
  });
  it("row 5: a claim from another jurisdiction is blocked", () => expect(codes(checkUnit(s2("Text.", ["clm:3"]), ctx()))).toContain("WRONG_JURISDICTION"));
  it("stale rule: a source past its re-check date is blocked", () => expect(codes(checkUnit(s2("Text.", ["clm:4"]), ctx()))).toContain("STALE_RULE"));
  it("invented deal claim is blocked (history claim and invented count)", () => {
    const f = checkUnit(s2("We closed 40 homes like this in Oakland last year and helped every family."), ctx());
    expect(codes(f)).toContain("UNDECLARED_HISTORY_CLAIM");
    expect(codes(f)).toContain("UNCOVERED_FIGURE");
  });
  it("row 7/8: a seller story is BLOCKED_PRIVACY (nothing is cleared); identity and internal passages too", () => {
    expect(checkUnit(s2("One family we helped sold after their mother passed."), ctx()).some((x) => x.severity === "BLOCKED_PRIVACY")).toBe(true);
    const internal = [{ text: "The seller's sister is a real estate broker in the neighborhood", reasons: [] }];
    expect(checkUnit(s2("The seller's sister is a real estate broker in the neighborhood, so it can happen."), ctx({ internalPassages: internal })).some((x) => x.severity === "BLOCKED_PRIVACY")).toBe(true);
    expect(checkUnit(s2("The home at 123 Main Street was sold."), ctx()).some((x) => x.severity === "BLOCKED_PRIVACY")).toBe(true);
  });
  it("row 13: an editor changing a verified detail (30 days -> 60 days) is caught", () => {
    const ok = new Map(claims); ok.set("clm:6", claim("clm:6", "Sellers must give the form within 30 days."));
    const c = ctx({ claims: ok });
    expect(checkUnit(s2("Give the form within 30 days.", ["clm:6"]), c)).toEqual([]);
    const edited = checkUnit(s2("Give the form within 60 days.", ["clm:6"]), c);
    expect(codes(edited)).toContain("UNCOVERED_FIGURE");
    expect(materialSig("Give the form within 30 days.", ["clm:6"])).not.toBe(materialSig("Give the form within 60 days.", ["clm:6"]));
  });
  it("a wording-only editorial change keeps the material signature (no forced fact re-review)", () => {
    expect(materialSig("Give the form within 30 days.", ["clm:6"])).toBe(materialSig("You hand over the form within 30 days.", ["clm:6"]));
  });
});

describe("PENDING JUAN facts, ratings and brand wording are blocked", () => {
  const bad: [string, string][] = [
    ["closing time", "We can close in 7 days."], ["hours", "Call us 24/7."], ["ownership", "A family-owned company."], ["contractor license", "We are a licensed contractor."],
    ["Equity Track", "Part of Equity Track Inc."], ["$32M", "We saved sellers $32M in fees."], ["100% on time", "100% on time closings."], ["East Oakland", "My East Oakland roots."],
    ["rating", "Rated 4.8/5 by 115 reviews."], ["exact years", "Juan has 27 years of experience."], ["founding year", "Founded in 2002."], ["founder title", "Juan Diaz, founder of Twin Home Buyer."],
  ];
  for (const [name, text] of bad) it(`blocks ${name}`, () => expect(checkUnit(s2(text), ctx()).some((x) => x.severity === "BLOCKED_CLAIM")).toBe(true));
  it("blocks an article-specific pending statement (as-is / no-cleanout purchase)", () => {
    const c = ctx({ blockedPhrases: [["as-is purchase", /\bwe\s+(?:can\s+)?(?:buy|purchase)[^.]{0,60}as-is/i]] });
    expect(checkUnit(s2("We buy houses as-is, with everything inside."), c).some((x) => x.code === "PENDING_JUAN")).toBe(true);
  });
  it("approved facts are usable in their exact wording", () => {
    expect(checkUnit(s2("Twin Home Buyer has purchased 1,000+ homes.", []), ctx()).filter((x) => x.severity === "BLOCKED_CLAIM")).toEqual([]);
  });
});

describe("structure checks", () => {
  it("rejects markup, a link outside the allowlist, a changed H2, and a bad capsule", () => {
    const f = checkUnit(sec("s1", "A different heading?", "See <b>this</b> and [x](https://evil.example.com/).", [], { capsule: "Too short." }), ctx());
    expect(codes(f)).toEqual(expect.arrayContaining(["MARKUP", "LINK_NOT_ALLOWED", "H2_CHANGED", "CAPSULE_LENGTH"]));
  });
  it("accepts a 40-60 word capsule", () => {
    const capsule = "A hoarded house can still be sold in California, but the route depends on who can sign, what condition the home is in, and what you owe. You have real options, including keeping it, listing it, clearing it out, getting professional help, or selling directly after you confirm the details.";
    expect(checkUnit(sec("s1", "What should you know first about a packed or hoarded house before you sell?", "Plain text.", [], { capsule, roles: ["opening"] }), ctx())).toEqual([]);
  });
  it("link URLs are not text: a year or a place in a URL is not a figure or a pending fact", () => {
    const f = checkUnit(s2("See [code violations](https://www.twinhomebuyer.com/oakland-code-violations-2026/) and [east oakland notes](https://www.twinhomebuyer.com/east-oakland/).", []), ctx({ allowedLinks: ["https://www.twinhomebuyer.com/oakland-code-violations-2026/", "https://www.twinhomebuyer.com/east-oakland/"] }));
    expect(f.filter((x) => x.severity !== "REVISION" && x.code !== "PENDING_JUAN")).toEqual([]);
    expect(codes(f)).not.toContain("UNCOVERED_FIGURE");
  });
  it("risky token extraction", () => {
    expect(riskyKeys("Civil Code § 1102.6 and H&S Code 17920.3, $5,000, 30-day notice, 50%, in 2024, 1,000+ homes")).toEqual(
      expect.arrayContaining(["§1102.6", "§17920.3", "$5000", "30 day", "50%", "year:2024", "count:1000+ homes"]));
  });
});

describe("required editorial elements block the article", () => {
  const full: Unit[] = [
    sec("s1", "What should you know first about a packed or hoarded house before you sell?", "Open from the seller problem.", [], { capsule: "A hoarded house can be sold.", roles: ["opening"] }),
    sec("s2", "What do you have to disclose when you sell a house in California?", "Disclosure text.", ["clm:2"]),
    sec("s3", "Should you clear it out, list it, keep it or sell directly?", "You can keep it, list it with an agent, clear it out and repair it, or sell directly to a cash buyer.", [], { roles: ["options"] }),
    sec("s4", "What can delay or block the sale?", "A lien can stall escrow.", [], { roles: ["real_world_warning"] }),
    sec("s5", "Who should you check with before you decide?", "Confirm with an attorney, your title company and the city or county.", [], { roles: ["professional_confirmation"] }),
  ];
  const actx = { briefH2: {}, keyword: "hoarded house", title: "Packed or Hoarded House in California: What to Disclose", requiredUnitKeys: ["s1", "s2", "s3", "s4", "s5"] };
  it("a complete article passes the element checks", () => expect(checkArticle(full, { ...actx })).toEqual([]));
  const without = (key: string) => full.filter((u) => u.key !== key);
  const drop = (role: string) => full.map((u) => (u.kind === "section" ? { ...u, roles: u.roles.filter((r) => r !== role) } : u));
  it("blocks a draft with no honest-options section", () => expect(codes(checkArticle(drop("options"), actx))).toContain("NO_HONEST_OPTIONS"));
  it("blocks a draft with no real-world warning", () => expect(codes(checkArticle(drop("real_world_warning"), actx))).toContain("NO_REAL_WORLD_WARNING"));
  it("blocks a draft with no professional confirmation", () => expect(codes(checkArticle(drop("professional_confirmation"), actx))).toContain("NO_PROFESSIONAL_CONFIRMATION"));
  it("blocks a draft that does not open from a seller problem", () => expect(codes(checkArticle(drop("opening"), actx))).toContain("NO_SELLER_PROBLEM_OPENING"));
  it("blocks options that are only selling to THB", () => {
    const u = full.map((x) => (x.key === "s3" ? sec("s3", "Should you clear it out, list it, keep it or sell directly?", "Sell directly to a cash buyer.", [], { roles: ["options"] }) : x));
    expect(codes(checkArticle(u, actx))).toEqual(expect.arrayContaining(["OPTIONS_TOO_FEW"]));
  });
  it("blocks a missing or reordered section", () => {
    expect(codes(checkArticle(without("s2"), actx))).toContain("UNIT_MISSING");
    const swapped = [full[1], full[0], ...full.slice(2)];
    expect(codes(checkArticle(swapped, actx))).toContain("ORDER");
  });
});

describe("hedge phrases (team mode flag, not part of checkUnit)", () => {
  it("flags every listed phrase on whole words only, one entry per sentence", () => {
    const text = "Most owners wait too long. Most people never ask. It is usually fine. Prices always change. Nobody looks twice. Everyone knows that. Never sign blind. Evergreen trees are neveraging and alwaysome.";
    const f = hedgeFlagsInText(text);
    expect(f.map((x) => x.term)).toEqual(["most owners", "most people", "usually", "always", "nobody", "everyone", "never"]);
    expect(f.every((x) => /^hedge:[0-9a-f]{12}$/.test(x.key))).toBe(true);
  });
  it("keys depend on the sentence, not its position or case, and a clean text has none", () => {
    expect(hedgeFlagsInText("A. Nobody looks twice.")[0].key).toBe(hedgeFlagsInText("Intro here.\n\nNOBODY looks  twice.")[0].key);
    expect(hedgeFlagsInText("Hoarded homes can sell as-is.")).toEqual([]);
  });
  it("is not a classic finding: checkUnit does not report it", () => {
    expect(JSON.stringify(checkUnit(s2("Most owners never check.", []), ctx()))).not.toMatch(/hedge/i);
  });
});
