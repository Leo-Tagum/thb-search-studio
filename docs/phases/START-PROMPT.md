# Start Prompt

Paste everything inside the box below into a new Claude Code chat opened in this project folder. You don't need to edit it: it finds the current phase from STATUS.md.

```text
We're building the THB Search Studio one phase at a time. Work only on the current phase.

1. Read docs/phases/STATUS.md. The current phase is the one marked IN PROGRESS; if none is, it's the lowest-numbered phase marked NOT STARTED. Tell me which phase that is.
2. Read that phase's file in docs/phases/, then the Handoff section of the previous phase's file (skip this for Phase 0). Then read only the "Read first" sections that the phase file lists. Don't read other phases' plans.
3. If the phase's Tasks section says "to be detailed at the start of this phase", write the detailed tasks into the file first: numbered small steps, each with a check that proves it worked, based on the previous handoff. In every phase, before building anything, show me the task list and what you need from me (keys, IDs, files, people), then wait for my "go".
4. Mark the phase IN PROGRESS in STATUS.md with today's date.
5. Build only this phase's tasks, in order. Respect its "Out of scope" list and the design's hard rules: no writes to WordPress, no secrets in git or prompts, no real seller originals, and THB site requests at or below 20 per minute. If a task's check fails, or the blueprint's §17 stop conditions apply, stop and tell me rather than working around it.
6. At the end, fill in the phase's Handoff section in blueprint §17 format, including any "Recorded facts" it asks for. Tick the "Done when" boxes that are actually met.
7. Update STATUS.md: DONE if the handoff says PASS. If it says PARTIAL or BLOCKED, leave it IN PROGRESS and say why.
8. Commit all changes with a message naming the phase, and stop. Don't start the next phase.
```
