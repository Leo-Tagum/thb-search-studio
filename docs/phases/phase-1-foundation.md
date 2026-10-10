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
**To be detailed at the start of this phase**, using the Phase 0 handoff. The session's first job is to write numbered small tasks here, each with a check, and get Leo's OK before building.

Expected areas (outline only):
- Schema and migrations for the blueprint §12 entities, plus `audit_events` and `jobs`.
- RLS, with roles held in settings.
- The orchestrator state machine, with tests.
- Evidence Library uploads to Supabase Storage.
- Brand Facts and a voice reference, sent to Juan as a proposal.
- Seller brief import with identity-pattern rejection.
- Inventory ingestion with protection and template flags.
- The Publication Package format fixed as the WordPress path.

## Out of scope
- Any agent, subagent file or slash command.
- GSC/GA4 import into the database (Phase 2).
- Opportunity scoring or decisions.
- Any WordPress write.
- Original seller records, which stay in THB systems.
- Polished UI. Basic list and detail screens are enough.

## Done when
- [ ] Schema and migrations are applied, and RLS is on for every table
- [ ] State machine allows only the blueprint §7 transitions (tests pass); every transition writes an audit event
- [ ] Inventory count comes from live data, with canonicals de-duplicated and protection status / template flag visible
- [ ] Evidence Library accepts uploads with provenance; brand facts and voice reference are approved by Juan, or recorded conflicts are pending his decision
- [ ] All 21 seller briefs are imported with permissions; the identity-pattern check rejects a test brief containing an address or price
- [ ] No public content altered

## Handoff
_Fill in at the end of the phase._

```text
PHASE: 1 — Foundation & Ingestion
STATUS: PASS | PARTIAL | BLOCKED
WHAT WAS BUILT:
FILES / TABLES / ENDPOINTS CHANGED:
TESTS RUN + RESULTS:
DATA / PERMISSION / PRIVACY IMPACT:
STAGING DEMO:
KNOWN LIMITATIONS:
OPEN DECISIONS:
NEXT APPROVED STEP:
```
