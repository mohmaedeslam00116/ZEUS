# Security invariants — canonical operational reference

**Authority:** ADR-0004 (closed) — the security model is preserved unchanged;
ZEUS is deny-by-default. This page is the *operational* form of that decision:
every invariant named, its mechanism, its enforcement anchor, and how to verify
a change preserves it. The narrative threat model lives in
[`docs/architecture/security-model.md`](../architecture/security-model.md); the
agent-facing code contracts live in `CLAUDE.md` §6. On any conflict, the code
wins — fix the doc.

**The one rule that makes this page real:** every invariant row names an
enforcement anchor that **fails when the invariant breaks** — a CI step, a unit
test, or (where no machine check exists yet) an explicit `review-enforced`
checklist item. Nothing on this page is aspirational; every mechanism below was
verified against the source at HEAD (`e3cae27`).

---

## The invariant table

### Identity & process isolation

| ID | Invariant | Mechanism | Enforcement anchor | Verification |
|---|---|---|---|---|
| **SEC-01** | The renderer has no Node access; one typed preload bridge is the only path to main. | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` in the single `BrowserWindow`. | `ci/scripts/check-electron-security.mjs` (CI `validate`): asserts all three tokens present, `nodeIntegration: true` / `sandbox: false` / `webSecurity: false` absent in `src/main/window/createWindow.ts`. | CI red on any weakening. |
| **SEC-02** | No web-platform permission is ever granted to the renderer. | `hardenSession()` sets `setPermissionRequestHandler` **and** `setPermissionCheckHandler` to refuse (camera/mic/geo/USB/…). | `check-electron-security.mjs`: asserts `setPermissionRequestHandler` present in `src/main/index.ts`. **review-enforced portion:** the *check*-handler half and the deny (not merely presence) of both — reviewers confirm no new permission kind is allowed. | CI presence + review. |
| **SEC-03** | The window cannot be navigated or turned into an open WebContents surface. | `will-navigate` + `will-redirect` guarded; `setWindowOpenHandler` denies (external links → OS browser); `will-attach-webview` blocks `<webview>`; `webPreferences` pins `webSecurity`, `allowRunningInsecureContent: false`. | `check-electron-security.mjs`: asserts `setWindowOpenHandler` + `will-navigate` present. **review-enforced portion:** `will-redirect` guard, webview-attach block, and the webPreferences details — reviewers confirm the handler still *denies*. | CI presence + review. |
| **SEC-04** | The renderer runs under a strict CSP (self-only in production, no eval; dev relaxes only for Vite HMR). | CSP response header applied in `src/main/index.ts`, meta fallback in `index.html`. | `check-electron-security.mjs`: asserts a CSP is applied in `src/main/index.ts`. **review-enforced portion:** the policy stays `self`-only in prod — reviewers read the actual directive list on any change touching it. | CI presence + review. |

### IPC boundary

| ID | Invariant | Mechanism | Enforcement anchor | Verification |
|---|---|---|---|---|
| **SEC-05** | Every IPC message comes from our own renderer — nothing else. | The `handle()` wrapper in `src/main/ipc/registry.ts` rejects any sender whose `senderFrame.origin` is not the app's renderer (dev-server origin in dev, `file://` in prod). All handlers register through it and inherit the check. | `check-electron-security.mjs`: asserts `senderFrame` + `origin` in `registry.ts`. **review-enforced portion:** every *new* handler is registered via `handle()` (never raw `ipcMain`), per CLAUDE.md §6. | CI presence + review. |
| **SEC-06** | Renderer-supplied input is validated and capped in main before use. | Per-handler validation; length caps in `src/shared/constants.ts` (`CURSOR_LIMITS`, `WORKTREE_LIMITS`, system-handler caps for URL/clipboard/notify, `assertInsideRepo`'s 4096-char path cap); output bounds (maxBuffer, diff size, terminal scrollback, diagnostics ring). | Settings normalization suite (`SettingsManager.test.ts`) locks the settings path; `refName` suite locks ref sanitization. **review-enforced:** each new IPC channel states its caps and validation in the ticket's Security-impact section. | Tests + review. |
| **SEC-07** | Renderer-supplied objects can never pollute prototypes. | `deepMerge` in `SettingsManager.ts` skips `__proto__`/`constructor`/`prototype`; `settingsHandlers.ts` rejects patches containing them; `cursor/sessionFile.ts` (`copySafeKeys`, `safeParseObject`) applies the same filtering to repo-authored `cli.json`. | **Test-enforced** for the settings path: `SettingsManager.test.ts` asserts `__proto__` payloads are dropped. **review-enforced:** every future merged/keyed renderer object applies the same guard. | Test + review. |

### Process spawning

| ID | Invariant | Mechanism | Enforcement anchor | Verification |
|---|---|---|---|---|
| **SEC-08** | Nothing user- or agent-controlled is ever executed through a shell string. | git, gh, terminal, and the Cursor CLI are spawned with argv arrays (`execFile`/`spawn`/node-pty) and a fixed `cwd` — never `shell: true`. Prompts ride stdin, never argv (argv leaks to OS process listings). | **review-enforced.** Reviewers verify: (1) no new `shell: true` in `src/main/**` (`grep -rn "shell:\s*true" src/main` must return only comment matches); (2) new spawns pass argv arrays + bounded timeout/maxBuffer; (3) secrets ride `env`, never argv. | Review checklist. |
| **SEC-09** | The Windows `%ComSpec%` bridge is reachable only by static-literal arguments. | `src/main/managers/cursor/exec.ts`: `.cmd/.bat` shims run via `ComSpec /d /s /c` **only** when every argument matches `SAFE_ARG_RE` (`/^[A-Za-z0-9=_.-]+$/`) and the shim path contains no `" % ^ & \| < >`. The runtime (`spawnCursorRun`) **refuses shims outright** (`CursorShimError`) because print-mode argv (workspace paths, model ids) can never pass the whitelist — it resolves the native node.exe+index.js layout instead. All Phase-1 cmd-path arguments are static literals. | **review-enforced.** Reviewers verify any new cmd-path argument is a static literal; anything dynamic must go through the `node` layout path, never a widened whitelist. | Review checklist. |
| **SEC-10** | The Cursor native executable is resolved from a literal, contained layout or not at all. | `resolveNodeLayout()` (cursor/exec.ts): version-dir names must match `VERSION_DIR_RE` (the official `cursor-agent.ps1` grammar) before being joined into a path; `node.exe` + `index.js` must be regular files whose **realpaths** stay under the realpath of the base dir (symlink-escape guard); settings override is fail-closed (invalid override never falls back to PATH); the bare `agent` name is probed only inside the documented install dir, never via PATH search. | **review-enforced.** Reviewers verify changes keep the regex gate, realpath containment, and fail-closed override semantics. | Review checklist. |

### Filesystem & paths

| ID | Invariant | Mechanism | Enforcement anchor | Verification |
|---|---|---|---|---|
| **SEC-11** | A renderer-supplied path can never escape the workspace/repo/worktree root. | `assertInsideRepo` (git/exec.ts): rejects absolute paths, parent traversal, null bytes, >4096-char paths, and any resolution outside the root. `isInsideRoot` (workspace/validate.ts) guards workspace walks. `assertInsideWorktreeRoot` (worktree/paths.ts) is **realpath-aware** so deletes can never be redirected through a symlink. | **review-enforced.** Reviewers verify every new fs-touching handler passes its paths through one of these guards before touching disk. (Ref sanitization is additionally test-enforced — `refName.test.ts`.) | Review checklist (+ ref tests). |
| **SEC-12** | Windows path semantics never silently break containment. | Containment comparisons are **resolve-then-compare** (`path.resolve` + `path.relative`, case-sensitive, `path.sep`-aware). Symlink/case aliasing is covered where it matters by realpath resolution: `assertInsideWorktreeRoot`, the crown-jewel `protectedPaths()` (adds realpath variants of every jewel), and `resolveNodeLayout`. Reviewers must apply the same resolve(+realpath)-then-compare pattern to any new containment check — a raw string compare against an unnormalized path is a defect. | **review-enforced.** Review checklist: new path comparisons resolve first; new case-folding (e.g. extension matching, `AgentManager:7991`) is confined to non-path tokens. | Review checklist. |
| **SEC-13** | Path lengths stay under Windows limits by construction. | Worktree layout (`worktree/paths.ts`) uses a short hash bucket + slug prefix so deep `node_modules` trees keep MAX_PATH headroom (constants.ts:706); `assertInsideRepo` caps paths at 4096 chars; `CURSOR_LIMITS.execPathMax` (1024) clamps the settings-supplied executable path. | **review-enforced.** Reviewers verify new long-path surfaces (worktree roots, attachment dirs, install layouts) keep the short-prefix discipline. | Review checklist. |

### Crown jewels & data

| ID | Invariant | Mechanism | Enforcement anchor | Verification |
|---|---|---|---|---|
| **SEC-14** | The three permission layers resolve the **SAME** crown-jewel set: `secrets/`, `zeus.db` (+ WAL/SHM siblings), `settings.json`, `window-state.json` — and never the whole `userData` root (the worktree and attachments legitimately live under it). | **One producer:** `crownJewelPaths()` in `src/main/managers/sandbox/policy.ts`. **Layer 1:** AgentManager `protectedPaths()` derives its set (+ WAL/SHM + realpath variants) from it. **Layer 2:** `sessionDenyRules(crownJewelPaths())` is materialized into Cursor's deny-first `cli.json` for every run (deny beats allow; DB `-wal`/`-shm`/`-*` siblings covered). **Layer 3:** the sandbox floor `denyRead`/`denyWrite` + `credentials.files` (belt-and-braces for `secrets` + `zeus.db`). | **`scripts/check-crown-jewels.mjs`** (CI `validate`): asserts the producer emits exactly the ZEUS set, Layer 1 wires `sessionDenyRules(crownJewelPaths())`, Layer 2 stays parameterized (no hard-coded paths), the DB module names `zeus.db`, no banned DB-path literal exists under `src/`, and current-implementation docs never mention `zeus.db`. Seeded `zeus.db → zeus.db` drift makes CI red. | CI red on drift (seeded-failure verified in #16). |
| **SEC-15** | SQL values are bound, never interpolated. | `better-sqlite3` via `src/main/db/database.ts`; every statement uses bound parameters. The one DDL exception is `addColumnIfMissing` (schema migrations), whose table/column identifiers must match `SQL_IDENTIFIER_RE` and whose column types come from a fixed whitelist (`SQL_COLUMN_TYPES`) — identifiers are validated, values never interpolated. | **review-enforced.** Reviewers verify new statements use `?`/bound params — `grep` for string-concatenated/templated SQL in any diff touching `src/main/db/**` or a manager's queries; any new DDL helper must keep the identifier-validation pattern. (The ORM-free surface is small; keep it that way.) | Review checklist. |
| **SEC-16** | Secrets never reach a log line, argv, or renderer-visible state. | `logger.ts` `redactSecrets()` strips `crsr_*` tokens, `CURSOR_API_KEY=` values, `Authorization:` headers, and embedded-credential URLs before output; `redactCursor()` applies the same at the Cursor CLI boundary; secrets ride the child **environment** only (never argv, never IPC); the renderer sees only a `configured` boolean + timestamp. | **review-enforced.** Reviewers verify new credential-shaped values are added to the redaction patterns and new spawn sites pass secrets via `env`. | Review checklist. |
| **SEC-17** | Credentials at rest are encrypted by the OS, not plaintext files. | `SecretStore` (src/main/secrets/SecretStore.ts): safeStorage-encrypted opaque blobs at `userData/secrets/<name>.bin.json`, gated on `safeStorage.isEncryptionAvailable()`, decrypted only at child-spawn time, stale-blob self-heal on keychain resets, names-only logging. | **review-enforced.** Reviewers verify any new secret goes through `SecretStore` (never a plain file) and is only decrypted at the point of use. | Review checklist. |
| **SEC-18** | Outbound fetches can never reach private/loopback/link-local space — including via DNS rebinding. | `src/main/net/ssrfGuard.ts` (shared by every outbound-fetch site): `isPrivateIp` (v4 ranges incl. CGNAT, v6 incl. IPv4-mapped), `isCloudMetadataIp` (169.254.169.254 blocked **unconditionally**), `makeGuardedLookup` — a `net.LookupFunction` that resolves and validates the address the socket **actually connects to** (anti-rebinding), `assertHttpsAllowlistedUrl` for host-allowlisted callers. | **review-enforced.** Reviewers verify every new outbound `fetch`/`https.request` passes `guardedLookup` (or an allowlist check + guarded lookup) — CLAUDE.md §6 contract. | Review checklist. |

### Permission architecture

| ID | Invariant | Mechanism | Enforcement anchor | Verification |
|---|---|---|---|---|
| **SEC-19** | Three layers, one authority: (1) `AgentManager.decideToolUse` is the orchestration authority — deny-by-default, scoped `rememberKey` (`sessionId:<risk>`, `sensitive` in its own scope, secrets always re-prompt), plan read-only, workspace + crown-jewel guards; (2) provider permission translation (Cursor: deny-first `cli.json` materialized per run + restored, deny beats allow, `--force` only with the deny set present; Claude: `canUseTool`); (3) the OS sandbox floor — containment beneath authorization: writable root = execution root, extras screened by `screenExtraWritePath` (absolute, not `/` or `$HOME`, outside the floor), `autoAllowBashIfSandboxed` pinned **off** (the sandbox never auto-approves), strict mode closes the `dangerouslyDisableSandbox` retry, Claude jail skipped for open-network policy rather than silently severing the run. | The layers consume shared sources (`crownJewelPaths()`, `readOnlyCommands` specs) so they cannot drift. | **Crown-jewel alignment:** `scripts/check-crown-jewels.mjs`. **Read-only allowlist parity:** the Cursor declarative allows are derived from the same `readOnlyShellRuleSpecs()` the decision core trusts. **review-enforced:** the semantic rules (deny-by-default, scoping, no-bypass) — reviewers verify any permission change still routes through `decideToolUse` and widens nothing beyond the shown class. | CI (jewel set) + review (semantics). |
| **SEC-20** | The sandbox denies by default at the network layer too. | `EffectiveSandbox.network`: `'allowlist'` → exactly the listed domains; `'off'` → empty list (deny-all — headless has no interactive prompt, so unlisted = blocked). There is no allow-all sentinel inside the jail. | **review-enforced.** Reviewers verify new network postures preserve the deny-by-default translation in `resolveSandboxConfig`/`mapClaudeSandbox`. | Review checklist. |

### Windows specifics & update posture

| ID | Invariant | Mechanism | Enforcement anchor | Verification |
|---|---|---|---|---|
| **SEC-21** | Update-feed posture: ZEUS's feed is **read-only** and currently unset — no publishing surface exists (inherited Zeus publishing was removed in #13; the `FEED` constant in `AutoUpdateManager.ts` remains a read-only 404 check until the future ZEUS release design). When a feed exists: updates are verified against the OS trust store before install (macOS Squirrel refuses an unverifiable signature outright; Windows Authenticode requires the publisher signature to match), differential download stays disabled on Windows (no blockmap published), and betas are never auto-downloaded. | `AutoUpdateManager.FEED` (setFeedURL), `disableDifferentialDownload`, `autoDownloadFor()`. | **review-enforced / docs-anchored:** `docs/operations/auto-update.md` (ZEUS status banner, #13). Reviewers verify no change reintroduces a publishing path or weakens install-time signature verification. | Docs + review. |
| **XP-01** | Input/output caps bound every untrusted stream. | Input: prompts, commit messages, memory bodies, branch/tag labels, clipboard/URL/notification strings, API-key shape (`CURSOR_LIMITS.apiKeyMin/Max`), executable-path length. Output: CLI `maxBuffer` (64 KiB), file reads, diff size, terminal scrollback, diagnostics ring. Bounds live in `src/shared/constants.ts`. | **review-enforced.** Reviewers verify new surfaces declare their caps in `constants.ts` (not magic numbers) and bound their output. | Review checklist. |

---

## Security-impact contract (mandatory for every spec & ticket)

Every specification and implementation ticket — without exception — carries a
`Security impact` section that does **both** of the following:

**(a) Enumerates the security-relevant surfaces the change touches**, checking
each of:

- IPC channels added/changed (→ SEC-05, SEC-06)
- process spawn argv construction (→ SEC-08, SEC-09, SEC-10)
- SQL statements (→ SEC-15)
- path joins/resolution/containment (→ SEC-11, SEC-12, SEC-13)
- merges/keying of renderer-supplied objects (→ SEC-07)
- secrets handling (→ SEC-16, SEC-17)
- outbound network (→ SEC-18)
- permission/sandbox posture (→ SEC-14, SEC-19, SEC-20)

**(b) Maps each touched surface to the governing invariant ID** from this
document, stating how the change preserves it.

If (and only if) nothing is touched, the section must literally say:

> **no security-relevant surface touched**

followed by the one-line justification. A bare `none` is not acceptable — the
declaration is a positive claim reviewers may **contest**, and an uncontested
`none` on a change that did touch a surface is itself treated as a process
regression under the protocol below.

---

## Regression protocol (ADR-0004)

**Any change that weakens an invariant is a RELEASE BLOCKER.** Merge is
refused — a regression cannot be deferred to a follow-up issue, flagged for
later, or traded for velocity.

Weakening includes, non-exhaustively:

- loosening or removing a guard (sender validation, path containment,
  prototype-pollution filter, redaction pattern, SSRF lookup)
- skipping or narrowing validation (caps, argument whitelists, realpath checks)
- widening an allowlist (spawn args, shell rules, extra-write paths, network
  domains, readOnly command specs)
- breaching the sandbox floor (re-exposing a crown jewel, widening the
  writable root past the execution root, re-enabling auto-approval)
- adding a secret path that bypasses `SecretStore` or redaction
- weakening sender validation, permission denial, or the CSP
- hard-coding a second copy of the crown-jewel set (bypassing
  `crownJewelPaths()`)

**Resolution is exactly one of:**

1. **Fix the regression** — restore the invariant; or
2. **An explicit ZEUS ADR** that intentionally changes the security model —
   accepted through normal ADR review, superseding ADR-0004 where they
   conflict.

There is no third option. Reviewers should raise the blocker in review;
agreement that something *is* a weakening is not required to be unanimous —
any reviewer assertion routes it to the ADR path if it is to proceed.

---

## Audit: what the CI Electron-security gate actually proves

`ci/scripts/check-electron-security.mjs` (CI `validate`, step
"Electron security invariants") is a **static source-assertion** script —
no app launch, Node builtins only. Its complete inventory:

| File inspected | Assertions |
|---|---|
| `src/main/window/createWindow.ts` | `contextIsolation: true` present and `false` absent · `nodeIntegration: true` absent · `sandbox: true` present and `false` absent · `webSecurity: false` absent · `setWindowOpenHandler` present · `will-navigate` present |
| `src/main/index.ts` | dark `themeSource` forced · a Content-Security-Policy is applied · `setPermissionRequestHandler` present |
| `src/main/ipc/registry.ts` | `senderFrame` + `origin` present (sender validation) |

**What it proves:** the specific hardening tokens above have not been removed
or inverted in those three files — a careless edit that weakens the renderer
boundary turns CI red before merge.

**What it does NOT prove** (and is not claimed to): runtime behavior of the
guards (it checks presence, not semantics); `will-redirect`/`will-attach-webview`
handling; CSP directive *strictness*; the permission *check*-handler; argv-only
spawning repo-wide (SEC-08); path containment (SEC-11/12); SQL binding
(SEC-15); redaction (SEC-16); safeStorage usage (SEC-17); SSRF enforcement
(SEC-18); permission semantics (SEC-19/20); crown-jewel consistency (covered
separately by `scripts/check-crown-jewels.mjs`). All of those are therefore
`review-enforced` rows in the table above, with the reviewer checklists stated
in each row.

---

## Relationship to other controls

- **Provider neutrality** (`scripts/check-provider-neutrality.mjs`, #15) is a
  *separate* architectural control (ADR-0003). Security invariants and provider
  neutrality are enforced by independent gates; neither may be weakened by or
  for the other.
- **Test-enforced anchors** grow over time per ADR-0007 (#17 owns the
  verification ladder). When a `review-enforced` row gains a machine anchor,
  update its row here in the same change.
- **CLAUDE.md §6** remains the agent-facing contract for new code; this page is
  the invariant-side mirror. Add both when adding a mechanism.
