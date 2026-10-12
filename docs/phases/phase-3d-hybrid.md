# Phase 3d — Hybrid pipeline (classic + V1 fact gate) and the declines fix

## Goal
Classic stays the default pipeline. V1 (fact and privacy, with the hedge flag and the must-rule step) becomes a mandatory gate on any text the classic loop writes or revises, replacing Agent 5's pass. Lost declines (report 6.1) are fixed in classic and team mode. Team mode stays in the code, not the default.

## Decisions (Leo, 2026-10-12)
Plan approved with conditions: list Agent 5's checks and where each is covered; the churn check applies only to the writer's V1-fix pass; every changed agent file gets a prompt version bump with the exact change (declines wording only); commit order declines module, classic declines, V1 gate, escalation, adversarial fixtures, smokes and verify script. Defaults accepted: 2 attempts then escalation; not retroactive; no migration; no new code flags unless the live test shows a V1 miss. The real run (task 10) may run units in parallel; the report says so and keeps counters and escalations per unit.

## Status
Tasks 1-9 built and committed. **Task 10 (real run on `54070caa…`) not started: waiting for Leo's go-ahead.**

## What was built
| Task | Commit subject | What |
|---|---|---|
| 1 | declines module wired into the team loop | `src/lib/studio/declines.ts`: structured `declines [{key, reason}]` stored per unit, never replaced by a reviewer's list; a re-raise (same key or similar text) counts once unless `new_evidence` is cited; survives reopen and unlock. Team W1 `result.declines`, reviewers' packets carry `previously_declined`. |
| 2-3 | declines in classic, and Leo's list | Classic keeps optional findings (Agents 6, 7) and the writer's declines. Leo's list: Studio draft tab and `npm run studio -- declines <article>`. |
| 4-5 | V1 is the fact gate | Classic fact stage reviewed by V1; lock needs a V1 PASS on the exact content hash; changed-sentence scope; fix pass touches only cited sentences (`det:V1_FIX_CHURN`, writer's V1-fix pass only). |
| 6 | round limit and escalation | 2 fix attempts then ESCALATED per unit; only Leo resolves. |
| 7 | adversarial fixtures | Four poisoned units; Vitest and live V1. |
| 8-9 | smokes and verify script | `smoke:studio` extended (gate-only, declines, churn, escalation), `adversarial` live runner, `verify:phase3d`. |

### Behavior notes
- **Where V1 sits:** classic status `NEEDS_FACT` is reviewed by V1 (agent key `thb-v1-fact-privacy`, same file and strict schema as the team V1). Agent 5 is retired from the classic path; it reviews only a section saved before the gate and untouched since (not retroactive: 18 locked units of the existing articles are grandfathered until touched).
- **Anything touched goes through V1:** writer text, an Agent 7 `revised_unit`, a human edit, a reopen. Byte-identical text keeps the Agent 6/7 passes. `studio resolve <article> <unit> v1_gate` (Leo only) sends a locked unit through V1 without changing its text.
- **Scope:** V1 reviews the full unit the first time, then the changed sentences plus any cited sentence still present.
- **Round limit:** the third V1 REVISION in a cycle escalates (a reworded sentence gets a new key each time, so the per-issue count alone would loop). A repeating deterministic finding now keeps its attempt count and also escalates after 2 (before: the count reset every version, so a repeating finding could loop). Leo's resolution restarts the cycle and V1 still has to pass the result.
- **Persistence:** the gate state is stored in the section's `issues` jsonb (`meta.v1`). No migration.
- **Bug found and fixed on the way:** the first V1 gate commit did not persist the gate fields; the round-trip test added in the escalation commit found it. Fixed in that commit (disclosed in its message).

## Agent 5 audit: every check, and where it is covered after the change
Test: `src/lib/studio/v1-gate.test.ts`, "Agent 5 audit". Any uncovered check is a failing test.

| Agent 5 check | Covered by |
|---|---|
| Rules 1-9 of its file | V1's file carries the same rules word for word (test compares the two Rules sections) |
| `claim_checks` cover every cited claim, no uncited claim named | same semantic function (V1 runs through `teamSemanticChecks`, which calls Agent 5's checks); tested |
| PASS refused if a verdict is not `supported_as_written` | same; tested |
| `legal_qualification_ok` false refuses PASS | same; tested |
| `privacy_ok` false refuses PASS | same; tested |
| PASS refused with a required finding; REVISION needs one; BLOCKED needs `block_kind` | same; tested |
| PASS refused when a deterministic check finds a blocking problem it missed | same, via `checkUnit` (checks.ts): uncovered figure, seller story, pending Juan fact; tested |
| Review of a different version refused | same; tested |
| Strict schema, no `approved`/`locked`/`state` keys | V1 schema extends the same strict object; tested |
| Unsupported generalizations (never caught by Agent 5) | **new:** hedge flag plus V1 must-rule step |

## Agent file changes (prompt versions)
Only declines wording changed. Every other file is unchanged at 1.0.0.

| File | Version | Exact change |
|---|---|---|
| `thb-w1-writer` | 1.0.0 to 1.1.0 | new section "Declines": list a should-fix or suggestion (never a must-fix) in `result.declines` as `{key, reason}`; example shape gains `"declines": []` |
| `thb-04-section-writer` | 1.0.0 to 1.1.0 | same wording for "optional item"/"required issue"; example gains `"declines": []` |
| `thb-v1-fact-privacy`, `thb-v2-seo-aeo-geo`, `thb-v3-editorial` | 1.0.0 to 1.1.0 | new section "Declined items": do not raise a `previously_declined` item again under a new key or wording; to raise it again, put what is new in `new_evidence` on the card and the finding |
| `thb-06-seo-aeo-geo-auditor`, `thb-07-editorial-critic` | 1.0.0 to 1.1.0 | same "Declined items" wording (finding only) |

Also changed, not an agent file: `.claude/commands/thb-run-agent.md` names the classic V1 gate. The "fix only the cited sentences" rule and the decline rule reach agents through the trusted packet `instructions` and data fields, not the agent files. Prompt versions are per role now (`TEAM_PROMPT_VERSIONS`, `STUDIO_AGENT_META`) and a test keeps files and code in step.

## Adversarial results
Fixtures only (`scripts/fixtures/adversarial-units.ts`). Code layer (Vitest): the hedge flag catches the generalization; a blunt seller story is a privacy block; the legal claim, the unverified local fact and the subtle anecdote are **not** caught by code, by design of the test, and rely on V1. Live layer: the real V1 on a fixture article (`npm run adversarial`; data in `phase-3d-data/adversarial/`):

| Case | Unit | Real V1 | Status |
|---|---|---|---|
| invented legal claim | s4 | BLOCKED, cites the neighbors-notice sentence as an unsupported legal duty | BLOCKED_CLAIM |
| unsupported "most/usually/never" | s5 | REVISION, hedge ruling `drop` on the flagged sentence | NEEDS_REVISION |
| unverified local fact | s3 | BLOCKED, cites the Alameda County rule as an unsupported local rule | BLOCKED_CLAIM |
| seller-identifying anecdote | s2 | BLOCKED (privacy), cites the family/neighborhood/inspector anecdote | BLOCKED_PRIVACY |

Four of four caught before any lock; none was a miss, so no new code flags. Limit: one run per case, one model judgment each; the s5 run's first quoted finding was about a different sentence (the hedge ruling is what caught the injected one).

## Verification
- Vitest 48 files, 719 tests, tsc, eslint (0 errors), `next build`: green at the last commit.
- Live smokes run at the final code: `smoke:studio`, `smoke:team-view`, `smoke:team-cli`, `smoke:team`: all PASSED, fixture rows cleaned.
- `npm run verify:phase3d`: original article fingerprint `23f8dd72…4611` and version `4db42fea93cc` unchanged; both branches at HUMAN_REVIEW; no migration after 0019; no fixture left; no gated unit locked without a V1 pass.
- `phase3c-verify.mts` was not written separately: `verify:phase3d` checks the Phase 3c invariants too (migrations, both branches, the untouched original), so a second script would duplicate it.

## Open for Leo
Task 10: the hybrid on `54070caa…` (7 remaining V1 must-fix items), then V1's result per unit and the 5-item hedge spot-check list. Needs Leo's go-ahead before any change to that article.
