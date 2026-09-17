# Spec 11 — Limboo → ZEUS functional rename

- **Status:** Proposed (`ready-for-agent`)
- **Date:** 2026-09-17
- **Governing decisions:** ADR-0010 · Wayfinder #26 resolution · inventory #25
- **Format:** mandatory handoff template (16 sections) + User Stories

## Problem

ZEUS's functional and internal namespaces still carry the inherited Limboo
name: the worktree agent config file, the MCP tool server names, the
attachment-staging and rules directories, checkpoint git refs, the preload
bridge global, environment variables, CSS class names, and the log filename.
A product about to ship its first release as "ZEUS" cannot present Limboo
names in its own plumbing, and #27's audit flags visible Limboo identity as
trust-destroying at first contact.

## Solution

One clean-cut, mechanical rename of every MUST-RENAME identifier from the #25
inventory to its `limboo → zeus` successor, with no compatibility layer, no
migration, and heritage references preserved. All gates, docs, and glossary
entries synchronize in the same change.

## User Stories

1. As a ZEUS user, I want the agent config file in my worktree to be named `zeus.json`, so that the product I installed is what my project files reference.
2. As a ZEUS user, I want MCP tools exposed as `zeus_memory` and `zeus_search`, so that tool allow rules in my editor reference the product I run.
3. As a ZEUS user, I want per-worktree state in `.zeus/`, so that no hidden Limboo directory lives in my repositories.
4. As a ZEUS user, I want checkpoints stored under `refs/zeus/checkpoints/*`, so that my repository refs name the tool that made them.
5. As a ZEUS user, I want memory entries prefixed `[zeus checkpoint]`, so that my memory store is self-describing.
6. As a ZEUS user, I want the preload bridge at `window.zeus`, so that no Limboo global exists in my app's runtime.
7. As a ZEUS user, I want `ZEUS_*` environment variables, so that any shell-level configuration names its product.
8. As a ZEUS user, I want `zeus-*` CSS classes and variables, so that the stylesheet vocabulary matches the product.
9. As a ZEUS developer, I want the rename to be mechanical (`limboo → zeus`), so that review is a diff audit, not a design exercise.
10. As a ZEUS developer, I want no read-old/write-new fallbacks, so that no dual-namespace complexity survives into v1.
11. As a ZEUS developer, I want the crown-jewel gate's `limboo.db` guards left intact, so that the gate keeps policing the legacy name it exists to catch.
12. As a ZEUS developer, I want `CONTEXT.md` glossary entries for every new canonical name, so that future specs use the same vocabulary.
13. As a ZEUS developer, I want SEC-19's Cursor-rule examples updated to `Write(.zeus/**)`, so that the security reference matches reality.
14. As a ZEUS developer, I want heritage documentation (ADR history, upstream banners) left untouched, so that history stays honest.
15. As an alpha tester, I want no `limboo` string anywhere I can observe, so that ZEUS reads as a real standalone product.

## Scope

All functional and internal namespace identifiers classified MUST-RENAME by
#25, the gate/documentation synchronization from #26 §5, and edge cases E1–E3
from the #26 decision record (cached rule materialization, stale
`mcp.json`/`.cursor/rules` entries from dev builds, test fixtures).

## Non-goals (mandatory)

- No compatibility, migration, or dual-read logic for any renamed namespace.
- No changes to `AutoUpdateManager.FEED` values or update-file content
  (Spec 13's scope).
- No visual/mark work: logo, wordmark, icon assets (Spec 13 / ADR-0009).
- No rewrite of historical or upstream heritage references (ADR-0005 history,
  `limboo-ai/limboo` upstream pointers, inherited-history banners in
  `docs/ci/*.md`).
- No versioning/changelog changes (#30 — already implemented in `dda212d`).
- No release workflow creation (Spec 13).
- No unrelated cleanup of files merely containing the word "release" or
  "Limboo" in heritage contexts.

## Current architecture

- `limboo.json` — written/read by the WorktreeManager ack-gate; a missing
  config throws rather than falls back, so no old-config read path exists to
  preserve.
- MCP server names registered in the memory-tools module; the Cursor MCP
  config writer regenerates server entries on every run, so stale
  `mcp__limboo_*` entries in dev machines are corrected by regeneration, not
  migration.
- `.limboo/` staging + `.cursor/rules/limboo-context.mdc` are written per-run;
  the permission materialization consumes the directory from a single
  constants surface.
- `refs/limboo/checkpoints/*` is written by the git manager and only
  documented in the database layer — no read-old scanning exists.
- `window.limboo`, `LIMBOO_*`, `limboo-*` CSS are internal-only (~190 sites
  per #25), never user-visible.

## Applicable ADR / decision

ADR-0010 (mechanical scheme, clean-cut posture, heritage boundary);
constraint from ADR-0004 (security invariants preserved — SEC-19 row updates
with the rename, never weakens); ADR-0005 storage identity untouched.

## Detailed behavior

1. Every MUST-RENAME identifier from the #25 inventory receives its
   mechanical successor (names listed in ADR-0010). Zero shipped users means
   the only acceptance cost is diff size.
2. Rename is performed in one dedicated change, functional and internal
   namespaces together (internal-purity ruling, #26 Q2).
3. The `.claude/` parent directory name is NOT renamed — it is the Claude
   provider's convention, not Limboo's.
4. Gate/doc synchronization per #26 §5: crown-jewel `limboo.db` guard
   literals unchanged; crown-jewel current-implementation doc watch list
   updated only when a watched document actually moves; provider-neutrality
   gate requires no edit solely for this rename; release-note/manifest
   templates regenerate under the new model (versioning treatment owned by
   #30, already landed); `CONTEXT.md` gains glossary entries for `zeus.json`,
   `.zeus/`, `zeus_memory`, `zeus_search`, and the `.limboo` successor; SEC-19
   Cursor-rule examples become `Write(.zeus/**)`; `check-manifest` doc-index
   links follow the `limboo-json.md → zeus-json.md` doc rename.
5. Edge cases from #26: cached rule materialization re-derives from the new
   constants (no stale-cache logic); dev machines keep stale Cursor
   artifacts until the next per-run regeneration (documented, not migrated);
   test fixtures rename with the code so no fixture asserts old names.

## Files/modules affected

Worktree config module, memory-tools/MCP registration, Cursor MCP/rules
writers, permission materialization constants, git checkpoint ref
construction, memory-subject prefix, preload bridge and its ~115 consumer
sites, env-var definitions and reads, global stylesheet and class usage,
`CONTEXT.md` glossary, `docs/security/invariants.md` SEC-19 row,
`scripts/check-crown-jewels.mjs` doc watch list only, docs directory
(`limboo-json.md → zeus-json.md`) and its index links. File paths follow the
#25 inventory's file:line evidence; exact lists belong to the tickets.

## Data/migration impact

None — deliberately. No settings migration, no `SETTINGS_VERSION` bump, no
dual-read. Dev-build residue under old names is abandoned (ADR-0010
consequence).

## Security impact

1. **Surfaces touched:** path joins/resolution (`.zeus/` staging, `.zeus-tmp`
   temp dir, checkpoint ref paths); permission/sandbox posture (Cursor
   allow/deny rule materialization now targets `.zeus/**`); IPC/preload
   bridge naming (`window.zeus` — same channel set, new namespace).
2. **Invariant mapping:** SEC-19 (Cursor rule examples) — updated to
   `Write(.zeus/**)`, same allow/deny structure, no widening; the path
   containment invariants (absolute-path rejection, realpath containment)
   apply unchanged to the new directory names; crown-jewel set is untouched
   (`zeus.db`, `secrets/`, `settings.json`, `window-state.json` — none
   renamed here). No invariant is weakened; per the regression protocol any
   accidental weakening is a release blocker, not a follow-up.

## Windows-specific behavior

- `.zeus-tmp` staging and `.zeus/` directory creation go through the existing
  guarded path helpers; casing/separator behavior is inherited unchanged.
- `ZEUS_*` env vars follow the existing Windows env-var casing conventions of
  the removed `LIMBOO_*` set.
- Checkpoint ref names `refs/zeus/checkpoints/*` remain valid git refs on
  Windows filesystems (same charset as the old prefix).
- L3 checklist rows: worktree creation writes `zeus.json` and `.zeus/` on a
  real Windows filesystem; `.cursor/rules/zeus-context.mdc` materializes.

## UI/UX impact

None directly — user-visible Limboo strings in UI copy, About, tray, and
window titles belong to ADR-0009/Spec 13. This spec removes functional/
internal names only; the two tickets sequence adjacently because they touch
overlapping surfaces (About, Logo) but do not overlap in scope.

## Impeccable review requirements

Not applicable — no UI/UX decisions in this spec. (The #27 audit's identity
rows are ADR-0009's; its alpha-gating rows are Spec 12's.)

## Verification plan

Rungs (per `docs/development/verification.md`): **L0 + L1 + L2 + L3** (this
is platform-sensitive: paths, env vars, git refs).

- **L0:** `npm run typecheck` — 0 errors after the sweep; the type system
  proves every statically-typed reference moved.
- **L1 (existing families, extended where pure):** full `npm test` green
  (162+); the rename's pure surfaces (any regex/lookup tables that change,
  e.g. the memory lookup table successor) get their existing test families
  updated with the new names; fixture-based tests assert new names.
- **L2:** `npm start` boots; create a worktree-backed session → `zeus.json`
  exists, `.zeus/` staging works, checkpoint writes `refs/zeus/checkpoints/*`,
  memory entry shows `[zeus checkpoint]`; MCP tools list as
  `mcp__zeus_memory__*` / `mcp__zeus_search__*`; renderer console shows
  `window.zeus` and no `window.limboo`.
- **L3 (Windows, recorded):** on a real Windows machine — worktree session
  end-to-end; `.cursor/rules/zeus-context.mdc` materializes; no `.limboo/`
  created in a fresh workspace; `ZEUS_*` env vars observable in the agent
  terminal.
- **Gates:** crown-jewel gate, provider-neutrality gate, `check-manifest`,
  `check:unions`, `gen:notes --check` all green post-rename; a full-repo
  search proves zero MUST-RENAME identifiers remain and heritage references
  are intact.

## Acceptance criteria

1. Zero occurrences of every MUST-RENAME identifier (verified by scripted
   search with the #25 evidence list).
2. All heritage/MUST-NOT-RENAME references byte-unchanged (same scripted
   search, inverted).
3. All gates green; typecheck clean; full test suite green with renamed
   fixtures.
4. `CONTEXT.md` glossary and SEC-19 updated as specified.
5. L2/L3 cases observed and recorded.

## Dependencies

None — this is the first implementation ticket. Spec 12 can proceed in
parallel; Spec 13 (identity) sequences **after** this one (overlapping
surfaces: About, Logo, `package.json`).

## Known risks

1. Site-count scale (~450 per #25): mitigated by the mechanical scheme,
   L0/L1 proof, and the scripted before/after searches.
2. A gate or test asserting an old name could be missed by grep if
   constructed dynamically: mitigated by full gate runs + L2 boot smoke.
3. Dev machines retain stale `.cursor`/`mcp.json` artifacts until per-run
   regeneration: documented behavior, not a defect.
