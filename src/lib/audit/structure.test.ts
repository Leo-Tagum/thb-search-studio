import { describe, expect, it } from "vitest";
import { hasAuthorBox, hasSourcesSection, htmlToText, internalTargets, wordCount } from "./structure";
import { advisoryIssues, blockingIssues, pendingJuanClaims, runChecks } from "./checks";

const clean = `<h2>What can delay a probate sale?</h2><p>Juan Diaz has been investing in Bay Area real estate since 2002. Title, authority and tenants decide whether escrow closes. Confirm with an attorney or your title company.</p><a href="https://courts.ca.gov/x">Courts</a><h2>Sources</h2><p>About the author</p>`;

describe("structure", () => {
  it("counts words and strips markup/entities", () => {
    expect(htmlToText("<p>Tom &amp; Jerry</p><script>x()</script>")).toBe("Tom & Jerry");
    expect(wordCount("one two three")).toBe(3);
  });
  it("finds internal link targets, ignoring self, anchors, images and external links", () => {
    const html = `<a href="/a/">a</a><a href="https://www.twinhomebuyer.com/b/">b</a><a href="/me/">me</a><a href="#x">x</a><a href="https://other.com/c">c</a><img src="/u.png"><a href="/u.png">i</a>`;
    expect(internalTargets(html, "https://www.twinhomebuyer.com", "https://www.twinhomebuyer.com/me/").sort()).toEqual(["twinhomebuyer.com/a", "twinhomebuyer.com/b"]);
  });
  it("detects sources section and author box", () => {
    expect(hasSourcesSection(clean)).toBe(true);
    expect(hasAuthorBox(clean)).toBe(true);
    expect(hasSourcesSection("<p>x</p>")).toBe(false);
  });
});

describe("content checks", () => {
  it("a clean post raises no blocking or advisory issue", () => {
    const f = runChecks(clean);
    expect(blockingIssues(f)).toEqual([]);
    expect(advisoryIssues(f)).toEqual([]);
  });
  it("flags competitor links and images", () => {
    const f = runChecks(`<a href="https://www.redfin.com/x">r</a><img src="https://zillow.com/b.png">`);
    expect(f.competitors.map((c) => c.domain).sort()).toEqual(["redfin.com", "zillow.com"]);
  });
  it("experience years: approved wordings pass, exact counts and other wordings are wrong years (group A)", () => {
    const ok = runChecks("<p>Juan Diaz has 25+ years of experience in Bay Area real estate and has been investing since 2002.</p><p>Juan brings 25+ years of experience in Bay Area real estate.</p>");
    expect(ok.wrongYears).toEqual([]);
    expect(ok.sourcedFactIssues).toEqual([]);
    for (const bad of ["27 years of experience", "24 years of experience", "over 25 years serving sellers", "20+ years of experience", "25+ years in business", "I have spent 27 years buying, repairing, and rebuilding houses"]) {
      const f = runChecks(`<p>Juan has ${bad}.</p>`);
      expect(f.wrongYears.length, bad).toBeGreaterThan(0);
      expect(blockingIssues(f).join(" "), bad).toMatch(/experience years/);
    }
  });
  it("2002 as a founding year is a group A problem", () => {
    expect(runChecks("<p>Twin Home Buyer was founded in 2002.</p>").sourcedFactIssues.join()).toMatch(/founding year/);
  });
  it("typed rating is group A; pending-Juan claims are group B only", () => {
    const r = runChecks("<p>Rated 4.8/5 from 115 reviews.</p>");
    expect(r.ratingHits.length).toBeGreaterThan(0);
    expect(blockingIssues(r).join(" ")).toMatch(/rating/);
    const b = runChecks("<p>We respond within 24 hours. Our licensed general contractor team handles repairs.</p>");
    expect(blockingIssues(b)).toEqual([]);
    expect(pendingJuanClaims(b).map((c) => c.fact).join(" ")).toMatch(/24 hours[\s\S]*contractor license/);
    // Leo 2026-10-10: a closing timeframe, $32M and "founder" are fix-list items (group A), not just waiting on Juan.
    expect(blockingIssues(runChecks("<p>We close in 7 days.</p>")).join(" ")).toMatch(/Studio blocks/);
  });
  it("flags legal claims with no official source", () => {
    const f = runChecks("<p>Probate liens and capital gains tax apply. A code violation or a lien can block escrow.</p>");
    expect(f.legal.unsourced).toBe(true);
    expect(blockingIssues(f).join(" ")).toMatch(/official source/);
  });
  it("flags missing exact wording for sourced facts and generic filler; missing Sources only matters when legal claims exist", () => {
    const f = runChecks("<p>We are BBB accredited. Selling your house can be stressful. Contact us today for a fair offer.</p>");
    expect(blockingIssues(runChecks("<p>A plain post with no legal terms.</p>")).join()).not.toMatch(/Sources/);
    expect(blockingIssues(runChecks("<p>Probate and a lien apply. Confirm with an attorney.</p>")).join()).toMatch(/Sources section/);
    expect(f.sourcedFactIssues.length).toBe(1);
    expect(f.filler.length).toBeGreaterThanOrEqual(3);
  });
});

import { findBoilerplate, stripBoilerplate } from "./structure";
describe("template blocks", () => {
  it("separates shared text from a post's own writing", () => {
    const tpl = "See All 115 Reviews Recent Blog Posts Expert tips here.";
    const posts = Array.from({ length: 9 }, (_, i) => `Own sentence number ${i} about probate.\n${tpl}`);
    const shared = findBoilerplate(posts, 8);
    expect(shared.size).toBe(1);
    expect(stripBoilerplate(posts[3], shared)).toBe("Own sentence number 3 about probate.");
  });
});
