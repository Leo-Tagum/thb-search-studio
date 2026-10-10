// Phase 2b: compute evidence + proposed verdicts for every published blog post and store them in blog_audits.
// Read-only on WordPress (uses stored bodies and stored GSC data). Re-running replaces proposals for the same audit_run
// but never touches a decision Leo already recorded.  Usage: npm run audit:blog
import { createClient } from "@supabase/supabase-js";
import { runChecks, segmentRuleHits } from "../src/lib/audit/checks";
import { computeOverlaps, type KnownPage, type PqRow } from "../src/lib/audit/overlap";
import { findBoilerplate, htmlToText, internalTargets, stripBoilerplate, wordCount } from "../src/lib/audit/structure";
import { proposeVerdicts, validateTargets, type PostInput, type Protection, type QueryEv } from "../src/lib/audit/verdict";
import { normalizeUrl } from "../src/lib/engine/match";

const SITE = process.env.WP_BASE_URL ?? "https://twinhomebuyer.com";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const runId = new Date().toISOString().slice(0, 10);

async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const pages = await all((f, t) => db.from("pages").select("id,url,canonical_url,title,wp_type,wp_status,modified_at,protection_status,template_flag,in_sitemap").order("id").range(f, t));
const posts = pages.filter((p) => p.wp_type === "post");
const { data: imp } = await db.from("audit_gsc_imports").select("*").order("fetched_at", { ascending: false }).limit(1).single();
if (!imp) throw new Error("No audit GSC import: run npm run import:gsc-audit first");
const gscRows = await all((f, t) => db.from("audit_gsc_rows").select("page_url,page_id,query,clicks,impressions,position").eq("import_id", imp.id).order("id").range(f, t));

// latest body per post
const bodies = new Map<string, string>();
for (const p of posts) {
  const { data } = await db.from("page_snapshots").select("body_text").eq("page_id", p.id).order("fetched_at", { ascending: false }).limit(1);
  if (data?.[0]?.body_text) bodies.set(p.id, data[0].body_text);
}

// Template / reusable blocks: text segments shared by 8+ posts. Judged once (site-wide), not once per post.
const fullText = new Map([...bodies].map(([id, html]) => [id, htmlToText(html)]));
const shared = findBoilerplate([...fullText.values()], 8);
const ownText = new Map([...fullText].map(([id, t]) => [id, stripBoilerplate(t, shared)]));
const systemic = [...shared].map(([segment, posts]) => ({ segment, posts, rules: segmentRuleHits(segment) })).filter((x) => x.rules.length).sort((a, b) => b.posts - a.posts);

// search evidence per post
const totals = new Map<string, { clicks: number; impressions: number; posW: number }>();
const queries = new Map<string, Map<string, { impressions: number; clicks: number; posW: number }>>();
for (const r of gscRows) {
  if (!r.page_id) continue;
  if (r.query === null) { const t = totals.get(r.page_id) ?? { clicks: 0, impressions: 0, posW: 0 }; t.clicks += r.clicks; t.impressions += r.impressions; t.posW += Number(r.position) * r.impressions; totals.set(r.page_id, t); }
  else { const m = queries.get(r.page_id) ?? new Map(); const q = m.get(r.query) ?? { impressions: 0, clicks: 0, posW: 0 }; q.impressions += r.impressions; q.clicks += r.clicks; q.posW += Number(r.position) * r.impressions; m.set(r.query, q); queries.set(r.page_id, m); }
}
const searchFor = (id: string) => {
  const t = totals.get(id);
  const qs: QueryEv[] = [...(queries.get(id) ?? new Map())].map(([query, v]) => ({ query, impressions: v.impressions, clicks: v.clicks, position: v.impressions ? Math.round((v.posW / v.impressions) * 10) / 10 : 0 })).sort((a, b) => b.impressions - a.impressions).slice(0, 10);
  return t ? { hasData: true, clicks: t.clicks, impressions: t.impressions, position: t.impressions ? Math.round((t.posW / t.impressions) * 10) / 10 : null, queries: qs } : { hasData: false, clicks: 0, impressions: 0, position: null, queries: qs };
};

// overlap
const known: KnownPage[] = pages.map((p) => ({ id: p.id, url: p.url, title: p.title, wp_type: p.wp_type, protection: (p.protection_status as Protection) }));
const overlaps = computeOverlaps(gscRows.filter((r) => r.query !== null).map((r) => ({ page_url: r.page_url, page_id: r.page_id, query: r.query!, impressions: r.impressions, clicks: r.clicks }) satisfies PqRow), known);

// internal links (out and in, in = from posts only)
const keyToPost = new Map<string, string>();
for (const p of posts) { keyToPost.set(normalizeUrl(p.canonical_url), p.id); keyToPost.set(normalizeUrl(p.url), p.id); }
const outLinks = new Map<string, string[]>();
const inbound = new Map<string, string[]>();
for (const p of posts) {
  const html = bodies.get(p.id);
  if (!html) continue;
  const targets = internalTargets(html, SITE, p.url);
  outLinks.set(p.id, targets);
  for (const k of targets) { const to = keyToPost.get(k); if (to) inbound.set(to, [...(inbound.get(to) ?? []), p.url]); }
}

const inputs: PostInput[] = posts.map((p) => {
  const html = bodies.get(p.id);
  return {
    id: p.id, url: p.url, title: p.title, modifiedAt: p.modified_at, protection: p.protection_status as Protection, templateFlag: p.template_flag,
    hasBody: !!html, wordCount: html ? wordCount(ownText.get(p.id)!) : 0, search: searchFor(p.id), findings: html ? runChecks(html, ownText.get(p.id)) : null,
    linksOut: outLinks.get(p.id)?.length ?? 0, inboundFrom: inbound.get(p.id) ?? [], overlaps: overlaps.get(p.id) ?? [],
  };
});
const proposals = proposeVerdicts(inputs);
const problems = validateTargets(proposals, new Set(posts.map((p) => p.id)));
if (problems.length) { console.error("Target validation failed:", problems); process.exit(1); }

const urlOf = new Map(posts.map((p) => [p.id, p.url]));
const rows = inputs.map((i) => {
  const pr = proposals.get(i.id)!;
  return {
    page_id: i.id, audit_run: runId,
    evidence: {
      search: { ...i.search, window: { start: imp.start_date, end: imp.end_date }, caveats: imp.caveats },
      structure: { wordCount: i.wordCount, modifiedAt: i.modifiedAt, linksOut: i.linksOut, inboundCount: i.inboundFrom.length, inboundFrom: i.inboundFrom.slice(0, 25), inboundNote: "Counted from the 122 posts only; the 230 pages were not fetched (partial)." },
      overlap: i.overlaps.slice(0, 6).map((o) => ({ url: o.url, kind: o.kind, supported: o.supported, sharedCount: o.shared.length, sharedSample: o.shared.slice(0, 6), fractionOfThisPostImpressions: Math.round(o.fraction * 100) / 100, partnerClicks: o.partnerClicks, partnerImpressions: o.partnerImpressions })),
      notes: pr.notes, advisories: pr.advisories, needsAgentReview: pr.needsAgentReview,
    },
    checks: i.findings ?? { skipped: "no body fetched" },
    proposed_verdict: pr.verdict, target_page_id: pr.targetId, target_url: pr.targetId ? urlOf.get(pr.targetId) : null,
    reason: pr.reason, confidence: pr.confidence, unknowns: pr.unknowns, protection_status: i.protection,
  };
});
for (let i = 0; i < rows.length; i += 25) { const { error } = await db.from("blog_audits").upsert(rows.slice(i, i + 25), { onConflict: "page_id,audit_run" }); if (error) throw error; }
await db.from("app_settings").upsert({ key: `blog_audit_systemic_${runId}`, value: { note: "Brand-rule findings inside template/reusable text blocks shared by 8+ posts. Fix once site-wide (developer change request), not per post.", sharedSegments: shared.size, findings: systemic }, updated_at: new Date().toISOString() });
await db.from("audit_events").insert({ actor: "studio", subject_type: "blog_audit_run", subject_id: runId, event_type: "audit_computed", accepted: true, detail: { posts: rows.length, gscImport: imp.id } });

const count = (f: (r: (typeof rows)[number]) => string) => rows.reduce<Record<string, number>>((m, r) => ((m[f(r)] = (m[f(r)] ?? 0) + 1), m), {});
console.log(JSON.stringify({
  auditRun: runId, posts: rows.length, bodies: bodies.size, withSearchData: inputs.filter((i) => i.search.hasData).length, noData: inputs.filter((i) => !i.search.hasData).length,
  verdicts: count((r) => r.proposed_verdict), confidence: count((r) => r.confidence), needAgentReview: [...proposals.values()].filter((p) => p.needsAgentReview).length,
  sharedTemplateSegments: shared.size, systemicFindings: systemic.map((x) => `${x.posts} posts: ${x.rules.join("; ")} :: ${x.segment.slice(0, 70)}`),
  gscWindow: `${imp.start_date}..${imp.end_date}`, gscTruncated: imp.truncated,
}, null, 1));
