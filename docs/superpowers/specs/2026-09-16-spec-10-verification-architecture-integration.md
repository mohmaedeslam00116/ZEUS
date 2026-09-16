# Spec 10 — Verification Architecture Integration

- **Phase:** 2 (Product/architecture specifications, item 10)
- **Applicable ADR / decision:** ADR-0007 (closed) — incremental verification,
  pure-module discipline, CI-enforced over time
- **Status:** Draft for review — specification only

## Problem

Specs 3–5 establish typecheck, the Vitest foundation, and CI gates as
infrastructure; Spec 9 anchors security invariants to tests where possible.
What Phase-2 product specs still lack is the *integration contract*: how each
spec states what "verified" means, which verification layers apply to which
kind of change, and how the pure-module discipline governs new logic. Without
it, every product spec invents its own verification vocabulary.

## Scope

- Define the ZEUS verification ladder and which rungs each spec class must
  satisfy.
- Make the pure-module discipline a concrete design rule for new logic.
- Define test-support export policy, fixture policy, and the Windows manual
  checklist template.
- Refine what the handoff template's `Verification plan` section must
  contain.

## Non-goals

- No new frameworks, coverage thresholds, or CI changes (Spec 5 owns CI).
- No E2E automation (deferred; the ladder names it as a future rung).
- No retroactive test backfill beyond Spec 4's families.
- No changes to product code.

## Current architecture (verified, post-Phase-1)

- `tsc --noEmit` gate (Spec 3) — whole project type-correct.
- Vitest (Spec 4) with suites for: `refName.ts`, `git/refs.ts`,
  `graph/builder.ts`, `telemetry/accumulator.ts`, pure `git/parse`/`status`
  functions.
- CI `validate` job (Spec 5): lint → typecheck → tests → inherited generic
  gates (security invariants, license, docs integrity) → provider-neutrality
  gate (Spec 8) → crown-jewel gate (Spec 9).
- Pure-module precedents: `graph/builder.ts`, `telemetry/accumulator.ts`
  ("no DB, no IPC, no clock" by design), `refName.ts` (rule table shared
  main/renderer).

## Applicable ADR / decision

ADR-0007 consequences: the pure-module discipline becomes the default design
affordance; CI enforces verification; E2E remains a later deliberate rung.

## Detailed behavior

1. **The verification ladder** (documented in a new
   `docs/development/verification.md`):
   - **L0 — typecheck:** `tsc --noEmit` (every change, non-negotiable).
   - **L1 — unit:** Vitest for pure logic touched or added.
   - **L2 — boot smoke:** `npm start`, app boots, touched surface exercised.
   - **L3 — Windows manual checklist:** the platform-specific pass (spawning,
     PTY, paths, packaging-relevant behavior) — the primary-target gate.
   - **L4 — E2E (future/deferred):** named as the eventual home for
     cross-process flows; nothing depends on it now.
2. **Rung requirements by change class:**
   - Infrastructure/CI-only: L0 + CI observation.
   - Product logic (parsing, decision, aggregation): L0 + L1 + L2 + L3 if
     platform-sensitive.
   - IPC/process-boundary changes: L0 + L2 + L3 (L1 for any pure validation
     helpers involved).
   - UI-adjacent changes: L0 + L2 + L3, plus the Impeccable outcome
     reference where the AGENTS.md rule triggered.
   - Docs-only: CI docs-integrity gates.
3. **Pure-module rule (concrete):** new parsing, decision, scoring, or
   aggregation logic lands as pure functions/classes (no DB, IPC, clock, or
   Electron imports) with an L1 suite, OR the PR documents why purity was
   impractical. This operationalizes ADR-0007's consequence for all future
   code.
4. **Test-support export policy:** exporting a symbol solely for tests
   requires a `/** @visibleForTesting */`-style marker and justification in
   the PR; production behavior must never branch on test mode.
5. **Fixture policy:** committed, hermetic fixtures (no network, no clock,
   no per-run git invocation); the `git check-ref-format` corpus pattern
   (pre-generated fixtures) is the model.
6. **Windows manual checklist template:** a short, reusable list in
   `verification.md` (paths/semantics, spawn/PTY, long-path clamps,
   installer-relevant surface) referenced by product specs' `Verification
   plan` sections.
7. **Template refinement:** the handoff's `Verification plan` section gains
   one line of guidance: "name the ladder rungs and the concrete cases per
   rung" (handoff is ZEUS-owned; a one-line addition, no structural change).

## Files/modules affected

- `docs/development/verification.md` (new)
- `docs/superpowers/specs/2026-09-16-zeus-to-spec-handoff.md` (one-line
  template guidance)
- `CLAUDE.md` §9 (pointer to the ladder, replacing the build/lint-only
  verification note after Specs 3–5 land)
- `AGENTS.md` (one-line pointer, optional)

## Data/migration impact

None.

## Security impact

- The ladder makes ADR-0004's enforcement concrete: security-relevant changes
  must name the test/CI anchor that guards each touched invariant (per Spec
  9's contract) and reach at least L2+L3 when platform-sensitive surfaces
  are involved.
- No new attack surface (documentation and process only).

## Windows-specific behavior

- L3 is the Windows-specific enforcement rung; the checklist template lives
  in `verification.md` and is mandatory for spawn/PTY/path-touching specs.

## UI/UX impact

None (process doc). UI-adjacent specs reference the Impeccable review
outcome within their verification statements.

## Impeccable review requirements

Not applicable to this spec itself.

## Verification plan

- Apply the ladder retroactively to Specs 1–9 as a consistency exercise
  (each already names verification steps; gaps fixed).
- Doc review: every rung names its concrete tool/script; nothing aspirational
  except the explicitly-deferred L4.

## Acceptance criteria

1. `docs/development/verification.md` defines the ladder, rung requirements,
   pure-module rule, export/fixture policies, and the Windows checklist.
2. The handoff template points `Verification plan` at it.
3. New-logic PRs after merge are reviewable against a written standard.

## Dependencies

After Specs 3–5 (the infrastructure it integrates) and Spec 9 (the security
anchor mapping). Completes Phase 2; all future implementation tickets derive
their "definition of done" from this document.

## Known risks

- Process weight: five rungs sound heavy but map to existing scripts; the
  doc must keep each rung to a one-line command plus scope note.
- Boilerplate rung-naming in specs — mitigated by requiring *concrete cases*
  per rung, which cannot be faked as easily as rung labels.
