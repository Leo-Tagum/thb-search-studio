import { describe, expect, it } from "vitest";
import { hasAuthorBox, hasSourcesSection, htmlToText, internalTargets, wordCount } from "./structure";
import { advisoryIssues, blockingIssues, runChecks } from "./checks";

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
  it("flags the 25+ years claim and a typed rating", () => {
    const f = runChecks("<p>With over 25 years of experience, rated 4.8/5 from 115 reviews.</p>");
    expect(f.pendingFacts.length).toBeGreaterThan(0);
    expect(f.ratingHits.length).toBeGreaterThan(0);
    expect(blockingIssues(f).join(" ")).toMatch(/rating/);
  });
  it("flags legal claims with no official source", () => {
    const f = runChecks("<p>Probate liens and capital gains tax apply. A code violation or a lien can block escrow.</p>");
    expect(f.legal.unsourced).toBe(true);
    expect(blockingIssues(f).join(" ")).toMatch(/official source/);
  });
  it("flags missing exact wording for sourced facts and generic filler", () => {
    const f = runChecks("<p>We are BBB accredited. Selling your house can be stressful. Contact us today for a fair offer.</p>");
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
