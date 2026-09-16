# ADR 0004 — Security model preserved unchanged

- **Status:** Accepted
- **Date:** 2026-09-16
- **Context:** Round 1 grilling — security and permissions

## Context

The codebase ships eleven implemented hardening patterns (process isolation +
sandbox, IPC sender validation, deny-by-default web permissions, navigation/
webview lockdown, strict CSP, argv-only spawning with Windows shim
whitelisting, path-traversal guards, bound SQL, prototype-pollution filters,
secret redaction, safeStorage secrets) and a three-layer permission
architecture: (1) `decideToolUse` orchestration authority, (2) provider
permission translation, (3) OS-level sandbox policy with crown-jewel denial.

Simplifying any of this could accelerate v1 development.

## Decision

Preserve the complete security model unchanged. ZEUS remains deny-by-default.
No security mechanism is removed or weakened for velocity.

## Consequences

- New capability work must route through the existing three layers; there is
  no "temporary bypass" path.
- Security regressions are release blockers, not follow-up tickets.
- The cost of the model is already paid; the remaining cost is discipline in
  review, which the existing contracts in `CLAUDE.md` §6 and
  `docs/architecture/security-model.md` encode.
