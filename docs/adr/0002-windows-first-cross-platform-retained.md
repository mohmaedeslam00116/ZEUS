# ADR 0002 — Windows-first, cross-platform retained

- **Status:** Accepted
- **Date:** 2026-09-16
- **Context:** Round 1 grilling — OS strategy

## Context

ZEUS's primary target is Windows. The Limboo codebase is cleanly
cross-platform: node-pty with per-platform prebuilts, sandbox policy
translating per-OS, packaging for Windows (Squirrel/NSIS), macOS (ZIP), and
Linux (deb/rpm), and per-architecture update feeds merged in CI.

## Decision

Windows is the primary target and receives the strongest validation.
macOS and Linux remain supported wherever the existing architecture already
supports them. No platform support is removed without a strong architectural
reason.

## Consequences

- Development and testing effort concentrates on Windows (installer art,
  shim handling, path semantics, auto-update).
- Cross-platform discipline in shared code stays mandatory: no
  Windows-only shortcuts in process-shared modules.
- Demoting macOS/Linux later is possible; restoring them after removal is
  not — hence retention now.
