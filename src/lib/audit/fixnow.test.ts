import { describe, expect, it } from "vitest";
import { blockingIssues, runChecks } from "./checks";

const fix = (html: string) => runChecks(html).fixNow.map((x) => x.fact);

describe("audit fix list: founder, $32M and closing-time claims (Leo, 2026-10-10)", () => {
  it("flags 'founder' as an owner/title claim", () => expect(fix("<p>Juan Diaz is the founder of Twin Home Buyer.</p>")).toEqual([expect.stringContaining("founder")]));
  it("flags $32M saved fees", () => expect(fix("<p>Our track record includes more than $32M in saved fees.</p>")).toEqual([expect.stringContaining("$32M")]));
  it.each([
    "Our track record includes cash closing options as fast as 7 days.",
    "We can close in 7 days.",
    "Get a cash offer and close within 10 days.",
  ])("flags a closing timeframe: %s", (t) => expect(fix(`<p>${t}</p>`).some((f) => f.includes("closing timeframe"))).toBe(true));
  it("does not flag statutory day counts or ordinary text", () => {
    expect(fix("<p>The buyer has 30 days to remove contingencies after acceptance, and the seller gives disclosures promptly.</p>")).toEqual([]);
    expect(fix("<p>Selling an older home takes planning.</p>")).toEqual([]);
  });
  it("these claims become blocking issues, so the post lands on the UPDATE fix list", () => {
    const f = runChecks("<p>Juan Diaz is the founder. We help families, with cash closing options as fast as 7 days and $32M saved.</p>");
    const issue = blockingIssues(f).find((i) => i.startsWith("claims the Studio blocks"));
    expect(issue).toContain("founder");
    expect(issue).toContain("$32M");
    expect(issue).toContain("7 days");
  });
  it("a clean post stays off the list", () => expect(blockingIssues(runChecks("<p>Plain advice with no claims.</p>")).some((i) => i.includes("Studio blocks"))).toBe(false));
});
