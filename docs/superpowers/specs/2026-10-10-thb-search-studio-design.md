# THB Search Studio — Design

**Date:** 2026-10-10 · **Owner:** Leo (THB SEO/content) · **Final approver:** Juan · **Status:** Approved design

Source blueprint: `THB_Search_Growth_and_Content_Intelligence_System_v2_0.md` (v2.0, 2026-10-10) — the authority for rules, agent contracts, gates, states and tests. This document records **how it gets built for Leo's situation** and where it deliberately departs from the blueprint. Stack facts come from `TECH_STACK (1).md` (partner's file, 2026-10-07).

Build is split into phases; see `docs/phases/STATUS.md` and `docs/phases/START-PROMPT.md`.

---

## 1. Context — why and for whom

Leo (THB SEO/content, solo operator) wants the full blueprint system: an internal tool that decides what THB should CREATE/UPDATE/MERGE/HOLD/REJECT, then runs approved work through seven specialist agents to evidence-checked, human-approved drafts — with seller-lead growth, not article counts, as the goal. Juan (owner) gives final sign-off.

Constraints that shape everything:
- **No model API key** (training account). Agents must run inside Claude Code for now.
- **No WordPress staging, by decision** (`thbstag` is off-limits). Production is WP Engine + Cloudflare + Wordfence (bans crawls ~>48–60 req/min; own-server rule 5/min).
- **No partner repo access.** `equity-seo` exists but use-cases differ; Leo rebuilds lighter.
- **Leo has read-only GSC + GA4 API access via service account**, and a Supabase account.
- **Source materials are scattered** — no organized Drive library yet.

## 2. Goals, non-goals, anti-goals

**Goals:** all blueprint phases (0–6), built in order; every blueprint safety rule enforced server-side; agents swappable from Claude Code to API without rebuild.

**Non-goals (initial):** any write to WordPress; public hosting; multi-user team features; automated rank/AI-visibility tracking (manual observation log only); Drive integration (manual uploads first).

**Anti-goals (failure even if it "works"):** a draft containing an unsupported legal/deal/seller claim reaching Juan as approvable; any path by which the app can change the live site; a protected/Ads URL appearing as an UPDATE target without warning; faking a weekly quota; tool output presented as measured when it's estimated.

## 3. Decisions made by Leo

| Topic | Decision |
|---|---|
| Scope | Whole system, blueprint phase order |
| Where built | Claude Code in VS Code (not claude.ai chat) |
| Agent execution | **Hybrid, upgradeable** — app owns data/gates; an operator runs each agent step as a Claude Code subagent; API runner added later |
| App location | **Local app** on Leo's machine (localhost), not hosted |
| Users | Leo does operating + most reviews; Juan approves final |
| Owner approval | **Proposal artifact with Approve / Hold / Request changes buttons**, decision flows back into the Studio |
| Search data | GSC + GA4 via read-only service account API |
| Partner tooling | Don't depend on `equity-seo`; rebuild a lighter version |
| Sources | Scattered → manual uploads into Evidence Library |
| Seller data | **Original seller records stay in THB's internal systems only.** The Studio's story source is the existing **anonymized seller library (21 briefs; no names, addresses or prices)**. Originals may be added later only if Juan approves where they live. |
| Juan's access | Same Claude org as Leo — can open shared private artifacts and be identified on approval |

## 4. Recommendations Leo accepted in principle (confirm on review)
- **WordPress: Publication Package only.** The app has **no WordPress write credentials at all**. Leo assembles drafts in Elementor by hand. Reason: no staging; ~107 city pages and 9/15 protected Ads pages render from PHP templates so `post_content` writes can silently do nothing or break layout. An automated draft path stays a future, gated item requiring a ddev proof + Gian's agreement.
- **Request the protected-URL list from the partner** as a plain file. Until imported, a page whose protection status is unknown shows an UPDATE warning that requires explicit acknowledgement (see §7), and Leo can mark status manually with an audited reason.

## 5. Architecture

```
Next.js (localhost)  ──server actions/API──►  Orchestrator (TS state machine)
   UI: Dashboard, Opportunities,                │ guarded transitions, audit log,
   Content Studio, Evidence, Published,         │ idempotency, revision limits
   Admin                                        ▼
                                         Supabase Postgres + Storage
                                                ▲
  Claude Code (operator)                        │ validated submit
   /thb-run-agent → .claude/agents/thb-*.md ────┘   (zod schema, else reject/retry)
   /thb-proposal  → Juan's approval artifact ──► ArtifactData read-back → approvals
  Ingestion jobs: GSC API, GA4 API, WP public REST + sitemap (≤20 req/min)
```

- **Frontend/backend:** Next.js + TypeScript, server-side authorization only (UI is not the permission boundary).
- **Database:** Supabase (cloud project, Leo's account) — Postgres + Storage for uploads; RLS on; entities per blueprint §12 (`pages`, `page_snapshots`, `search_metrics`, `opportunities`, `decisions`, `articles`, `article_sections`, `article_versions`, `briefs`, `evidence_sources`, `evidence_passages`, `claims`, `seller_permissions`, `agent_runs`, `audit_findings`, `approvals`, `publication_packages`, `publication_events`, `measurement_snapshots`, `integration_health`, `test_results`, `users`, `roles`, plus `audit_events`). `wordpress_drafts` kept but unused while package-only.
- **Orchestrator:** pure TS module owning the blueprint §7 state list and allowed transitions; every transition writes an `audit_events` row (actor, prior state, version hash). Jobs in a Postgres `jobs` table (local app, no external queue) with idempotency keys, retries, dead-letter = `INTEGRATION_ERROR`.
- **Agent bridge (the hybrid piece):**
  - Seven subagent definitions `.claude/agents/thb-01-seo-strategist.md` … `thb-07-editorial-critic.md`, each with a versioned prompt, the blueprint contract (inputs/outputs/prohibited action), and minimal tools (only Agent 2 gets web fetch, for official sources).
  - App creates an `agent_runs` row (`QUEUED`) with a **task packet**: instructions separate from a clearly delimited untrusted-data block (prompt-injection isolation), input version IDs, output JSON schema.
  - Operator runs a project slash command `/thb-run-agent [run_id|next]` in Claude Code; it fetches the packet via a small CLI (`npm run studio -- packet <id>`), dispatches the matching subagent, and submits output with `npm run studio -- submit <id> <file>`.
  - Submit validates against the blueprint common schema + agent-specific schema; malformed → retry up to limit, then `INTEGRATION_ERROR`. The orchestrator, not the agent, decides the next state. `model_version` recorded as `claude-code/<model id>`.
  - `AgentRunner` interface with `ClaudeCodeManualRunner` now; `AnthropicApiRunner` later uses the same packets/schemas.
- **Owner approval via artifact:** `/thb-proposal <article_or_opportunity_id>` builds a Claude Artifact (proposal, evidence summary, diff vs live text for UPDATEs, exact `publication_version_id`/hash) with Approve / Hold / Request changes using the artifact database + viewer identity capabilities. `npm run studio -- sync-approvals` (via Claude Code `ArtifactData`) imports decisions; approval only counts if the recorded hash equals the current version. Any later edit invalidates it. Also used for the blueprint's **independent secondary approval** on sensitive privacy exceptions.
- **Ingestion (deterministic, not agents):**
  - Inventory: WordPress public REST (`/wp-json/wp/v2/posts|pages`, Yoast `yoast_head_json` fields) + `sitemap_index.xml`; rendered snapshot fetched only for UPDATE candidates. Global rate limiter ≤20 req/min, no cache-busting by default. Records flag template-rendered pages (city/protected) where known.
  - GSC: Search Analytics page×query×date (`webmasters.readonly`), store date range + row-limit caveats. GA4 Data API (readonly) for landing-page conversions where configured. Lead/CRM: manual CSV import with attribution confidence field.
  - Live QA after Leo publishes: HTTP status, canonical, robots/meta-robots, Yoast title/description match, JSON-LD parse, internal link reachability — reports "indexable", never "indexed" unless GSC URL Inspection says so.
- **Secrets:** `.env.local` (gitignored) for Supabase service key and Google service-account JSON path; `.claude/settings.json` denies reading them (matches partner convention).

## 6. Phases (blueprint §13, adapted)

0. **Setup & access audit** — `git init`, scaffold, verify GSC/GA4 service account scopes on the real properties, verify WP REST is publicly readable and Wordfence-safe at our rate, request protected-URL list, **prove the artifact approval round-trip with Juan**. Handoff report (blueprint §17 format).
1. **Foundation** — Supabase schema + migrations + RLS, roles, orchestrator + audit log, Evidence Library uploads, brand facts, seller permissions, inventory ingestion (real URL count, not 122), Publication Package format fixed as the WordPress path.
2. **Engine A MVP** — GSC import, page↔query matching, overlap/cannibalization (intent + query overlap, never similarity alone), candidate packets (§8), Agent 1 decisions, opportunity queue UI with HOLD/REJECT; Agents 2–3 for evidence packets and briefs; heuristic score shown, never a gate.
3. **Content Studio** — Agents 4–7, claim ledger, section-by-section loop, two-revision limit then escalate, diffs (live vs proposed for UPDATE), section locks, proposal artifact + approval sync.
4. **Package handoff** — Publication Package export (YAML + copy-ready section HTML/Markdown for Elementor), Yoast checklist, "mark published" with URL → live QA checks. No WP writes.
5. **Pilots + resilience** — Pilot A/B/C and blueprint failure injections; Pilot C only with an actually cleared case, else recorded as a correct block.
6. **Measurement** — publication events, GSC/GA4 baseline vs comparison windows, lead attribution with confidence, manual AI-observation log (citation / mention / referral / lead kept separate), monthly refresh proposals, cost/throughput.

## 7. Calls I made (Leo to check)
- Supabase **cloud** project rather than local Supabase CLI/Docker (simpler on Windows; Leo has an account).
- Supabase Auth with a single login for Leo; roles stored in settings so Juan/secondary approver can be assigned without code changes.
- Postgres-backed job table instead of an external queue.
- Vitest for unit/regression tests; fixture data only, never real seller data in tests.
- Inventory via WP REST + sitemap instead of a crawler; ≤20 req/min ceiling.
- Lead data via CSV import until a CRM feed is identified.
- UI kept plain (shadcn/ui + Tailwind) — function over polish.
- **Artifact approval proof moves to Phase 0** (not Phase 3): build a throwaway proposal artifact, Juan clicks, Claude Code reads the decision back with his identity. If identity/read-back fails, stop and choose a fallback before building on it.
- **Template-rendered pages** (107 city pages, protected Ads pages): Engine A may still recommend changes, but the output is a separate **Developer Change Request** package routed to Gian (ACF/theme work), never an Elementor Publication Package; no live-vs-patch diff is attempted on them.
- **Protected-URL list:** request it from the partner; meanwhile Leo can mark a page's protection status manually, recorded with an audit event and reason. Unknown status = UPDATE shows a warning that requires an explicit acknowledgement, not a hard block, so pilots can proceed.
- **Seller library enforcement:** the 21 anonymized briefs are imported into the Seller Experience Library with their allowed-use wording and identity-risk notes. The schema has **no fields for seller name, street address or exact price**; an import/upload check rejects text matching address/price/name patterns and flags it for Leo. Any case-study claim beyond a brief's approved wording is `BLOCKED_PRIVACY`. Pilot C uses one of these briefs only if its permissions cover publication.
- **Brand facts + voice reference:** Phase 1 creates a single locked THB Brand Facts set and a voice reference, sent to Juan as a proposal artifact for approval; conflicting historical claims are recorded as conflicts until he picks the wording. Phase 3 depends on this.

## 8. Left to the builder
Exact table columns beyond blueprint fields, component layout, CLI command names, prompt wording (must embed blueprint contracts verbatim where they define prohibitions), scoring formula implementation.

## 9. Verification
- **Unit/regression (Vitest):** state machine allows only blueprint transitions; no agent output can set an approval; post-approval edit invalidates sign-off; malformed agent JSON → retry then `INTEGRATION_ERROR`; all 20 blueprint §14 cases as fixtures, run on every prompt/schema/workflow change; critical failure blocks "release".
- **No-write guarantee test:** code search + test asserting no WordPress write endpoints/credentials exist in the app.
- **Rate-limit test:** ingestion never exceeds 20 req/min (mocked clock).
- **End-to-end per phase:** run the app locally (`npm run dev`), ingest real inventory + GSC, run one opportunity through Agent 1 via `/thb-run-agent`, produce a proposal artifact, click Approve as a test viewer, sync, confirm the approval hash check; produce a Publication Package; run live QA against a real published URL.
- Each phase ends with the blueprint §17 handoff report.
