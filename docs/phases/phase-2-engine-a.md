# Phase 2 — SEO Growth Intelligence (Engine A) MVP

## Goal
Turn Search Console data and the inventory into evidence-backed CREATE / UPDATE / MERGE / HOLD / REJECT recommendations that Leo can approve or hold. Add the Research and Content Architect agents so that approved opportunities become evidenced briefs.

## Read first
- Design `docs/superpowers/specs/2026-10-10-thb-search-studio-design.md` — §5 Architecture (Agent bridge, Ingestion → GSC/GA4), §7 Calls (template-rendered pages → Developer Change Request, protected-URL warning).
- Blueprint `THB_Search_Growth_and_Content_Intelligence_System_v2_0.md` — §4 Engine A + decision table + prioritization score, §5 Agents 1–3 + common response schema, §8 SEO Research & Cannibalization, §9 query fan-out paragraph only, §13 Phase 2, §14 rows 1–3 and 9–11.
- Phase 1 handoff in `phase-1-foundation.md`.

## Depends on
Phase 1 **DONE**. It must have produced:
- the schema, state machine and audit log;
- the inventory with protection and template flags;
- the Evidence Library and approved or pending brand facts.

## Tasks
Detailed 2026-10-10 from the Phase 1 handoff. Phase 1 is PARTIAL (accepted by Leo), not DONE; the open Phase 1 items that touch this phase are carried below as caveats, not worked around.

**Carried-in caveats (Phase 1 handoff):**
- Protection status is `unknown` on all 352 pages, so every UPDATE candidate shows the unknown-protection warning (explicit acknowledgement, not a block).
- Template flag is slug-inferred (124 city pages), unconfirmed. UPDATE on a flagged page produces a Developer Change Request recommendation, never an Elementor package.
- Rendered titles/meta exist for ~36 of 352 URLs. Page↔query matching uses the URL and the WP API title; do NOT resume the 503 crawl in this phase.
- Brand facts are pending and no voice reference exists. Agents 2–3 must treat brand facts as unapproved and mark any dependent claim as pending.
- Seller briefs: only publishable passages go into evidence packets (existing filter); `publication_cleared=false` for all 21, so first-party proof is "restricted", never "available".
- GSC property is `https://www.twinhomebuyer.com/` (URL-prefix), `siteRestrictedUser`, scope `webmasters.readonly`.

**Tasks** (each has a check; stop and tell Leo if a check fails):

1. **Migration 0007: Engine A tables.** Add `gsc_imports` (id, property, start_date, end_date, data_state, row_limit, rows_fetched, truncated, dimensions, fetched_at, caveats) and link `search_metrics.import_id`; add `opportunities` columns for `target_intent`, `scope`, `score jsonb`, `data_gaps jsonb`, `protected_warning`, `template_flag`; add `brief_status` fields as needed. RLS forced, no policies, as in Phase 1.
   - *Check:* `npm run db:check` shows every table has RLS and anon access is refused.
2. **GSC importer (read-only).** `src/lib/ingest/gsc.ts` + `scripts/import-gsc.mts`: page×query×date, scope `webmasters.readonly` only, paged to the row limit, exact start/end date stored, `data_state` recorded, truncation flagged, GSC's anonymized-query and sampling caveats written to `gsc_imports.caveats`. Idempotent per (property, date range).
   - *Check (unit, mocked API):* paging stops at the end, a truncated result sets `truncated=true`, re-running the same range does not duplicate rows. *Check (live):* one run over the last 90 days (GSC allows ~16 months); the row count and date range are printed and match the `gsc_imports` row; a script assertion confirms no write scope requested.
3. **Page↔query matching.** Normalize GSC page URLs (www, trailing slash, query strings, fragments) to the de-duplicated canonical in `pages`; unmatched URLs are kept and listed, not dropped.
   - *Check:* unit tests on URL normalization; live run reports matched vs unmatched page counts and lists the unmatched.
4. **Data-gap model.** For every candidate, record what is known vs unknown: query absent from export is "unknown / limited", never "no demand"; no SERP data, no lead data, no first-party proof are each shown as explicit gaps. The score treats unknown as "not scored", not zero.
   - *Check:* unit test (blueprint §14 row 11): a query not in the export yields `demand: unknown`, never "no demand".
5. **Overlap detection.** Group queries by normalized intent and detect page overlap by query overlap (two or more THB pages ranking for the same intent queries) plus intent comparison. Token similarity alone never produces a cannibalization warning; a warning needs substantive support (shared ranking queries with meaningful impressions, or a stated same-intent reason). Handle city-swap detection (same pattern, only the place name differs).
   - *Check (fixtures):* a city-swap candidate is flagged REJECT/HOLD; an overlapping-intent candidate points to the existing URL (UPDATE, not CREATE); a similarity-only pair raises no warning.
6. **Candidate packet builder** (blueprint §8): seller problem and intent, scope, existing THB pages with canonical URLs and overlapping queries, GSC metrics with exact date range and caveats, SERP section marked "not observed" (no SERP tool in scope), business relevance, first-party proof status (available / restricted / unavailable from the Phase 1 library), proposed action + alternatives + uncertainty, protection and template flags. Query fan-out ideas are stored as hypotheses.
   - *Check:* a packet validates against a zod schema; a candidate for a protected/unknown page carries the warning; fan-out items are all labeled `hypothesis`.
7. **Heuristic score.** Implement the blueprint §4 score (20/20/20/15/15/10), shown with per-part values and "not scored" where data is missing; the 80/60 reading bands; labelled as a THB heuristic. No code path reads the score to gate a decision or state change.
   - *Check:* unit test that changing the score does not change any allowed transition; grep test that the orchestrator does not import the scorer.
8. **Agent bridge.** `AgentRunner` interface + `ClaudeCodeManualRunner`; task packet builder (instructions separate from a delimited untrusted-data block); `npm run studio -- packet <id>` and `-- submit <id> <file>`; common response schema (blueprint §5) plus per-agent schemas; malformed output retries to the limit, then the subject goes to `INTEGRATION_ERROR` (via the existing jobs/dead-letter path); `agent_runs` records `prompt_version` and `model_version` as `claude-code/<model id>`. An agent output can never set an approval or a state; only the orchestrator moves state.
   - *Check (unit):* valid output accepted; malformed output retried, then `INTEGRATION_ERROR` (blueprint §14 row 12); an output claiming an approval or a state change is rejected; the injected untrusted text in a packet stays inside the delimited block.
9. **Subagent files + slash command.** `.claude/agents/thb-01-seo-strategist.md`, `thb-02-research-evidence.md` (only this one gets web fetch, for official sources), `thb-03-content-architect.md`, each with a versioned prompt and the blueprint contract and prohibition embedded verbatim; `.claude/commands/thb-run-agent.md`.
   - *Check:* a script test asserts each file exists, carries its prompt version, quotes its "Prohibited action", and that Agents 1 and 3 list no web tool.
10. **Opportunity queue UI.** `/opportunities` list (action, score parts, data gaps, protection / template badges) and a detail page with Approve / HOLD / REJECT and a required reason; every decision writes a `decisions` row and an audit event through the state machine; REJECT stores the rationale and blocks re-proposal without new evidence; unknown-protection UPDATE needs an explicit acknowledgement; template-flagged UPDATE routes to a Developer Change Request, not a brief.
    - *Check:* a live smoke script approves one and holds another, the audit rows appear, and a REJECTed candidate is not re-proposed on the next run.
11. **Run Agent 1 on real data.** Generate candidates from the live import, create the Agent 1 task packets, run them with `/thb-run-agent`, and submit through the CLI.
    - *Check:* at least one real CREATE-vs-UPDATE decision and one generic city-swap rejection or hold appear in the queue, with evidence links and stated uncertainty.
12. **Approved opportunity → brief via Agents 2–3.** After Leo's approval, queue Agent 2 (evidence packet from the Evidence Library, official sources, publishable seller passages only) then Agent 3 (structured brief); results go through schema validation. Brand-fact-dependent claims stay marked pending.
    - *Check:* one approved opportunity ends with an evidenced brief (every claim carries an evidence ID or is flagged unsupported; no invented facts); the brief is saved in `briefs` in `BRIEF_REVIEW`, never auto-approved.
13. **Regression fixtures.** Add the Phase 2-relevant blueprint §14 cases (rows 1–3, 9–11) as Vitest fixtures.
    - *Check:* all pass; the full Vitest suite, `npm run build` and lint pass.
14. **Verify and hand off.** A `scripts/phase2-verify.mts` summarizing each "Done when" item with real numbers; fill in the Handoff.
    - *Check:* the verify script output matches the handoff text.

**What I need from Leo before building:**
- **Go** on this task list.
- **Date range:** OK to import the last 90 days of GSC data (read-only, one-off API use, not the THB site)? Say if you want a different range.
- **Supabase and Google credentials** are already in `.env.local` from Phase 0; I will not read them into prompts. Please confirm nothing has changed (the service account is still `siteRestrictedUser` on the GSC property).
- **Manual runner:** Agent runs happen in Claude Code with `/thb-run-agent`. Tell me when you want to run them in this session or keep them for you to run.
- **Your approve / HOLD / REJECT decisions** on the real candidates for Tasks 10–12 (I can approve one for the demo only if you say so).
- **Juan (not blocking):** brand-facts approval, the Equity Track Inc question, the voice reference posts and the protected-URL list stay open; Agents 2–3 will mark dependent items pending.

## Out of scope
- Agents 4–7, section drafting, claim-ledger auditing (Phase 3).
- Publication Packages (Phase 4).
- GA4/lead attribution analysis beyond storing raw metrics (Phase 6).
- Automatic MERGE execution, redirects or any site change.
- A model API runner. Build the interface only; the Claude Code manual runner is used.

## Done when
- [x] GSC data imports with exact date ranges and labelled limitations
- [x] A generic city-swap candidate is rejected or held; an overlapping intent gets UPDATE, not CREATE
- [x] Data gaps are shown as unknown, not guessed (blueprint §14: "GSC query absent ≠ no demand")
- [x] Agent outputs pass schema validation; malformed output retries, then fails to `INTEGRATION_ERROR`
- [x] Leo can approve or hold a recommendation, and an approved one produces an evidenced brief through Agents 2–3 (met 2026-10-10 for "sell hoarder house": brief is in BRIEF_REVIEW awaiting Leo's review; see Handoff)
- [x] Protected/template pages are flagged on UPDATE candidates

## Handoff

```text
PHASE: 2 — SEO Growth Intelligence MVP
STATUS: PARTIAL (all 6 "Done when" boxes met; stays PARTIAL, accepted by Leo, until Leo reviews the hoarder brief and the other open items below)
WHAT WAS BUILT:
  - GSC importer (read-only, scope webmasters.readonly): page x query x date, paged, exact date range, data state, truncation flag and 5 labelled caveats in gsc_imports; idempotent per (property, range, state).
  - Page<->query matching (URL normalization to inventory canonicals; unmatched kept and listed).
  - Engine A: intent parsing (place stripped, no similarity scores), overlap detection (needs 2+ non-home pages ranking for the same queries inside the same intent and place), city-swap family detection (same intent across 3+ places), title/slug coverage check, candidate packets per blueprint §8 (zod schema), standing data gaps (SERP not observed, absent queries unknown, leads unknown, local info unknown, first-party proof restricted), fan-out only as hypotheses.
  - Heuristic score (blueprint §4 weights): only search opportunity is computed from GSC; other parts are "not scored" (not zero) or labelled agent estimates; shown with a disclaimer; a test proves no orchestrator code imports it.
  - Agent bridge: task packets (trusted instructions + random-delimited untrusted data block), CLI (npm run studio -- queue|packet|submit|runs), strict zod schemas (common §5 schema + per-agent result; unknown keys such as "approved" or "next_state" rejected), semantic checks (CREATE refused when a page covers/overlaps the intent; evidence ids must be in the packet; Agent 2 sources must be official; claims need sources whose locality matches; PASS refused with an unsupported high-risk claim), retry up to 3 attempts then FAILED + INTEGRATION_ERROR via the orchestrator; AgentRunner interface + ClaudeCodeManualRunner (no API runner).
  - Subagent files thb-01/02/03 (versioned 1.0.0, blueprint contract and prohibition quoted) and /thb-run-agent. Agent 2 is the only one with WebFetch; twinhomebuyer.com is denied in .claude/settings.json.
  - Editorial standards (Phase 3 input, added by Leo) wired in early: the Agent 3 brief schema now requires the 7-row Seller Situation Map, honest options (3+), real-world warnings and professional-confirmation notes; PENDING JUAN facts (experience years, "1,000+ homes", "East Oakland roots") are rejected anywhere except open_items/brand_facts_pending.
  - Opportunity queue UI (/opportunities, /opportunities/[id]): approve / HOLD (duplication or evidence) / REJECT with required reason, unknown-protection acknowledgement, audit rows and decisions rows; rejected intents are not re-proposed unless new evidence is recorded. The fold script (npm run fold) merges a duplicate candidate into an approved one on the same page.
FILES / TABLES / ENDPOINTS CHANGED:
  - supabase/migrations/0007_engine_a.sql (gsc_imports, rejected_intents, new columns on search_metrics, opportunities, agent_runs, briefs; RLS forced).
  - src/lib/ingest/gsc.ts; src/lib/engine/{intent,match,candidates,score,packet,decisions}.ts; src/lib/agents/{schemas,bridge,official-sources,runner,supabase-deps}.ts; src/app/opportunities/**; scripts/{import-gsc,build-candidates,studio,fold-opportunity,phase2-verify}.mts; .claude/agents/thb-0{1,2,3}-*.md, .claude/commands/thb-run-agent.md; .claude/settings.json (WebFetch deny for twinhomebuyer.com); package.json scripts; layout nav.
  - No new public endpoints.
TESTS RUN + RESULTS:
  - Vitest 14 files, 91 tests pass (adds gsc, match, engine fixtures for blueprint §14 rows 1, 2, 10, 11 and the CREATE-only-if-uncovered rule; bridge (row 12); Agent 2 rows 5 and 9; Agent 3 editorial rules and PENDING JUAN blocks; score-never-a-gate). Lint 0 errors (1 old warning). Next build OK.
  - db:check: 34 tables, none without RLS, anon refused.
  - Live: GSC import 2026-07-10..2026-10-07 (final), 31,790 rows, 194 pages (143 matched, 50 not in the inventory snapshot, mostly city pages), not truncated, 2 API requests. 252 candidates (overlap 15, improve 72, city_swap 117, gap 48); excluded 5 brand queries, 116 off-topic, 1,686 under 40 impressions.
  - Agent 1 on 15 real candidates: all accepted first time (UPDATE 11, HOLD 4). The agent changed all 3 engine CREATE proposals to HOLD (homepage/existing pages already rank) and moved 3 city-pattern HOLDs to UPDATE (a page for that city already exists).
  - Malformed-output injection (phase2-verify.mts): 3 bad submissions -> run FAILED -> fixture opportunity INTEGRATION_ERROR. The verify script creates and cancels a fixture each run, the script now removes its own fixture (one older cancelled fixture is kept as the injection-test record).
  - Agent 2: first output REJECTED by the validator (claims used a "claim" key); corrected and accepted on attempt 2 of 3.
DATA / PERMISSION / PRIVACY IMPACT:
  - Read-only against Google (GSC). No THB site requests this phase. No WordPress writes. No secrets in git or prompts. No seller material in any packet (the Agent 2 packet carries only counts/status; first-party proof "restricted"; no brief is publication-cleared).
  - GSC query/page data (31,790 rows) now lives in Supabase (private, RLS). Real search queries; no personal data seen, though Google anonymizes rare queries.
  - Agent 2 web fetches: about 6 official-site requests per attempt (leginfo, hcd.ca.gov, dre.ca.gov, sf.gov); none to competitors or twinhomebuyer.com.
STAGING DEMO: n/a (no staging by decision). Demo = npm run dev, then /opportunities (15 candidates: 1 approved, 3 held for duplication, 1 folded/cancelled, 10 pending), plus npm run candidates / studio / phase2-verify.
KNOWN LIMITATIONS:
  - HOARDER BRIEF (history): Agent 2 first returned REVISION (leginfo/hcd 403, then library texts covered only part). Leo uploaded Civil Code 1102 and 1102.6 and H&S 17920.3 and gave four wording rules; the third run PASSED with 7 supported library claims (each with passage ids and a verbatim quote checked against the stored text) and 3 open items; Agent 3 then produced the brief (PASS), now in BRIEF_REVIEW. Brief limits: no description of the disclosure form contents (the published 1102.6 text only points to the chaptered bill), no local rules, no as-is/no-cleanout claim (PENDING JUAN), link plan empty, live page body not available so untouched-vs-changed sections need a human check. Agent 3 first submit was rejected by my own allowed-ids bug (corrected, audited; output untouched).
  - The three subagents were not registered when Agent 1 ran (definitions load at session start), so Agent 1's 15 runs used general-purpose agents reading the same subagent file; Agent 2 then ran as the registered thb-02 subagent. "Official sources only" for Agent 2 is enforced by its prompt, the submit-time domain check and a deny rule for twinhomebuyer.com, not by a hard allowlist on what WebFetch can reach.
  - Protection status is unknown for all pages, so all 11 UPDATE recommendations carry the warning (acknowledged by Leo for the approved one and the three holds). Template flag is slug-inferred (1 UPDATE flagged city: Concord, routed to a Developer Change Request, not briefed).
  - 50 of the 194 GSC pages are not in the inventory snapshot (not re-crawled; the Phase 1 503 caveat still stands). Their protection/template status is unknown.
  - No SERP data and no lead join: demand and value are search-impression based only. The score is partial (search opportunity computed; the rest are agent estimates or not scored).
  - Agent 1 confidences were low or medium; recommendations are untested against pilot outcomes.
  - The Seller Situation Map and PENDING JUAN checks are validated by schema and tests, but no Agent 3 run has exercised them on real data.
OPEN DECISIONS:
  - Leo: how to support the legal claims for the hoarder brief. (a) Upload the official text (Civil Code 1102 et seq., H&S 17920.3, a Bay Area county or city hoarding/code-enforcement page) to the Evidence Library as tier 1-3 records with provenance, then re-run Agent 2 and Agent 3; (b) allow a brief with every legal point as an open item (no legal content); (c) pick a different approved candidate whose claims do not need statute text.
  - REDIRECT (Leo, 2026-10-10): /hoarder-houses/ is a confirmed money page (now marked protected, audited). The approved opportunity was redirected from UPDATE to CREATE of a SEPARATE informational guide (disclosure, what to do with a packed house, cleanout before selling; not the commercial "sell hoarder house" intent). The earlier UPDATE brief is kept in briefs.outline_history; Agent 3 produced the new CREATE brief (PASS) with sourced claims clm:1-7, all open items and PENDING JUAN items kept, link plan from the inventory (5 informational posts) plus the required link to /hoarder-houses/ as the next step. Now in BRIEF_REVIEW awaiting Leo. Agent 1 recommended UPDATE; the CREATE is Leo's human decision.
  - DECIDED (Leo, 2026-10-10): Phase 2 accepted as PARTIAL. Leo uploaded 2 official statute texts to the Evidence Library (Civil Code 1102, Health and Safety Code 17920.3) and asked for Agent 2 to be re-run Library-first, then Agent 3, with the brief shown to him before anything is marked done.
  - The other 10 candidates stay pending, as instructed.
  - Partner: protected-URL list (3 holds wait on it).
  - Phase 1 items still open: 503 crawl, voice reference, Juan's brand-facts approval, Equity Track Inc question.
NEXT APPROVED STEP: Leo chooses a path for the hoarder evidence and whether to accept PARTIAL; then re-run Agent 2 and Agent 3 on the approved opportunity. Phase 3 may start only after that and after approved brand facts and voice reference.
```
