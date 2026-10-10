// Inferred from URL slug only (no rendered-template proof). Anything not matching stays 'unknown'.
const CITY = [
  /^we-buy-houses-in-[a-z0-9-]+$/,
  /^sell-your-house-fast-in-[a-z0-9-]+-ca$/,
  /^sell-your-house-for-cash-in-[a-z0-9-]+-ca$/,
  /^[a-z0-9-]+-most-trusted-cash-home-buyer-ca$/,
  /^sell-my-house-fast-(?:ceres|modesto|oakdale|patterson|riverbank|sacramento|santa-cruz-ca|santa-rosa|stockton|tracy|turlock)$/,
  /^sell-my-home-in-danville$/,
];
export function templateFlagFor(slug: string, wpType: string): "city" | "unknown" {
  if (wpType !== "page") return "unknown";
  return CITY.some((re) => re.test(slug)) ? "city" : "unknown";
}
