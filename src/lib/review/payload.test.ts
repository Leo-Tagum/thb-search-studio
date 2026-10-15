import { describe, expect, it } from "vitest";
import { buildPayload, checkPayload, renderPage } from "./payload";
import type { Card, PageInfo } from "./types";

const info = (url: string): PageInfo & { shots: [] } => ({ url, wpType: "page", visualType: "money page", confidence: "high", evidence: ["offer form above the fold"], purposeText: "sell a house", purposes: [], geography: "general", protected: false, changedSinceDecision: null, source: "rules", shots: [] });
const card = (over: Partial<Card> = {}): Card => ({ id: "c1", group: "MG5", row: { oldUrl: "https://www.twinhomebuyer.com/a/", newUrl: "https://www.twinhomebuyer.com/b/", status: "APPROVED", group: "MG5" }, existingDecision: "REDIRECT RECOMMENDATION", confirmedException: null, source: info("https://www.twinhomebuyer.com/a/"), destination: info("https://www.twinhomebuyer.com/b/"), flags: [], proposed: { kind: "none", text: "No change" }, ...over });

describe("review payload", () => {
  it("accepts a clean payload", () => { const r = checkPayload(buildPayload([card()], [], "x")); expect(r.problems).toEqual([]); });
  it("rejects inline images", () => { const c = card({ existingDecision: "data:image/png;base64,AAA" }); expect(checkPayload(buildPayload([c], [], "x")).problems.join()).toMatch(/inline image/); });
  it("rejects seller-identifying text in card text", () => { const c = card({ existingDecision: "story about 123 Maple Street" }); expect(checkPayload(buildPayload([c], [], "x")).problems.join()).toMatch(/seller-identifying/); });
  it("rejects a non-neutral screenshot filename and a bad asset id", () => {
    const c = card(); c.source.shots = [{ kind: "desktop-top", file: "maple-street.jpg", assetId: "zz", width: 1, height: 1, bytes: 1 }];
    const t = checkPayload(buildPayload([c], [], "x")).problems.join(); expect(t).toMatch(/non-neutral/); expect(t).toMatch(/bad asset id/);
  });
  it("rejects an oversized payload", () => { const c = card({ existingDecision: "x".repeat(700_000) }); expect(checkPayload(buildPayload([c], [], "x")).problems.join()).toMatch(/over the/); });
  it("escapes < so page text cannot close the script tag", () => { const c = card({ existingDecision: "</script><b>" }); const html = renderPage("<script>__PAYLOAD__</script>", buildPayload([c], [], "x")); expect(html.match(/<\/script>/g)?.length).toBe(1); });
});
