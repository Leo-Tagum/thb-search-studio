# Phase 3c evidence audit: 21 questions

Read-only audit of the Phase 3c comparison report (`phase-3c-comparison.md`) and the decisions built on it. Nothing in the live database, the articles or the code was changed to produce it. Priority order as set by Leo: P0 (Q1, 4, 5, 6, 8, 20), P1 (Q2, 3, 7, 9, 10, 15, 16, 18, 19), P2 (Q11, 12, 13, 14, 21); Q17 is a one-line check and comes last.

**Written for Leo.** Status values: Verified, Partially verified, Estimated, Unverified, Contradicted. Every number below was recomputed from the database (read-only), the committed judging data in `phase-3c-data/` or the stored session transcripts, and says which.

## What turned up that changes the picture

1. **A real usage source exists and the report's token figures are about 5x too low.** Claude Code stores per-turn token usage (input, cache creation, cache read, output) for every subagent in its session transcripts under `~/.claude/projects/<project>/<session>/subagents/`. Measured, the team revision processed **5.58M tokens** (report: 1.04M estimated), the classic revision **1.69M** (report: 329k) and the classic draft **3.20M** (report: 495k). The ratio team : classic revision is **3.3x** measured against 3.1x estimated, so the conclusion on cost holds; the absolute numbers, and the hybrid projection built on them, do not. (Q2, Q12, Q14, Q21)
2. **The V1-on-classic follow-up was not run under the same instructions as the team's V1.** The 18 V1 runs on classic and classic-revised text were told to "quote the exact words of any sentence you flag"; none of the 27 team V1 runs was. That affects how many V1 findings carry a quotable sentence and so the comparison in section 7.1. (Q10)
3. **The report's own numbers mostly check out.** Run counts, tickets, declines, blind-score averages and mappings all recompute exactly. The weak spots are how the numbers were produced (an agent judged the 39 of 50, an agent compiled the 45 declines) and what they were compared with (56 runs is the whole classic draft, 110 only the revision). (Q1, Q4, Q5, Q6)
4. **Nothing in the repo records a kill-and-resume test**, and the writer's version insert and state save are separate calls. (Q18)

## Status at a glance

| Q | Priority | Claim (short) | Status |
|---|---|---|---|
| 1 | P0 | 110 runs vs 56 | Verified (counts); the comparison is not like for like |
| 4 | P0 | Declines recorded: 0 of 45 | Verified (0); the 45 is an agent's compilation and mixes two kinds of item |
| 5 | P0 | 39 of 50 addressed | Partially verified (agent judged; 5-item sample below) |
| 6 | P0 | Blind score 67.8 vs 65.7 | Verified (recomputed; mappings present) |
| 8 | P0 | Rewrites added overstatements | Partially verified (one of the three phrases came from the classic draft) |
| 20 | P0 | V1's must-fix items are real | Unverified until Leo judges the 10 cards |
| 2 | P1 | About 1.04M tokens | Contradicted as an absolute figure (measured 5.58M); ratio holds |
| 3 | P1 | 23 tickets, all QUALITY_CORRECTION | Verified (plus 1 budget escalation) |
| 7 | P1 | Reviewers contradicted in 3 units | Verified |
| 9 | P1 | Cross-team tickets never fired | Verified for every non-fixture run |
| 10 | P1 | Operator stepped outside the packet once | Partially verified (more additions found) |
| 15 | P1 | Models and effort | Verified (all sonnet 5.5, medium) |
| 16 | P1 | No different model in the runs | Verified |
| 18 | P1 | Durable state and resume | Partially verified (reload tested; kill-mid-section untested) |
| 19 | P1 | Claims table fields | Verified (no geography or scope fields) |
| 11 | P2 | Main chat reached about 237k tokens | Partially verified (228k at run start, 493k at run end) |
| 12 | P2 | About 92% of tokens were input | Estimated; measured input side is between 98.5% and 99.6% |
| 13 | P2 | Packet order | Verified |
| 14 | P2 | Cache-read figures | Available (from transcripts) |
| 21 | P2 | Hybrid about 58 runs / 515k tokens | Estimated; Task 10 will measure it |
| 17 | - | branch claude/confident-franklin-59shyd, Stop-hook loop | Verified absent |

---

## P0

### Q1. 110 runs vs 56

- **Claim:** The team revision took 110 agent runs against 56 for classic; fair comparison is classic revision 37 vs team revision 110.
- **Evidence:** `agent_runs` (read-only query, grouped by `subject_id` and `agent_key`); session transcripts `f341c740` (classic draft) and `955319e9` (revision runs).
- **Method:** Counted `agent_runs` per article id. Cross-checked against the subagent dispatches in the transcripts, which count retries that the database does not.
- **Result:** | Article | Runs (DB) | By agent | What it covers |
|---|---|---|---|
| Original `e2b915e3…` | **56** | Agent 4 20, Agent 5 13, Agent 6 12, Agent 7 11 | the **whole classic draft** of 9 units, including the revisions the classic loop made while drafting |
| Team branch `d7f03fff…` | **110** | W1 26, W2 9, V1 25, V2 25, V3 25 | the **revision only**, starting from the finished classic text |
| Classic-revision branch `54070caa…` | **37** | Agent 4 10, 5 9, 6 9, 7 9 | the **revision only**, same 9 units, same 50 findings |

All runs are `SUBMITTED`. The transcripts show 115 team dispatches and 38 classic-revision dispatches: 5 and 1 retries after a rejected output, which the database folds into the run.

The 56 covers full classic drafting, so **56 vs 110 is not like for like**: it compares a draft with a revision. The fair pair is **37 vs 110** (both revisions of the same text with the same findings): a factor of **2.97 in runs**, **3.30 in measured tokens** (Q2). Per agent the two are close (team 48.6k, classic revision 44.5k measured tokens per dispatch), so the gap is the number of runs, not the size of each.
- **Status:** **Verified (the counts). The report states what each number covers; the headline comparison of 110 with 56 is misleading and the table 7.4 pair (37 vs 110) is the right one.**
- **Limitation:** 37 runs is a floor for the classic revision: Agents 5, 6 and 7 passed all 27 reviews first time, so there were no review loops. A classic revision where reviewers return REVISION would cost more. The classic revision also ran its nine units in parallel; the team revision ran one role at a time (87.4 min first to last agent against 7.8 min).
- **Implication:** Quote 37 vs 110 (about 3x) and never 56 vs 110. The hybrid projection should be built from the classic revision, as it was, and measured in Task 10.


### Q4. Declines recorded: 0 of 45

- **Claim:** The loop's `declined` field stayed at 0; the writer made 45 declines or partial declines in its notes (report section 4, bug 6.1).
- **Evidence:** `article_sections.issues.team.collected` and `.declines` for the nine units of `d7f03fff…` (live, read-only); `phase-3c-data/2-findings-and-declines/per-unit-checks/w1-notes-all.json` (26 W1 notes) and `out/declines.json` (the compiled list).
- **Method:** Read every section's stored team state; counted collected items, items with a `declined` value, and the new Phase 3d `declines` list. Counted the rows of report section 4 and checked each entry's pass number and unit against the 26 stored notes.
- **Result:** - Database: **39 collected items, 0 declined, 0 in `declines`** (that field did not exist at the time of the run). Verified.
- Section 4 of the report has **45 rows: 30 against reviewer findings, 15 against co-writer (W2) suggestions**. All 45 match a real W1 note by pass number and unit (45 of 45); in 44 of 45 the item's own words appear in that note.
- `out/declines.json` says `count: 43` while its list holds 45 entries: the extractor's own count is 2 below the list. The report uses 45.
- W2 suggestions are not loop items, so they could never have been "recorded as declined". The accurate statement is **0 recorded of 30 reviewer-item declines**, plus 15 W2 suggestions the loop has no field for.
- **Status:** **Verified for the 0. Partially verified for the 45: the compilation was made by a general-purpose agent reading the 26 notes, and only its structure and the match to the notes were checked here, not whether it found every decline.**
- **Limitation:** The 45 includes entries the writer itself marks partial or 'already resolved', and some reversed later (FAQ opener). Nobody read the 26 notes end to end for this audit.
- **Implication:** The bug is real and fixed in Phase 3d (declines stored per unit, counted once on re-raise). When quoting the figure say 0 of 30 reviewer-item declines (15 more were W2 suggestions).


### Q5. 39 of 50 addressed

- **Claim:** Judged on the text, 39 of the 50 seeded findings are fully addressed, 2 partly, 0 not, 9 declined.
- **Evidence:** `phase-3c-data/2-findings-and-declines/` (`findings.json`, `per-unit-checks/*.json` inputs, `out/*.json` verdicts, `verdicts.json`); dispatch prompts in transcript `955319e9`.
- **Method:** Read how the verdicts were produced (dispatch prompts, agent type), then drew **5 findings at random** (seed 20261012) and pulled the classic paragraph and the team paragraph for each.
- **Result:** **Who judged: an agent, not a person.** Nine `general-purpose` subagents (model `sonnet`, one per unit) each read the unit's findings, the classic text, the team's final text and the writer's change notes and returned a verdict per finding, with a quote. Nobody has checked the 50 verdicts by hand. The per-unit counts in `verdicts.json` add up to 39 / 2 / 0 / 9 = 50.

The checker's own `declined` bucket includes findings that asked for no change (sample finding 3 below says 'no change is needed'), so '9 declined' is partly 'finding needed nothing'.

Five random findings for Leo to check against the text (the 'after' paragraph is the one the checker quoted):

**Finding 1 (s1, raised by V1) — checker's verdict: addressed**

- Finding: Soft population claims with no source: 'Most people in this spot are not avoiding the problem' and 'Most owners want to know how fast the house can be emptied'. They are voice, not law or figures, so they do not block. The writer may soften them (for example 'Many people') if convenient.
- Checker's reason: Both 'Most people' and 'Most owners' claims were real in the classic text; the final removes the first and recasts the second as a non-population statement.
- Before (classic text, paragraph that holds the issue):
> Most owners want to know how fast the house can be emptied. The real question is usually what situation you are actually in. I'd want five things answered first:
- After (team's final text, paragraph the checker pointed at; quote found in the text: yes):
> How fast the house can be emptied is the question that feels urgent. The one that decides things is what situation you are in. I'd want these answered first, because each one changes what you can do:

**Finding 3 (s1, raised by V2) — checker's verdict: declined**

- Finding: The H2 says 'packed or hoarded house' rather than the exact phrase 'hoarded house'. This reads naturally and the exact keyword is in the title and capsule, so no change is needed. The one-question-H2 keyword placement can be met by this H2 or a later one.
- Checker's reason: The H2 variant was visible in the classic and is unchanged in the final; the finding itself said no change needed and the writer note keeps it with a reason.
- Before (classic text, paragraph that holds the issue):
> ## What should you know first about a packed or hoarded house before you sell?
- After (team's final text, paragraph the checker pointed at; quote found in the text: yes):
> ## What should you know first about a packed or hoarded house before you sell?

**Finding 4 (s1, raised by V3) — checker's verdict: addressed**

- Finding: The last body paragraph repeats the capsule's disclosure sentence almost word for word ('For a transfer by sale of single-family residential property, California's disclosure article applies, except as provided in Civil Code Section 1102.2. Any waiver of its requirements is void.'). If the capsule is shown next to the body, the repeat reads as padding. Consider a shorter body line such as 'The disclosure rules in the capsule above do not change with your answers. Plan to disclose, not to skip it.' Keep every legal wording unchanged.
- Checker's reason: The classic body repeated the capsule's disclosure sentence nearly verbatim; the final body paragraph now points back to the capsule instead of repeating it.
- Before (classic text, paragraph that holds the issue):
> One thing does not depend on your answers. For a transfer by sale of single-family residential property, California's disclosure article applies, except as provided in Civil Code Section 1102.2. Any waiver of its requirements is void. Plan to disclose, not to skip it. What goes on the form is a question for your agent or attorney, and a later section covers it.
- After (team's final text, paragraph the checker pointed at; quote found in the text: yes):
> The disclosure rules in the capsule above do not change with your answers. A sale of single-family residential property uses the Real Estate Transfer Disclosure Statement form, so plan to disclose, not to skip it. What goes on the form is a question for your agent or attorney, and a later section covers it.

**Finding 27 (s5, raised by V2) — checker's verdict: addressed**

- Finding: The first sentence says the disclosure rules 'apply to your sale' without the single-family exception. The qualifier ('except as the law provides') appears in the later paragraph, so a quoted opening could read as broader than clm:6. Consider adding 'if your sale is covered' to the first sentence. This does not block.
- Checker's reason: The issue was real in classic (opening said rules 'apply to your sale' without the exception); the final opening now adds the coverage qualifier.
- Before (classic text, paragraph that holds the issue):
> Clearing the house does not turn the disclosure paperwork into something optional. The disclosure rules apply to a sale of single-family residential property, except as the law provides. The disclosures are made on a copy of the Real Estate Transfer Disclosure Statement form. A waiver of the requirements is void as against public policy. So do not treat a cleanout as a way to avoid the form, and do not agree with anyone to skip it.
- After (team's final text, paragraph the checker pointed at; quote found in the text: yes):
> Clearing the house out is your choice, and it does not change the disclosure rules if your sale is covered by them. The harder question is whether you can start at all. When every room is full, the first step can feel out of reach. That does not mean the house cannot be sold.

**Finding 36 (s6, raised by V3) — checker's verdict: addressed**

- Finding: 'Getting these answers early usually creates more options, not fewer.' is nearly word for word the voice reference line v10. It is fine on Juan's own site, but consider varying it so the section does not read as lifted.
- Checker's reason: The echo of voice reference v10 is gone; the closing line is reworded and no longer near word for word.
- Before (classic text, paragraph that holds the issue):
> This is less a route than a step before any route. An attorney can speak to authority, probate and disclosure questions. A title company can speak to liens and title. A CPA can speak to taxes. The city or county can tell you whether any enforcement action exists on the property. Getting these answers early usually creates more options, not fewer.
- After (team's final text, paragraph the checker pointed at; quote found in the text: yes):
> This is less a route than a step before any route. An attorney can speak to authority, probate and disclosure questions. A title company can speak to liens and title. A CPA can speak to taxes. The city or county can tell you whether any enforcement action exists on the property. Asking these questions early can keep more of your options open.

- **Status:** **Partially verified (arithmetic and structure verified; the verdicts are one model's reading, unreviewed by a person).**
- **Limitation:** The paragraph matcher is mechanical: it shows the paragraph that best overlaps the finding. A rewrite that moved a sentence elsewhere would show as 'after' text that looks unrelated.
- **Implication:** Treat 39 of 50 as 'an agent reads the text as having addressed 39'. If Leo's five checks disagree with the verdicts, the 50 need a second pass before any of the 39 is used as evidence.


### Q6. Blind score 67.8 vs 65.7

- **Claim:** Team 67.8 vs classic-revised 65.7 over two rounds with the labels swapped; first comparison team 68.8 vs unrevised classic 65.6.
- **Evidence:** `phase-3c-data/1-blind-original-vs-team/` (`mapping.json`, `judge-texts-and-scores/out/*.json`) and `5-blind-classic-revised-vs-team/` (`mapping-round-1.json`, `round-1/out`, `round-2-labels-swapped/out`, texts for both rounds).
- **Method:** Recomputed every average from the nine raw judge JSON files per round, applying the A/B mapping; compared the judge's own `preferred` field with the report; checked that every round-2 text is the round-1 text with the label swapped.
- **Result:** | | Report | Recomputed from raw files |
|---|---|---|
| Comparison 1: classic / team | 65.6 / 68.8 | **65.56 / 68.78** |
| Comparison 2, round 1: classic-revised / team | 65.9 / 68.0 | **65.89 / 68.00** |
| Round 2 (labels swapped) | 65.4 / 67.6 | **65.44 / 67.56** |
| Combined (18 scores each) | 65.7 / 67.8, difference 2.1 | **65.67 / 67.78, difference 2.11** |
| Preferences, round 1 | classic-revised 4, team 4, tie 1 | **4 / 4 / 1** (judge's `preferred` field) |
| Preferences, round 2 | classic-revised 3, team 6 | **3 / 6** |
| Same preference in both rounds | 4 of 9 | **4 of 9** |

The mappings are committed. Round 2 has no mapping file of its own: it is round 1's mapping swapped, and all 18 round-2 texts are byte-identical to the round-1 texts with the labels exchanged. Counting by the higher score instead of the judge's stated preference gives 3 / 5 / 1 in round 1 (unit s3 scored 72 / 72 and the judge named classic-revised): a matter of definition, not a discrepancy.
- **Status:** **Verified.**
- **Limitation:** The judge is the same model family as the writers (`sonnet`, one call per unit, both texts in one prompt). Swapping labels moved scores by 2 to 3 points and flipped 5 of 9 preferences, so a 2.1-point gap is inside the noise. 'Blind' covers labels only: the two versions differ in layout habits a careful reader could recognize.
- **Implication:** The numbers can be trusted as numbers. The conclusion stays 'no reliable editorial difference', which the report already says.


### Q8. Rewrites added overstatements

- **Claim:** Many V1 revisions were caused by the rewrite itself: 'Generally yes' and 'Not always.' in the FAQ, 'That route is closed' in s4.
- **Evidence:** `section_versions` (every version of the nine units, with `created_by`, `agent_run_id`, `reason`) and `section_reviews` for `d7f03fff…`; `classic-text.json` for the classic draft.
- **Method:** Searched every stored version of the team branch and the classic text for each phrase; took the first version that contains it, its author and its change reason.
- **Result:** | Phrase | Where it first appears | Written by | Why it was written |
|---|---|---|---|
| **'Generally yes'** | FAQ **v2**, 19:32:43 (not in the classic text) | W1 (`thb-w1-writer`) | change reason: item 1 'now opens with Generally yes' to give a direct answer, as V2 and V3 had asked for answer-first openings. V1 first passed it with an optional note (19:40:02) and only later required a flat 'Yes' to be re-qualified (19:45:49). |
| **'Not always.'** | **already in the classic FAQ draft** (so in FAQ v1 of the branch, a copy, 18:19:33); W1 re-introduced it in v5 (19:41:10) and v7 (19:46:54) | the classic draft (writer stage of the original run); the re-introductions: W1 | V3 asked for it in the voice-reference rhythm (optional 19:37:29, then 'lead with the honest short answer' required 19:40:12); V1 required it removed (hedge flag 19:34:40, again 19:42:53 and 19:48:42) |
| **'That route is closed'** | s4 **v4**, 18:54:06 (not in the classic text) | W1 | change reason (ticket T7): 'section now opens with the seller's worry', the rewrite V3 required at 18:53:10; V2 flagged the phrase as not self-contained (18:55:47) and V3 as repeated three times (18:55:51) |

So the report's wording is right for two of the three: the rewrite introduced 'Generally yes' and 'That route is closed'. **'Not always.' is older than the rewrite**: it is in the classic draft (and classic Agent 5 passed that FAQ in the end, report 7.1), and the team's W1 brought it back twice because V3 demanded it.
- **Status:** **Partially verified (two of three confirmed as rewrite-introduced; one traces to the classic draft).**
- **Limitation:** 'Written by' is the agent that produced the version; the demand often came from a reviewer. The audit did not judge whether each phrase is a true overstatement; V1 did, and V1 is one model's judgment.
- **Implication:** Reword the claim: rewrites can introduce overstatements, and reviewer demands (V3's voice requests against V1's fact rule) are what drove two of them. That supports the 6.2 proposal (V1 first) more than a writer fault.


### Q20. Are V1's must-fix items real? (for Leo to judge, blind)

- **Claim:** V1's must-fix cards are real defects, not overreach. The hybrid decision leans on this: V1 found 15 must-fix on classic text that Agent 5 passed, and still 7 after the classic revision.
- **Evidence:** `phase-3c-data/3-v1-on-classic-text/`, `4-v1-on-classic-revised-text/` and the stored V1 reviews of the team run (`section_reviews`, `d7f03fff…`).
- **Method:** Collected every V1 must-fix (required finding) and every reword/drop ruling whose quoted sentence can be located in the text V1 saw; removed questions and sentences where V1's reason is about another sentence; removed duplicates; drew 10 at random from all of them (seed 20261012) and shuffled. Labels, units, versions and the pipeline are removed. The key is **not in this repository**: it is in a local, git-ignored file (`docs/phases/_private/q20-key.json`) that I will hand over only after Leo has judged. Its SHA-256, so it cannot be altered afterwards: `be08ec91dd044e10cd70fedfc663a92d06839de55507f2ef810145076c5761c3`.
- **Result:** **For each card, please answer one of:** **A**: a real problem that must be fixed; **B**: a real but minor point (should-fix, not a must-fix); **C**: not a problem (V1 overreached). A one-line reason helps.

**Card 1**

- Sentence: Living in the house alone does not give you that authority.
- V1's ruling: MUST FIX (V1 required finding)
- V1's reason: Item 4 states a legal conclusion with no ledger claim: "Living in the house alone does not give you that authority." The brief only supports that a sale can stall when the person living in the house is not the person with authority. Soften to what the brief supports.

**Card 2**

- Sentence: Trash or signs of pests are another, and they match conditions the statute lists.
- V1's ruling: MUST FIX (V1 required finding)
- V1's reason: Bullet 1: "Trash or signs of pests are another, and they match conditions the statute lists." The statute (clm:1, clm:2) lists an accumulation that constitutes fire, health or safety hazards, and infestation as determined by a health officer. Trash or signs of pests are not the same thing, so 'match' turns a conditional listing decided by an official into a flat equivalence. Change 'they match conditions the statute lists' to wording such as 'they can resemble conditions the statute lists, and whether a home meets them is for the official to decide'.

**Card 3**

- Sentence: Most families are not looking for judgment.
- V1's ruling: MUST FIX (V1 required finding)
- V1's reason: The sentence "Most families are not looking for judgment." is a generalization about families that no ledger claim or stored source supports. Reword to what the text can stand on, for example speaking to this reader only ("You are probably looking for time and a clear next step.") or drop it.

**Card 4**

- Sentence: The real question is usually whether the house or the paperwork is the bigger risk to the sale.
- V1's ruling: MUST FIX (V1 required finding)
- V1's reason: "The real question is usually whether the house or the paperwork is the bigger risk to the sale." and "Some of it comes from the house. A lot of it comes from the paperwork and the people." are generalizations about how sales stall in general. No ledger claim or source passage supports them (the brief only lists these as things that can stall a sale, with no frequency or proportion). Reword to say these are things that can stall a sale, with no 'usually' and no 'a lot of it'.

**Card 5**

- Sentence: The real question is usually not which route is best.
- V1's ruling: MUST FIX (V1 required finding)
- V1's reason: Sentence 'The real question is usually not which route is best.' states a generalization about what sellers ask, with no support. Remove 'usually' or reword to 'The real question is which route fits your situation.'

**Card 6**

- Sentence: Most people in this spot are not avoiding the problem.
- V1's ruling: MUST FIX (V1 required finding)
- V1's reason: "Most people in this spot are not avoiding the problem." is a claim about what most people do or feel; no ledger claim or source supports it. Reword to a non-statistical statement or drop.

**Card 7**

- Sentence: Spending first can commit you to a plan the right person never agreed to.
- V1's ruling: MUST FIX (V1 required finding)
- V1's reason: Flagged sentence 'Spending first can commit you to a plan the right person never agreed to.' No ledger claim or stored passage supports it, and wording alone cannot prove it. Replace 'never agreed to' with a plain conditional, for example 'did not agree to'. Everything else in the unit was checked: no statement of law, figure, date, price, count or brand fact is made without support; privacy and legal qualification are fine.

**Card 8**

- Sentence: Only someone with legal authority to sign.
- V1's ruling: MUST FIX (V1 required finding)
- V1's reason: FAQ item 4 (Who can sell the house...) states law with no cited claim: 'Only someone with legal authority to sign' and 'Living in the house alone does not give you that authority.' The second sentence is a legal conclusion stated as certain; no ledger claim supports it (the brief only says the sale can stall when the occupant is not the person with authority). The list 'owner, a trustee, an executor or administrator, or several heirs who agree' is likewise uncited. Reword to non-certain wording, for example that a sale can stall when the person living in the house is not the person with authority to sign, and that who has authority is a question for an attorney or title company.

**Card 9**

- Sentence: Whoever has legal authority to sign, such as an owner, trustee, executor, administrator, surviving spouse or several heirs acting together.
- V1's ruling: MUST FIX (V1 required finding)
- V1's reason: Item 4 lists 'an owner, trustee, executor, administrator, surviving spouse or several heirs acting together' as who has authority to sign. No ledger claim supports this uncited statement of probate and trust law, and the brief says the guide states no specific probate or trust rules. Remove the list and say only that who holds authority is for an attorney or title company to confirm.

**Card 10**

- Sentence: A house full of belongings is hard enough without finding out halfway through that nobody checked who could sign.
- V1's ruling: MUST FIX (V1 required finding)
- V1's reason: "A house full of belongings is hard enough without finding out halfway through that nobody checked who could sign." Flagged generalization, no ledger support. Reword to a plain hypothetical, e.g. finding out halfway through that the person selling could not sign.

- **Status:** **Unverified until Leo has judged the cards.**
- **Limitation:** Ten cards is a small sample. The pool is not proportional to the three sources (the instructions given to V1 differed between runs, see Q10, so some sources contribute more quotable sentences). V1's reason sometimes cites another sentence of the same unit or a claim id; those were left in as V1 wrote them. Three cards touch the same FAQ item; that is how the draw fell.
- **Implication:** If most cards are A, V1's must-fix rate is evidence against classic's fact gate. If many are C, the hybrid's V1 gate would send writers to fix non-problems and the 7 remaining must-fix items need a second reading before Task 10.



---

## P1

### Q2. About 1.04M tokens

- **Claim:** The team revision used about 1.04M tokens, 3.1x the classic revision's 329k (characters / 4).
- **Evidence:** `phase-3c-data/6-usage-and-team-run/usage-classic-and-team.json`, `usage-classic-revised.json`; stored per-turn usage in the subagent transcripts (`~/.claude/projects/<project>/<session>/subagents/*.jsonl`, 290 stored subagent transcripts read); four V1 runs of this session as a calibration.
- **Method:** Read how the estimate was built (characters of the stored packet plus output, divided by 4). Then summed the real per-turn `usage` (input, cache creation, cache read, output) of every subagent in the same phases, taking the last record per API message.
- **Result:** The estimate counted only the stored task packet and the stored output. It left out what every dispatch also costs: the system prompt and tool definitions, the agent file, the dispatch prompt, the packet read through the Read tool, and every later turn that re-reads the conversation (cache reads).

| Phase | Agents | Estimated (report) | **Measured, all categories** | Measured, without cache reads (input + cache creation + output) | Measured per agent |
|---|---|---|---|---|---|
| Classic draft | 56 | 495k | **3,195,954** | 1,295,389 | 57,070 |
| Classic revision | 38 | 329k | **1,690,800** | 791,901 | 44,494 |
| Team revision | 115 | 1,037k | **5,583,997** | 2,284,077 | 48,556 |

The estimate is **5.1x to 6.5x too low** in absolute terms. Ratios survive: team : classic revision is **3.30** measured (2.88 without cache reads) against 3.15 estimated. Calibration on four V1 runs of this session: estimate 6.8k to 7.8k each, reported by the harness 24.0k to 26.0k each, about 3.4x.

Real usage is therefore available, for every run, from the session transcripts (not from `/cost`).
- **Status:** **Contradicted as an absolute figure; Verified as a ratio.**
- **Limitation:** Transcripts store the output-token count of each API message as it was first streamed, which under-reports tool-call output (a 2k-token Write shows as 6). Output is therefore a lower bound; it is under 2% of the total either way. 'All categories' re-counts the conversation on every turn, so it is not billed tokens, and billing weights cache reads, cache writes and fresh input differently. The audit prices nothing.
- **Implication:** Every token figure in the report, and the hybrid projection (Q21), should be restated from measured usage. Task 10 reports measured usage from the transcripts next to the old estimate method.


### Q3. 23 tickets, all QUALITY_CORRECTION

- **Claim:** The team run raised 23 tickets, all QUALITY_CORRECTION, closed in round 1; one escalation (the budget stop).
- **Evidence:** `tickets` for `d7f03fff…` (live, read-only); the 105 surviving V1/V2/V3/W1 output files of the run (`955319e9` scratchpad).
- **Method:** Counted tickets by type, sender and recipient; counted every card and ticket in the stored role outputs.
- **Result:** `tickets`: **24 rows = 23 QUALITY_CORRECTION + 1 HUMAN_ESCALATION** (`ORCHESTRATOR` to `LEO`, trigger `budget_limit`, at s4). Senders of the 23: V1 12, V2 4, V3 7. All round 1. No other type exists for this article. The surviving role outputs hold 125 cards (V1 22, V2 41, V3 62), every one a QUALITY_CORRECTION to W1, and no W1 output carries a ticket. The report's 132 cards come from before retried outputs overwrote earlier files. The `team_runs` row for this run still says `RUNNING`.
- **Status:** **Verified.**
- **Limitation:** The router log covers tickets, not cards that the combiner merged or dropped.
- **Implication:** Cross-team ticket types are exercised only by the fixtures (Q9).


### Q7. Reviewers contradicted in 3 units

- **Claim:** V1, V2 and V3 gave contradictory corrections in the FAQ, s2 and s4; code kept every V1 card but does not detect contradictions.
- **Evidence:** `section_reviews` of `d7f03fff…` (findings with keys, severities and notes, per review and time).
- **Method:** Listed every review of the three units, picked the opposing findings, quoted them in full.
- **Result:** All three conflicts are in the stored reviews, quoted below. In s4 the opposing demands arrive at the same version within six seconds (V2 optional 'lead with the direct answer', V3 required 'name the worry first'); in the FAQ and s2 they alternate across rounds as W1 follows whoever spoke last.
**FAQ item 2 (the 'Do I have to clean out' answer): V1 against V3 across four rounds**

- **V1** at 19:34:40 (REVISION, required, key `fact:faq:hedge_not_always`):
> FAQ item 2 answer opens 'Not always.' on a 'Do I have to clean out' question. No ledger claim supports it, and it implies a legal duty that sometimes exists. Reword so it answers from the seller's practical choice instead of an implied legal rule.
- **V3** at 19:37:29 (PASS, optional, key `ed:faq-clean-out-opening`):
> Item 2 opens 'That is your choice,' which reads a little flat. The voice reference answers this kind of question with 'Not always.' or 'It depends on...'. Suggested opening: 'Not always. It depends on your time, your money, who has authority to sell and which route you pick.' Keep the rest as is.
- **V3** at 19:40:12 (REVISION, required, key `ed:faq-cleanout-no-direct-answer`):
> Item 2 ('Do I have to clean out a house before selling it?') opens 'It depends on your time, money, who has authority...' and never answers the question the homeowner is asking. Lead with the honest short answer in Juan's rhythm ('Not always.'), then give the reasons. Keep every fact as is; wording only, no as-is or no-cleanout claim.
- **V1** at 19:42:53 (REVISION, required, key `fact:faq:item2:not-always`):
> Item 2 answer still opens 'Not always.' (the writer's note says it was dropped, but it is in the current text). It implies a duty to clean out in some cases, and no ledger claim supports that. Remove the words 'Not always.' and open with 'It depends on your time, money, who has authority to sell and the route you pick.'

**s2 opening: V3 wants the seller's situation first, V2 wants the direct answer first**

- **V3** at 18:35:48 (REVISION, required, key `ed:flat-opening-repeats-itself`):
> The section opens with a flat rule-style paragraph ('The person who holds title, or who has the legal authority to sell for the owner, has to sign. Depending on the situation, that might be an owner, a trustee...') and only then reaches Juan's voice ('Before cleanout, before price... I ask one question'). The same points are then made again three times: the title question, 'It is really the foundation of the sale', and the 'Start with who holds title' h3. The disclaimer is also repeated ('do not read that list as a rule for your house', 'I am not going to tell you which rules apply', and the closing note). Fix: open on the seller's situation (a house full, a parent or relative living in it, the family unsure who decides), then 'the first question I ask is who actually holds title', and keep the list of who may sign in the authority h3 only. Delete 'It sounds like paperwork. It is really the foundation of the sale.' and say the disclaimer once, in the authority h3 or the closing note. Wording only; do not change the list of roles or any fact.
- **V2** at 18:38:40 (REVISION, required, key `seo:direct-answer-missing`):
> The H2 asks 'Who has to sign, and who else is affected?' but the opening paragraph (The house is full. A parent or relative may still live there... the first question I ask is who actually holds title.) sets a scene and does not answer. The answer (the person who holds title or has legal authority to sell for the owner signs; co-owners, heirs, occupants and others may also be affected) only appears two H3s down. Replace or lead the opening with a one or two sentence answer, for example: 'The person who holds title, or who has legal authority to sell for the owner, has to sign. Co-owners, heirs, anyone living in the home and others may also be affected, so find out who holds title first.' Then keep the scene-setting and the qualification that the list is not a rule for your house.

**s4 opening: the same two reviewers at the same version (18:53), then again later**

- **V2** at 18:53:04 (PASS, optional, key `seo:answer-lead-wording`):
> The first paragraph leads with 'California's seller disclosure rules (Civil Code 1102) apply, with an exception...'. It would quote better if the first clause answered the H2 directly, for example 'You make the required disclosures on the Real Estate Transfer Disclosure Statement form.' Then state the applicability and exception. Same claims (clm:5, clm:6), no new facts.
- **V3** at 18:53:10 (REVISION, required, key `ed:s4-statute-first-opening`):
> The section opens with 'California's seller disclosure rules (Civil Code 1102) apply, with an exception...'. That is a statute summary, not the question in the seller's head ('Do I have to tell a buyer about all this?'). Name the worry first in one plain sentence, then give the same cited rule. Keep clm:5/6 wording and the exception unchanged.
- **V2** at 19:09:48 (REVISION, required, key `seo:answer-not-first`):
> The H2 asks what you have to disclose, but the first paragraph (four sentences, 'With a full house, the worry is easy to name... what I would do about the rest.') gives no answer. The answer first appears in the second paragraph. Put a one or two sentence direct answer first, for example that in California a sale of single-family residential property is disclosed on the Real Estate Transfer Disclosure Statement form, the rules have an exception, and a waiver is void, then keep the empathy line after it. Use only clm:5, clm:6, clm:7 wording.

- **Status:** **Verified.**
- **Limitation:** The order of the two V2/V3 reviews of one version is whichever finished first; they did not read each other.
- **Implication:** Supports proposal 6.2: run V1 first, then V2 and V3 on a V1-clean text, and decide a contradiction once instead of looping.


### Q9. Cross-team tickets never fired

- **Claim:** EVIDENCE_REQUEST and ROOT_CAUSE_NOTE never fired on a real article; they fired only in the smoke tests.
- **Evidence:** `tickets` joined to `articles.is_fixture` (live, read-only); `scripts/team-smoke.mts` output from this session (live smoke run at the final code).
- **Method:** Counted tickets by type over every article in the database, split real vs fixture.
- **Result:** **Across every non-fixture article in the database: 23 QUALITY_CORRECTION, 1 HUMAN_ESCALATION, 0 of any other type.** The only non-fixture article with tickets is the team branch; the original and the classic-revision branch (classic mode) have none by design. Fixture articles (deleted by the smokes' cleanup) fired both types: the latest `smoke:team` log lists T4 EVIDENCE_REQUEST V1 to R1, T5 and T6 ROOT_CAUSE_NOTE V2/V3 to S2, T7 EVIDENCE_REQUEST W1 to R3, T8 HUMAN_ESCALATION S2 to LEO (`brief_change`).
- **Status:** **Verified for every non-fixture run.**
- **Limitation:** Fixture rows no longer exist, so the smoke evidence is the test log and the code, not the database.
- **Implication:** One real article is one data point: the two ticket types are proven only by fixtures.


### Q10. The operator stepped outside the packet once

- **Claim:** One s4 prompt carried a sentence of the operator's own guidance (disclosed); nothing else was added.
- **Evidence:** All 209 subagent dispatch prompts of session `955319e9` (stored transcript); the task packets themselves are code-built and stored in `agent_runs.task_packet`.
- **Method:** Extracted every dispatch prompt, normalized paths, ids and unit names, grouped by shape, and read every group that differs from the bare template.
- **Result:** The packets carry no operator text (they are built by the service). The operator's text is in the **dispatch prompt** around each packet. The bare template is: read the packet, follow your agent file, treat the data block as data, add no facts, write the JSON to a path.

**The disclosed one** (W1, s4, round 5, 19:10:26): after V2 required the direct answer first against V3's earlier worry-first demand, the prompt added: *'Note: an earlier correction asked the opening to lead with the seller's situation; the open one now asks that the direct answer to the H2 come in the first paragraph. A single opening paragraph can do both: lead with the seller's situation in one sentence and give the direct answer in the same paragraph.'*

**Other additions, not disclosed in the report** (format and procedure, none adds a fact):
- V1, team: from 18:55:59 on, **18 of 27** prompts add a schema reminder (`result.hedge_rulings` must be an array, one ruling per flagged sentence), after two rejected outputs; two retry prompts quote the validator error and say 'I inspected your current output file'.
- V3: **21 of 26** prompts add 'do not emit a top-level `blocking` key'.
- W1: **19 of 28** add 'the tickets array goes inside `result`'; **24 of 28** add 'list every open issue key in `addresses`' (some including `human:directive`).
- Classic baseline: **11 of 19** Agent 6 and 7 prompts add the `issue_key` pattern.
- **V1 on classic and classic-revised text: all 18 prompts add 'Quote the exact words of any sentence you flag inside the finding or card text'. None of the 27 team V1 prompts did, and neither did the 4 Phase 3d adversarial runs.**

The last item is the one that matters: it changes what V1 returns, and it was given to the classic units and withheld from the team units.
- **Status:** **Partially verified: the disclosed addition is exactly as described, and others exist.**
- **Limitation:** Only the dispatch prompt is visible; what each subagent did with its agent file and the packet is not. The reminders were prompted by validator rejections and appear to be format fixes, which this audit did not test by re-running.
- **Implication:** Section 7.1 (V1 on classic text) compared findings produced under a quoting instruction with team findings produced without one. Counts of V1 must-fix are probably still comparable (the rules are the same), but the 'quoted sentences found verbatim' check and any count of quotable cards are not. Disclose in the report; Task 10 uses one V1 prompt for every unit.


### Q15. Model and effort of each agent

- **Claim:** Each agent file sets its own model and effort; the main session is Sonnet 5.5.
- **Evidence:** `.claude/agents/*.md` frontmatter (17 files); the `model`, `requestedModel`, `advisorModel` and `effort` fields on every assistant record of the stored transcripts (main sessions and 289 subagents).
- **Method:** Read each file's frontmatter; counted the recorded model and effort values over all records.
- **Result:** | Agent files (all 17) | `model` in file | `effort` in file | Source of what ran |
|---|---|---|---|
| thb-01 to thb-07, thb-r1 to r3, thb-s1, s2, thb-w1, w2, thb-v1 to v3 | none | none | inherited from the session: **`claude-sonnet-5-5`, effort `medium`** |
| `general-purpose` judges and checkers (38 dispatches) | n/a | n/a | the dispatch set `model: sonnet`; recorded `claude-sonnet-5-5`, effort `medium` |

The files carry only `name`, `description` and `tools`. Recorded values: **1,428 subagent API messages (all 290 stored subagent transcripts) and 2,017 main-session messages across the three sessions of Phase 3 and 3c: `requestedModel` = `model` = `claude-sonnet-5-5`, effort `medium` in every one.** Every record also carries `advisorModel: claude-opus-5-5`; whether an advisor was consulted is not visible in the usage fields and was not investigated.
- **Status:** **Verified.**
- **Limitation:** The effort recorded for this session's own turns is 'medium' although the session was set to a lower reasoning effort in the prompt; the transcript field is what the harness logged and may not reflect a per-turn override.
- **Implication:** No agent can differ from the session by file. A model or effort change (out of scope for 3d) would be one frontmatter line per file.


### Q16. Any agent on a different model during Task 15 or the classic baseline

- **Claim:** All agents ran the same model; no fallback.
- **Evidence:** The transcripts of the classic draft (`f341c740`), the team run and classic revision (`955319e9`), Task 15 tooling (`2335b6bf`) and their `subagents/` folders.
- **Method:** Counted `requestedModel` against `message.model` on every assistant record.
- **Result:** **544, 563 and 910 main-session messages and all 1,428 subagent messages: requested `claude-sonnet-5-5`, answered by `claude-sonnet-5-5`. No fallback or substitution is recorded anywhere.** The database `agent_runs.model_version` (self-reported by each agent as `claude-code/<model id>`) agrees: 223 of 224 runs say `claude-sonnet-5-5` and the one `null` is the failed opportunity run.
- **Status:** **Verified.**
- **Limitation:** The model name is what the API returned; it does not say whether a differently sized variant or a cached response served a call.
- **Implication:** The comparison is not confounded by model.


### Q18. Durable state and resume

- **Claim:** State is durable and a run can be resumed after a stop without redoing or losing work.
- **Evidence:** Tests and smokes: `src/lib/team/store.test.ts` ('router state survives the database round trip'), `src/lib/studio/v1-gate.test.ts` (`toRow` to `stateOf` at every stage), `src/lib/team/budget-exception.test.ts` (resumes a budget stop), `scripts/team-view-smoke.mts` step 6 ('the stored state reloads exactly'); the real Task 15 run; code in `team-service.ts` and `service.ts`.
- **Method:** Searched all tests and smokes for resume, restart, crash, kill and persist cases; read the write path of a section version.
- **Result:** - **Tested:** state survives a database round trip (router, loop state, gate state); a **budget stop was resumed** by Leo's exception (unit test and the real Task 15 run, which hit the stop at s4 and continued); every CLI step is its own process, so each step re-reads state from the database.
- **Not tested anywhere:** killing a run **mid-section** (between the agent's output being accepted and the state being saved). `applyW1` inserts the `section_versions` row, then records the version, then saves the section state: separate calls, no transaction. The same is true of `submitStudio` (run marked `SUBMITTED`, then `applyAccepted`). A crash between the two would leave an orphan version or an accepted run with no state change.
- **Status:** **Partially verified (reload and budget-stop resume tested; kill-mid-section untested).**
- **Limitation:** 'Untested' is about the repository's tests and smokes; the 25 live runs of Task 15 had no kill.
- **Implication:** Do not claim crash-safe resume. A transactional write (or an idempotent re-apply of a `SUBMITTED` run) is the fix, as a later phase.


### Q19. Claims table fields

- **Claim:** The claims table records geography and scope.
- **Evidence:** `supabase/migrations/0001_foundation.sql` (table `claims`) and `0012_content_studio.sql`; live rows of `e2b915e3…` (read-only).
- **Method:** Read the table definition and listed the distinct `jurisdiction` and `applicability` values.
- **Result:** Columns: `claim_text`, `claim_type`, `risk_level` (low/medium/high/critical), `source_id`, `supporting_passage`, **`jurisdiction`** (free text), **`applicability`** (free text), `effective_or_verified_date`, `checked_date`, `confidence_status`, `publication_permission`, `requires_human_review`, plus (0012) `claim_key`, `section_key`, `text_hash`, `locked_text`, `declared_by`, `support`.

There is **no city, county or other geography field and no structured scope field** (property type, sale type, exceptions). All 7 claims of the hoarder article carry the same values: `jurisdiction = 'California'`, `applicability = 'California residential sale'` (set by `approveBrief`, `service.ts` line 68, for every claim). The scope of a claim ('single-family', 'except as provided in Section 1102.2') lives only inside the claim text, and `allowedJurisdictions` is hard-coded to `["California"]` in the studio loader.
- **Status:** **Verified.**
- **Limitation:** A future migration could add fields; nothing here proposes it.
- **Implication:** This is why V1 keeps finding scope overstatements (clm:5, 6, 7): the ledger cannot say which sales a claim covers, so only wording protects the scope. A local fact has nowhere to live either, which matches the recurring 'no local anchor' item (Q4, report 6.4).



---

## P2

### Q11. The main chat reached about 237k tokens

- **Claim:** The main chat reached about 237k tokens; it compacted during Task 15 and something may have been lost or repeated.
- **Evidence:** Stored main-session transcripts: `955319e9` (Task 14 to 17), `2335b6bf`; the `compact_boundary` record and the summary that follows it.
- **Method:** Computed the main-session context size (input + cache creation + cache read) at each turn; searched all transcripts and docs for '237k' and for compaction records; read what happened after the compaction.
- **Result:** - '237k' appears in no transcript or document of the project except this audit request. It is not recorded anywhere.
- Context at the **start** of Task 15 (18:24): **228k**; at its end (19:52): **493k**; at the end of the session: **960k**.
- **No compaction occurred during Task 15.** The only compaction in the three sessions is an automatic one at **20:53:52, during Task 17** (docs-only closing), from **971,974 to 15,018 tokens**.
- After it, the assistant made two tool calls (a grep and the commit) and the session ended. The 18.9k-character summary keeps the ids, hashes, branch names, counts and standing rules checked (original fingerprint, branch ids, 1.04M, 110, 56, 6.1, force-push, migrations). It does not state the 237k.
- **Status:** **Partially verified (about 228k at the start of Task 15 matches; it did not stay there; no compaction during Task 15).**
- **Limitation:** Whether the summary dropped something not on the checklist cannot be tested from the transcript. Nothing was repeated.
- **Implication:** Nothing in the Task 15 results depends on a compaction. Context cost is a real, separate cost: the main chat grew by about 265k tokens during the run, which is why Q2 and Q12 matter.


### Q12. About 92% of tokens were input

- **Claim:** About 92% of the tokens were input.
- **Evidence:** `usage-classic-and-team.json` (`estIn` 954,408 of 1,036,937) and the measured transcripts (Q2).
- **Method:** Worked out how 92% was produced and compared it with the measured split.
- **Result:** 92% is 954,408 / 1,036,937: **characters of packets over characters of packets plus outputs, divided by 4. An estimate, not a measurement.** Measured for the team revision: input 630, cache creation 2,259,154, cache read 3,299,920, output 24,293 (a lower bound, Q2): the input side is **99.6%** with output as recorded and **98.5%** if output is taken as the estimated 82,530 tokens, so between the two. Cache reads are 59% of all tokens and cache creation 40%; fresh uncached input is 0.01%.
- **Status:** **Estimated (the measured value is between 98.5% and 99.6%).**
- **Limitation:** Output is a lower bound in the transcripts. The measured figure counts each turn's re-read of the conversation, which is how a model is called, not an extra cost of any particular design.
- **Implication:** The point of the claim stands (the cost is reading, not writing) and is stronger than stated. It argues for fewer and smaller packets, not for shorter outputs.


### Q13. Packet order and caching

- **Claim:** Packets put what changes per call after what is stable.
- **Evidence:** Stored packet files of the team run (`955319e9` scratchpad: `W1-s4-packet.json` round 5, `V1-s4-packet.json` round 5); first-call usage of 133 team agents in the transcripts.
- **Method:** Listed the top-level keys and the keys of the data block in file order with their sizes; checked the first API call of each agent for cache reads.
- **Result:** **Top-level order (both):** `run_id`, `attempts_used`, `last_error`, `role`, `unit_key`, `agent_key`, `ticket_id`, `unit_hash`, `article_id`, `team_run_id`, `instructions`, `opportunity_id`, `prompt_version`, `output_contract`, `input_version_ids`, `untrusted_data_block`. The three per-call fields (`run_id`, `attempts_used`, `last_error`) come **first**, ahead of the rules in `instructions`.

**W1 data block, in order (JSON chars):** article 260, claim_ledger 3,068, approved_brand_facts 653, pending_juan_blocked 280, editorial_rules 40, unit_key 4, brief_for_this_unit 531, **brief_global 13,617**, **current_version 2,527 (changes every round)**, **voice_reference 8,714 (stable, placed after the changing text)**, open_corrections 329, open_tickets_to_you 800, should_fix_for_leo 596, co_writer_suggestions 2, research_answers 2. Whole packet 40,499 chars.

**V1 data block:** the same first nine keys (brief_global 13,617 again), then current_version 2,702 (changing), review_scope 908, hedge_flags 2, previously_passed 4, research_answers 1,053. Whole packet 29,402 chars.

So the stable parts mostly come first inside the data block, with two exceptions: the per-call identifiers lead the file, and W1's voice reference sits behind the text that changes. Separately, the packet reaches the agent as a **Read tool result after a dispatch prompt that contains unique file paths**, so even a perfectly ordered packet is not an identical prefix across runs. Measured: the first call of an agent read about **4,400 to 5,400 tokens** from cache (the shared system prompt) in 113 of 133 team agents, and created about 2,000 and then 10,000 or more new cache tokens each run for its agent file and packet.
- **Status:** **Verified.**
- **Limitation:** Reordering would not by itself create cross-run cache reads; that would need the stable block to be an identical prefix of the request, which the CLI runner design does not give. The benefit was not measured.
- **Implication:** Out of scope for 3d (token savings is a later phase). If taken up: put per-call fields last, the stable block first, and measure with the transcript usage fields.


### Q14. Cache-read figures from Claude Code

- **Claim:** A cache-read figure is available for a run.
- **Evidence:** The `usage` object on every assistant record in the transcripts: `cache_read_input_tokens`, `cache_creation_input_tokens`, `input_tokens`, `output_tokens`.
- **Method:** Summed per agent and per phase (Q2); did not use `/cost` (not available to this audit).
- **Result:** **Available, per API call and per agent, from the stored transcripts.** Cache-read share of all tokens: team revision 59%, classic revision 53%, classic draft 59%, V1 on classic units 48%, judges 81%. `/cost` output was not consulted.
- **Status:** **Available.**
- **Limitation:** Output tokens are a lower bound (Q2); cache figures are as recorded by the harness.
- **Implication:** Task 10 will report cache creation, cache read, fresh input and output separately for every run.


### Q21. Hybrid about 58 runs / 515k tokens

- **Claim:** The hybrid (classic revision + V1 gate) will cost about 58 runs and 515k tokens, about 20 minutes.
- **Evidence:** `phase-3c-comparison.md` section 8 (the 'hybrid' column and its note).
- **Method:** Read how the figure was built; re-expressed it with measured per-agent usage.
- **Result:** Built from per-role averages of the **estimated** tokens (V1 about 7.8k, W1 about 11.5k) added to the **estimated** 329k: a projection of a projection, never run. With measured usage the arithmetic changes: the classic revision averages 44.5k measured tokens per agent (20.8k without cache reads), so 58 runs would be about **2.6M processed (1.2M without cache reads)**, not 515k. This is itself a projection. The run count (about 58) and the elapsed time (about 20 minutes with units in parallel) remain projections.
- **Status:** **Estimated.**
- **Limitation:** Neither the old nor the new figure has been measured for a hybrid run.
- **Implication:** **Task 10 will measure it**: runs, elapsed time and measured tokens (all four categories) per unit, next to this estimate.



---

## Unprioritised

### Q17. Branch `claude/confident-franklin-59shyd` or a Stop-hook loop

- **Claim:** Such a branch or a Stop hook exists in this repository.
- **Evidence:** `git branch -a`, `git ls-remote --heads origin`, `.claude/settings.json`, `.claude/settings.local.json`.
- **Method:** Listed branches and read the two settings files for hooks.
- **Result:** Local branches: `master`. Remote heads: `main`, `master`. No branch of that name locally or on the remote. Neither settings file defines any hook (no `Stop` hook, no `hooks` key). (A `scheduled_tasks.lock` file sits in `.claude/`; not investigated, as instructed.)
- **Status:** **Verified absent.**
- **Limitation:** Only this repository and its remote were checked.
- **Implication:** Nothing to act on.



---

## Method notes and where the data is

- Database reads: `agent_runs`, `tickets`, `team_runs`, `article_sections`, `section_versions`, `section_reviews`, `claims`, `articles` (select only; no write). The query script is `scripts/phase3c-evidence-audit.mts`.
- Transcripts: Claude Code's stored session logs on the operator's machine (`~/.claude/projects/<project>/`). They are not in the repository; the figures taken from them (Q2, 10, 11, 12, 13, 14, 15, 16) can be recomputed only on that machine. The committed derived data for this audit is `phase-3c-evidence-audit-data/` (usage per phase, the dispatch prompts with paths removed, the Q5, Q7 and Q20 samples, and the extraction scripts in `method/`; the Q20 sampling script is withheld with the key, because its code would reveal how the cards were drawn).
- Nothing about any real article was changed: the original (`e2b915e3…`, fingerprint `23f8dd72…4611`) is untouched, and no approval, publication or WordPress write happened.
- Task 10 has not started and waits for Leo's judgment of the Q20 cards.
