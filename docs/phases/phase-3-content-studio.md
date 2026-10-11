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

## Input: setup decisions (Leo, 2026-10-10)
1. **Voice reference (missing from Phase 1): build it in this phase.** Sources, all already stored from the Phase 2b fetch (`page_snapshots`, no new site requests): `/selling-an-older-home-in-san-francisco-repairs-options/`, `/from-the-desk-of-juan-diaz/`, `/sell-bay-area-house-full-of-belongings/`.
   - Style only. These pages contain facts that are now blocked or pending (for example closing times, "$32M+ saved fees", "operated since 2002", "founder"). The voice reference holds short excerpts plus notes on what to imitate; a check rejects any excerpt that carries a blocked fact. None of their facts count.
   - It is stored as the `voice_reference` brand fact with status `proposed`. It is not usable by Agent 7 until Juan approves it through the Approval Room.
2. **Scope: we produce the blog BODY only.** The header, footer, navigation and review widget come from the site template. The body follows the existing `thb-article` HTML pattern (reference: the stored older-home post), in this order: **answer capsule → question H2s → FAQ → About Juan author box → Related Guides → Sources and References → CTA box.**
   - The `<style>` block is a fixed constant copied from the live pattern, not agent-written. Agents write only structured content; the renderer produces the markup from a whitelist of the pattern's existing classes.
   - The author box is built from approved brand facts only (no "founder", no title: ownership is still PENDING JUAN). Sources and References are generated from the claim ledger's evidence records, not typed by an agent. The CTA box comes from the brief.
3. **Approvals: ONE permanent artifact, "THB Approval Room".** It is republished to the same URL for every proposal, so sharing (Anyone in org, Contributor) is set once. Decisions are keyed by proposal id plus version hash. All the approval-sync rules in the design note below apply, and matter more here because every org member with Contributor access can write to the artifact's records.
4. **First article:** the approved hoarder guide brief ("Packed or Hoarded House in California: What to Disclose and Whether to Clean Out First", opportunity `1d78c9e3`, brief `e1c20794`).

## Depends on
Phase 2 **DONE**. It must have produced:
- a working agent bridge with Agents 1–3;
- at least one approved brief (the hoarder brief is in `BRIEF_REVIEW`; its approval to `BRIEF_APPROVED` is Task 1);
- approved brand facts (in place from Phase 1/2). The voice reference was **not** produced in Phase 1; it is built in Task 3 and needs Juan's approval before Agent 7 can run on it. Without it, Agent 7 and the fact checks block by design.

## Design note: approval sync (Leo, 2026-10-10)
Never trust the browser's hash or clock when syncing approvals from the artifact:
- **Recompute the hash server-side** from the stored version (the `article_versions` row the proposal points at). The hash the browser computed and wrote to the artifact record is only a claim to check, not evidence.
- **Reject any approval whose hash does not match** the recomputed hash of the current stored version. Log the rejection in `audit_events` (accepted = false) with both hashes; do not import it as an approval.
- **Use the server-recorded time** (when the sync read the record, or the record's server `updatedAt`), not the browser's `decidedAt`. Keep the browser value only as an untrusted note.
- Identity comes from the artifact platform's viewer id, resolved at sync time; never from a field the page's own code wrote freely.
- Why: the Phase 0 test showed the hash and timestamp are computed in the viewer's browser, so anyone with page access could write a record claiming any hash or time.
- Required test: a forged record (wrong hash, or a backdated `decidedAt`) is rejected or its time is ignored; an edit after approval invalidates it.

## Tasks
Detailed 2026-10-10 from the Phase 2 handoff. **Status: awaiting Leo's OK. Nothing below is built yet.** Each task has a check; stop and tell Leo if a check fails.

**Carried-in facts (Phase 2 handoff and today's reading):**
- The hoarder brief is in `BRIEF_REVIEW`. Its 8 outline sections cover the Seller Situation Map, 3+ options, a real-world warning and professional confirmation; claims `clm:1`–`clm:7` are statute points only (H&S 17920.3, Civ. Code 1102 and 1102.6, from the Evidence Library).
- The brief says the page may not claim a no-cleanout or as-is purchase (PENDING JUAN) and states no costs, timeframes or local rules.
- Juan's own approval click is still unproven (Phase 0). Mechanism proven with a second identity only.
- Brand facts: `author_bio` and `voice_reference` are "needed"; `owner_name_and_title` is only "proposed".

**Tasks:**

*A. Setup and data*
1. **Brief approval (human gate).** Add an Approve button for a brief in `BRIEF_REVIEW` on the opportunity page, writing a `decisions` row and an audit event via the orchestrator (human-only target). Leo clicks it for the hoarder brief; I do not approve it for him. Then the orchestrator creates the `articles` row.
   - *Check:* unit test that an agent cannot reach `BRIEF_APPROVED`; live: state is `BRIEF_APPROVED`, actor `leo`, article exists.
2. **Migration 0012: Content Studio tables.** `article_sections` gets `section_key`, `status`, `version`, `locked`; new `section_versions` (text, content hash, diff base, reason, author), `section_reviews` (agent, attempt, decision, findings), `escalations`, `approval_sync_log` (accepted, both hashes, browser time as untrusted note, server time, viewer id); `claims` extended for the ledger fields in blueprint §6 plus `section_key`, `text_hash`, `locked_text`; `approvals` gets `proposal_id`. RLS forced, no policies.
   - *Check:* `npm run db:check` shows every table with RLS and anon refused.
3. **Voice reference builder.** `scripts/build-voice-reference.mts` reads the three stored bodies (no site requests), extracts 3–5 short style excerpts per source plus imitate / do-not-imitate notes, and runs a blocked-fact check on every excerpt (hours, closing times such as "7 days", "$32M", company-since-2002, "founder", ratings, exact experience counts, Equity Track). Stored as `voice_reference` = `proposed` with source URLs.
   - *Check (unit):* an excerpt containing each blocked fact is rejected; live: Leo reads the excerpts. I will report that the three sources differ in voice (older-home is first person "I", Juan's page is "we", belongings is soft "you may be able to"), so Leo picks what counts as Juan.

*B. Body format*
4. **Body renderer.** `src/lib/studio/template.ts`: structured article → `thb-article` HTML in the fixed order above, using only whitelisted classes (`thb-callout`, `thb-table-wrap`, `thb-note`, `thb-author`, `thb-sources`, `thb-cta-box`, and so on). The style block is a constant extracted verbatim from the stored older-home post and hashed.
   - *Check:* fixture renders in the right order; script, style, inline style, iframe, header/footer/nav or widget markup is rejected; the style-block hash is asserted; output is HTML-escaped.
5. **Article schema and composed blocks.** zod schema: capsule (40–60 words, in the first section), sections with question H2s, FAQ (short answers), related links (inventory-only URLs from the brief's link plan). The **author box, Sources and References and CTA box are composed by code**, not written by agents: author box from approved fact keys only, sources from the ledger's `evidence_sources`, CTA from the brief.
   - *Check:* an agent that writes its own author box, a "founder" title, a source not in the ledger, or a link outside the inventory is rejected.

*C. Claim ledger and checks*
6. **Claim ledger.** `claims` seeded from the brief (`clm:1`–`clm:7`, risk-classified per blueprint §6); the writer must declare every new factual claim with a risk level and evidence id or mark it unsupported. A deterministic detector flags undeclared statute cites, numbers, dates, prices and THB-history statements ("we have", "THB has", "in my years").
   - *Check (unit):* an undeclared legal claim is flagged; a high/critical claim without evidence blocks; locked claim text has a stored hash.
7. **Deterministic pre-checks on every submit** (before and after agent review; agents never replace them): the Phase 2 brand-fact and rating rules (including PENDING JUAN facts), seller-identity gate (privacy-gate module; `publication_cleared=false` means no case story), required elements (honest options: keep, list, fix, professional help, sell directly; a real-world warning; professional confirmation; seller-problem opening), stale rule (source past `recheck_by` or a different jurisdiction), and altered verified detail (locked claim text changed).
   - *Check:* regression fixtures, one per blocked case below.

*D. Agents 4–7*
8. **Subagent files and schemas.** `.claude/agents/thb-04-section-writer.md`, `thb-05-fact-privacy-auditor.md`, `thb-06-seo-aeo-geo-auditor.md`, `thb-07-editorial-critic.md`, versioned 1.0.0, each embedding the blueprint contract and its **Prohibited action** verbatim and the editorial-standards rules that apply to it (Agent 4: voice and required content; 5: sensitive-topic escalation and block-if-missing; 6: section 6 SEO rules; 7: copy-paste test, rewrite table, authenticity checklist, advisory 85 score). No web tools for any of them (Read, Write only). Agents 5–7 get the draft, ledger and facts but not the writer's reasoning, so the review is independent.
   - *Check:* script test as Phase 2 task 9: each file exists, carries its version, quotes its Prohibited action, lists no web tool.
9. **Bridge extension.** Agent keys 4–7, task packets with input version ids and the draft in the delimited untrusted block, submit checks: no output can set an approval, a lock or a state; Agent 5 PASS is refused with an unsupported high/critical claim; Agent 7 output that changes a locked claim span is rejected (goes back to Agent 5); the 85-score is stored as advisory only.
   - *Check (unit):* each rule, plus malformed output retries then `INTEGRATION_ERROR` as in Phase 2.

*E. The section loop*
10. **Loop engine in the orchestrator.** Per section: write v1 → fact/privacy → SEO/AEO/GEO → editorial → targeted revision → re-review of the affected claims → lock. **Two attempts per issue**, then an `escalations` row and `REVISION_REQUIRED` for Leo. A changed material claim always re-enters fact review, even when it came from an editorial suggestion. Article-level states advance only when every section has passed that stage.
    - *Check (unit):* a targeted fix passes re-review; an editor change to a claim re-enters Agent 5; a third failed attempt escalates instead of looping; no agent can lock a section or move state.
11. **Diffs and locks.** Before/after section diffs with the reason and affected evidence ids; locked sections reject edits unless a new version is made, which clears the lock and any approval. **UPDATE support:** live text (from `page_snapshots`) vs proposed text, untouched sections preserved byte for byte. Not used for the first article (it is a CREATE), but built and tested on a fixture because Phase 3's Done-when covers UPDATE.
    - *Check (unit):* edit after lock invalidates; UPDATE diff on a fixture shows untouched sections identical and refuses a rewrite of them.

*F. Studio UI*
12. **Content Studio UI** (`/studio/[articleId]`): tabs for Brief, Draft, Evidence, Agent Critiques, SEO/AEO/GEO, Diff, Approvals, and Preview (the rendered body with the fixed style block; no WordPress). Per-section status, blockers shown with the exact claim and why, no hidden reasoning, escalations with Leo's actions (request focused revision, hold, reject).
    - *Check:* a smoke script drives an article through the loop on fixtures and the page shows each status.

*G. Approval Room and sync*
13. **THB Approval Room artifact.** One artifact, one URL, republished for every proposal with the proposal (evidence summary, blockers, the diff, exact version hash). Leo sets sharing once (Anyone in org, Contributor). Decisions are written to the artifact's database keyed by proposal id plus hash. `/thb-proposal <article_id>` builds the data and republishes to the same URL.
    - *Check (before building the rest):* the records of proposal A survive a republish for proposal B; viewer identity is present; a viewer cannot overwrite another viewer's record. If any of these fails, I stop and bring fallbacks to you.
14. **Approval sync** (`npm run studio -- sync-approvals`, via `ArtifactData`), following the design note: hash recomputed server-side from the stored `article_versions` row; a mismatch is rejected and logged in `approval_sync_log` and `audit_events` (accepted=false, both hashes); time is the server read time, never the browser's `decidedAt` (kept as an untrusted note); identity is the platform viewer id, mapped to roles in settings. Only a configured approver counts for final sign-off (Leo's click is a review, not Juan's approval); a record for a superseded version or another proposal is rejected; sync is idempotent. Privacy exceptions need an independent secondary approver who is not the requester or the first approver.
    - *Check (unit and live):* forged record (wrong hash) rejected; backdated `decidedAt` ignored; non-approver identity not counted; an edit after approval sets `invalidated_at`; secondary approver cannot be the requester.

*H. Tests, first article, handoff*
15. **Regression fixtures.** Blueprint §14 rows 4–8 and 12–14 (unsupported legal claim, wrong jurisdiction, conflicting bio claims, privacy, internal-only seller records, editor changes a fact, post-approval edit) plus: each editorial required element missing (blocked), each PENDING JUAN fact (blocked), rating/review count (blocked), "founder", no-self-approval (grep and unit test that no agent code path writes `approvals`).
    - *Check:* the full Vitest suite, lint and `npm run build` pass.
16. **Run the hoarder guide.** Operator runs Agents 4–7 with `/thb-run-agent` section by section; the article ends in `HUMAN_REVIEW` with a proposal in the Approval Room.
    - *Check:* every claim in the ledger has evidence or is flagged; no blocked fact present; every section locked or escalated; audit rows for each step.
17. **Juan's click and verify.** Juan opens the Approval Room (Contributor, his own account) and approves; sync records his identity and the matching hash. `scripts/phase3-verify.mts` summarizes each Done-when item with real numbers; fill in the Handoff; update `STATUS.md`.
    - *Check:* verify output matches the handoff text. If Juan has not clicked, the handoff is PARTIAL and says so.

**Leo's go and answers (2026-10-10): task list approved.**
- **Voice:** the older-home post is the primary voice (first person, direct, honest about options). Juan's page is used only for "we/company" sections; the belongings post only for warmth, never its claims.
- **Fixed `<style>` block:** OK.
- **Voice reference:** Leo approves it **provisionally** so drafting is not blocked (`provisional_by`/`provisional_at`, status stays `proposed`). Juan confirms it together with the first article in the Approval Room (one review, two items). If Juan rejects it, the article goes back to Agent 7.
- **Approvers (Task 14):** the whole THB org can view, comment and give feedback in the Approval Room, but only confirmed approvers count. Approvers are registered **by first click**: the sync shows the display name and account id, and Leo confirms "this is Juan" (approver) or "this is Cherry" (secondary). Never Leo as secondary. Anyone else's click is stored as feedback, not approval.
- **Sharing:** Leo sets the Approval Room sharing (Anyone in org, Contributor) once after the first publish.

**(Original list of what I needed from Leo, all answered above:)**
- **Go** on this task list (or changes).
- **Task 1:** you click Approve on the hoarder brief once the button exists.
- **Task 3:** which of the three sources best sounds like Juan; Juan approves the voice reference through the Approval Room (Agent 7 is blocked without it).
- **Task 4:** OK that the `<style>` block is a fixed constant copied from the live pattern (so the body is self-contained like the existing posts).
- **Task 13:** you set the Approval Room's sharing once after the first publish.
- **Task 14:** which account(s) count as an approver (Juan) and as the independent secondary (not Leo); roles go in settings.
- **Juan (not blocking the build):** his own approval click; the pending brand facts stay blocked.

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
```text
PHASE: 3 — Seven-Agent Content Studio
STATUS: PARTIAL (accepted by Leo, 2026-10-10). Built and verified; the hoarder guide is drafted and every unit locked, paused at HUMAN_REVIEW as version 4db42fea93cc. Open: Leo's review, Juan's approval, approver registration.
REAL RUN (hoarder guide, 2026-10-10): Leo approved the brief, provisionally approved the voice reference and shared the Approval Room. Agents 4-7 ran section by section (8 sections + FAQ): 36 reviews (Agent 5: 9 PASS / 4 REVISION; Agent 6: 10 PASS / 2 REVISION; Agent 7: 10 PASS / 1 REVISION), no escalations. Four sections (s1, s4, s6, s7) were BLOCKED_PRIVACY by the seller-quote gate (quoted hypothetical homeowner thoughts); Leo kept the gate and sent them back with "no quotation marks", now a standing writer rule. Final advisory editorial scores 78-84 (all under 85, advisory only). 50 optional findings are deliberately NOT applied: they are the baseline for the Phase 3c comparison test (docs/references/agent-restructure.md). No proposal has been created and nothing has been sent to the Approval Room yet.
WHAT WAS BUILT:
  - Migrations 0012-0014: section versions/reviews/escalations, claim-ledger columns, approver registry, approval sync log, proposals, article keyword, voice-reference provisional fields. RLS forced.
  - Body renderer (thb-article pattern, fixed order, style block hash-pinned, HTML allowlist; author box, Related Guides, Sources and CTA composed by code from approved facts and the ledger).
  - Deterministic checks on every unit: ledger citations, figure coverage (statutes, money, percentages, durations, years, counts), stale source, wrong jurisdiction, brand facts / PENDING JUAN / rating rule, seller identity and seller stories, history claims, required editorial elements (opening, options, real-world warning, professional confirmation, 40-60 word capsule, keyword).
  - Agents 4-7: versioned subagent files (Read/Write only), strict schemas and semantic checks (Agent 5 cannot pass what the deterministic check blocks; Agent 7 needs a usable voice reference and cannot lock a changed fact; the writer cannot add claims).
  - Section loop: write -> fact/privacy -> SEO/AEO/GEO -> editorial -> targeted revision -> re-review -> lock; two attempts per issue then escalation; material change re-enters fact review; lock only through the editorial PASS on fact-passed material; human reopen / request revision.
  - Voice reference from the three stored posts (18 verbatim style excerpts), stored `proposed`; provisional approval is Leo's button on /studio.
  - Content Studio UI (/studio, /studio/[id] tabs, /studio/approvers); Approve-brief button on the opportunity page.
  - THB Approval Room: one artifact, one URL (https://claude.ai/artifact/RPkAXuaU1Lby64rALBH71K), per-viewer decision paths enforced by the platform ({self} rule), republished per proposal.
  - Approval sync: hash recomputed from the stored version, mismatches rejected and audited with both hashes, platform server time (browser decidedAt an untrusted note), identity = platform viewer id registered by first click and confirmed by Leo, other clicks stored as feedback, closed/superseded proposals reject decisions, an edit after approval invalidates.
FILES / TABLES / ENDPOINTS CHANGED:
  - supabase/migrations/0012_content_studio.sql, 0013_article_keyword.sql, 0014_proposals.sql
  - src/lib/studio/* ; src/app/studio/** ; src/app/opportunities/[id]/page.tsx ; src/app/layout.tsx ; src/approval-room/template.html
  - scripts/{studio,studio-smoke,build-voice-reference,build-approval-room,phase3-verify}.mts ; .claude/agents/thb-04..07-*.md ; .claude/commands/thb-run-agent.md ; package.json scripts
TESTS RUN + RESULTS:
  - Vitest 25 files, 257 tests pass (Phase 2's 99 plus the Phase 3 suites). Lint 0 errors (1 old warning). tsc clean. next build OK. db:check passes.
  - Live smoke (npm run smoke:studio; fixture article, scripted agents, forged records): PASSED. An agent cannot reach BRIEF_APPROVED; Agent 7 refused before fact and SEO pass; a wording-only fix re-reviews without fact review; a claim change re-enters fact review; an editor swapping a claim goes back to fact review; an unsupported figure blocks the section and the article (BLOCKED_CLAIM), the writer is refused while blocked or locked, Leo resolves; the article assembled to HUMAN_REVIEW; forged hash rejected and audited with both hashes; backdated browser time ignored (server time used); Leo's own click and a stranger's click are feedback; Leo refused as secondary; sign-off only after article and voice reference are both approved by the confirmed approver; reopening after approval cleared it and a replay of the old approval was rejected. All fixture rows removed; the real voice-reference row restored.
  - Approval Room live checks: a record survives a republish; the platform supplies the record's server updatedAt; a Contributor-level view cannot read or overwrite another viewer's record.
DATA / PERMISSION / PRIVACY IMPACT:
  - No WordPress access (a test asserts no write path). No new site requests. No seller material anywhere (no seller story is cleared; identity and internal-passage checks are in the gate).
  - The Approval Room is private until Leo shares it. Decision records hold the approver's platform id, decision, note and the hash.
STAGING DEMO: n/a. Demo = npm run dev, /studio, /studio/approvers, the brief approve button; npm run smoke:studio; npm run verify:phase3.
KNOWN LIMITATIONS:
  - The writer cannot add claims (stricter than the task text): the ledger grows only through Agent 2. A section needing a fact the ledger lacks comes back BLOCKED or escalated.
  - The article moves to HUMAN_REVIEW only when every section is locked (section statuses carry the detail). The orchestrator's limit of two article-level REVISION_REQUIRED passes still applies to reopening after assembly.
  - The figure check and the history-claim detector are regex-based and will not catch every phrasing; Agent 5 and Leo remain the backstop.
  - Display names in the approver registry are page-reported; the sync must be fed names from ArtifactData `profiles` (platform), and Leo confirms by account id. An account must click once to be registered.
  - Evidence Library sources have no recheck_by (two of three also lack an effective date), so the stale-source check only fires once a re-check date is recorded.
  - UPDATE support (live vs proposed, untouched sections byte-identical) is built and unit-tested on fixtures; the first article is a CREATE. No Developer Change Request path yet.
  - Agents 4-7 run through the operator (/thb-run-agent), one unit at a time; no API runner.
  - Not done: Leo's review of the finished draft, Juan's own click, an independent secondary on a real privacy exception (none applies to this article).
  - The draft can be exported as plain text with scripts/export-draft.mts (the export in docs/drafts/ is local only and not committed).
OPEN DECISIONS:
  - DONE by Leo: approved the hoarder brief; approved the voice reference provisionally; shared the Approval Room (Anyone in org, Contributor).
  - Leo: review the locked draft (version 4db42fea93cc). Optional findings stay unapplied until the Phase 3c comparison test.
  - Juan and Cherry each click once in the Approval Room so Leo can confirm them by account id (display names come from the platform's profiles call); Leo's own account registers as operator.
  - Pending brand facts stay blocked (author_bio needed; the author box uses approved facts only).
NEXT APPROVED STEP: paused. When Leo has reviewed the draft: create the proposal (npm run studio -- proposal <article_id> <file>), rebuild (npm run room:build) and republish the Approval Room; Juan reviews article and voice reference; sync-approvals; npm run verify:phase3. Phase 3c (agent restructure, docs/references/agent-restructure.md) starts only after Phase 3 is finished.
```
