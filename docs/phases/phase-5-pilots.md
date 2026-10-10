# Phase 5 — Three-Case Pilot & Resilience Tests

## Goal
Run three real workflows end to end and the blueprint's failure injections, and keep the 20-case regression suite as a gate. A correct HOLD or block counts as a success.

## Read first
- Design `docs/superpowers/specs/2026-10-10-thb-search-studio-design.md` — §7 Calls (seller library enforcement; Pilot C rule), §9 Verification.
- Blueprint `THB_Search_Growth_and_Content_Intelligence_System_v2_0.md` — §13 Phase 5 (Pilots A/B/C, failure injections), §14 Regression Test Suite (all), §17 Mandatory stop conditions.
- Phase 4 handoff in `phase-4-package-handoff.md`.

## Depends on
Phase 4 **DONE**. The full pipeline must work from opportunity to package to live QA.

## Tasks
**To be detailed at the start of this phase**, using the Phase 4 handoff. The session's first job is to write numbered small tasks here, each with a check, and get Leo's OK before building.

Expected areas (outline only):
- **Pilot A:** the existing relocation page, testing UPDATE vs CREATE.
- **Pilot B:** inherited/probate × San Mateo County.
- **Pilot C:** one anonymized brief, used only if its permissions cover publication. Otherwise record a correct block.
- The full §14 fixture suite.
- Failure injections: bad citation, wrong jurisdiction, consent mismatch, conflicting experience count, neighborhood swap, timeout/retry, malformed output, hallucinated link, post-approval edit, accidental publish attempt.

## Out of scope
- New features. Only fixes found by pilots and tests.
- Publishing to meet the weekly target when a gate fails.
- Measurement dashboards (Phase 6).

## Done when
- [ ] Three pilot workflows documented, including correct holds or blocks
- [ ] All 20+ regression cases pass, with no critical failure
- [ ] Every failure injection produces the expected block, retry or denial, and is logged
- [ ] Leo and Juan agree the system is ready for controlled use, or the gaps are listed

## Handoff
_Fill in at the end of the phase._

```text
PHASE: 5 — Three-Case Pilot & Resilience Tests
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
