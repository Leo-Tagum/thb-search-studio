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
**To be detailed at the start of this phase**, using the Phase 1 handoff. The session's first job is to write numbered small tasks here, each with a check, and get Leo's OK before building.

Expected areas (outline only):
- GSC page×query import with date range and caveats.
- Page↔query matching.
- Overlap detection (intent + query overlap, never similarity alone).
- Candidate packets following blueprint §8.
- The agent bridge: task packets, `/thb-run-agent`, a submit CLI, schema validation, and retry → `INTEGRATION_ERROR`.
- Subagent files for Agents 1–3.
- The opportunity queue UI with approve / HOLD / REJECT.
- The heuristic score, displayed but never acting as a gate.

## Out of scope
- Agents 4–7, section drafting, claim-ledger auditing (Phase 3).
- Publication Packages (Phase 4).
- GA4/lead attribution analysis beyond storing raw metrics (Phase 6).
- Automatic MERGE execution, redirects or any site change.
- A model API runner. Build the interface only; the Claude Code manual runner is used.

## Done when
- [ ] GSC data imports with exact date ranges and labelled limitations
- [ ] A generic city-swap candidate is rejected or held; an overlapping intent gets UPDATE, not CREATE
- [ ] Data gaps are shown as unknown, not guessed (blueprint §14: "GSC query absent ≠ no demand")
- [ ] Agent outputs pass schema validation; malformed output retries, then fails to `INTEGRATION_ERROR`
- [ ] Leo can approve or hold a recommendation, and an approved one produces an evidenced brief through Agents 2–3
- [ ] Protected/template pages are flagged on UPDATE candidates

## Handoff
_Fill in at the end of the phase._

```text
PHASE: 2 — SEO Growth Intelligence MVP
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
