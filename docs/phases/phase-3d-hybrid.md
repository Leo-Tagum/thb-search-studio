# Phase 3d — Hybrid pipeline (classic + V1 fact gate) and the declines fix

## Goal
Classic stays the default pipeline. V1 (fact and privacy, with the hedge flag and the must-rule step) becomes a mandatory gate on any text the classic loop writes or revises, replacing Agent 5's pass. Lost declines (report 6.1) are fixed in classic and team mode. Team mode stays in the code, not the default.

## Decisions (Leo, 2026-10-12)
Plan approved with conditions: list Agent 5's checks and where each is covered; the churn check applies only to the writer's V1-fix pass; every changed agent file gets a prompt version bump with the exact change (declines wording only); commit order declines module, classic declines, V1 gate, escalation, adversarial fixtures, smokes and verify script. Defaults accepted: 2 attempts then escalation; not retroactive; no migration; no new code flags unless the live test shows a V1 miss. The real run (task 10) may run units in parallel; the report says so and keeps counters and escalations per unit.

## Status
Tasks 1-9 built and committed; V1 severity calibration (1.2.1) approved with documented exception (below). **Task 10 (the hybrid on `54070caa…`) done 2026-10-13: reached HUMAN_REVIEW, see below.**

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
- **Commit `fa12898` is broken on its own and fixed in `7e3d2f5`.** `fa12898` (the V1 gate) did not write the gate fields to the section row or read them back, so the gate would have lost its state between runs. The round-trip test added in `7e3d2f5` found it; `7e3d2f5` stores the fields in `issues.meta.v1`. Anyone bisecting should treat `fa12898` as not working and use `7e3d2f5` or later. The commits were pushed as they are, not rewritten.

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

## V1 severity calibration (prompt 1.2.1): approved with documented exception

**Release status: Approved with documented exception.** Not "gate passed": one release condition (card 1 returns should-fix) was not met, in the isolated run or in context, and Leo accepted that as a deliberate conservative exception.

Origin: Leo judged ten of V1's must-fix cards blind (A 2, B 3, C 5; `phase-3c-evidence-audit.md`, Q20). V1 was calibrated so that:
- specific legal claims, statutory conditions, lists of legal roles, case-specific legal conclusions, figures and money stay must-fix;
- a general legal principle is a should-fix (an optional finding), visible to Leo and never blocking;
- an unsupported frequency word that is not a statistic is `soften` (should-fix); an empathetic, conditional or hypothetical line is `not_a_claim` (no finding); `reword` and `drop` stay must-fix;
- code guard (`src/lib/studio/hedge-rulings.ts`): `soften` and `not_a_claim` are refused on a flagged sentence with a statute or code section, a statutory condition, a figure or money, or a list of legal roles; `not_a_claim` is also refused on any sentence that states a legal rule. No protection was weakened to improve a score.

**Result 1, original isolated run (real V1, ten sentences unchanged, production path, one unit each): 9/10.**

| Card | Expected | Actual | Match |
|---|---|---|---|
| 1 | should-fix | **must-fix** | no |
| 2 | must-fix | must-fix | yes |
| 3 | should-fix or none | none | yes |
| 4, 5, 6 | should-fix or none | should-fix (`soften`) | yes |
| 7 | should-fix or none | none (`not_a_claim`) | yes |
| 8 | should-fix | should-fix | yes |
| 9 | must-fix | must-fix | yes |
| 10 | should-fix or none | none (`not_a_claim`) | yes |

**Result 2, card 1 in its original context (reported separately; not merged into the 9/10):** the six-item classic-revised FAQ exactly as V1 reviewed it in Phase 3c (version `b30a408c09e1`), sentence, context, prompt and guard unchanged, three independent real V1 runs on three fixture articles. **Must-fix in 3 of 3 runs.** In all three, V1's finding is on item 4 as a whole: it cites the list of legal roles in the neighbouring sentence ('the owner, a trustee, an executor or administrator, or several heirs who agree') together with 'Living in the house alone does not give you that authority', and says no ledger claim supports who holds authority; runs 2 and 3 offer to keep a plain statement that the signer needs authority and must be confirmed with an attorney or title company. So in context the must-fix is driven largely by the protected list of legal roles, and card 1's sentence is judged together with it. The isolated run (sentence alone, 'you' and no context) was also must-fix, as a case-specific conclusion about authority. In every run V1 also raised separate findings on other text (for example 'The statute does not mention hoarding.'), which were not scored.

**Accepted deviation:** card 1 stays must-fix: conservative handling of potentially case-specific legal authority. Expected outcomes were not changed and the prompt was not tuned for it.

Release conditions: 9/10 blind matches (needed 8); cards 2 and 9 must-fix (met); cards 1 and 8 should-fix (card 8 met, **card 1 not met: documented exception**); all four adversarial fixtures caught by the real V1 with the final guard and prompt (legal claim blocked, local fact blocked, seller anecdote blocked on privacy, generalization sent back with a must-fix); 738 Vitest tests, tsc and eslint clean; no specific-claim protection weakened.

Prompt version: the validated text is the 1.2.0 text; 1.2.1 is the release label of that same text (no wording change after validation). Data: `phase-3d-data/calibration-v1-1.2.0/` (ten sentences), `calibration-card1-in-context/` (three runs), `adversarial-v1-1.2.0-final/` (four fixtures); scripts `scripts/calibration-smoke.mts`, `scripts/calibration-context-smoke.mts`.

Limits: one model's rulings, one run per card in the isolated test; the guard is keyword-based (a legal rule worded without the listed words can still be ruled `not_a_claim`, so the protection rests on V1's judgment plus the specific-claim guard); the classification script maps findings to a card by wording overlap.

## Task 10: the hybrid on the classic-revision branch `54070caa…` (2026-10-13)

**Result: reached HUMAN_REVIEW. 9 units locked, article assembled (`81de13358a74`), 0 escalations, 0 retries, no proposal, no approval, no WordPress write.** The original article's fingerprint `23f8dd72…4611` was compared before every step and after every step (16 checks) and never changed. Stopped at HUMAN_REVIEW as instructed.

### The reopen-all-units step, and why
Before any V1 run, all nine units were sent through the V1 gate **as `leo`** with `studio resolve <branch> <unit> v1_gate` (the Leo-only gate-only action): the unit goes to `NEEDS_FACT` with the text unchanged, and V1 passing identical text keeps the Agent 6 and 7 passes, so no unchanged unit repeats them. Why all nine first, not one at a time:
- The article was in HUMAN_REVIEW. The first gate returns it to DRAFTING (REVISION_REQUIRED then DRAFTING); the orchestrator allows two such article-level revisions in total. If a unit relocked while others were still waiting, the article would reassemble to HUMAN_REVIEW and the next gate would use up another revision. (The `smoke:studio` run first hit exactly this limit.) With all nine units gated first, the article stayed in DRAFTING until the last unit locked and assembled once.
- Gate-only (not a reopen with a directive) was used because V1 had to look at every unit anyway and the text had not changed: seven units needed a single V1 run.

### Conditions
Parallel: the nine units ran in parallel within each round (all nine V1 reviews together; then the two units that needed a fix, together at each later step). Counters and escalations are kept per unit by the state machine. V1 prompt 1.2.1 and the guard as committed in `4aca4dc`, one identical dispatch prompt for every V1 run (no extra instructions). Rounds: 5 (V1 on 9 units; writer on 2; V1 re-check on 2; Agent 6 on 2; Agent 7 on 2).

### 1. V1 result per unit

| Unit | V1 round 1 | must-fix | should-fix | `not_a_claim` | What was fixed |
|---|---|---|---|---|---|
| s1 | PASS, locked again | 0 | 2 (one `soften`, one optional finding on the same sentence) | 1 | nothing |
| s2 | REVISION | 1 | 2 | 0 | the cited sentence only (the list of roles: owner, trustee, executor, administrator, spouse, heirs) was replaced by "Who that is depends on the documents and the facts, and an attorney or title company can confirm it." Round 2: V1 PASS; Agents 6 and 7 PASS; locked |
| s3 | PASS, locked again | 0 | 0 | 0 | nothing |
| s4 | PASS, locked again | 0 | 1 | 0 | nothing |
| s5 | PASS, locked again | 0 | 0 | 0 | nothing |
| s6 | PASS, locked again | 0 | 1 (`soften`) | 1 | nothing |
| s7 | PASS, locked again | 0 | 2 (one `soften`) | 0 | nothing |
| s8 | PASS, locked again | 0 | 0 | 1 | nothing |
| faq | REVISION | 2 | 2 | 0 | the three cited sentences were removed ("The statute does not mention hoarding."; the list of roles; "Living in the house alone does not give you that authority."), nothing else changed. Round 2: V1 PASS; Agents 6 and 7 PASS; locked |

Totals: 3 must-fix findings on 2 units, 8 should-fix items in V1's round-1 reviews, 3 `not_a_claim` rulings, 4 `soften` rulings, 0 `proven`. The fix-only rule held: only the cited sentences changed, and the churn check did not fire. For comparison only (not like for like, because V1 was calibrated in between): the Phase 3c follow-up V1 (prompt 1.0.0) returned REVISION on 6 of 9 units of this text with 7 must-fix.

### 2. Measured tokens (from the session transcripts)
17 subagents. Input 96; cache creation 416,737; cache read 491,628; output 4,226 (a lower bound, see the evidence audit). **All categories: 912,687. Without cache reads: 421,059.** Cache reads are 54% of the total. The old estimate (characters of the stored packets and outputs divided by 4) gives **141,258**, so the old method was low by about 6.5x again. By role: V1 11 agents 650,464; writer 2 agents 120,562; Agent 6 2 agents 84,722; Agent 7 2 agents 56,939. Per agent 53.7k. Against the earlier measured figures for the same text: classic revision 37 runs, 1.69M; team revision 110 runs, 5.58M. The pre-run hybrid projection (58 runs, re-expressed about 2.6M, estimated) was too high because gate-only skipped Agents 6 and 7 on seven units and V1's calibrated rulings left only two units to fix.

### 3. Runs and elapsed time
17 runs: V1 11 (9 + 2), writer 2, Agent 6 2, Agent 7 2. 0 retries, 0 rejected outputs. Wall clock: 00:01:17Z (start of gating) to 00:10:05Z (HUMAN_REVIEW) **= 8 min 48 s**; first to last agent 5.8 min. Units ran in parallel, so this is not comparable with the team run's 87 min sequential.

### 4. Automation counters
- **Leo's actions:** the go-ahead for Task 10, and the nine Leo-only `v1_gate` actions (executed through the operator CLI as `leo`, under that authorization). No resolve, no escalation answer, no approval.
- **Operator actions:** 5 rounds of queue, dump, dispatch, submit (20 command steps), 17 agent dispatches, 16 fingerprint checks, 7 plan reads, and the end-of-run data collection. All mechanical; none needed a judgment.
- **Escalations: 0.** No unit reached the round limit; no churn finding; no rejected output.
- **Could it have finished unattended?** After the gate action, yes: no decision was needed in any round. What an unattended run still needs: (a) a runner that dispatches the agents (today the operator does that by hand), (b) the gate action, which is Leo-only by design (a single "gate all units" command would do), (c) the standing stop for an escalation, which did not occur here. This run is one data point with no failures.

### 5. Hedge spot-check list (5 of V1's 7 hedge rulings)
Selection rule, fixed before reading them: all three `not_a_claim` rulings (the ones that remove a finding) plus the first two `soften` rulings in unit order. There were no `proven` rulings. All 7 are in `phase-3d-data/task10/t10-rulings.json`.

| Unit | Original sentence | V1 ruling | V1's reason |
|---|---|---|---|
| s1 | A packed house is often a family matter before it is a real estate matter, and nobody should be judged for it. | `not_a_claim` | Empathetic, non-judgmental line about the occupant; states no fact, figure, frequency or legal rule. |
| s6 | None of them is wrong for everyone, and most of them have nothing to do with Twin Home Buyer. | `not_a_claim` | Describes the section's own list of options and says no route fits everyone; states no fact, figure or legal rule and makes no THB claim beyond the brief's honest-options structure. |
| s8 | A house full of belongings is hard enough without finding out halfway through that nobody checked who could sign. | `not_a_claim` | Empathetic, hypothetical line about a stalled sale; states no fact, figure, frequency or legal rule; "nobody" is rhetorical. |
| faq | Not always. | `soften` | An unsupported frequency phrase, not a statistic; "It depends on..." says the same without implying a rule. |
| s1 | Getting clear early usually creates more options, not fewer. | `soften` | Unsupported frequency word, not a statistic and not a legal rule; "can keep more options open" would do. |

Notes for the judge: the s6 sentence contains "most of them have nothing to do with Twin Home Buyer", a quantifier about the section's own options rather than the market, which is why V1 ruled it `not_a_claim`; whether it is a claim about THB is Leo's call. The FAQ's "Not always." was `soften` here but `not_a_claim` in two of the three card-1 context runs, so V1 is not stable on that sentence.

### 6. Should-fix items listed for Leo (non-blocking; 9 open on the final text, 4 declined by the writer)
Open: **s1**: "Getting clear early usually creates more options, not fewer." (V1, twice: an optional finding and a `soften` ruling on the same sentence). **s2**: first-person voice in the opening (Agent 6); the "attorney or title company can confirm" pointer repeated three times (Agent 7); open with the seller's situation rather than a definition (Agent 7). **s4**: "this is often the question that makes people freeze. Many owners think the clutter has to be explained away..." an unsupported frequency and belief claim about owners (V1). **s6**: "The real question is usually not which route is best." (V1 `soften`). **s7**: "The statute doesn't mention hoarding" has no ledger claim (V1, not blocking); "The real question is usually whether the house or the paperwork is the bigger risk to the sale." (V1 `soften`). **faq**: item 4 "Only someone with legal authority to sign." has no ledger claim (Agent 6); light local flavor (Agent 7); item 6 repeats items 2 and 4 (Agent 7).

Declined by the writer, with reasons stored and counted (`studio declines <branch>`): s2 "Title can sit with an individual, a trust, an estate or an LLC. Each one changes who has to agree." and s2 "Most families are not looking for judgment." (both: outside the cited sentences of a V1 fix pass, so changing them would be rejected by code); faq "Not always." (twice, same reason). These are exactly the items a fix-only pass leaves for Leo.

Observations: (1) s1's single sentence appears as two should-fix items (an optional finding and a `soften` item with different keys); (2) should-fix items are never applied automatically: the fix pass changes only cited sentences, so Leo decides on the rest; (3) the "usually" in s6 and s7 is a should-fix, not a block.

Data: `phase-3d-data/task10/` (every agent output by round, V1 rows, rulings, usage, final state). Report script: `scripts/phase3d-task10-report.mts`.

## Edit pass on the Task 10 should-fix items (2026-10-13): five of six units relocked, s7 waiting on Leo

Leo's decisions on the should-fix items were applied to branch `54070caa…` as `leo`, exactly as listed, then the changed units were gated through V1 again. **It did not reach HUMAN_REVIEW: s7 is held at `NEEDS_REVISION` by a required Agent 6 finding that would need an edit Leo did not authorize. The article is in DRAFTING.** No proposal, approval, publication or WordPress write. The original article's fingerprint `23f8dd72…4611` was compared before and after every step and never changed.

### How the decisions were applied
- Six units were reopened as `leo` (`studio resolve <branch> <unit> reopen "<Leo's edit>"`) before any relock, for the reason recorded under Task 10 (the article-level revision limit): s1, s2, s4, s6, s7, faq. s3, s5 and s8 were not touched. **The article's revision count is now 2, the limit: any further reopen of this branch is refused until Leo decides.**
- The real writer (Agent 4) applied each edit from Leo's exact wording (the packet's open directive). Before anything was submitted, each writer output was compared with the intended result built independently from the pre-edit version: **s1, s2, s6, s7 and the FAQ matched the intended edit exactly (deep equality of the whole unit)**; s4 matched everywhere except the two sentences Leo asked to be reworded, which contain none of the banned words. No retry was needed.
- Two interpretations, both because Leo's replacement text already contains the surrounding sentence: (a) s6 (item 11): the replacement "The real question is which route fits your situation." replaces both "The real question is usually not which route is best." and the next sentence "It is which route fits your situation.", otherwise the paragraph would say the same thing twice. (b) FAQ item 4 (item 4): the answer became exactly "Whoever has legal authority to sign. An attorney or title company can confirm who that is.", replacing the old trailing pointer "Confirm who can sign with an attorney or title company before you plan anything else." as well, for the same reason. Choices where Leo allowed either: s7 (item 1) the first clause was removed, keeping "A full house is not automatically one of these conditions."; s2 (item 2) the closing note was kept as the one pointer; FAQ item 6 (item 5) was removed, not merged.

### 1. Before and after (every FIX and SOFTEN sentence), checked by text comparison against the pre-edit version

| # | Unit | Before | After |
|---|---|---|---|
| 1 | s7 | The statute doesn't mention hoarding, and a full house is not automatically one of these conditions. | A full house is not automatically one of these conditions. |
| 2 | s2 | (three confirm pointers) "Who that is depends on the documents and the facts, and an attorney or title company can confirm it." / "That depends on the documents and the facts, and it is a question for a real estate attorney or a title company." / the closing note | the first two sentences removed; the closing note kept as the one pointer |
| 3 | s4 | When the house is full, this is often the question that makes people freeze. Many owners think the clutter has to be explained away, or that it might be better not to mention it at all. | When the house is full, this can be the question that makes you freeze. You may feel you have to explain the clutter, or that it would be better not to mention it at all. |
| 4 | faq item 4 | Only someone with legal authority to sign. Confirm who can sign with an attorney or title company before you plan anything else. | Whoever has legal authority to sign. An attorney or title company can confirm who that is. |
| 5 | faq item 6 | "What are my realistic options for a packed or hoarded house?" with its five-sentence answer | removed (the FAQ has five items) |
| 10 | s1 | Getting clear early usually creates more options, not fewer. | Getting clear early can keep more options open. (handled once) |
| 11 | s6 | The real question is usually not which route is best. It is which route fits your situation. | The real question is which route fits your situation. |
| 12 | s7 | The real question is usually whether the house or the paperwork is the bigger risk to the sale. | The real question is whether the house or the paperwork is the bigger risk to the sale. |

**KEEP and LEAVE, checked by text comparison with the pre-edit version: all unchanged.** Item 6 (s6 "None of them is wrong for everyone, and most of them have nothing to do with Twin Home Buyer."), item 7 (FAQ "Not always."), item 8 (s2 "Title can sit with an individual, a trust, an estate or an LLC. Each one changes who has to agree."), item 9 (s2 "Most families are not looking for judgment."), item 13 (s2's first-person opening "Before cleanout, before price, before anything else, I ask one question." and the opening paragraph's first sentence) and item 14 (the FAQ's local wording, "Ask the city or county whether any notice is open.") are all present word for word. s3, s5 and s8 are byte-identical (same content hash). Nothing else in any edited unit changed: the only removed or added sentences are the ones in the table.

### 2. Final version and V1's result on each changed unit
V1 (1.2.1, same dispatch prompt as before, changed-sentence scope) returned **PASS with no findings, no hedge rulings pending, on the exact edited version of all six units** (must-fix 0, should-fix 0). Agent 6 and Agent 7 then reviewed the five relocked units:

| Unit | Locked version | V1 | Agent 6 | Agent 7 |
|---|---|---|---|---|
| s1 | v5 `42a6cc0df835` | PASS | PASS | PASS (78) |
| s2 | v5 `0157370ba4ea` | PASS | PASS | PASS (80) |
| s4 | v4 `9e2884cd2271` | PASS | PASS | PASS (75) |
| s6 | v5 `aa9761273e58` | PASS | PASS | PASS (77) |
| faq | v5 `625b8fe417d9` | PASS | PASS | PASS (73) |
| **s7** | v6 `c543a2bd937f`, **not locked** | PASS | **REVISION** (required, `seo:direct-answer-not-first`) | not run |

**There is no final article version to send to Juan yet** (the article is assembled only when every unit is locked). The last assembled version, before this pass, is `81de13358a74`; it is superseded by these edits.

**The blocker (s7):** Agent 6 requires the opening to name the three causes in its first sentence ("Change the opening so the first sentence answers directly, for example by naming the three causes … then keep the house-versus-paperwork framing after it"). The opening paragraph has the same structure as the one Agent 6 passed in Phase 3c and carried through Task 10 (the carried pass came from the earlier review); the only change is that "usually" is gone. So this looks like reviewer variance, not a result of Leo's edit. The classic loop would send it to the writer, which would restructure the opening: an edit Leo did not authorize. A required finding cannot be declined in code. **Options for Leo:** (a) authorize the writer to restructure the s7 opening as Agent 6 asks; (b) give an exact replacement opening for s7 as a directive (`resolve … request_revision`), which V1 and Agents 6 and 7 then review; (c) keep the s7 text as edited and accept Agent 6's finding as a documented disagreement (needs a code or process decision: required findings cannot be declined today). Note a writer run for s7 is already queued by the plan step and was deliberately not dispatched.

### 3. Card 1 in its FAQ context as a regression test
It is runnable: `npm run calibrate-context` (setup, dispatch the real V1 on each packet, `studio submit-dir`, verify). It now records **Leo's verdict B unchanged**, V1's reason (the nearby role list) and the documented exception in `scripts/fixtures/leo-v1-cards.ts` (`documentedException`, approved by Leo 2026-10-13), and its verify step reports whether the exception still holds. Four Vitest tests pin the record (verdict stays B; exception recorded with the role-list reason, approver and evidence; only card 1 carries one; the live command exists). **Re-run results (real V1): card 1 in context must-fix in 3 of 3 runs: the documented exception holds. The four adversarial fixtures: 4 of 4 caught** (legal claim blocked, local fact blocked, seller anecdote blocked on privacy, generalization sent back with a `reword` ruling). Vitest, tsc and eslint pass.

### 4. Tokens
Task 10 as reported: 912,687 tokens across all categories, 421,059 excluding cache reads (measured from the session transcripts); no savings percentage is claimed. This pass, separately: **edit pass 23 agents (6 writer, 6 V1, 6 Agent 6, 5 Agent 7): 1,077,675 all categories, 515,483 excluding cache reads, 5.8 minutes**; **regression tests 7 V1 runs: 419,695 all categories, 180,446 excluding cache reads**. Output tokens are a lower bound (see the evidence audit). 23 runs for six one- or two-sentence edits is a data point about how many agents a small edit costs in this loop: V1 reviewed and found nothing, and four fifths of the tokens are the packet and the agent file being read again each run.

### 5. Three statuses
- **Technically gated:** partial. Five of the six changed units are V1-passed on their exact locked versions, Agent 6 and 7 passed. s7 is V1-passed on its edited version but not locked (Agent 6 required finding). Article not assembled, not at HUMAN_REVIEW.
- **Editorially approved (pending Juan):** not claimed. Nothing has gone to Juan; there is no final version yet.
- **Unattended:** not shown. This pass was driven by the operator by hand, needed Leo's decisions as input, and ended on a decision only Leo can make.

### 6. Original fingerprint
Unchanged: checked before the pass, after every reopen, after every round and after the cleanups.

Data: `phase-3d-data/edit-pass/` (every agent output, the intended edits, the before/after comparison, usage, regression results).

## Open for Leo
One decision blocks closing 3d: s7 (Agent 6 requires restructuring the opening; see the edit-pass section, options a, b and c). After that the assembled article version can go to Juan. The should-fix items Leo left alone (items 13 and 14, the first-person opening and the FAQ's light local wording, plus the items under KEEP) stay listed for Juan's review.
