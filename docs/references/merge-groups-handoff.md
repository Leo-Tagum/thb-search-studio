Snapshot as of 2026-10-05. Artifact links are interfaces, not source of truth; current status lives in the studio.

# Handoff — Leo's On-Page SEO merge/cannibalization work (Twin Home Buyer)

**Last updated:** October 5, 2026
**Read this first, then continue from "Current task" below.**

---

## 1. Who and what

- **Leo** — On-Page SEO at **Twin Home Buyer (THB)**, twinhomebuyer.com, a Bay Area cash home buyer (San Carlos, CA). Leo owns the **On-page** branch (content included). New to SEO; prefers step-by-step instructions, plain words, visuals when confused, and copy-paste-ready text.
- **Gian** — Technical SEO. Implements redirects, sitemap, canonicals, internal-link cleanup, Search Console verification, WP Engine cache. Maintains the SEO Command Center.
- **Bryan** — manager above Leo. Approves consolidations before redirects.
- **Juan Diaz** — CEO. Approves company claims. Communication style: short, decision-first (Objective / Status / Risk / Recommendation / Confirm).
- **Cherry** — follows Leo's task updates in the task tool.
- **Christine** — Off-page.

**Core principle:** On-Page decides what each page should do; Technical implements the method. Leo's part ends at "Ready for Technical."

---

## 2. Workflow and rules (apply to every merge group)

**Sequence:** Research → Intent → Evidence → On-Page decision → Content transfer/rewrite → QA → Bryan approval → Technical handoff → Monitor.

**Decisions (only these words):** MAIN · REWRITE · REDIRECT RECOMMENDATION · REMOVE RECOMMENDATION · KEEP / AD. Never write "301" as Leo's decision — Technical picks the method.

**Winner rule (same-intent pages only):** Intent gate → Leads → Clicks + average position for the target query → Backlinks → Content quality (tiebreaker). Impressions are context only.

**Hard rules learned:**
- Compare pages **outside** the tracker's group — in Merge Group 1 every final MAIN came from outside the original list.
- **Ad pages** (Google Ads landing pages) are KEEP / AD, never redirected; not being indexed doesn't matter for their job.
- **Pre-redirect rule:** no source URL is redirected until every meaningful source query is classified PRESERVED / INTENTIONALLY DROPPED / ALREADY COVERED, and PRESERVED items are live on the destination.
- KEEP + REWRITE only if: (1) distinct query/intent cluster, (2) a real seller question, (3) substantially different content is possible.
- Content transfer = **rewrite, never copy**; cap additions on money pages (~350–500 words); freeze forms/CTAs.
- Don't delete, unpublish, or rewrite pages that are about to be redirected (exception: remove false claims if the redirect is delayed).
- Use **12-month** data for decisions; 28-vs-28-day only for monitoring.
- "Crawled – currently not indexed" ≠ proof of cannibalization; treat causes as hypotheses until URL Inspection + query data support them.
- Cleanup priority: don't write new pages on already-covered topics until the cluster is cleaned; rewriting existing pages is part of cleanup; genuinely new topics are fine after a Content Planner check (Command Center task T-QUAL-3).

**Claims:**
- **Approved:** "close in as little as 7 days" (Command Center S-CLAIM-2d). Conflicting variants to avoid: "5 days", "7–14 days", "7 days or less", "within 7 days", "7–30 days".
- **False per THB Source of Truth:** THB is a licensed general contractor; Juan is a C36 plumbing contractor; any page implying THB holds CSLB #1066892. Safe wording: "construction experience helps evaluate condition and repair scope."
- Unverified recurring stats ($32M+ saved, 1,000+ houses, 100% on time, commission %, review counts) → **separate site-wide claim-audit task**, never a blocker.

**Known site issues:**
- City-page template injects the H1/page name into the hero paragraph ("[Name]: Twin Home Buyer makes…") and city-style meta descriptions ("cash home buyer in Relocation"). Templates are guarded — ask Gian, don't edit.
- "mahjongjp88"/AMP clicks in the 12-month GSC export are stale data from a fixed issue.

---

## 3. Tools, access and limits

- **Web fetch** only opens URLs Leo pastes in a message (or that appear in search results). Ask him to paste URLs.
- **No access** to GSC, WordPress, CRM, Google Ads, or the task tool. Leo pulls GSC exports/URL Inspection, pastes into WordPress (Elementor), posts updates.
- **GitHub:** repo `ean28/thb-leoblog` is private; Leo is a contributor. Use Claude Code (claude.ai/code) with a single self-contained prompt; repo has no `main` branch (base PRs on `claude/zen-ritchie-1m6d5r`).
- **Leo-owned artifacts (Claude can write their databases):** handoff board, report directory, index cleanup tracker, checklists, Bryan summary.
- **SEO Command Center** is owned by another account: Claude can't write its DB, but CAN publish HTML edits to it (that's how task T-X-MERGE1 was added). Warn Gian to keep edits when he republishes.

---

## 4. Links

| Artifact | URL | Notes |
|---|---|---|
| Merge & Cannibalization Handoff board | https://claude.ai/artifact/G2LL5gHqrDKSW7kqpYz8W9 | DB collection `groups`; MG1 doc `j96unq75`, MG2 doc `mg2asis1`. Per-URL decisions, evidence, tech status. |
| Report directory | https://claude.ai/artifact/3XDjggn4Kx2y77BcoNRmyy | DB `groups` (mg1, mg2 with milestones) and `entries`. Owner-only writes. |
| THB index cleanup tracker | https://claude.ai/artifact/7GiihTcWbBRbqKCbDyvQkc | DB `groups`, doc per group (MG2 = `core-asis`): fields `dec[]`, `unotes[]`, `notes`, `status` (todo/progress/blocked/done), `claimer`, `claimedBy`, `otherWinner`, `otherTarget`. |
| SEO Command Center | https://claude.ai/artifact/MwR4fpinmzECLGJX8EeaB7 | On-page branch = Leo. Task T-X-MERGE1 under E-QUAL. On-page statuses still "Not yet confirmed" (Leo must verify with evidence, then Gian flips it). |
| MG1 checklist | https://claude.ai/artifact/YWpR692Y7XK2QbMaJtgn32 | localStorage ticks + DONE defaults |
| MG2 checklist | https://claude.ai/artifact/8rax9wJhaXykcEkQcdLqxi | Scoped to 2 pages |
| Bryan summary (MG1) | https://claude.ai/artifact/Ep2EwQWPPefgZ7EVht84xE | Approved by Bryan Oct 5 |

---

## 5. Merge Group 1 — status: content done, redirects with Gian

| URL | Decision | Status |
|---|---|---|
| /relocation/ | MAIN — improved | Live Oct 5: new H1 "Relocating? Sell Your Bay Area House Before You Move", new meta, 2 HTML sections + 5-Q FAQ. QA passed. |
| /sell-bay-area-home-fast/ | REDIRECT REC → /relocation/ | Content transferred; Bryan approved; sent to Gian |
| /relocating-from-the-bay-area/ | REDIRECT REC → /relocation/ | Same |
| /sell-your-house-fast-to-a-cash-buyer/ | REDIRECT REC → /how-to-sell-your-house-fast-for-cash-bay-area-2026/ | 2026 guide got "Why Predictability Often Matters More Than Speed"; sent to Gian |
| /how-to-sell-your-house-fast-for-cash-bay-area-2026/ | MAIN | Live; still says "Licensed General Contractor / C36" — flagged to Juan |
| /sell-your-house-fast/ | MAIN | Indexed, main nav |
| /sell-your-house-in-7-days/ | PAUSED | Renamed from /sell-your-house-in-5-days/ under D-013 (cleanup for a dead /locations/ card + 5→7 claim), live Sep 29; not indexed; tiny demand. Leo said the 7-day naming was for consistency; still undecided between KEEP+REWRITE (deadline angle) and REDIRECT REC into /sell-your-house-fast/ (then repoint the /locations/ card). |
| /we-buy-houses-for-cash-in-california/ | HOLD | Earns 95 of 1,537 impressions for "we buy houses california"; need homepage query export. THB serves Bay Area + surrounding communities, not statewide. |
| 4 ad pages | KEEP / AD | Confirm campaigns active |

**Open MG1 items:** Gian's redirect ETA (if >few days, swap the contractor sentence on both relocation blogs — exact replacement text was given); hero-paragraph template question; California page form markup; 5-days and homepage GSC exports; leads for /sell-your-house-fast/; Day 14/28/56 monitoring vs the Oct 2 baseline (same date range).

---

## 6. Current task — Merge Group 2 (Bay Area as-is)

**Task name:** "Merge duplicate pages (Bay Area as-is page)" (task tool) / "Bay Area as-is page" (tracker, In progress, claimed by Leo).

**Scope (set by Leo):** the 4 not-indexed pages in the tracker group. The 2 ad pages (/sell-my-house-as-is/, /we-buy-houses-as-is-for-cash-fast/) stay untouched. **Work on 2 pages only.** Reference pages are never edited.

**Crawl findings (Oct 5):**
- **/sell-my-house-as-is-bay-area/** (blog, not indexed, 0 clicks, 37 impr): "fix up or sell as-is?" cost guide. Unique: Bay Area repair-cost ranges + as-is vs fix-up table. Problems: H1 starts "Buy My House…", off-topic title/lien FAQ, CSLB numbers + licensed-contractor claim, "7–14 days", "Guaranteed". **Leaning KEEP + REWRITE.**
- **/sell-my-house-fast-in-bad-condition-in-the-bay-area/** (money page, not indexed, 0 clicks, 8 impr): city-template copy; overlaps /major-repairs/, /sell-my-damaged-house-for-cash/, /old-houses/. **Leaning REDIRECT REC** into the indexed condition page (likely /major-repairs/) — needs data.
- Reference /sell-house-as-is-bay-area/ = "what as-is means in CA" (different intent). Reference /sell-fixer-upper-as-is-bay-area-2026/ = fixer-upper market (8 clicks; partial overlap with the blog).
- Future group candidate (out of scope): two "as-is buying process" pages, /sell-your-house-as-is/ and /sell-your-house-as-is-bay-area/.

**Waiting on Leo:** per-page GSC query export (12 months) + URL Inspection for /sell-my-house-as-is-bay-area/, /sell-my-house-fast-in-bad-condition-in-the-bay-area/, /major-repairs/, /sell-fixer-upper-as-is-bay-area-2026/. Offer to crawl /major-repairs/ if he pastes the URL.

**Next after data:** confirm decisions → classify queries → record in board + tracker (dropdowns, "Main page not in this list?") → draft rewrite/transfer → QA → Bryan summary → Gian handoff (if redirects) → update directory.

---

## 7. Automation idea (discussed, not built)

GSC API (page+query dimension, URL Inspection API) + sitemap → crawler → AI recommendation table using the workflow's decision words → Leo decides. Needs Gian to set up Search Console API access. Monday.com not needed.

---

## 8. How to work with Leo

- Give numbered steps with exact clicks and copy-ready blocks; offer a visual when he's confused.
- Update the board / tracker / directory as you go and tell him what changed.
- When he pastes "second opinions" (GPT, Grok), evaluate point by point: agree where right, correct overstatements, keep his workflow's rules.
- Don't claim facts you can't see; ask him to pull the data.
