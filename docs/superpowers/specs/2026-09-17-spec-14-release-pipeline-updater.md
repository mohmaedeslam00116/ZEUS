# Spec 14 — ZEUS-native release pipeline and updater repoint

- **Status:** Proposed (`ready-for-agent`)
- **Date:** 2026-09-17
- **Governing decisions:** ADR-0008 (amending ADR-0006) · Wayfinder #28 resolution
- **Format:** mandatory handoff template (16 sections) + User Stories

## Problem

ADR-0006 removed every publishing path, so ZEUS currently cannot distribute
itself at all: no release workflow exists, and the updater feed still points
at the inherited Limboo repository — meaning an alpha build would either
never update or check the wrong project's releases. The closed alpha needs a
manual, human-gated way to package and publish a Windows prerelease, and an
updater that watches ZEUS's own releases.

## Solution

One ZEUS-native release workflow implementing ADR-0008 exactly:
`workflow_dispatch` with an explicit validated tag → CI gates re-run →
existing hybrid packaging → notes/checksums/manifest → **draft prerelease**
awaiting human Publish. Repoint the feed-writer values and the updater FEED
to `mohmaedeslam00116/ZEUS`/`zeus-updater`, and switch the alpha-era default
update channel to `beta` so invited testers track prereleases out of the box.

## User Stories

1. As the maintainer, I want to dispatch a release run with an explicit tag, so that publishing starts deliberately rather than accidentally.
2. As the maintainer, I want the workflow to refuse an invalid or already-released tag, so that mistakes fail fast before packaging.
3. As the maintainer, I want all existing CI gates re-run inside the release flow, so that a release candidate cannot bypass validation.
4. As the maintainer, I want the run to end at a draft prerelease, so that nothing is public until I review and click Publish.
5. As the maintainer, I want checksums and the provenance manifest attached, so that artifacts are verifiable.
6. As an alpha tester, I want the updater to check `mohmaedeslam00116/ZEUS` releases, so that updates come from the project I installed.
7. As an alpha tester, I want prereleases visible to me by default (beta channel), so that I receive alpha builds without manual configuration.
8. As an alpha tester, I want update installation to require my per-version consent, so that my app never restarts itself unannounced.
9. As an alpha tester, I want a broken alpha to be handled by delete-and-republish plus a higher-version forward fix, so that recovery is simple and predictable.
10. As a ZEUS developer, I want `latest.yml` with embedded sha512 as the integrity anchor, so that the unsigned alpha still has artifact integrity.
11. As a security reviewer, I want update checks to remain governed outbound fetches (SEC-18/SEC-21), so that the release pipeline introduces no new network trust.
12. As a ZEUS developer, I want no signing, multi-OS, delta, or rollout machinery, so that the alpha stays minimal and reviewable.

## Scope

The new release workflow; the FEED/app-update writer value changes; the
alpha-era channel default; the electron-builder publish-comment update; the
operations docs refresh. Excludes identity (Spec 13), versioning policy
(#30, landed), and all deferred CD machinery.

## Non-goals (mandatory)

- No tag-push trigger; no `--publish always` from local scripts; nothing
  auto-publishes.
- No code signing, no certificate acquisition, no signing-config changes
  (verify-signing/signing machinery stays, skipping cleanly when unsigned).
- No multi-OS targets (dmg/AppImage/deb/rpm code paths remain dormant).
- No delta/blockmap download enablement (differential stays disabled).
- No staged-percentage rollout or environment-based CD.
- No new update-channel vocabulary or channel system (the existing
  `stable|beta` settings architecture is preserved; only the alpha-era
  default value changes).
- No changes to consent/no-auto-download/no-auto-resume semantics.
- No versioning/tag-scheme decisions (#30 is locked and landed).

## Current architecture

- Only `ci.yml`, `codeql.yml`, `security.yml` exist — no release workflow
  since #13's isolation.
- The updater's FEED constant and the feed-writer script values still point
  at `limboo-ai/limboo` / `limboo-updater`; `app-update.yml` is generated at
  packaging time from the writer script (single source of truth).
- Channel semantics: `updates.channel: 'stable' | 'beta'`, default
  `'stable'`; `allowPrerelease = (channel === 'beta')`; beta forces
  auto-download off (per-version consent); prereleases never auto-resume.
  `isPrereleaseVersion` is a generic hyphen rule (alpha already covered);
  `channelForTag` maps `-alpha.*` → `'beta'` label (the #30 one-liner,
  landed in `dda212d`).
- Packaging: hybrid Forge-fuses + `electron-builder --prepackaged` → NSIS;
  `electron-builder.yml` documents "no ZEUS-native publishing exists yet
  (future decision + ADR)"; `RELEASE_REPO` is the manifest provenance anchor
  (repointed by Spec 11's rename wave).

## Applicable ADR / decision

ADR-0008 (this spec implements it; ADR-0006's structural bans remain);
ADR-0004 (SEC-18/SEC-21 outbound-network invariants); #28 decisions D1–D9;
#30 (tag-input validation rules already defined: SemVer-tag format, no
duplicate release).

## Detailed behavior

1. **Workflow:** one new `release.yml` — `workflow_dispatch` inputs `tag`
   (required) and optional `prerelease-title`; validate the tag against the
   #30 SemVer-tag rules and refuse an existing release for that tag; run the
   existing validation gates (typecheck, tests, lint, neutrality, crown-jewel,
   unions, manifest/notes checks) then `npm run dist`; attach checksums and
   the provenance manifest; generate release notes from the canonical
   changelog (the #30 model); upload a **draft prerelease**. The human
   Publish click is the approval gate.
2. **Feed repoint:** the updater FEED constant → owner/repo
   `mohmaedeslam00116/ZEUS`; the feed-writer values → `zeus-updater` /
   ZEUS repository; regenerated `app-update.yml` consequently points at ZEUS
   releases. Differential downloads remain disabled.
3. **Alpha channel default:** the default `updates.channel` becomes
   `'beta'` for the alpha era, so testers track prereleases out of the box.
   No other channel behavior changes.
4. **Security posture:** update checks remain governed outbound fetches
   (SEC-18: resolve-before-connect against the fixed feed host; SEC-21:
   documented update-feed signing posture — sha512-in-`latest.yml` is the
   alpha integrity anchor; no credentials in workflow artifacts or
   configuration). The `GITHUB_TOKEN` used by the workflow is the standard
   ephemeral one; no PATs or secrets are added.
5. **Docs:** the auto-update operations doc, the electron-builder
   publish-comment block, and related CI docs refresh to describe the new
   flow; the rollback posture (delete-and-republish + forward fix) is stated
   in the alpha program runbook (#31) and referenced, not duplicated.

## Files/modules affected

New workflow file; updater FEED constant; feed-writer script values;
settings-channel default constant; electron-builder config comment block;
`docs/operations/auto-update.md` and related CI docs. (The `RELEASE_REPO`
repoint happens in Spec 11; the workflow consumes its new value.) The #28
record's D8 file list governs; exact paths belong to the tickets.

## Data/migration impact

None for storage. The settings default change affects only fresh installs'
initial channel value (zero existing users); no `SETTINGS_VERSION` bump is
required since the settings schema is unchanged — only the default constant
changes. Existing dev installs that already persisted `channel` keep their
value (normal settings precedence, not a migration).

## Security impact

1. **Surfaces touched:** outbound network (the updater's feed host changes
   from Limboo's to ZEUS's repository — same governance, new target); the
   release workflow (new CI surface handling artifacts; no secrets beyond
   the ephemeral `GITHUB_TOKEN`).
2. **Invariant mapping:** SEC-18 (outbound fetch governance /
   resolve-before-connect) — preserved: the feed host is a fixed, validated
   constant; no user- or renderer-supplied URLs enter the fetch path. SEC-21
   (update-feed signing posture) — preserved and documented: unsigned alpha
   with sha512-in-`latest.yml` integrity; no weakening of the update
   validation. No secrets embedded in artifacts/config (checked in
   verification). No permission/sandbox, IPC, spawn, SQL, path, or
   renderer-object changes.

## Windows-specific behavior

- NSIS remains the only alpha target; the workflow packages via the existing
  hybrid flow on a Windows runner.
- `app-update.yml` + `latest.yml` semantics under electron-builder's NSIS
  target apply (sha512 embedded; blockmap generated but differential
  downloads disabled).
- L3 rows: dispatch a real run on a Windows runner → packaging completes;
  the produced installer installs; the installed app's updater initializes
  against the ZEUS feed and its update-check resolves cleanly (structural
  verification per #31's alpha.1 gate).

## UI/UX impact

None directly. The update-available consent UX is unchanged; the channel
label copy ("Beta update available") remains as #28 decided.

## Impeccable review requirements

Not applicable — no UI/UX decisions.

## Verification plan

Rungs: **L0 + L1 + L2 + L3** (IPC/outbound + platform-sensitive).

- **L0:** `npm run typecheck` — 0 errors (FEED constant, channel default).
- **L1:** existing updater/pure-helper suites green; the feed-writer script
  gets a unit test asserting the generated `app-update.yml` values point at
  the ZEUS repository and retain the existing fields (prior art:
  `scripts/*.test.mjs` pattern of the crown-jewel/neutrality gate tests);
  `channelForTag` suite remains green.
- **L2:** `npm start` boots; updater initializes without error; update-check
  against the ZEUS feed resolves cleanly (no fetch errors in the updater
  log); beta-channel default observable in settings state.
- **L3 (Windows, recorded):** the structural half of #31's alpha.1 update
  gate — packaged build's embedded `app-update.yml` points to
  `mohmaedeslam00116/ZEUS`; updater init clean; feed resolution clean.
  The end-to-end `alpha.1 → alpha.2` update test is **alpha.2's release
  gate**, not this spec's.
- **Workflow validation:** YAML-validated; dispatch-path dry-run verified
  (tag validation refuses a bad/duplicate tag before packaging).
- **Gates:** all existing CI gates green and unweakened; `gen:notes --check`
  in sync.

## Acceptance criteria

1. `release.yml` exists, dispatch-only, draft-prerelease-terminating, with
   tag validation and gate re-runs; no tag-push trigger anywhere.
2. FEED + generated `app-update.yml` point to `mohmaedeslam00116/ZEUS` /
   `zeus-updater`; differential disabled.
3. Alpha-era default channel is `beta`; all consent/no-auto-resume semantics
   unchanged (existing tests prove).
4. No secrets in workflow/config; SEC-18/SEC-21 mappings hold.
5. L3 structural update-path evidence recorded; operations docs updated.
6. No deferred CD machinery present (grep-verifiable).

## Dependencies

**Spec 11** (RELEASE_REPO value) and **Spec 13** (installer identity the
workflow packages) must land first. Must be complete before Spec 15.

## Known risks

1. First real dispatch exercises untested runner behavior: mitigated by a
   dry-run dispatch to a throwaway draft before the alpha run (allowed —
   drafts are private).
2. electron-builder NSIS version pins: existing pins preserved; no upgrades
   in this spec.
3. Feed host change invalidates any dev-build's cached update state:
   harmless (dev builds re-resolve; zero users).
