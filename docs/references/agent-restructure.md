# THB Search Studio: Agent Restructure (Team Model)

Status: PROPOSAL / DISCUSSION, Leo, 2026-10-10. Not built. Planned as **Phase 3c**, after Phase 3 is finished.
Visual: https://claude.ai/artifact/DHmmuJZzvkeV4h8DRuiFSf

## 1. Context
THB Search Studio is an internal tool. It decides which blog content Twin Home Buyer should create, update, merge or retire, then drafts and fact-checks it for human approval. It runs locally (Next.js + Supabase) with agents executed as Claude Code subagents.

**Today (Phases 0–3), the system is hub-and-spoke.** Seven agents never talk to each other. A code Orchestrator (state machine) hands each agent a task packet, validates the structured answer, logs it, and decides the next step by fixed rules. People (Leo, Juan) make every decision.

Current agents:
1. Strategist: CREATE / UPDATE / MERGE / HOLD / REJECT
2. Researcher: official sources, word-for-word quotes
3. Architect: the brief
4. Writer: section by section
5. Fact & Privacy Checker: veto
6. SEO / AEO / GEO
7. Editorial Critic: Juan's voice

**Why restructure:** the Orchestrator does all the heavy lifting, and agents can't raise problems with each other. Leo wants agents organized in **teams** that discuss inside the team and **raise issues with any other team** when they find a specific problem, with Leo stepping in when they get stuck.

## 2. Proposed structure: four teams

| Team | Agents (ID · role) | Maps to today |
|---|---|---|
| 1 · Research | R1 Legal & official (official sources only) · R2 Search (demand, questions, rankings) · R3 Experience (anonymized seller stories, brand facts, THB process) | Agent 2, split into three |
| 2 · Strategy | S1 Strategist · S2 Architect | Agents 1 and 3 |
| 3 · Writing | W1 Writer · W2 Co-writer (challenges angle, H1, clarity, examples, CTA) | Agent 4, plus a new co-writer |
| 4 · Review council | V1 Fact & Privacy Auditor (veto) · V2 SEO/AEO/GEO (one reviewer at first; split later only if needed) · V3 Editorial Critic | Agents 5, 6 and 7 |

Above the teams: **Leo (Studio Director)** decides escalations and approves topics and briefs. **Juan** gives final sign-off in the THB Approval Room.
Orchestrator: **code, not AI**, acting as traffic controller. It routes tickets, caps rounds and budgets, enforces hard rules and logs everything.
Shared record (database): evidence packs, claim IDs, approved briefs, draft versions, feedback, open issues. Every team reads it; only tickets change it.

## 3. How teams interact
- **Inside a team:** short discussions (for example R1/R2/R3 cross-checking sources, S1/S2 agreeing on the plan, W1/W2 debating the H1, the council agreeing on one combined feedback set).
- **Between teams:** **typed tickets**, issue-triggered rather than continuous. Any team can ticket any team, not only its neighbour. Every ticket passes through the Orchestrator and is logged.

### Tickets
| Ticket | Typical route | Effect | Build |
|---|---|---|---|
| EVIDENCE_REQUEST | Writing / Strategy / Review → Research | Prove one claim, or answer "can't prove it", and then the claim is dropped or reworded | First |
| ROOT_CAUSE_NOTE | Review → Strategy | The problem comes from the brief. Fix the brief, then redo only the affected sections | First |
| QUALITY_CORRECTION | Review → Writing | A feedback card (below) | First |
| HUMAN_ESCALATION | Any team → Leo | Both positions side by side plus a recommendation; Leo decides | First |
| STRATEGY_CHALLENGE | Research → Strategy | New evidence questions the direction or intent | Later |
| ARCHITECTURE_REVISION | Writing → Architect | Restructure headings without restarting the article | Later |

### Feedback card format
```
TICKET:   QUALITY_CORRECTION
FROM:     V2 + V3 (agreed)
TO:       W1
SECTION:  H1
ISSUE:    …
SEVERITY: must fix | should fix | suggestion
EVIDENCE: query / rule / source id
FIX:      suggested wording
BLOCKING: yes/no   (only V1 can block)
```

### Numbered example interactions (as in the diagram)
1. S1→R2 demand request · 2. R2→S1 evidence pack · 3. S1⇄S2 plan discussion · 4. S2→W1 approved brief · 5. W1⇄W2 H1/angle discussion · 6. W1→R1 "Is probate always required?" · 7. W1→council draft · 8. V3→W1 quality correction · 9. V1→R1 verify a legal claim directly · 10. V2→S2 root-cause note · 11. R1⇄R2⇄R3 cross-check · 12. V1⇄V2⇄V3 one combined feedback set · 13. any team→Leo escalation

## 4. Decision rules ("ready")
- V1 (Fact & Privacy) **must pass** every section. Its veto can't be argued away; only proof clears it.
- Every **must-fix** from V2/V3 is done.
- **Should-fixes and suggestions** are listed for Leo. Unanimity isn't required, so one reviewer can't deadlock an article.
- Leo reviews, then Juan approves the exact version. Any later edit cancels the approval (server-side hash check).

## 5. Escalation to Leo
1. Conflicting evidence on a major claim
2. A change would alter an approved brief or target keyword
3. A legal or privacy point is uncertain
4. Teams disagree past the round limit
5. A decision could affect the brand, compliance or business risk
6. The article hits its ticket or round budget

## 6. Limits and guardrails
- Round cap per ticket (2–3) and a ticket budget per article (for example 10). Over budget, the article stops and goes to Leo.
- One issue per ticket. No open-ended chats.
- **Hard rules stay in code**, not agent agreement:
  - approved brand facts only ("25+ years of experience in Bay Area real estate", "investing in Bay Area real estate since 2002", "1,000+ homes"; never exact year counts);
  - no typed ratings or review counts;
  - no seller-identifying details;
  - no competitor sources;
  - money pages protected;
  - no WordPress writes;
  - Juan's approval required.
- Every ticket and reply is logged (who, what, when, version).

## 7. Reused vs new
- **Reused:** Orchestrator, task packets, validator, claim ledger, Evidence Library, brand-fact rules, audit log, Approval Room, approval sync.
- **New:**
  - a discussion/ticket table and router;
  - round and budget enforcement;
  - agent files for R1–R3, W2 and the council roles;
  - the feedback card schema;
  - a "stuck" inbox in the UI for Leo.

## 8. Trade-offs
- About 3–6× more Claude usage per article (more agents and rounds).
- Slower per article, but fewer weak drafts reach Leo.
- A real build phase (3c), not a tweak. Start with 4 ticket types and 1 combined SEO/AEO/GEO reviewer, and expand only when it proves useful.

## 9. Sequencing
1. Finish Phase 3 (current single-agent pipeline, first article: the hoarder guide).
2. Optional now: make Phase 3 reviewer feedback use the structured card, so more reviewers fit later.
3. Phase 3c: build the team model as above.

## 10. Open questions for Leo
1. Are R1/R2/R3 the right research specialties?
2. Does W2 (co-writer) write too, or only challenge and suggest?
3. Round limit per ticket: 2 or 3?
4. Ticket budget per article?
5. Should Leo see full team discussions, or only outcomes plus escalations?
