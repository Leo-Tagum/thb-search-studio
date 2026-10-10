# Phase 4 — Publication Package Handoff & Live QA

## Goal
Turn an approved version into a Publication Package that Leo can rebuild in Elementor by hand, with a Yoast checklist. Once Leo marks it published, run deterministic live checks on the URL. The app never writes to WordPress.

## Read first
- Design `docs/superpowers/specs/2026-10-10-thb-search-studio-design.md` — §4 (WordPress: Publication Package only), §5 Ingestion → Live QA bullet, §7 Calls (template-rendered pages → Developer Change Request), §9 no-write guarantee test.
- Blueprint `THB_Search_Growth_and_Content_Intelligence_System_v2_0.md` — §10 (Publication Package schema, pre-draft/post-publish checklist), §7 WordPress handoff + Public publishing gates, §13 Phase 4, §14 rows 15–19.
- Phase 3 handoff in `phase-3-content-studio.md`.

## Depends on
Phase 3 **DONE**. It must have produced at least one fully approved article version with a locked `publication_version_id` and Juan's recorded approval.

## Tasks
**To be detailed at the start of this phase**, using the Phase 3 handoff. The session's first job is to write numbered small tasks here, each with a check, and get Leo's OK before building.

Expected areas (outline only):
- Publication Package export: YAML plus copy-ready section content for Elementor.
- A Developer Change Request package for template-rendered pages.
- A Yoast metadata checklist.
- An approval-hash check before export.
- A "mark published" action recording the URL and a publish event.
- Live QA: HTTP status, canonical, robots, Yoast title/description match, JSON-LD parse, internal links. It reports "indexable", not "indexed".
- The no-write guarantee test.

## Out of scope
- Automated WordPress drafts or any write credentials, including staging and ddev, unless a separate approved plan exists.
- Redirects, slug or canonical changes, merges.
- Measurement windows and lead attribution (Phase 6).

## Done when
- [ ] An approved article exports as one usable package; exporting a changed (unapproved) version is refused
- [ ] Template-rendered page changes come out as a Developer Change Request, not an Elementor package
- [ ] Live QA runs on a real published URL and reports indexable vs indexed correctly
- [ ] The no-write test passes: no WordPress write endpoint or credential exists in the codebase
- [ ] Publishing remains a manual human action outside the app

## Handoff
_Fill in at the end of the phase._

```text
PHASE: 4 — Publication Package Handoff & Live QA
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
