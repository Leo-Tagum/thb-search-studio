# Phase 2b — Blog Audit

> Plan written 2026-10-10; Leo said go the same day (answers below). Built, awaiting his review of the verdicts.

## Goal
Audit every published blog post (122 confirmed in the inventory: all published, all in the sitemap) and give each one a recommended verdict that Leo approves: **KEEP / UPDATE / MERGE (into URL) / RETIRE (301 to URL) / NOINDEX**.

## Read first
- Design `docs/superpowers/specs/2026-10-10-thb-search-studio-design.md` — §5 (Ingestion, rate limiter), §7 (protected-URL list, template pages).
- Blueprint `THB_Search_Growth_and_Content_Intelligence_System_v2_0.md` — §4 decision table (MERGE guardrails: surviving URL, mapping, redirects, internal-link updates, backup), §8 cannibalization logic, §14 rows 1, 2, 4, 11.
- `docs/references/editorial-standards.md` (sections 1–2, 4, 5, 7 incl. the permanent rating rule).
- Phase 1 handoff (inventory, the 503 stop event) and Phase 2 handoff (`phase-2-engine-a.md`: GSC import, overlap detection, agent bridge, brand-fact checks).

## Depends on
Phase 2 **DONE** (it is). Reused as is: inventory (122 posts, 230 pages), 90 days of GSC (2026-07-10..2026-10-07; 42 of the 122 posts have any rows, so 80 are "unknown"), overlap detection, brand-fact and rating-rule checks, the audit log, the queue pattern.

## Rules (from Leo)
- **The Studio never deletes, redirects, noindexes or edits anything in WordPress.** MERGE, RETIRE and NOINDEX produce a **manual action list** (old URL → target URL, reason) for Leo and Gian.
- **Every verdict needs Leo's approval in the queue, with a reason.** No auto-approval, no bulk approval of MERGE / RETIRE / NOINDEX.
- **Never recommend changing a protected or money page: flag only.** Unknown protection status gets a warning that needs an explicit acknowledgement (existing pattern).
- **"No GSC data" = unknown, not "dead".** It is never the sole reason for RETIRE, NOINDEX or MERGE.
- **MERGE names which URL survives and why.** The merged body is a normal Phase 3 job later, not part of this phase.
- No new crawling: evidence comes from the inventory, stored post bodies via the public WP REST API at **at most 5 requests per minute**, and GSC. No writes to WordPress, no secrets in git or prompts, THB requests never above 20 per minute overall.

## Evidence per post
| Evidence | Source | Notes |
|---|---|---|
| Clicks, impressions, average position, top queries (90 days) | GSC import already stored | "No data" shown as unknown; window and caveats shown |
| Overlap with other posts/pages (cannibalization) | Engine A: shared ranking queries + same intent | Needs shared queries; title/slug similarity alone is only "possible overlap, unverified" |
| Last modified date | Inventory | |
| Word count | Stored post body | |
| Internal links out / in | Stored post bodies | "In" counts links from the 122 posts only, labelled partial (the 230 pages are not fetched) |
| Competitor links or images (e.g. Redfin) | Stored body, deterministic domain list | List maintained by Leo |
| Wrong or unapproved brand facts ("25+/27 years", typed ratings or review counts, pending facts) | Existing brand-fact, sourced-fact and rating-rule checks run on the body | Flags the exact text |
| Legal claims without official sources | Heuristic detector for legal/tax/permit/disclosure statements + whether an official link (.gov, .ca.us, listed county domains) is present | Heuristic, labelled; a human judges |
| Missing Sources section, missing author box | Body patterns | |
| Generic AI-sounding filler | Banned and generic phrase list from editorial-standards section 4 | Advisory only |
| Money-page / protected status | Inventory (Leo marks it) | Protected or money = flag only |

## Verdicts
- **KEEP:** no blocking issue found.
- **UPDATE:** issues fixable on the same URL (listed). Becomes a normal Phase 3 UPDATE job later.
- **MERGE (into URL):** supported overlap (shared queries and same intent). Names the surviving URL and the reasons (e.g. stronger rankings, more complete, older URL), the mapping and the internal links to update.
- **RETIRE (301 to URL):** low value, outdated or duplicative with a proposed redirect target that exists and is not itself retired.
- **NOINDEX:** should stay reachable but not be indexed (e.g. thin or time-bound), with the reason.
- **FLAG ONLY:** protected or money page: findings listed, no change recommended.
Each verdict shows its evidence, a confidence level and what is unknown.

## Tasks (to be started only on Leo's go; each has a check)
1. **Confirm the post set.** Re-read the inventory: 122 published posts, canonicals de-duplicated, none outside the sitemap. *Check:* count printed and matches; any post flagged protected or template listed.
2. **Migration: audit tables.** `blog_audits` (post, evidence, checks, proposed verdict, target URL, reason, confidence, unknowns, status, Leo's decision and reason) and `blog_audit_actions` (manual action list rows); RLS forced; every decision writes an audit event. *Check:* `db:check` passes, anon refused.
3. **Fetch post bodies politely.** Public WP REST GET per post (no cache-busting), **at most 5 per minute (about 25 minutes for 122)**, stored in `page_snapshots` (status, content hash, body text); resumable and idempotent; **stops itself on any 503/429 and is not retried automatically** (lesson from the Phase 1 stop event); bodies are untrusted data. *Check:* mocked-clock test never exceeds 5/min; 5xx stops the run; 122 snapshots stored.
4. **GSC evidence per post.** From the stored import: clicks, impressions, position, top queries, window and caveats; posts with no rows show "unknown". *Check:* 42 posts with data, 80 shown as unknown (not zero).
5. **Overlap detection for posts.** Reuse Engine A: pairs of posts/pages sharing queries and intent get a cannibalization finding; no shared-query evidence means "possible overlap, unverified" at most. *Check:* fixtures for overlap, similar-looking pages with no shared queries, and a post with no data.
6. **Structural facts.** Word count, last modified, links out/in (in = from posts only, labelled). *Check:* fixture HTML tests.
7. **Content checks.** Competitor domains, brand-fact / sourced-fact / rating-rule scan of the body text, legal-claim detector and official-link check, Sources section, author box, filler phrases. *Check:* fixture posts for each check, including a clean post that raises nothing; the same patterns Phase 2 enforces on agent output are reused, not rewritten.
8. **Verdict proposal engine.** Deterministic rules produce a proposed verdict with a reason; RETIRE, NOINDEX and MERGE need extra evidence and are never proposed on "no data" alone; protected/money = FLAG ONLY; MERGE names the survivor and why; RETIRE's target must exist, must not be retired or noindexed, and must not create a chain or loop. *Check:* unit tests for each guardrail. Decision for Leo: whether to add an Agent 1 review run (the same bridge) for the ambiguous MERGE / RETIRE / NOINDEX cases only (not all 122), or deterministic proposals only.
9. **Audit queue UI.** `/audit`: 122 rows, filter by verdict, issue and protection; detail with all evidence and unknowns; Leo approves, changes the verdict or holds, with a required reason; no bulk approval of MERGE / RETIRE / NOINDEX; acknowledgement for unknown protection. *Check:* a live smoke approves one, changes one and holds one, with audit rows.
10. **Manual action list.** For approved MERGE / RETIRE / NOINDEX: old URL → target URL, action, reason, evidence summary, status; exported as CSV and a readable page for Leo and Gian. Includes the redirect (301) list. The Studio only lists; nothing is executed. *Check:* no chains, loops, missing or retired targets in the list; a test proves no code path writes to WordPress.
11. **One-page summary for Cherry and Juan.** Plain language: counts per verdict, top 10 fixes (ranked by impact), the redirect list. *Check:* numbers match the queue; no jargon; unknowns stated.
12. **Verify and hand off.** A verify script with real numbers; regression tests; handoff in blueprint §17 format; commit and push.

## What I need from Leo before starting
- A "go" (this plan has not been started).
- **Live-site permission for the body fetch:** 122 public WP REST requests at 5 per minute, about 25 minutes, ideally off-hours. Say if you want a different window.
- **Protected / money posts:** mark any you know (the partner's protected-URL list is still outstanding). Unknown stays flagged.
- **Competitor domain list:** confirm or extend (Redfin, Zillow, Opendoor, Offerpad, Realtor.com, Trulia, Compass, HomeLight and similar).
- **GSC window:** only 42 of 122 posts have data in the 90-day export. I recommend re-importing a longer window (Search Console keeps about 16 months; read-only API, no THB site requests) so fewer posts are "unknown". OK?
- **Agent review:** deterministic proposals only, or an Agent 1 review for the ambiguous cases?
- **Summary format** for Cherry and Juan: a one-page document you can share, or a file. I will ask again before publishing anything.

## Out of scope
- Any change to WordPress: edits, redirects, noindex, deletion, publishing.
- Writing merged or updated bodies (Phase 3).
- Auditing the 230 pages, or backlink / link-equity analysis.
- SERP observation, and GA4 / lead data (Phase 6): "value" here is search and content evidence only.
- Rewriting content or changing the approved brand facts.

## Done when
- [ ] All 122 posts have a recommended verdict with evidence (unknowns stated)
- [ ] Leo has reviewed every verdict in the queue, each with a reason
- [ ] The manual action list (including the redirect list) exists and passes its checks
- [ ] The one-page summary for Cherry and Juan exists
- [ ] No WordPress action was taken by the Studio

## Leo's answers (2026-10-10) and how they were applied
1. Bodies: 2 requests (`posts?per_page=100`, `_fields=id,link,modified,content`), paced at <=5/min, stop on 403/429/5xx, no retry. Ran live: 122 posts, 0 errors.
2. Protection: no blog post known as protected/money; all 122 stay `unknown`. Unknown is shown with a warning, and approving any change (UPDATE/MERGE/RETIRE/NOINDEX) needs an explicit acknowledgement; a protected post can only be FLAG_ONLY.
3. Competitor domains: his list plus homevestors, webuyuglyhouses, sundae, houzeo, zillow (`COMPETITOR_DOMAINS` in `src/lib/audit/checks.ts`).
4. GSC: re-imported 2025-06-15..2026-10-07 (read-only).
5. Agent 1 only on ambiguous MERGE/RETIRE/NOINDEX: 1 case, advisory (stored on the row; not bridge-validated).
6. Summary: generated locally at `docs/phases/phase-2b-summary.md`. **Not published**; waiting for Leo's OK.

## Update 2026-10-10 (after Leo's brand-fact change)
- Brand Facts (Juan confirmed in writing 2026-10-10; channel not recorded): new `experience_total` = "25+ years of experience in Bay Area real estate" (approved by Juan in writing, 2026-10-10); `industry_experience` stays "...since 2002" as a separate fact; combined sentence allowed. Exact counts (27/24 years), "over 25 years", "20+ years", "25+ years in business" and 2002-as-founding-year are blocked. The Lawrence SOP is a voice guide only (stated in editorial-standards.md). Code: `EXPERIENCE_YEARS_PATTERNS` in `src/lib/agents/bridge.ts` (agents and audit share it).
- Audit split: **UPDATE (group A)** = real problems: wrong years, competitor links/images, unsourced legal claims (no official link, or no "confirm with a professional"), typed ratings/review counts, sourced facts not in approved wording, dated title, no Sources section on a post with 2+ legal-type statements. **HOLD (group B)** = only claims waiting on Juan (24h, closing time, contractor license, ownership, ...), exact sentences listed, no change until he decides. A post with a group A problem and pending claims stays UPDATE (pending claims noted).
- New counts (122 posts): UPDATE 78, HOLD 27, KEEP 15, MERGE 2, RETIRE 0, NOINDEX 0, FLAG_ONLY 0.
- Developer Change Request for Gian: `docs/phases/phase-2b-dcr-reviews-block.md` (typed "See All 115 Reviews" / "92% excellent rating" block in 60 posts).
- Migration 0011 adds the HOLD verdict.

## Handoff
```text
PHASE: 2b — Blog Audit
STATUS: PARTIAL (engine, queue and action list built and verified; Leo's review of the 122 verdicts has not happened)
WHAT WAS BUILT:
- Post bodies fetched (2 requests) into page_snapshots (body_text = rendered HTML, untrusted).
- 16-month GSC pull as page and page x query totals (no date dimension) in audit_gsc_imports / audit_gsc_rows, kept apart from the Phase 2 import.
- Evidence + deterministic verdict engine (KEEP/UPDATE/MERGE/RETIRE/NOINDEX/FLAG_ONLY) with all plan guardrails; template-block detection (text shared by 8+ posts is judged once, site-wide).
- /audit queue, /audit/[id] detail + decision (approve / change / hold, reason required, protection acknowledgement), /audit/actions manual action list + CSV.
- Plain-language summary generator (not published).
FILES / TABLES / ENDPOINTS CHANGED:
- Migration 0010: audit_gsc_imports, audit_gsc_rows, blog_audits, blog_audit_actions (RLS forced).
- src/lib/audit/*, src/app/audit/*, scripts: fetch-post-bodies, import-gsc-audit, run-blog-audit, audit-smoke, audit-summary; gsc.ts gained fetchGscAggregate; nav link.
- npm scripts: fetch:bodies, import:gsc-audit, audit:blog.
TESTS RUN + RESULTS:
- vitest 130/130 (35 new: 5/min limiter + stop on 429/503/500, structure, content checks incl. clean post, verdict guardrails incl. no-data, protected, chains/loops, overlap on shared queries only, action-list validation, no-WordPress-write scan).
- db:check PASS (38 tables, RLS everywhere, anon refused). next build OK; /audit, /audit/actions and the CSV route return 200 on live data.
- Live smoke on a throwaway audit_run: one approved, one changed (to RETIRE), one held; refused: no reason, missing acknowledgement, missing target, self-redirect, bulk approval of MERGE. 3 audit_events written; fixture rows removed.
- Real numbers: 122 posts, 122 bodies, 99 with search data (was 42 in the 90-day window), 23 unknown. Proposed: KEEP 22, UPDATE 98, MERGE 2, RETIRE 0, NOINDEX 0, FLAG_ONLY 0. Agent 1 reviewed the one low-confidence MERGE and recommended HOLD.
DATA / PERMISSION / PRIVACY IMPACT:
- Only 2 GET requests to twinhomebuyer.com. GSC read-only scope. No WordPress writes; a test scans the audit code for non-GET methods and credentials.
- Side effect to know: a first 480-day page x query x date import hit the 200,000-row cap (truncated) and would have replaced the Phase 2 candidate data as "latest import"; it was deleted. Phase 2 data is unchanged (31,790 rows). Running npm run phase2-verify earlier also created and cancelled its labelled fixture opportunity.
STAGING DEMO: npm run dev, open /audit.
KNOWN LIMITATIONS:
- 98 UPDATE verdicts is high: most come from real brand-rule hits (pending facts such as 24 hours / closing timeframe / contractor license, 25+/27 years, typed review counts). They are sorted by impressions; severity tiers would help review.
- 491 of 801 URLs in GSC are not in the inventory (city/county pages, contact page and others). They count for overlap but cannot be redirect targets.
- Legal-claim and filler detectors are heuristics; author box and Sources are checked in the body only (the theme may add them).
- Inbound links counted from the 122 posts only.
- Agent 1 review is advisory and outside the bridge validation (the bridge is built for opportunities).
OPEN DECISIONS:
- Leo: review the 122 verdicts in /audit (each with a reason); 60 posts share one template block with a typed review count (fix once in the template, developer change request).
- Leo: OK to publish the summary as one artifact shared with the org?
- Partner's protected-URL list (still outstanding); local cash-buyer competitor domains to add.
NEXT APPROVED STEP: Leo reviews /audit; then mark Phase 2b DONE and hand the action list to Gian.
```
