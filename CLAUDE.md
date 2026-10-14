# THB Search Studio: instructions for the operator (Claude Code)

- **Follow `docs/references/standing-rules.md` (Leo's standing rules) before doing anything on this repo.** Read it at the start of every session. It binds you as the operator the same way it binds the agent prompts in `.claude/agents/`; where it conflicts with anything else, it wins. If a rule stops you, stop and ask Leo.
- The Next.js in this repo has breaking changes: see `AGENTS.md`.
- **Never overwrite, delete or move an untracked or uncommitted file without asking Leo first** (standing rule SR-10, from 1.3.1). Git cannot restore it. If a file you want to write already exists and is not committed, read it and ask, or write to a new name. This includes `Write` over an existing file and `rm`, `mv` or `git clean` on untracked paths.
