# Phase 1 — Foundation & Ingestion

## Goal
Build the governed base everything else stands on: the database schema with access rules, the workflow state machine with its audit log, the Evidence Library, approved brand facts, the anonymized seller library, and a real, de-duplicated inventory of THB's live URLs.

## Read first
- Design `docs/superpowers/specs/2026-10-10-thb-search-studio-design.md` — §3 Decisions, §5 Architecture (Database, Orchestrator, Ingestion, Secrets), §7 Calls (protected-URL list, template-rendered pages, seller library enforcement, brand facts + voice reference).
- Blueprint `THB_Search_Growth_and_Content_Intelligence_System_v2_0.md` — §3 Core Operating Rules, §6 Governed Knowledge Base (all), §7 States + Revision controls, §12 Minimum data entities + Security, §13 Phase 1.
- Phase 0 handoff in `phase-0-setup.md` (recorded facts: counts, GSC/GA4 IDs, approval round-trip result, seller brief location).

## Depends on
Phase 0 **DONE**, or **PARTIAL** with Leo's OK. It must have produced:
- a working scaffold, a Supabase connection and secret protection;
- real WordPress post, page and sitemap counts;
- a proven approval round-trip, or a chosen fallback;
- the seller briefs located and spot-checked.

## Rules carried in from Phase 0
**Internal-only vs publishable (Leo, 2026-10-10).** The 21 seller briefs may keep identifying details for internal use: exact dates, dollar amounts, neighbourhood/city plus specifics, and family or occupation details (for example the C-16 and C-17 notes). These must **never appear in a blog draft**. Build this as an allowed-use rule, not as rejection at import:
- Import keeps these details, but tags each brief or passage as internal-only and "not for publication".
- Draft output, evidence packets passed to writers, and the claim ledger must not carry internal-only details; a draft that includes one is blocked (`BLOCKED_PRIVACY`), not just warned about.
- Reconcile with the design's "no fields for name, street address or exact price" (§7): decide at task-detailing whether amounts live in a separate internal-only field or are stripped from the stored text, and get Leo's OK.
- The identity-pattern check still rejects personal names, street addresses and exact sale prices (the "Done when" test brief). The briefs to import are in `seller-library-fixed.md` (parent folder; it replaces `seller-library.md`). The C-12 first name and the C-37 value quote are already fixed there.
- Per-brief use levels and "Don't write about" notes still apply, and Juan's open review flags (C-01, C-02, C-04, C-05, C-12, C-17, C-23, C-41) stay unresolved until he clears them.

**Protection status (Leo, 2026-10-10).** The protected-URL list has not been requested yet (partner absent). Until it is imported, every page's protection status is `unknown`: an UPDATE on any page shows the warning that needs explicit acknowledgement (design §7). Leo can mark a page manually with an audited reason. Inventory ingestion must default to `unknown`, never to "not protected".

## Tasks
Detailed 2026-10-10 from the Phase 0 handoff. Awaiting Leo's "go" before building.

**Decisions proposed (Leo to confirm with "go"):**
- D1. Seller amounts and exact dates: stored in a separate `internal_only_notes` field on each brief (never in the publishable `approved_wording` field). Importer splits them; writers' evidence packets read only publishable fields. Alternative: strip them.
- D2. Yoast: take title/description from the rendered page of each URL is too many requests for 352 URLs at 20/min (~18 min, still fine). Proposal: fetch rendered `<title>`/meta description for all URLs in one throttled run (≈18 min), not Yoast REST.
- D3. Protection status defaults to `unknown` for every page.
- D4. Template flag: `city` pages flagged by slug/parent pattern, confirmed against a sample; otherwise `unknown`.

**Tasks (each has a check):**
1. Schema: write SQL migrations in `supabase/migrations/` for the blueprint §12 entities plus `audit_events` and `jobs`. No columns for seller name, street address or exact price (amounts only in `internal_only_notes`). Check: migration files lint; applied to Supabase; every table listed.
2. RLS: enable RLS on every table; roles held in a `roles`/settings table; deny-by-default for anon. Check: script lists tables with `rowsecurity = false` and gets none; an anon-key query is refused.
3. State machine: pure TS module with the blueprint §7 states and allowed transitions, revision limit, and approval-invalidation on edit. Check: Vitest passes allowed transitions, rejects every other pair, and an agent actor cannot set an approval.
4. Audit log: every transition writes `audit_events` (actor, prior state, version hash). Check: test shows one event per transition, including rejected-transition attempts logged.
5. Jobs table helper: idempotency key, retries, dead-letter to `INTEGRATION_ERROR`. Check: Vitest on duplicate key and retry limit.
6. Evidence Library: upload to a private Supabase Storage bucket with provenance (source, tier, jurisdiction, dates, uploader). Basic list/detail screens. Check: upload a dummy file, see it listed with provenance; bucket not publicly readable.
7. Seller import: parse `seller-library-fixed.md` (read in place, original not copied into git; fixtures use fake text). Tag internal-only passages; store use level, permission, "Don't write about", identity-risk notes. Check: 21 rows; Juan's flagged briefs (C-01, C-02, C-04, C-05, C-12, C-17, C-23, C-41) marked `pending_review`.
8. Identity-pattern check: rejects names, street addresses, exact sale prices in publishable fields. Check: Vitest with a fake test brief containing an address and a price is rejected; a clean fake brief passes.
9. Privacy gate: function that blocks a draft/evidence packet containing internal-only details with `BLOCKED_PRIVACY`. Check: Vitest with a fake draft carrying an internal-only detail is blocked.
10. Inventory ingestion: WP REST posts/pages + sitemap at ≤20 req/min; de-duplicate by canonical; `protection_status = unknown`; template flag; Yoast per D2. Check: counts reconcile with Phase 0 (122 posts / 230 pages / 346 sitemap URLs); rate-limit test with mocked clock; screen shows protection and template flags.
11. Manual protection marking with audited reason. Check: marking a page writes an `audit_events` row; unmarked UPDATE shows the unknown-status warning.
12. Brand Facts and voice reference: draft from existing site content, record conflicts, and prepare a proposal artifact for Juan. Check: facts table populated with source for each; conflicts listed; artifact created (private). Juan's approval may remain pending.
13. Publication Package format: fix as the WordPress path in a doc plus a zod schema (no WP credentials anywhere). Check: schema test; a code-search test finds no WordPress write endpoint or credential.
14. Final checks: `npm run build`, lint, tests, bundle scan, confirm no public content altered. Fill handoff; update STATUS.md; commit.

**What I need from Leo:**
- "go" and answers to D1–D4 (or accept the proposals).
- Supabase: confirm the project in `.env.local` is the one to use, and that I may apply migrations to it (needs DB connection string or the Supabase CLI login; I'll check what is in `.env.local` without printing it).
- Juan's availability for the brand facts proposal and the 8 flagged briefs (can stay pending).
- Protected-URL list still pending (partner), so statuses stay `unknown`.

## Out of scope
- Any agent, subagent file or slash command.
- GSC/GA4 import into the database (Phase 2).
- Opportunity scoring or decisions.
- Any WordPress write.
- Original seller records, which stay in THB systems.
- Polished UI. Basic list and detail screens are enough.

## Done when
- [x] Schema and migrations are applied, and RLS is on for every table
- [x] State machine allows only the blueprint §7 transitions (tests pass); every transition writes an audit event
- [x] Inventory count comes from live data, with canonicals de-duplicated and protection status / template flag visible
- [ ] Evidence Library accepts uploads with provenance; brand facts and voice reference are approved by Juan, or recorded conflicts are pending his decision
- [x] All 21 seller briefs are imported with permissions; the identity-pattern check rejects a test brief containing an address or price
- [x] No public content altered

## Handoff

```text
PHASE: 1 — Foundation & Ingestion
STATUS: PARTIAL (all "Done when" boxes met; open items below need Leo's decision)
WHAT WAS BUILT:
  - Supabase schema (32 tables: blueprint §12 entities + audit_events + jobs + seller/brand tables), 6 migrations, RLS forced on every table with no policies (anon/authenticated have no grants; only the server-side service role can read/write). Private "evidence" storage bucket.
  - Orchestrator: pure TS state machine (blueprint §7 states/transitions), audit log (append-only, DB trigger blocks update/delete; refused attempts are logged too), human-only gates, approval-hash check, edit-after-sign-off invalidation, two-revision limit with escalation, jobs helper (idempotency, retries, dead-letter -> INTEGRATION_ERROR).
  - Seller library: importer for seller-library-fixed.md (read in place, never copied into the repo), per-passage classification (publishable vs internal_only/not-for-publication), identity-pattern check, privacy gate returning BLOCKED_PRIVACY, evidence-packet filter that passes publishable passages only.
  - Inventory ingestion (REST + sitemap, single rate limiter <=20/min), canonical de-duplication, protection default 'unknown', city-template flag inferred from slug, manual protection marking with audited reason, UPDATE warning for unknown status.
  - Brand Facts proposal (docs/phases/brand-facts-proposal.md + brand_facts rows): 5 proposed, 1 conflict, 7 needed. Voice reference not yet drafted.
  - Publication Package zod schema + Developer Change Request schema + no-WordPress-write guard test.
  - Basic screens: /inventory, /evidence (upload with provenance), /sellers, /brand.
FILES / TABLES / ENDPOINTS CHANGED:
  - supabase/migrations/0001-0006; scripts/migrate, db-check, state-smoke, import-sellers, ingest-inventory, flag-templates, seed-brand-facts, evidence-check, phase1-verify (.mts); src/lib/{orchestrator,seller,ingest,package}/, src/lib/protection.ts; src/app/{inventory,evidence,sellers,brand}/ and actions.ts; docs/publication-package.md.
  - New npm deps: pg, zod, tsx (dev), @types/pg (dev). No new public endpoints.
TESTS RUN + RESULTS:
  - Vitest: 8 files, 44 tests pass (state machine, audit, jobs, identity check, privacy gate, classifier, rate limiter with mocked clock, inventory merge, template flag, protection, package schema, no-write guard).
  - db:check: 32 tables, none without RLS; anon read and write refused. state-smoke: live DB transition + refused transition both audited; audit update refused. evidence-check: dummy upload listed with provenance; bucket private; public URL 400.
  - phase1-verify: 21 briefs; 105 publishable passages, 0 fail the identity check; 207 internal-only, all marked not-for-publication; 352 pages, all protection unknown.
  - npm run build OK; lint 0 errors (1 old warning in bundle-scan.ts); bundle scan: service key not in client bundle.
DATA / PERMISSION / PRIVACY IMPACT:
  - Read-only against THB systems. About 25 requests to the live site in total (8 per list run x3, plus 25+ rendered pages), all through the limiter. No WordPress writes, no WordPress credentials.
  - Seller briefs: 21 imported into Supabase (internal-only passages stored but tagged; no names or street addresses found; amounts 6, exact dates 126, seller quotes 96 passages, kinship+occupation 2, shared-name 1 tagged internal-only). Permission: publication_cleared=false for all 21; Juan's 8 flagged briefs are pending_review.
  - The seller text now lives in Supabase (private, RLS). It is not in git.
STAGING DEMO: n/a (no staging by decision). Demo = npm run dev, then /inventory, /sellers, /evidence, /brand.
KNOWN LIMITATIONS:
  - STOP EVENT: the rendered-title crawl hit HTTP 503 on one URL after ~25 pages (rate was within 20/min) and stopped itself. Not retried. Rendered titles/meta exist for only ~36 of 352 URLs; the rest show the WordPress API title. Cause unknown (transient or throttle).
  - Template flag is inferred from slug only: 124 pages flagged city (design expected about 107); unconfirmed, may over-flag.
  - Identity/privacy checks are pattern heuristics (names are the weakest); Leo and Juan still review. Passages with quotes or dates are treated as internal-only, so the publishable set is small (105 of 312).
  - No login: the local app uses the service role and records the actor as "leo". Fine on localhost; needs auth before any sharing.
  - Subject state lives on opportunities/articles; the Supabase repo is smoke-tested only on articles.
  - Brand facts: voice reference not drafted (needs Leo's 3-5 post picks); proposal is a markdown file, not an approval artifact, because Juan's round-trip is still unproven.
OPEN DECISIONS (Leo, 2026-10-10: Phase 1 accepted as PARTIAL):
  - BLOCKER (503): rendered-title/meta crawl hit HTTP 503 and must NOT be resumed now. Resume later only at <=5 req/min and off-hours, OR replace with a Yoast export from Gian. Until then rendered titles exist for ~36 of 352 URLs.
  - DECIDED: city template flags stay "inferred" (slug-based, unconfirmed).
  - DECIDED: voice reference waits for Leo to send 3-5 posts later.
  - DECIDED: brand facts stay pending until Juan's approval click is proven.
  - QUESTION FOR JUAN: "Equity Track Inc vs Twin Home Buyer": what is the relationship, and may content mention Equity Track Inc?
  (Earlier open items, still open:)
  - Leo: OK to retry the rendered-title crawl (it resumes where it stopped, about 16 minutes), now or later, or skip it? Also whether to check if WP Engine/Wordfence throttled us.
  - Leo: pick 3-5 posts for the voice reference.
  - Juan: approve/correct the brand facts proposal; Equity Track Inc conflict; supply needed facts; clear his 8 flagged briefs.
  - Partner: protected-URL list (all pages stay unknown until imported).
  - Leo: accept Phase 1 as PARTIAL? (Yoast source choice from Phase 0 was resolved as rendered-page fetch, D2, but is incomplete.)
NEXT APPROVED STEP: Leo decides the open items above and whether to accept PARTIAL; then Phase 2 (GSC import, page-query matching, opportunities) may start.
```
