import { describe, expect, it } from "vitest";
import { checkArticle } from "./checks";
import { PITCH_OPENING, PRO_REQUIRED, SALE_RISK } from "./content-march";
import type { Section, Unit } from "./schema";

// Juan's voice SOP, "Content March" (Leo, 2026-10-14): the opening is not a pitch, the real-world warning names a delay or blocking risk, the professional confirmation names an attorney, title company, CPA or tax professional.
const sec = (key: string, h2: string, text: string, o: Partial<Section> = {}): Section => ({ kind: "section", key, h2, blocks: [{ t: "p", text }], claim_ids: [], roles: [], ...o });
const base = (over: Record<string, Partial<Section>> = {}): Unit[] => [
  sec("s1", "What should you know first about a packed or hoarded house before you sell?", "Start with who holds title and who can sign.", { capsule: "A hoarded house can be sold.", roles: ["opening"], ...over.s1 }),
  sec("s3", "Should you clear it out, list it, keep it or sell directly?", "You can keep it, list it with an agent, clear it out and repair it, or sell directly to a cash buyer.", { roles: ["options"] }),
  sec("s4", "What can delay or block the sale?", "A lien can stall escrow.", { roles: ["real_world_warning"], ...over.s4 }),
  sec("s5", "Who should you check with before you decide?", "Confirm with an attorney and your title company.", { roles: ["professional_confirmation"], ...over.s5 }),
];
const ctx = { briefH2: {}, keyword: "hoarded house", title: "Packed or Hoarded House in California", requiredUnitKeys: ["s1", "s3", "s4", "s5"] };
const codes = (u: Unit[]) => checkArticle(u, ctx).map((f) => f.code);

describe("the opening is not a sales pitch", () => {
  it("passes an opening that starts from the seller's situation", () => expect(codes(base())).toEqual([]));
  it.each([
    ["a call to action", "Contact us today to find out what your house is worth."],
    ["a cash-offer line", "Get a fair cash offer for your house in minutes."],
    ["we buy language", "We buy houses fast, in any condition."],
    ["sell fast", "Sell your house fast, whatever is inside."],
  ])("blocks %s in the answer capsule", (_n, capsule) => expect(codes(base({ s1: { capsule } }))).toContain("PITCH_OPENING"));
  it("blocks a pitch in the first paragraph when there is no capsule", () => expect(codes(base({ s1: { capsule: undefined, blocks: [{ t: "p", text: "Call us today for a free offer." }] } }))).toContain("PITCH_OPENING"));
  it("does not flag ordinary words from a seller-problem opening", () => {
    for (const t of ["A fast sale only helps if the right person can sign.", "Cash buyers are one option, and listing is another.", "Most families do not know who has authority to sign."]) expect(PITCH_OPENING.test(t)).toBe(false);
  });
});

describe("the real-world warning names a delay or blocking risk", () => {
  it("passes a warning that names what can stall, block or ruin the sale", () => {
    for (const t of ["A lien can stall escrow.", "The wrong person signing can block the sale.", "Tenants who will not leave can derail a closing.", "An unpermitted room can hold up the sale."]) expect(SALE_RISK.test(t)).toBe(true);
  });
  it("blocks a warning that is only a general caution", () => {
    expect(codes(base({ s4: { blocks: [{ t: "p", text: "Selling a house is a big decision, so take your time and think it over." }] } }))).toContain("WARNING_NO_RISK");
  });
  it("a missing warning is still NO_REAL_WORLD_WARNING, not both", () => {
    const c = codes(base({ s4: { roles: [] } }));
    expect(c).toContain("NO_REAL_WORLD_WARNING"); expect(c).not.toContain("WARNING_NO_RISK");
  });
});

describe("the professional confirmation names an attorney, a title company, a CPA or a tax professional", () => {
  it.each(["Confirm with an attorney.", "Ask your title company.", "A CPA can tell you.", "Talk to a tax professional.", "Ask a probate lawyer."])("accepts %s", (t) => expect(PRO_REQUIRED.test(t)).toBe(true));
  it.each(["Check with your city or county.", "Ask the building department and the county.", "Talk to an insurance professional.", "Ask a code enforcement officer."])("does not accept %s on its own", (t) => expect(PRO_REQUIRED.test(t)).toBe(false));
  it("blocks a section that names only a city or county", () => {
    expect(codes(base({ s5: { blocks: [{ t: "p", text: "Check with your city or county." }] } }))).toContain("NO_PROFESSIONAL_CONFIRMATION");
  });
  it("accepts an attorney together with the city or county", () => {
    expect(codes(base({ s5: { blocks: [{ t: "p", text: "Confirm with an attorney, your title company and the city or county." }] } }))).toEqual([]);
  });
});
