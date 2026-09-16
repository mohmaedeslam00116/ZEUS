# Spec 3 — TypeScript 4.5 → 5.x Bounded Upgrade

- **Phase:** 1 (Infrastructure prerequisites, item 3)
- **Applicable ADR / decision:** Round-2 decision (bounded TS upgrade; no ADR
  by design); enabler for ADR-0007
- **Status:** Draft for review — specification only

## Problem

TypeScript is pinned at `~4.5.4`. TS 4.5 cannot parse modern bundled
`@types/node`, so **nothing in this repository type-checks** — the renderer is
esbuild-transpiled (type errors never block), and `tsc --noEmit` is unusable.
This makes ADR-0007's verification strategy unenforceable: tests and CI gates
cannot rely on type-correctness. The upgrade must be narrow: restore reliable
type-checking without becoming a broad dependency modernization.

## Scope

- Upgrade `typescript` from `~4.5.4` to a compatible 5.x release (latest 5.x
  that satisfies the toolchain constraints below).
- Make `tsc --noEmit` (project-wide, excluding generated/vendor dirs) pass.
- Update `tsconfig.json` minimally for TS 5 semantics.
- Wire a `typecheck` npm script; leave CI wiring to Spec 5 (CI gates).

## Non-goals

- No runtime dependency upgrades (Electron stays 42, Vite stays 5, React 19,
  Zustand 5 — all untouched).
- No ESLint major upgrade (the pinned ESLint 8 + `@typescript-eslint` 5
  toolchain stays; see risks for the version-compatibility boundary).
- No refactoring for style, no `strict: true` adoption, no new TS features in
  product code.
- No Vitest installation (Spec 4).
- No Dependabot re-enablement (Spec 5 deliverable; PRs #6/#7 remain closed —
  the TS bump is done deliberately here, not via Dependabot).

## Current architecture (verified)

- `package.json`: `"typescript": "~4.5.4"` (devDependencies); code is
  transpiled by esbuild (Vite 5 / Forge), so runtime behavior is independent
  of the TS compiler version.
- `tsconfig.json`: `target ESNext`, `module commonjs`, `moduleResolution
  node`, `paths` for `@/*` and `@shared/*`, `skipLibCheck: true`,
  `noImplicitAny: true`, no `strict`.
- `CLAUDE.md` §2 documents the TS 4.5 limitation and the esbuild-only
  verification posture — this spec supersedes that specific instruction
  (documentation drift to update in the implementation PR, per the authority
  model: this is a ZEUS decision, not a Limboo contradiction).

## Applicable ADR / decision

Round-2 final decision 9: bounded TS 4.5 → 5.x; decision 10: no broad
toolchain refresh. Goal: `tsc --noEmit` runs successfully and becomes the
enforcement basis for Spec 4/5.

## Detailed behavior

1. Bump `typescript` to a 5.x version; choose the newest release compatible
   with `@typescript-eslint/parser@5.62` (its supported TS range caps around
   5.3–5.4; pick within its range and record the choice + reasoning in the
   implementation PR).
2. `tsconfig.json` minimal adjustments for TS 5 (e.g. keep
   `moduleResolution: node`; add explicit `exclude` for `.vite/`, `dist/`,
   `out/`, generated `*.generated.ts` only if the compiler trips on them —
   no `strict` changes).
3. Fix type errors surfaced by `tsc --noEmit` with **minimal, mechanical**
   edits: missing/incorrect types, TS-5 stricter inference, `@types/node`
   version alignment. No logic changes. Any error requiring a logic change is
   escalated to a follow-up decision instead of being hacked around.
4. Add `"typecheck": "tsc --noEmit"` script.
5. Update `CLAUDE.md` §2/§9 verification notes (replace "don't run tsc" with
   the new gate) — documentation alignment is part of this spec.

## Files/modules affected

- `package.json` (+ lockfile regeneration scoped to the TS/types entries)
- `tsconfig.json`
- Type-only edits across `src/**` as required by the compiler
- `CLAUDE.md` (verification notes), `docs/architecture/*` references to the
  TS 4.5 limitation if any

## Data/migration impact

None — no storage, settings, or schema involvement.

## Security impact

- Positive: type-checking is itself a security control (catches unsafe
  refactors in permission/parsing code before runtime).
- Constraint: no security-relevant code may be loosened (`any`-casts,
  assertion removals) just to make the compiler pass; every such edit in
  security-sensitive files (`ipc/registry.ts`, `fs/*` guards, `git/exec.ts`,
  `decideToolUse` core) is called out explicitly in the implementation PR for
  review under ADR-0004.

## Windows-specific behavior

- None beyond path casing in `tsconfig` excludes; verify `tsc` runs on
  Windows dev machines (primary target) and CI ubuntu.

## UI/UX impact

None.

## Impeccable review requirements

Not applicable — no UI/UX decisions.

## Verification plan

- `npx tsc --noEmit` exits 0 on the whole project.
- Renderer build (`vite.renderer.config.mts`), main/preload esbuild bundles,
  and `npm run lint` all still pass.
- `npm start` smoke test: app boots to the empty-state shell.
- Diff review: all `src/**` changes are type-level only (no behavioral diff
  — verified by build output comparison where feasible).

## Acceptance criteria

1. `typescript` is 5.x; `npx tsc --noEmit` passes with zero errors.
2. No runtime dependency versions changed (verified by lockfile diff).
3. ESLint still passes with the pinned `@typescript-eslint@5` toolchain.
4. `typecheck` script exists and is documented in `CLAUDE.md`.

## Dependencies

Sequenced after Spec 2 (voice removal shrinks the type surface). Gates Spec 4
(Vitest, which needs typecheck) and Spec 5 (CI enforces it).

## Known risks

- **ESLint boundary:** `@typescript-eslint@5` may reject newer TS. Bounded
  answer: stay within its supported TS range (likely 5.3/5.4); do NOT upgrade
  ESLint in this spec (that would be the forbidden broad refresh).
- Type-error tail risk: an old TS 4.5 codebase may hide hundreds of errors
  under TS 5. If the tail is beyond mechanical fixing, the spec's fallback is
  to enable `tsc --noEmit` per-project incrementally (main, preload, shared
  first) and record the remainder — decided during implementation, not by
  weakening `noImplicitAny` globally.
- `@types/node` alignment may force a dev-only types bump — allowed (types
  are compile-time; runtime deps stay frozen).
