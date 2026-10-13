// Phase 3e / Stage 6 part A: the allowed-jurisdiction list of ONE article, and print requests.
// State law and local law are separate layers (SR-2). Which layers an article may speak about is decided per article (Leo; Juan's Bay Area direction), not hard-coded to California:
// the list lives in the brief's outline (`allowed_jurisdictions`), defaults to ["California"], and every claim's jurisdiction must be on it. A claim for a jurisdiction that is not
// on the list is refused, and so is a print request for one. "San Mateo County" (the county's unincorporated areas) and "City of San Mateo" are DIFFERENT jurisdictions.
export const DEFAULT_JURISDICTIONS = ["California"];

const ALIASES: [string, string[]][] = [
  ["california", ["california", "state of california", "california state law", "ca"]],
  ["san francisco", ["san francisco", "city and county of san francisco", "city & county of san francisco", "ccsf", "sf"]],
  ["san mateo county", ["san mateo county", "county of san mateo", "county of san mateo (unincorporated areas)", "san mateo county (unincorporated areas)", "unincorporated san mateo county"]],
  ["city of san mateo", ["city of san mateo", "san mateo (city)"]],
  ["oakland", ["oakland", "city of oakland"]],
  ["alameda county", ["alameda county", "county of alameda"]],
];
const clean = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
/** One canonical key per jurisdiction ("City and County of San Francisco" and "San Francisco" are the same one; the county of San Mateo and the city of San Mateo are not). */
export function jurisdictionKey(name: string): string {
  const n = clean(name);
  for (const [key, names] of ALIASES) if (names.includes(n)) return key;
  return n;
}
export const sameJurisdiction = (a: string, b: string) => jurisdictionKey(a) === jurisdictionKey(b);
export const jurisdictionAllowed = (name: string, allowed: string[]): boolean => allowed.some((a) => sameJurisdiction(name, a));

/** The list of one article, from its brief outline. Anything malformed falls back to California only (the narrowest). */
export function allowedJurisdictionsOf(outline: unknown): string[] {
  const l = (outline as { allowed_jurisdictions?: unknown } | null | undefined)?.allowed_jurisdictions;
  if (!Array.isArray(l)) return [...DEFAULT_JURISDICTIONS];
  const out = l.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
  return out.length ? [...new Set(out)] : [...DEFAULT_JURISDICTIONS];
}
/** A local jurisdiction is any allowed jurisdiction that is not California: its rules need their own claim and their own print (SR-2, SR-4). */
export const isLocalJurisdiction = (name: string) => jurisdictionKey(name) !== "california";

// ---------- print requests ----------
export type PrintRequest = { jurisdiction: string; code: string; section: string; title: string; url: string | null; why: string };
const CODE_HOSTS = ["amlegal.com", "municode.com", "law.cityofsanmateo.org", "ecode360.com", "library.qcode.us"];
const sectionNumber = (s: string) => /\d[\d.]*[a-z]?/i.exec(s)?.[0]?.toLowerCase() ?? null;

/**
 * Print requests are what Agent 2 and R1 give Leo instead of a guess: the exact official section to print, with where to find it. A request is refused when it is for a jurisdiction that
 * is not on the article's list, when the same section is already stored in the Evidence Library, or when its URL is not an official host or a known official code publisher.
 */
export function printRequestErrors(requests: PrintRequest[], opts: { allowed?: string[]; library?: { title: string; jurisdiction: string }[]; officialUrl?: (u: string) => { ok: boolean; reason: string } }): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  requests.forEach((r, i) => {
    const at = `print request ${i + 1} (${r.code} ${r.section})`;
    if (opts.allowed && !jurisdictionAllowed(r.jurisdiction, opts.allowed)) errs.push(`${at}: ${r.jurisdiction} is not on this article's allowed-jurisdiction list (${opts.allowed.join(", ")}); ask Leo before requesting it`);
    const key = `${jurisdictionKey(r.jurisdiction)}|${clean(r.code)}|${clean(r.section)}`;
    if (seen.has(key)) errs.push(`${at}: asked for twice`); seen.add(key);
    const num = sectionNumber(r.section);
    if (num) for (const s of opts.library ?? []) if (sameJurisdiction(s.jurisdiction, r.jurisdiction) && new RegExp(`(?:^|[^\\d.])${num.replace(/\./g, "\\.")}(?:$|[^\\d])`, "i").test(s.title) && !/table of contents/i.test(s.title)) errs.push(`${at}: the Evidence Library already holds "${s.title}"; use it instead of asking for a print`);
    if (r.url) {
      let host = ""; try { host = new URL(r.url).hostname.toLowerCase().replace(/^www\./, ""); } catch { errs.push(`${at}: the URL is not valid`); return; }
      const official = opts.officialUrl?.(r.url).ok ?? false;
      if (!official && !CODE_HOSTS.some((h) => host === h || host.endsWith("." + h))) errs.push(`${at}: ${host} is not an official site or a known official code publisher`);
    }
  });
  return errs;
}

/** Every claim's jurisdiction must be on the article's list. Applies to every claim, supported or not: an unsupported local claim is a request for a print, not a claim. */
export function jurisdictionErrors(claims: { id?: string; jurisdiction?: string; support?: string }[], allowed: string[]): string[] {
  const errs: string[] = [];
  for (const c of claims) if (c.jurisdiction && !jurisdictionAllowed(c.jurisdiction, allowed)) errs.push(`claim ${c.id}: its jurisdiction "${c.jurisdiction}" is not on this article's allowed-jurisdiction list (${allowed.join(", ")}); ask Leo to add it, or drop the claim`);
  return errs;
}
