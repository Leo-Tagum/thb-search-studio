# Phase 3c comparison: judging data

Inputs and outputs behind `../phase-3c-comparison.md` (sections 2, 3, 4, 5 and 7). Everything here is generated from the real run on the hoarder guide; nothing was edited by hand. Read it with the report open: every number in the report traces to a file below.

**Privacy check (done before committing).** Scanned for seller names, street addresses, prices, contact details, keys and local paths. The text is generated article copy built only from the claim ledger and approved brand facts (no seller story is cleared for this article). The only personal-looking content is Twin Home Buyer's own approved company details (business address, phone, website) inside the task packets, an internal blocklist line that mentions "$32M+" (company claims that are PENDING JUAN, already present in the repo's code), and "Leo" as the operator. No seller data.

**The articles.** Original (classic, untouched): `e2b915e3-af97-4ea6-8979-4861ec729027`, version `4db42fea93cc`. Team branch: `d7f03fff-22d0-48fe-9ee0-3d6d5102c856`, version `d93053c44bb1`. Classic-revision branch: `54070caa-bd79-4184-a82a-9235b1c33b64`, version `6cd1c5264e9c`.

| Folder | What it is | Report section |
|---|---|---|
| `1-blind-original-vs-team/` | Blind scoring of the unrevised classic text vs the team text. `judge-texts-and-scores/` holds the A/B texts the judges saw, the voice reference, and each judge's JSON in `out/`. `mapping.json` is the A/B assignment that was **withheld from the judges** while they scored; `unblinded.json` is the result. Also the rendered classic and team texts and the sentence diffs (`diffs.md`, `diff-stats.json`). | 2, 5 |
| `2-findings-and-declines/` | The 50 seeded findings (`findings.json`), the 39 new items (`final-items.json`), and `per-unit-checks/`: one input file per unit, the per-finding verdicts (`out/`, `verdicts.json`), the 10-item sample check, all 26 writer change notes, and the compiled decline list (`out/declines.json`). | 3, 4 |
| `3-v1-on-classic-text/` | V1 task packets (`V1c-*-packet.json`), the unit text each saw, V1's outputs (`V1c-*-out.json`) and `analysis.json` for the nine **locked classic units**. Read-only; nothing was queued or stored. | 7.1 |
| `4-v1-on-classic-revised-text/` | The same for the nine units of the classic-revision branch (`V1r-*`). | 7.1 |
| `5-blind-classic-revised-vs-team/` | Blind scoring of the classic-revised text vs the team text. `round-1/` and `round-2-labels-swapped/` hold the texts and scores; `mapping-round-1.json` is the withheld assignment (round 2 is the same texts with labels swapped); `unblinded2.json` is the combined result; `c2-text.json`, `team-text.json`, `meta.json`, `c2-article.json`. | 7.3 |
| `6-usage-and-team-run/` | Run counts, retries and the token estimate (characters / 4; an ESTIMATE, not billed usage) for the classic original, the team run and the classic revision, and the team run's V1 cards. | 1, 7.2, 7.4, 8 |

**Method notes.** Judges were general-purpose agents given only the two texts and the voice reference, one run per unit, scoring both versions with the editorial-critic rubric shared by Agent 7 and V3. V1 reviews used the team V1 role file and a packet built like a team packet (full scope, code-detected hedge flags, the article ledger). The classic revision ran the classic pipeline (Agents 4 to 7) on the branch. Limits are in section 9 of the report.
