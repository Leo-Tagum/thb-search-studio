import { describe, expect, it } from "vitest";
import { applyProtectedImport, labelPairsCsv, parseProtectedList, pathOf, planProtectedImport, PROTECTED_ACTOR, PROTECTED_REASON, type KnownPage } from "./protected-import";
import type { AuditEvent } from "./orchestrator";
import type { Protection, ProtectionDb } from "./protection";

const LIST = `url,wp_id,state,reason
/a/,1,Published,seed
/b/,2,Published,seed
/c/,3,Published,seed
,4,Draft,seed
/old/,5,Retired-Draft-Redirected,seed
`;
const page = (id: string, url: string, wp: number | null, s: KnownPage["protection_status"] = "unknown"): KnownPage => ({ id, wp_id: wp, url: `https://www.twinhomebuyer.com${url}`, protection_status: s });

describe("protected-list import", () => {
  it("plans: marks unknown pages, leaves protected and not_protected alone, keeps retired apart", () => {
    const plan = planProtectedImport(parseProtectedList(LIST), [page("p1", "/a/", 1), page("p2", "/b/", 2, "protected"), page("p3", "/c/", 3, "not_protected")]);
    expect(plan.toMark.map((m) => m.page.id)).toEqual(["p1"]);
    expect(plan.alreadyProtected.map((m) => m.page.id)).toEqual(["p2"]);
    expect(plan.conflicts.map((m) => m.page.id)).toEqual(["p3"]);
    expect(plan.retiredUnmatched.map((r) => r.wpId)).toEqual([5]);
    expect(plan.otherUnmatched.map((r) => r.wpId)).toEqual([4]);
  });
  it("matches a blank URL by wp_id, and ignores trailing slash and host differences", () => {
    const plan = planProtectedImport(parseProtectedList(LIST), [page("p4", "/some-draft/", 4), { ...page("p1", "/a", 1), url: "https://twinhomebuyer.com/a" }]);
    expect(plan.toMark.map((m) => [m.page.id, m.how])).toEqual([["p1", "url"], ["p4", "wp_id"]]);
    expect(pathOf("https://www.twinhomebuyer.com/x")).toBe("/x/");
  });
  it("apply only ever sets protected, with the fixed reason and actor, and writes an audit event", async () => {
    const status = new Map<string, Protection>([["p1", "unknown"], ["p3", "not_protected"]]);
    const audit: AuditEvent[] = []; const reasons: string[] = []; const actors: string[] = [];
    const db: ProtectionDb = {
      getStatus: async (id) => status.get(id)!,
      setStatus: async (id, s, r, a) => { status.set(id, s); reasons.push(r); actors.push(a); },
      appendAudit: async (e) => { audit.push(e); },
    };
    const plan = planProtectedImport(parseProtectedList(LIST), [page("p1", "/a/", 1), page("p3", "/c/", 3, "not_protected")]);
    expect(await applyProtectedImport(plan, db)).toEqual(["p1"]);
    expect(status.get("p1")).toBe("protected");
    expect(status.get("p3")).toBe("not_protected");
    expect(reasons).toEqual([PROTECTED_REASON]); expect(actors).toEqual([PROTECTED_ACTOR]);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ event_type: "protection_marked", prior_state: "unknown", new_state: "protected" });
  });
  it("labels pairs; a retired protected URL makes the pair stale and not supported", () => {
    const csv = "pair_id,supported,a_url,b_url\n1,true,https://www.twinhomebuyer.com/old/,https://www.twinhomebuyer.com/x/\n2,true,https://www.twinhomebuyer.com/a/,https://www.twinhomebuyer.com/x/\n3,false,https://www.twinhomebuyer.com/x/,https://www.twinhomebuyer.com/y/\n";
    const { csv: out, summary } = labelPairsCsv(csv, parseProtectedList(LIST));
    expect(summary).toMatchObject({ pairs: 3, supportedBefore: 2, supportedAfter: 1, stale: 1, protectedLive: 1 });
    const lines = out.trim().split("\n");
    expect(lines[1]).toContain("stale (redirected),false");
    expect(lines[2]).toContain("true,false,protected,true");
    expect(lines[3]).toMatch(/,false,false,,false$/);
  });
});
