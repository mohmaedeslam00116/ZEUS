# ZEUS — Round 1 Grilling: Foundational Architectural Decisions

- **Date:** 2026-09-16
- **Status:** Round 1 closed. This document is the handoff artifact.
- **Inputs:** `CLAUDE.md`, `project.md`, `docs/architecture/*`, `docs/agents/*`,
  direct code inspection (`src/main/managers/*`, `src/shared/*`, CI scripts).

## 1. Current Limboo architecture relevant to ZEUS (summary)

Three Electron contexts with a hard boundary: sandboxed renderer (UI only,
Zustand) → single typed preload bridge (`window.limboo`) → main process owning
all OS work. Main is manager-per-responsibility (`src/main/managers/`),
wired in `src/main/index.ts`; contracts shared via `src/shared/`
(channel names, types, constants). Full map: the Round-1 architectural map in
the session transcript; narrative in `docs/architecture/`.

Key seams ZEUS inherits:

- **Agent seam** — `AgentManager`: probe / run / translate / `decideToolUse`
  (one permission decision core for all providers) / resume tokens.
- **Execution root** — `WorktreeManager.resolveSessionRoot` is the single
  resolver injected into Agent/Terminal/Git/FS/Search.
- **Persistence** — better-sqlite3, WAL, schema v18, FTS5, bound params only.
- **Security** — 11 hardening patterns + 3 permission layers
  (`docs/architecture/security-model.md`).
- **Packaging** — Forge 7 + Vite 5 + electron-builder 26, tag-driven
  versioning, multi-host CI with merged per-arch update feeds.

## 2. Decisions (Round 1)

| #  | Decision                                                       | Recorded as     |
| -- | -------------------------------------------------------------- | --------------- |
| 1  | ZEUS evolves the Limboo codebase in place                      | ADR 0001        |
| 2  | Windows-first; cross-platform retained                         | ADR 0002        |
| 3  | Claude + Cursor primary; provider-neutral seam kept            | ADR 0003        |
| 4  | Local-model providers are a future adapter, not a v1 redesign  | ADR 0003        |
| 5  | Security model preserved unchanged, deny-by-default            | ADR 0004        |
| 6  | Memory, Search, Resume, Work Graph, Runtime Telemetry retained | Decision log    |
| 7  | Voice removed from current ZEUS scope                          | Decision log    |
| 8  | Visual ZEUS rebrand deferred                                   | Decision log    |
| 9  | ZEUS storage/application identity decided BEFORE feature work  | Round 2 (open)  |

## 3. Architectural consequences

1. **In-place evolution** — foundations are never rebuilt; all product work
   routes through existing seams (IPC path, adapter seam, execution-root
   resolver). Inherited debt is accepted and must be *scheduled*, not
   rediscovered.
2. **Windows-first** — validation effort concentrates on Windows (installer,
   shims, paths, auto-update); shared code stays cross-platform-clean; no
   platform removal.
3. **Seam retained** — new providers enter only as adapters; no provider
   conditionals above the seam; per-adapter parity is checked against
   `decideToolUse`.
4. **Security unchanged** — new capabilities ride the three layers; no
   temporary bypasses; security regressions are release blockers.
5. **Five services retained** — they stay integrated with the SQLite core and
   the context-producer contract (memory/search/resume).
6. **Voice out of scope** — must not influence core architecture; removal
   mechanics decided in Round 2.
7. **Rebrand deferred, storage identity not** — visible branding freezes, but
   the userData root, DB/secrets location, update-feed identity, and Limboo
   data migration policy are decided before feature work (Round 2 Q1).

## 4. Risk triage (Round-1 risk list → where it goes)

| Risk                                          | Becomes                                    |
| --------------------------------------------- | ------------------------------------------ |
| No test files in `src/`                       | Architectural decision (verification strategy) + implementation work in to-spec |
| Build/lint-only verification; TS ~4.5 debt    | Architectural decision (accept vs upgrade) — Round 2 Q5 |
| No CONTEXT.md / ADR history                   | **Resolved** — `CONTEXT.md` + ADR 0001–0004 exist |
| Limboo-specific product assumptions           | Product-model validation — Round 2 Q3 + to-spec |
| Session/worktree concepts vs ZEUS model       | Round 2 Q3                                  |
| Windows packaging/update stability            | Round 2 Q2 (CI publish guard) + later invariant checks |
| Permission infrastructure regression          | Covered by ADR 0004 (enforcement discipline, no new decision) |
| Storage identity                              | Round 2 Q1 (must close before feature work) |

## 5. Unresolved questions → Round 2

1. **Storage identity** — ZEUS userData root, DB/secrets location, update-feed
   identity, migration policy for existing Limboo (dev) data.
2. **Release safety on the ZEUS repo** — current CI publishes `v*` tags to
   Limboo's GitLab/GitHub release feeds; the ZEUS clone must not fire those.
3. **Session/worktree product model** — validate the inherited model against
   ZEUS's intended product shape.
4. **Voice removal mechanics** — delete code vs feature-flag vs freeze.
5. **Verification strategy** — what testing exists in a build/lint-only codebase.
6. **Toolchain debt posture** — TypeScript ~4.5: accept, or schedule upgrade.

## 6. Handoff summary for `to-spec`

ZEUS is the in-place evolution of Limboo (ADR 0001): a local-first,
provider-neutral desktop shell for AI coding agents, Windows-first with
cross-platform retained (ADR 0002), two primary adapters behind a frozen
provider-neutral seam (ADR 0003), full security posture intact (ADR 0004),
five platform services on a SQLite core. Feature work may begin only after
Round 2 closes storage identity and release safety. Specification should treat
`CLAUDE.md` as the code-level contract, `docs/architecture/` as narrative, and
`CONTEXT.md` as the canonical vocabulary.
