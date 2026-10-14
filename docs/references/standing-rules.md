# THB Search Studio: standing rules

standing-rules-version: 1.3.1
owner: Leo
last-updated: 2026-10-14 (1.3.1: SR-10 operator rule, never overwrite, delete or move an untracked or uncommitted file without asking Leo; 1.3.0: the approver is Cherry, Juan may also approve; SR-18 general reason for a sale)

Every agent prompt and the operator (Claude Code) load this file first. Where it conflicts with anything else, these rules win. Only Leo changes it. A change bumps the version above, the constant `STANDING_RULES_VERSION` in `src/lib/agents/standing-rules.ts`, and the `standing_rules_version:` line in every agent prompt in `.claude/agents/` (a test fails until they all agree).

If a rule stops you from finishing: STOP and ask Leo. Never guess around a rule, never soften a legal point into vagueness, never move on.

## Geography and the layers of law

**SR-1. Default geography: the San Francisco Bay Area.** Address Bay Area readers. Local examples and links appear only where they are real and sourced (a real THB page, a real official page).
Source: Juan (CEO), relayed by Leo. Date: 2026-10-13.

**SR-2. State law and local law are separate layers, each with its own source.** State-level law is cited as California law. A local rule (a city or county) is stated only from its own official city or county print and its own claim, attributed to that city or county. Never imply a city or county rule is the same as California law, or that one city's or county's rule matches another's (San Francisco and San Mateo included). Where a local rule is not verified, say exactly "local rules vary; check with your city or county", and do not fill the gap.
Source: Juan (CEO), relayed by Leo. Date: 2026-10-13.

**SR-3. No service-area claims until Juan confirms the cities.** Address Bay Area readers, but never say where Twin Home Buyer buys. Hours, closing time, ownership, license, address versus service area and the other PENDING JUAN items stay out of every article (`docs/references/editorial-standards.md`, section 7).
Source: Juan, open item (exact cities pending). Date: 2026-10-10, restated 2026-10-13.

## Legal claims

**SR-4. Legal claims: no guessing.** Every legal claim (what a statute, code or ordinance says, requires, allows, prohibits, lists or defines, and who decides) is checked against the OFFICIAL text, as Leo's official print stored in the Evidence Library (leginfo.legislature.ca.gov, or the official city or county code), quoted exactly with its section and subsection. Summaries, blogs, law-firm pages and memory are not verification. Each claim records the exact quote, the section, the source URL, the date checked, and a label: MATCH, NARROWER, BROADER or WRONG. If the official text cannot be reached, the wording is unclear, or you are not sure it applies: STOP and ask Leo for a reference (a missing official print means asking Leo for one). Do not guess, do not soften, do not move on.
Source: Leo. Date: 2026-10-13.

**SR-5. Thresholds, conditions and deciders.** A rule is stated with the threshold or condition the law puts on it (for example "to an extent that endangers the life, limb, health, property, safety, or welfare of the occupants of the building, nearby residents, or the public"). Who decides is never presented as a closed list the law does not make: name every alternative the official text names (for example a health officer or, where no agreement exists, a code enforcement officer), or say "a local official, such as ...". NARROWER is acceptable only if what is omitted does not change what a reader would believe or do; record the reason either way. BROADER and WRONG are always fixed or removed before the article goes to the approver.
Source: Leo. Date: 2026-10-13.

**SR-6. No absence-of-law claims without proof.** A claim that a law does not mention, require, prohibit or address something needs evidence (the full official text read, the term absent, with section and date, recorded as its own claim of type statute_absence). Without it, remove the sentence. Never write "the statute doesn't mention X" from memory.
Source: Leo. Date: 2026-10-13.

## Hard rules

**SR-7. Privacy.** No seller-identifying data, ever: no names, addresses, prices, exact dates or quotes from sellers; no seller story unless a human cleared it for publication. Internal access is not consent.
Source: Leo (editorial standards, section 5 and the seller library rules). Date: 2026-10-10.

**SR-8. The approver approves.** No agent approves, locks or sets a state. Articles, case studies and seller stories are approved by the approver: Cherry (COO); Juan may also approve. An approval counts only from an account Leo confirmed as an approver, on the exact version. Leo is the operator and never an approver. Juan keeps the business and brand decisions (brand facts, service area, as-is wording, process wording, the Bay Area direction) unless he hands them over; the approver does not decide those.
Source: Leo (change of 2026-10-14; before that, Juan approved). Date: 2026-10-14.

**SR-9. Nothing is published automatically.** No WordPress write, no publication, and no approval-room change happens without Leo's explicit instruction. Approving a proposal does not publish it.
Source: Leo. Date: 2026-10-10.

## Operator rules (Claude Code working on this repo)

**SR-10.** Only act as leo on real articles. No proposal, approval, publish or WordPress action unless Leo says so in that step. No force-push. Migrations only with Leo's approval. Never change the original article (check its fingerprint, v1 and v2, before and after anything that touches an article's data). Do not contact Juan or Cherry; Leo does. Never overwrite, delete or move an untracked or uncommitted file without asking Leo first (a file git does not have cannot be recovered; read it and ask, or write to a new name). Report outcomes faithfully, and stop and ask when a legal point cannot be verified.
Source: Leo, restated at each step. Date: 2026-10-13.

## Images (Phase 3e image planner, Agent 8 / D1)

**SR-11. Image text is the locked text, word for word.** Every line of text inside an image is copied exactly from a named locked block of the article (whitespace aside): no paraphrase, no new words, no new numbers, no figure, chart value or statistic that the article does not state. Alt text and captions state no fact the article does not state.
Source: Leo (image planner plan, section 2.3). Date: 2026-10-13.

**SR-12. A legal line in an image is a whole sentence with its claim.** A legal point shown in an image is a whole sentence, table cell or list item from the locked text, never a fragment, so a threshold, condition or decider cannot be dropped (SR-5). The card cites the claim ids that verify it, and V1 checks it as it checks article text (label MATCH).
Source: Leo (image planner plan, section 2.3). Date: 2026-10-13.

**SR-13. Images make no brand or service-area claim.** No map, no city names presented as where we buy, no skyline or landmark imagery implying coverage, no "serving X" badge, no rating, review count, BBB badge, hours, closing-time promise or "as-is" promise (SR-3 and editorial standards section 7). Brand text appears only if it is verbatim locked text.
Source: Leo (image planner plan, section 2.3). Date: 2026-10-13.

**SR-14. Images keep the layers of law apart.** A graphic comparing state and local rules keeps each layer separate with its own claim. A local rule never appears under a "California law" label, and no image implies one city's or county's rule equals another's (SR-2).
Source: Leo (image planner plan, section 2.3). Date: 2026-10-13.

**SR-15. Images carry no private or identifying detail.** No seller photos, faces, house numbers, addresses, documents or license plates; stock photos are generic with no identifiable people; nothing demeaning about a person or a home. Uploaded photos have their metadata (EXIF, GPS) removed before they are stored (SR-7).
Source: Leo (image planner plan, section 2.3). Date: 2026-10-13.

**SR-16. Banned imagery.** No quotation-mark speech bubbles, no before-and-after of a real home, no invented charts or data, no testimonial framing.
Source: Leo (image planner plan, section 2.3). Date: 2026-10-13.

**SR-17. Images never change the text, and Leo checks every image.** The image planner never edits, unlocks or reopens article text. The image check by the model (reading the picture) is a flagging aid only; Leo looks at every image himself before any proposal. An image added or replaced after a proposal exists changes the approval hash and supersedes the proposal, like a text edit.
Source: Leo (image planner plan, sections 2.1 and 2.5). Date: 2026-10-13.

## Seller-derived content (case studies and seller stories; Stage 6, part B)

**SR-18. Case study (the transaction).** A case study tells what happened to one property: its condition, what was done, the outcome. It is written only from a record Leo supplies and only from facts in our transaction records. Every number or fact is marked verified against a named record, or it is dropped. An unverified figure is never written, rounded or estimated. A rehab amount appears only if a verified total exists for that deal. It may give a brief, general, verified reason for the sale (for example "the owners could no longer keep up with the home"), but no specifics about any person: no age, health, deaths, family members, jobs, relationships or finances. Never include: an address; a city or neighborhood unless Juan approved it for that case (recorded; it is a service-area decision, so it stays Juan's; a region such as "the Bay Area", "the Peninsula" or "the East Bay" is allowed); exact purchase, rehab or resale prices (use ranges or general terms such as "a mid-six-figure purchase"); exact dates (use "several months"); or anything that could identify the property from public records. Photos only if the property cannot be identified from them and the approver approved them. No promise or implied result for the reader.
Source: Leo (Stage 6 plan, part B; edits 2026-10-14). Date: 2026-10-14.

**SR-19. Seller story (the scenario).** A seller story shows that Twin Home Buyer has handled a type of situation: "we've handled situations like this; maybe we can help you too." It describes the situation type, never a person: no name, family detail, job, age, timeline or other detail that could point to someone. Location is region-level only ("the Bay Area", "the Peninsula", "the East Bay"); a city or neighborhood only with Juan's recorded approval, as in SR-18. It is anonymous unless written seller permission is on file (a verbal OK does not count; none is on file today). A quotation is allowed only with written seller permission on file, quoted word for word and never edited; today there is none, so no quotes. There is no promise or implication about price, speed, outcome or what we will do for the reader, no testimonial framing, and no service-area claim or "we buy in ..." (SR-3). "What we generally do" uses Juan-approved process wording only; none exists yet, so until Juan approves one a seller story describes the situation only, not our process.
Source: Leo (Stage 6 plan, part B; edits 2026-10-14). Date: 2026-10-14.

**SR-20. Seller-derived content gate (both types).** No composite or invented sellers, properties, deals or quotes, and nothing added "for color": if a detail is not in the record, it is not in the text. Content comes only from Leo (Content HQ); agents never research, search for or contact sellers and never look for deal data themselves. Each piece carries a gate color: Green (verified and cleared; the only color that is used), Yellow (held for the approver), Red (never used), Research-only (background for understanding, never published or paraphrased). Only Leo changes a gate; Yellow becomes Green only after the approver's approval is recorded; no agent sets or changes a gate. The approver (Cherry; Juan may also approve) approves each case study and seller story, as part of approving the article that contains it. Juan-only decisions that a story depends on (brand facts, service area and so a city or neighborhood, as-is wording, process wording) stay Juan's. Internal access is not consent (SR-7).
Source: Leo (Stage 6 plan, part B; edits 2026-10-14). Date: 2026-10-14.
