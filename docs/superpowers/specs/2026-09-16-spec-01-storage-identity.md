# Spec 1 — ZEUS Storage Identity

- **Phase:** 1 (Infrastructure prerequisites, item 1)
- **Applicable ADR / decision:** ADR-0005 (closed)
- **Status:** Draft for review — specification only

## Problem

Electron derives the userData directory from the app name. ZEUS currently
inherits `productName: "Limboo"` (package.json) / `productName: Limboo` +
`appId: dev.limboo.app` (electron-builder.yml), so a ZEUS build resolves
`app.getPath('userData')` to `%APPDATA%/Limboo` and would read, write, and
overwrite a real Limboo installation's state (`limboo.db`, `secrets/`,
`settings.json`, `worktrees/`, `attachments/`). ADR-0005 requires ZEUS to own
`%APPDATA%/zeus` with a fully separate storage identity, decided before any
feature work.

## Scope

- Pin ZEUS's internal identity so Electron's userData root resolves to
  `%APPDATA%/zeus` independent of the deferred visible rebrand.
- Rename the database file from `limboo.db` to `zeus.db`.
- Audit and update every userData-relative path reference, tests-of-record,
  and documentation mentions tied to the storage identity.

## Non-goals

- No data migration from Limboo (`%APPDATA%/Limboo` is never read or copied).
- No visible rebrand: product name, appId, installer art, icons, update-feed
  identity stay as inherited until the deferred rebrand decision.
- No schema changes to the database itself.
- No changes to settings shape or `SETTINGS_VERSION` semantics (only the
  storage location they live under changes).

## Current architecture

- `app.getPath('userData')` is consumed directly in at least:
  `db/database.ts:21` (`path.join(userData, 'limboo.db')`),
  `secrets/SecretStore.ts:41` (`secrets/`), `attachments/AttachmentManager.ts:117`
  (`attachments/`), `worktree/paths.ts:30` (`worktrees/`),
  `harness/sandbox/stateRoot.ts:59` (`harness-state/`),
  `sandbox/policy.ts:79` (sandbox/crown-jewel resolution), `storage.ts:13`
  (settings/window-state via `storagePath(name)`), `AgentManager.ts:7629`
  (crown-jewel guard path resolution).
- `app.setName(...)` is not called anywhere today; the only `setName` hits are
  an unrelated React state setter.
- Electron derives the name from `productName` in package.json unless
  `app.setName` runs before the path is first resolved.

## Applicable ADR / decision

ADR-0005: `app.setName('zeus')` at startup; fresh storage root; **no automatic
Limboo → ZEUS migration in v1**; identity decoupled from visible branding.

## Detailed behavior

1. In `src/main/index.ts`, call `app.setName('zeus')` as the first
   main-process statement — before any module reads `app.getPath('userData')`
   at import/constructor time. (Import order audit is part of this spec:
   several managers resolve paths in constructors, so setName must precede
   the composition root.)
2. Change `db/database.ts` to join `'zeus.db'` instead of `'limboo.db'`.
3. Update the crown-jewel path set (`AgentManager` `touchesCrownJewel`,
   `sandbox/policy.ts` `crownJewelPaths()`) so it references the new DB
   filename consistently — the three security layers must keep denying the
   same logical files.
4. Keep every other path relative to `app.getPath('userData')` (they follow
   automatically); no hardcoded absolute paths are permitted (verify).
5. Remove/replace user-visible or log-facing strings that reference the Limboo
   DB filename where they exist (e.g. `AgentManager.ts:6405` comment/doc
   context is a security note — update the filename in it).

## Files/modules affected

- `src/main/index.ts` (setName placement + import-order audit)
- `src/main/db/database.ts`
- `src/main/managers/AgentManager.ts` (crown-jewel matching, comments)
- `src/main/managers/sandbox/policy.ts`
- Possibly `forge.config.ts`/`electron-builder.yml` — **unchanged** in this
  spec (deferred rebrand), recorded here to prevent scope creep.

## Data/migration impact

- ZEUS starts with an empty storage root: first run creates a fresh `zeus.db`,
  seeds defaults (Memory `seedDefaults`), re-creates settings from
  `DEFAULT_SETTINGS`. This is the specified behavior, not data loss.
- No Limboo data is read, imported, or destroyed. Existing Limboo installs
  remain untouched and runnable.

## Security impact

- `sandbox: true`, `contextIsolation`, sender validation: untouched.
- Crown-jewel denial must be re-verified after the DB rename: all three
  layers (decision core, provider translation, sandbox floor) must resolve
  the new `zeus.db` path. A missed reference would either deny the wrong file
  or leave the DB un-denied — both are release blockers under ADR-0004.
- No new IPC, no new network paths, no permission-surface changes.

## Windows-specific behavior

- Primary target: `%APPDATA%\zeus` resolution under Windows roaming profile
  semantics; verify no 8.3/short-name or case-sensitivity surprises.
- `app.setName` before `ready` is safe on Windows.
- **Identity surfaces (resolved by contradiction review — precise, not a
  rebrand):** the renderer and preload contain **zero** hardcoded identity
  strings (verified). Main has exactly one: `TrayManager.ts:44` hardcodes
  the tray tooltip `'Limboo'`. After `setName('zeus')`: notifications and
  OS-level app identity read `zeus` (from the app name), while the tray
  tooltip would still say `Limboo` — an inconsistency. The implementation
  switches the tray tooltip to `app.getName()` so the pre-rebrand state is
  internally consistent. This is a consistency fix, explicitly **not**
  visible-branding work; installer/app icons and `productName` stay Limboo
  until the deferred rebrand.

## UI/UX impact

None — no user-facing surfaces change. (Settings/about screens may display
app name; that is branding, deferred.)

## Impeccable review requirements

Not applicable — no UI/UX decisions in this spec.

## Verification plan

- Boot test: fresh run creates `%APPDATA%/zeus/zeus.db` + `secrets/` +
  `settings.json`; `%APPDATA%/Limboo` is never created/touched.
- Agent-run test: crown-jewel denial still triggers for DB/secrets/settings
  paths (all three layers).
- Existing validation: `npx vite build --config vite.renderer.config.mts` +
  `npm run lint` (per CLAUDE.md §2, until TS-5/Vitest gates exist).
- grep audit: no remaining `limboo.db` references in `src/` except historical
  comments explicitly marked as historical.

## Acceptance criteria

1. ZEUS resolves `%APPDATA%/zeus` on every start, regardless of `productName`.
2. DB file is `zeus.db`; all crown-jewel layers deny it consistently.
3. A pre-existing Limboo install's data is provably untouched (path audit).
4. No migration code exists.

## Dependencies

None — first in the Phase-1 order. Must land before session/worktree product
work (Phase 2) so all subsequent testing runs against the ZEUS root.

## Known risks

- Import-time path resolution in managers could read `userData` before
  `setName` executes on some module-load orders — mitigated by the explicit
  import-order audit and a boot assertion (userData basename === `'zeus'`).
- Electron notification/OS identity will read `zeus` pre-rebrand — an
  accepted consequence of ADR-0005 (identity decoupled from branding); the
  single hardcoded `Limboo` tooltip is aligned to `app.getName()` for
  consistency (see Windows-specific behavior). Cosmetic, documented,
  acceptable until the deferred rebrand decision.
