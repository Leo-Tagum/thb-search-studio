# Phase 3 — Seven-Agent Content Studio

## Goal
Turn an approved brief into a section-by-section draft that Agents 4–7 write and independently audit against a claim ledger. Anything unsupported, non-cleared or altered after approval is blocked, and final sign-off comes from Juan through the proposal artifact.

## Read first
- Design `docs/superpowers/specs/2026-10-10-thb-search-studio-design.md` — §5 Architecture (Agent bridge, Owner approval via artifact), §7 Calls (seller library enforcement, brand facts + voice reference).
- Blueprint `THB_Search_Growth_and_Content_Intelligence_System_v2_0.md`:
  - §5 (all, especially Agents 4–7 and the section-level loop)
  - §6 claim risk classification, claim record fields and research integrity
  - §7 gates and revision controls
  - §9 AEO/GEO editorial standard
  - §11 Content Studio and UX essentials
  - §13 Phase 3
  - §14 rows 4–8 and 12–14
- Phase 2 handoff in `phase-2-engine-a.md`, and the Phase 0 handoff (approval round-trip result).

## Depends on
Phase 2 **DONE**. It must have produced:
- a working agent bridge with Agents 1–3;
- at least one approved brief;
- approved brand facts and voice reference (from Phase 1). Without them, Agent 7 and the fact checks block by design.

## Tasks
**To be detailed at the start of this phase**, using the Phase 2 handoff. The session's first job is to write numbered small tasks here, each with a check, and get Leo's OK before building.

Expected areas (outline only):
- Subagent files for Agents 4–7.
- Claim ledger with risk levels.
- The section loop: write → fact/privacy → SEO/AEO/GEO → editorial → targeted revision → re-review → lock.
- Two-attempt limit, then escalation to Leo.
- Section diffs, including live vs proposed text for UPDATE.
- Section locks and approval invalidation.
- `/thb-proposal` artifact plus approval sync with the hash check.
- Independent secondary approval for privacy exceptions.

## Out of scope
- Publication Package export and live QA (Phase 4).
- Pilots and the failure-injection suite (Phase 5), apart from the unit tests this phase needs.
- Any WordPress write.
- Using seller details beyond a brief's approved wording.

## Done when
- [ ] A draft is blocked when it contains each of: an unsupported law claim, an invented deal claim, a non-cleared seller identity, a stale rule, a verified detail altered by the editor
- [ ] A targeted fix passes re-review; a changed material claim always re-enters fact review
- [ ] No agent can approve itself or set an approval (tested)
- [ ] Juan's artifact approval is recorded with his identity and hash; an edit after approval invalidates it (tested)

## Handoff
_Fill in at the end of the phase._

```text
PHASE: 3 — Seven-Agent Content Studio
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
