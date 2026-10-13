# Phase 3e stage 5: calibration with the real V1 (prompt 1.3.0), fixtures only (2026-10-13)

Real V1 (the `thb-v1-fact-privacy` subagent) on fixture articles; no real article touched; original fingerprint v2 unchanged (`23f8dd72…4611`). Fixture rows removed after each run.

| Test | Result |
|---|---|
| 10 blind cards | **9/10** (needed 8). Cards 2 and 9 must-fix (met), card 8 should-fix (met). Card 1: must-fix, the documented exception (Leo, 2026-10-13); same result as in 3d. |
| Card 1 in its FAQ context, 3 runs | must-fix **3 of 3**: the documented exception holds. V1 also ruled the absence sentence `drop` and found the missing threshold in all three runs. |
| 4 adversarial fixtures | **4/4 caught**: legal claim (BLOCKED_CLAIM), generalization (REVISION, ruling `drop`), seller anecdote (BLOCKED_PRIVACY), local fact (BLOCKED_CLAIM). First run of local-fact never reached V1: the new decider check sent the fixture's own base text back (a genuine finding on its old closed wording); the fixture base was corrected and the case re-run: caught. |
| 3 real misses (bad + control) | absence sentence **caught** (REVISION, ruling `drop`); flat rule without the threshold **caught** (REVISION, clm:1 and clm:8 BROADER / reader impact changes); closed decider list that evades the code **caught** (REVISION); the exact old closed list caught by **code alone** (no agent). Controls: s7 **PASS**; **s3 FALSE ALARM** (REVISION on "The local enforcement authority" as the decider, which no cited claim supports). |
| Agent 2 and R1 dry run on the three stored prints | Both produced correct, fully recorded claims; verbatim quotes (including one across a page break) and recheck dates passed. The production checks refused both outputs on one rule: a gate marked both "stated in the claim" and "carried by" another claim (5 claims in Agent 2's output, 1 in R1's). Agent 2 left the absence claim unsupported and asked Leo for the 1102.2, 1102.3 and form prints. |
| Tokens | 24 agent runs: **1,549,257 all categories; 612,364 without cache reads** (see tokens.txt). V1 about 59k per card run; the real-miss runs about 76k (longer units). |
