# Spec 13 — ZEUS identity package implementation

- **Status:** Proposed (`ready-for-agent`)
- **Date:** 2026-09-17
- **Governing decisions:** ADR-0009 · Wayfinder #29 resolution · #27 audit A-rows
- **Format:** mandatory handoff template (16 sections) + User Stories

## Problem

Every distribution and first-contact identity surface still says Limboo:
the package/product name, the appId, the copyright, the installer shortcut
and artifact naming, the tray tooltip (which currently derives from the
lowercase internal name and would show "zeus" instead of "ZEUS"), and the
inherited pink-blob mark across runtime icons, tray, installer art, and the
in-app wordmark. A closed alpha inviting real testers cannot ship Limboo
identity in any first-contact or installer surface.

## Solution

Apply the ADR-0009 identity package: canonical `ZEUS`/`zeus`/
`io.github.mohmaedeslam00116.zeus` values across package and installer
metadata, the honest unsigned installer posture, the explicit `ZEUS` tray
display constant, and the interim geometric ZEUS glyph generated from a new
deterministic source SVG through the existing generators.

## User Stories

1. As an alpha tester, I want the installer named `ZEUS-Setup-<version>-x64.exe`, so that what I download is unmistakably the product I was invited to.
2. As an alpha tester, I want the Start-menu shortcut and Add/Remove Programs entry to read `ZEUS`, so that the app is identifiable after install.
3. As an alpha tester, I want the tray tooltip to read `ZEUS`, so that the running app identifies itself correctly at a glance.
4. As an alpha tester, I want the About panel, first-run copy, and window/taskbar identity to read `ZEUS`, so that no Limboo string or mark reaches first contact.
5. As an alpha tester, I want a neutral geometric ZEUS mark instead of the inherited pink blob, so that the product looks intentional, not renamed.
6. As the maintainer, I want the appId anchored to `io.github.mohmaedeslam00116.zeus`, so that Windows taskbar grouping and notification identity are uniquely ZEUS's.
7. As the maintainer, I want `publisherName` absent and `verifyUpdateCodeSignature` false, so that the installer makes no publisher claims the unsigned alpha cannot back.
8. As the maintainer, I want the copyright to read `Copyright © 2026 ZEUS Project` with no trademark claims, so that the metadata is honest.
9. As a ZEUS developer, I want all mark assets regenerated from one deterministic source SVG, so that replacing the final brand later is a one-file change.
10. As a ZEUS developer, I want `app.setName('zeus')`, `%APPDATA%\zeus`, and `zeus.db` untouched, so that storage identity (ADR-0005) is preserved exactly.
11. As a ZEUS developer, I want the legacy screenshots excluded from the alpha surface, so that stale Limboo screenshots don't leak into release materials.
12. As a future contributor, I want the display-name rule (user-visible `ZEUS`, internal `zeus`) documented, so that new code doesn't reintroduce the tooltip seam.

## Scope

Package/installer/runtime identity values per ADR-0009; the interim mark
asset and its regeneration; the tray display-name constant; the optional
window-title constant; screenshot asset disposition. Not the functional
rename (Spec 11) nor the release workflow/feed (Spec 14).

## Non-goals (mandatory)

- No storage identity changes: `app.setName('zeus')`, `%APPDATA%\zeus`,
  `zeus.db`, crown-jewel set remain exactly as pinned by ADR-0005.
- No final brand/logo design (post-alpha work; the interim glyph is defined
  by acceptance criteria, not by design iteration).
- No UI redesign (Spec 12 owns the only pre-alpha UX fixes).
- No updater/feed/FEED changes (Spec 14).
- No code signing or publisher-identity claims.
- No protocol/deep-link scheme or user-agent override (deliberately none).
- No functional namespace renames (Spec 11's scope, sequenced first).

## Current architecture

- `package.json` carries `name: "limboo"`, `productName: "Limboo"`; the
  builder config carries `appId: dev.limboo.app`, `productName: Limboo`,
  inherited copyright/trademarks; the Forge packaging config uses
  `name: 'Limboo'`.
- All mark assets regenerate from a single source SVG (`assets/icon.svg`)
  through two existing generators: runtime icons (PNG set, tray, `.ico`) and
  NSIS installer art (wizard BMPs). Replacing the mark is one file plus two
  script runs.
- The tray tooltip derives from `app.getName()` — with ADR-0005's
  `setName('zeus')` that yields lowercase "zeus", the seam ADR-0009's
  display-name rule closes with an explicit constant.
- No window `title:` override exists; with `productName: "ZEUS"` the
  taskbar/window resolve correctly — an explicit constant is optional
  hardening, specified but not required.
- Legacy screenshots live under the assets tree and are not referenced by
  the app runtime; they surface in documentation/release materials.

## Applicable ADR / decision

ADR-0009 (all values and acceptance criteria); ADR-0005 (protected storage
boundary); ADR-0004 (regression protocol applies to the tray/permission
adjacent code paths); #27 (A-row identity closure; "no full redesign").

## Detailed behavior

1. **Identity values:** package name `zeus`, `productName: "ZEUS"`,
   `appId: io.github.mohmaedeslam00116.zeus`, copyright
   `Copyright © 2026 ZEUS Project`, no legal trademarks field claims,
   shortcut name `ZEUS`, artifact name derives from productName →
   `ZEUS-Setup-<version>-x64.exe`, ARP display name `ZEUS`. The installer
   remains per-user, assisted wizard; `publisherName` absent;
   `verifyUpdateCodeSignature: false` unchanged (the documented honest
   unsigned posture that keeps auto-updates working).
2. **Interim mark:** hand-authored deterministic SVG replacing the source
   asset, meeting ADR-0009's acceptance criteria — dark-only palette, **no
   `#ff0066`**, legible at 16px tray size, geometric ZEUS glyph. All derived
   assets regenerate via the existing `gen:icons` and `gen:installer`
   scripts; no hand-edited generated outputs.
3. **Display-name rule:** tray tooltip switches to an explicit `ZEUS`
   constant; an explicit window-title constant is added as optional
   hardening (specified: same value, applied at window creation).
4. **In-app branding surfaces** (wordmark/logo component, About panel
   identity lines) render `ZEUS` with the new mark.
5. **Screenshots:** the legacy Limboo screenshots are removed from the repo
   (or replaced by alpha- era captures post-release — removal is the alpha
   requirement; replacement is not).

## Files/modules affected

Package manifest and lockfile identity fields, builder config identity
block, Forge packaging config name field, the source SVG asset and its
generated outputs (via generators only), the tray manager tooltip line, the
window-creation title (optional constant), the in-app wordmark/logo
component, the About panel identity lines, the assets screenshots tree.
Exact paths are already inventoried in the #29 decision record's 10-item
coverage list.

## Data/migration impact

None. Identity is display/packaging metadata; storage identity is untouched
(ADR-0005 preserved by design). Fresh installs only — there are no existing
ZEUS users to migrate, and the appId change does not affect `%APPDATA%\zeus`
resolution (pinned by `setName`, not by appId).

## Security impact

1. **Surfaces touched:** none of the eight contract surfaces. The change
   alters packaging metadata, static assets, and two display strings. Tray
   creation code path is touched only in its tooltip string; no IPC, spawn,
   SQL, path resolution, object merging, secrets, outbound network, or
   permission/sandbox semantics change.
2. **Invariant mapping:** no invariant ID is touched. The crown-jewel set
   (`zeus.db`, `secrets/`, `settings.json`, `window-state.json`) is
   unaffected — the appId/productName change does not move the userData root
   (ADR-0005's `setName` governs it). Declared:
   `no security-relevant surface touched` with this justification; the
   crown-jewel gate re-run in verification proves the set unchanged.

## Windows-specific behavior

- The appId becomes the Windows AppUserModelId (taskbar grouping,
  notification identity) — `io.github.mohmaedeslam00116.zeus` uniquely
  identifies ZEUS.
- The `.ico` regenerates from the source SVG at the required multi-size
  embedded format; tray icon must survive 16px rendering (acceptance
  criterion).
- NSIS per-user install posture unchanged; shortcut, ARP display name, and
  artifact name per the identity values. Unsigned SmartScreen expectations
  are documented in the #31 invitation notes, not in the installer.
- L3 rows: install the built `ZEUS-Setup-*.exe` on Windows → shortcut,
  ARP entry, taskbar identity, tray tooltip, and About all read `ZEUS`;
  tray icon legible at 16px; uninstall removes the `ZEUS`-named entry.

## UI/UX impact

First-contact identity swap only: wordmark, About, tray, window/taskbar
identity, installer art. No layout, interaction, or hierarchy changes —
the #27 audit's "minimum visual bar" is the ceiling. Impeccable outcome
recorded: A-row identity items close via this spec + Spec 11's strings.

## Impeccable review requirements

The interim mark is reviewed against ADR-0009's written acceptance criteria
(deterministic SVG, dark-only, no `#ff0066`, 16px legibility) rather than
open design iteration. The #27 audit's minimum alpha visual bar is the
governing review standard; no further Impeccable pass is required.

## Verification plan

Rungs: **L0 + L2 + L3** (+ gates). No new pure logic → no L1 beyond the
existing suites staying green.

- **L0:** `npm run typecheck` — 0 errors (identity constants are typed).
- **L1:** existing test suites green unchanged; if the tray constant is
  exported as a typed constant, it is covered incidentally by L0 (no
  behavior branch to unit test).
- **L2:** `npm start` boots → window/taskbar title reads ZEUS, tray tooltip
  `ZEUS`, About panel shows `ZEUS` + interim mark, no pink `#ff0066` anywhere
  in the running app (devtools palette check), `gen:icons`/`gen:installer`
  regenerate cleanly from the new source SVG.
- **L3 (Windows, recorded — this spec's primary verification):** build the
  NSIS installer; install on Windows; verify artifact name, shortcut,
  ARP entry, taskbar grouping identity, tray icon legibility at 16px, tray
  tooltip, About, window title; uninstall clean.
- **Gates:** `check-manifest`, crown-jewel gate (proves the set unchanged),
  neutrality gate, `gen:notes --check`, renderer build — all green.

## Acceptance criteria

1. All identity values match ADR-0009 exactly (scripted grep audit: zero
   `dev.limboo.app` / `Limboo` product-identity values remain in packaging
   config).
2. Generated mark assets derive from the new source SVG; no inherited pink
   anywhere in generated output.
3. Tray tooltip and window title use explicit `ZEUS` constants.
4. `app.setName('zeus')`, `%APPDATA%\zeus`, `zeus.db` byte-untouched.
5. L3 installer checklist recorded against a real Windows install.
6. Legacy screenshots removed; no Limboo mark in any first-contact surface.

## Dependencies

**Spec 11 first** (adjacent sequencing per #29: same files — package.json,
About, Logo — one wave, not two). Must be complete before Spec 14 (the
release workflow packages the identity) and Spec 15 (go/no-go bar includes
identity rows).

## Known risks

1. Interim glyph aesthetics are subjective: bounded by acceptance criteria,
   not taste; final brand is post-alpha.
2. appId change on dev machines with existing shortcuts: harmless (fresh
   install posture, zero users).
3. Generator determinism: the source SVG must be hand-authored deterministic
   (no embedded randomness/fonts requiring system rendering); the acceptance
   criteria require byte-stable regeneration.
