# ADR 0009 — ZEUS identity package (display name, appId, interim mark)

- **Status:** Accepted
- **Date:** 2026-09-17
- **Context:** Wayfinder Phase 3 decision #29 (identity package)

## Context

The product surfaces still carry Limboo identity: `productName: "Limboo"`,
`appId: dev.limboo.app`, the inherited pink-blob mark, and Limboo installer
metadata. The alpha's first-contact surfaces must read as ZEUS without a full
visual redesign (the #27 audit bounds the work), and storage identity is
already pinned independently by ADR 0005.

## Decision

- **Canonical identity:** display name `ZEUS`; package name `zeus`;
  `appId: io.github.mohmaedeslam00116.zeus` (reverse-DNS anchored to the actual
  GitHub owner — `dev.limboo.app` is inherited identity and unowned domains
  like `dev.zeus.app` are not claimed); copyright `Copyright © 2026 ZEUS
  Project`; no trademark claims.
- **Display-name rule:** user-visible identity renders `ZEUS`; internal and
  storage identifiers remain lowercase `zeus`. The tray tooltip uses an
  explicit `ZEUS` display constant rather than `app.getName()`
  (`app.setName('zeus')` from ADR 0005 stays; `%APPDATA%\zeus` and `zeus.db`
  are untouched).
- **Interim mark:** a neutral geometric ZEUS glyph, hand-authored deterministic
  SVG at `assets/icon.svg` as the single source asset, regenerated through the
  existing `gen:icons` + `gen:installer` generators. Acceptance criteria:
  dark-only palette, **no inherited pink `#ff0066`**, legible at 16px tray
  size. The final brand mark is post-alpha work.
- **Installer identity (honest unsigned posture):** artifact
  `ZEUS-Setup-<version>-x64.exe`; shortcut and Add/Remove Programs display name
  `ZEUS`; `publisherName` remains absent; `verifyUpdateCodeSignature` stays
  `false`; no verified-publisher wording anywhere. Per-user install posture is
  unchanged.
- **Deliberately none:** protocol/deep-link registration and user-agent
  overrides (none exist in-repo).

## Consequences

- Installer, app, and taskbar identity agree on `ZEUS` at every first-contact
  surface; no Limboo/Orbit mark ships.
- The unsigned posture is documented behavior: testers see SmartScreen
  warnings, handled in the invitation notes (the #31 alpha program).
- Replacing the final brand later touches only the source SVG and the
  generators.
