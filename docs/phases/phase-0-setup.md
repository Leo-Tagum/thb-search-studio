# Phase 0 — Setup & Access Audit

## Goal
Set up the project and prove, with real credentials, that every outside dependency works as the design assumes: Search Console, GA4, the public WordPress API, Supabase, and Juan's approval through an artifact. Nothing is built on an assumption that this phase can check.

## Read first
- Design: `docs/superpowers/specs/2026-10-10-thb-search-studio-design.md` — §1 Context, §3 Decisions, §4 Recommendations, §5 Architecture (the "Ingestion", "Owner approval via artifact" and "Secrets" bullets only), §7 Calls.
- Blueprint: `THB_Search_Growth_and_Content_Intelligence_System_v2_0.md` — §12 "Security and safety requirements", §13 "Phase 0", §17 (working rules, handoff format, stop conditions).
- Stack facts: `TECH_STACK (1).md` — "Website / WordPress" table (Wordfence limits, Cloudflare/Varnish cache) and "Shared" table (secrets convention).

## Depends on
Nothing. This is the first phase. Leo must have to hand:
- Google Cloud service account JSON key with Search Console and GA4 access (read-only).
- The GA4 property ID for twinhomebuyer.com.
- A Supabase account.
- The location of the 21 anonymized seller briefs.

## Hard rules for this phase
- **Read-only against everything THB.** No writes to WordPress, GSC, GA4 or any THB system.
- **Request rate to twinhomebuyer.com stays at or below 20 requests/minute.** No cache-busting query parameters. Wordfence bans at roughly 60/min and blocks for an hour.
- **Secrets never go into git, prompts, chat or artifact content.**
- **Real seller originals never enter this project.** Only the anonymized briefs.

## Tasks
Each step has a **Check** column. Record each result in the Handoff.

1. **Check that the folder path works with the tooling.** The folder name contains `&` and spaces, which can break npm scripts on Windows.
   - Run `node -v` and `npm -v`. Then, in a scratch subfolder, run `npm init -y` followed by `npm run` with a trivial script.
   - **Check:** the script runs. If it fails because of the path, stop and ask Leo to move or rename the folder (for example `thb-search-studio`) before continuing.
2. **Initialise git.**
   - Run `git init`.
   - Write a `.gitignore` covering `node_modules`, `.next`, `.env*` except `.env.example`, `*.json` keys under `secrets/`, `.vercel`, and `TECH_STACK (1).md`. That file contains production SSH/deploy host details and must never be committed; Claude can still read it locally.
   - Create `.env.example` with placeholder names only.
   - **Check:** `git status` shows the docs and blueprint files, no secrets, and not `TECH_STACK (1).md`.
3. **Add secret-read protection.**
   - Add deny rules to `.claude/settings.json` (merge with the existing file; don't overwrite it) blocking reads of `.env*` (except `.env.example`), `secrets/**`, `*.pem` and `*service-account*.json`.
   - **Check:** the file parses as JSON, and a test read of a dummy `secrets/test.json` is refused.
4. **Scaffold the app.**
   - Create a Next.js + TypeScript app (App Router, Tailwind, ESLint) in the project root. If `create-next-app` refuses because the folder isn't empty, scaffold into a temp folder and move the files in.
   - Add Vitest with one trivial test.
   - **Check:** `npm run build` succeeds, `npm run dev` serves `http://localhost:3000`, and `npm test` passes.
5. **Create and connect Supabase.**
   - Leo creates a cloud project.
   - Put the URL and keys in `.env.local`. The service key is server-only and never reaches the browser bundle.
   - Add a server-only health check (a route or script) that runs `select 1`.
   - **Check:** the health check returns OK. Searching the built `.next/static` for the service key finds nothing.
6. **Search Console access.**
   - Save the service-account JSON under `secrets/`.
   - Write a script that lists the sites the account can see, then pulls 7 days of Search Analytics (dimensions: page and query) for the THB property.
   - **Check:** the THB property is listed (record whether it's `sc-domain:` or a URL-prefix property) and rows are returned. The scope requested is `webmasters.readonly`. Record the row count and confirm no write scope is requested.
7. **GA4 access.**
   - Write a script that runs one GA4 Data API report: sessions by landing page for the last 7 days, filtered to organic search.
   - **Check:** rows are returned using the `analytics.readonly` scope. Record which conversion or key events exist, so you know whether lead events are tracked.
8. **WordPress public API and sitemap (read-only, rate-limited).**
   - Write a script with a global limiter of 20 requests/minute that:
     - pages through `/wp-json/wp/v2/posts` and `/wp-json/wp/v2/pages` with `_fields=id,slug,link,modified,type,status,yoast_head_json`;
     - then reads `/sitemap_index.xml` and its child sitemaps.
   - **Check:** no 403, 429 or Wordfence block page. Record the actual published post and page counts, the sitemap URL count, any URLs in one source but not the other, and whether the `yoast_head_json` fields came back. The blueprint's "122 posts" figure is not assumed.
9. **Request the protected-URL list.**
   - Draft a short message for Leo to send to their partner, asking for the protected/Ads URL list as a plain CSV or text file.
   - **Check:** Leo confirms it was sent. Record the date. The list arriving is not required to finish this phase.
10. **Prove the approval round-trip with Juan. This is the critical proof.**
    - Load the `artifact-capabilities` skill.
    - Build a **throwaway** proposal artifact that shows dummy content and a visible version hash, with Approve / Hold / Request changes buttons that record the decision, the viewer's identity, the time and the version hash in the artifact database.
    - Leo shares it with Juan, and Juan clicks one button.
    - Claude Code reads the record back with `ArtifactData`.
    - **Check:** the read-back shows Juan's identity (not Leo's), the decision, the time and the matching hash. If identity can't be captured, or read-back fails, **stop**: record the failure and present fallback options to Leo. Don't pick one yourself.
11. **Check the seller briefs.**
    - Leo points to the 21 anonymized briefs. Don't copy them into the repo yet.
    - Spot-check every brief for names, street addresses, exact prices and other identifying combinations.
    - **Check:** record the count found, their format, and any brief that fails the check. Failing briefs are listed for Leo to fix, never fixed silently.
12. **Write the Phase 0 handoff.**
    - Fill in the Handoff section below.
    - Update `docs/phases/STATUS.md`.
    - Make the first commit, which includes the docs.
    - **Check:** `git log` shows the commit, and `git status` is clean apart from ignored files.

## Progress log (2026-10-10)
- **Step 1 PASS:** Node v24.18.1, npm 11.16.0; npm scripts run in this path (folder is `thb-search-studio`, no `&`).
- **Step 2 PASS:** git initialised; `.gitignore` covers secrets, `secrets/`, `.env*` (except `.env.example`), `TECH_STACK (1).md`; `git status` shows no secrets.
- **Step 3 PASS:** deny rules in `.claude/settings.json`; test read of `secrets/test.json` was refused. Deny rules can't have exceptions, so `.env*` is listed by specific names to keep `.env.example` readable.
- **Step 4 PASS:** Next.js (App Router, TS, Tailwind, ESLint) + Vitest. `npm run build` OK, dev server returns HTTP 200 on :3000, `npm test` 1/1, lint clean. `@types/node` pinned to 24 (Vitest 5 peer conflict with 20).
- **Step 8 DONE** (`npm run audit:wp`, 8 requests, ≤20/min, no 403/429/block): 122 posts + 230 pages, all `publish`; sitemap 346 URLs (post-sitemap 122, page-sitemap 224). 6 pages in the API but not the sitemap: reddit-thank-you, sell-your-oakland-home-as-is, sell-today, welcome, thank-you, forms. Nothing in the sitemap is missing from the API. **`yoast_head_json` is NOT exposed** (0/352; also no `yoast_head`; the REST response has `class_list` and `acf` instead). Phase 1 will need another source for Yoast title/description (rendered snapshot, or a Yoast endpoint to be tested).
- **Step 5 PASS:** `/api/health` returns `{"ok":true}` (HTTP 200) on the production build; `npm`-run `scripts/bundle-scan.ts` finds the service key in 0 of 23 files in `.next/static`. The health check uses a service-key call to the auth admin API, not a literal `select 1` (supabase-js can't run raw SQL); Phase 1 can replace it with a `select 1` function once there's a schema. `server-only` guards the client module.
- **Step 6 PASS** (`scripts/gsc-audit.ts`): scope `webmasters.readonly` only. The one visible property is `https://www.twinhomebuyer.com/` (**URL-prefix, with www**), permission `siteRestrictedUser`. 7 days (2026-10-01..2026-10-07, `final` data) of page×query: 798 rows (rowLimit 5000, so not truncated).
- **Step 7 PASS** (`scripts/ga4-audit.ts`): scope `analytics.readonly` only. Organic landing-page report returned 19 rows for the last 7 days (low volume; one row is `(not set)`). Events in 90 days include `generate_lead` (192, the only event marked as a key event), `contact` (36), `thb_lead_confirmed_ga4` (2), `click`, `video_*`. Lead events are tracked.
- **Step 10 PARTIAL, SELF-TEST ONLY (2026-10-10):** throwaway artifact published (dummy content, `db` + `user` capabilities, collection `approvals`). **SELF-TEST:** Leo clicked Approve (note "test") and Claude Code read the record back with `ArtifactData`: decision `approve`; viewer id `u_YkDr…` (opaque id, resolves to the account display name "Trainng Equity Track PH", i.e. the shared training account, **Leo's own account, not Juan's**); time 2026-10-10T17:50:34Z (browser clock; server `updatedAt` 17:50:34.8Z agrees); version hash `7ffd393a…74ad`, which **matches an independent SHA-256 recomputation** from the page source. This proves the mechanism (identity captured, decision, time and hash round-trip). **It does not pass step 10: Juan's own click is still required** to show his identity differs from Leo's. Juan needs Contributor access or higher to write. Both people must use separate accounts; a shared login would make the identity check meaningless.
- **Step 11 DONE** (spot-check only; nothing copied into the repo): one file, `seller-library.md` in the parent folder (`Leo Code/`), Markdown: an index table plus one section per case, with fixed fields (use level, calls, property general, story, worries, permission, don't-write-about). **21 briefs found, matching the index.** **Source of record from now on: `seller-library-fixed.md` (same folder), which replaces `seller-library.md`.** Pattern scan (dollar amounts, phone numbers, emails, URLs, street addresses, ZIP codes) plus a full read-through. No street addresses, phone numbers, emails, URLs or ZIP codes.
  - **Fails:** C-12, a seller's first name appears in the story. **CLOSED:** fixed in `seller-library-fixed.md` and re-checked.
  - **Borderline:** C-37 quoted (**CLOSED, replaced with "that much" in the fixed file**) a seller's six-figure loss estimate next to a named neighbourhood. C-16 notes that she and her mother share a first name. C-17 notes his sister is a real estate broker.
  - **Identity-risk combinations (neighbourhood/city + specifics, matchable to public records):** C-04, C-25, C-01, C-37, C-41 (tax sale), C-16, C-26.
  - **Not for publication (expected internally):** exact dates in all 21; dollar amounts in C-01 (HOA fee), C-13 (price reduction), C-32 (buyer budget), C-37, C-41 (two figures). None of these is a sale price.
  - **Sensitive personal detail in the Story field** (all also in each brief's don't-write note): health or family loss in C-04, C-05, C-39, C-23.
  - **Use level vs Permission:** none has written permission to be named. C-13, C-23 and C-32 are flagged by the briefs themselves as not case-study candidates, and C-01, C-02, C-04, C-05, C-12, C-17, C-23 and C-41 carry unresolved "Juan should review" items.
- **Decision (Leo, 2026-10-10):** identifying details in the seller briefs (C-16, C-17, area + detail combinations, dates, amounts) are fine for internal use only and must never appear in a blog draft. Recorded in the handoff under OPEN DECISIONS as resolved and carried into Phase 1. Not covered by it: the seller first name in C-12 (still to fix or accept).
- **Step 9 PENDING (Leo, 2026-10-10):** the partner is absent and the message has not been sent. Not required to finish this phase. Until the list arrives, **every page's protection status is treated as unknown**, so an UPDATE on any page shows the design's warning and needs explicit acknowledgement (design §7); Leo can mark a page manually with an audited reason.
- **Step 12 (2026-10-10):** handoff filled in as PARTIAL, STATUS.md left IN PROGRESS, first commit made.
- **Step 10 update (2026-10-10, second identity):** mechanism proven with a second identity; Juan's own click still needed before Phase 3. A second org account (Bryan Cadahing, via remote desktop; not Juan) approved the test artifact. Read back from the artifact database: two approval records for TEST-0001 / dummy-v1, both with the same version hash (starts 7ffd393a); the two viewer identities differ (Leo's account vs Bryan Cadahing); the hash was recomputed independently from the artifact text and matches. Caveats: the hash is computed in the viewer's browser and the timestamp uses the viewer's clock.
- **PARTIAL accepted by Leo (2026-10-10).** Phase 1 may start. Still open: Juan's approval click (step 10) and the partner's protected-URL list (step 9); every page stays protection-status UNKNOWN until the list is imported.

## Out of scope
- Database schema, tables, migrations or RLS policies (Phase 1). The only database work here is the health check.
- Agents, subagent files, slash commands or prompts (Phases 2–3).
- Any UI beyond the default scaffold page.
- Importing inventory, GSC or GA4 data into the database. Scripts here only prove access and print results.
- Importing the seller briefs or brand facts (Phase 1).
- Any write to WordPress, and any staging or ddev work.

## Done when
- [x] Tooling works in this folder path (or the folder was moved and the move is recorded)
- [x] Git repo initialised; no secrets tracked; secret-read deny rules active
- [x] Next.js app builds, serves locally, and has a passing test
- [x] Supabase health check passes; service key absent from the browser bundle
- [x] GSC: THB property and type recorded; page×query rows returned with a read-only scope
- [x] GA4: report rows returned with a read-only scope; available lead/conversion events recorded
- [x] WordPress: real post/page/sitemap counts recorded at ≤20 req/min with no block
- [ ] Protected-URL list requested (date recorded) — NOT MET: partner absent, message not sent
- [ ] Juan approval round-trip proven with his identity and version hash, **or** failure recorded and fallback options given to Leo — NOT MET: self-test passed, Juan's click pending
- [x] Seller briefs located and spot-checked; any failures listed
- [x] Handoff filled in, STATUS.md updated, first commit made

## Handoff

```text
PHASE: 0 — Setup & Access Audit
STATUS: PARTIAL (step 10: mechanism proven with a second identity, Juan's own click still needed before Phase 3; protected-URL list pending from the partner)
WHAT WAS BUILT:
  - Next.js + TypeScript + Tailwind + ESLint app, Vitest, git repo, secret-read deny rules.
  - Server-only Supabase health check (/api/health) and a bundle scan script.
  - Read-only audit scripts: scripts/wp-audit.ts, gsc-audit.ts, ga4-audit.ts, bundle-scan.ts.
  - A throwaway approval-test artifact (dummy content) with a self-test round-trip.
FILES / TABLES / ENDPOINTS CHANGED:
  - New: app scaffold (src/, config files), scripts/*.ts, vitest.config.ts, .gitignore, .env.example, .claude/settings.json, docs/.
  - Endpoint: GET /api/health. No tables created. No schema.
TESTS RUN + RESULTS:
  - npm run build OK; npm run lint clean; npm test 1/1; dev server HTTP 200; /api/health {"ok":true}.
  - Bundle scan: service key in 0 of 23 files. Deny-rule test read of secrets/ refused.
  - WP audit: 8 requests at <=20/min, no block. GSC 798 rows (webmasters.readonly). GA4 19 organic landing-page rows (analytics.readonly).
  - Approval round-trip: self-test passed (Leo's account); a second identity (Bryan Cadahing) also approved with the same hash, identities differ, hash recomputed and matches. Juan's own click not yet done.
DATA / PERMISSION / PRIVACY IMPACT:
  - Read-only against all THB systems; no WordPress writes; request rate within limit.
  - Secrets live only in .env.local and secrets/ (both git-ignored and deny-listed). Seller briefs were read in place and not copied into the repo.
  - Service account is siteRestrictedUser on GSC; scopes requested were read-only.
STAGING DEMO: n/a (no staging by decision). Demo = npm run dev, /api/health, and the approval-test artifact.
KNOWN LIMITATIONS:
  - Health check is an auth-admin call, not a literal select 1.
  - yoast_head_json is not exposed by the REST API.
  - GSC row counts are one 7-day window only; GA4 organic volume is low.
  - Approval timestamp comes from the viewer's browser clock.
  - The approval identity is an account; it only proves a person if Leo and Juan use separate accounts.
OPEN DECISIONS:
  - RESOLVED (Leo, 2026-10-10): identifying details in the seller briefs (the C-16 shared-first-name note, the C-17 sister's occupation, area + detail combinations, exact dates, dollar amounts) are fine for internal use only and must never appear in a blog draft. Carried into Phase 1's allowed-use rules.
  - CLOSED (2026-10-10): C-12 seller first name. Leo supplied `seller-library-fixed.md`; re-checked: the name is gone (one line changed, to a neutral "their house").
  - CLOSED (2026-10-10): C-37 six-figure value quote. Re-checked in `seller-library-fixed.md`: replaced with "that much". Those were the only two lines that differ from the original; still 21 briefs, index matches.
  - PENDING: protected-URL list. Not yet requested (partner absent as of 2026-10-10). Until it arrives every page's protection status is UNKNOWN: UPDATE shows a warning requiring acknowledgement (design §7).
  - OPEN: Yoast data is not in the REST API; Phase 1 must choose a source (rendered snapshot, or test a Yoast endpoint).
  - PENDING: Juan's own approval click (step 10); mechanism already proven with a second identity. Needed before Phase 3. If identity or read-back fails for him, stop and present fallbacks to Leo.
  - OPEN: accept Phase 0 as PARTIAL so Phase 1 can start, or wait for Juan and the partner.
NEXT APPROVED STEP: Juan opens the approval-test artifact (Contributor access, his own account) and clicks one button; Claude Code reads it back and records it. Leo sends the protected-URL request when the partner is back. Then Leo accepts or rejects PARTIAL. Do not start Phase 1 before that.
```

**Recorded facts for later phases:**
- GSC property identifier and type: `https://www.twinhomebuyer.com/`, URL-prefix (with www), permission siteRestrictedUser.
- GA4 property ID; available conversion/key events: ID is set in .env.local as GA4_PROPERTY_ID (value not copied here). Key event: generate_lead (192 in 90 days). Other events: contact, thb_lead_confirmed_ga4, click, video_*.
- Live post count / page count / sitemap URL count; mismatches: 122 posts / 230 pages (all published) / 346 sitemap URLs. 6 pages in the API but not the sitemap (reddit-thank-you, sell-your-oakland-home-as-is, sell-today, welcome, thank-you, forms); 0 the other way.
- `yoast_head_json` available (yes/no): NO (0 of 352; `yoast_head` also absent).
- Approval round-trip result (and fallback, if any): self-test PASSED with Leo's account (identity, decision, time, matching hash). Juan's click pending. No fallback needed yet.
- Seller briefs: location, count, format, failures: **use `seller-library-fixed.md`** (in the parent folder, `Leo Code/`; it replaces `seller-library.md`). 21 briefs, one Markdown file with an index table. The two failures (C-12 name, C-37 value quote) are fixed. Remaining internal-only details are covered by Leo's decision.
- Protected-URL list: requested on NOT YET SENT (partner absent, 2026-10-10); received on ___. Until received, all pages are protection-status UNKNOWN.
