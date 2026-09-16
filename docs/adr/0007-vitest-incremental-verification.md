# ADR 0007 — Verification strategy: Vitest, incrementally, pure modules first

- **Status:** Accepted
- **Date:** 2026-09-16
- **Context:** Round 2 grilling — verification architecture

## Context

The codebase has zero test files in `src/`. Verification is `vite build` +
`eslint` only; `tsc --noEmit` cannot run (TypeScript ~4.5 cannot parse the
bundled `@types/node`), so nothing type-checks. For security-critical code —
ref sanitization, git argument construction, settings normalization, the
permission decision core — this is the largest standing risk. Full Electron
E2E from day one would be slow and fragile before any foundation exists.

## Decision

Introduce **Vitest** incrementally, starting with the modules that already
have strong boundaries and minimal dependencies — the deliberately-pure
reducers/parsers ("no DB, no IPC, no clock"):

- `graph/builder.ts` and `telemetry/accumulator.ts` (pure reducers)
- `src/shared/refName.ts` (ref sanitization; fuzz against real `git
  check-ref-format` as the existing docs describe)
- `SettingsManager.normalize` (state normalization)
- Git argument/ref parsers
- Other pure reducers, parsers, and security helpers identified during
  implementation

Priority order: security-sensitive parsing, git argument construction, state
normalization, graph construction, telemetry accumulation, provider-
independent logic. Electron/IPC/integration/E2E coverage is added
incrementally after the pure-module foundation exists. Over time, CI enforces
meaningful automated verification instead of relying primarily on
`vite build` + `eslint`.

## Consequences

- The "pure module" discipline becomes a testing affordance: new logic should
  keep the no-DB/no-IPC/no-clock shape to stay trivially testable.
- The bounded TypeScript 5 upgrade (separate infrastructure task, no ADR) is
  the enabler for `tsc --noEmit` and enforceable CI gates.
- E2E remains a later, deliberate addition — not attempted before the unit
  foundation exists.
