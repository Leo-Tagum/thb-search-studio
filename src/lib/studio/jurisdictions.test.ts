import { describe, expect, it } from "vitest";
import { allowedJurisdictionsOf, isLocalJurisdiction, jurisdictionAllowed, jurisdictionErrors, jurisdictionKey, printRequestErrors, sameJurisdiction, type PrintRequest } from "./jurisdictions";
import { agent2Result } from "../agents/schemas";
import { officialUrl } from "../agents/official-sources";

// Stage 6 part A: the per-article allowed-jurisdiction list and print requests. Names of laws here are only used as labels; no legal text is quoted or invented.
describe("jurisdictions are separate layers", () => {
  it("City and County of San Francisco is San Francisco; the county of San Mateo is not the city of San Mateo", () => {
    expect(sameJurisdiction("City and County of San Francisco", "San Francisco")).toBe(true);
    expect(sameJurisdiction("County of San Mateo (unincorporated areas)", "San Mateo County")).toBe(true);
    expect(sameJurisdiction("San Mateo County", "City of San Mateo")).toBe(false);
    expect(sameJurisdiction("San Francisco", "San Mateo County")).toBe(false);
    expect(jurisdictionKey("  State of California ")).toBe("california");
    expect(isLocalJurisdiction("California")).toBe(false);
    expect(isLocalJurisdiction("San Francisco")).toBe(true);
  });
  it("the list belongs to the article (its brief outline); it defaults to California and a malformed list falls back to California", () => {
    expect(allowedJurisdictionsOf({})).toEqual(["California"]);
    expect(allowedJurisdictionsOf(null)).toEqual(["California"]);
    expect(allowedJurisdictionsOf({ allowed_jurisdictions: "San Francisco" })).toEqual(["California"]);
    expect(allowedJurisdictionsOf({ allowed_jurisdictions: [" ", 3] })).toEqual(["California"]);
    expect(allowedJurisdictionsOf({ allowed_jurisdictions: ["California", "San Francisco", "San Francisco"] })).toEqual(["California", "San Francisco"]);
  });
  it("a claim for a jurisdiction that is not on the list is refused (supported or not)", () => {
    const allowed = ["California", "City and County of San Francisco"];
    expect(jurisdictionAllowed("San Francisco", allowed)).toBe(true);
    const errs = jurisdictionErrors([{ id: "clm:1", jurisdiction: "California" }, { id: "clm:2", jurisdiction: "San Francisco" }, { id: "clm:3", jurisdiction: "San Mateo County", support: "unsupported" }, { id: "clm:4", jurisdiction: "Oakland" }], allowed);
    expect(errs).toHaveLength(2);
    expect(errs.join()).toContain("clm:3"); expect(errs.join()).toContain("clm:4");
    expect(jurisdictionErrors([{ id: "clm:1", jurisdiction: "San Francisco" }], ["California"]).join()).toContain("allowed-jurisdiction list");
  });
});

describe("print requests: a missing print is a request to Leo, never a guess", () => {
  const req = (over: Partial<PrintRequest> = {}): PrintRequest => ({ jurisdiction: "San Mateo County", code: "San Mateo County Ordinance Code", section: "find by title", title: "Property maintenance (nuisance abatement) chapter", url: "https://library.municode.com/ca/san_mateo_county/codes/code_of_ordinances", why: "The guide's local section needs the county's own wording before it can say anything about it.", ...over });
  const lib = [{ title: "SF Housing Code - Section 351 - Report of Residential Building Record", jurisdiction: "City and County of San Francisco" }, { title: "San Mateo County Ordinance Code - Table of Contents", jurisdiction: "County of San Mateo (unincorporated areas)" }];
  const check = (r: PrintRequest[], allowed = ["California", "San Francisco", "San Mateo County"]) => printRequestErrors(r, { allowed, library: lib, officialUrl });
  it("a request for something not stored passes", () => {
    expect(check([req()])).toEqual([]);
    expect(check([req({ jurisdiction: "San Francisco", code: "San Francisco Housing Code", section: "401", title: "Substandard buildings", url: "https://codelibrary.amlegal.com/codes/san_francisco/latest/sf_housing/0-0-0-1" })])).toEqual([]);
  });
  it("a section the Evidence Library already holds is refused; a table of contents does not count as holding a section", () => {
    expect(check([req({ jurisdiction: "San Francisco", code: "San Francisco Housing Code", section: "351", title: "Report of Residential Building Record" })]).join()).toContain("already holds");
    expect(check([req({ section: "101" })])).toEqual([]);
  });
  it("a jurisdiction that is not on the article's list is refused", () => {
    expect(check([req({ jurisdiction: "Oakland", code: "Oakland Municipal Code" })]).join()).toContain("not on this article's allowed-jurisdiction list");
  });
  it("the URL must be an official site or a known official code publisher; a blog or a law-firm page is refused; the same request twice is refused", () => {
    expect(check([req({ url: "https://www.some-law-firm.com/hoarding-sf" })]).join()).toContain("not an official site");
    expect(check([req({ url: "not a url" })]).join()).toContain("not valid");
    expect(check([req({ url: null })])).toEqual([]);
    expect(check([req(), req()]).join()).toContain("asked for twice");
  });
  it("the Agent 2 and R1 result schema carries print_requests (none by default) and refuses a vague one", () => {
    const base = { sources: [], claims: [], brand_facts_pending: [], first_party_proof: "available" as const, unresolved: [] };
    expect(agent2Result.parse(base).print_requests).toEqual([]);
    expect(agent2Result.safeParse({ ...base, print_requests: [req()] }).success).toBe(true);
    expect(agent2Result.safeParse({ ...base, print_requests: [{ ...req(), why: "needed" }] }).success).toBe(false);
    expect(agent2Result.safeParse({ ...base, print_requests: [{ ...req(), extra: 1 }] }).success).toBe(false);
  });
});
