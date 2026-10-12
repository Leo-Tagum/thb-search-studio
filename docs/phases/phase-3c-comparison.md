# Phase 3c — Comparison report: team mode vs classic (hoarder guide)

Status: DRAFT for Leo, 2026-10-12. Written for Leo (the Studio director), who decides. Read-only on the original article; nothing here approves, publishes or writes to WordPress.

- **Classic:** article `e2b915e3-af97-4ea6-8979-4861ec729027`, version `4db42fea93cc`, HUMAN_REVIEW, untouched (fingerprint `23f8dd72…4611`, checked at the end of Task 15; not touched in Task 16).
- **Team branch:** article `d7f03fff-22d0-48fe-9ee0-3d6d5102c856`, version `d93053c44bb1`, HUMAN_REVIEW, no proposal, no approval.
- **What was compared:** the classic draft as it was locked (with its 50 optional findings unapplied) against the team's *revision* of it. This is not a comparison of two drafting runs. See the limits in section 9.

## 1. Summary

| | Classic | Team branch |
|---|---|---|
| Blind editorial score, average of 9 units (same rubric, A/B hidden) | **65.6** | **68.8** |
| Judge preferred (9 units) | 4 | 5 (no ties) |
| The 50 seeded findings, judged on the final text | 0 addressed | **39 addressed, 2 partly, 0 not addressed, 9 declined** |
| New optional items raised by the final team reviews | n/a | 39 (sample of 10: 5 real, 2 partly overlapping, 3 not valid, 0 duplicates) |
| V1 blocks / V1 revisions | 0 blocks, 4 revisions in 13 reviews | 0 blocks, 10 revisions in 25 reviews |
| Tickets (budget 10 hit at s4, unit 4 of 9) | n/a | 23 used at budget 30, all QUALITY_CORRECTION, all closed in round 1 |
| Escalations to Leo | 0 | 1 (the budget stop) |
| Agent runs | 56 | 110 (2.0x) |
| Token estimate (characters / 4 on packets and outputs; an ESTIMATE) | about 495k | about 1037k (2.1x) |
| Elapsed, first to last run (operator-driven, sequential; an estimate) | about 20 min | about 88 min |

**Bottom line.** Team mode handled every one of the 50 findings (39 fixed on the text, 2 partly, 9 declined with a reason) and the blind judge scored the team text slightly higher (+3.2 on 100, preferred in 5 of 9 units). That edge is small, comes from one judge on one article, and cost about twice the runs and tokens and four times the elapsed time. The comparison cannot separate team mode from the simple act of revising (section 9). My recommendation is a **hybrid**: keep classic as the default and add the team-mode V1 re-review of changed sentences to its revision path; do not adopt team mode as the default yet (section 8). **Update (Task 17): two follow-up tests (section 7) strengthen this:** V1 still finds 7 must-fix issues in the classic-revised text that classic's own reviewers passed 27 of 27, and the team and classic revisions score within noise of each other (67.8 vs 65.7, with 5 of 9 preferences flipping when the labels were swapped).

## 2. Blind scoring, unit by unit

Method: for each unit the two versions were saved as `A` and `B` in random order (seeded; the mapping was kept out of the judge's reach). One independent judge run per unit received only the two texts and Juan's voice reference, and scored **both** versions with the editorial-critic rubric that Agent 7 (classic) and V3 (team) share verbatim (voice 0-20, education 0-20, deal logic 0-20, local 0-15, structure 0-15, trust 0-10; copy-paste test; ten authenticity questions), then stated a preference and why. Each judge saw both texts in one call, so there is some anchoring between A and B. The judges did not check legal accuracy; fact and legal review is V1's job, not this score's.

| Unit | Classic | Team | Judge preferred | Why (judge's reason, shortened) |
|---|---|---|---|---|
| s1 | 61 | 73 | **team** | B explains what each path costs the seller (time, money, fees, price given up for speed and privacy), where A just names the paths, so B meets q3 and q4 and has real deal logic. B also adds concrete consequences to the five questions (an unsigned co-owner, a blocked exit) that A leaves abstract. A repeats the statute sentence n… |
| s2 | 73 | 72 | **classic** | A has a stronger Juan voice: it sets up the single question, says 'It sounds like paperwork. It is really the whole sale,' and tells the reader what it will not claim. B is more concrete in places (the callout's consequence of spending first, the neighbor-notice action), but it repeats the signer sentence verbatim and its table… |
| s3 | 68 | 71 | **team** | B is tighter and more quotable: the opening gives the answer in three sentences, and the H3 is a question that leads a scannable checklist. Its table labels ('What it looks like') read more like a homeowner's view than A's 'Condition in the statute'. A has the warmer Juan beat ('None of this means the house can't sell'), but it… |
| s4 | 53 | 69 | **team** | B gives the homeowner something to do: a concrete sequence that puts attorney or agent advice before any price talk and the sale path decision. A mostly restates the rule and refers out. B also puts the answer first and offers scannable, quotable bullets, where A starts with softer framing. A's plain-spoken waiver explanation i… |
| s5 | 64 | 61 | **classic** | B reads more like Juan: it names the homeowner's feeling plainly ('That is a fair place to be'), gives the plain-language rule 'do not treat a cleanout as a way to avoid the form', and ends the options list on a clean trade-off line. A hedges with 'if your sale is covered' twice and repeats the price-for-privacy point. A does h… |
| s6 | 67 | 72 | **team** | A ends with four practical decision questions covering time, money, signing authority and family capacity, which gives the homeowner a way to choose and carries the stronger deal logic. A also softens the Twin Home Buyer link to an optional next step. B opens in the more Juan-like way ('the real question is...') and echoes his … |
| s7 | 69 | 72 | **team** | The two versions are identical in the statute and paperwork sections; the differences are in the intro, one heading and the disclosure paragraph. A opens on the homeowner's real fear and names the three stall points up front, and its heading 'Skipping or playing down the disclosure form' is more scannable and specific. B's disc… |
| s8 | 67 | 64 | **classic** | B speaks in Juan's first person ('I'd get a few answers') and names the concrete risk of finding out halfway through that nobody checked who could sign. It also uses the 'hear about it from a buyer' line and the 'clarity creates more options' close, which match the voice reference's rhythm and stance. A has a useful by-situatio… |
| faq | 68 | 65 | **classic** | A is slightly better on education and voice. It uses 'Not always.', says plainly that the statute does not mention hoarding, and lists who can sign and says living in the house is not authority. B is cleaner on A5 scoping and ties each option to a professional in A6, but its A3 and A4 are thinner and lean on attorney referrals.… |

Average: classic **65.6**, team **68.8**. Preferred: classic 4 units, team 5 units.

By rubric dimension (average of 9 units):

| | voice /20 | education /20 | deal logic /20 | local /15 | structure /15 | trust /10 | authenticity YES (of 90) |
|---|---|---|---|---|---|---|---|
| classic | 14.3 | 13.9 | 12.8 | 5.3 | 11.0 | 8.2 | 81 |
| team | 13.7 | 15.0 | 14.1 | 5.3 | 12.0 | 8.7 | 84 |

Reading it: the team text is stronger on education, deal logic and structure, and weaker on voice. Local context is identical (5.3 of 15) in both, because neither version can add a local fact the ledger does not hold (see 6.4).

**These scores disagree with the in-pipeline V3 scores.** Inside the team run V3's advisory score was lower than classic's Agent 7 score in 6 of 9 units (classic 78-84, team 72-82) and equal in 3. The blind judge puts the team ahead in 5 of 9. The two cannot both be tracking the same thing; advisory scores depend on the scorer and the moment. Treat every editorial score here as roughly plus or minus 5.

## 3. The 50 findings, judged on the text

For each seeded finding, a checker read the classic text (to confirm the issue was real), the writer's notes and the team's final text, and judged whether the **text** now addresses the issue, ignoring keys. `declined` means the text still has it and a writer note declined it with a reason.

**Result: 39 addressed, 2 partly addressed, 0 not addressed, 9 declined (50).** The pipeline's own count (every seeded key no longer reported) said 50 fixed; judged on the text, 39 are fully addressed and 9 are consciously declined. Six of the nine declines are the same item, "no local anchor" (no ledger fact exists to support one).

| Unit | addressed | partly | not addressed | declined |
|---|---|---|---|---|
| s1 | 4 | 0 | 0 | 3 |
| s2 | 4 | 1 | 0 | 0 |
| s3 | 9 | 0 | 0 | 0 |
| s4 | 3 | 1 | 0 | 0 |
| s5 | 3 | 0 | 0 | 1 |
| s6 | 6 | 0 | 0 | 1 |
| s7 | 1 | 0 | 0 | 1 |
| s8 | 4 | 0 | 0 | 1 |
| faq | 5 | 0 | 0 | 2 |

| # | Unit | Reviewer:key | Finding (shortened) | Verdict | Reason (shortened) |
|---|---|---|---|---|---|
| 1 | s1 | V1:fact:s1:soft-generalization | Soft population claims with no source: 'Most people in this spot are not avoiding the problem' and 'Most owners want to… | **addressed** | Both 'Most people' and 'Most owners' claims were real in the classic text; the final removes the first and recasts the second as a non-population statement. |
| 2 | s1 | V2:seo:capsule-yes-claim-no-ledger | The capsule opens with 'Yes, you can sell a hoarded house in California.' It is the brief's own answer-first framing, b… | **declined** | The unbacked general answer-first opener was real in the classic; the final keeps 'You can sell a hoarded house in California.' and the writer note explicitly leaves it … |
| 3 | s1 | V2:seo:h2-keyword-variant | The H2 says 'packed or hoarded house' rather than the exact phrase 'hoarded house'. This reads naturally and the exact … | **declined** | The H2 variant was visible in the classic and is unchanged in the final; the finding itself said no change needed and the writer note keeps it with a reason. |
| 4 | s1 | V3:ed:capsule-repeated-in-body | The last body paragraph repeats the capsule's disclosure sentence almost word for word ('For a transfer by sale of sing… | **addressed** | The classic body repeated the capsule's disclosure sentence nearly verbatim; the final body paragraph now points back to the capsule instead of repeating it. |
| 5 | s1 | V3:ed:generic-good-news | 'Here is the good news.' is mildly stock. The next sentences already carry the point, so you could open that paragraph … | **addressed** | The stock 'Here is the good news.' opener was in the classic and is gone from the final. |
| 6 | s1 | V3:ed:unsupported-most-owners | 'Most owners want to know how fast the house can be emptied' states an unsupported generalization. A softer version is … | **addressed** | 'Most owners want to know...' was in the classic; the final no longer asserts a population generalization. |
| 7 | s1 | V3:ed:no-local-anchor | The section has no Bay Area or Northern California cue. That is acceptable in an opening that must not state local rule… | **declined** | The section had no Bay Area cue in the classic and still has none; the writer note explicitly does not add one because the opening may not state local rules and a later … |
| 8 | s2 | V2:seo:direct-answer-delayed | Resolved. The section now opens with 'The person who holds title, or who has the legal authority to sell for the owner,… | **addressed** | Already fine in the classic text; the final text still opens with the direct answer about who has to sign. |
| 9 | s2 | V2:seo:link-repeat-optional | Both internal links (inherited-property legal authority; sell-bay-area-house-full-of-belongings) are in the link plan a… | **addressed** | Both internal links are present once each in the final text, as in the classic; no change was needed. |
| 10 | s2 | V3:ed:repeated-authority-point | The point that the person living in the house is often not the person with authority or on title is made three times: '… | **partly** | Real in the classic (three occupant-not-on-title statements, signer list restated). Final keeps the occupant point once ('When the person living in the house is not the … |
| 11 | s2 | V3:ed:verbatim-site-lines | 'Many families do not need to be judged. They need time, clarity and a practical way forward.' (close to excerpt v17) a… | **addressed** | Real in the classic. Both lifted lines are gone; the families-need-time sentence is replaced and the callout is rewritten. |
| 12 | s2 | V3:ed:overstated-whole-sale | 'It sounds like paperwork. It is really the whole sale.' is a slight overstatement. A softer line such as 'It is really… | **addressed** | Real in the classic. The 'whole sale' overstatement is removed entirely; the paragraph now just states the first question. |
| 13 | s3 | V1:fact:s3:household-label:optional | 'It describes conditions, and it does not label any kind of household' is a mild statement about statute contents beyon… | **addressed** | Real in classic ('it does not label any kind of household'); the final text keeps only 'The statute does not mention hoarding.' |
| 14 | s3 | V1:fact:s3:spoiled-material:optional | 'spoiled material' in the first bullet is not one of the ledger conditions; the bullet only says it is 'the kind of thi… | **addressed** | Real in classic bullet 1; 'spoiled material' is gone from the final bullet. |
| 15 | s3 | V2:seo:circular-sentence | In "I'd read a few of them before you decide anything, because they show the conditions the statute lists", the reason … | **addressed** | Circular 'because' clause was real in classic; replaced with a real reason. |
| 16 | s3 | V2:seo:unsupported-aside | "nobody from the city ever looks twice" is a loose generalization with no ledger claim. It is not a consequential fact,… | **addressed** | Real in classic; 'nobody from the city ever looks twice' is cut from the final opening. |
| 17 | s3 | V2:seo:h3-not-question | The h3 "What this means in practice" is not phrased as a seller question. This is acceptable for an h3, and the keyword… | **addressed** | The finding was only an acceptable-as-is note, not a defect; the h3 is nonetheless now a seller question. |
| 18 | s3 | V3:ed:circular-because-clause | In paragraph 2, 'I'd read a few of them before you decide anything, because they show the conditions the statute lists'… | **addressed** | Circular 'because they show the conditions the statute lists' was real in classic and is replaced with the suggested wording. |
| 19 | s3 | V3:ed:unsupported-generalisation | 'Plenty of homes hold a lot of belongings and nobody from the city ever looks twice' reads as an unsourced observation … | **addressed** | Real in classic; the 'Plenty of homes... nobody from the city ever looks twice' sentence is removed, leaving only the suggested short sentence. |
| 20 | s3 | V3:ed:bullet-beyond-statute | Bullet 1 mentions 'spoiled material', which is not in the listed conditions. 'The kind of thing the statute talks about… | **addressed** | Real in classic; the bullet now says 'trash or signs of pests' and stays tied to listed conditions. |
| 21 | s3 | V3:ed:echo-of-voice-reference | 'None of this means the house can't sell. It means you want to know where it stands before you choose a path.' is very … | **addressed** | Real in classic; the near-copy of voice excerpt v8 ('None of this means the house can't sell...') is removed from the final text. |
| 22 | s4 | V2:seo:answer-after-lead-in | The direct answer ('California's disclosure article applies, with an exception, to a transfer by sale of single-family … | **addressed** | Real in classic (answer in paragraph 2 after three empathy sentences); the final opens with one worry sentence and the direct answer follows in the same first paragraph. |
| 23 | s4 | V2:seo:quote-self-contained | 'the article' and 'the requirements of the article' will not stand alone if quoted. Naming it once as 'California's dis… | **addressed** | Real in classic ('the article'); the final names the law with its Civil Code cite in each bullet so each stands alone. |
| 24 | s4 | V2:seo:buyer-says-no-need | 'A buyer saying they do not need the paperwork does not change it' is an illustration of clm:7 (waiver void), not a sep… | **partly** | Classic had the buyer-says-no-need illustration of clm:7 (low-severity, fact auditor's call); the writer says it was removed, but the final still carries a rephrased ver… |
| 25 | s4 | V3:ed:filler-remember-this | "The part I want you to remember is this one." is mild lead-in filler. Optional tighter wording: "This is the part that… | **addressed** | Real in classic ('The part I want you to remember is this one'); that line is gone and the final has no equivalent lead-in filler. |
| 26 | s5 | V2:seo:direct-answer-missing | Resolved. The section now opens 'Clearing the house out is your choice, and it does not change the disclosure rules tha… | **addressed** | Finding was a resolved/positive note (direct answer present in classic); the final text keeps the direct-answer opening. |
| 27 | s5 | V2:seo:opening-exception-optional | The first sentence says the disclosure rules 'apply to your sale' without the single-family exception. The qualifier ('… | **addressed** | The issue was real in classic (opening said rules 'apply to your sale' without the exception); the final opening now adds the coverage qualifier. |
| 28 | s5 | V3:ed:no-local-anchor | The section has no Northern California or Bay Area anchor. Acceptable for a short cleanout-versus-disclosure section wh… | **declined** | Issue was real (no Northern California or Bay Area anchor in classic) and the final text still has none; the writer note explicitly declines it because no ledger or appr… |
| 29 | s5 | V3:ed:vague-either-path | In 'Work out what you need most before you spend money on either path', 'either path' is slightly vague. Consider 'befo… | **addressed** | Classic had the vague 'either path'; the final text replaces it with the suggested wording. |
| 30 | s6 | V3:ed:unclear-not-thb-line | Opening paragraph says 'one of them is not Twin Home Buyer'. Most of the routes are not Twin Home Buyer, so the line re… | **addressed** | The classic text already read 'most of them have nothing to do with Twin Home Buyer', so the 'one of them' problem was not visible there; the final text also avoids it. |
| 31 | s6 | V3:ed:light-filler | 'Then you are choosing with facts instead of guesses.' and 'the problems do not fix themselves' are mild filler. Accept… | **addressed** | Both filler lines are gone: the 'choosing with facts' sentence is removed and 'problems do not fix themselves' became a plain statement of cost. |
| 32 | s6 | V3:ed:verbatim-voice-line | 'Getting these answers early usually creates more options, not fewer.' is near-verbatim voice excerpt v10. Fine as stan… | **addressed** | The near-verbatim voice line is replaced with fresh wording. |
| 33 | s6 | V2:seo:soft-claim-uncited | Last sentence of 'Get professional help first' ('Getting these answers early usually creates more options, not fewer.')… | **addressed** | The 'usually creates more options' generalization is replaced by a softer 'can keep' claim. |
| 34 | s6 | V2:seo:answer-first-opening | The opening ('The real question is usually not which route is best. It is which route fits your situation.') answers th… | **addressed** | The opening now names the deciding factors (time, money, who decides) instead of the vague 'which route fits' line. |
| 35 | s6 | V3:ed:no-local-anchor | The section has no Bay Area or Northern California reference. That is acceptable for a pure options section, but a late… | **declined** | Real in classic and still absent from the final text (no Bay Area reference); the writer's note explicitly declines it because it would need a ledger claim not held for … |
| 36 | s6 | V3:ed:echo-of-reference | 'Getting these answers early usually creates more options, not fewer.' is nearly word for word the voice reference line… | **addressed** | The echo of voice reference v10 is gone; the closing line is reworded and no longer near word for word. |
| 37 | s7 | V3:ed:local-thin | Local feel rests on one Oakland link. Do not add facts to fix this; the brief states no local rules, so the absence is … | **declined** | Real in classic (one Oakland link only) and still true in the final text; the writer's note says ed:local-thin was left unchanged because the brief states no local rules… |
| 38 | s7 | V3:ed:opening-generic-ish | 'Most owners want to know what could actually stop this sale.' is acceptable and no longer copies v8. A sharper version… | **addressed** | The classic opening was the generic 'Most owners want to know...'; the final opening names the seller's worry about house versus paperwork directly and drops the generic… |
| 39 | s8 | V1:fact:s8:usually_generalization | 'Getting clarity early usually creates more options, not fewer.' is a soft general statement, not a legal, figure or ou… | **addressed** | The soft 'usually' sentence was real in the classic text and has been removed from the closing paragraph. |
| 40 | s8 | V2:seo:s8-answer-not-named-first | The H2 asks who to check with, but the opening paragraph ("I'd get a few answers before you pick a route...") does not … | **addressed** | The issue was real in the classic opening; the first sentence now names the professionals so the answer stands alone. |
| 41 | s8 | V2:seo:s8-generalization | "Getting clarity early usually creates more options, not fewer." is a general claim with no ledger claim. It is not a c… | **addressed** | The generalization was present in the classic closing and is gone from the final text. |
| 42 | s8 | V3:ed:verbatim-voice-line | The sentence 'Getting clarity early usually creates more options, not fewer.' is word for word the voice reference exce… | **addressed** | The verbatim voice-reference sentence was in the classic text and has been removed, so no repeat of the live site remains. |
| 43 | s8 | V3:ed:local-context-thin | The section has no Bay Area or Northern California wording. Absence is acceptable for a professional-confirmation list … | **declined** | The final text still has no Bay Area or Northern California wording; the writer note explicitly declines it as advisory and says no local fact may be added, with 'city o… |
| 44 | faq | V1:fact:faq:authority-occupancy:optional | FAQ item 4: 'Living in the house does not give that authority.' is a flat statement. The brief supports it only as the … | **addressed** | Real in classic (flat 'Living in the house does not give that authority'); final removes it and frames it as a stall risk. |
| 45 | faq | V1:fact:faq:waiver-no:optional | FAQ item 5 opens with a flat 'No.' Clm:7 says a waiver of the article's requirements is void. Item 1 already notes the … | **addressed** | Real in classic (flat 'No.'); final scopes the answer to sales the rules cover. |
| 46 | faq | V2:seo:faq1-indirect-answer | Item 1 ('Do I have to disclose...') opens with 'California's disclosure article applies, with an exception' rather than… | **declined** | Real in classic; final still opens with the applicability-with-exception wording, not a plain 'Generally yes'. Change notes (passes 22 and 24) say the yes opener was dro… |
| 47 | faq | V2:seo:faq3-no-direct-yes | Item 3 ('Can the city or county act...') never says yes or no first. Consider opening with 'Possibly: local officials c… | **addressed** | Real in classic (no direct first answer); final now opens with a direct answer that the city or county can look at it, then the statute detail. |
| 48 | faq | V2:seo:faq5-dispute-claim-unledgered | Item 5 says 'Planning to skip or soften disclosure can cause disputes later'. This is not tied to a ledger claim. It is… | **addressed** | Real in classic ('can cause disputes later'); the sentence is gone from the final item 5. |
| 49 | faq | V3:ed:faq-light-local | No answer reads as Northern California or Bay Area specific. Acceptable for a short FAQ whose facts are state law, and … | **declined** | Real (no local touch in classic or final); writer notes decline adding one because no local fact is in the ledger, and the finding itself accepted this. |
| 50 | faq | V3:ed:faq-options-answer-flat | The last answer lists four routes in four short fragments. It is honest and not a pitch, but it reads like a list. If t… | **addressed** | Real in classic (four fragments, no lead line); final item 6 opens with a plain lead line and ties each route to a situation, though it remains list-like. |

### New optional items: sample of 10 of the 39

The 39 are the optional items the final team reviews still raised (none of them matches a seeded reviewer-and-key pair). A random sample of 10 was checked against the final text and the 50 seeded findings.

**Result: 5 real new issues, 2 partly overlapping a seeded finding, 3 not valid against the final text, 0 reworded duplicates.** So the new items are mostly genuine, not the old findings relabelled, but not all hold up: extrapolating, perhaps half of the 39 are real (a wide guess from n=10).

| # | Unit | Item | Verdict | Reason |
|---|---|---|---|---|
| 1 | s5 | V1:fact:s5:choice-wording (suggestion) | **real_new_issue** | The s5 opener says cleanout is 'your choice' flatly, and no seeded finding covers that a local enforcement notice could make cleanup mandatory (seeds 26/27 only concern the answer and the disclosure … |
| 2 | s3 | V3:ed:h3-bullets-not-checks (suggestion) | **real_new_issue** | The final H3 is 'What should you check before you pick a route?' but the first two bullets only describe concerns, and only the third is an actual check. |
| 3 | s2 | V3:ed:redundant-table-intro (suggestion) | **real_new_issue** | 'Here is who else can be affected, and why each one matters.' sits directly under the H3 'Then look at who else is affected' and just restates it before the table. |
| 4 | s3 | V2:seo:statute-named-late (suggestion) | **real_new_issue** | The s3 opener says 'The state statute' and 17920.3 is only named in the next paragraph, a minor but real quotability gap not raised by any seed. |
| 5 | s2 | V3:ed:repeated-title-sign-point (should fix) | **partly_overlapping** (seeded #10) | Seed 10 flagged repetition of the authority/title point and the signer list, and in the final the 'holder of title or authority has to sign' sentence appears verbatim in the opener and again under th… |
| 6 | s8 | V3:ed:s8-closing-voice (suggestion) | **not_valid** | The item concedes the closing is correct and low-pressure, and the final s8 closing is plain and honest with no defect to fix (the 'clarity' line from seeds 39/41/42 is gone). |
| 7 | s4 | V1:fact:s4:not-whether-to-disclose:soften (should fix) | **real_new_issue** | The final s4 says 'the useful question is not whether to disclose', which flatly implies disclosure is always required even though the same section says the rules have a 1102.2 exception; no seed cov… |
| 8 | s5 | V3:ed:vague-closing-step (should fix) | **partly_overlapping** (seeded #29) | Seed 29 suggested exactly 'a cleanout or on a sale' to fix 'either path', and the writer adopted it, but 'spend money on a sale' reads oddly as a distinct leftover wording problem in the new closing … |
| 9 | s7 | V3:ed:people-gap (suggestion) | **not_valid** | The s7 section is about three stall causes and the reluctant occupant is already covered in s2 and s5, so the absence here is not a defect. |
| 10 | faq | V1:fact:faq:item6:direct-sale-wording (suggestion) | **not_valid** | The item itself says the FAQ wording stays general, does not tie the direct sale to THB and is not a blocker, so it identifies no problem in the final text. |

## 4. Declines, compiled from all 26 writer outputs

All 26 W1 change notes were read. 45 entries (30 against reviewer findings, 15 against co-writer suggestions). A few entries are partial ("used only partly") or "already resolved". The loop's own declined field stayed at **0**: none of these was recorded in the system, only in the writer's prose (see 6.1). Two items were declined and later reversed (the FAQ "Yes" opener and "Not always.", see 6.2).

| Pass | Unit | Kind | Item | Reason |
|---|---|---|---|---|
| 1 | s1 | reviewer | seo:capsule-yes-claim-no-ledger (Yes-opening in the capsule) | Left as is: the Yes-opening is the brief's own answer-first framing and is a general statement, not a legal fact. |
| 1 | s1 | reviewer | seo:h2-keyword-variant | Left as is: H2 keeps 'packed or hoarded house' (approved H2); the keyword is in the title and capsule. |
| 1 | s1 | reviewer | ed:no-local-anchor | No local anchor added: this opening may not state local rules or a service area, and a later section carries local context. |
| 2 | s1 | reviewer | ed:local-context-absent (Bay Area anchor suggestion) | Not used: the ledger and brief give no local fact for this opening, and the standards allow local context only when true and useful. |
| 3 | s2 | w2 | w2:examples-generic | Not used: even a labeled hypothetical adds a scenario the brief does not cover, and the section is seller-problem logic only. |
| 3 | s2 | reviewer | the two seo items (unnamed) in the addresses | Already resolved, left unchanged. |
| 5 | s2 | reviewer | seo:first-person-voice | Declined: the first-person line is advice, not evidence of past deals, and matches the voice reference. |
| 5 | s2 | reviewer | ed:s2-closing-next-step | Declined: the callout already states the cost of spending first; no new fact needed. |
| 5 | s2 | reviewer | ed:s2-local-feel | Declined: no local fact in the ledger or brand facts supports it for this section; adding one would risk an unsourced claim. |
| 7 | s3 | reviewer | seo:first-person-voice (V2) | Declined: the first-person asides are advice phrasing the voice rules call for, and it is only a suggestion; no change made. |
| 8 | s4 | w2 | w2:money-risk-link (beyond a plain statement that the waiver rule closes the skip-disclos… | Partly not used: tying disclosure to cost or delay would need claims the ledger does not hold. |
| 8 | s4 | w2 | w2:cta-owner (partly; what to bring left out) | Used only partly: the note says which professional to ask, but what to bring is left out because the brief does not support it. |
| 9 | s4 | reviewer | ed:s4-no-what-goes-wrong | Not used: saying why skipping disclosure hurts the seller needs a consequence fact the ledger does not hold. |
| 12 | s4 | reviewer | ed:note-repeats-step-2 | Declined: the note is the confirm-with line the brief wants and it names two professionals; step 2 is kept as the action. |
| 12 | s4 | reviewer | seo:keyword-optional-here | Keyword not added (suggestion). |
| 13 | s5 | reviewer | ed:no-local-anchor | Declined: no ledger or approved source supports a local fact, so none added. |
| 13 | s5 | w2 | w2:examples-generic-hidden | Not used: an illustration of what a cleared room reveals would add unsourced factual content. |
| 13 | s5 | w2 | w2:angle-open-on-weight (partial) | Used only partly: opening names the stuck point and drops the generic reassurance. |
| 14 | s6 | reviewer | ed:no-local-anchor | Declined: a Bay Area reference would need a ledger claim or brand wording not held for this section, and it is a should-fix on a pure options section; no local fact added. |
| 16 | s7 | reviewer | ed:local-thin | No change: the brief states no local rules and no facts may be added. |
| 16 | s7 | w2 | w2:opening-generic (partly) | Only partly used, through the opening rewrite; directive says change nothing beyond the listed corrections. |
| 16 | s7 | w2 | w2:statute-run-on | Not used: the directive says change nothing beyond the listed corrections, and the statute paragraph must stay inside the wording of clm:1 to clm:4. |
| 16 | s7 | w2 | w2:voice-first-person | Not used: the directive says change nothing beyond the listed corrections. |
| 16 | s7 | w2 | w2:examples-missing | Not used: the directive says change nothing beyond the listed corrections. |
| 16 | s7 | w2 | w2:h3-labels | Not used: the directive says change nothing beyond the listed corrections. |
| 16 | s7 | w2 | w2:link-cluster | Not used: the directive says change nothing beyond the listed corrections. |
| 17 | s7 | reviewer | seo:local-modifier-thin | Oakland wording left as is, no further local wording added. |
| 18 | s8 | w2 | w2:concrete-question | Not used: example questions would add content beyond the brief's professional list and risk implying facts about what each professional will say. |
| 18 | s8 | reviewer | ed:local-context-thin | Declined: advisory only, and no local fact may be added; your city or county is the local hook. |
| 19 | faq | reviewer | ed:faq-light-local | Declined: no local fact is in the ledger, so none added; V3 itself accepted this. |
| 19 | faq | w2 | w2:faq-city-jargon (partly) | Used only partly: plain answer first, statute detail kept short. |
| 19 | faq | w2 | w2:faq-skip-overlap | Not used: V1 and V2 asked for targeted fixes to the skip-disclosure item, and it is a distinct seller worry; the overlap is only the clm:7 point. |
| 19 | faq | w2 | w2:faq-cta-missing | Not used: unit stays within six items and 60 words, and a link to a direct-sale page would lean toward a sales close in an informational FAQ; the app composes the CTA. |
| 20 | faq | reviewer | ed:faq-local-touch | Not used: no local fact is in the ledger and nothing may be invented. |
| 21 | faq | reviewer | ed:faq-repeat-disclosure (should fix; items 1 and 5 overlap) | Not acted on, to keep this a targeted fix. |
| 21 | faq | reviewer | seo:faq-authority-answer-thin | Not acted on (suggestion); the ledger holds no claim on who signs. |
| 21 | faq | reviewer | ed:faq-options-close | Not acted on (suggestion), to keep a targeted fix. |
| 22 | faq | reviewer | seo:faq-authority-answer-indirect | Not used: who may sign is not held by any ledger claim and adding it would be a new fact. |
| 22 | faq | reviewer | ed:faq-voice-flat (partial) | Kept light to avoid first-person evidence claims, though item 1 now uses a short advising line. |
| 23 | faq | reviewer | ed:faq-q4-does-not-name-who | Not used: no ledger claim says who holds authority to sell, so naming them would be a new fact (R1 ticket only if the reviewer insists); item 4 left as is. |
| 23 | faq | reviewer | ed:faq-generic-referrals (suggestion) | Not used: the referral closes point to the correct professional per the brief, and changing them risks the confirm-with lines the brief requires. |
| 25 | faq | reviewer | ed:faq-no-local-anchor | Not used: no local rule or fact is in the ledger and none may be added. |
| 26 | faq | reviewer | suggestion: no-hoarding statement (item 3) | Declined as already absent from the text. |
| 26 | faq | reviewer | suggestion: item 3 opening (soft opener) | Declined: item 3 already opens 'It can'. |
| 26 | faq | reviewer | local anchor suggestion (ed:faq-no-local-anchor type) | Not added: no ledger claim or approved brand fact supports local context. |

12 of the 45 entries concern the missing local anchor.

## 5. Text diff, classic vs team

Sentence-level comparison of the locked classic version against the team's final version. Most-changed by retention: **s4 (18% of classic sentences survive), faq (31%), s6 (37%), s1 (39%)**; least changed: s7 (79%). s4, s8 and the FAQ are shown in full below as you asked, and s4 is included because it changed most; the other units show only the changed sentences.

| Unit | classic sentences | kept | removed | added | words |
|---|---|---|---|---|---|
| s1 | 36 | 14 (39%) | 22 | 20 | 492 → 523 |
| s2 | 42 | 21 (50%) | 21 | 18 | 557 → 540 |
| s3 | 34 | 18 (53%) | 16 | 15 | 505 → 483 |
| s4 | 22 | 4 (18%) | 18 | 22 | 296 → 412 |
| s5 | 31 | 18 (58%) | 13 | 17 | 457 → 473 |
| s6 | 38 | 14 (37%) | 24 | 30 | 560 → 635 |
| s7 | 38 | 30 (79%) | 8 | 7 | 536 → 555 |
| s8 | 21 | 10 (48%) | 11 | 8 | 294 → 285 |
| faq | 29 | 9 (31%) | 20 | 19 | 353 → 352 |

### s1

Sentences: classic 36, team 34; **14 unchanged (39% of classic)**, 22 removed, 20 added. Words 492 → 523.

<details><summary>show the changes</summary>

```diff
- [answer capsule] Yes, you can sell a hoarded house in California.
- The route depends on who has authority, the condition, the people involved, what is owed and your timeline.
- For a transfer by sale of single-family residential property, California's disclosure article applies, except as provided in Civil Code Section 1102.2, and a waiver of its requirements is void.
+ [answer capsule] You can sell a hoarded house in California.
+ Which route fits depends on who has authority, the condition, the people involved, what is owed and how soon you need it done.
+ Disclosure still applies: the law covers a sale of single-family residential property, with exceptions, and a waiver of its requirements is void.
- Most people in this spot are not avoiding the problem.
- The house just feels too heavy to deal with.
- If someone you love is still living there, the decision is harder.
- A packed house is often a family matter before it is a real estate matter, and nobody should be judged for it.
- Here is the good news.
- A full house does not mean the house cannot be sold.
- It means you want the right information before you pick a path.
- Getting clear early usually creates more options, not fewer.
- Most owners want to know how fast the house can be emptied.
- The real question is usually what situation you are actually in.
- I'd want five things answered first:
+ A house this full carries history, and if someone is still living there, every decision touches them.
+ That is a family matter before it is a real estate matter.
+ Plan with the person who lives there, not around them, and keep judgment out of it.
+ How fast the house can be emptied is the question that feels urgent.
+ The one that decides things is what situation you are in.
+ I'd want these answered first, because each one changes what you can do:
+ An unsigned co-owner can hold up the whole plan.
+ A blocked exit changes what has to happen before anyone can safely walk through.
- Your answers decide the route.
- Keeping the home for now, clearing it and listing it, bringing in professional help, or selling directly can each be the right choice.
- Which one fits depends on you, not on what a buyer wants to hear.
- One thing does not depend on your answers.
- For a transfer by sale of single-family residential property, California's disclosure article applies, except as provided in Civil Code Section 1102.2.
- Any waiver of its requirements is void.
- Plan to disclose, not to skip it.
+ Your answers point to a path, and each path trades something.
+ Keeping the home for now buys time and keeps control, but the problems wait for you.
+ Clearing it out and listing it can reach the whole market, but it costs time and money up front.
+ Professional help adds certainty on legal points, at the price of fees and time.
+ Selling directly can cut the work, but a direct buyer prices in the condition, so you give up some price for speed and privacy.
+ The disclosure rules in the capsule above do not change with your answers.
+ A sale of single-family residential property uses the Real Estate Transfer Disclosure Statement form, so plan to disclose, not to skip it.
- Confirm them with a real estate attorney or a title company before you commit to a route.
+ Confirm them with a real estate attorney or a title company before you commit to a path.
+ The next section starts with the first of the five: who has to sign.
```
</details>

### s2

Sentences: classic 42, team 39; **21 unchanged (50% of classic)**, 21 removed, 18 added. Words 557 → 540.

<details><summary>show the changes</summary>

```diff
- The person who holds title, or who has the legal authority to sell for the owner, has to sign.
- Depending on the situation, that might be an owner, a trustee, an executor, an administrator, a surviving spouse, or several heirs agreeing together.
- Others are affected too: the person living in the house, co-owners and heirs, any tenant or other occupant, and neighbors.
- Before cleanout, before price, before anything else, I ask one question.
- Who actually holds title to the house?
- It sounds like paperwork.
- It is really the whole sale.
- The answer decides who can sign, and who has to be involved.
- With a packed house, the person living there is often not the person on title.
- The home may have been a parent's or a relative's, and the family may be sorting out who decides while the house sits full.
+ The person who holds title, or who has legal authority to sell for the owner, has to sign.
+ Co-owners, heirs, anyone living in the home and others may also be affected, so find out who holds title first.
+ The house is full.
+ A parent or relative may still live there.
+ The family has not settled who gets to decide.
+ Before cleanout and before price, the first question I ask is who actually holds title.
- That is normal, and it is the first thing to find out.
+ That is fine.
+ It is the first thing to find out.
+ The person who holds title, or who has the legal authority to sell for the owner, has to sign.
+ Depending on the situation, that could be an owner, a trustee, an executor, an administrator, a surviving spouse, or several heirs agreeing together.
+ Which one applies to your family depends on the documents and the facts, so do not read that list as a rule for your house.
- I am not going to tell you which rules apply to your family.
- That depends on the documents and the facts, and it is a question for a real estate attorney or a title company.
- A packed or hoarded house is often tied to family.
+ A packed or hoarded house can be tied to family.
- Treat that person with respect.
- Many families do not need to be judged.
- They need time, clarity and a practical way forward.
+ This is someone's home and a family's decision, so go slowly, listen, and keep that person at the center of the plan.
+ Here is who else can be affected, and why each one matters.
- They may or may not hold title.
- Neighbors | They may already be worried about the property, which can matter if a local office gets involved.
+ Neighbors | If a neighbor has raised concerns, a local office may already know about the property.
+ Ask whether any notice exists before you choose a route.
- [callout] Settle who holds title and who can sign before you spend money on cleanout or talk price with anyone.
- Getting clarity early usually creates more options, not fewer.
+ [callout] Settle who holds title and who can sign before you pay for a cleanout or talk price with anyone.
+ Spending first can commit you to a plan the right person did not agree to.
```
</details>

### s3

Sentences: classic 34, team 33; **18 unchanged (53% of classic)**, 16 removed, 15 added. Words 505 → 483.

<details><summary>show the changes</summary>

```diff
- Plenty of homes hold a lot of belongings and nobody from the city ever looks twice.
- That is where the law starts to care.
+ The state statute lists conditions like those, and an official decides whether a home meets them.
- I'd read a few of them before you decide anything, because they show the conditions the statute lists.
+ I'd read them before you decide anything, so you know what the city or county can actually look at.
- It describes conditions, and it does not label any kind of household.
- Condition in the statute | What the statute says | Who decides
- Junk, debris and garbage | Premises where an accumulation of junk, debris, garbage and similar materials constitutes fire, health or safety hazards are among the listed conditions that can make a building substandard.
+ What it looks like | What the statute says | Who decides
+ Junk, debris and garbage piling up | An accumulation of junk, debris, garbage and similar materials that constitutes fire, health or safety hazards is among the listed conditions that can make a building substandard.
- Garbage and rubbish facilities | Lack of adequate garbage and rubbish storage and removal facilities, as determined by a health officer, is listed as a condition of inadequate sanitation.
+ No adequate way to store and remove garbage | Lack of adequate garbage and rubbish storage and removal facilities, as determined by a health officer, is listed as a condition of inadequate sanitation.
- Combustible waste or vegetation | Combustible waste or vegetation that, in the opinion of the fire chief or the chief's deputy, is in a condition to cause a fire or explosion or provide ready fuel to spread fire is listed.
+ Combustible waste or vegetation | Listed when, in the opinion of the fire chief or the chief's deputy, it is in a condition to cause a fire or explosion or provide ready fuel to spread fire.
- The local enforcement authority makes that call, and in several of these conditions the statute names a health officer or a fire official.
- ### What this means in practice
+ The local enforcement authority makes that call, and for several of these conditions the statute names a health officer or a fire official.
+ ### What should you check before you pick a route?
- Trash, spoiled material or signs of pests are another, and they are the kind of thing the statute talks about.
+ Trash or signs of pests are another, and they can resemble conditions the statute lists.
+ Whether a home meets them is for the official to decide.
- - If a notice or violation already exists, you want to find out about it before you pick a route, not in the middle of a sale.
- None of this means the house can't sell.
- It means you want to know where it stands before you choose a path.
- If you want background on code violations and enforcement in the Oakland area, [this guide on Oakland code violations](https://www.twinhomebuyer.com/oakland-code-violations-2026/) is a place to start.
- Local rules differ by city and county, so treat it as background and not as the rule for your address.
+ - Whether a notice or violation already exists on the property.
+ Find that out before you choose how to sell, not in the middle of a sale.
+ If your house is near Oakland, [this guide on Oakland code violations](https://www.twinhomebuyer.com/oakland-code-violations-2026/) gives background on code violations and enforcement there.
+ Treat it as secondary to checking with your own city or county, because local rules differ.
+ What you must tell a buyer is a separate question, and the next section covers it.
```
</details>

### s4  (shown in full)

Sentences: classic 22, team 26; **4 unchanged (18% of classic)**, 18 removed, 22 added. Words 296 → 412.

Legend: `−` removed from classic, `+` added in team, unmarked lines unchanged.

```diff
  ## What do you have to disclose when you sell a house in California?
- When the house is full, this is often the question that makes people freeze.
- They think the clutter has to be explained away, or that it might be better not to mention it at all.
- Let me separate what the law says from what I can't tell you.
- Here is what the law says.
- California's disclosure article applies, with an exception, to a transfer by sale of single-family residential property.
- The disclosures the article requires are made on a copy of the Real Estate Transfer Disclosure Statement form.
- The part I want you to remember is this one.
- Any waiver of the requirements of the article is void as against public policy.
- In plain words, you can't make the disclosure requirement go away by agreement.
- A buyer saying they do not need the paperwork does not change it.
+ With a full house, the worry is that you do not know what you have to tell a buyer about its state, and telling them feels like it could hurt the sale.
+ When you sell single-family residential property in California, the disclosures are made on the Real Estate Transfer Disclosure Statement form, the rules have an exception, and a waiver of them is void.
+ Here is what that means, and what I would do about the rest.
+ - California's seller disclosure law (Civil Code 1102 and following) applies, except as provided in Section 1102.2, to a transfer by sale of single-family residential property.
+ - Under Civil Code 1102.6(a), the disclosures that law requires are made on a copy of the Real Estate Transfer Disclosure Statement form.
+ - Under Civil Code 1102(c), any waiver of the requirements of California's seller disclosure law is void as against public policy.
  ### What this means for a packed house
- - Do not plan around skipping or hiding disclosure.
- The waiver rule means that route is not open.
- - The exception matters.
- Whether your sale falls inside it, or whether your property counts as single-family residential, is a question for a professional, not a guess.
+ The waiver point matters most when the house is hard to face.
+ You cannot get out of the requirements by agreeing with a buyer to skip them.
+ So the useful question is not whether to disclose.
+ It is how to do it accurately, with help.
+ - The rules have an exception.
+ Whether your sale falls inside it, or whether your property counts as single-family residential, is a question to settle with a professional.
  - This guide does not go through what the form asks.
  What belongs on it for your house is for your agent or attorney to walk through with you.
- Clutter makes this harder because you may not know what is behind it.
- That is one reason people look at cleanout and inspection before listing.
- I cover that choice in the next section.
- [note] Confirm with a real estate attorney or your listing agent: whether the disclosure requirement and its exception apply to your sale, and what goes on the Transfer Disclosure Statement for your specific house.
+ - Clutter can hide conditions you do not know about yet.
+ That is one reason to think about cleanout and an inspection before you list.
+ The next section covers that choice.
+ ### What I would do first
+ 1. Write down what you actually know about the house: rooms you cannot get into, damage you have seen, anything a neighbor or official has mentioned.
+ 2. Take that list to a real estate attorney or a listing agent before you talk price with anyone.
+ 3. Ask them to tell you whether the rules and the exception apply to your sale, and to go through the form with you for your specific house.
+ 4. Decide on cleanout, listing or a direct sale after that, not before.
+ [note] Not sure who to call?
+ Start with a real estate attorney for the legal questions, or your listing agent for how the form is filled out.
```

### s5

Sentences: classic 31, team 35; **18 unchanged (58% of classic)**, 13 removed, 17 added. Words 457 → 473.

<details><summary>show the changes</summary>

```diff
- Clearing the house out is your choice, and it does not change the disclosure rules that apply to your sale.
- What matters is what a cleanout gets you, and whether you can actually do it.
- For a lot of families the house feels too heavy to start on.
- That is a fair place to be, and it does not mean the house cannot be sold.
+ Clearing the house out is your choice, and it does not change the disclosure rules if your sale is covered by them.
+ The harder question is whether you can start at all.
+ When every room is full, the first step can feel out of reach.
+ That does not mean the house cannot be sold.
- - It shows the real condition.
- Once the rooms are clear, you and any buyer can see the floors, walls, roof lines and anything that was hidden behind the belongings.
- - It lets you decide with facts.
- A professional cleanout crew, then an inspection, tells you what you are really selling before you pick a route.
+ - It shows the condition.
+ Once the rooms are clear, you and any buyer can see the floors, walls and ceilings that were covered by belongings.
+ - It gives you more to decide with.
+ A professional cleanout crew, then an inspection, can show you more of what you are selling before you pick a route.
+ An inspection still has limits, so ask the inspector what it did not cover.
- Clearing the house does not turn the disclosure paperwork into something optional.
+ A cleanout does not replace the disclosure form.
+ You still complete it, if your sale is covered.
+ Here is the law in plain terms.
- The disclosures are made on a copy of the Real Estate Transfer Disclosure Statement form.
+ The disclosures go on a copy of the Real Estate Transfer Disclosure Statement form.
- So do not treat a cleanout as a way to avoid the form, and do not agree with anyone to skip it.
+ So do not agree with anyone to skip the form.
- - You want privacy and fewer showings, and you accept that a buyer who takes the house with its condition will price that in.
+ - You want privacy and fewer showings, and you accept that a direct buyer will price in the condition.
+ You would be trading some price for privacy and fewer showings.
- Work out what you need most before you spend money on either path.
+ The next step is to work out what you need most, before you spend money on a cleanout or on a sale.
```
</details>

### s6

Sentences: classic 38, team 44; **14 unchanged (37% of classic)**, 24 removed, 30 added. Words 560 → 635.

<details><summary>show the changes</summary>

```diff
- The real question is usually not which route is best.
- It is which route fits your situation.
- Each one below costs you something different in time, money, certainty or control.
- None of them is wrong for everyone, and most of them have nothing to do with Twin Home Buyer.
- ### Keep it for now
- This fits when you are not under time pressure, the person living there is not ready to move, or the family still has to sort out who decides.
- Keeping the home while care, cleanup and decisions get worked out can be better than a rushed sale.
- The cost is that the house keeps needing attention, and the problems do not fix themselves.
- ### Fix it, then test the open market
+ A full house and a family that has to decide what to do with it is a hard place to start.
+ There is no single best route.
+ What decides it is how much time you have, how much money can go into the house, and who has the right to decide.
+ Each route below fits some situations and not others, and several have nothing to do with Twin Home Buyer.
+ ### Clear it out first, then test the open market
- Then you are choosing with facts instead of guesses.
- This fits when the home can be cleared and shown, you can complete the disclosure paperwork with an agent, and you want to market the home broadly.
- Listing with an agent who knows difficult-condition homes is a legitimate route.
- Plan for the paperwork.
+ This fits when the home can be cleared and shown, and you want to market it broadly.
+ An agent who knows difficult-condition homes is worth asking about.
+ Your part is the disclosure paperwork, so go through the form with your agent or an attorney.
+ Here is what the law says.
- And any waiver of those requirements is void as against public policy, so there is no agreeing your way around it.
- Go through the form with your agent or an attorney.
- ### Get professional help first
- This is less a route than a step before any route.
- An attorney can speak to authority, probate and disclosure questions.
- A title company can speak to liens and title.
- A CPA can speak to taxes.
- The city or county can tell you whether any enforcement action exists on the property.
- Getting these answers early usually creates more options, not fewer.
+ Any waiver of those requirements is void as against public policy, so there is no agreeing your way around it.
+ ### Keep it for now
+ This fits when you are not under time pressure, the person living there is not ready to move, or the family still has to sort out who decides.
+ Think of a family that needs time to arrange care for a parent before anyone talks about a sale.
+ Keeping the home while care, cleanup and decisions get worked out can be better than a rushed sale.
+ The cost is that the house keeps needing attention while you wait.
- If you want to talk through a direct sale of a packed or hoarded home, the next step is [our page for hoarder houses](https://www.twinhomebuyer.com/hoarder-houses/).
- [note] Confirm with the right professional before you commit to a route: a real estate attorney for authority and disclosure, a title company for liens and title, and a CPA for tax.
+ Once you have weighed the other routes, you can [read how a direct sale of a packed or hoarded home works](https://www.twinhomebuyer.com/hoarder-houses/) as an optional next step.
+ ### Get professional help before any of them
+ This is less a route than a step before any route.
+ An attorney can speak to authority, probate and disclosure questions.
+ A title company can speak to liens and title.
+ A CPA can speak to taxes.
+ The city or county can tell you whether any enforcement action exists on the property.
+ Asking these questions early can keep more of your options open.
+ To choose, I'd start with four questions.
+ How much time do you have?
+ How much money can go into the house before it sells?
+ Who has the authority to sign?
+ How much of the work can your family carry?
+ Your answers point to a route, and it is fine if the honest answer is that it depends.
+ [note] Confirm with the right professional before you commit to a route, especially on authority, disclosure, liens and tax.
```
</details>

### s7

Sentences: classic 38, team 37; **30 unchanged (79% of classic)**, 8 removed, 7 added. Words 536 → 555.

<details><summary>show the changes</summary>

```diff
- Most owners want to know what could actually stop this sale.
- Some of it comes from the house.
- A lot of it comes from the paperwork and the people.
- Sort those apart early and you can plan around them instead of being surprised by them.
- Three things can stall the sale of a packed house.
+ You may be worried that the house itself will sink this sale.
+ It can slow things down.
+ So can the paperwork and the people involved.
+ Three things can stall the sale of a packed house: a local official taking an interest, a disclosure misstep, and a problem with who can sign or what is recorded against the property.
- ### A disclosure shortcut
+ ### Skipping or playing down the disclosure form
- The disclosures are made on the Real Estate Transfer Disclosure Statement form.
- And any waiver of the requirements is void as against public policy.
+ On a sale of single-family residential property, with an exception, the disclosures the law requires are made on the Real Estate Transfer Disclosure Statement form.
+ Any waiver of those requirements is void as against public policy.
```
</details>

### s8  (shown in full)

Sentences: classic 21, team 18; **10 unchanged (48% of classic)**, 11 removed, 8 added. Words 294 → 285.

Legend: `−` removed from classic, `+` added in team, unmarked lines unchanged.

```diff
  ## Who should you check with before you decide?
- I'd get a few answers before you pick a route.
- Not all of them, and not all at once.
- But the people below can each settle a question that this guide can only point at.
- A house full of belongings is hard enough without finding out halfway through that nobody checked who could sign.
+ Before you pick a route, check with an attorney, a title company, a CPA, an insurance professional and your city or county.
+ Each can settle a question this guide can only point at.
+ You do not need all of them at once.
  - **Real estate attorney:** who has authority to sell, any probate or trust questions, and what has to be disclosed on the Transfer Disclosure Statement.
  - **Listing agent:** how the disclosure form is completed for your specific home, if you are thinking about listing.
  - **Title company:** liens, title issues and who has to sign.
  - **CPA:** the tax consequences of selling.
  - **Insurance professional:** what coverage looks like on a vacant or hazardous property.
  - **City or county building, health or fire department:** whether any enforcement notice or local rule applies to the property.
- If a notice has already been posted or a letter has come, start with the city or county.
- It is better to know what is open before you choose a path than to hear about it from a buyer.
+ Where to start depends on your situation.
+ If the home was a parent's or relative's, start with the attorney or the title company, because who can sign comes first.
+ If a notice has been posted or a letter has come, start with the city or county.
+ If you are thinking about listing, talk to a listing agent about the disclosure form.
  [note] Confirm legal, tax, title, code and insurance points with the right professional for your situation.
- This guide explains the questions to ask.
- It does not replace the answers.
+ This guide explains what to ask, not what the answer is for your house.
  Once you know who can sign, what is owed and what the city or county says, you can compare keeping it, clearing it, listing it and selling directly with real information.
- Getting clarity early usually creates more options, not fewer.
  If a direct sale is one of the routes you want to talk through, the next step is the [packed and hoarded house page](https://www.twinhomebuyer.com/hoarder-houses/).
- Read it, then decide.
- There is no rush attached to it.
```

### faq  (shown in full)

Sentences: classic 29, team 28; **9 unchanged (31% of classic)**, 20 removed, 19 added. Words 353 → 352.

Legend: `−` removed from classic, `+` added in team, unmarked lines unchanged.

```diff
  Q1. Do I have to disclose the condition of a packed or hoarded house when I sell in California?
- A1. For a sale of single-family residential property, California's disclosure article applies, with an exception.
+ A1. California's disclosure article applies to a sale of single-family residential property, with an exception.
  The disclosures are made on the Real Estate Transfer Disclosure Statement form, and any waiver of the requirements is void.
- Go through the form with an agent or attorney before you list.
+ Ask an agent or attorney how to complete it for your house.
  Q2. Do I have to clean out a house before selling it?
- A2. Not always.
- It depends on your time, your money, who has authority to sell and which route you pick.
- Clearing it out shows the real condition before you list.
- A direct sale is the other route, and a direct buyer prices in the condition.
+ A2. It depends on your time, your money, who has authority to sell and the route you pick.
+ Clearing out shows the real condition before you list.
+ A direct buyer prices in the condition.
+ A city or county notice could also change your options.
  Q3. Can the city or county act on a packed or hoarded house?
- A3. State law lists conditions that can make a building substandard, such as junk and debris that are fire, health or safety hazards.
+ A3. It can look at the property.
+ State law lists conditions that can make a building substandard, such as junk and debris that are fire, health or safety hazards.
  Whether a home meets them is for the local authority.
- The statute does not mention hoarding.
  Ask the city or county whether any notice is open.
  Q4. Who can sell the house if the owner cannot or will not?
- A4. Only someone with legal authority to sign.
- That might be the owner, a trustee, an executor or administrator, or several heirs who agree.
- Living in the house does not give that authority.
- Confirm who can sign with an attorney or title company before you plan anything else.
+ A4. That depends on who holds title and who has legal authority to sign.
+ A sale can stall when the person living in the house is not that person.
+ Confirm it with an attorney or title company before you plan anything else.
  Q5. Can I agree with the buyer to skip disclosure?
- A5. No.
- Under the California statute, any waiver of the disclosure requirements is void as against public policy.
- Planning to skip or soften disclosure can cause disputes later.
- Work through the form with an agent or attorney instead.
+ A5. No, not for a sale the disclosure rules cover.
+ Under California law, any waiver of the requirements is void as against public policy.
+ Talk it through with your attorney before you sign anything.
  Q6. What are my realistic options for a packed or hoarded house?
- A6. Keep it while you sort out care and decisions.
- Clear it out, then list it with an agent.
- Get professional help first on authority, title and tax.
- Or sell directly if you want to avoid cleanout and showings and accept that the price reflects the condition.
+ A6. It depends on what you need most.
+ Keep it while the family sorts out care and decisions.
+ Clear it out and list it if you have time and money.
+ Sell directly to skip cleanout and showings, at a price that reflects condition.
+ Confirm authority and title with an attorney or title company, tax with a CPA.
```


## 6. What went wrong, and how to fix it (proposals only; nothing built)

**Status of everything in this section: PROPOSED, not approved, nothing built.** Leo has approved none of the fixes below. The one exception in tone is 6.1: lost declines is a **bug to fix in any mode**, because classic also has no record of which optional findings were addressed or declined (7.2).

### 6.1 BUG (fix in any mode): declines are lost when reviewers re-issue their lists

**What happened.** `recordReview` replaces a reviewer's collected items with its new list each round, keeping a decline only when the key is identical. Reviewers re-key and reword freely, so a decline vanishes the next round. Result: 0 declines recorded in the system, at least 30 made by the writer, and one item (no local anchor) raised and declined in seven units and four separate times in the FAQ alone.

**Proposal.** (a) W1 returns a structured `declines: [{key, reason}]` that code validates and stores per article, never replaced by a reviewer's new list. (b) A re-raised item with a stored decline is shown to the reviewer with its reason and counts once unless the reviewer cites new evidence. (c) Keys are matched by text similarity as well as exact key. (d) Declined items go to Leo's list automatically, as the design intended.

### 6.2 The council passes contradictory corrections instead of one agreed set

**What happened.** The three reviewers review the same version at the same time and each answers independently. Code de-duplicates overlapping cards and keeps every V1 card, but it does not detect contradictions. Examples: s2 and s4 openings (V3 wants the seller's situation first, V2 wants the direct answer first); FAQ item 2 (V3 required "Not always.", V1 required it reworded, W1 flipped between them for several rounds). The FAQ alone took 7 council rounds and 9 tickets.

**Proposal.** (a) Run V1 first, then V2 and V3 only on a V1-clean version. This avoids the V1-rejects-what-V3-demanded loop and saves the V2/V3 runs spent on versions V1 then rejects (V1 revised 10 times; about 20 V2/V3 runs, roughly 18% of all runs). (b) Add a deterministic contradiction check on the same span or section element; V1's fact rule wins and the conflicting V2/V3 must-fix becomes should-fix with a note. (c) One consolidated brief to W1 per round, with disagreements listed rather than forwarded as two instructions. (d) When two reviewers still conflict after one round, raise HUMAN_ESCALATION once instead of looping.

### 6.3 Rewrites introduce new overstatements

**What happened.** Many V1 revisions were caused by the rewrite itself: "Generally yes" and "Not always." in the FAQ, "That route is closed" in s4, the s7 clm:5 scope overstatement. Rewrites also churned far more text than the cards asked for (s4 kept 18% of its sentences and grew from 296 to 412 words; s7, where the directive said change nothing beyond the listed corrections, kept 79% and needed one fix pass).

**Proposal.** (a) A churn budget per pass: W1 may change at most N sentences beyond those a card names, unless a directive says otherwise. (b) The hedge flag already catches "most", "usually", "always"; extend it to absolutes and openers ("Not always", "Generally yes", "never", "only", "that route is closed") in added sentences, checked by code before the council runs. (c) The writer prompt says a fix may not add a new legal sentence. (d) V1 re-reviews changed sentences only (already built); keep it.

### 6.4 Why EVIDENCE_REQUEST and ROOT_CAUSE_NOTE never fired on a real article

**What the data shows.** The reviewers emitted 132 cards (V3 66, V2 43, V1 23); every one was a QUALITY_CORRECTION to W1. W1 raised no ticket in 26 runs. V1 had 12 evidence-like cards ("no ledger claim supports this", "beyond clm:6") and V1's file says it may raise an EVIDENCE_REQUEST to R1, but each time it asked for rewording or deletion, which is the cheaper path and which W1 can satisfy alone. W1's file says to raise an EVIDENCE_REQUEST instead of softening or dropping an unsupported sentence; in practice W1 always removed or reworded, and once noted "R1 ticket only if the reviewer insists".

The recurring local-anchor item (12 of the 45 entries in section 4) is a **brief and library gap**: no local fact exists in the ledger or the Evidence Library, and R3 is limited to approved brand facts. The right ticket was ROOT_CAUSE_NOTE to S2 (the V3 and V2 files say to raise one when the cause is the brief), or an EVIDENCE_REQUEST to R1/R3 for local facts. Reviewers raised it as a should-fix card to the writer instead, and the writer correctly declined because it may not invent a fact.

**Proposal.** (a) A decision table in the reviewer and writer prompts: a probably-true, provable legal point is an EVIDENCE_REQUEST to R1 first; reword or drop only when it is not provable. (b) A router rule: the same finding raised in three or more units, or declined twice, converts automatically to one ROOT_CAUSE_NOTE to S2 or one HUMAN_ESCALATION ("library gap: no local fact") per article. (c) Treat a writer note "not used because no ledger claim" as an evidence-request trigger. (d) Content work, not code: add local facts to the Evidence Library so the "local" dimension (5.3 of 15 in both versions) can improve. (e) These two ticket types are proven only on fixtures (smoke test); a second real article, with a fresh draft where the ledger is incomplete, is the real test.

## 7. Follow-up tests (Task 17)

Two read-only tests asked for after the first version of this report. Both left the original article untouched (fingerprint `23f8dd72…4611`, rechecked after each).

### 7.1 V1 on the classic units

**Question.** Does V1 (the team's fact and privacy reviewer, with the hedge-phrase flag) find real problems in classic text that classic's own reviewers passed? V1 reviewed each of the nine **locked classic units** (version `4db42fea93cc`) with the same task packet the team run uses (full scope, the code-detected hedge flags, the article ledger). Nothing was queued, stored or submitted. Classic's Agent 5 had passed all nine.

**Result: V1 returned REVISION on 7 of 9 units** (s4 and s5 passed). 15 must-fix cards, 1 optional card, 13 hedge sentences ruled reword or drop (9 reword, 4 drop, 1 proven), one overstated claim check (clm:5 in s7), and the FAQ failed the legal-qualification check. Privacy was clean in all nine. 18 of 20 quoted passages appear verbatim in the unit text; the two that did not are close paraphrases of real sentences (checked by hand: s1 "Most owners want to know how fast the house can be emptied", s6 "The real question is usually not which route is best. It is which route fits your situation."). No quote was invented.

| Unit | V1 on classic (locked, unrevised): decision / must-fix / hedge rulings | V1 on classic-revised (Task 17 baseline): decision / must-fix / hedge | V1 in the team run on its rewrites: must-fix cards |
|---|---|---|---|
| s1 | REVISION / 5 / reword/reword/reword/reword/reword | REVISION / 2 / reword/reword | 0 (and it passed every unit before lock) |
| s2 | REVISION / 1 / reword | REVISION / 1 / - | 1 (and it passed every unit before lock) |
| s3 | REVISION / 1 / drop | PASS / 0 / - | 1 (and it passed every unit before lock) |
| s4 | PASS / 0 / - | PASS / 0 / - | 1 (and it passed every unit before lock) |
| s5 | PASS / 0 / - | PASS / 0 / - | 0 (and it passed every unit before lock) |
| s6 | REVISION / 2 / reword/proven/drop | REVISION / 1 / reword/proven | 1 (and it passed every unit before lock) |
| s7 | REVISION / 2 / drop | REVISION / 1 / reword | 1 (and it passed every unit before lock) |
| s8 | REVISION / 2 / reword/drop | REVISION / 1 / reword | 0 (and it passed every unit before lock) |
| faq | REVISION / 2 / reword | REVISION / 1 / proven | 7 (and it passed every unit before lock) |

**The issues on the unrevised classic text, with quotes** (V1's own words, shortened; each quoted sentence is in the unit text):

- **s1**: Unsupported generalization: "Most people in this spot are not avoiding the problem."
- **s1**: Unsupported generalization: "Most owners want to know how fast the house can be emptied."
- **s1**: Unsupported outcome generalization: "Getting clear early usually creates more options, not fewer."
- **s1**: Unsupported generalization: "The real question is usually what situation you are actually in."
- **s1**: Unsupported frequency and absolute: "A packed house is often a family matter before it is a real estate matter, and nobody should be judged for it."
- **s2**: Callout sentence "Getting clarity early usually creates more options, not fewer." is an unsupported outcome generalization.
- **s3**: Unsupported generalization: "Plenty of homes hold a lot of belongings and nobody from the city ever looks twice."
- **s6**: 'Getting these answers early usually creates more options, not fewer.' is an unsupported generalization and outcome claim.
- **s6**: 'The real question is usually not which route is best.' generalizes about sellers without support.
- **s7**: "The disclosures are made on the Real Estate Transfer Disclosure Statement form." omits the single-family residential scope, reading as a flat rule.
- **s7**: "Most owners want to know what could actually stop this sale." is an unsupported generalization.
- **s8**: "Getting clarity early usually creates more options, not fewer." is an unsupported outcome generalization.
- **s8**: "...finding out halfway through that nobody checked who could sign." is an unsupported generalization.
- **faq**: Authority answer states law flatly with no ledger claim: "Only someone with legal authority to sign." and "Living in the house does not give that authority."
- **faq**: Flagged sentence "Not always." implies a conditional legal cleanout duty with no support.

**Against the issues V1 found in the team run.** The team run's V1 reviewed the *rewritten* text, so its cards are different instances of the same few families:
- **Unsupported generalizations** ("most", "usually", "often", "nobody", "never", "Not always"). Present on the classic text in s1, s2, s3, s6, s7, s8 and the FAQ; the team's V1 raised them again on rewrites (s2 "never", s6 "None of them is wrong for everyone", FAQ "Not always."). One sentence, "Getting clarity early usually creates more options, not fewer", sits unsupported in four classic units (s1, s2, s6, s8).
- **Scope overstatements of a claim** (clm:5, clm:6, clm:7). Found on the classic s7 ("The disclosures are made on the Real Estate Transfer Disclosure Statement form" without the single-family scope). The same family reappeared in the team run on rewrites in s3 ("match conditions the statute lists"), s4 ("That route is closed") and s7.
- **Flat legal conclusions in the FAQ** (who can sign; living in the house is not authority). Present in the classic FAQ and re-raised on every FAQ rewrite.
- **Classic's Agent 5 passed all 9 units in both runs** (and passed all 9 classic-revised units too): the classic fact gate is not catching this family, while the hedge flag plus V1's must-rule step does.

**Does classic revision remove them?** No. After the classic revision baseline, V1 still returns REVISION on 6 of 9 units with 7 must-fix cards and 5 reword rulings. Examples: s1 "usually" and "nobody", s2 "Most families", s6 "usually", s7 "usually", s8 "nobody checked", and the FAQ line on authority. It is fewer than before (15 → 7), because the writer addressed some of the 50 findings, but the classic reviewers passed every one of these units first time (Agents 5, 6 and 7: 27 of 27 PASS). The team pipeline is the only variant where V1 passed the final text.

**Limits.** V1's rulings are model judgments, not legal proof; "real" here means V1 cited a sentence that is in the text and that has no ledger claim behind it (the hedge sentences are located by code, not by V1). Only two of the unmatched quotes were inspected by hand.

### 7.2 The classic revision baseline

A second real branch of the original, `54070caa-bd79-4184-a82a-9235b1c33b64`: `is_fixture` false, `branch_of` the original, `pipeline_mode` classic, the same brief and ledger copies as the team branch, and the same 50 findings (s1 7, s2 5, s3 9, s4 4, s5 4, s6 7, s7 2, s8 5, faq 7). Each unit was reopened as leo through the classic reopen, with that unit's findings as the directive, then run through the classic pipeline: writer (Agent 4), fact and privacy (5), SEO/AEO/GEO (6), editorial (7). It stopped at **HUMAN_REVIEW**, version `6cd1c5264e9c…`, with no proposal, no approval and no WordPress write. The original's fingerprint matched before and after.

- **Cost:** 37 agent runs (writer 10, Agent 5 9, Agent 6 9, Agent 7 9), 1 retry, about 329k estimated tokens (characters / 4, an ESTIMATE), about 9 minutes elapsed. The nine independent units were run in parallel here, so this elapsed time is not comparable to the team run's sequential 88 minutes.
- **Reviewer outcome:** Agents 5, 6 and 7 passed all 9 units on their first review (27 of 27). The only second writer pass was the FAQ (a deterministic 60-word limit). There were no tickets, no escalations and no budget limit.
- **What the classic loop does with optional findings:** it does not track them. The 50 went to the writer as one directive per unit; nothing records which the writer addressed or declined (the same gap as 6.1, in a different form).
- **Deviation to disclose:** one validator rejection (Agent 6, s5: an `issue_key` outside the allowed pattern) was corrected by re-running the reviewer with the exact error, with no edit by me. Two code changes preceded the run: the classic mode of `branchArticle`, and a deliberate extension of the `resolveSection` call-site pin to name `branch.ts` (it passes the caller's actor after the agent-actor refusal).

### 7.3 Blind scoring: classic-revised vs team, with an order-swapped second run

Same method as section 2 (random A/B per unit, one independent judge run per unit, the shared editorial-critic rubric, voice reference as the only context). **Round 1** used one random labelling; **round 2** judged the same texts with the A and B labels swapped, to check whether position or anchoring drives the result.

| Unit | Round 1: classic-revised / team, preferred | Round 2 (labels swapped): classic-revised / team, preferred | Same preference both rounds? |
|---|---|---|---|
| s1 | 62 / 73, **team** | 64 / 75, **team** | yes |
| s2 | 67 / 70, **team** | 69 / 65, **classic-revised** | no |
| s3 | 72 / 72, **classic-revised** | 70 / 73, **team** | no |
| s4 | 59 / 65, **team** | 54 / 66, **team** | yes |
| s5 | 68 / 67, **classic-revised** | 65 / 68, **team** | no |
| s6 | 66 / 71, **team** | 65 / 73, **team** | yes |
| s7 | 70 / 69, **classic-revised** | 70 / 72, **team** | no |
| s8 | 64 / 65, **tie** | 64 / 61, **classic-revised** | no |
| faq | 65 / 60, **classic-revised** | 68 / 55, **classic-revised** | yes |

- **Averages.** Round 1: classic-revised 65.9, team 68.0. Round 2: classic-revised 65.4, team 67.6. Combined (18 scores each): classic-revised **65.7**, team **67.8**, a difference of 2.1 points on 100.
- **Preferences.** Round 1: classic-revised 4, team 4, tie 1. Round 2: classic-revised 3, team 6, tie 0. Only 4 of 9 units got the same preference in both rounds (s1, s4, s6 team; faq classic-revised); 5 flipped.
- **Anchoring and position check.** The same text changed its score by 2.0 points on average (classic-revised) and 2.7 (team) when only the label order changed. The judges chose label A in 5 of 9 units in round 1 and 3 of 9 in round 2, so there is no strong position bias, but the swap alone moved scores by 2-3 points and flipped over half the preferences. The noise is about the size of the gap.
- **By rubric dimension** (average of 18; classic-revised | team): voice 14.4|13.8, education 13.7|14.7, deal_logic 12.8|13.9, local 5.2|5.2, structure 11.2|11.7, trust 8.3|8.5. Authenticity YES answers (of 180): classic-revised 155, team 162.
- **Against the section 2 scores.** The unrevised classic text averaged 65.6 against the team's 68.8 in the first blind comparison; the classic-revised text averages 65.7. **Revising the classic way did not move its editorial score**; the team revision sits about 2-3 points higher in every comparison, which is inside the judges' noise.

**What I take from it.** There is no reliable editorial quality difference between a team revision and a classic revision of this article. The difference that does show up is on fact and legal wording: only the team pipeline ended with a V1-clean text (7.1).

### 7.4 Cost and quality side by side

| | Classic as locked (no revision) | Classic revision (as run) | Team revision (as run) |
|---|---|---|---|
| Agent runs | 56 (drafting) | 37 (revision only) | 110 (revision only) |
| Token estimate | about 495k (drafting) | about 329k | about 1037k (3.1x the classic revision) |
| Elapsed | about 20 min | about 9 min (units in parallel) | about 88 min (sequential) |
| Blind editorial score | 65.6 | 65.7 | 67.8 (68.8 vs unrevised classic) |
| V1 must-fix cards left in the final text | 15 (7 of 9 units) | 7 (6 of 9 units) | 0 (V1 passed every unit before lock) |
| Reviewers' first-pass result | Agent 5: 9 PASS, 4 REVISION over 13 reviews | 27 of 27 PASS | V1 10 REVISION in 25 reviews; V2 3 and V3 5 |
| The 50 findings | untouched | addressed in the text, not tracked | 39 addressed, 2 partly, 9 declined with reasons |
| Tickets / escalations | n/a | none | 23 tickets, 1 escalation (budget) |

## 8. Recommendation (updated after Task 17)

Leo decides. **My recommendation is still the hybrid, and Task 17 strengthens it: classic as the default pipeline, with the team-mode V1 re-review as a mandatory gate on any text the classic loop writes or revises.**

| | Classic as locked | Classic revision (as run) | **Hybrid: classic revision + V1 gate (estimate)** | Team mode (as built) |
|---|---|---|---|---|
| Agent runs | 56 | 37 | about 58 (37 + V1 on 9 units + about 6 fixes + 6 re-checks) | 110 |
| Token estimate | about 495k | about 329k | about 515k (1.6x the classic revision) | about 1037k (3.1x) |
| Elapsed | about 20 min | about 9 min (parallel) | about 20 min (parallel units) | about 88 min (sequential) |
| Blind editorial score | 65.6 | 65.7 | about 66 (not measured) | 67.8-68.8 |
| V1 must-fix left in the text | 15 (7 of 9 units) | 7 (6 of 9) | 0 after the fix pass | 0 |
| New process risk | none | none | one extra loop | tickets, budget (10 is too small), reviewer conflicts, lost declines |

The hybrid column is an **estimate** built from this run's per-role averages: V1 about 7.8k estimated tokens per run, W1 about 11.5k. It adds one V1 pass per unit (9 runs, about 70k), about 6 writer fixes (the units V1 flagged on the classic-revised text; about 69k) and 6 V1 re-checks (about 47k) to the measured classic revision. The fix loop itself has not been run. Token figures are estimates, not billed usage.

**Why hybrid.**

1. **The measurable defect is in classic's fact gate, not in its prose.** V1 found 15 must-fix issues in the unrevised classic text and still found 7 after the classic revision, while Agents 5, 6 and 7 passed 27 of 27. These are the unsupported generalizations and scope overstatements that matter most for a legal-adjacent article.
2. **Editorial quality does not separate the two revisions.** Team 67.8 against classic-revised 65.7 on 100, with 5 of 9 preferences flipping when only the labels swapped. I would not pay for it.
3. **Cost.** The team revision used 3.1x the tokens of the classic revision and about 10x its elapsed time (the elapsed gap is inflated by running classic units in parallel; my rough estimate for a sequential classic revision is 25-30 minutes, so about 3x). The hybrid is about half the team's tokens.
4. **The team model's extra moving parts are the ones that failed** (section 6): lost declines, reviewer conflicts, a 10-ticket budget that this revision outgrew by 2.3x, and two ticket types never used on a real article.

**Why not just keep classic.** Classic leaves V1's family of defects in the text. The V1 gate is cheap and already built (hedge flag, changed-sentence scope, must-rule step).

**Why not team mode as the default yet.** Cost, no separable quality gain, and the open proposals in section 6, none of which is approved or built.

**To validate the hybrid** (proposed, not run): add the V1 gate to the classic revision path on the next real article, measure the V1 must-fix count before and after, and compare against a team-mode run of the same article only if the gain looks doubtful.

## 9. Limits of this comparison

- **Revision versus no revision: now tested once.** The first version of this report compared a revision with an unrevised draft; Task 17 added a classic revision (7.2, 7.3). The editorial result is a statistical tie; the V1 result favours the team text.
- **One article, one run each, one judge model.** Nine units; each judge run saw both texts and scored them in one call; swapping the labels moved scores by 2-3 points and flipped 5 of 9 preferences. Differences of a few points are noise.
- **Unequal conditions.** The classic revision ran its nine units in parallel; the team revision ran one role at a time. Token estimates are comparable, elapsed times are not.
- **The classic revision got the findings as free text.** Classic has no structured way to carry optional findings, so each unit's findings were sent as one directive. A classic revision with a better findings mechanism might do better.
- **V1 is one model's judgment.** It is not legal review. It cited sentences that exist in the text, but whether each is a true overstatement was not independently verified for all 27 cards.
- **Estimates.** Token figures are characters / 4 on stored packets and outputs, not billed tokens. The hybrid costs are projections.
- **Operator effects.** One s4 prompt in the team run carried a sentence of my own guidance (disclosed earlier). The classic baseline needed one re-run after a validator rejection.

## 10. Where the data is

- Team branch: `/studio/d7f03fff-22d0-48fe-9ee0-3d6d5102c856`. Classic-revision branch: `/studio/54070caa-bd79-4184-a82a-9235b1c33b64` (HUMAN_REVIEW, version `6cd1c5264e9c`). Original: `/studio/e2b915e3-af97-4ea6-8979-4861ec729027`, unchanged.
- Ticket log of the team run: `npm run studio -- team-log d7f03fff-22d0-48fe-9ee0-3d6d5102c856`. Budget exception: audit event `team_budget_exception` on the team branch.
- Judging inputs and outputs (blind texts, hidden mappings, both rounds, V1 packets and outputs for the classic and classic-revised units, per-finding verdicts, declines): in the session scratchpad, not committed.
- Rollback of either branch: `npm run studio -- branch-delete <branch_id> --yes` (guarded; refuses the original and fixtures). Neither has been deleted.
