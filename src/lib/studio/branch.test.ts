/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRANCH_DIRECTIVE, branchArticle, branchDelete, checkIsolation, collectFindings, fingerprint, planBranch } from "./branch";
import { contentHash } from "./hash";
import { snapshotKey } from "../team/snapshots";

// ---------- an in-memory stand-in for the Supabase client (filters, ordering, ranges, insert/update/delete), logging every write ----------
type Log = { op: "insert" | "update" | "delete"; table: string; rows: any[] };
function memDb(seed: Record<string, any[]>) {
  const t: Record<string, any[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
  const log: Log[] = [];
  const clone = (x: any) => JSON.parse(JSON.stringify(x));
  const db = {
    from(table: string) {
      const rows = () => (t[table] ??= []);
      let op: "select" | "insert" | "update" | "delete" = "select", payload: any, head = false, ord: string | null = null, rng: [number, number] | null = null, one = false;
      const filters: ((r: any) => boolean)[] = [];
      const run = (): any => {
        const m = rows().filter((r) => filters.every((f) => f(r)));
        if (op === "insert") { const arr = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...clone(r) })); rows().push(...arr); log.push({ op, table, rows: clone(arr) }); return { data: one ? arr[0] : arr, error: null }; }
        if (op === "update") { m.forEach((r) => Object.assign(r, clone(payload))); log.push({ op, table, rows: clone(m) }); return { data: m, error: null }; }
        if (op === "delete") { t[table] = rows().filter((r) => !m.includes(r)); log.push({ op, table, rows: clone(m) }); return { data: m, error: null }; }
        let out = [...m]; if (ord) out.sort((a, b) => String(a[ord!]).localeCompare(String(b[ord!]))); if (rng) out = out.slice(rng[0], rng[1] + 1);
        if (one) return out.length ? { data: clone(out[0]), error: null } : { data: null, error: { message: "no rows" } };
        return { data: head ? null : clone(out), error: null, count: m.length };
      };
      const b: any = {
        select(_c?: string, o?: any) { if (o?.head) head = true; return b; },
        insert(p: any) { op = "insert"; payload = p; return b; }, update(p: any) { op = "update"; payload = p; return b; }, delete() { op = "delete"; return b; },
        eq(c: string, v: any) { filters.push((r) => r[c] === v); return b; }, in(c: string, v: any[]) { filters.push((r) => v.includes(r[c])); return b; },
        is(c: string, v: any) { filters.push((r) => (r[c] ?? null) === v); return b; }, order(c: string) { ord = c; return b; }, range(a: number, z: number) { rng = [a, z]; return b; },
        single() { one = true; return Promise.resolve(run()); }, maybeSingle() { one = true; const r = run(); return Promise.resolve(r.data ? r : { data: null, error: null }); },
        then(res: any, rej?: any) { return Promise.resolve(run()).then(res, rej); },
      };
      return b;
    },
  } as any;
  return { db, t, log };
}

// ---------- a small classic article: s1 + faq, both locked, with reviews ----------
const para = (text: string) => ({ t: "p", text });
const S1 = { kind: "section", key: "s1", h2: "Can I sell a hoarded house?", capsule: "Yes.", blocks: [para("You can sell it as it is. Most owners start with a walkthrough.")], claim_ids: ["clm:1"], roles: ["opening"] };
const FAQ = { kind: "faq", key: "faq", items: [{ q: "Q1?", a: "A1.", claim_ids: ["clm:1"] }, { q: "Q2?", a: "A2.", claim_ids: [] }, { q: "Q3?", a: "A3.", claim_ids: [] }] };
const ids = { art: "a0", brief: "b0", opp: "o1", s1: "sec-s1", faq: "sec-faq", v1: "ver-s1", vf: "ver-faq", vOld: "ver-s1-old" };
const rev = (id: string, section: string, version: string, agent: string, findings: any[], at: string) => ({ id, section_id: section, version_id: version, agent_key: agent, decision: "PASS", findings, required_actions: [], created_at: at });
const opt = (k: string, note = `note ${k}`) => ({ issue_key: k, severity: "optional", note, claim_id: null });
function original(extra: Record<string, any[]> = {}) {
  const base: Record<string, any[]> = {
    articles: [{ id: ids.art, opportunity_id: ids.opp, title: "Hoarder guide", slug: "hoarded-house", primary_keyword: "hoarded house", brief_id: ids.brief, state: "HUMAN_REVIEW", pipeline_mode: "classic", branch_of: null, is_fixture: false, version_hash: "4db42fea93cc-full", approved_hash: null, locked_version_id: "av1", revision_count: 0 }],
    briefs: [{ id: ids.brief, opportunity_id: ids.opp, outline: { working_title: "Hoarder guide", outline: [{ h2: "Can I sell a hoarded house?", claim_ids: ["clm:1"] }] }, evidence_packet: { claims: [] }, outline_history: [], source_ids: [], notes: "n", created_at: "2026-10-10" }],
    article_sections: [
      { id: ids.s1, article_id: ids.art, position: 1, heading: "Can I sell a hoarded house?", body: null, locked: true, section_key: "s1", status: "LOCKED", current_version_id: ids.v1, locked_version_id: ids.v1, issues: { issues: [], meta: { versionNo: 2, versionHash: contentHash(S1), lockedHash: contentHash(S1) } }, brief_h2: "Can I sell a hoarded house?", claim_ids: ["clm:1"] },
      { id: ids.faq, article_id: ids.art, position: 2, heading: "Frequently Asked Questions", body: null, locked: true, section_key: "faq", status: "LOCKED", current_version_id: ids.vf, locked_version_id: ids.vf, issues: { issues: [], meta: { versionNo: 1 } }, brief_h2: "Frequently Asked Questions", claim_ids: [] },
    ],
    section_versions: [
      { id: ids.vOld, section_id: ids.s1, version_no: 1, content: { ...S1, capsule: "Old." }, content_hash: "old", material_sig: "m0", created_by: "thb-04-section-writer" },
      { id: ids.v1, section_id: ids.s1, version_no: 2, content: S1, content_hash: contentHash(S1), material_sig: "m1", created_by: "thb-04-section-writer" },
      { id: ids.vf, section_id: ids.faq, version_no: 1, content: FAQ, content_hash: contentHash(FAQ), material_sig: "m2", created_by: "thb-04-section-writer" },
    ],
    section_reviews: [
      rev("r-old", ids.s1, ids.vOld, "thb-07-editorial-critic", [opt("old:one"), opt("old:two")], "2026-10-10T01:00"),             // an older version: ignored
      rev("r5a", ids.s1, ids.v1, "thb-05-fact-privacy-auditor", [opt("fact:a")], "2026-10-10T02:00"),
      rev("r6a", ids.s1, ids.v1, "thb-06-seo-aeo-geo-auditor", [opt("seo:a"), opt("seo:b"), { issue_key: "req:x", severity: "required", note: "required", claim_id: null }], "2026-10-10T02:01"),
      rev("r7early", ids.s1, ids.v1, "thb-07-editorial-critic", [opt("ed:early")], "2026-10-10T02:02"),
      rev("r7late", ids.s1, ids.v1, "thb-07-editorial-critic", [opt("ed:a"), opt("ed:b")], "2026-10-10T03:00"),                      // the latest one counts
      rev("r7f", ids.faq, ids.vf, "thb-07-editorial-critic", [opt("ed:faq")], "2026-10-10T03:01"),
    ],
    claims: [{ id: "c-uuid-1", article_id: ids.art, claim_key: "clm:1", claim_text: "Statute says X.", locked_text: "Statute says X (verified).", risk_level: "high", source_id: "src1", support: "supported" }],
    article_versions: [{ id: "av1", article_id: ids.art, version_hash: "4db42fea93cc-full", body: {}, created_by: "studio" }],
    audit_events: [{ id: "ae1", actor: "leo", subject_type: "article", subject_id: ids.art, event_type: "section_version", accepted: true }],
    agent_runs: [{ id: "run1", agent_key: "thb-04-section-writer", subject_type: "article", subject_id: ids.art, status: "ACCEPTED" }],
    escalations: [], proposals: [], approvals: [], tickets: [], team_runs: [], ticket_messages: [], evidence_sources: [], evidence_passages: [],
  };
  return { ...base, ...extra };
}
const EXPECT = 6;   // fact:a, seo:a, seo:b, ed:a, ed:b, ed:faq
const originalIds = (t: Record<string, any[]>) => new Set(Object.values(t).flat().map((r) => r.id));

describe("collectFindings", () => {
  const d = original();
  const f = collectFindings(d.article_sections, d.section_reviews);
  it("takes only optional findings of the latest review per reviewer on the LOCKED version", () => {
    expect(f.map((x) => `${x.unit}:${x.role}:${x.key}`).sort()).toEqual(["faq:V3:ed:faq", "s1:V1:fact:a", "s1:V2:seo:a", "s1:V2:seo:b", "s1:V3:ed:a", "s1:V3:ed:b"].sort());
    expect(f).toHaveLength(EXPECT);
  });
  it("keeps the source review id of each finding", () => { expect(f.find((x) => x.key === "ed:a")!.reviewId).toBe("r7late"); });
});

describe("planBranch", () => {
  const d = original();
  const plan = planBranch({ article: d.articles[0], brief: d.briefs[0], sections: d.article_sections, versions: d.section_versions, reviews: d.section_reviews, claims: d.claims });
  it("makes a new real team article that points at the original", () => {
    expect(plan.article).toMatchObject({ pipeline_mode: "team", is_fixture: false, branch_of: ids.art, state: "BRIEF_APPROVED", slug: "hoarded-house", primary_keyword: "hoarded house", title: "Hoarder guide" });
    expect(plan.article.id).not.toBe(ids.art);
    expect(plan.article.brief_id).toBe(plan.briefId);
  });
  it("copies the brief with no opportunity_id and a new id", () => {
    expect(plan.brief).toMatchObject({ id: plan.briefId, opportunity_id: null });
    expect(plan.briefId).not.toBe(ids.brief);
    expect(plan.brief.outline).toEqual(d.briefs[0].outline);
  });
  it("copies the ledger under the branch id with the same claim keys and wording, new row ids", () => {
    expect(plan.claims).toHaveLength(1);
    expect(plan.claims[0]).toMatchObject({ article_id: plan.articleId, claim_key: "clm:1", locked_text: "Statute says X (verified).", source_id: "src1" });
    expect(plan.claims[0]).not.toHaveProperty("id");
  });
  it("copies each locked version byte-identically and reopens the unit with Leo's directive and the findings as declinable should-fix items", () => {
    const u = plan.units.find((x) => x.section.section_key === "s1")!;
    expect(u.version).toMatchObject({ content_hash: contentHash(S1), version_no: 2, created_by: "branch-copy", agent_run_id: null });
    expect(contentHash(u.version.content)).toBe(contentHash(S1));
    expect(u.env.team).toMatchObject({ status: "NEEDS_REVISION", versionHash: contentHash(S1), lockedHash: null, v1Passed: null, pending: [] });
    expect(u.env.team.mustFix).toEqual([{ key: "human:directive", role: "LEO", text: BRANCH_DIRECTIVE, attempts: 0 }]);
    expect(u.env.team.collected.map((c) => `${c.role}:${c.key}`).sort()).toEqual(["V1:fact:a", "V2:seo:a", "V2:seo:b", "V3:ed:a", "V3:ed:b"]);
    expect(u.env.team.collected.every((c) => c.severity === "should fix" && c.declined === null && c.versionHash === contentHash(S1))).toBe(true);
    expect(u.pointers.locked_version_id).toBe(u.version.id);
  });
  it("seeds findings in envelopes and creates no tickets", () => { expect(plan).not.toHaveProperty("tickets"); expect(plan.units.reduce((n, u) => n + u.findings, 0)).toBe(EXPECT); });
  it("reuses no id of the original", () => {
    const own = originalIds(d);
    const mine = [plan.articleId, plan.briefId, ...plan.units.flatMap((u) => [u.section.id as string, u.version.id as string])];
    expect(mine.some((i) => own.has(i))).toBe(false);
  });
});

describe("branchArticle (fake database)", () => {
  it("refuses an agent actor, the smoke-test actor on a real article, and a blank actor before any read or write", async () => {
    for (const actor of ["V1", "agent:W1", "smoke-test", "cherry", ""]) {
      const { db, log } = memDb(original());
      const r = await branchArticle(db, ids.art, { actor, expectedFindings: EXPECT });
      expect(r.ok, actor).toBe(false); expect(log, actor).toEqual([]);
    }
  });
  it("stops with nothing written when the finding count is not the expected one", async () => {
    const { db, log } = memDb(original());
    const r = await branchArticle(db, ids.art, { actor: "leo", expectedFindings: 50 });
    expect(r).toMatchObject({ ok: false, findingsFound: EXPECT });
    expect(log).toEqual([]);
  });
  it("a dry run writes nothing", async () => {
    const { db, log } = memDb(original());
    const r = await branchArticle(db, ids.art, { actor: "leo", expectedFindings: EXPECT, dryRun: true });
    expect(r).toMatchObject({ ok: true, dryRun: true, findings: EXPECT, units: 2, claims: 1 }); expect(log).toEqual([]);
  });
  it("refuses a branch, a team article, and an article with an unlocked unit", async () => {
    const a = memDb(original({ articles: [{ ...original().articles[0], branch_of: "zzz" }] }));
    expect((await branchArticle(a.db, ids.art, { actor: "leo", expectedFindings: EXPECT })).ok).toBe(false);
    const b = memDb(original({ articles: [{ ...original().articles[0], pipeline_mode: "team" }] }));
    expect((await branchArticle(b.db, ids.art, { actor: "leo", expectedFindings: EXPECT })).ok).toBe(false);
    const d = original(); d.article_sections[1].status = "NEEDS_REVISION";
    const c = memDb(d); const r = await branchArticle(c.db, ids.art, { actor: "leo", expectedFindings: EXPECT });
    expect(r.ok).toBe(false); expect(c.log).toEqual([]);
  });
  it("creates the branch, never writes to the original, leaves its fingerprint identical, and the isolation proof passes", async () => {
    const m = memDb(original()); const own = originalIds(m.t);
    const before = await fingerprint(m.db, ids.art);
    const r = await branchArticle(m.db, ids.art, { actor: "leo", expectedFindings: EXPECT });
    expect(r.ok).toBe(true); if (!r.ok || r.dryRun) throw new Error("unreachable");
    expect(r.before.total).toBe(before.total); expect(r.after.total).toBe(before.total); expect(r.changed).toEqual([]);
    expect(r.isolation).toMatchObject({ ok: true, problems: [] });
    // no write touched an original row, and no inserted row belongs to the original article or its sections
    for (const w of m.log) for (const row of w.rows) {
      expect(own.has(row.id), `${w.op} ${w.table}`).toBe(false);
      expect(row.article_id === ids.art || row.subject_id === ids.art, `${w.op} ${w.table}`).toBe(false);
      expect([ids.s1, ids.faq].includes(row.section_id), `${w.op} ${w.table}`).toBe(false);
    }
    const br = m.t.articles.find((a) => a.id === r.branchId);
    expect(br).toMatchObject({ pipeline_mode: "team", is_fixture: false, branch_of: ids.art, state: "DRAFTING" });
    expect(m.t.articles.find((a) => a.id === ids.art)).toMatchObject({ state: "HUMAN_REVIEW", pipeline_mode: "classic", version_hash: "4db42fea93cc-full", locked_version_id: "av1" });
    const secs = m.t.article_sections.filter((s) => s.article_id === r.branchId);
    expect(secs.map((s) => s.status)).toEqual(["NEEDS_REVISION", "NEEDS_REVISION"]);
    expect(secs.every((s) => s.issues.team.status === "NEEDS_REVISION" && s.locked === false)).toBe(true);
    expect(m.t.tickets).toEqual([]); expect(m.t.team_runs).toEqual([]);
    expect(m.t.audit_events.filter((e) => e.subject_id === r.branchId && e.event_type === "branch_created")[0].detail.seeded).toHaveLength(EXPECT);
  });
  it("a failure midway removes the partial branch and reports it", async () => {
    const m = memDb(original());
    const real = m.db.from.bind(m.db);
    m.db.from = (t: string) => { const b = real(t); if (t === "claims") { const ins = b.insert; b.insert = (p: any) => (Array.isArray(p) && p.some((x: any) => x.article_id !== ids.art) ? { then: (ok: any, rej: any) => Promise.resolve({ error: { message: "boom" } }).then(ok, rej) } : ins(p)); } return b; };
    const r = await branchArticle(m.db, ids.art, { actor: "leo", expectedFindings: EXPECT });
    expect(r).toMatchObject({ ok: false }); expect((r as any).reason).toMatch(/boom/);
    expect(m.t.articles.map((a) => a.id)).toEqual([ids.art]); expect(m.t.briefs.map((b) => b.id)).toEqual([ids.brief]);
    expect(m.t.article_sections.every((s) => s.article_id === ids.art)).toBe(true); expect(m.t.section_versions).toHaveLength(3);
  });
});

describe("checkIsolation catches shared references", () => {
  const d = original();
  const plan = planBranch({ article: d.articles[0], brief: d.briefs[0], sections: d.article_sections, versions: d.section_versions, reviews: d.section_reviews, claims: d.claims });
  const good = () => {
    const bsecs = plan.units.map((u) => ({ ...u.section, ...u.pointers })); const bvers = plan.units.map((u) => ({ ...u.version }));
    return { branch: { ...plan.article, locked_version_id: null }, original: d.articles[0], branchBrief: plan.brief, originalBrief: d.briefs[0], branchSections: bsecs, originalSections: d.article_sections, branchVersions: bvers, originalVersions: d.section_versions, branchClaims: plan.claims.map((c, i) => ({ ...c, id: `new-${i}` })), originalClaims: d.claims };
  };
  it("passes a clean branch", () => expect(checkIsolation(good() as any)).toMatchObject({ ok: true }));
  it("flags a shared brief, a brief with an opportunity id, a reused claim row, a claim on another article, a foreign pointer and a dangling claim id", () => {
    const g: any = good(); g.branch.brief_id = ids.brief; g.branchBrief = d.briefs[0];
    expect(checkIsolation(g).problems.join(" ")).toMatch(/shares the original's brief/);
    const h: any = good(); h.branchBrief = { ...plan.brief, opportunity_id: "o1" };
    expect(checkIsolation(h).problems.join(" ")).toMatch(/opportunity_id/);
    const i: any = good(); i.branchClaims[0].id = "c-uuid-1";
    expect(checkIsolation(i).problems.join(" ")).toMatch(/IS an original claim row/);
    const j: any = good(); j.branchClaims[0].article_id = ids.art;
    expect(checkIsolation(j).problems.join(" ")).toMatch(/another article/);
    const k: any = good(); k.branchSections[0].locked_version_id = ids.v1;
    expect(checkIsolation(k).problems.join(" ")).toMatch(/not its own/);
    const l: any = good(); l.branchClaims = [];
    expect(checkIsolation(l).problems.join(" ")).toMatch(/not in the branch ledger/);
  });
});

describe("branchDelete (rollback)", () => {
  const make = async (extra: Record<string, any[]> = {}) => {
    const m = memDb(original(extra));
    const r = await branchArticle(m.db, ids.art, { actor: "leo", expectedFindings: EXPECT }); if (!r.ok || r.dryRun) throw new Error("setup failed");
    return { ...m, branchId: r.branchId };
  };
  it("refuses without --yes, an agent actor, the original, and a fixture", async () => {
    const m = await make();
    expect(await branchDelete(m.db, m.branchId, { actor: "leo", yes: false })).toMatchObject({ ok: false });
    expect(await branchDelete(m.db, m.branchId, { actor: "V1", yes: true })).toMatchObject({ ok: false });
    expect(await branchDelete(m.db, m.branchId, { actor: "smoke-test", yes: true })).toMatchObject({ ok: false });
    expect(await branchDelete(m.db, ids.art, { actor: "leo", yes: true })).toMatchObject({ ok: false, reason: expect.stringMatching(/not a branch/) });
    m.t.articles.find((a) => a.id === m.branchId).is_fixture = true;
    expect(await branchDelete(m.db, m.branchId, { actor: "leo", yes: true })).toMatchObject({ ok: false, reason: expect.stringMatching(/smoke:cleanup/) });
    expect(m.t.articles).toHaveLength(2);
  });
  it("removes the branch and its copies only; the original's fingerprint is identical afterwards", async () => {
    const m = await make(); const before = await fingerprint(m.db, ids.art);
    const r = await branchDelete(m.db, m.branchId, { actor: "leo", yes: true });
    expect(r).toMatchObject({ ok: true, originalChanged: [] });
    expect((await fingerprint(m.db, ids.art)).total).toBe(before.total);
    expect(m.t.articles.map((a) => a.id)).toEqual([ids.art]); expect(m.t.briefs.map((b) => b.id)).toEqual([ids.brief]);
    expect(m.t.article_sections.map((s) => s.id).sort()).toEqual([ids.faq, ids.s1].sort()); expect(m.t.section_versions).toHaveLength(3);
    expect(m.t.claims.map((c) => c.id)).toEqual(["c-uuid-1"]);
  });
  it("removes only snapshots this branch created and nothing else references; keeps older, referenced and shared ones", async () => {
    const m = await make();
    const br = m.t.articles.find((a) => a.id === m.branchId);
    const at = (s: number) => new Date(Date.parse(br.created_at) + s).toISOString();
    const U = (n: string) => `https://www.dre.ca.gov/${n}`;
    const src = (id: string, n: string, created: string) => ({ id, source_url: U(n), uploaded_by: "system:r1-snapshot", created_at: created, title: n });
    m.t.evidence_sources.push(src("new-free", "free", at(1000)), src("old", "old", at(-1000)), src("new-claimed", "claimed", at(1000)), src("new-shared", "shared", at(1000)), src("new-briefed", "briefed", at(1000)), { ...src("not-r1", "free", at(1000)), uploaded_by: "leo" });
    m.t.evidence_passages.push({ id: "p1", source_id: "new-free", passage: "x" }, { id: "p2", source_id: "old", passage: "y" });
    m.t.audit_events.push(
      { id: "e-b", actor: "x", subject_type: "article", subject_id: m.branchId, event_type: "r1_fetch", detail: { fetched: [U("free"), U("old"), U("claimed"), U("shared"), U("briefed")] } },
      { id: "e-o", actor: "x", subject_type: "article", subject_id: "other-article", event_type: "r1_fetch", detail: { fetched: [U("shared")] } });
    m.t.claims.push({ id: "other-claim", article_id: "other-article", claim_key: "clm:9", source_id: "new-claimed" });
    m.t.briefs.push({ id: "bx", opportunity_id: "o9", source_ids: ["new-briefed"] });
    const r = await branchDelete(m.db, m.branchId, { actor: "leo", yes: true });
    expect(r.ok).toBe(true);
    expect(m.t.evidence_sources.map((s) => s.id).sort()).toEqual(["new-briefed", "new-claimed", "new-shared", "not-r1", "old"].sort());
    expect(m.t.evidence_passages.map((p) => p.id)).toEqual(["p2"]);
    expect((r as any).summary).toMatch(/removed 1/);
    expect(snapshotKey(U("free"))).toBeTruthy();
  });
});

describe("lookups stay safe with two articles on one opportunity", () => {
  const src = (p: string) => readFileSync(p, "utf8");
  it("approveBrief finds the existing article only among originals (branch_of is null), pinned", () => {
    expect(src("src/lib/studio/service.ts")).toMatch(/from\("articles"\)\.select\("id"\)\.eq\("opportunity_id", oppId\)\.is\("branch_of", null\)\.maybeSingle\(\)/);
  });
  it("no other code finds an article by opportunity, slug or keyword", () => {
    const files = ["src/lib/studio/service.ts", "src/lib/studio/team-service.ts", "src/lib/studio/proposals.ts", "src/lib/studio/proposal-payload.ts", "src/lib/team/store.ts", "src/app/studio/page.tsx", "src/app/studio/[id]/page.tsx", "src/app/opportunities/[id]/page.tsx"];
    const hits = files.flatMap((f) => src(f).split("\n").filter((l) => /from\("articles"\)/.test(l) && /\.eq\("(opportunity_id|slug|primary_keyword)"/.test(l)).map((l) => `${f}: ${l.trim().slice(0, 80)}`));
    expect(hits).toEqual([expect.stringContaining("service.ts")]);
  });
  it("the branch brief has no opportunity_id, so briefs looked up by opportunity still find exactly one row", () => {
    const d = original();
    const plan = planBranch({ article: d.articles[0], brief: d.briefs[0], sections: d.article_sections, versions: d.section_versions, reviews: d.section_reviews, claims: d.claims });
    expect([d.briefs[0], plan.brief].filter((b) => b.opportunity_id === ids.opp)).toHaveLength(1);
  });
});
