# Phase 3c — Team Model (Agent Restructure)

## Goal
Replace the one-agent-at-a-time hand-offs with four agent teams that discuss inside the team and raise typed tickets with any other team, while code keeps every hard rule. Prove it by re-running the paused hoarder guide's revision (its 50 open findings) in team mode and comparing the result with the classic draft at version `4db42fea93cc`.

## Read first
- `docs/references/agent-restructure.md` — the proposal this phase builds (teams, tickets, feedback card, decision rules, escalation, limits).
- `docs/phases/phase-3-content-studio.md` — Handoff (section loop, locks, checks, approval sync, the 50 unapplied findings).
- `src/lib/studio/loop.ts`, `service.ts`, `checks.ts`, `agents.ts`, `src/lib/agents/bridge.ts`, `src/lib/orchestrator/states.ts`.
- `docs/references/editorial-standards.md` (rules each role must carry).

## Depends on
Phase 3 accepted as PARTIAL (commit `1cea6ca`, STATUS.md). The hoarder guide is at HUMAN_REVIEW as version `4db42fea93cc`: all 9 units locked, no proposal created, nothing in the Approval Room.

## Input: decisions (Leo, 2026-10-10)
- **Build now** as Phase 3c; the comparison runs at the END of 3c, inside the Studio, on the hoarder guide.
- **Round limit: 2 per ticket. Ticket budget: 10 per article.** Over budget the article stops and goes to Leo.
- **Teams:** Research R1 Legal and official / R2 Search / R3 Experience; Strategy S1 Strategist / S2 Architect; Writing W1 Writer / W2 Co-writer; Review council V1 Fact and Privacy (veto) / V2 one combined SEO/AEO/GEO reviewer / V3 Editorial Critic.
- **W2 only challenges and suggests.** It never writes into the draft; only W1 does.
- **Four tickets to start:** EVIDENCE_REQUEST, ROOT_CAUSE_NOTE, QUALITY_CORRECTION, HUMAN_ESCALATION. STRATEGY_CHALLENGE and ARCHITECTURE_REVISION are later.
- **Visibility:** Leo sees outcomes and escalations first; the full discussion log opens on click.
- **Classic stays.** A per-article switch (classic or team) chooses the pipeline; classic remains the default and keeps working unchanged.

- **Defaults confirmed by Leo:** team run on a separate branch (classic draft untouched); the 50 findings verified before the run; roughly 3-6x classic usage accepted; R3 limited to brand facts and THB process wording.
- **Every ticket type and every team must be proven at least once.** The hoarder revision mostly exercises Review -> Writing -> Research, so the smoke tests force the other paths, and the comparison report states which ticket types actually fired.

## Design notes (what stays in code, never agent agreement)
- Only V1 can block. V1 must pass every unit; only proof clears its veto.
- Every V2/V3 must-fix is done; should-fix and suggestions are listed for Leo. No unanimity needed.
- All existing hard rules remain deterministic checks: approved brand facts only, no ratings or review counts, no seller-identifying details or quotation-marked seller thoughts, no competitor sources, money pages protected, no WordPress writes, Juan's approval on the exact hash.
- No agent writes a lock, a state, an approval or a ledger claim directly. Research adds claims to the ledger only through R1/R2/R3 output that passes the same ledger checks Agent 2 passes today.
- Every ticket and reply is logged: who, what, when, version.
- The comparison must not touch the classic draft. Section versions are append-only, but reopening clears a lock, so team runs happen on a separate branch (Task 14) and `4db42fea93cc` is verified byte-identical afterwards.

## Tasks
**Status: approved by Leo (2026-10-10), with the four defaults below. Build in order.** Each task has a check; stop and tell Leo if a check fails.

*A. Data and routing*
1. **Migration 0015: team tables.** `tickets` (article_id, unit_key, type, from_role, to_role, issue, severity, evidence, suggested_fix, blocking, status, round, parent_ticket_id, version hash at raising, created/closed), `ticket_messages` (ticket_id, role, body, round, version), `team_runs` (article_id, mode, budget_used, status, started/ended), and `articles.pipeline_mode` (`classic` default | `team`). RLS forced, no policies, service role only, as in 0012.
   - *Check:* `npm run db:check` shows every table with RLS and anon refused; existing articles stay `classic`.
2. **Ticket schema and feedback card.** zod schemas for the four ticket types and the feedback card (TICKET, FROM, TO, SECTION, ISSUE, SEVERITY must fix / should fix / suggestion, EVIDENCE, FIX, BLOCKING). `BLOCKING: yes` is accepted only from V1.
   - *Check (unit):* a V2 or V3 card with BLOCKING yes is rejected; a card without evidence, section or one issue is rejected; unknown ticket types are rejected.
3. **Router.** Pure module: validates a ticket, routes it to the target role, enforces **2 rounds per ticket** and **10 tickets per article**, logs every message, and turns a limit hit or a HUMAN_ESCALATION into a Leo escalation (the six triggers in the proposal §5). No ticket can bypass the router; any team can ticket any team.
   - *Check (unit):* round 3 is refused and escalates; ticket 11 stops the article and escalates; a ticket from any team to any team routes; every step produces a log row.
4. **Team-mode loop.** A new loop module beside `loop.ts` (classic untouched) with the decision rules: V1 pass required, must-fixes closed, should-fix/suggestions collected for Leo, material changes re-enter V1, lock only after V1 plus must-fix closure, and only code sets the lock. It reuses `checks.ts`, the renderer, versions/hash and locks.
   - *Check (unit):* a deadlocked V2 on a suggestion does not block; V1 veto cannot be argued away; an edit after V1 pass re-enters V1; no role can lock; classic loop tests still pass unchanged.

*B. Agents*
5. **Research files R1, R2, R3.** `.claude/agents/thb-r1-legal-official.md`, `thb-r2-search.md`, `thb-r3-experience.md`, versioned 1.0.0, each with its Prohibited action verbatim. R1: official sources only (WebFetch limited as Agent 2 is). R2: demand, questions, rankings from stored GSC data (Read/Write only, no web). R3: anonymized seller stories and brand facts from the approved Library only; it cannot clear a seller story (`publication_cleared` stays the gate).
   - *Check:* script test as Phase 2 task 9: file exists, carries version and Prohibited action, tool list as specified.
6. **Strategy files S1, S2.** Reuse Agents 1 and 3 contracts as `thb-s1-strategist.md` and `thb-s2-architect.md`; S2 additionally handles ROOT_CAUSE_NOTE (fix the brief, name the affected sections only). A brief change that alters an approved brief or target keyword raises HUMAN_ESCALATION.
   - *Check (unit):* a ROOT_CAUSE_NOTE yields a brief revision that lists affected units; a keyword change escalates.
7. **Writing files W1, W2.** `thb-w1-writer.md` (Agent 4's contract plus ticket output), `thb-w2-cowriter.md` (challenges angle, H1, clarity, examples, CTA; output is suggestions only, never draft text). Standing writer rule stays: no quotation marks around imagined homeowner thoughts.
   - *Check (unit):* W2 output containing draft text, a lock, a claim or a state change is rejected; W1 cannot add claims (Phase 3 rule) and must raise EVIDENCE_REQUEST instead.
8. **Council files V1, V2, V3.** `thb-v1-fact-privacy.md` (Agent 5 contract, veto), `thb-v2-seo-aeo-geo.md` (Agent 6), `thb-v3-editorial.md` (Agent 7). Each emits feedback cards. The three agree on one combined feedback set before it reaches W1; disagreements are listed, not hidden.
   - *Check:* script test for files, versions, Prohibited actions, Read/Write only; unit test that a combined set keeps every V1 item and de-duplicates the rest without dropping a must-fix.
9. **Bridge extension.** Task packets and submit checks for the new roles; the delimited untrusted block for drafts and ticket text; malformed output retries three times then INTEGRATION_ERROR, as today. Ticket text from agents is treated as untrusted data.
   - *Check (unit):* each role's schema; injected instructions inside ticket text are not followed (fixture).

*C. Studio UI and operator*
10. **Mode switch.** `articles.pipeline_mode` toggle on `/studio/[id]` (only before any section is written, or on a branch per Task 14); CLI `studio -- mode <article_id> classic|team`.
    - *Check:* classic articles behave exactly as before (smoke test); a team article refuses classic submits and the reverse.
11. **Outcomes and escalations first.** `/studio/[id]` adds a Team tab: per unit, the outcome (resolved, open tickets, escalations, must-fix count, V1 status) and the budget bar (tickets used of 10). Full discussion opens on click per ticket. A "Stuck" inbox for Leo lists HUMAN_ESCALATION and limit hits with both positions and a recommendation, with resolve actions that reuse `resolveSection`.
    - *Check:* smoke script drives a fixture article through a ticket, a limit hit and an escalation, and the page shows each.
12. **Operator runner for team runs.** `studio -- team-plan <article_id>`, `team-dump`, `team-submit-dir` (same pattern as `dump-queued` and `submit-dir`) so `/thb-run-agent` can run roles one packet at a time, including the discussions. Update the `/thb-run-agent` command for the new keys.
    - *Check:* a fixture run through the CLI ends with the router log complete.

*D. Tests and the comparison*
13. **Regression and smoke.** Carry over the Phase 3 fixtures to team mode (unsupported claim, wrong jurisdiction, privacy gate, editor changes a fact, post-approval edit, PENDING JUAN fact, rating text, "founder", no-self-approval) plus: V1 veto, round cap, ticket budget, W2 cannot write, only V1 blocks. The smoke test also **forces** each path the real run may not reach: at least one ROOT_CAUSE_NOTE (V2 -> S2, brief fixed, only the affected units redone), one HUMAN_ESCALATION, one EVIDENCE_REQUEST from Strategy (S1 -> R2 demand request, answered with an evidence pack) and one from Review (V1 -> R1), and a QUALITY_CORRECTION (V3 -> W1). Strategy-side coverage uses the four starting ticket types only; STRATEGY_CHALLENGE (Research -> Strategy) stays out of scope. A test asserts that across the smoke run every one of the four ticket types fired and every one of the four teams sent and received at least one ticket or discussion. `npm run smoke:team` on a fixture article, scripted agents, as `smoke:studio` does.
    - *Check:* full Vitest, lint, tsc and `next build` pass; classic smoke (`smoke:studio`) still passes.
14. **Comparison setup (no change to the classic draft).** Create a team-mode **branch** of the hoarder guide: same brief, ledger and voice reference, starting from the 9 locked units of `4db42fea93cc`, and load the **50 open findings** from `section_reviews` as the starting QUALITY_CORRECTION set (count verified to be 50; stop and report if it is not). The classic article stays at HUMAN_REVIEW, untouched. **DONE** (8970450, 1413b9a; branch d7f03fff…).
    - *Check:* classic article state, section hashes and version `4db42fea93cc` unchanged after loading; 50 findings present, none dropped or invented.
15. **Run the team revision.** Operator runs the teams through `/thb-run-agent` until every unit is locked or escalated, or the budget is hit. Round limit 2, budget 10, W2 suggestions only. **DONE** (036c5a4; budget raised 10 to 30 for the branch only, recorded).
    - *Check:* every finding ends fixed, declined with a reason, or escalated; no blocked fact present; every claim has evidence; all deterministic checks pass; audit rows for each step.
16. **Comparison report** `docs/phases/phase-3c-comparison.md`, from real numbers: classic vs team on findings fixed / declined / escalated, remaining must-fix, editorial scores per unit (classic 78-84), V1 results, tickets and rounds used, escalations, **which ticket types and which teams actually fired in the real run (count per type, from/to), and which only fired in the smoke test**, Claude usage (runs, attempts, token estimate), wall-clock, and a side-by-side diff per unit between `4db42fea93cc` and the team version. It states plainly which result is better and where it is not, and makes a recommendation; Leo decides. **DONE** (015699b, 52fc9de; code for the classic-revision follow-up: de9e31b).
    - *Check:* every number traces to a table row or log; Leo can open both versions in the Studio.
17. **Verify and handoff.** `scripts/phase3c-verify.mts` prints each Done-when item with real numbers; fill in the Handoff; update `STATUS.md`. **CLOSED docs-only** (Leo, 2026-10-12): `scripts/phase3c-verify.mts` was not written; Handoff and `STATUS.md` updated; judging data committed under `phase-3c-data/`.
    - *Check:* verify output matches the handoff text. Anything unmet makes the handoff PARTIAL and says so.

## Open points for Leo (defaults assumed unless you say otherwise)
1. **Branch vs in place (Task 14).** I assume a separate team-mode branch so the classic draft stays intact for Leo's review and the Phase 3 sign-off. Reopening the real article in place would overwrite what Juan is meant to review.
2. **Claude usage.** Expect roughly 3–6x the classic run for the same article (proposal §8). The hoarder run was 36 reviews; budget accordingly before Task 15.
3. **Roles for R3.** No seller story is cleared for this article, so R3's contribution is limited to brand facts and THB process wording; the comparison may show little R3 effect.
4. **Phase 3 close-out is independent.** Leo's review, Juan's click and approver registration still apply to the classic draft; none depends on 3c.

## Out of scope
- STRATEGY_CHALLENGE and ARCHITECTURE_REVISION tickets, a split SEO/AEO/GEO council, an API runner (the operator still runs agents).
- Any WordPress write; any change to the Approval Room or approval sync.
- Changing the classic pipeline's behavior.
- A ticket type that targets Review (decided by Leo, 2026-10-10): the loop re-sends every revised draft to Review automatically, so none is needed now. Consider a RECHECK_REQUEST (→ V1) if the comparison run shows Research finding new evidence that Review should re-check.

## Done when
- [x] Classic articles behave exactly as before; the mode switch picks the pipeline per article (tested)
- [x] The router enforces 2 rounds per ticket and 10 tickets per article, and escalates on a limit hit (tested)
- [x] Only V1 can block; V1 cannot be argued away; W2 cannot write; no role can lock, approve or change state (tested)
- [x] All Phase 3 hard-rule fixtures pass in team mode
- [x] The smoke test fires all four ticket types (including a V2 -> S2 ROOT_CAUSE_NOTE and a Strategy-side EVIDENCE_REQUEST) and touches all four teams
- [x] The team revision of the hoarder guide ran on a branch; the classic version `4db42fea93cc` is byte-identical (original fingerprint `23f8dd72…4611` unchanged at every check; both branches at HUMAN_REVIEW)
- [x] The comparison report exists with real numbers, lists the ticket types that fired in the real run, and gives a recommendation; Leo has read it (read in full and decided, 2026-10-12)

## Decision (Leo, 2026-10-12)
**Hybrid approved.** Classic is the default pipeline. V1 becomes the fact gate on classic text. Team mode is kept but is not the default. The fixes proposed in section 6 of `phase-3c-comparison.md` are deferred to **Phase 3d**; 6.1 (declines lost when reviewers re-issue their lists) is a **must-fix bug in any mode**. This records the direction only: the V1 gate on the classic path and every section 6 fix are not built.

## Handoff
```text
PHASE: 3c — Team Model
STATUS: DONE. Closed by Leo, 2026-10-12. Tasks 1-16 done, committed and pushed (origin/main). Task 17 closed docs-only by Leo's decision (the verify script was not written; see Loose ends).
UPDATED: 2026-10-12

DECISION (Leo, 2026-10-12)
  Hybrid approved. Classic is the default pipeline. V1 becomes the fact gate on classic text. Team mode is kept, but is not the default.
  The comparison report's section 6 fixes are deferred to Phase 3d; 6.1 (declines lost when reviewers re-issue their lists) is a MUST-FIX BUG in any mode.
  This is the direction only. The V1 gate on the classic path and every section 6 fix are NOT built.

DONE (commit per task)
  1  3ce2e6c  migration 0015 team tables (tickets, ticket_messages, team_runs, articles.pipeline_mode, articles.branch_of)
  2  a90b5fa  ticket types + feedback card (only V1 may block)
  3  1987eb7  router: 2 rounds per ticket, 10 tickets per article, escalation to Leo, full log
  4  2f236bf  team section loop (V1 veto; only code locks); e2b9d7a V1 re-reviews every changed version, scoped to changed sentences
  5  39c5ab3  research files R1-R3 (+ 5f6f242 role-specific prohibited actions; R1 official-source allowlist)
  6  a238fda  strategy files S1/S2; ROOT_CAUSE_NOTE brief revision; approved identity escalates (5e04e0f)
  7  5468ec9  writing files W1/W2 (W2 suggestions only; W1 cannot add claims)
  8  85d9bb1  council files V1-V3; combined feedback set keeps every V1 item and links merged cards to their originals
  9  1d4b0af  team bridge: packets, strict schemas, submit checks, retry then INTEGRATION_ERROR
  10 08f91b7  pipeline_mode switch (service, CLI, UI); classic and team refuse each other's runs
  11 6966dcd  persisted router, Team tab, Stuck inbox, Leo-only resolve
  12 253486d  team runtime + operator runner (team-plan, team-queue-next, team-dump, team-submit-dir, team-log); /thb-run-agent updated
  13 f4af090  team-mode regression fixtures and live smoke:team; resolveSection made team-aware; smoke:cleanup
  14 8970450  branchArticle, studio branch / fingerprint / branch-delete; approveBrief's existing-article lookup ignores branches (a branch shares the opportunity)
     1413b9a  collectFindings takes every optional finding of every review of each locked version (the 50 include both Agent 7 reviews of s6; the first rule gave 47)
  15 036c5a4  tooling: team-queue argument fix, team-progress, per-branch ticket budget exception (raised 10 to 30 for the branch only, recorded in the audit log), team-answer
  16 015699b  comparison report (docs/phases/phase-3c-comparison.md)
     de9e31b  classic-mode branch (revision baseline) for the follow-up; the resolveSection call-site pin now names branch.ts
     52fc9de  report updated with the follow-up tests, the recommendation and the cost table
  17 (closing commit)  docs only: judging data under docs/phases/phase-3c-data/, this Handoff, STATUS.md
  Also: 5c0eada hedge-phrase flag (V1 must rule proven/reword/drop on each flagged sentence); 78a62fa R1 fetch-and-store; 1193e93 and 7863ccb Leo-only resolve and mode switch.

RESULTS (full numbers in docs/phases/phase-3c-comparison.md; token figures are estimates, characters / 4)
  - The 50 seeded findings, judged on the final team text: 39 addressed, 2 partly, 0 not addressed, 9 declined with reasons (6 are the same missing local anchor).
  - Blind editorial score (same rubric, A/B hidden): team 68.8 vs unrevised classic 65.6; team 67.8 vs classic-revised 65.7 over two rounds with the labels swapped (only 4 of 9 preferences held when the labels swapped): within the judges' noise.
  - V1 on the nine locked classic units: REVISION on 7, 15 must-fix issues. After the classic revision: REVISION on 6, 7 must-fix. Classic's Agents 5, 6 and 7 passed all 27 of 27 classic-revised reviews. Only the team pipeline ended with a V1-clean text.
  - Cost: team revision 110 agent runs, about 1.04M tokens, about 88 min sequential; classic revision 37 runs, about 329k, about 9 min (units in parallel); classic as drafted 56 runs, about 495k.
  - Team run: 23 tickets, all QUALITY_CORRECTION, all closed in round 1; the 10-ticket budget was hit at s4 (unit 4 of 9) and raised for the branch; 1 escalation (the budget stop). EVIDENCE_REQUEST and ROOT_CAUSE_NOTE fired only in the smoke tests, never on the real article.

ARTICLES (none deleted; no proposal, no approval, no publication, no WordPress write on any of them)
  - Original, classic: e2b915e3-af97-4ea6-8979-4861ec729027, HUMAN_REVIEW, version 4db42fea93cc, 50 optional findings unapplied, untouched. Fingerprint 23f8dd72…4611 unchanged at every check.
  - Team branch: d7f03fff-22d0-48fe-9ee0-3d6d5102c856, HUMAN_REVIEW, version d93053c44bb1, pipeline_mode team, branch_of the original, is_fixture false. Team run budget exception 30.
  - Classic-revision branch: 54070caa-bd79-4184-a82a-9235b1c33b64, HUMAN_REVIEW, version 6cd1c5264e9c, pipeline_mode classic, branch_of the original, is_fixture false.
  - Rollback of a branch: npm run studio -- branch-delete <branch_id> --yes (refuses the original and fixtures). smoke:cleanup never touches a branch (is_fixture false).

VERIFIED
  - At de9e31b: full Vitest 44 files and 632 tests, tsc, eslint (0 errors, one old warning in scripts/bundle-scan.ts), next build. The docs-only commits after it change no code.
  - The live smokes (smoke:studio, smoke:team-view, smoke:team-cli, smoke:team) were last run at f4af090 (Task 13) and were NOT re-run after Tasks 14-16. The branch, fingerprint, budget-exception and classic-branch code was unit-tested and used live on the real article, with the original's fingerprint compared after each step.
  - Judging data was scanned for seller names, addresses, prices, contacts, keys and local paths before committing: none (the packets carry Twin Home Buyer's own approved company details only).

MIGRATIONS 0015-0019: all applied to the live database, all additive, all approved by Leo. None added in Tasks 14-17.
  0015 team tables and articles.pipeline_mode ('classic' default), articles.branch_of
  0016 tickets.merged_from · 0017 tickets.from_roles, tickets.escalation_trigger · 0018 articles.is_fixture · 0019 tickets.issue_key

STANDING RULES (keep following them)
  - Only "leo" acts on a real article: resolving a section and switching the pipeline are refused for any other actor. The "smoke-test" actor is accepted only on an article flagged is_fixture, never on a real one. Agent roles, agent keys, the bridge and the orchestrator are refused outright. Both branches are real articles (is_fixture false), so every human action on them runs as leo.
  - No approvals, no publishing, no WordPress writes, no Approval Room clicks. Code sets locks; no agent output can set a lock, an approval or a state.
  - Classic stays the default and is unchanged. The classic hoarder article (version 4db42fea93cc, HUMAN_REVIEW, 50 optional findings) must stay untouched.
  - Never force-push. Push only when asked. Apply a migration only when Leo approves it. Ask before any change to a real article.
  - Approved identity (keyword, working title, H2 questions, slug/URL, action and target page, required links, never-target list, protected pages) is never changed by S2: a change escalates to Leo.
  - A stuck situation (escalation, round-limit hit, budget stop) stops for Leo; the runner never resolves anything.
  - Run smoke:team in the background (about 15 minutes against the live database). If a smoke is killed, npm run smoke:cleanup removes only fixture rows.

LOOSE ENDS (honest list)
  - Task 17 as planned asked for scripts/phase3c-verify.mts and a verify-matches-handoff check. Leo closed Task 17 docs-only, so neither exists; under the original rule this would have made the handoff PARTIAL, and Leo has accepted it as DONE.
  - The comparison's limits are in section 9 of the report: one article, one judge model, noise of 2-3 points, unequal parallelism, token figures are estimates, the hybrid cost is a projection, and the V1 fix loop has not been run.
  - Phase 3 close-out is independent of 3c: Leo's review of the classic draft, Juan's approval and approver registration still apply to 4db42fea93cc.
  - The remote: the local branch master pushes to origin/main. origin/master is an old branch at 4d83920 and was never touched.

NEXT: Phase 3d (not started; scope set by Leo). Deferred from this phase, in this order: (1) 6.1 lost declines, a must-fix bug in any mode; (2) the V1 fact gate on classic text (build and pilot on the next real article, measure V1 must-fix before and after); (3) 6.2 reviewer conflicts, 6.3 rewrite overstatements, 6.4 ticket usage, as Leo decides.
```
