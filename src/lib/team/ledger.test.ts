import { describe, expect, it } from "vitest";
import { claimRow, packSummary, remapClaimKeys, supportedClaims } from "./ledger";

describe("new Research claims get fresh ledger keys", () => {
  it("continues after the highest existing key, never reusing one", () => {
    const m = remapClaimKeys(["clm:1", "clm:12", "clm:7", "new:s2:1"], [{ id: "clm:1" }, { id: "clm:2" }, { id: "clm:3" }]);
    expect([...m.entries()]).toEqual([["clm:1", "clm:13"], ["clm:2", "clm:14"], ["clm:3", "clm:15"]]);
  });
  it("starts at clm:1 for an empty ledger and ignores non-clm keys", () => {
    expect(remapClaimKeys([], [{ id: "clm:9" }]).get("clm:9")).toBe("clm:1");
    expect(remapClaimKeys(["new:s2:4", "x"], [{ id: "a" }]).get("a")).toBe("clm:1");
  });
  it("only supported claims enter the ledger", () => {
    const mk = (id: string, support: string) => ({ id, support, text: "t", source_ids: [], jurisdiction: "California", risk: "low" });
    const claims = [mk("clm:1", "supported"), mk("clm:2", "unsupported"), mk("clm:3", "conflicting")];
    expect(supportedClaims(claims).map((c) => c.id)).toEqual(["clm:1"]);
  });
  it("a ledger row carries the claim, its source and quote, and who declared it", () => {
    const row = claimRow("a1", "clm:13", { id: "clm:1", text: "A seller must deliver the statement.", source_ids: ["src:1"], support: "supported", jurisdiction: "California", risk: "high", quote: "must deliver" }, "src-uuid", "2026-01-01", "thb-r1-legal-official", "2026-10-12", "hash");
    expect(row).toMatchObject({ article_id: "a1", claim_key: "clm:13", claim_text: "A seller must deliver the statement.", source_id: "src-uuid", supporting_passage: "must deliver", risk_level: "high", declared_by: "thb-r1-legal-official", support: "supported", text_hash: "hash" });
  });
  it("the ticket message names the new keys and what could not be proven", () => {
    expect(packSummary("R1", [{ key: "clm:13", text: "A seller must deliver the statement." }], ["a lien notice is always required"])).toBe('R1 answer. Added to the ledger: clm:13 "A seller must deliver the statement.". Could not prove: a lien notice is always required.');
    expect(packSummary("R2", [], [])).toBe("R2 answer. No claim was added to the ledger.");
  });
});
