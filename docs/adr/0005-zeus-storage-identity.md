# ADR 0005 — ZEUS pins its own storage identity (`%APPDATA%/zeus`)

- **Status:** Accepted
- **Date:** 2026-09-16
- **Context:** Round 2 grilling — storage identity (closed before feature work)

## Context

Electron derives the userData directory from the app name. Limboo's data
(`limboo.db`, `secrets/`, `settings.json`, `worktrees/`, `attachments/`) lives
under `%APPDATA%/Limboo`, derived from `productName: "Limboo"`. The visible
rebrand is deferred (Round 1, decision 8), but storage identity cannot wait:
if ZEUS inherits the Limboo path, it silently shares and overwrites a real
Limboo installation's state; if the decision is deferred, a later rename
forces a data migration.

## Decision

Pin a stable internal identity now, independent of visible branding:
`app.setName('zeus')` at startup, so userData resolves to `%APPDATA%/zeus`
with ZEUS's own `zeus.db`, `secrets/`, `settings.json`, `worktrees/`, and
`attachments/`. There is **no automatic Limboo → ZEUS migration in v1**.
Existing Limboo installations and their data remain fully independent.

## Consequences

- ZEUS starts with a fresh storage root; no migration code, no migration bugs.
- `app.setName` must run before any persistence-touching code in the boot
  sequence; the DB filename change (`limboo.db` → `zeus.db`) is part of the
  storage-identity implementation task.
- The visible rebrand remains deferred without touching storage again —
  identity is decoupled from branding by construction.
- Users with existing Limboo data start clean in ZEUS (documented behavior,
  not an accident).
