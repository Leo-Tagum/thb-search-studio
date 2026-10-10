/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scoreIssues, STUDIO_AGENT_KEYS, studioOutputSchemas, studioSemanticChecks, type StudioValidationCtx } from "./agents";
import type { CheckCtx, LedgerClaim } from "./checks";
import type { Section } from "./schema";

const claims = new Map<string, LedgerClaim>([["clm:1", { id: "clm:1", text: "Civil Code section 1102 applies to a transfer by sale.", risk: "high", support: "supported", sourceId: "src", sourceRecheckBy: null, jurisdiction: "California" }]]);
const check: CheckCtx = { today: "2026-10-10", claims, approvedFactTexts: [], allowedLinks: [], sourceUrls: [], internalPassages: [], allowedJurisdictions: ["California"], blockedPhrases: [], briefH2: { s2: "What do you have to disclose?" }, keyword: "x" };
const unit: Section = { kind: "section", key: "s2", h2: "What do you have to disclose?", blocks: [{ t: "p", text: "Civil Code section 1102 applies to a transfer by sale. Ask an attorney." }], claim_ids: ["clm:1"], roles: [] };
const ctx = (o: Partial<StudioValidationCtx> = {}): StudioValidationCtx => ({
  packet: { agent_key: "thb-05-fact-privacy-auditor", prompt_version: "1.0.0", unit_key: "s2", unit_hash: "h1", allowed_claim_ids: ["clm:1"], opportunity_id: "o1", article_id: "a1" },
  currentUnit: unit, currentHash: "h1", check, voiceUsable: true, requiredIssuesOpen: [], ...o,
});
const env = (agent: string, decision: string, result: object, findings: object[] = []) => ({
  article_id: "a1", opportunity_id: "o1", agent_name: "x", agent_prompt_version: "1.0.0", model_version: "claude-code/test", input_version_ids: ["h1"], decision, findings,
  evidence_ids: [], required_actions: [], output_version_id: "v1", timestamp: "2026-10-10T12:00:00Z", result, _agent: agent,
});
const strip = ({ _agent, ...rest }: any) => { void _agent; return rest; };
const a5 = (o: any = {}, decision = "PASS", findings: object[] = []) => strip(env("5", decision, { unit_key: "s2", version_hash: "h1", claim_checks: [{ claim_id: "clm:1", verdict: "supported_as_written", note: "ok" }], privacy_ok: true, legal_qualification_ok: true, ...o }, findings));

describe("schemas are strict: no output can set an approval, a lock or a state", () => {
  for (const extra of ["approved", "locked", "next_state", "state", "approval"]) {
    it(`rejects an extra "${extra}" key on every agent`, () => {
      for (const k of STUDIO_AGENT_KEYS) {
        const bad = { ...a5(), [extra]: true };
        expect(studioOutputSchemas[k].safeParse(bad).success).toBe(false);
      }
    });
  }
  it("rejects a nested approval key inside a result", () => {
    expect(studioOutputSchemas["thb-05-fact-privacy-auditor"].safeParse(a5({ approved: true })).success).toBe(false);
  });
});

describe("Agent 5 cannot pass its own assumptions", () => {
  const parse = (o: any) => studioOutputSchemas["thb-05-fact-privacy-auditor"].parse(o) as any;
  it("a clean PASS is accepted", () => expect(studioSemanticChecks("thb-05-fact-privacy-auditor", parse(a5()), ctx())).toEqual([]));
  it("PASS is refused when a claim verdict is not supported_as_written", () => {
    const o = parse(a5({ claim_checks: [{ claim_id: "clm:1", verdict: "altered", note: "30 -> 60" }] }));
    expect(studioSemanticChecks("thb-05-fact-privacy-auditor", o, ctx()).join()).toContain("PASS is not allowed while claim clm:1 is altered");
  });
  it("PASS is refused when claim_checks do not cover every cited claim", () => {
    expect(studioSemanticChecks("thb-05-fact-privacy-auditor", parse(a5({ claim_checks: [] })), ctx()).join()).toContain("must cover every claim");
  });
  it("PASS is refused when the deterministic check finds a blocking problem the agent missed", () => {
    const bad: Section = { ...unit, blocks: [{ t: "p", text: "Civil Code section 1102.9 gives you 30 days." }] };
    expect(studioSemanticChecks("thb-05-fact-privacy-auditor", parse(a5()), ctx({ currentUnit: bad })).join()).toContain("deterministic check found UNCOVERED_FIGURE");
  });
  it("PASS is refused with privacy_ok false or legal_qualification_ok false", () => {
    expect(studioSemanticChecks("thb-05-fact-privacy-auditor", parse(a5({ privacy_ok: false })), ctx()).length).toBeGreaterThan(0);
    expect(studioSemanticChecks("thb-05-fact-privacy-auditor", parse(a5({ legal_qualification_ok: false })), ctx()).length).toBeGreaterThan(0);
  });
  it("a review of a different version is refused", () => {
    expect(studioSemanticChecks("thb-05-fact-privacy-auditor", parse(a5({ version_hash: "old" })), ctx()).join()).toContain("different version");
  });
  it("REVISION needs a required finding; BLOCKED needs a block_kind", () => {
    expect(studioSemanticChecks("thb-05-fact-privacy-auditor", parse(a5({}, "REVISION")), ctx()).join()).toContain("required finding");
    expect(studioSemanticChecks("thb-05-fact-privacy-auditor", parse(a5({}, "BLOCKED", [{ issue_key: "fact:x", severity: "required", note: "unsupported" }])), ctx()).join()).toContain("block_kind");
  });
});

describe("Agent 4 cannot add claims or fill gaps", () => {
  const w = (result: object, decision = "PASS") => strip(env("4", decision, { unit_key: "s2", addresses: [], change_note: "written", ...result }));
  const c4 = () => ctx({ packet: { ...ctx().packet, agent_key: "thb-04-section-writer" } });
  it("accepts a section that cites ledger claims", () => expect(studioSemanticChecks("thb-04-section-writer", studioOutputSchemas["thb-04-section-writer"].parse(w({ unit })) as any, c4())).toEqual([]));
  it("refuses a claim id that is not in the packet's ledger", () => {
    const o = studioOutputSchemas["thb-04-section-writer"].parse(w({ unit: { ...unit, claim_ids: ["new:s2:1"] } })) as any;
    expect(studioSemanticChecks("thb-04-section-writer", o, c4()).join()).toContain("cannot add claims");
  });
  it("a revision must answer every open issue", () => {
    const o = studioOutputSchemas["thb-04-section-writer"].parse(w({ unit })) as any;
    expect(studioSemanticChecks("thb-04-section-writer", o, { ...c4(), requiredIssuesOpen: ["fact:clm:1:overstated"] }).join()).toContain("must address open issue");
  });
  it("BLOCKED carries no unit and names the gap", () => {
    const o = studioOutputSchemas["thb-04-section-writer"].parse(w({}, "BLOCKED")) as any;
    expect(studioSemanticChecks("thb-04-section-writer", o, c4()).join()).toContain("required_actions");
  });
});

describe("Agent 7", () => {
  const e7 = (result: object, decision = "PASS", findings: object[] = []) => studioOutputSchemas["thb-07-editorial-critic"].parse(strip(env("7", decision, { unit_key: "s2", version_hash: "h1", voice_reference_used: true, copy_paste_test: { passed: true, flagged: [] }, authenticity: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`q${i + 1}`, true])), score: { voice: 18, education: 18, deal_logic: 18, local: 12, structure: 12, trust: 8, total: 86 }, ...result }, findings))) as any;
  const c7 = (o: Partial<StudioValidationCtx> = {}) => ctx({ packet: { ...ctx().packet, agent_key: "thb-07-editorial-critic" }, ...o });
  it("a clean PASS is accepted", () => expect(studioSemanticChecks("thb-07-editorial-critic", e7({}), c7())).toEqual([]));
  it("is blocked when there is no usable voice reference", () => expect(studioSemanticChecks("thb-07-editorial-critic", e7({}), c7({ voiceUsable: false })).join()).toContain("no usable voice reference"));
  it("score total must equal the parts; parts stay within their maximum", () => {
    expect(scoreIssues({ voice: 21, education: 0, deal_logic: 0, local: 0, structure: 0, trust: 0, total: 21 }).length).toBeGreaterThan(0);
    expect(studioSemanticChecks("thb-07-editorial-critic", e7({ score: { voice: 18, education: 18, deal_logic: 18, local: 12, structure: 12, trust: 8, total: 99 } }), c7()).join()).toContain("total");
  });
  it("a score under 85 is advisory: it does not block a PASS", () => {
    expect(studioSemanticChecks("thb-07-editorial-critic", e7({ score: { voice: 10, education: 10, deal_logic: 10, local: 8, structure: 8, trust: 5, total: 51 } }), c7())).toEqual([]);
  });
  it("PASS is refused with a failed copy-paste test or a NO authenticity answer", () => {
    expect(studioSemanticChecks("thb-07-editorial-critic", e7({ copy_paste_test: { passed: false, flagged: ["x"] } }), c7()).length).toBeGreaterThan(0);
    expect(studioSemanticChecks("thb-07-editorial-critic", e7({ authenticity: { ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`q${i + 1}`, true])), q3: false } }), c7()).length).toBeGreaterThan(0);
  });
  it("a revised_unit is allowed only with PASS and only with ledger claims", () => {
    expect(studioSemanticChecks("thb-07-editorial-critic", e7({ revised_unit: unit }), c7())).toEqual([]);
    expect(studioSemanticChecks("thb-07-editorial-critic", e7({ revised_unit: unit }, "REVISION", [{ issue_key: "ed:opening", severity: "required", note: "generic opening" }]), c7()).join()).toContain("only allowed with PASS");
    expect(studioSemanticChecks("thb-07-editorial-critic", e7({ revised_unit: { ...unit, claim_ids: ["clm:9"] } }), c7()).join()).toContain("not in the ledger");
  });
});

describe("subagent files and the no-write guarantees", () => {
  const dir = ".claude/agents";
  const PROHIBITED: Record<string, string> = {
    "thb-04-section-writer": "Making unapproved new factual claims",
    "thb-05-fact-privacy-auditor": "Passing its own unsupported assumptions",
    "thb-06-seo-aeo-geo-auditor": "Pretending it directly tested HTTP or schema when it did not",
    "thb-07-editorial-critic": "Altering verified facts without re-audit",
  };
  for (const [k, phrase] of Object.entries(PROHIBITED)) {
    it(`${k}: exists, versioned, quotes its Prohibited action, no web tool`, () => {
      const text = readFileSync(join(dir, `${k}.md`), "utf8");
      expect(text).toMatch(/prompt_version: 1\.0\.0/);
      expect(text).toContain(`**Prohibited action: ${phrase}.**`);
      expect(text.split("\n").find((l) => l.startsWith("tools:"))).toBe("tools: Read, Write");
      expect(text).toContain("editorial-standards");
    });
  }
  it("only Agent 2 has a web tool", () => {
    for (const f of readdirSync(dir)) {
      const tools = readFileSync(join(dir, f), "utf8").split("\n").find((l) => l.startsWith("tools:"));
      if (!f.startsWith("thb-02")) expect(tools).not.toMatch(/Web/);
    }
  });
  const files = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : [join(d, f)]));
  it("no agent-facing code path writes approvals or moves a human-only state; only proposals.ts records an approval (service.ts may only invalidate one)", () => {
    const src = files("src/lib/studio").filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    for (const f of src) {
      const t = readFileSync(f, "utf8");
      if (f.endsWith("proposals.ts")) continue;
      expect(t, f).not.toMatch(/from\("approvals"\)\s*\.\s*(insert|upsert)/);
      expect(t, f).not.toMatch(/recordApproval\(/);
      expect(t, f).not.toMatch(/transition\([^)]*"APPROVED_FOR_WP_DRAFT"/);
    }
  });
  it("the studio code has no WordPress write path", () => {
    for (const f of files("src/lib/studio").filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) expect(readFileSync(f, "utf8"), f).not.toMatch(/wp-json|method:\s*["'](POST|PUT|PATCH|DELETE)["']/i);
  });
});
