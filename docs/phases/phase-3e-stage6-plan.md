# Phase 3e, Stage 6 plan: Bay Area / local law, case studies and seller stories, Bay Area framing (PLAN ONLY, nothing here is run)

Status: saved 2026-10-13 on Leo's instruction. **Not started.** It starts only after Agent 8 / D1 is built and has been dry-run on a fixture (see [phase-3e-image-planner-plan.md](phase-3e-image-planner-plan.md), build steps 1 to 10). The hoarder guide is a **pilot / configuration test, never published** (Leo, 2026-10-13), so everything in part A runs on it as a test.

Rules for every part, as always: fingerprint v2 of the original article (`23f8dd72…4611`) before and after each step; no force-push; no proposal, approval, publish or WordPress write by me; I do not contact Juan; migrations only with Leo's approval; only act as leo on real articles; no seller-identifying data (SR-7); legal claims: no guessing (SR-4 to SR-6). A step that needs an official print I do not have stops and asks Leo.

Token figures below are estimates from the measured per-run costs in the 3d and Stage 5 reports (about 54k tokens per agent run counting every category, about 25k without cache reads; the hybrid hoarder run was about 912k). They are not promises.

---

## A. San Francisco / San Mateo law, end to end, on the hoarder guide (test, never published)

**Goal:** show that the pipeline can add a short local-law section without guessing and without blending layers.

**Steps**
1. **Allowed-jurisdiction list per article.** The article gets an explicit list (for the test: California, City and County of San Francisco, and the San Mateo jurisdiction Juan names). A claim whose jurisdiction is not on the list is refused at submit. (Today `allowedJurisdictions` is a fixed `["California"]` in `service.ts`; this makes it per article, in the brief.)
2. **Agent 2** builds local claims from the Evidence Library only, each with the full record (exact quote, section, source URL, date checked, label, gates, reader impact). Where the Library has no print for a local point it does **not** guess: it returns a **print request** (jurisdiction, code, section number, title, URL) for Leo. Uses the navigation index once it exists (migration 0022, after Juan's storage decision); until then the request names the section and where to find it.
3. **Writer** adds one short San Francisco section from those claims only (and a San Mateo line only if its own claim exists).
4. **V1** checks the layers: a local rule is never presented as California law; San Francisco is never presented as San Mateo; each local sentence has its own claim and attribution; unverified points are the exact sentence "local rules vary; check with your city or county".
5. **Brand-rule check** and image-plan checks run unchanged.

**Inputs needed from Leo:** (a) which San Mateo jurisdiction applies (pending Juan: County Ordinance Code for unincorporated areas, or City of San Mateo); (b) the complete SF Housing Code table-of-contents reprint, and prints of the SF sections the section will cite (Housing Code 351 and the sections Agent 2 asks for); (c) the San Mateo prints; (d) prints of Civil Code 1102.2 and 1102.3, the disclosure form text, Penal Code 829.5 and Gov Code 10248.5 if the section touches them (the pending-prints list in [phase-3e-evidence-access-research.md](phase-3e-evidence-access-research.md)).

**Pass / fail (measured):**
- Every local sentence in the section has a claim with a complete verification record and a MATCH (or NARROWER with no reader impact) label. **Fail** if any local sentence has none.
- Print requests: for each local point whose print is missing, the output holds a correct request (right code, right section, right URL) and **no claim** is made. **Fail** if a claim appears without a print, or a request names the wrong section.
- No layer blending: zero `LAYER_LOCAL_AS_STATE` or `LAYER_CROSS_LOCAL` flags left unproven in the locked text; V1 catches a planted blend in a fixture run.
- No service-area claim anywhere (brand-rule check clean).
- The original article's fingerprint v2 is unchanged.

**Token estimate:** about 450k to 700k (Agent 2 local claims about 80k with a print request round; writer about 55k; V1 on three touched units about 165k; Agents 5/6/7 on the touched units about 150k to 300k; one revision cycle adds about a third).

**Risks:** official sites block automated access, so everything rests on Leo's prints; the first SF table-of-contents print looked partial; the revision limit (the section is reopened by a logged exception, the 4th, which Leo approves first; the guide's old s3 wording "the local enforcement authority" becomes "a local official" in the same pass); a San Mateo jurisdiction not yet chosen blocks that half; hosts' storage terms are unverified (the 3e research).

---

## B. Case studies and seller stories: two different content types

**Rules first, then tests with FAKE examples only. Real seller or deal data never enters the Studio for testing.** Every example in a test is labelled FAKE and is made-up text with no resemblance to a real deal.

### B1. Case study = the transaction
What happened to the property: condition, what was done, outcome.
- No address; no exact purchase or sale prices; no exact dates (public records could identify the property). Ranges or general terms only (for example "a purchase price in the mid-six figures", "several months").
- Neighborhood-level detail only if Juan approves it.
- **Every number is verified against our transaction records** (purchase, rehab spend, resale). An unverified number is dropped. **Verified total rehab spend currently exists for 0 of 47 deals**, so today no rehab figure can be used at all.
- Photos only if the property cannot be identified from them, and with Juan's OK.

### B2. Seller story = the scenario
"We have handled this type of situation; maybe we can help you too."
- It describes the **situation type**, not a specific person. Anonymous unless there is **written** seller permission (currently 0 on file; a verbal OK does not count).
- No promise of price, speed or outcome; no testimonial framing.
- No service-area claims until Juan confirms the cities (SR-3).

### Both types
- **No composite or invented sellers or properties, and no details added "for color".** If a detail is not in the record, it is not in the text.
- **Green / Yellow / Red / Research-only gate:** only **Green** is usable; **Yellow** is held for Juan; **Red** and **Research-only** are never used.
- Content comes **from Leo (Content HQ)**, not from agents researching sellers. Juan approves each one.

### Proposed standing rules (I propose; Leo approves before any version bump to 1.2.0)
- **SR-18. Case study (the transaction).** Facts only from our transaction records, every number verified, ranges instead of exact prices and dates, no address or neighborhood without Juan, no photo that could identify the property, no rehab figure unless verified.
- **SR-19. Seller story (the scenario).** Describes a situation type, never a person; anonymous unless written seller permission is on file; no promise of price, speed or outcome; no testimonial framing; no service-area claim.
- **SR-20. Seller-derived content gate.** No composite or invented sellers or properties, no embellishment; only Green content is used, Yellow waits for Juan, Red and Research-only are never used; content comes from Leo, Juan approves each piece; agents never research individual sellers.
(SR-7, SR-3 and SR-9 already apply and are not repeated.)

### Tests (all labelled FAKE; written as unit tests of the checks first, then through the real V1)
| Case (FAKE) | Expected |
|---|---|
| a case study containing a street address or an exact price ("$612,500") | blocked |
| a case study with a number that has no verification record | blocked or escalated to Leo |
| an exact date ("closed on March 4, 2025") | blocked |
| a seller story with a promise ("we'll close in 7 days", "we will pay cash") | blocked |
| a seller story with an identifying detail (a name, a street, a job, a family detail that points to a person) | blocked |
| an invented detail not in the record ("a sunny kitchen") | blocked |
| a clean, anonymized **Green** case study | passes |
| a clean, anonymized **Green** seller story | passes |
| a **Yellow** example of each type | held for Juan, not usable |
| a **Red** or **Research-only** example | refused |

**Inputs needed from Leo (the input format and the verification record I will need):**
- **B1, one record per case study:** record id (internal, never printed), property type, condition in plain words, what was done, outcome in general terms, purchase price **range** and its transaction-record reference, rehab spend (verified amount or "not verified") and its reference, resale **range** and reference, timeframe in general terms, neighborhood (only with Juan's approval, with the date), photo status (none / identifiable / not identifiable plus Juan's OK), gate color, Juan's approval date.
- **B2, one record per story:** situation type in plain words, what THB generally does in that kind of situation (process only), who supplied it (Content HQ reference), permission status (none / written, with the date), gate color, Juan's approval date.
- Plus, once: the list of fields in the transaction records that can be verified (today 0 of 47 deals have a verified rehab total, so I need to know which fields are trustworthy).

**Pass / fail:** every row of the table behaves as expected; **fail** on any false pass of a blocked row, or any false block of a clean Green row; the checks never write to or read from real seller data (a test asserts the check functions take only their input text and the record's fields).

**Token estimate:** the code checks and unit tests cost about 0 tokens to run; writing them is operator time. A model pass through the real V1 on the ten fixtures is about 10 × 40k to 55k, so about 400k to 550k.

**Risks:** regexes cannot recognize every identifying detail (a model check plus Leo's look stay in the loop; the checks are a floor, not proof); "range" and "general terms" are judgment calls, so the check refuses exact figures and leaves ranges to the reviewer; no verified rehab data exists, so case studies stay number-free until Leo supplies verified records; consent records for seller stories do not exist yet.

---

## C. Bay Area framing and the cannibalization check

**Goal:** show that Agent 1 and Agent 3 can give the test article a Bay Area angle without making a service-area claim, and that the check against the existing page "sell Bay Area house full of belongings" (`/sell-bay-area-house-full-of-belongings/`) runs and reports overlap.

**Steps**
1. **Agent 1** (hybrid) or S1 (team) triages the Bay Area angle for the hoarder guide (default geography per SR-1) and records the cannibalization risk against the existing page.
2. **Agent 3** (or S2) builds a Bay Area brief: the angle, an H1 and sections that address Bay Area readers without saying where THB buys (SR-3), with local-law sections tied to part A.
3. The **cannibalization check** (existing code in the opportunity and audit pipeline) runs against the existing page and reports overlap, intent difference, and whether to differentiate, merge or hold.

**Inputs needed from Leo:** whether the working title option 1 stays ("Selling a Packed or Hoarded House in the SF Bay Area: What to Disclose and Whether to Clean Out First", slug `packed-or-hoarded-house-bay-area-what-to-disclose-clean-out-first`); the current Search Console window for both pages (stored data, no new fetch); Juan's decision on whether the two pages are meant to coexist or one should absorb the other.

**Pass / fail:** the brief names its Bay Area angle and the difference in intent from the existing page; the overlap report runs and names the shared queries; **no** service-area claim, no city list, no "we buy in" wording (the brand-rule check is clean on the brief's sample text); open items list what Juan still has to confirm. **Fail** if the cannibalization check does not run, or the brief states or implies coverage.

**Token estimate:** about 120k to 180k (Agent 1 about 55k, Agent 3 about 60k to 90k, the overlap check is code).

**Risks:** two pages competing for the same query is a real ranking risk and the check is advisory; the Bay Area angle can drift into coverage language; the brief for the existing page was written before the Bay Area direction (its geography line and its experience wording were outdated; the brief must quote editorial standards section 7, see the 3e backlog).

---

## Order and gates
1. After Agent 8 is built and dry-run on a fixture: **C** first (cheapest, no new prints), then **A** (needs Leo's prints and the San Mateo choice), then **B** (rules and fake-example tests need Leo's approval of SR-18 to SR-20 first, which bumps the standing rules to 1.2.0 and re-versions the prompts).
2. Each part ends with a short report (results against its pass / fail criteria, tokens used, fingerprint v2 before and after) and stops for Leo.
3. Nothing in Stage 6 publishes anything or contacts Juan.

## Part B: built and calibrated (2026-10-14, Leo's go; FAKE data only)
- **Standing rules 1.2.0** with SR-18 to SR-20 (Leo's four edits applied: quotes only with written permission, word for word; region-level location only, a city or neighborhood only with Juan's recorded approval; only Leo changes a gate and Yellow becomes Green only after Juan's approval is recorded; process wording Juan-approved only, none exists, so a seller story describes the situation only). All 19 prompts re-referenced and re-versioned (V1 1.7.0). I also added the region allowance to SR-18, so SR-18 and SR-19 read the same.
- **Code:** `src/lib/studio/story-cards.ts` (card schema, `storyCardErrors`, `storyFindings`, `storyVerdict`), `story-fixtures.ts` (29 FAKE stories with expected verdicts), `story-agents.ts` (V1's story check shape; the code refuses a V1 PASS where the checks found something), V1 prompt section "Story check". Real story cards will live in a private table with row security, never in git; its migration (SQL and rollback) is shown to Leo before any real data.
- **Calibration** (`scripts/story-calibration.mts`, results in `phase-3e-data/stage6-partB/`): 12 FAKE stories, each its own real V1 run. Code checks agree with the expected verdict on 12 of 12; V1 on 11 of 12; no output refused by the production checks after the fixes below. About 336k subagent tokens for the 12 runs and about 60k for two reruns.
- **One open ruling for Leo:** V1 BLOCKED the clean case study (FAKE-01) because "The owner's family could no longer keep up with the home." is "a detail about a person" under SR-18. The code allows it (it is a verified fact about the situation). Either SR-18 should say whether the owner's circumstances may be described (and how), or the fixture should describe the property only.

## Part B follow-up (2026-10-14): SR-18 reason for a sale, and the approver
- **SR-18 decision (Leo):** a case study may give a brief, general, verified reason for the sale ("the owners could no longer keep up with the home"); no specifics about any person (age, health, deaths, family members, jobs, relationships, finances). Standing rules 1.3.0. Checks updated: those specifics (and "the owner's family") are blocked even when verified in the record. FAKE-01 stays the clean case study but its sentence is now the SR-18 wording ("The owners could no longer keep up with the home."): V1 blocked "The owner's family could no longer keep up..." because it names the family, which the new rule bars, so that wording is now its own blocked example (FAKE-34). New FAKE tests: FAKE-30 (allowed reason), FAKE-31 ("after her husband died"), FAKE-32 ("a retired nurse"), FAKE-33 (illness and mortgage), FAKE-34 (owner's family).
- **Through the real V1 (prompt 1.8.0):** FAKE-01 PASS (after the wording change; the first re-run with the old wording was BLOCKED), FAKE-31 BLOCKED. About 21k subagent tokens per run (3 runs, about 64k).
- **Approver (Leo, 2026-10-14):** SR-8 is now "The approver approves": Cherry (COO) approves articles, case studies and seller stories; Juan may also approve; Juan keeps brand facts, service area (so a city or neighborhood in a story), as-is wording, process wording and the Bay Area direction unless he hands them over. Story cards record `approved_by` (Cherry or Juan) and the date for Yellow to Green; a city still needs Juan's recorded approval. Studio pages and the approvers screen say "the approver (Cherry; Juan may also approve)". Cherry is registered through the one-click flow when the first real proposal goes out; she has not been contacted.
- **Calibration table now:** 13 of 13 verdicts agree for V1 and for the code. Only FAKE-01 and FAKE-31 were re-run at V1 1.8.0; the other 11 outputs were produced at 1.7.0, so the production check reports them as "refused" only because of the prompt version (they are not stale on the rules: the changes since were the approver wording and the SR-18 reason for a sale, which none of those stories touches). A full re-run at 1.8.0 costs about 250k tokens; say if you want it.

## Parts A and C: run on the hoarder guide as a TEST (2026-10-14; read-only on the database, never published; results in `phase-3e-data/stage6-partA-C/`)
**Code added:** a per-article allowed-jurisdiction list (the brief outline's `allowed_jurisdictions`, in every agent packet and checked on every claim; aliases understood: San Francisco is the City and County; the county of San Mateo is not the city of San Mateo); `print_requests` in the Agent 2 and R1 result (refused if the section is already stored, the jurisdiction is not allowed, or the URL is not an official site or known official code publisher); prompts Agent 2 and R1 1.5.0, V1 1.9.0 ("Local law layers"); two new deterministic checks the dry run showed were missing: `LOCAL_RULE_WITHOUT_CLAIM` (a sentence stating a rule of a named city or county needs a cited claim for that jurisdiction; the Phase 3d "local-fact" adversarial case is now caught by code) and "says nothing about" counted as an absence-of-law claim.
**Part A:** allowed list California, City and County of San Francisco, San Mateo County. Agent 2 (real library): 4 supported San Francisco claims from the stored Housing Code section 351 print with full records (2 MATCH, 2 NARROWER with no reader impact), 2 points left unsupported (SF unsafe conditions, San Mateo County nuisance rules), 3 print requests (SF Housing Code, SF Health Code Article 11, San Mateo County Ordinance Code), nothing researched for the City of San Mateo; 0 supported claims on a table of contents; accepted by the production checks. Agent 4 wrote a short SF unit (layered, with the exact "Local rules vary; check with your city or county." sentence), accepted by the production checks. V1 layer checks (4 runs): the writer's own unit REVISION (it caught a real defect: the writer's absence sentence "It says nothing about any other city or county."), planted blend BLOCKED, planted San Francisco = San Mateo REVISION, planted invented San Mateo rule BLOCKED (with a reference request for Leo).
**Part C:** Agent 1 recommended HOLD (demand only for generic queries, no Bay Area modifier measured, no data for the existing post) and described the Bay Area angle; Agent 3 built a Bay Area brief (PASS, accepted by the production checks) with print requests and the intent difference from the existing post in open_items. **The cannibalization check ran but had nothing to measure:** the stored Search Console window (2026-07-10 to 2026-10-07) has 0 query rows for /sell-bay-area-house-full-of-belongings/ (both agents said so). Leo needs to supply that page's Search Console data, or confirm it has no impressions, before a keep-apart decision can rest on data.
**Notes for Leo:** (1) the stored "SF Health Code - Article 11 - Table of Contents" print holds body text and its section numbers disagree with its own table, so it should be reprinted cleanly; (2) Agent 3's brief says the ledger has no California-law claims only because this test fed it the local claims alone (the state prints are in the library); (3) one V1 run said it had applied the rules from the packet without opening its prompt file, so V1 compliance with the prompt is worth watching.

