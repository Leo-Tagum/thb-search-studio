// Deterministic verdict proposals for the blog audit (Phase 2b). Recommends only; Leo decides in /audit.
// Guardrails (plan Rules): protected => FLAG_ONLY; "no GSC data" is UNKNOWN and never the sole reason for MERGE/RETIRE/NOINDEX;
// MERGE/RETIRE need supported overlap (shared queries), name a surviving URL that exists, and never chain or loop.
import { advisoryIssues, blockingIssues, pendingJuanClaims, type Findings } from "./checks";

// HOLD = nothing wrong, only claims still waiting on Juan's decision (no change recommended until he decides).
export type Verdict = "KEEP" | "UPDATE" | "MERGE" | "RETIRE" | "NOINDEX" | "FLAG_ONLY" | "HOLD";
export type Protection = "unknown" | "protected" | "not_protected";

export type QueryEv = { query: string; impressions: number; clicks: number; position: number };
export type SearchEv = { hasData: boolean; clicks: number; impressions: number; position: number | null; queries: QueryEv[] };
export type Overlap = {
  key: string; page_id: string | null; url: string; title: string | null; kind: "post" | "page" | "gsc_only";
  protection: Protection | null; shared: string[]; sharedImpressions: number; fraction: number; supported: boolean;
  partnerClicks: number; partnerImpressions: number;
};
export type PostInput = {
  id: string; url: string; title: string | null; modifiedAt: string | null; protection: Protection; templateFlag: string;
  hasBody: boolean; wordCount: number; search: SearchEv; findings: Findings | null; linksOut: number; inboundFrom: string[]; overlaps: Overlap[];
};
export type Proposal = {
  verdict: Verdict; targetId: string | null; targetUrl: string | null; reason: string; confidence: "low" | "medium" | "high";
  unknowns: string[]; issues: string[]; advisories: string[]; needsAgentReview: boolean; notes: string[];
  pendingClaims: { fact: string; text: string; context: string }[]; // group B: exact claims waiting on Juan
};

export const MIN_SHARED_QUERIES = 3;
export const MIN_OVERLAP_FRACTION = 0.4;
const THIN_WORDS = 300;

/** An overlap with another page is "supported" only by shared ranking queries, never by title/slug similarity. */
export function overlapSupported(sharedCount: number, fraction: number) { return sharedCount >= MIN_SHARED_QUERIES && fraction >= MIN_OVERLAP_FRACTION; }

const yearIn = (t: string | null) => { const m = t?.match(/\b(20[12]\d)\b/); return m ? Number(m[1]) : null; };
const isFlagOnly = (p: PostInput) => p.protection === "protected" || p.templateFlag === "protected_ads";
const rank = (p: PostInput) => [p.search.clicks, p.search.impressions];
const better = (a: PostInput, b: PostInput) => {
  const [ac, ai] = rank(a), [bc, bi] = rank(b);
  if (ac !== bc) return ac > bc;
  if (ai !== bi) return ai > bi;
  return (a.modifiedAt ?? "") >= (b.modifiedAt ?? "") && a.url < b.url; // tie: deterministic
};

function baseUnknowns(p: PostInput): string[] {
  const u = ["SERP result types were not observed (no SERP tool in this phase)", "Lead and revenue outcomes are not joined (Phase 6); value here is search and content evidence only"];
  if (p.protection === "unknown") u.push("Protection status is UNKNOWN (partner's protected-URL list not imported); acknowledgement needed before approving a change");
  if (!p.search.hasData) u.push("No Search Console rows in the 16-month window: UNKNOWN, not proof the post is dead (rare queries are anonymized and omitted)");
  if (!p.hasBody) u.push("Post body was not fetched; content checks did not run");
  u.push("Inbound internal links are counted from the 122 posts only (the 230 pages were not fetched): partial");
  return u;
}

export function proposeVerdicts(posts: PostInput[], now = new Date()): Map<string, Proposal> {
  const byId = new Map(posts.map((p) => [p.id, p]));
  const out = new Map<string, Proposal>();
  const thisYear = now.getFullYear();

  // 1) issues, per post
  const issues = new Map<string, { blocking: string[]; advisory: string[] }>();
  for (const p of posts) {
    const blocking = p.findings ? blockingIssues(p.findings) : [];
    const advisory = p.findings ? advisoryIssues(p.findings) : [];
    if (p.hasBody && p.wordCount < THIN_WORDS) blocking.push(`thin content (${p.wordCount} words)`);
    const y = yearIn(p.title);
    if (y !== null && y <= thisYear - 1) blocking.push(`title is dated ${y}; refresh or remove the date`);
    issues.set(p.id, { blocking, advisory });
  }

  // 2) overlap graph among posts: loser -> best-ranked supported partner, resolved so no chains/loops form
  const partnerOf = new Map<string, Overlap>();
  for (const p of posts) {
    if (isFlagOnly(p)) continue;
    const cands = p.overlaps.filter((o) => o.supported && o.kind === "post" && o.page_id && byId.has(o.page_id));
    const survivors = cands.map((o) => ({ o, q: byId.get(o.page_id!)! })).filter(({ q }) => !isFlagOnly(q) && better(q, p)).sort((a, b) => (better(a.q, b.q) ? -1 : 1));
    if (survivors.length) partnerOf.set(p.id, survivors[0].o);
  }
  // a survivor must not itself be merged away: follow to a root; keep the mapping only if the root also overlaps (supported) with the loser
  const mergeInto = new Map<string, Overlap>();
  const notes = new Map<string, string[]>();
  const addNote = (id: string, n: string) => notes.set(id, [...(notes.get(id) ?? []), n]);
  for (const [lid, o] of partnerOf) {
    if (!partnerOf.has(o.page_id!)) { mergeInto.set(lid, o); continue; }
    // the partner is itself a loser: only merge straight into the root survivor if this post overlaps it directly
    let rootId = o.page_id!;
    const seen = new Set([lid]);
    while (partnerOf.has(rootId) && !seen.has(rootId)) { seen.add(rootId); rootId = partnerOf.get(rootId)!.page_id!; }
    const direct = partnerOf.has(rootId) ? undefined : byId.get(lid)!.overlaps.find((x) => x.page_id === rootId && x.supported && x.kind === "post");
    if (direct) mergeInto.set(lid, direct);
    else addNote(lid, `Overlaps with ${o.url}, which itself overlaps a stronger post: a merge chain would form. Resolve by hand; no automatic merge proposed.`);
  }

  for (const p of posts) {
    const { blocking, advisory } = issues.get(p.id)!;
    const unknowns = baseUnknowns(p);
    const n = notes.get(p.id) ?? [];
    const rel = p.overlaps.filter((o) => o.supported && o.kind !== "post");
    for (const o of rel) n.push(`Possible cannibalization with ${o.kind === "gsc_only" ? "a ranking URL not in the inventory" : "page"} ${o.url} (${o.shared.length} shared queries incl. "${o.shared[0]}"). Posts are never merged into pages automatically; differentiate or link instead.`);
    const weak = p.overlaps.filter((o) => !o.supported && o.shared.length > 0).length;
    if (weak) n.push(`${weak} other URL(s) share 1-2 queries or a small share of this post's impressions: not enough for a cannibalization claim.`);
    const pendingClaims = p.findings ? pendingJuanClaims(p.findings) : [];
    if (pendingClaims.length && blocking.length) n.push(`Also uses claims waiting on Juan: ${pendingClaims.slice(0, 6).map((c) => `"${c.text}"`).join(", ")}.`);
    const base = { unknowns, issues: blocking, advisories: advisory, notes: n, pendingClaims };

    if (isFlagOnly(p)) {
      out.set(p.id, { ...base, verdict: "FLAG_ONLY", targetId: null, targetUrl: null, confidence: "high", needsAgentReview: false, reason: "Protected / money page: findings are listed for Leo, no change is recommended." });
      continue;
    }

    const m = mergeInto.get(p.id);
    if (m) {
      const s = byId.get(m.page_id!)!;
      const uniqueShare = 1 - m.fraction;
      const sharedList = m.shared.slice(0, 5).map((q) => `"${q}"`).join(", ");
      const evidence = `shares ${m.shared.length} ranking queries (${Math.round(m.fraction * 100)}% of its impressions; e.g. ${sharedList}) with ${s.url}, which has more clicks/impressions (${s.search.clicks}/${s.search.impressions} vs ${p.search.clicks}/${p.search.impressions}).`;
      const confidence: Proposal["confidence"] = m.shared.length >= 8 && s.search.clicks >= p.search.clicks * 2 ? "high" : m.shared.length >= 5 ? "medium" : "low";
      const retire = uniqueShare <= 0.2 && (p.wordCount < 600 || p.search.clicks === 0 || p.search.clicks < s.search.clicks * 0.2);
      const why = `Survivor: ${s.url} - the stronger URL for these queries (clicks/impressions ${s.search.clicks}/${s.search.impressions} vs ${p.search.clicks}/${p.search.impressions}).`;
      out.set(p.id, {
        ...base, verdict: retire ? "RETIRE" : "MERGE", targetId: s.id, targetUrl: s.url, confidence, needsAgentReview: confidence !== "high",
        reason: retire ? `Duplicative: this post ${evidence} Little unique ranking value remains (${Math.round(uniqueShare * 100)}% of impressions are on queries it does not share), so propose a 301 to the survivor. ${why}`
          : `Supported overlap: this post ${evidence} It ranks for queries the survivor does not (${Math.round(uniqueShare * 100)}% of its impressions), so fold the unique parts into the survivor (a Phase 3 job) before redirecting. ${why}`,
        unknowns: s.protection === "unknown" ? [...unknowns, `Survivor ${s.url} protection status is also UNKNOWN`] : unknowns,
      });
      continue;
    }

    const y = yearIn(p.title);
    if (!p.overlaps.some((o) => o.supported) && p.hasBody && y !== null && y <= thisYear - 2 && p.wordCount < 600) {
      out.set(p.id, { ...base, verdict: "NOINDEX", targetId: null, targetUrl: null, confidence: "low", needsAgentReview: true, reason: `Time-bound and thin: the title is dated ${y} and the body is ${p.wordCount} words. Keep reachable but not indexed unless it is refreshed. Search data is ${p.search.hasData ? `${p.search.clicks} clicks / ${p.search.impressions} impressions` : "unknown (no rows)"}, which was not the basis for this proposal.` });
      continue;
    }
    if (blocking.length) {
      out.set(p.id, { ...base, verdict: "UPDATE", targetId: null, targetUrl: null, confidence: p.hasBody ? "medium" : "low", needsAgentReview: false, reason: `Fixable on the same URL: ${blocking.join("; ")}.` });
      continue;
    }
    if (pendingClaims.length) {
      out.set(p.id, { ...base, verdict: "HOLD", targetId: null, targetUrl: null, confidence: "medium", needsAgentReview: false, reason: `Waiting on Juan: no other problem found, but the post uses ${pendingClaims.length} claim(s) that are not approved yet: ${pendingClaims.slice(0, 8).map((c) => `"...${c.context}..." [${c.fact}]`).join("; ")}. No change recommended until Juan decides.` });
      continue;
    }
    out.set(p.id, { ...base, verdict: "KEEP", targetId: null, targetUrl: null, confidence: p.hasBody ? (p.search.hasData ? "high" : "medium") : "low", needsAgentReview: false, reason: p.search.hasData ? "No blocking issue found." : "No blocking issue found in the body. Search performance is unknown (no rows), so this is not a performance verdict." });
  }
  for (const [lid, o] of mergeInto) { const sp = out.get(o.page_id!); if (sp && sp.verdict !== "FLAG_ONLY") sp.notes.push(`Would absorb ${byId.get(lid)!.url} (${out.get(lid)?.verdict}); a merged body is a Phase 3 job.`); }
  return out;
}

/** Final safety net: removes any MERGE/RETIRE whose target is missing, itself retired/noindexed/merged away, or loops. */
export function validateTargets(proposals: Map<string, Proposal>, existing: Set<string>): string[] {
  const problems: string[] = [];
  for (const [id, p] of proposals) {
    if (p.verdict !== "MERGE" && p.verdict !== "RETIRE") continue;
    const t = p.targetId ? proposals.get(p.targetId) : null;
    if (!p.targetId || !existing.has(p.targetId)) problems.push(`${id}: target missing`);
    else if (p.targetId === id) problems.push(`${id}: redirects to itself`);
    else if (t && ["MERGE", "RETIRE", "NOINDEX"].includes(t.verdict)) problems.push(`${id}: target ${p.targetId} is itself ${t.verdict}`);
  }
  return problems;
}
