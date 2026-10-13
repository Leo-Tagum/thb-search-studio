# THB Search Studio: standing rules

standing-rules-version: 1.0.0
owner: Leo
last-updated: 2026-10-13

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

**SR-5. Thresholds, conditions and deciders.** A rule is stated with the threshold or condition the law puts on it (for example "to an extent that endangers the life, limb, health, property, safety, or welfare of the occupants of the building, nearby residents, or the public"). Who decides is never presented as a closed list the law does not make: name every alternative the official text names (for example a health officer or, where no agreement exists, a code enforcement officer), or say "a local official, such as ...". NARROWER is acceptable only if what is omitted does not change what a reader would believe or do; record the reason either way. BROADER and WRONG are always fixed or removed before the article goes to Juan.
Source: Leo. Date: 2026-10-13.

**SR-6. No absence-of-law claims without proof.** A claim that a law does not mention, require, prohibit or address something needs evidence (the full official text read, the term absent, with section and date, recorded as its own claim of type statute_absence). Without it, remove the sentence. Never write "the statute doesn't mention X" from memory.
Source: Leo. Date: 2026-10-13.

## Hard rules

**SR-7. Privacy.** No seller-identifying data, ever: no names, addresses, prices, exact dates or quotes from sellers; no seller story unless a human cleared it for publication. Internal access is not consent.
Source: Leo (editorial standards, section 5 and the seller library rules). Date: 2026-10-10.

**SR-8. Juan approves.** No agent approves, locks or sets a state. An approval counts only from an account Leo confirmed as an approver, on the exact version. Leo is the operator and never an approver.
Source: Leo. Date: 2026-10-10.

**SR-9. Nothing is published automatically.** No WordPress write, no publication, and no approval-room change happens without Leo's explicit instruction. Approving a proposal does not publish it.
Source: Leo. Date: 2026-10-10.

## Operator rules (Claude Code working on this repo)

**SR-10.** Only act as leo on real articles. No proposal, approval, publish or WordPress action unless Leo says so in that step. No force-push. Migrations only with Leo's approval. Never change the original article (check its fingerprint, v1 and v2, before and after anything that touches an article's data). Do not contact Juan or Cherry; Leo does. Report outcomes faithfully, and stop and ask when a legal point cannot be verified.
Source: Leo, restated at each step. Date: 2026-10-13.
