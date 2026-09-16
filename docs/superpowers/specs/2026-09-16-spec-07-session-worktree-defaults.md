# Spec 7 — Session/Worktree Defaults (Plain-First Product Model)

- **Phase:** 2 (Product/architecture specifications, item 7)
- **Applicable ADR / decision:** Round-2 decision (plain session default;
  worktree opt-in; no task-centric redesign) + ADR-0001 (in-place evolution)
- **Status:** Draft for review — specification only

## Problem

Limboo's product defaults steer every new session toward worktree isolation:
`settings.git.worktrees.enabled: true` **and** `autoSetup: true` (defaults in
`src/shared/constants.ts`), where `autoSetup` gates the renderer's
auto-offer of a per-session worktree. ZEUS's decision inverts the product
posture: **plain sessions are the default; worktree-backed sessions are an
explicit opt-in.** The architecture already supports both (the sessions table
carries nullable `worktree_path/branch/status`; `resolveSessionRoot` falls
back to the workspace path) — only the defaults and the offer flow change.

## Scope

- Flip the product defaults so new sessions are plain by default.
- Keep worktree provisioning fully functional and reachable as an explicit
  user action.
- Preserve `resolveSessionRoot` / `resolveActiveRoot` behavior unchanged.

## Non-goals

- No removal or weakening of the WorktreeManager, worktree IPC, recovery
  (`repair`/`prune`), ack-hash gate, or `WorktreeTabs` UI.
- No task-centric session redesign.
- No new UI design (the "create worktree" affordance already exists; any
  *new* or *redesigned* affordance would require Impeccable and is out of
  scope here).
- No `branchPrefix` rebrand (`limboo` → `zeus`) — that is user-visible
  branding, deferred with the rebrand.

## Current architecture (verified)

- Defaults: `worktrees: { enabled: true, root: '', branchPrefix: 'limboo',
  autoSetup: true, confirmHooks: true, teardownOnArchive: false }` —
  `src/shared/constants.ts` (DEFAULT_SETTINGS).
- `WorktreeManager.createForSession(sessionId, opts)` is the provisioning
  entry; `WorktreeManager.ts:163` throws when `enabled` is false.
- `WorktreeManager.ts:588` documents that `autoSetup` gates only the
  renderer's auto-offer — main-process creation is always permitted.
- `SessionManager` persists `worktree_path/branch/status` (nullable) onto
  sessions; `resolveSessionRoot` (WorktreeManager) is the single execution
  root resolver injected into Agent/Terminal/Git/FS/Search.
- UI: `WorktreeTabs`, `SessionDeleteDialog`, `HooksConfirmDialog`,
  `MissingWorktreeBanner` — all worktree-aware surfaces stay.

## Detailed behavior

1. Change DEFAULT_SETTINGS: `git.worktrees.autoSetup: true` → `false`.
   Keep `enabled: true` (the capability stays on; `enabled: false` is the
   user's hard off-switch and is not ZEUS's default).
2. `SETTINGS_VERSION` bump with migration: existing persisted settings that
   never explicitly set `autoSetup` flip to `false`; users who explicitly
   set `true` keep their choice (migration must distinguish default-absent
   from explicit — `SettingsManager.normalize`/migration machinery already
   handles per-key clamping; extend it).
3. Renderer: the new-session flow stops auto-offering/provisioning a
   worktree. A plain session is created; the user can attach a worktree
   afterwards via the existing affordance (`WorktreeTabs` / session context),
   which calls the unchanged `worktree:createForSession` IPC.
4. Sessions created with no worktree resolve their execution root via the
   existing `resolveSessionRoot` fallback — verify no code path assumes
   `worktree_path` is non-null for a *new* session (audit: Agent/Terminal/
   Git/FS/Search managers, Resume snapshots, Attachment staging).
5. Documentation: `CLAUDE.md` worktree paragraphs get a ZEUS status note
   (defaults inverted per ZEUS decision; behavior unchanged).

## Files/modules affected

- `src/shared/constants.ts` (default + `SETTINGS_VERSION` migration table)
- `src/main/managers/SettingsManager.ts` (migration/normalize entry)
- Renderer new-session flow (store/action that consulted `autoSetup`)
- `CLAUDE.md` (status note)

## Data/migration impact

- `SETTINGS_VERSION` +1: one-key default flip with explicit-choice
  preservation. ZEUS-internal migration — supported and documented per the
  handoff's migration rule.
- No DB schema change (worktree columns already nullable).

## Security impact

- The worktree **trust gate** is unaffected: `limboo.json` ack-hash gating
  and `HooksConfirmDialog` verbatim-command approval apply identically to
  worktree-backed sessions; a plain session runs the agent directly in the
  workspace root — which is today's behavior for worktree-less sessions, so
  no new exposure is introduced. The audit in behavior step 4 must confirm
  the path guards (`assertInsideRepo`, sandbox writable-root floor) bind to
  the resolved root, not to the *presence* of a worktree.
- No IPC/permission-surface changes.

## Windows-specific behavior

- Worktree root default `{userData}/worktrees` → now lands under
  `%APPDATA%/zeus/worktrees` after Spec 1 (path length under MAX_PATH on
  default installs; `WORKTREE_LIMITS.rootPathMax` clamps long repo names) —
  unchanged mechanics, re-verify on Windows during implementation.

## UI/UX impact

- The default new-session experience changes (no worktree offer). This is a
  product-posture inversion, not a visual redesign; the existing affordances
  are reused as-is. **Constraint for any future rework of this flow: the
  AGENTS.md Impeccable rule applies before any non-trivial redesign of the
  new-session/worktree offer.**

## Impeccable review requirements

Not required for this spec (no new/changed visual or interaction design;
pure defaults + flow gating). Recorded explicitly because the *subject
matter* is UI-adjacent: the mandatory Impeccable review triggers only when
the offer flow is redesigned, not when it is disabled by default.

## Verification plan

- Boot with fresh settings: new session is plain (`worktree_path` null);
  execution root = workspace path; agent/terminal/git all operate in the
  workspace.
- Explicitly create a worktree: provisioning, tabs, ack gate, teardown all
  work as before.
- Migration: settings file with `autoSetup: true` explicitly set keeps it;
  file without the key flips to `false`.
- Typecheck/lint/build (post-Spec-3/4: tests) green.

## Acceptance criteria

1. Default new session = plain; opt-in worktree flow intact end-to-end.
2. `resolveSessionRoot` untouched (diff-scoped proof).
3. Settings migration distinguishes explicit vs default-absent choices.
4. No null-worktree assumption regressions (audit list in PR).

## Dependencies

After Spec 1 (storage root) and Spec 6 (Phase-1 complete). First Phase-2
spec; no Phase-2 spec may contradict its session model.

## Known risks

- Users inheriting Limboo-era muscle memory expect auto-worktrees — product
  intent, accepted by decision.
- Hidden null-worktree assumptions in newer subsystems (Resume, Attachments,
  telemetry) — covered by the mandatory audit; any find is fixed in this
  spec's scope or logged as a discrepancy.
