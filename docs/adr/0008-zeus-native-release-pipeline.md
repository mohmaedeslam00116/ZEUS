# ADR 0008 — ZEUS-native release pipeline; manual-dispatch draft prerelease

- **Status:** Accepted
- **Date:** 2026-09-17
- **Context:** Wayfinder Phase 3 decision #28 (release pipeline + auto-update feed posture)

## Context

ADR 0006 neutralized every inherited Limboo publishing path and deferred
ZEUS-native publishing. The deferred decision is now made for the closed
alpha: ZEUS must distribute a signed-by-nothing Windows NSIS installer to
invited testers through a prerelease GitHub Release, with auto-update pointed
at ZEUS's own repository. Tag-push publishing remains structurally banned.

## Decision

Re-introduce publishing **solely** as a manual-dispatch draft-prerelease flow:

- One ZEUS-native `release.yml`: `workflow_dispatch` with an explicit, validated
  `tag` input (duplicate-release protected) → existing CI gates re-run → the
  existing hybrid packaging flow (Forge fuses + `electron-builder --prepackaged`,
  NSIS only) → notes/checksums/manifest assembly → **draft prerelease**.
- The maintainer's review of the draft and manual **Publish** click is the
  human approval gate. No tag-push trigger; nothing auto-publishes.
- The updater feed (`AutoUpdateManager.FEED`, `write-app-update-yml.mjs`)
  points to `mohmaedeslam00116/ZEUS` releases (`zeus-updater`); differential
  (blockmap) downloads stay disabled.
- Alpha-era builds default the update channel to `beta` so invited testers
  track prereleases out of the box; existing consent, no-auto-download, and
  no-auto-resume semantics are preserved untouched.
- Update checks remain governed outbound fetches under SEC-18/SEC-21; no
  credentials in workflow artifacts.

This **amends ADR 0006**: its final consequence ("ZEUS has no release channel")
is superseded; its structural bans (no tag-push triggers, no Limboo targets)
remain in force.

## Consequences

- Publishing requires a deliberate human action at the draft boundary.
- A broken alpha release is handled by delete-and-republish plus a
  higher-version forward fix; testers on the broken build manually reinstall
  (no downgrade/pinning machinery).
- Code signing, multi-OS feeds, delta channels, and staged rollout remain out
  of scope until separate decisions.
