# AGENTS.md

Agent entry point for this repository — applicable to any AI coding agent
(Claude, Codex, Cursor, etc.).

> **Read [`CLAUDE.md`](CLAUDE.md) first.** It is the full operational contract
> for working here: what Limboo is, the tech stack, the renderer/preload/main
> process boundaries, theming rules, security invariants, the release process,
> and what is and isn't built yet. When this file and `CLAUDE.md` disagree about
> current reality, `CLAUDE.md` wins.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `limboo-ai/limboo`, driven via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
