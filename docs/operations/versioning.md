# Versioning

ZEUS follows [Semantic Versioning](https://semver.org/) for the application
version in `package.json`, and tracks two internal schema versions separately.

## Fresh ZEUS release history (#30)

ZEUS release history starts at **`v0.1.0-alpha.1`** — the first ZEUS release
tag. ZEUS inherits no Zeus releases: the Zeus `v1.x` tags were removed from
this repository's development clone, none were ever pushed to the ZEUS remote,
and none are recreated. The committed `package.json` version is the dev
baseline `0.1.0-alpha.0` — a placeholder that real releases overwrite (see
below); it must never ship as an artifact version.

Progression: `v0.1.0-alpha.N` → `v0.1.0-beta.N` → `v0.1.0` (first stable),
then normal SemVer.

## Application version (SemVer)

Given `MAJOR.MINOR.PATCH`:

- **MAJOR** — incompatible changes a user would notice (data layout that requires a
  migration the app cannot perform silently, removal of a capability, a breaking
  change to behavior).
- **MINOR** — new capability added in a backward-compatible way.
- **PATCH** — backward-compatible bug fixes.

Tags are `vX.Y.Z`, and **the tag is the version**: CI stamps it into
`package.json` at build time via `ci/scripts/apply-tag-version.mjs`. The version
committed in `package.json` is only a dev placeholder — never hand-bump it. See
[release process](release-process.md).

## Internal schema versions

Two on-disk schemas are versioned independently of the app version, so they can
evolve without forcing an app-version bump:

- **`SETTINGS_VERSION`** (in [`src/shared/constants.ts`](../../src/shared/constants.ts))
  — bumped when the `AppSettings` shape changes incompatibly. The Settings Manager
  deep-merges, clamps, and migrates on load. Currently 7.
- **`WORKSPACE_SCHEMA_VERSION`** (same file) — bumped when the workspace / database
  schema changes incompatibly. The database runs idempotent migrations keyed on the
  version stored in the `meta` table. Currently 6.

When you change either schema, bump its version and add the corresponding migration.
See [the database](../architecture/subsystems/database.md) and
[the Settings subsystem](../architecture/subsystems/settings.md).

## Changelog

Every release records its changes in [CHANGELOG.md](../../CHANGELOG.md) (Keep a
Changelog format). The `Unreleased` section accumulates entries between releases.

The changelog carries two distinct histories: **ZEUS releases** as `## [<version>]`
sections (the only ones the release-note generator and the in-app release
document read), and the **Zeus heritage archive** — the complete pre-ZEUS
Zeus release history, preserved verbatim with headings demoted to `### [` so
the parser (`ci/scripts/lib/changelog.mjs`) never treats it as ZEUS release
data. Do not promote heritage sections, do not rewrite them, and do not add
ZEUS sections outside the `[Unreleased]` staging area.
