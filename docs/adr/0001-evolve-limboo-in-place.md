# ADR 0001 — ZEUS evolves the Limboo codebase in place

- **Status:** Accepted
- **Date:** 2026-09-16
- **Context:** Round 1 grilling — foundational product relationship

## Context

ZEUS is a new Windows-first desktop AI coding-agent application. Two routes
existed: (A) evolve the cloned Limboo codebase in place, or (B) start a
greenfield repo and port only the pieces worth keeping.

Limboo already provides, built and battle-tested: strict Electron process
boundaries with a typed preload bridge, sender-validated IPC, workspace/path
security, per-session git worktrees, an argv-only Git engine, node-pty
terminals, a versioned SQLite persistence layer (schema v18, FTS5), a
provider-neutral agent seam with two live adapters, permission orchestration
across three layers, Memory/Search/Resume platform services, and Windows
packaging + auto-update infrastructure hardened by shipped-bug invariants.

## Decision

ZEUS evolves directly from the Limboo codebase. The architecture is preserved;
product-layer changes are made where ZEUS's product model requires them.

## Consequences

- No migration or rebuild of the foundations; immediate focus on product.
- Limboo-specific product assumptions (pure-black shell, session model,
  multi-host release machinery) are inherited and must be revalidated rather
  than silently kept.
- Inherited debt (no tests in `src/`, TypeScript ~4.5 toolchain) is accepted
  for now and must be scheduled by later phases, not rediscovered.
