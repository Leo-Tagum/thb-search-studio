import { describe, expect, it } from "vitest";
import { templateFlagFor } from "./template-flag";

describe("template flag", () => {
  it("flags city slugs", () => {
    for (const s of ["we-buy-houses-in-daly-city", "sell-your-house-fast-in-gilroy-ca", "orinda-most-trusted-cash-home-buyer-ca", "sell-my-house-fast-tracy"])
      expect(templateFlagFor(s, "page")).toBe("city");
  });
  it("leaves everything else unknown, never 'standard'", () => {
    expect(templateFlagFor("how-it-works-sell-your-house-fast-for-cash", "page")).toBe("unknown");
    expect(templateFlagFor("we-buy-houses-in-x", "post")).toBe("unknown");
  });
});
