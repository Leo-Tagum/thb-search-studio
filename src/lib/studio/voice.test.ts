import { describe, expect, it } from "vitest";
import { buildVoiceReference, CANDIDATES, excerptProblems, plainText } from "./voice";

describe("voice reference excerpt screening", () => {
  const blocked: [string, string][] = [
    ["a closing time", "We can close on the seller's timeline, as fast as 7 days."],
    ["$32M", "Our track record includes more than $32M in saved fees."],
    ["company-since-2002", "We have operated in the Bay Area since 2002."],
    ["founder", "As the founder I built this company."],
    ["a rating", "Rated five stars by our sellers."],
    ["a capability claim", "We buy houses in any condition."],
    ["legal wording", "You must disclose known problems to the buyer."],
    ["as-is claim", "We buy as-is."],
    ["a digit", "Maybe the owner has lived there for 40 years."],
  ];
  for (const [name, text] of blocked) it(`rejects an excerpt with ${name}`, () => expect(excerptProblems(text).length).toBeGreaterThan(0));
  it("accepts a plain style sentence", () => expect(excerptProblems("Getting clarity early usually creates more options, not fewer.")).toEqual([]));
  it("every curated candidate is clean", () => { for (const c of CANDIDATES) expect(excerptProblems(c.text), c.text).toEqual([]); });
});

describe("buildVoiceReference", () => {
  const bodies = {
    older_home: "<p>Age alone isn&#8217;t the problem. A 100-year-old house can be fine.</p>",
    juan_page: "<p>Confidence does not need urgency to survive scrutiny.</p><p>We can close in 7 days.</p>",
    belongings: "<p>Sometimes it is a family history problem.</p>",
  };
  it("keeps only excerpts found verbatim in the stored body; rejects the rest with reasons", () => {
    const { ref, rejected } = buildVoiceReference(bodies, "2026-10-10");
    const texts = ref.excerpts.map((e) => e.text);
    expect(texts).toContain("Age alone isn't the problem.");
    expect(texts).toContain("Confidence does not need urgency to survive scrutiny.");
    expect(rejected.some((r) => r.problems[0].includes("not found verbatim"))).toBe(true);
    expect(JSON.stringify(ref)).not.toMatch(/7 days|\$32M/);
  });
  it("content hash changes when the excerpts change", () => {
    const a = buildVoiceReference(bodies, "d").ref.content_hash;
    const b = buildVoiceReference({ ...bodies, belongings: bodies.belongings + "<p>Many families do not need to be judged. They need time, clarity, and a practical way to move forward.</p>" }, "d").ref.content_hash;
    expect(a).not.toBe(b);
  });
  it("plainText decodes entities and strips style and tags", () => expect(plainText("<style>.a{}</style><p>It&#8217;s &amp; fine</p>")).toBe("It's & fine"));
});
