# Spec 12 — Alpha-gating UX fixes (Ctrl-P register, AA state copy)

- **Status:** Proposed (`ready-for-agent`)
- **Date:** 2026-09-17
- **Governing decisions:** Wayfinder #27 resolution (audit rows B1, B2) · #31 go/no-go bar
- **Format:** mandatory handoff template (16 sections) + User Stories

## Problem

The #27 Impeccable audit found exactly two alpha-gating defects on the
primary platform: the title-bar search hint renders the literal text
"Mod P" on Windows (the mac-only symbol branch never resolves the `Mod`
alias to a platform-correct label), which reads as unfinished and erodes
trust at first contact; and the search-state copy uses the faint color
token, which computes below the 4.5:1 WCAG AA threshold against its surface,
making readable state text insufficiently legible.

## Solution

Fix exactly the two audited defects: make keyboard hint labels
platform-conditional (`Ctrl P` on Windows/Linux, existing symbol mapping on
macOS), and raise the state-copy color token used by those surfaces to meet
AA (4.5:1) against its background. Nothing else in the UI changes; the
post-alpha backlog (audit rows C1–C8) stays deferred.

## User Stories

1. As a Windows user, I want the search hint to read `Ctrl P`, so that the shortcut shown is one that exists on my platform.
2. As a macOS user, I want the existing `⌘`-style symbol hints preserved, so that my platform's convention is not regressed.
3. As a low-vision user, I want search state copy (no-results, empty, hint states) to meet WCAG AA contrast, so that I can read it without strain.
4. As an alpha tester, I want first-contact details to be correct and polished, so that ZEUS reads as a real product rather than a renamed shell.
5. As a ZEUS developer, I want the fix confined to the audited rows, so that the "no full redesign before first contact" decision is respected.
6. As a ZEUS developer, I want the keyboard display mapping unit-tested, so that future key-hint changes cannot silently regress a platform.
7. As a ZEUS developer, I want the AA requirement asserted by a pure test over the token values, so that contrast regressions fail CI rather than a manual review.
8. As the maintainer, I want both #31 go/no-go blockers closed, so that the alpha bar can actually be met.

## Scope

The two audit rows only: B1 (keyboard label platform-conditional display in
the Kbd hint component and its TitleBar usage) and B2 (state-copy contrast
for the global-search faint-text states). Implementation of the audit's
A-group identity rows is explicitly NOT here (ADR-0009/Spec 13); C-group
post-alpha rows stay deferred.

## Non-goals (mandatory)

- No UI redesign, no theme system, no light mode (dark-only token system is a
  constraint).
- No changes to post-alpha backlog rows C1–C8 (platform-conditional copy
  beyond B1, focus sweep, aria-live verification, onboarding tour,
  PRODUCT.md/DESIGN.md, UX copy pass, small-window QA).
- No icon/wordmark/brand work (Spec 13).
- No new components beyond the smallest edit to the existing Kbd hint and
  state-copy token usage.
- No copy rewrites beyond what contrast/label correctness requires.

## Current architecture

- The Kbd hint chip is a small presentational component with a module-private
  pure `display(key)` function that maps mac modifiers to symbols and returns
  the key unchanged on non-mac; the defect is that the TitleBar hint passes
  the alias `Mod`, which the non-mac branch returns verbatim.
- The design system is dark-only with a token ramp; state copy in the global
  search uses the faint token, whose hex value yields ~3.5–3.9:1 against the
  surface — below AA for normal-size text.

## Applicable ADR / decision

Wayfinder #27 (audit rows B1/B2; minimum alpha visual bar); #31 (go/no-go bar
requires both fixed); ADR-0002 (Windows-first — the B1 register is the
primary platform's); ADR-0004 (no security-relevant surfaces).

## Detailed behavior

1. **B1 — platform-conditional key labels.** The `display` mapping resolves
   the common aliases for the running platform: on macOS the existing symbol
   mapping applies (`Mod`/`Cmd`/`Ctrl → ⌘`, `Alt`/`Option → ⌥`,
   `Shift → ⇧`); on Windows/Linux, `Mod` resolves to `Ctrl` and other
   modifiers render as their text names. The platform test remains the
   existing navigator-based check; no new platform abstraction is introduced.
2. **B2 — AA state copy.** The token used by the audited search-state copy
   moves from the faint token to the nearest ramp step meeting ≥ 4.5:1
   against its actual surface background. The ramp itself is unchanged; no
   other consumer of the faint token is force-migrated (only the audited
   state-copy sites).
3. Both fixes are recorded as the Impeccable outcome for the alpha visual
   bar, closing rows B1/B2.

## Files/modules affected

The Kbd hint component (its pure display mapping + the test-support export),
the title-bar usage that passes `Mod`, the global-search state-copy token
usage, the shared token definitions only insofar as documenting the
contrast-verified choice. Exact line targets follow #27's evidence
(`Kbd.tsx:9-16`, `TitleBar.tsx:56`, `GlobalSearch.tsx:210,213,244,298`).

## Data/migration impact

None. No settings, schema, or persisted state changes.

## Security impact

`no security-relevant surface touched` — the change alters display strings
and a color token in renderer presentation only: no IPC channels, no spawn
argv, no SQL, no path resolution, no object merging, no secrets, no outbound
network, no permission/sandbox posture.

## Windows-specific behavior

B1 is the Windows-facing fix: the primary platform's hint register becomes
`Ctrl P`. L3 rows: title-bar hint reads `Ctrl P` on a real Windows machine;
mac symbol mapping verified unchanged via unit tests (mac rendering is not
L3-checkable in a Windows-only environment and is covered by the pure
mapping test).

## UI/UX impact

Minimal and precisely bounded by the audit: correct platform keyboard
register; AA-legible state copy. The Impeccable outcome is recorded here:
both alpha-gating rows closed with the audit's acceptance definitions
(`Ctrl P` rendered on Windows; ≥4.5:1 contrast on the audited copy).

## Impeccable review requirements

The #27 audit (already performed under the `impeccable` methodology) is the
governing review for this spec; its acceptance criteria are carried verbatim
into this spec's verification. No further Impeccable pass is required for
this bounded fix.

## Verification plan

Rungs: **L0 + L1 + L2** (+ **L3** for the B1 platform register).

- **L0:** `npm run typecheck` — 0 errors.
- **L1:** new unit tests for the now-exported pure display mapping —
  `Ctrl P` on a non-mac platform agent (aliased `Mod` input), symbol mapping
  preserved on a mac platform agent, pass-through of plain keys on both; and
  a pure contrast test computing the audited token/background pairs and
  asserting ≥ 4.5:1. Prior art: existing pure-function suites
  (`refName.test.ts`, `release.test.ts`) and the pattern of testing
  `@visibleForTesting` exports per the verification standard.
- **L2:** `npm start` boots; the title-bar hint and the search states render
  with the corrected label/color; no visual regression elsewhere.
- **L3 (Windows, recorded):** packaged/running app on Windows shows `Ctrl P`
  in the title bar; state copy is legible (manual confirmation recorded on
  the checklist per #31).
- **Gates:** lint, renderer build, existing gates unchanged and green.

## Acceptance criteria

1. Title-bar search hint renders `Ctrl P` on Windows and Linux; mac symbols
   unchanged (unit-proven).
2. The audited search-state copy meets ≥ 4.5:1 contrast (unit-proven) and is
   L3-confirmed on Windows.
3. No other UI behavior, token, or component changed (diff audit).
4. #27 rows B1/B2 closeable; the #31 go/no-go blocker list shrinks by both.

## Dependencies

None — independent of Spec 11; may proceed in parallel (different files).
Must be complete before Spec 15 (alpha assembly) runs its go/no-go bar.

## Known risks

1. Choosing a replacement token purely by contrast math could look slightly
   different visually: mitigated by choosing the nearest existing ramp step
   (no new token) and L2 visual check.
2. Platform detection in unit tests: the pure function takes/derives the
   platform explicitly enough to test both branches deterministically.
