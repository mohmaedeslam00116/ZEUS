# Branded installer and auto-update

ZEUS treats installation as the first screen of the app: a branded, multi-page
Windows installer that reuses the app's pure-black (`#000000`) theme and the
interim ZEUS bolt mark, plus in-app auto-update. This document explains the
hybrid build flow, how the updater is fed, and how releases are published and
authenticated.

## Hybrid build flow (Forge + electron-builder)

Electron Forge stays the primary tool: it drives `npm start` (Vite HMR) and
`electron-forge package`, which applies the Vite build, the security **fuses**, and
the **asar / asar-unpack** layout. electron-builder runs as a second step over that
already-packaged directory (`--prepackaged`), so it never re-packs the app — the
fuses and asar-integrity Forge baked in are preserved — and only produces the
branded installers plus the `latest*.yml` auto-update metadata.

```
npm start            electron-forge start                       # dev (HMR)
npm run package      electron-forge package                     # -> out/Zeus-<plat>-<arch>/
npm run dist         node scripts/dist.mjs                      # hybrid wrap -> dist/ (NSIS on Windows)
```

`electron-builder.yml` deliberately carries **no `publish:` block** — it would
re-enable `electron-builder --publish` and alter the feed baked into packaged
builds. Publishing happens exclusively through the release workflow (below).

During the Windows-only closed alpha, **NSIS is the only distributable target**
(#28); the macOS/Linux packaging branches remain in the config and scripts but
are dormant. Both the app and the auto-update are per-user (no elevation), and
`deleteAppDataOnUninstall: false` so uninstalling **never** wipes the user's
workspaces, `zeus.db`, memories, logs, or terminal history.

## Auto-update

`AutoUpdateManager` (`src/main/managers/AutoUpdateManager.ts`) wraps
`electron-updater`. It configures the GitHub feed programmatically and reads the
`latest*.yml` published to ZEUS's GitHub Releases. It is active **only** in a
packaged build; it is a no-op in dev. Status flows to the renderer over the
`update:status` IPC event and surfaces as the `UpdateBanner` plus the
**Settings → Updates** panel (auto-check / auto-download toggles + "Check now").

**Feed destination (ADR-0008):** `github` provider, repository
`mohmaedeslam00116/ZEUS`, cache dir `zeus-updater`. The values live in exactly
two places — `AutoUpdateManager.FEED` (runtime) and
`scripts/write-app-update-yml.mjs` (the feed file written into every packaged
build's `resources/app-update.yml`), which is pinned by unit tests.

**Channel semantics (unchanged):** settings expose `stable | beta`; the
alpha-era **default is `beta`** so invited testers track prereleases out of the
box. `allowPrerelease = (channel === 'beta')`; the beta channel forces
auto-download **off** (every update is explicit per-version consent); a
prerelease update never auto-resumes after an interruption. Update checks are
governed outbound fetches (SEC-18: host-fixed feed, no renderer-supplied URLs,
resolve-before-connect).

**Integrity (SEC-21, honest unsigned posture):** the alpha is **unsigned**.
Update integrity rests on the **sha512 digests electron-builder embeds in
`latest.yml`**, which electron-updater verifies before applying an update. No
`publisherName` is declared anywhere — declaring one would make electron-updater
demand a valid Authenticode signature and break every update. Code signing is a
post-alpha decision; SmartScreen handling for testers is documented in the
[alpha program](alpha-program.md).

## Release flow (manual dispatch, ADR-0008)

Releases are cut by dispatching [`.github/workflows/release.yml`](../../.github/workflows/release.yml)
with an explicit `vX.Y.Z[-pre]` tag:

1. The workflow validates the tag (SemVer shape, no duplicate remote tag, no
   re-tagged commit) and re-runs the full CI gate set.
2. It stamps the tag's version into `package.json`
   (`ci/scripts/apply-tag-version.mjs`), packages via the hybrid flow, and
   assembles the publish set: NSIS installer, `latest.yml`, `SHA256SUMS`, the
   provenance release manifest (`ci/scripts/generate-release-manifest.mjs`), and
   structural artifact verification (`ci/scripts/verify-artifacts.mjs`).
3. It generates the release notes from `CHANGELOG.md` (the single source of
   truth) and creates a **draft prerelease** — and stops there.
4. **The maintainer reviews the draft (artifact, notes, checksums) and clicks
   Publish.** That click is the human approval gate. Nothing auto-publishes;
   tag-push triggers are structurally banned (#13, ADR-0006, ADR-0008).

A broken published alpha is handled by delete-and-republish plus a
higher-version forward fix; testers on the broken build manually reinstall —
there is no downgrade or channel-pinning machinery. The operational runbook
lives in the [alpha program](alpha-program.md).

## Release authentication

The workflow uses only the **built-in ephemeral `GITHUB_TOKEN`**
(`contents: write`). No PATs, no added repository secrets, no credentials in
artifacts or configuration (ADR-0008). Local release builds (`npm run dist`)
produce the same publish set without any token; publishing from a local
machine is not part of the alpha flow.
