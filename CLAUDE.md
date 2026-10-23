# Working rules

- Never ask me questions. Pick the most reasonable option and log it in DECISIONS.md in one line.
- If something is blocked, skip it and note it in BLOCKED.md.
- Work through TASKS.md from top to bottom.
- Run the tests after each task. Commit after each task whose tests pass.
- Get the core loop working before doing any polish.
- plan.md is the single source of truth for this project. Read it before writing code. Contracts in §5 and interfaces in §27 are frozen.
- Every LLM call goes through `lib/mubit/client.ts` (via `getMubit()` in `lib/mubit/index.ts`). Never import `openai` anywhere else.
- Never commit secrets. Keys live in `.env.local` (git-ignored).
