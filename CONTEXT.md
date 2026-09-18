# CONTEXT.md

Glossary for ZEUS. Terms only — no implementation details, no specs.
Vocabulary is inherited from the Zeus codebase (see ADR-0001) and marked
where ZEUS's own product model must still validate it.

## Product

- **ZEUS** — the product: the environment *around* a coding agent. ZEUS is not
  a model and not an agent; it owns everything else (workspaces, sessions,
  files, git, terminals, memory, security).
- **Zeus** — the codebase ZEUS evolves from. Lineage, not a user-facing term.

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

## Naming conventions

- **zeus.json** — the repo-authored worktree/session config file at a
  workspace or worktree root (hooks, setup commands, trust ack). Successor of
  the inherited `limboo.json` (ADR-0010 rename; no compat layer).
- **.zeus/** — the per-workspace ZEUS namespace for attachment staging and
  generated state; successor of `.limboo/`. `.zeus-tmp-*` is its temp-file
  convention. Cursor rule materialization targets `Write(.zeus/**)`.
- **zeus_memory / zeus_search** — the MCP tool-server names ZEUS registers
  (tool-call namespace `mcp__zeus_memory__*` / `mcp__zeus_search__*`);
  Cursor allow rules materialize as `Mcp(zeus_memory:*)` / `Mcp(zeus_search:*)`.
- **window.zeus** — the preload bridge global exposed to the renderer
  (internal API name; successor of the inherited bridge namespace).
- **refs/zeus/checkpoints/*** — the git-ref namespace for session checkpoints;
  successor of the inherited checkpoint refs (clean-cut; no dual-prefix reads).
- **ZEUS vs zeus** — user-visible identity renders `ZEUS` (ADR-0009); internal
  and storage identifiers are lowercase `zeus`.

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

## Internationalization & Localization

- **Locale** — the user-selected interface language (`'en'` | `'ar'`).
- **Canvas-Only RTL** — the default layout mode for Arabic in ZEUS: the outer
  application frame (sessions sidebar on the left, activity rail on the right)
  retains standard developer muscle memory, while conversation, modals, cards,
  and textual contents render right-to-left in Arabic typography (see ADR-0011).
- **Full Mirror** — an optional layout mode in settings that mirrors the entire
  window (sessions on the right, activity rail on the left).
- **Code Isolation** — strict LTR (`direction: ltr !important`) and monospace
  isolation for terminals (`xterm.js`), code blocks, git diffs, and file paths
  regardless of the active UI locale.
