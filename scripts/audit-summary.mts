// Phase 2b: one-page plain-language summary for Cherry and Juan, generated from the audit queue (numbers cannot drift from it).
// Writes docs/phases/phase-2b-summary.md. Publishing it anywhere (artifact, doc) is a separate step that needs Leo's OK.
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: run } = await db.from("blog_audits").select("audit_run").order("audit_run", { ascending: false }).limit(1).single();
const { data: audits } = await db.from("blog_audits").select("id,page_id,proposed_verdict,final_verdict,status,reason,evidence,target_url").eq("audit_run", run!.audit_run);
const { data: pages } = await db.from("pages").select("id,url,title");
const { data: actions } = await db.from("blog_audit_actions").select("action,old_url,target_url,reason").neq("status", "CANCELLED");
const { data: sys } = await db.from("app_settings").select("value").eq("key", `blog_audit_systemic_${run!.audit_run}`).maybeSingle();
const meta = new Map(pages!.map((p) => [p.id, p]));
const rows = audits!;
const n = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
const verdictOf = (r: (typeof rows)[number]) => r.final_verdict ?? r.proposed_verdict;
const decided = n((r) => r.status === "APPROVED" || r.status === "CHANGED");
const plain = (t: string) => t.replace(/^Fixable on the same URL: /, "").replace(/pending\/unapproved brand facts \(([^)]*)\)/g, "uses a claim Juan has not approved yet ($1)").replace(/typed star rating \/ review count \(permanent rating rule\)/g, "writes a star rating or review count by hand").replace(/\(heuristic\)/g, "").replace(/\s+/g, " ").trim();
const clean = (s: string | null | undefined) => (s ?? "").replace(/<br\s*\/?>/g, " ").replace(/\s+/g, " ").trim();

const top = rows.filter((r) => ["UPDATE", "MERGE", "RETIRE", "NOINDEX"].includes(r.proposed_verdict) && r.status !== "HELD")
  .sort((a, b) => (b.evidence.search.impressions ?? 0) - (a.evidence.search.impressions ?? 0)).slice(0, 10);
const noData = n((r) => !r.evidence.search.hasData);
const verdicts = ["UPDATE", "HOLD", "KEEP", "MERGE", "RETIRE", "NOINDEX", "FLAG_ONLY"];
const counts = (f: (r: (typeof rows)[number]) => string) => verdicts.map((v) => `${v === "FLAG_ONLY" ? "Flag only" : v === "HOLD" ? "Hold (waiting on Juan)" : v[0] + v.slice(1).toLowerCase()}: ${n((r) => f(r) === v)}`).join(" · ");

const md = `# Blog audit summary (${run!.audit_run})

**What this is.** We reviewed all ${rows.length} published blog posts against Google Search Console data (15.5 months, ${rows.length - noData} posts have data) and the text of each post. Everything below is a **recommendation**. Leo has approved ${decided} of ${rows.length} so far. Nothing has been changed on the website, and this tool never changes it: any redirect or noindex is done by hand by Leo and Gian.

## Where the ${rows.length} posts stand (proposed)
${counts((r) => r.proposed_verdict)}

- **Update**: a real problem fixable on the same page (wrong years, competitor links, unsourced legal claims, typed ratings, missing sources, and claims the Studio now blocks: "founder", "$32M" saved fees, closing timeframes such as "7 days"). **Hold**: nothing wrong except claims Juan has not approved yet (24 hours, contractor license, ownership); we wait for him. **Keep**: nothing blocking found. **Merge / Retire**: two posts compete for the same searches; keep the stronger one. **Noindex**: keep the page but hide it from Google. **Flag only**: protected page, look but don't touch.
- ${noData} posts have no Google data at all. That means "unknown", not "not working". None was marked for removal because of it.

## Top 10 fixes (biggest search visibility first)
${top.map((r, i) => `${i + 1}. **${clean(meta.get(r.page_id)?.title)}** — ${r.proposed_verdict}. ${r.evidence.search.impressions.toLocaleString("en-US")} Google impressions. ${plain(r.reason).slice(0, 240)}${plain(r.reason).length > 240 ? "…" : ""}`).join("\n")}

## Waiting on Juan (${n((r) => r.proposed_verdict === "HOLD")} posts)
These posts have no other problem; they only use claims that are not approved yet. No change until Juan decides. Open each in the audit queue for the exact sentences.

## One fix for many posts
${(sys?.value?.findings ?? []).length ? (sys!.value.findings as { posts: number; rules: string[]; segment: string }[]).map((f) => `- A block of text shared by **${f.posts} posts** ("${f.segment.slice(0, 80)}") ${f.rules.join("; ").replace("typed star rating / review count (permanent rating rule)", "shows a typed review count, which breaks our rule that the rating always comes from the live Google widget")}. Fix it once in the site template, not post by post. Developer Change Request for Gian: docs/phases/phase-2b-dcr-reviews-block.md.`).join("\n") : "- None found."}

## Redirects (301)
${(actions ?? []).filter((a) => a.action !== "NOINDEX").length ? (actions ?? []).filter((a) => a.action !== "NOINDEX").map((a) => `- ${a.old_url} → ${a.target_url}`).join("\n") : `No redirect has been approved yet. Currently proposed: ${n((r) => r.proposed_verdict === "RETIRE")} retire, ${n((r) => r.proposed_verdict === "MERGE")} merge (a merge combines the best parts first, then redirects).`}

## What we don't know
- Whether any post is a protected "money" page: the partner's protected list hasn't arrived, so every post is "unknown" and needs an explicit OK before a change.
- Which posts bring in sellers (lead data isn't connected yet). This audit looks at search and content only.
- What Google's results pages look like for these searches (not observed).
- Links *to* each post are counted from the other blog posts only, not from the 230 site pages.
`;
writeFileSync("docs/phases/phase-2b-summary.md", md);
console.log(JSON.stringify({ posts: rows.length, proposed: Object.fromEntries(verdicts.map((v) => [v, n((r) => r.proposed_verdict === v)])), decided, effective: Object.fromEntries(verdicts.map((v) => [v, n((r) => verdictOf(r) === v)])), noData, top: top.length }));
