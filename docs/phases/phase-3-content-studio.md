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
- **Editorial standards:** `docs/references/editorial-standards.md` (Lawrence's SOP converted to agent rules and reviewed with Leo rule by rule, 2026-10-10). Read it in full before detailing tasks.

## Input: editorial standards (Leo, 2026-10-10)
- **Agents 3–7 must follow `docs/references/editorial-standards.md`.** Each subagent prompt embeds the rules that apply to it (Agent 3: Seller Situation Map; Agent 4: voice and required content; Agents 5–7: block drafts that lack required elements). Rule tags: KEEP and ADAPTED are binding; HUMAN PROCESS items are not agent rules.
- **PENDING JUAN items stay blocked.** Brand facts follow editorial-standards section 7 (updated 2026-10-10 from the Brand Consistency Project artifact): approved facts may be used, sourced facts only in their exact wording (experience only as "25+ years of experience in Bay Area real estate" [approved by Juan in writing, 2026-10-10] and/or "Juan Diaz has been investing in Bay Area real estate since 2002"; never an exact count such as 27 years; the Lawrence SOP is a voice guide only), and every still-pending item (hours, closing time, ownership, contractor license, address vs service area, Equity Track, $32M+, 100% on time, East Oakland roots) stays blocked. PERMANENT RULE: never write a rating or review count in text (the rating badge is a live Google widget). The submit check enforces this.
- Add regression fixtures for the required elements and for the blocked PENDING JUAN facts (a draft using one is BLOCKED).
- The SOP's old page template is superseded by the new THB template; do not reuse it.

## Depends on
Phase 2 **DONE**. It must have produced:
- a working agent bridge with Agents 1–3;
- at least one approved brief;
- approved brand facts and voice reference (from Phase 1). Without them, Agent 7 and the fact checks block by design.

## Design note: approval sync (Leo, 2026-10-10)
Never trust the browser's hash or clock when syncing approvals from the artifact:
- **Recompute the hash server-side** from the stored version (the `article_versions` row the proposal points at). The hash the browser computed and wrote to the artifact record is only a claim to check, not evidence.
- **Reject any approval whose hash does not match** the recomputed hash of the current stored version. Log the rejection in `audit_events` (accepted = false) with both hashes; do not import it as an approval.
- **Use the server-recorded time** (when the sync read the record, or the record's server `updatedAt`), not the browser's `decidedAt`. Keep the browser value only as an untrusted note.
- Identity comes from the artifact platform's viewer id, resolved at sync time; never from a field the page's own code wrote freely.
- Why: the Phase 0 test showed the hash and timestamp are computed in the viewer's browser, so anyone with page access could write a record claiming any hash or time.
- Required test: a forged record (wrong hash, or a backdated `decidedAt`) is rejected or its time is ignored; an edit after approval invalidates it.

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
- [ ] Approval sync recomputes the hash server-side, rejects mismatches, and uses server-recorded time (tested with a forged record)

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
