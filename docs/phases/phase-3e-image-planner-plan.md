# Phase 3e: Image planner (Agent 8 / D1), the Image board, and the Evidence Library navigation index

Status: PLAN, approved by Leo on 2026-10-13 with the answers below. Nothing in this plan is built. The build starts after Leo accepts Stage 5 (calibration with the real V1) and follows the build order in section 6, stopping at migration 0021 for Leo's approval.

Drafted in a read-only session while Phase 3e stage 4 was finished; checked against the finished Stage 4 on 2026-10-13 (commit `85640be`, standing rules v1.0.0, 17 agent prompts). Corrections that check produced are in section 5.

## 1. Leo's answers (2026-10-13)

| Question | Answer |
|---|---|
| Lawrence's access | Leo invites Lawrence as **Editor** on his image board (uploads need Editor, not Contributor). |
| Image rules | Add them as **standing rules SR-11 and on**. Leo approves the standing-rules version bump (1.0.0 to 1.1.0); the version test must keep passing. Done at build step 1 (section 6), together with the prompt re-versioning, not before Stage 5 finishes. |
| Storage | **B (board inbox) to A (Supabase bucket, the master) to C (WordPress, at publish only).** Migration 0021 (tables and bucket): the SQL and its rollback are shown to Leo first; Leo approves before it is applied. |
| Vision check | A **flagging aid only**. Leo's own look at every image is the real check. |
| Pilot | A **fixture dry run first**, then the **hoarder guide as part of the Bay Area / local-law revision**, so text, local law and images go to Juan in **one approval**. |

## 2. The plan (from the read-only session)

### 2.1 Position and the "never touch text" guarantee
- **Hybrid:** Agent 8 runs after Agent 7, once all units are locked and the article is assembled. It reads the assembled locked units. **Team:** a new Design role D1, after the council passes everything.
- **No new article state.** The image plan has its own status: PLANNED, V1_CHECKED, ON_BOARD, IN_PROGRESS, ALL_DONE, LEO_CHECKED. Proposal creation waits for LEO_CHECKED, or for Leo's explicit "no images".
- **Read-only:** the planner's packet carries locked units and their hashes. Its output schema is strict: any key such as `unit`, `revised_unit` or `approved` is rejected. It cannot unlock or reopen anything.
- **Text proof:** an image-bearing version stores a text-only hash next to the full hash. A test strips the figures from the final HTML and requires a byte-for-byte match with the text-only render.
- **Stale plans:** if a unit is later reopened and relocked with a new hash, the cards anchored to it are marked STALE. Uploads are kept; the planner re-runs only for those cards.

### 2.2 Card schema (one strict zod object, shared by Agent 8 and D1)
Output wrapper: the usual envelope (article id, prompt version, decision) plus `result.cards[]` and `result.skipped_units[{unit_key, reason}]`.
Card fields: `card_id`, `unit_key`; `anchor` {after: heading or block, block_index} tied to the unit hash; `type` (infographic, diagram_flowchart, checklist_graphic, comparison_graphic, illustration, stock_photo, icon_set); `purpose`; `designer_description` in plain words; `image_text[]` (lines copied verbatim from locked text, each with `source_unit` and `source_block`); `claim_ids[]` (required when any line states a legal point); `alt_text` (also states no fact the article does not state); `aspect_ratio` with a size in pixels; `priority` (must_have or nice_to_have); `privacy_notes`.
Proportion limits: at most 1 card per unit; at most about half the units get a card; hard cap of 6 cards per article, at most 3 must-haves; the FAQ gets no card; skipping a unit is a normal result and needs a one-line reason. For the hoarder guide (9 units) expect 3 to 5 cards.

### 2.3 Code checks at submit (same pattern as `checks.ts` and `legal-flags.ts`)
- **Verbatim text:** every `image_text` line must be a contiguous substring of the plain text (`parseInline(...).plain`) of its named source block, after whitespace normalization only. No paraphrase, no new words, no new numbers.
- **Legal lines:** a line flagged by `legal-flags` must be a whole sentence, table cell or list item, never a fragment, so a threshold or decider cannot be dropped (SR-5). Its source unit must cite the claim ids on the card.
- **Numbers and money:** no figure in the text, description or alt text unless it is in the locked text. No chart cards with data values, so no invented numbers or charts.
- **Brand and service area (SR-3):** no map, city names as "where we buy", landmark or skyline imagery implying coverage, or "serving X" badges; no rating, review count, BBB badge, hours, closing-time promise or "as-is" promise; brand text only if it is verbatim locked text.
- **Law layers (SR-2):** a state-versus-local comparison graphic keeps the layers separate, each with its own claim; a local rule never appears under a "California law" label; no "SF = San Mateo" implication.
- **Privacy (SR-7):** no seller photos, faces, house numbers, addresses, documents or license plates; stock photos generic, no identifiable people; nothing demeaning about a person's home.
- **Banned imagery:** no quotation-mark speech bubbles, no before-and-after of a real home.

### 2.4 Prompt files
`.claude/agents/thb-08-image-planner.md` (hybrid) and `.claude/agents/thb-d1-image-planner.md` (team), each starting at 1.0.0 with the standing-rules reference. They share one Rules body, with a test that compares the two (as for V1 and Agent 5). Inputs: locked units with hashes, the claim ledger for those units (quotes and gates), approved brand facts, the standing rules, the brief's link plan, the proportion limits. Code: register keys, versions and metadata (`STUDIO_AGENT_META`, `TEAM_PROMPT_VERSIONS`), add them to the version-agreement test, add them to the `/thb-run-agent` table. V1 gets a new task mode, "image text check" (prompt 1.3.0 to 1.4.0, change listed at build time); the code refuses a PASS if a legal-flagged line has no quote comparison or its label is not MATCH.

### 2.5 Lawrence's Image board
One artifact per article, separate from the Approval Room, shared with Lawrence as Editor. It shows the article as readers will see it, with a card at each placement, built with the assets, db and user capabilities (the artifact-design skill is loaded first). Each card shows type, purpose, description, exact text, alt text, size and priority; a suggested file name `<slug>_<unit>_<short-name>_v<n>.<ext>`; an upload button; "mark done"; a note box. A re-upload becomes v2, v3, ...; nothing is overwritten. Limits (from the capability docs, to be re-verified at build time): assets are capped at 20 MiB, SVG at 2 MiB (sanitized); uploads are for Editors and up. Cards are seeded with ArtifactData into a db collection; each upload row stores the asset id, file name and version; Lawrence writes done and notes only under his own paths. The board is held until V1 has checked the text (no draft cards shown).

### 2.6 The Studio pulls the uploads
`npm run studio -- images-pull <article>` lists the board's rows and downloads each asset. Per image it records SHA-256, size, MIME type, pixel dimensions, its card id, version number, the article text hash, who uploaded it and when. Per file: allowed format (PNG, JPEG, WebP, SVG) and size limit; reject animated or oversized files; strip EXIF (GPS data in a photo is an address leak); sanitize SVG (no script). **Vision check (flagging aid only):** read each image and transcribe the visible text; code compares it exactly with the card text; any extra or changed line is flagged to Leo; a flag also goes up if the image seems to show a face, an address or number, a document or a license plate. It is a model judgment, not proof; Leo's own look is the real check.
**Insertion:** the article HTML gets a `<figure>` with `<img>`, alt text and an optional caption at the anchor. `auditHtml` (in `src/lib/studio/template.ts`) currently allows no `img`, `figure` or `figcaption` and no figure class; those are added. `src` in the stored HTML is a token such as `studio-image:<image_id>#<sha256>`, never a URL, so the hash pins the exact bytes; real URLs are resolved for the preview and at publish.

### 2.7 Storage
A. Supabase Storage, a new private bucket `article-images` (the evidence bucket's pattern): the durable master; path `articles/<id>/<card>/v<n>_<sha>.<ext>`, never overwritten; signed URLs for the preview. B. Artifact asset store: the inbox Lawrence uploads to; the asset id is stored in the database and the file is copied to A on pull. C. WordPress media: the public copy, uploaded only at publish (a WordPress write, blocked until Leo says so). **Decision: B to A to C.**

### 2.8 Approval path
Planner runs; V1 checks the card text; the board goes to Lawrence; images are pulled and checked; **Leo checks them** (a "Leo checks images" step sets LEO_CHECKED); the proposal is created from the image-bearing version; Juan approves text and images **together in one Approval Room visit**. One approval item: a single approval hash covers text plus images; `approvals.ts` and `classifyRecord` stay unchanged. The Room preview shows the figures inline (signed, short-lived preview URLs; the hash does not depend on them). The collapsed "Notes for AI and the team" gets one row per image (card, file name and version, short sha-256, the exact image text next to the locked sentence it was copied from, claim id and legal label), a line "image text matches locked wording: yes/no", the vision flags and Leo's check note, the Agent 8 / V1 / board history, and an explicit line that no seller photo or identifying detail was uploaded. A re-upload after a proposal exists changes the hash and supersedes it, like a text edit.

### 2.9 Database (migration 0021: shown to Leo with its rollback first; applied only after approval)
`image_plans(id, article_id, text_version_hash, status, agent_run_id, created_at)`; `image_cards(id, plan_id, card_key, unit_key, unit_hash, anchor, type, purpose, description, image_text jsonb, claim_ids, alt_text, aspect, priority, state)`; `image_uploads(id, card_id, version_no, file_name, storage_path, asset_id, sha256, bytes, mime, width, height, uploaded_by, vision_seen_text, vision_flags, leo_check, created_at)` with unique(card_id, version_no). RLS forced, no policies, as in 0012. The plan never writes to `article_sections`. The bucket `article-images` is created by the same step.

### 2.10 Tests
A line that is not verbatim locked text is refused (paraphrase, one changed word, a new number). Legal-flagged fragments are refused; a whole sentence with its claim passes. A line that drops a threshold or decider fails (the hoarder clm:8 case as the fixture). A card with a map, city, service-area badge, rating or brand claim is refused. A local rule under a California-law label, or one city standing in for another, is flagged. Output carrying `unit`, `revised_unit`, `approved` or `locked` is rejected. Skipping a unit with a reason is accepted; more than the cap is refused. The text-only render of an image-bearing article matches the text-only hash byte for byte. Image tokens pass `auditHtml`; a style, event handler or bad `src` is rejected. A v2 re-upload keeps v1. A STALE card appears when its unit hash changes. EXIF is stripped; a script in an SVG is refused. The two prompt files share one Rules body and the version test passes. Adversarial fixtures through the real V1: an invented figure, a cut legal line, an address in a stock-photo description. Fingerprint v1 and v2 unchanged on the original article.

### 2.11 Token cost per article (estimates from the measured per-agent figures in the 3d report: about 54k per agent run, all categories, about 25k without cache reads)
Agent 8 / D1 once: about 60k (28k without cache reads). V1 image-text check: about 55k (25k). Typical total about 115k (53k). One revision cycle adds about the same again. Vision reads add about 10 to 25k. Range: 115k typical, up to about 250k with a revision and vision; about +13% against the hoarder hybrid run (912k). Zero tokens: the board, the pull, the insertion and the checks in code.

## 3. Evidence Library navigation index (Leo's addition, 2026-10-13)

**What:** a new evidence source type, **"navigation index"**, built from Leo's official table-of-contents prints. It lists, for each section: chapter, section number, title and official URL. It is labelled **"derived navigation aid, not legal evidence"**. **Claims may never cite it** (a submit check refuses a claim whose source is a navigation index; no evidence passages are made from it).

**Why:** official sites block automated access (leginfo and the city and county code hosts return 403), so agents cannot fetch sections themselves. Agents use the index to produce a **print request for Leo**: the exact sections and URLs to print. **Claims come only from Leo's section prints.** A legal point whose section is not printed stays unverified and blocked; **nothing is inferred from a title.**

**First index:** the SF Housing Code, once Leo uploads the complete table-of-contents reprint (the first print looks partial: 1 passage of 1,114 characters). Later: SF Health Code Article 11 and the San Mateo codes (County Ordinance Code, City of San Mateo).

**Build notes and constraints (to settle at build time):**
- A migration is needed (a source kind on `evidence_sources`, and a table for the index entries); it is shown to Leo with its rollback first, like 0021.
- Section URLs: the code hosts use opaque ids (for example `0-0-0-537`), so a URL cannot be derived from a section number. It can come only from the print itself if the PDF keeps its link annotations (plain text extraction drops them). The first reprint is the test. If the links are not in the print, the index records chapter, number, title and the table-of-contents page URL, and the print request says "find section N by title on that page".
- The print request is an output field of Agent 2 and R1 (and V1's `leo_reference_needed`), listing jurisdiction, code, section number, title and URL taken from the index.
- Built **after Stage 5** and planned alongside the Agent 8 build; not built before.

## 4. Pilot and the revision count
- **Fixture dry run first** (no real article), then the **hoarder guide**: images ride in the same revision cycle as the Bay Area / local-law work, so text, local law and images reach Juan in one proposal.
- Image insertion after the text locks does not reopen a section, so it does not use a revision exception: the assembled article at HUMAN_REVIEW with no approval can take a new version (`recordEdit` changes the hash; the revision count changes only for an edit after sign-off). The one exception in the Bay Area plan (the 4th) covers the text and local-law reopen; images follow once the units lock again. If an approval already existed, an image edit would supersede it and count as a revision, like a text edit.
- Proposal `d5d477d7…` is still open in the database (the Approval Room is on hold). It is superseded by the 4th exception's script, not by the images.

## 5. Checked against the finished Stage 4: what the plan assumed wrongly, and the fixes

1. **"Not sure Stage 4 is finished."** It is: commit `85640be`, tests, `tsc` and `eslint` pass. Standing rules are v1.0.0, SR-1 to SR-10, and 17 prompts load them.
2. **Standing rules need a bump for the image rules.** The image rules become SR-11 and on (privacy, brand and service area, law layers, verbatim text, banned imagery), so `standing-rules-version` goes to 1.1.0. That changes: the file, `STANDING_RULES_VERSION`, and the `standing_rules_version:` line plus the "standing-rules version X" text in **every** prompt (now 19 with the two image prompts). Under the policy adopted in Stage 4 (any prompt text change bumps its prompt version), all prompts get a version bump again, and V1 goes 1.3.0 to 1.4.0 in the same pass. This is why the bump is done at build step 1, after Stage 5 has calibrated V1 1.3.0, so the calibrated text is not changed underneath the calibration.
3. **`standing-rules.test.ts` hard-codes 17 prompt files** (`expect(files.length).toBe(17)`) and builds its expected-version map from `AGENT_META`, `STUDIO_AGENT_META`, `TEAM_PROMPT_VERSIONS` and `V1_PROMPT_VERSION`. The two new keys must be registered in those, and the count becomes 19.
4. **V1's "image text check" mode is not a small addition.** V1's schema is the unit-review schema (`claim_checks`, `hedge_rulings`, cards). An image check needs its own result shape, like R1's evidence-versus-fetch split (`teamSchema` has two keys for R1), so it should be a separate schema key and a separate section of the V1 prompt, not a flag on the unit review. The V1 prompt is shared by the classic and team paths; both must accept it.
5. **The Stage 3 flags are per sentence of the article text.** The image-line check can reuse `legalKindsOf`, `deciderFindings` and `rolesIn` on the card lines, but the "legal line must be a whole sentence" check is new code.
6. **`auditHtml` and the template are in `src/lib/studio/template.ts`** (a tag allowlist and a class allowlist; it rejects inline style and event handlers). `img`, `figure`, `figcaption` and one figure class need adding, with a stricter rule for `src` (the token pattern only).
7. **The Approval Room template** was redesigned after the plan was drafted (the plain-English top, the one-time voice question, the collapsed notes). The image display goes in "The guide, as readers will see it" and the notes section's image table; the top stays untouched.
8. **Migration numbering:** the next migration is 0021 (0020 is the legal-claim verification columns). The navigation index needs its own migration (0022 or inside 0021, Leo decides when shown).
9. **Fingerprints:** use fingerprint v2 (reported next to v1) for every "original unchanged" check; `evidence_*` and the new image tables are not in the fingerprint parts.
10. **Hoarder pilot:** the plan said images "supersede the open proposal"; correct statement in section 4.
11. **The `/thb-run-agent` skill** is `.claude/commands/thb-run-agent.md`; its role table and classic agent list need the two new agents.
12. **Items I could not verify here:** the Artifact capability limits (20 MiB assets, 2 MiB SVG, Editor-only uploads) come from the read-only session's reading of the capability docs; re-check them with the `artifact-capabilities` skill at the start of the board build.

## 6. Build order (starts after Leo accepts Stage 5)

1. **Docs and standing rules:** standing rules SR-11 and on, version 1.1.0 (Leo approved the bump), all prompts re-referenced and re-versioned, tests updated.
2. Schema, checks and tests (card schema, verbatim, legal-line, brand, privacy, layer checks), with no migration applied.
3. Prompt files (Agent 8, D1), registration, `/thb-run-agent`, then V1 1.4.0 with the image-check schema key.
4. **Migration 0021 (tables and bucket): SQL and rollback shown to Leo; stop for approval before applying.**
5. Renderer and `auditHtml`.
6. The Image board artifact (after the capability re-check and the artifact-design skill).
7. The pull-and-insert CLI.
8. The Approval Room changes.
9. Navigation index: its migration shown for approval, then the index builder and the print-request output (planned alongside, built after Stage 5, using Leo's complete SF Housing Code table-of-contents reprint).
10. A dry run on a fixture article, with no real article touched; then the hoarder guide inside the Bay Area / local-law revision.

## 7. Still open
- Leo uploads the complete SF Housing Code table-of-contents reprint, and tells me when it is in.
- Leo invites Lawrence as Editor when the board exists.
- Which San Mateo jurisdiction applies (pending Juan).

## 8. Decisions and build progress (Leo, 2026-10-13)
- **Decision (Leo, 2026-10-13): Agent 8's image-storage workflow is independent of legal-source storage. Migration 0021 requires separate approval.** Resolved: the open question of whether image storage waits for Juan's legal-source storage decision is closed; it does not.
- **Migration 0021:** approved in principle with two changes, both made in the preview ([migration-0021-PREVIEW.sql](phase-3e-data/migration-0021-PREVIEW.sql), [rollback](phase-3e-data/migration-0021-PREVIEW-rollback.sql)): plan statuses PLANNED, V1_CHECKED, ON_BOARD, IN_PROGRESS, ALL_DONE, LEO_CHECKED, STALE, SUPERSEDED (card states to match); bucket `article-images` limited to 10 MB per file and PNG, JPEG, WebP and SVG. **Not applied.** Applies only after build steps 1 and 2 are reported and Leo gives the final go.
- **Navigation index:** a separate migration (0022), later, after Juan's storage decision.
- **Build step 1 done:** standing rules 1.1.0, image rules SR-11 to SR-17, all 17 prompts re-referenced and re-versioned (each minor +1; V1 1.4.0), R1, Agent 2 and R3 quote-length text corrected from 400 to the code's 1200 characters, version test passing.
- **Build step 2 done:** `src/lib/studio/image-cards.ts` (strict card schema and the checks) with tests; `src/lib/studio/brand-check.ts` (brand-rule check on every assembly, wired into `advanceArticle`) with tests. No migration, no prompt files for Agent 8 or D1 yet (step 3).

- **Migration 0021 applied (2026-10-13, Leo's go):** tables `image_plans`, `image_cards`, `image_uploads` (RLS enabled and forced, no policies, service role only) and the private `article-images` bucket (10 MB, PNG/JPEG/WebP/SVG); rollback in `supabase/rollbacks/0021_image_planner.down.sql`. Verified: anon and authenticated roles have no table privileges (HTTP 401 on read and write), the bucket is private and not publicly readable, anon list returns nothing and anon upload is refused by storage RLS (no policies on `storage.objects`, the same as the evidence bucket).
- **Card fields added at build step 3:** `generation_prompt`, `avoid`, `text_overlay` (renamed from `image_text`). The applied table still has `image_text` and no columns for the first two: [migration-0022-image-card-fields-PREVIEW.sql](phase-3e-data/migration-0022-image-card-fields-PREVIEW.sql) (not applied, needs Leo's approval; the navigation index moves to 0023).
- **Build steps 3 and 4 done** (commits d23e300, c7711ff): prompt files `thb-08-image-planner` and `thb-d1-image-planner` (one shared rules body, tested), registration and output schema, V1 image text check (prompt 1.5.0), renderer and `auditHtml` for figures, strict `img` and `studio-image` tokens, text proof by `stripFigures`.
- **Build step 5:** the Image board page, template `src/image-board/template.html`, builder `scripts/build-image-board.mts`, fixture `docs/phases/phase-3e-data/image-board/fixture-board.json` and screenshots beside it. **Stops here for Leo's approval of the interface. Not published, not shared with Lawrence.**
