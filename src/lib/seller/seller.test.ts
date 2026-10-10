import { describe, expect, it } from "vitest";
import { checkPublishable, findIssues } from "./identity";
import { parseLibrary } from "./parse";
import { checkOutputPrivacy, packetPassages } from "./privacy-gate";

// Fixture text only: invented, not real seller data.
const FIXTURE = `# Seller Experience Library

## C-90: Fixture brief; condo
**Use level:** FULL  ·  **Calls:** 2 calls

**Property (general):** Fakeville, small condo

**Story (from calls):**
- They wanted a simple, quick sale without managing repairs.
- Their sister who works as a nurse helped them decide.
- They said "we just wanted it done" and paid HOA of $950 a month (Jun 29).

**Worries and how THB handled them:**
- Unsure about repairs → As-is purchase.

**Permission:** None.

**Don't write about:**
- the closing date.
`;

describe("identity-pattern check", () => {
  it("rejects a test brief containing a street address and an exact price", () => {
    const r = checkPublishable("The house at 123 Maple Street sold for $850,000 last spring.");
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.kind)).toEqual(expect.arrayContaining(["street_address", "amount"]));
  });
  it("rejects personal names", () => {
    expect(checkPublishable("Mrs. Alvarez called us.").ok).toBe(false);
    expect(checkPublishable("The seller, named Dana, agreed.").ok).toBe(false);
  });
  it("passes a clean brief passage", () => {
    expect(checkPublishable("They wanted a simple, quick sale without managing repairs.").ok).toBe(true);
  });
});

describe("parse and classify", () => {
  const [b] = parseLibrary(FIXTURE);
  it("imports the brief with use level and permission", () => {
    expect(b.caseId).toBe("C-90");
    expect(b.useLevel).toBe("FULL");
    expect(b.permissionText).toContain("None");
  });
  it("tags amounts, dates, quotes, family/occupation, and property detail as internal-only / not for publication", () => {
    const by = (needle: string) => b.passages.find((p) => p.text.includes(needle))!;
    expect(by("HOA").visibility).toBe("internal_only");
    expect(by("HOA").notForPublication).toBe(true);
    expect(by("nurse").internalReasons).toContain("family_or_occupation_detail");
    expect(by("Fakeville").visibility).toBe("internal_only");
    expect(by("simple, quick sale").visibility).toBe("publishable");
    expect(by("Unsure about repairs").visibility).toBe("publishable");
  });
  it("does not store a street address or personal name, and reports it", () => {
    const [x] = parseLibrary(FIXTURE.replace("They wanted a simple", "Mr. Okafor at 45 Pine Avenue wanted a simple"));
    expect(x.rejected.map((r) => r.issue.kind).sort()).toEqual(["person_name", "street_address"]);
    expect(x.passages.some((p) => p.text.includes("Pine"))).toBe(false);
  });
});

describe("privacy gate", () => {
  const [b] = parseLibrary(FIXTURE);
  const internal = b.passages.filter((p) => p.visibility === "internal_only").map((p) => ({ text: p.text, reasons: p.internalReasons }));
  it("blocks a draft that carries an internal-only detail with BLOCKED_PRIVACY", () => {
    const r = checkOutputPrivacy("One seller paid HOA of $950 a month and wanted it done.", internal);
    expect(r).toMatchObject({ ok: false, state: "BLOCKED_PRIVACY" });
  });
  it("blocks a draft that copies an internal-only passage with no pattern in it", () => {
    const r = checkOutputPrivacy("Their sister who works as a nurse helped them decide, which many families do.", internal);
    expect(r.ok).toBe(false);
  });
  it("passes a clean draft", () => {
    expect(checkOutputPrivacy("Many sellers want a quick sale without managing repairs.", internal).ok).toBe(true);
  });
  it("writer evidence packets carry publishable passages only", () => {
    const p = packetPassages(b.passages);
    expect(p.every((x) => x.visibility === "publishable")).toBe(true);
    expect(p.length).toBeGreaterThan(0);
  });
});

describe("findIssues", () => { it("finds exact dates", () => { expect(findIssues("closed Jul 29 2026").map((i) => i.kind)).toContain("exact_date"); }); });

describe("classify", () => {
  it("flags a shared-first-name note and a sibling's occupation as internal-only", () => {
    expect(parseLibrary(FIXTURE)[0] && true).toBe(true);
    const f = (t: string) => parseLibrary(`## C-91: x\n**Use level:** FULL\n**Story (from calls):**\n- ${t}\n`)[0].passages[0];
    expect(f("the mix-up came from her and her mother sharing a first name").internalReasons).toContain("shared_name_detail");
    expect(f("his sister, a real estate broker, reviewed each version").internalReasons).toContain("family_or_occupation_detail");
  });
});
