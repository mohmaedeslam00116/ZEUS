# CONTEXT.md

Glossary for ZEUS. Terms only — no implementation details, no specs.
Vocabulary is inherited from the Limboo codebase (see ADR-0001) and marked
where ZEUS's own product model must still validate it.

## Product

- **ZEUS** — the product: the environment *around* a coding agent. ZEUS is not
  a model and not an agent; it owns everything else (workspaces, sessions,
  files, git, terminals, memory, security).
- **Limboo** — the codebase ZEUS evolves from. Lineage, not a user-facing term.

## Core nouns

- **Workspace** — a repository added to the app. The lifecycle owner of
  project-level state.
- **Session** — one unit of development work: a workspace (or a branch of it),
  a conversation, a terminal, checkpoints, permissions, context, and memory
  bundled into one workspace the user switches between. Session-centric: the
  model is not task-centric.
- **Plain Session** — the default session: its execution root is the workspace
  directory itself. No worktree knowledge required to use ZEUS.
- **Worktree** — an isolated checkout bound to a session, so parallel sessions
  never share a working directory. An **explicit opt-in** for isolation,
  parallel development, or safer experimentation — never a prerequisite.
- **Execution Root** — the directory a session's work actually happens in,
  resolved per session (usually its worktree). All file, git, terminal, and
  agent activity is rooted here.
- **Checkpoint** — a lightweight git snapshot guarding a point in a session's
  history; the basis of revert and conversation rollback.

## Agent model

- **Agent** — the connected coding runtime that reasons and edits code.
- **Provider** — a specific agent runtime (currently Claude, Cursor) behind a
  neutral seam. The UI never knows which provider is running, only that "the
  session has an active agent".
- **Adapter** — the per-provider translation layer: health probe, run
  invocation, wire-format translation, permission translation.
- **Permission Mode** — the per-session execution posture: `plan` | `ask` |
  `default` | `acceptEdits`.
- **Crown Jewels** — the small set of protected paths (secrets, database,
  settings) that every security layer denies to the agent, always.

## Services

- **Platform Service** — an app-owned, provider-independent subsystem that
  serves any provider. The five core services: Memory, Search, Resume, Work
  Graph, Runtime Telemetry.
- **Memory** — durable, tiered project knowledge proposed, accepted, and
  injected into agent context.
- **Search** — the single local retrieval interface (files, symbols, federated
  sources) every subsystem queries.
- **Resume** — reconciliation of persisted conversation with repository state
  ("continue exactly where you left off").
- **Work Graph** — the derived, queryable graph of what happened in a session.
- **Runtime Telemetry** — measured context/cost/usage reporting per run.
