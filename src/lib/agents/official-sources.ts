// Agent 2 may cite only official public sources (Leo, 2026-10-10): .gov, ca.gov, courts, county/city government.
// Never competitor sites, never twinhomebuyer.com. Enforced here at submit time, and again by deny rules in .claude/settings.json.
const DENY = [/(^|\.)twinhomebuyer\.com$/i];
// Extra official county/city domains that do not end in .gov / .ca.us. Add after checking they are government sites.
const EXTRA_OFFICIAL = ["sfgov.org", "sccgov.org", "acgov.org", "cccounty.us", "smcgov.org", "sonomacounty.org", "countyofnapa.org", "marincounty.org"];

export function officialHost(host: string): { ok: boolean; reason: string } {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (DENY.some((r) => r.test(h))) return { ok: false, reason: "twinhomebuyer.com is not an allowed research source" };
  if (h.endsWith(".gov") || h === "gov") return { ok: true, reason: ".gov" };
  if (h.endsWith(".ca.us")) return { ok: true, reason: "California local government (.ca.us)" };
  if (EXTRA_OFFICIAL.some((d) => h === d || h.endsWith("." + d))) return { ok: true, reason: "allowlisted county/city domain" };
  return { ok: false, reason: `${h} is not on the official-source allowlist (.gov, .ca.us, listed county domains)` };
}

export function officialUrl(url: string): { ok: boolean; reason: string } {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, reason: "not an http(s) URL" };
    return officialHost(u.hostname);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }
}
