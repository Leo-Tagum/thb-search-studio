# THB Search Growth & Content Intelligence System

**Version:** 2.0 — implementation blueprint  
**Date:** October 10, 2026  
**Company:** Twin Home Buyer (THB)  
**Status:** Proposed; requires owner approval and pilot validation before production deployment  
**Implementation audience:** Claude Code, THB SEO/content operators, technical lead, editorial approvers  
**Source baseline:** `THB_SEO_AEO_GEO_Multi_Agent_Content_System_Plan(1).md` (v1.0). This plan preserves its seven agents, research/evidence safeguards, quality gates, privacy rules, and three-approved-releases-per-week target.

> **North star:** Grow qualified organic seller opportunities, not merely article counts or AI mentions. Build the intelligence first, automate writing second. A publication target never overrides evidence, privacy, legal, duplication, or human-approval requirements.

---

## 1. Executive Decision

Build **one standalone internal THB Search Studio** with two connected engines, one governed knowledge base, one orchestrator, and one editorial workspace:

1. **Engine A — SEO Growth Intelligence:** decides what THB should do next: **CREATE, UPDATE, MERGE, HOLD, or REJECT**. An UPDATE might be narrowly scoped to one section, internal-linking improvements, or a full substantive refresh. Recommendations are evidence-based, never automatic publishing commands.
2. **Engine B — Seven-Agent Content Studio:** executes **approved** new-content and update briefs, one section at a time, with source traceability, independent audit, editorial critique, and human approval.

The two engines share the **same SEO Strategist Agent** (Agent 1); do **not** double the number of agents. Data collection, crawling, link checking, schema parsing, and publishing handoff belong to **deterministic software services**, not separate LLM agents.

### High-level architecture

```text
                      THB GOVERNED KNOWLEDGE BASE
          Existing URLs | GSC/GA4 | official sources | seller library
          approved deal records | locked THB facts | production history
                                   |
                                   v
                    CENTRAL ORCHESTRATOR / WORKFLOWS
                 permissions | state gates | audit | versioning
                                   |
                  +----------------+----------------+
                  |                                 |
                  v                                 v
       ENGINE A: SEO GROWTH                 ENGINE B: CONTENT STUDIO
       inventory + GSC + leads             Agent 1 — SEO Strategist
       opportunity detection               Agent 2 — Research & Evidence
       Agent 1 decision                    Agent 3 — Content Architect
       CREATE/UPDATE/MERGE/                Agent 4 — Section Writer
       HOLD/REJECT                         Agent 5 — Fact & Privacy
                  |                        Agent 6 — SEO/AEO/GEO
                  +---- approved brief --->Agent 7 — Editorial Critic
                                                   |
                                                   v
                                     EXPLICIT HUMAN APPROVAL
                                                   |
                                                   v
                                       WORDPRESS DRAFT HANDOFF
                                       Elementor + Yoast QA
                                                   |
                                                   v
                                         MANUAL PUBLICATION
                                                   |
                                                   v
                                       MEASUREMENT & LEARNING
                                   search | AI observations | leads
                                                   |
                                                   +----> opportunity queue
```

**Important boundary:** The Growth Engine recommends; the Content Studio prepares; a human authorizes; WordPress publishes through an explicitly controlled action. No unapproved live-site edits.

---

## 2. Objectives, Scope, and Success

### Business objectives

- Increase qualified organic seller calls, forms, appointments, offers, and closed transactions where attribution is reliable.
- Improve rankings/clicks for commercially relevant Bay Area seller situations without promising rankings.
- Increase trustworthy search and AI discoverability through accurate, useful, original, locally applicable content.
- Reuse first-party THB experience responsibly; protect seller privacy and confidential transaction details.
- Improve valuable existing pages before manufacturing new ones merely to maintain publishing volume.

### Operating target

- **Three fully approved content releases per week** (Monday/Wednesday/Friday), potentially a combination of new pages, substantial existing-page updates, and approved case studies; **not automatically three new URLs**.
- Research one editorial cycle ahead; hold any release when a mandatory gate fails.

### Out of scope for initial release

- Automatic public publishing; arbitrary changes to live WordPress pages.
- Automated 301 redirects, merges, deletions, or mass changes without a separate approved plan.
- Custom enterprise-grade site auditing/crawling when established plugins or simple checks suffice.
- Promises of Google rankings, AI citations, or specific lead volumes.
- AI-specific schema or `llms.txt` as an assumed ranking shortcut.
- CRM attribution claims unsupported by actual tracking.

### Measurement hierarchy

1. **Primary:** qualified organic seller leads; appointments/deals where trustworthy attribution exists.
2. **Secondary:** relevant organic clicks, impressions, query coverage, indexation, engagement, conversion rates.
3. **Diagnostic:** page quality, release cycle time/cost, claim-review performance, internal links, observed AI citations/mentions/referrals.

Separate *measured*, *estimated*, and *unknown* values. Do not portray correlation between a content change and lead growth as proven causation.

---

## 3. Core Operating Rules

1. **No new URL without intent, SERP, existing-page, and cannibalization analysis.** Semantic similarity alone is not sufficient to declare cannibalization.
2. **No city- or neighborhood-swap pages.** Require real jurisdictional, local-market, property, search-intent, and/or verified THB differentiation. If neighborhood distinction is weak, prefer city/county-level coverage or HOLD.
3. **No invented or extrapolated facts** about THB experience, offers, timeframes, purchase prices, repairs, local law, sellers, or case outcomes.
4. **Source support must be claim-specific.** An accessible document is not automatically permission to publish its contents.
5. **Competitors can inform internal SERP research, not published citations.** Published claims use qualifying official, first-party, or other approved noncompetitor sources.
6. **Seller identity, address, photo, quote, exact price, and identifying combinations are blocked unless publication clearance is documented.** A public property record alone does not equal seller consent.
7. **Human approval remains mandatory** before changes are made public. Agents cannot self-approve or bypass publication gates.
8. **No AI-only optimization tricks.** Answer real seller questions well, make content technically accessible, and validate facts.
9. **Yoast recommendations are guidance, not publication authority.** Green indicators never override factual, intent, privacy, or duplication failures.
10. **Preserve a complete audit trail** of prompts, model versions, source IDs, editor changes, approvals, and publishing actions.
11. **Prefer deterministic checks** for HTTP, canonicals, robots, metadata presence, link reachability, and parseable schema; use LLM judgment for semantic usefulness.
12. **Follow change control:** draft, compare, approve, then publish. Existing URLs, slugs, canonicals, and redirects are never silently changed.

---

## 4. Engines and Decision Ownership

### Engine A — SEO Growth Intelligence

**Inputs:** WordPress URL inventory, Google Search Console page/query performance, GA4 where available, verified lead outcomes, internal link graph, observed SERPs, existing THB topic coverage, official/local evidence, and the Seller Experience Library.

**Tasks:**

- Identify pages with relevant impressions and opportunity for better search-intent satisfaction.
- Identify duplicate or near-overlapping search intent and recommend UPDATE or MERGE reviews.
- Identify high-value seller questions missing from THB coverage.
- Distinguish **SERP gap, THB coverage gap, local-information gap, and first-party proof gap**.
- Rank candidates by expected seller usefulness and business relevance, **not just volume**.
- Make CREATE/UPDATE/MERGE/HOLD/REJECT recommendations with evidence and uncertainty.
- Generate a scoped handoff brief and post-publication refresh recommendations.

**Output:** opportunity record with owner, affected existing URLs, decision, evidence links, constraints, recommended next action, and human review status.

**Decision definitions:**

| Decision | Trigger | Guardrail |
|---|---|---|
| `CREATE` | Distinct seller intent; demonstrable added value; sufficient evidence | Compare all existing URLs and first-party proof before approving |
| `UPDATE` | An existing page can satisfy the target intent better | Preserve URL/canonical unless separately approved |
| `MERGE` | Materially duplicative intent and an approved consolidation case | Requires human-reviewed surviving URL, mapping, redirects, internal-link updates, backup |
| `HOLD` | Demand, differentiation, evidence, clearance, or timing is uncertain | No writing or publishing until resolved |
| `REJECT` | No useful distinct intent, harmful duplication, or untenable privacy concerns | Record rationale; don't keep re-proposing without new evidence |

**Prioritization score (heuristic, never a gate override):** search opportunity 20; seller relevance 20; original information 20; local differentiation 15; answer usefulness 15; topical/internal-link fit 10 = 100. Suggested reading: 80–100 high priority, 60–79 review, under 60 lower priority. These are **THB internal heuristics**, not Google ranking factors; validate calibration using pilot results.

### Engine B — Seven-Agent Content Studio

Runs only after the required SEO decision and research approvals. It preserves section-by-section drafting, human-readable comments, revision diffs, evidence IDs, and final human approval. It supports **new articles and updates** to existing articles.

**Critical safeguard:** an UPDATE is a change request anchored to the current published page snapshot; the agent must not overwrite untouched sections or reset Elementor structure.

---

## 5. Seven Agent Contracts (Preserved)

| Agent | Inputs | Responsibility | Output | Prohibited action |
|---|---|---|---|---|
| **1. SEO Strategist** | GSC, inventory, SERPs, leads, topic evidence | Opportunity triage, intent fit, cannibalization, business priority | `CREATE/UPDATE/MERGE/HOLD/REJECT` + evidence | Approving own publication |
| **2. Research & Evidence** | Official sources, approved THB records, research requests | Claim-level source verification, effective dates, locality, permissions | Research/evidence packet + claim ledger | Treating internal access as consent |
| **3. Content Architect** | SEO decision, research packet, related URLs | Direct-answer structure, H2/H3, query fan-out hypotheses, visuals, link plan, CTA | Approved structured brief | Inventing facts to fill outline gaps |
| **4. Section Writer** | Locked brief, permitted claims, source excerpts | Draft one section at a time, with evidence IDs and scope constraints | Versioned sections/patches | Making unapproved new factual claims |
| **5. Fact & Privacy Auditor** | Draft, source ledger, seller clearance, brand facts | Independent source-to-claim review, legal qualification, identity risk | `PASS/REVISION/BLOCKED` with exact claim findings | Passing its own unsupported assumptions |
| **6. SEO/AEO/GEO Auditor** | Approved draft, intent brief, technical validator output | Intent/answer quality, topical sufficiency, local differentiation, entity consistency, citation readiness | Required vs optional QA findings | Pretending it directly tested HTTP or schema when it did not |
| **7. Editorial Critic** | Draft, Juan-approved voice reference, target seller | Local voice, clarity, trust, originality, repetition, readability, CTA | Editorial pass or focused revisions | Altering verified facts without re-audit |

**No additional AEO/GEO writing agents.** AEO/GEO standards are implemented throughout research, structure, writing, and QA.

### Common structured response schema

Every agent output must include:

```json
{
  "article_id": "string",
  "opportunity_id": "string",
  "agent_name": "string",
  "agent_prompt_version": "string",
  "model_version": "string",
  "input_version_ids": ["string"],
  "decision": "PASS | REVISION | BLOCKED | CREATE | UPDATE | MERGE | HOLD | REJECT",
  "findings": [],
  "evidence_ids": [],
  "required_actions": [],
  "output_version_id": "string",
  "timestamp": "ISO-8601"
}
```

Use a schema validator; reject or retry malformed responses. The orchestrator, not an agent, decides permissible state transitions. A failed task must not silently mark itself complete.

### Section-level review loop

`Approved outline → Writer section v1 → Fact/Privacy review → SEO/AEO/GEO review → Editorial review → targeted revision → re-review affected claims → section lock.`

Limit unattended revisions to **two attempts per issue** by default; then escalate to a human. A changed material claim always re-enters fact review even if it came from an editorial suggestion.

---

## 6. Governed Knowledge Base and Source Hierarchy

Create these six logical collections:

1. **Website Inventory:** URL, slug, canonical, post/page ID, type, geographic and search intent, H1/H2s, internal links, indexed status if available, GSC query history, date updated, approved owner.
2. **Seller Experience Library:** anonymized stories, exact approved-use wording, evidence ID, seller limitations, consent/permission, identity risk, never-write-about notes.
3. **Official Source Library:** source URL and document ID, jurisdiction, relevant passage, effective date, retrieval date, expiry/recheck status.
4. **THB Brand Facts:** approved spelling and name, services, geography, contact numbers (including separate SEO/PPC tracking identities), author bio, transaction/experience claims, allowable timeframes, change history.
5. **SEO/AEO/GEO Research:** clusters, page/query records, SERP observations, hypothetical query fan-outs, controlled AI citation observations, research decisions.
6. **Production Records:** opportunities, briefs, section drafts, claim ledger, findings, approvals, WordPress draft IDs, version diffs, costs, measurement snapshots.

### Source hierarchy

- **Tier 1:** applicable government laws, ordinances, agency publications, official regulator and court materials for legal/regulatory claims.
- **Tier 2:** verified THB first-party records for THB operations, transactions, and experiences, with **separate publication clearance**.
- **Tier 3:** verified GSC, GA4, and CRM data for performance claims (subject to platform data limits and attribution).
- **Tier 4:** recognized independent technical/institutional research relevant to its topic.
- **Tier 5:** reputable secondary reporting, checked against primary evidence where consequential.
- **Tier 6:** competitor/SERP observations for **internal research only**; never competitor citations in published content.

**Source precedence is claim-dependent.** A county ordinance outranks marketing copy on municipal requirements; a signed transaction record outranks a press mention for a THB deal; seller consent is a separate requirement that no source tier can replace.

### Claim risk classification

| Risk | Examples | Required handling |
|---|---|---|
| Low | General editorial guidance without narrow factual assertions | Editorial + basic factual review |
| Medium | THB services, local process descriptions, numerical SEO observations | Direct supporting records and review |
| High | THB historical claims, prices, repairs, dates, seller quotations, permits and code requirements | Primary evidence, exact applicability, publication clearance where relevant, independent fact review |
| Critical | Legal/tax interpretation, guarantees, personally identifying seller content, contested confidential facts | Explicit human escalation; prohibit publication when uncertainty remains; disclaimers do not substitute for accuracy |

Every claim record should store: `claim_text`, `claim_type`, `risk_level`, `source_id`, `supporting_passage`, `jurisdiction`, `applicability`, `effective_or_verified_date`, `checked_date`, `confidence_status`, `publication_permission`, `requires_human_review`.

### Research integrity

- Preserve links to exact source files and passages; never turn a search snippet into a primary citation without inspection.
- Verify local jurisdiction: San Francisco vs San Mateo County vs a specific city can materially change a rule.
- Flag stale sources and ask for re-verification, not silent substitution.
- Restrict access to sensitive seller documents and redact exported model inputs when possible.
- Resist prompt injection: retrieved web pages and Drive files are **untrusted content**, not executable instructions to agents or the orchestrator.
- Record contradictions explicitly and block conflicting claims until an authorized approver chooses verified wording.

---

## 7. Workflow State Machine and Approval Gates

### States

```text
CANDIDATE
  -> SEO_REVIEW
  -> [REJECTED | HOLD_DUPLICATION | HOLD_EVIDENCE | RESEARCH_PENDING]
  -> EVIDENCE_REVIEW
  -> BRIEF_REVIEW
  -> BRIEF_APPROVED
  -> DRAFTING
  -> FACT_PRIVACY_REVIEW
  -> SEO_AEO_GEO_REVIEW
  -> EDITORIAL_REVIEW
  -> HUMAN_REVIEW
  -> APPROVED_FOR_WP_DRAFT
  -> WP_DRAFT_CREATED
  -> WP_RENDER_QA
  -> READY_FOR_MANUAL_PUBLICATION
  -> PUBLISHED
  -> MONITORING / REFRESH_CANDIDATE
```

Additional states: `REVISION_REQUIRED`, `BLOCKED_PRIVACY`, `BLOCKED_CLAIM`, `INTEGRATION_ERROR`, `CANCELLED`. Each failure must retain a previous safe version and a logged recovery path.

### Mandatory gates

| Gate | Required evidence | Who may clear it |
|---|---|---|
| SEO opportunity | Existing-page comparison; query intent; differentiation; recommended decision | SEO reviewer |
| Evidence | Source packet, claims support, permissions, recency/jurisdiction | Evidence reviewer; explicit elevated review for risky case material |
| Brief | Outline, search intent, source IDs, local added value, editorial scope | SEO/editorial reviewer |
| Fact and privacy | Passed high/critical claims, seller-use permissions, no contradictions | Authorized factual/privacy reviewer |
| SEO/editorial | Answer usefulness, metadata, internal links, tone, no unsupported claims | SEO/editorial reviewer |
| WordPress handoff | Same approved version; draft created; Elementor rendering; Yoast metadata review | Publisher or designated QA reviewer |
| Public publishing | Explicit final human sign-off, approved draft version and deployment action | Authorized publisher only |

A person may hold multiple roles in a small team; **sensitive-case exceptions and material privacy overrides need independent secondary approval**. Define roles in settings rather than hardcoding employee names.

### Revision controls

- Store a before/after **section diff**; preserve a locked approved version.
- For UPDATE actions, show **existing live text vs proposed patch**, not only the newly generated prose.
- Record reason for each revision, affected evidence IDs, and whether a fresh audit is required.
- Lock the `publication_version_id` on final sign-off; edits after sign-off invalidate approval.
- Restrict the `MERGE` action to a **separate approved change plan**, including redirects, rollback and GSC monitoring.

---

## 8. SEO Research and Cannibalization Logic

### Required candidate packet

- Seller problem and target intent in one sentence.
- City/county/neighborhood scope and factual local differentiation.
- Existing THB pages that already address it, with canonical URLs and overlapping queries.
- Relevant GSC page/query metrics with exact date range; note sampling/row limitations.
- SERP result types and major user questions; distinguish observations from assumptions.
- Business relevance and whether seller is likely a genuine THB prospect.
- First-party THB proof available, restricted, or unavailable.
- Proposed CREATE/UPDATE/MERGE/HOLD/REJECT, alternatives, and uncertainty.
- Cannibalization warning only if intent or ranking/query overlap is substantively supported.

### Query fan-out for AEO/GEO

Treat AI-related follow-up questions as **hypotheses** until validated by observed search behavior or user evidence. Map each candidate question to: existing page, section on proposed page, separate supporting page, official reference, or exclude. Do not pad articles with off-intent questions.

### Local research decision

For neighborhoods, distinguish four separate gaps: SERP coverage, THB coverage, missing useful local information, and THB evidence. One gap does not establish all others. When evidence does not distinguish a neighborhood from the city, choose city-level relevance or HOLD.

---

## 9. AEO/GEO Editorial Standard

For the primary question and each important H2:

1. Give an accurate, direct answer in natural language near the beginning.
2. Explain qualifications, local differences, exceptions, and realistic options.
3. Ground consequential factual details in directly supporting sources.
4. Include **original, approved** THB expertise or experience when relevant; never force a case study where evidence is missing.
5. Use clear entities: city, agencies, property problem, services, author and THB naming.
6. Place useful internal links where they help the seller navigate; never stuff unrelated links.
7. Add one appropriate CTA without overwhelming the educational answer.

**AI visibility reporting** must distinguish (a) direct observed citation of THB URL, (b) brand mention without link, (c) identifiable AI-origin referral where measured, and (d) qualified lead. Record platform, prompt, locale, date, method, URL, and repeatability. Do not claim an observed citation was caused by a specific edit without stronger evidence. Where platform reports/API data are available, label scope and limitations; do not assume every AI feature has a dedicated reliable GSC dimension.

### Multimedia evidence opportunities

Content Architect may request authentic, authorized before/after photos, annotated condition photos, timelines, flowcharts, and diagrams. Store provenance, rights, privacy clearance, alt text and captions. Images are optional when not useful; do not invent visual proof or expose identifying content.

---

## 10. Elementor, WordPress, and Yoast Integration

### Critical early compatibility test

**Before building the whole writing engine**, create one **staging** WordPress draft using a dedicated low-privilege integration account. Determine whether THB's article template is made of Elementor widgets, standard WordPress blocks/content, or a mixture. A WordPress REST API `content` update does **not automatically create a faithful Elementor-editable widget tree**. Do not assume it works.

**Preferred low-risk approach:** reuse one approved THB blog layout/template. Have the system produce a structured **Publication Package** plus a WordPress draft for human assembly/verification. If API-based Elementor content updates are required, prove the exact template-specific mapping and editability on staging before enabling them. Avoid writing Elementor internal metadata directly until tested and reviewed.

### Publication Package schema (conceptual)

```yaml
article_id: THB-ARTICLE-ID
opportunity_id: THB-OPPORTUNITY-ID
action: UPDATE # CREATE | UPDATE
approved_version_id: IMMUTABLE-VERSION
existing_url: https://www.twinhomebuyer.com/example/ # on UPDATE
suggested_slug: example
page_title_h1: "Approved H1"
seo_title: "Approved SEO title"
meta_description: "Approved meta description"
canonical_intent: "preserve approved canonical"
primary_intent: "seller question"
geographic_scope: "applicable jurisdiction"
sections:
  - section_id: sec-1
    heading: "Approved heading"
    content: "Approved text"
    supporting_evidence_ids: ["E-101"]
internal_links:
  - target_url: https://www.twinhomebuyer.com/example/
    anchor_text: "contextual anchor"
media:
  - asset_id: "A-1"
    alt_text: "approved description"
    rights_status: approved
schema_recommendations: ["Article", "BreadcrumbList"]
claim_ledger_id: CLAIM-LEDGER-ID
fact_privacy_approval_id: APPROVAL-ID
editorial_approval_id: APPROVAL-ID
publisher_approval_id: APPROVAL-ID
```

### Pre-draft / post-publish checklist

| Check | Timing | Implementation |
|---|---|---|
| Approved SEO title / meta / canonical intent | Draft QA | Agent recommendation + Yoast settings verification |
| Headings, sections, CTA, internal links | Draft QA | Structural checks plus editorial review |
| Correct Elementor rendering/mobile layout | Staging/draft preview | Screenshot + human review |
| Image alt text and permission | Draft QA | Metadata validator + privacy gate |
| Applicable structured data | Draft and live | Yoast output + schema parse/validation; no automatic FAQ markup assumptions |
| HTTP status, robots, canonical, redirects, broken links | Live URL | Lightweight deterministic fetch checker |
| Indexing evidence | After publication | Search Console inspections when accessible; indexable is **not** the same as indexed |
| Sitemap inclusion | Site-level / follow-up | Periodic automated check, not a full LLM task |

Do not replace Yoast, Elementor, WordPress, or existing SEO operations with a parallel custom SEO settings platform. Do not change live page URL structure without explicit approval.

---

## 11. Application Interface: THB Search Studio

### Navigation

1. **Dashboard:** weekly release goal; qualified leads; opportunity pipeline; blocks; cost; data freshness.
2. **SEO Opportunities:** pages and topics ranked by seller value; evidence and CREATE/UPDATE/MERGE/HOLD/REJECT decision; filters by intent, city, type and status.
3. **Content Studio:** Brief / Draft / Evidence / Agent Critiques / SEO-AEO-GEO Audit / Diff / Approvals / WordPress Preview.
4. **Evidence Library:** official sources, approved seller experiences, THB facts, document permissions and revision histories.
5. **Published Content & Refreshes:** live URLs, date of change, baseline and comparison windows, GSC/GA4 metrics, next recommended action.
6. **Admin & Integrations:** users/roles, prompt versions, model settings, API credentials, job logs, ingestion status, budgets and audit history.

### User workflow

`Opportunity reviewed → approve scope → Research Agent gathers source packet → reviewer clears evidence → Content Architect presents outline → human approves brief → section-by-section draft and critique → human approves final version → Publication Package → WP draft/preview → manual publish → measure.`

**Show decisions and evidence, not hidden model chain-of-thought.** Each agent activity card should display inputs, outputs, evidence IDs, blockers, version diffs, and concise rationale. No fake multi-agent discussion theater.

### UX essentials

- Visible per-section status and diff; comments, annotations, required changes, version history.
- Prominent blockers with their exact unresolved claim/source/permission issue.
- Lock reviewed sections; warn whenever a change invalidates prior approval.
- Show the original live page alongside a proposed UPDATE.
- Human can HOLD, reject, request focused revision, and explicitly send an approved package to WordPress draft.
- Clearly display API usage and estimated per-article costs; values are measurements or labeled estimates.

---

## 12. Technical Architecture for Claude Code

| Layer | Proposed stack | Contract |
|---|---|---|
| Frontend | Next.js + TypeScript | Authenticated THB Search Studio |
| Database | Supabase PostgreSQL | Provenance, versioning, role-based access, row-level security |
| Orchestration | Durable queue + explicit state-machine service | Job retries, idempotency, approvals, dead-letter state |
| Agent execution | Configurable model APIs with strict JSON schemas | Versioned prompts/models, no secret leakage, cost limits |
| Retrieval | Google Drive read-only + approved manual uploads | Source IDs, permissions, passage references |
| Website | WP API + bounded crawler | URL inventory and staging draft integration |
| Search | GSC API + manual SERP evidence | Page/query/time-window records and limitations |
| Analytics | GA4 and permissioned lead/CRM feed | Attributable funnel metrics with unknown states |
| Publishing | WordPress/Elementor/Yoast | Draft-only first; approved publication remains manual |
| Observability | Structured audit/event logs | Errors, tokens, cost, retries, approvals, action trail |
| Test harness | Versioned fixed cases, mock integrations | Regression, privacy, workflow, permissions, rollback |

### Minimum data entities

`users`, `roles`, `pages`, `page_snapshots`, `search_metrics`, `opportunities`, `decisions`, `articles`, `article_sections`, `article_versions`, `briefs`, `evidence_sources`, `evidence_passages`, `claims`, `seller_permissions`, `agent_runs`, `audit_findings`, `approvals`, `publication_packages`, `wordpress_drafts`, `publication_events`, `measurement_snapshots`, `integration_health`, `test_results`.

Each action should be linked by stable IDs. Include timestamps, author/actor, version hashes, approval identity, and previous state. Store secrets in server-side secret management, never in browser source or prompts.

### Security and safety requirements

- Read-only Drive/GSC/GA4 tokens initially; least-privilege WordPress integration user; no public publishing capability for agent workers.
- Prevent arbitrary external page content from commanding agents or tools (prompt-injection isolation).
- Classify and redact seller personal information before model calls when feasible.
- Never use production WordPress as the first write target.
- Set queue timeouts, retries, budgets and backoff; no infinite self-revision loops.
- Require idempotency keys for WordPress draft creation to avoid duplicate drafts.
- Restrict authorizations server-side; frontend controls are not the permission boundary.
- Keep rollback path and reliable backups for any approved UPDATE or MERGE.
- Log exports, access to restricted records, and public-facing changes.

---

## 13. Build Plan and Acceptance Tests

### Phase 0 — Audit and design gate (first)

**Build:** inspect current WordPress + Elementor + Yoast setup, existing THB sitemap/post types, official content templates, GSC access, source permissions, seller research folders, existing research decisions, and staging access.

**Required decisions:** standalone app first; seven agents; controlled API model selection; source access model; approved editor/publisher roles; data retention; budget cap.

**Acceptance:** documented integration inventory, confirmed no destructive production changes, a feasible Elementor staging draft test, and named final decision owners.

### Phase 1 — Foundation and ingestion

**Build:** app authentication, database and schema, access rules, source ledger, current website inventory, approved company facts, anonymized seller records. Run Elementor draft compatibility proof **now**, not at the end.

**Acceptance:** inventory count verified instead of assuming 122; canonical records de-duplicated; provenance and seller permissions visible; no public content altered; one staging draft preserves the intended layout/editability or a documented manual-handoff fallback is selected.

### Phase 2 — SEO Growth Intelligence MVP

**Build:** read-only GSC import, page/query matching, candidate discovery, existing-page comparison, Agent 1 decisions and opportunity queue. Add Agent 2/3 for evidenced brief generation.

**Acceptance:** can reject generic city-swap opportunities; can recommend UPDATE vs CREATE for overlapping intents; exposes data gaps instead of guessing; a human can approve/hold recommendations.

### Phase 3 — Seven-Agent Content Studio

**Build:** Agents 4–7, claim ledger, section editor, source references, two-revision limit, diffs, independent quality gates and human sign-off.

**Acceptance:** a draft with unsupported law, invented deal claim, non-cleared seller identity, stale rule, or altered verified detail is blocked; targeted changes can pass re-review; no agent approves itself.

### Phase 4 — WordPress draft handoff

**Build:** Publication Package, configured draft endpoint, staging and production safeguards, Elementor preview checks, Yoast metadata checklist, manual-publication control.

**Acceptance:** an approved article can become one editable/usable draft; duplicate retries cannot create multiple drafts; changes to approved text invalidate sign-off; publishing requires authorized human action.

### Phase 5 — Three-case pilot and resilience tests

**Pilot A: Existing THB relocation page.** Test UPDATE vs unnecessary CREATE and scoped edits.  
**Pilot B: Inherited/probate × San Mateo County.** Test legal/local authority, differentiated intent, direct answers, or justified HOLD.  
**Pilot C: Cleared, anonymized seller story.** Test first-party originality, exact source mapping, sensitive-data controls; use only an actually cleared case, not assumed permission.

**Failure injections:** invalid official citation, wrong jurisdiction, mismatched seller consent, conflicting THB experience count, generic neighborhood swap, WordPress timeout, API retry, malformed agent output, hallucinated link, editor revision after approval, and accidental publish attempt.

**Acceptance:** three documented workflows and all critical safety/authorization tests pass; a failed case is counted as a **successful block** when blocking is the correct outcome.

### Phase 6 — Measurement and learning

**Build:** publishing event history, GSC/GA4 baselines and comparison windows, appropriate lead attribution, observed AI citation logs, monthly refresh proposals, cost and throughput metrics.

**Acceptance:** separates organic clicks, qualified leads, AI citations, mentions and referrals; includes data freshness/unknowns; makes defensible recommendations; does not automatically change live URLs.

### Progressive rollout

- **MVP:** Phases 0–2 plus Elementor proof; research and decision support only.
- **Editorial beta:** Phase 3 for staff-only drafts with required human review.
- **Controlled publication beta:** Phase 4, approved WP drafts only.
- **Operational release:** after Phase 5 safety gates and Phase 6 baseline measurement.

Do not estimate project delivery dates or API costs without access inventory, model choice, developer availability, and test complexity. Record actual build time/cost and revise scope accordingly.

---

## 14. Regression Test Suite

Maintain a versioned set of at least **20 representative cases**, expanded as failures are found. Minimum expected examples:

| Scenario | Expected result |
|---|---|
| Existing THB article already meets same intent | UPDATE or HOLD; never automatic CREATE |
| Candidate repeats an existing page with only city name changed | REJECT/HOLD |
| Distinct intent with verified seller value | CREATE candidate, pending gates |
| Unsubstantiated legal or permit claim | BLOCKED_CLAIM |
| Source passage discusses a different city/jurisdiction | REVISION/BLOCKED |
| THB bio claims conflict across old pages | BLOCKED pending approved single version |
| Seller release does not cover identifiable story details | BLOCKED_PRIVACY |
| Internal records exist but public permission missing | Research only; cannot publish identifying evidence |
| Competitor blog offered as external published citation | Reject citation |
| Unsupported AI-query fan-out assumption | Mark hypothesis; do not claim measured demand |
| GSC query absent from export | Unknown/limited; do not assert no demand |
| Agent returns malformed JSON | Retry under limits; then integration error |
| Editorial critic changes an important fact | Return to Fact Auditor |
| Revision occurs after final approval | Invalidate prior sign-off |
| WordPress API times out after writing draft | Check idempotency/existing draft before retry |
| System user tries to publish without rights | Deny and log |
| Schema recommendation conflicts with page data | Flag; no forced markup |
| Page says indexed but only robots test is known | Report **indexable**, not **indexed** |
| Live page contains a broken internal link | Deterministic alert for repair |
| Pilot fails evidence gate | HOLD/BLOCK, not publish to meet weekly target |

Rerun regression tests on changes to agent prompts, models, retrieval, schemas, content gates, WordPress integration, or workflow code. Track results by build and do not deploy on critical regression failure.

---

## 15. Weekly Editorial Operating Rhythm

| Day | Recommended work |
|---|---|
| Previous week | Research, source review, topical decisions, approved briefs and a backup queue |
| Monday | Publish approved release #1; verify WordPress/technical status |
| Tuesday | Draft and validate next approved work; prioritize valuable existing-page updates |
| Wednesday | Publish approved release #2; capture change/baseline snapshot |
| Thursday | Finalize evidence, critiques, approvals and backup release |
| Friday | Publish approved release #3; review quality, blockers, search/lead indicators |
| Ongoing | Source refresh, GSC triage, AI observation logs, broken-link/technical monitoring |

**Recommended mix, not a quota:** one valuable existing-page update, one distinct seller-answer guide, and one properly cleared original-evidence piece where available. If no case has clearance, publish a useful evidence-based guide or make another approved update; never fabricate a case study.

---

## 16. Reporting Dashboard and KPIs

### Executive view (numbers first)

- Approved releases this week / target 3.
- `CREATE / UPDATE / MERGE / HOLD / REJECT` decision counts.
- Qualified organic calls/forms this period; appointment count; attribution confidence.
- Organic clicks/impressions/CTR for commercially relevant page groups with period-on-period comparison.
- # articles blocked on sources, privacy, duplication and technical handoff.
- # observed AI citations, mentions and referrals shown as separate metrics.
- Cost per accepted content release; median time from approved brief to ready draft.

### Page-level measurement record

Record `canonical_url`, action type, prior version ID, publication date, baseline period, comparison period, GSC metrics, GA4 events, lead outcomes, source methods, attribution limitations, and recommended next action. Retain historical snapshots to avoid rewriting history when a page changes.

### Do not use as sole success criteria

- Number of blogs written; number of words; Yoast green lights; hypothetical AI-answer prompts; citation counts without identifiable seller outcomes; increases in impressions unrelated to target intent.

---

## 17. Builder Execution Instructions for Claude Code

> Implement the architecture incrementally, with production safety and evidence integrity as hard constraints. Do not attempt to generate seven agents and auto-publish a website in a single untested run.

### Working rules

1. Begin with a **read-only audit**. Inspect the repository and integrations; report findings before modifications.
2. Translate this blueprint into a tracked backlog, system diagrams, migration plan and test cases.
3. Do not assume the 122-post baseline is current; enumerate actual public URLs and statuses.
4. Do not assume WordPress REST `content` writes produce Elementor-native editable layouts; prove staging behavior first.
5. Implement schemas, access controls, idempotency and state transitions before agent orchestration.
6. Implement Agent 1 + evidence retrieval + opportunity decisions before autonomous drafting.
7. Preserve exact seller restrictions and source provenance; use only specifically approved material for public prose.
8. Add human approval controls and audit logs before production write integrations.
9. Disable public publishing, deletion, redirects and bulk edits by default.
10. Keep raw source text separate from system instructions and tool permissions.
11. Produce reproducible tests with fixture records; do not require real confidential data in public test environments.
12. At each phase, deliver a working demo, tests, migration notes, unresolved blockers, and a rollback/recovery plan.

### Phase handoff format

```text
PHASE:
STATUS: PASS | PARTIAL | BLOCKED
WHAT WAS BUILT:
FILES / TABLES / ENDPOINTS CHANGED:
TESTS RUN + RESULTS:
DATA / PERMISSION / PRIVACY IMPACT:
STAGING DEMO:
KNOWN LIMITATIONS:
OPEN DECISIONS:
NEXT APPROVED STEP:
```

### Mandatory stop conditions

Stop the affected job and escalate when a critical factual claim lacks support, seller-use clearance is absent, the intended Elementor template cannot be safely maintained, an API credential has excess scope, an action could change a live URL without approval, or a regression test indicates unauthorized publishing is possible.

---

## 18. Architectural Decisions to Confirm Before Build

| Question | Recommended default | Must verify |
|---|---|---|
| App location | Standalone THB Search Studio | Auth / hosting arrangements |
| Agent count | Exactly 7 | No duplicate SEO Strategist process |
| Editorial inputs | Read-only Drive + manual approved packets | Permission boundaries |
| Search analytics | Read-only GSC + optional GA4 | Properties and scopes available |
| Content output | Structured Publication Package | Elementor/Yoast staging compatibility |
| Initial production action | Create drafts only | Integration role cannot publish live |
| Final publishing | Manual by authorized user | Named operational owner |
| Seller stories | Anonymous by default | Documented permissions and exact allowed details |
| Model provider | Configurable | Privacy policy, cost and response reliability |
| Lead measurements | Use validated lead-source data | PPC/SEO attribution separation |
| Existing content inventory | Recompute from WordPress/site | Canonical and nonindexed coverage |

---

## 19. Definition of Done

The platform is **ready for controlled production usage** only when:

- [ ] Complete, versioned THB URL inventory is available with duplicate/intent comparisons.
- [ ] Approved THB brand facts, evidence sources and seller permissions have enforced access controls.
- [ ] SEO Growth Engine makes auditable decisions, including valid HOLD/REJECT decisions.
- [ ] All seven agents comply with structured contracts and section-level review.
- [ ] Material claims have traceable support; privacy and legal exceptions trigger blocks.
- [ ] Human approval is an enforceable server-side permission gate.
- [ ] WordPress + Elementor + Yoast staging integration passes layout/editability testing, or an approved manual handoff is documented.
- [ ] System can create a WordPress draft without unauthorized publication, URL edits, redirects or deletion.
- [ ] Agent/model failures and retries are recoverable and don't duplicate drafts.
- [ ] Pilot A/B/C results are recorded, including correct holds/blocks when appropriate.
- [ ] Critical regression, privacy and unauthorized-action tests pass.
- [ ] Dashboard distinguishes measured results from estimates and unknown attribution.
- [ ] Authorized THB reviewers have signed off on rollout.

---

## 20. Final Principle

**The Content Studio still exists in full.** The Search Growth Engine is a prioritization and learning layer around it. Together, they answer:

1. **Should THB create, update, merge, hold, or reject this content opportunity?**
2. **What does the evidence actually support?**
3. **How can seven specialist agents write or improve it with trustworthy SEO, AEO, GEO and local value?**
4. **Has a human approved precisely this version for WordPress/Elementor?**
5. **Did the publication contribute to qualified seller opportunities, or should the strategy change?**

**One platform. Two connected engines. Seven agents. Explicit human control. Evidence first. Seller results as the north star.**
