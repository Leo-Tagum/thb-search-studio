import { describe, expect, it } from "vitest";
import { checkUnit, type CheckCtx, type LedgerClaim } from "./checks";
import type { Unit } from "./schema";

// Stage 6 part A, found in the dry run: an invented local rule ("San Mateo County's code requires ... within 30 days") raised no flag except the number. A sentence that states a rule of a named city
// or county now needs a cited claim for THAT jurisdiction. Labels only: no legal text is quoted or invented here.
const claim = (id: string, jurisdiction: string): LedgerClaim => ({ id, text: "A made-up local rule for this test.", risk: "high", support: "supported", sourceId: "s", sourceRecheckBy: "2030-01-01", jurisdiction });
const ctx = (allowed = ["California", "City and County of San Francisco", "San Mateo County"]): CheckCtx => ({ today: "2026-10-14", claims: new Map([["clm:sf", claim("clm:sf", "City and County of San Francisco")], ["clm:ca", claim("clm:ca", "California")]]), approvedFactTexts: [], allowedLinks: [], sourceUrls: [], internalPassages: [], allowedJurisdictions: allowed, blockedPhrases: [], briefH2: { s10: "What does San Francisco's code add?" }, keyword: "x" });
const unit = (blocks: string[], ids: string[] = []): Unit => ({ kind: "section", key: "s10", h2: "What does San Francisco's code add?", blocks: blocks.map((text) => ({ t: "p" as const, text })), claim_ids: ids, roles: [] });
const codes = (u: Unit, c = ctx()) => checkUnit(u, c).map((f) => f.code);

describe("a rule of a named city or county needs its own claim", () => {
  it("a San Mateo County rule with no San Mateo County claim is flagged, even when a San Francisco claim is cited", () => {
    expect(codes(unit(["San Mateo County's code requires owners to clear a hoarded home."], ["clm:sf"]))).toContain("LOCAL_RULE_WITHOUT_CLAIM");
    expect(codes(unit(["San Mateo County's code requires owners to clear a hoarded home."]))).toContain("LOCAL_RULE_WITHOUT_CLAIM");
  });
  it("a San Francisco rule with a San Francisco claim cited passes; the same sentence with no claim is flagged", () => {
    expect(codes(unit(["San Francisco's housing code requires a report before a sale."], ["clm:sf"]))).not.toContain("LOCAL_RULE_WITHOUT_CLAIM");
    expect(codes(unit(["San Francisco's housing code requires a report before a sale."]))).toContain("LOCAL_RULE_WITHOUT_CLAIM");
  });
  it("a California claim does not cover a city's rule", () => {
    expect(codes(unit(["San Francisco's code requires a report before a sale."], ["clm:ca"]))).toContain("LOCAL_RULE_WITHOUT_CLAIM");
  });
  it("the exact gap-filler sentence is allowed, and a place named without a rule is not a rule", () => {
    expect(codes(unit(["Local rules vary; check with your city or county."]))).not.toContain("LOCAL_RULE_WITHOUT_CLAIM");
    expect(codes(unit(["Many families in San Mateo County face this."]))).not.toContain("LOCAL_RULE_WITHOUT_CLAIM");
    expect(codes(unit(["For any other point in San Mateo County, local rules vary; check with your city or county."]))).not.toContain("LOCAL_RULE_WITHOUT_CLAIM");
  });
  it("a claim for a jurisdiction that is not on the article's list is still refused, with aliases understood", () => {
    expect(codes(unit(["San Francisco's code requires a report before a sale."], ["clm:sf"]), ctx(["California"]))).toContain("WRONG_JURISDICTION");
    expect(codes(unit(["San Francisco's code requires a report before a sale."], ["clm:sf"]), ctx(["California", "San Francisco"]))).not.toContain("WRONG_JURISDICTION");
  });
});
