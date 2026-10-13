import { describe, expect, it } from "vitest";
import { FP2_COLUMNS, fingerprintV2FromRows, hashRowsV2 } from "./fingerprint-v2";

// Fingerprint v2 must not move when a table gains a column (migration 0020 moved v1 that way), must not depend on the order rows come back in,
// and must still move when a real value changes.
const claim = (n: number, over: Record<string, unknown> = {}) => ({ id: `00000000-0000-0000-0000-00000000000${n}`, article_id: "a", claim_key: `clm:${n}`, claim_text: `text ${n}`, risk_level: "high", support: "supported", ...over });
const rows = () => ({ claims: [claim(1), claim(2), claim(3)], articles: [{ id: "a", title: "T", state: "HUMAN_REVIEW" }] });

describe("fingerprint v2", () => {
  it("the column lists cover every table v1 hashed, each with an id for ordering", () => {
    expect(Object.keys(FP2_COLUMNS).sort()).toEqual(["agent_runs", "approvals", "article_sections", "article_versions", "articles", "audit_events", "briefs", "claims", "escalations", "proposals", "section_reviews", "section_versions", "team_runs", "tickets"]);
    for (const [t, cols] of Object.entries(FP2_COLUMNS)) expect(cols, t).toContain("id");
  });

  it("adding a nullable column to a table does not change v2", () => {
    const before = fingerprintV2FromRows(rows());
    const after = fingerprintV2FromRows({ ...rows(), claims: rows().claims.map((c) => ({ ...c, quote_full: null, verification_label: null, gates: [], reader_impact: null })) });
    expect(after).toEqual(before);
    // a column filled with a value does not change it either: v2 never reads a column that is not on the baseline list
    const filled = fingerprintV2FromRows({ ...rows(), claims: rows().claims.map((c) => ({ ...c, verification_label: "MATCH", quote_full: "a quote" })) });
    expect(filled.total).toBe(before.total);
  });

  it("the order rows come back in does not change v2", () => {
    const a = fingerprintV2FromRows(rows());
    const b = fingerprintV2FromRows({ ...rows(), claims: [...rows().claims].reverse() });
    expect(b.total).toBe(a.total);
  });

  it("a change to a baseline column does change v2, and only that table's part", () => {
    const a = fingerprintV2FromRows(rows());
    const b = fingerprintV2FromRows({ ...rows(), claims: [claim(1), claim(2, { claim_text: "changed" }), claim(3)] });
    expect(b.total).not.toBe(a.total);
    expect(b.parts.claims.hash).not.toBe(a.parts.claims.hash);
    expect(b.parts.articles).toEqual(a.parts.articles);
  });

  it("a missing or an extra row changes the count and the hash", () => {
    const a = hashRowsV2("claims", rows().claims);
    const b = hashRowsV2("claims", rows().claims.slice(0, 2));
    expect(b.count).toBe(2);
    expect(b.hash).not.toBe(a.hash);
  });
});
