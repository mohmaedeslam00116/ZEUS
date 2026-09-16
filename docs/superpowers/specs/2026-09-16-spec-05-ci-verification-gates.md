# Spec 5 — CI Verification Gates (and Dependabot Policy Replacement)

- **Phase:** 1 (Infrastructure prerequisites, item 5)
- **Applicable ADR / decision:** ADR-0007 (closed) — CI enforces meaningful
  verification; Round-2 Dependabot pause decision (this spec delivers the
  future ZEUS-native policy)
- **Status:** Draft for review — specification only

## Problem

CI currently validates via lint/build only, and Dependabot is paused
(`open-pull-requests-limit: 0`, commit `a9e2d97`) pending exactly this
deliverable. The verification strategy (ADR-0007) needs CI to run the Vitest
foundation and the restored typecheck, and the dependency-update policy needs
a ZEUS-native replacement so the pause can end deliberately.

## Scope

- Extend the existing GitHub Actions `CI` workflow (`.github/workflows/ci.yml`,
  `validate` job) with typecheck + test steps.
- Replace `.github/dependabot.yml` with the ZEUS-native policy (monthly,
  security-driven, bounded).
- No release workflows touched here (Spec 6 owns their isolation).

## Non-goals

- No release/build/package jobs, no artifact publication, no tag triggers
  (Spec 6 + deferred ZEUS-native publishing).
- No E2E jobs (deferred).
- No new CI vendor/tooling (stay on GitHub Actions).
- No dependency version changes in this spec (the Dependabot file is policy,
  not upgrades).

## Current architecture (verified)

- `.github/workflows/ci.yml`: single `validate` job — install, lint, license
  check, Electron security invariants, manifest/docs integrity, release-notes
  sync checks. Concurrency-grouped, `push`/PR triggered. These inherited
  checks are generic and stay.
- `.github/workflows/security.yml`: gitleaks + dependency-review — generic,
  stays.
- `.github/workflows/codeql.yml`: pushes/PRs to main + weekly schedule —
  generic, stays.
- Dependabot: paused (limit 0 both ecosystems) with rationale comment.
- npm scripts (after Specs 3–4): `typecheck`, `test`, `lint`.

## Applicable ADR / decision

ADR-0007 consequences: CI enforces meaningful automated verification, ending
the build/lint-only era. Round-2 cleanup report: re-enabling Dependabot with
the ZEUS config is an explicit deliverable of CI cleanup — delivered here.

## Detailed behavior

1. **CI `validate` job additions** (order: fast-fail first):
   - `npm run typecheck` (after lint; requires Spec 3).
   - `npm test` (Vitest run mode; requires Spec 4).
   - Keep existing steps untouched (security invariants, license, docs
     integrity) — they are valuable generic gates.
2. **Dependabot ZEUS-native policy** (replaces the paused file):
   - `npm` ecosystem: `interval: monthly`, `open-pull-requests-limit: 3`,
     **no grouping** (small reviewable PRs), ignore list:
     `electron`, `vite`, `typescript` (deliberate-pin policy per CLAUDE.md —
     TS moves only by bounded decision), `node-pty` (pinned 1.2.0-beta line),
     `@vitejs/plugin-react` (v4 line), `better-sqlite3` (native ABI coupling
     with Electron — deliberate-pin), `sherpa-onnx-node` (removed by Spec 2;
     entry documents the pin posture for native deps).
   - `github-actions` ecosystem: `interval: monthly`,
     `open-pull-requests-limit: 3`.
   - Rationale comment referencing ADR-0006/0007 and the deliberate-pin list.
3. Note in the file: `electron`/`vite` etc. move only by bounded decision —
   Dependabot PRs for them must not be opened (the ignore list enforces it).

## Files/modules affected

- `.github/workflows/ci.yml` (two added steps)
- `.github/dependabot.yml` (replaced)

## Data/migration impact

None.

## Security impact

- Positive: security invariants (prototype-pollution guards, sender
  validation, permission gates) gain continuous regression protection via
  typecheck+tests on every PR; gitleaks/CodeQL/dependency-review continue
  unchanged.
- The Dependabot ignore list keeps ABI-sensitive and toolchain-coupled
  packages out of automated churn — protecting the Windows native-module
  story (`node-pty`, `better-sqlite3`) per ADR-0002/0004.
- No new workflow permissions beyond the existing `contents: read` scope.

## Windows-specific behavior

- **CORRECTED (contradiction review — the earlier "ubuntu-only CI" premise
  was wrong):** the inherited `test` job already runs a **three-OS matrix
  (`ubuntu-latest`, `macos-latest`, `windows-2022`) with an Electron smoke
  test on each** (`ci/scripts/smoke-test.mjs`, xvfb-wrapped on Linux).
  Windows is therefore already covered by CI at the smoke level, consistent
  with ADR-0002. This spec's additions (`typecheck`, `test`) run in the
  ubuntu `validate` job; the smoke matrix stays untouched. The verification
  boundary is: `validate` (lint/typecheck/unit, ubuntu) + cross-OS smoke
  matrix (incl. Windows) + the L3 Windows manual checklist (Spec 10) for
  platform-sensitive specs. No additional Windows runner work is in scope.

## UI/UX impact

None.

## Impeccable review requirements

Not applicable.

## Verification plan

- Open a scratch PR during implementation: `validate` job runs typecheck +
  tests; intentional break (failing test) turns the job red.
- Dependabot: after merge, the next scheduled run produces ≤3 small PRs and
  none for ignored packages (observe over the first cycle; no action beyond
  observation in this spec).

## Acceptance criteria

1. CI runs lint + typecheck + tests + the inherited generic gates on every
   push/PR to main.
2. `.github/dependabot.yml` is the ZEUS-native policy; the pause is lifted
   deliberately and documented.
3. Release workflows remain untouched (Spec 6 scope).
4. No dependency versions change in this spec's diff.

## Dependencies

Requires Specs 3 (typecheck script) and 4 (test script). Sequenced before
Spec 6 so release isolation lands on an already-clean CI baseline.

## Known risks

- First Dependabot cycle after un-pausing may surface a backlog wave — the
  `limit: 3` cap and monthly cadence bound it; anything urgent goes through
  the deliberate-pin exception process, not Dependabot.
- The inherited `validate` steps include release-notes/manifest integrity
  checks tied to Limboo release machinery; if they fail on ZEUS for
  identity reasons, that is a discovered drift to log and resolve under
  Spec 6's scope (not silently removed here).
