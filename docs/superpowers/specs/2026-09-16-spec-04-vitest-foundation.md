# Spec 4 — Vitest Foundation (Pure Modules First)

- **Phase:** 1 (Infrastructure prerequisites, item 4)
- **Applicable ADR / decision:** ADR-0007 (closed) — incremental Vitest,
  pure modules first, E2E later
- **Status:** Draft for review — specification only

## Problem

The repository has zero test files. Verification is `vite build` + `eslint`
only, which cannot catch regressions in the security-critical pure logic:
ref sanitization, git argument construction, settings normalization, work-graph
reduction, telemetry accumulation. ADR-0007 mandates an incremental Vitest
foundation starting with the deliberately-pure modules ("no DB, no IPC, no
clock") — the highest-value, lowest-fragility entry point.

## Scope

- Add Vitest as the unit-test runner (devDependency + config).
- Write the first test suites for the pure modules listed below.
- Establish the repo's testing conventions (file placement, naming, what is
  unit-testable) so later specs extend rather than reinvent.
- No CI wiring here (Spec 5); no E2E (deferred).

## Non-goals

- No Electron/IPC/integration/E2E tests (deferred per ADR-0007).
- No refactoring of modules to make them testable — only genuinely pure
  modules are targeted in this spec; impure ones are out of scope.
- No coverage thresholds or tooling beyond the runner.
- No test Backfill of legacy behavior beyond the listed modules.

## Current architecture (verified)

- **Pure modules (test-ready today, by design):**
  - `src/main/managers/graph/builder.ts` — pure reducer, exported functions
    (`nodeKindForTool` etc.), typed inputs from `src/shared` — no DB/IPC/clock.
  - `src/main/managers/telemetry/accumulator.ts` — `TelemetryAccumulator`
    class implementing the three correctness rules (message dedup by id,
    subagent isolation, measured-total authority) — pure by contract.
  - `src/shared/refName.ts` — `refCharProblem` / `validateBranchName`;
    documented as fuzz-verified against real `git check-ref-format`.
  - `src/main/managers/git/refs.ts` — `sanitizeRef` / `sanitizeBranchName`
    (main-side; thin, shares the refName rule table).
  - `SettingsManager.normalize` — clamping/normalization. **Verified:** the
    method body is pure (module constants, `deepMerge`, `clamp` — no fs,
    clock, or Electron), but it is `private` and only reachable through a
    constructor that touches fs (`readJson`/`writeJson`). The sanctioned
    test seam is a minimal, mechanical extraction: export a pure
    `normalizeSettings(input): AppSettings` function and have the class
    delegate to it. Behavior-preserving; no logic changes.
- Parsers in `src/main/managers/git/parse.ts` and `status.ts` are partially
  pure (string→structure); include the pure functions only.
- Test runner: none installed. Vitest pairs with the existing Vite 5
  toolchain and TS 5 (Spec 3 prerequisite).

## Applicable ADR / decision

ADR-0007: Vitest, incrementally, pure modules first; priority order:
security-sensitive parsing → git argument construction → state
normalization → graph construction → telemetry accumulation →
provider-independent logic.

## Detailed behavior

1. Add `vitest` devDependency (compatible with Vite 5 line) + `vitest.config.ts`
   reusing the `@`/`@shared` aliases; exclude `node_modules`, `.vite`, `dist`.
2. Add `"test": "vitest run"` script (watch mode via `vitest` for dev).
3. Test suites to author (names/locations per new convention
   `<module>.test.ts` adjacent or under `tests/unit/` — one convention, chosen
   in implementation, recorded in CLAUDE.md):
   - **refName**: valid/invalid refs (whitespace classes, NBSP/BOM/U+3000,
     control chars, DEL, `..`, leading `-`, ref-component rules) — cross-check
     a fixture corpus against documented `git check-ref-format` semantics;
     property-style tests for the explicit ASCII class.
   - **git/refs** (`sanitizeRef`/`sanitizeBranchName`): parity with shared
     rule table; creation-specific branch rules.
   - **graph/builder**: node-kind mapping for the tool union (incl. the
     `Task`/`Agent` dual-name rule from `src/shared/subagents.ts`), edge
     idempotency, `derived` flag handling, permission-decision signals.
   - **telemetry/accumulator**: the three correctness rules as explicit test
     cases (duplicate `message_start` ids; subagent frames never touching the
     parent gauge; measured-total authority + `attributionDegraded` drop);
     INDETERMINATE-never-0% rule.
   - **git/parse + status** (pure functions only): unified-diff preamble
     dropping, `parseNameStatus` `-z` handling, status porcelain mapping.
4. Document in `CLAUDE.md` (§5/§9 area): how to run tests, and the
   "pure module" convention as the default design discipline for new logic
   (per ADR-0007 consequences).

## Files/modules affected

- `package.json` (+lockfile: vitest devDependency only)
- `vitest.config.ts` (new)
- New `*.test.ts` files for the modules above
- `CLAUDE.md` testing-convention note

## Data/migration impact

None.

## Security impact

- Positive: the ref-sanitization and arg-construction suites lock in the
  path-traversal/injection guards against regression — direct ADR-0004
  reinforcement (tests are the enforcement mechanism ADR-0007 names).
- Tests must not weaken guards: failing legacy behavior is reported, never
  "fixed" by loosening the guard to match a test.

## Windows-specific behavior

- All suites must pass on Windows (primary dev target): no POSIX-only
  fixtures (path separators, `/tmp`, symlinks) in unit tests; ref/arg tests
  are inherently platform-neutral.
- The `git check-ref-format` cross-check fixture corpus is generated
  ahead-of-time (committed fixtures), not by invoking git at test time —
  keeps tests hermetic and CI-cheap.

## UI/UX impact

None.

## Impeccable review requirements

Not applicable.

## Verification plan

- `npm test` passes locally on Windows.
- Suites run in CI once Spec 5 lands (this spec leaves a green local state).
- Mutation spot-check: temporarily flip one rule in `refCharProblem` → tests
  must fail (proves the suite actually constrains the code).

## Acceptance criteria

1. Vitest installed and configured; `npm test` green.
2. The five module families above have suites covering their documented
   contracts, including the four telemetry correctness rules and the
   Task/Agent dual-name rule.
3. No production source file was modified except mechanical test-support
   exports (each listed in the PR).
4. Testing convention documented in `CLAUDE.md`.

## Dependencies

Requires Spec 3 (typecheck) — tests run through TS; requires Spec 2 (voice
gone, smaller surface). Gates Spec 5 (CI gates run these suites).

## Known risks

- **RESOLVED (contradiction review):** `TelemetryAccumulator` is genuinely
  pure — it has **no constructor at all** (`sessions`/`quota` maps are
  instance fields), the clock is a per-call parameter (`apply(signal, now)`),
  and `LimitLookup`/`HostFacts` are method parameters. Tests construct the
  class directly with plain objects and a synthetic `now`. **No injectable
  abstraction is needed** — the previously sketched HostFacts-constructor
  fallback is dead and must not be built.
- `SettingsManager.normalize` extraction (see Current architecture) is the
  one authorized test-support refactor in this spec: pure-function export,
  class delegates, zero behavior change. Anything beyond that is out of
  scope.
- Suite scope creep: strictly timebox to the listed families; everything else
  is a later ticket under ADR-0007's incremental policy.
