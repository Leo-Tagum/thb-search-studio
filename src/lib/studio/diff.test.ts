import { describe, expect, it } from "vitest";
import { changed, lineDiff, liveVsProposed, updateViolations } from "./diff";

describe("section diff", () => {
  it("shows added, removed and unchanged lines", () => {
    const d = lineDiff(["a", "b", "c"], ["a", "x", "c", "d"]);
    expect(d.map((l) => `${l.kind}:${l.text}`)).toEqual(["same:a", "del:b", "add:x", "same:c", "add:d"]);
    expect(changed(d)).toBe(true);
    expect(changed(lineDiff(["a"], ["a"]))).toBe(false);
  });
  it("live vs proposed for one section", () => expect(liveVsProposed("one\ntwo", "one\nthree").some((l) => l.kind === "add" && l.text === "three")).toBe(true));
});

describe("UPDATE guard: untouched sections stay byte for byte", () => {
  const live = [{ key: "s1", text: "Intro as published." }, { key: "s2", text: "Old repairs section." }, { key: "s3", text: "Faq as published." }];
  it("allows a change only to the sections named in the change request", () => {
    expect(updateViolations(live, [live[0], { key: "s2", text: "New repairs section." }, live[2]], ["s2"])).toEqual([]);
  });
  it("refuses a rewrite of an untouched section", () => {
    expect(updateViolations(live, [{ key: "s1", text: "Intro, improved." }, live[1], live[2]], ["s2"]).join()).toContain("untouched section s1 was rewritten");
  });
  it("refuses removing an untouched section or adding an unrequested one", () => {
    expect(updateViolations(live, [live[0], live[1]], ["s2"]).join()).toContain("s3 was removed");
    expect(updateViolations(live, [...live, { key: "s4", text: "New." }], ["s2"]).join()).toContain("new section s4");
  });
});
