# ZEUS v0.1.0-alpha.1 Release Evidence Record

- **Release Tag:** `v0.1.0-alpha.1`
- **Release Commit:** `190c4bd` (`test: make SettingsManager normalizeSettings test paths cross-platform for Linux CI`)
- **Fix Commits Included:**
  - `6e73be2` (`fix: resolve black screen regression by aligning activity tab IDs and terminal focus`)
  - `190c4bd` (`test: make SettingsManager normalizeSettings test paths cross-platform for Linux CI`)
- **Release Workflow Run:** [Run 35350375584](https://github.com/mohmaedeslam00116/ZEUS/actions/runs/35350375584) (Success in 7m53s)
- **Draft Prerelease:** [v0.1.0-alpha.1 Draft](https://github.com/mohmaedeslam00116/ZEUS/releases/tag/untagged-ad7ee9100ac555eefddc)
- **Attached Artifacts:**
  - `ZEUS-Setup-0.1.0-alpha.1-x64.exe` (packaged NSIS installer)
  - `latest.yml` (auto-update channel metadata, beta channel, sha512 hash)
  - `release-manifest.json` (embedded git metadata: commit, build number, date)
  - `SHA256SUMS` (checksum verification file)

---

## 1. Preconditions & Machine Gates (Verified Now)

All machine gates defined in `docs/operations/alpha-program.md` §3 ran and passed on both CI (`ubuntu-latest`) and the release runner (`windows-2022`):

| Gate | Target / Tool | Result | Evidence |
| --- | --- | --- | --- |
| **Lint** | `eslint --ext .ts,.tsx .` | **PASS** | 0 errors (1 warning in watcher import) |
| **Typecheck** | `tsc --noEmit` | **PASS** | 0 errors across entire workspace |
| **Unit Tests** | `vitest run` | **PASS** | 17 test files, 190 tests passed |
| **License Compliance** | `node ci/scripts/check-licenses.mjs` | **PASS** | All dependencies compliant |
| **Electron Security** | `node ci/scripts/check-electron-security.mjs` | **PASS** | Invariants SEC-01 through SEC-24 satisfied |
| **Crown Jewels** | `node scripts/check-crown-jewels.mjs` | **PASS** | 1 producer, 3 consumers, 1 logical set (SEC-14) |
| **Provider Neutrality** | `node scripts/check-provider-neutrality.mjs` | **PASS** | 217 renderer files scanned, 0 violations |
| **Exhaustive Unions** | `node scripts/check-unions.mjs` | **PASS** | 3/3 union records exhaustive |
| **Manifest Integrity** | `node ci/scripts/check-manifest.mjs` | **PASS** | Tag version matches manifest |
| **Release Notes** | `node ci/scripts/generate-release-notes.mjs --check` | **PASS** | CHANGELOG section synchronized |
| **Dependency Audit** | `npm audit --audit-level=high` | **PASS** | 0 high/critical vulnerabilities |
| **Packaging** | Electron Forge (fuses + asar) | **PASS** | Bundle assembled cleanly |
| **Installer** | electron-builder NSIS | **PASS** | `ZEUS-Setup-0.1.0-alpha.1-x64.exe` generated |

---

## 2. Bug Diagnoses & Fix Verification (Verified Now)

During the Ticket #41 release verification run, a launch regression was diagnosed and resolved:

1. **Black-Screen Launch Regression:**
   - **Root Cause:** `ACTIVITY_TAB_IDS` in `src/shared/constants.ts` contained an extra `'terminal'` entry not in `ACTIVITY_TABS`, causing an uncaught exception on startup (`Error: ACTIVITY_TABS and ACTIVITY_TAB_IDS have diverged`) which prevented the React renderer from mounting.
   - **Fix:** Removed `'terminal'` from `ACTIVITY_TAB_IDS` and `ActivityTab`, aligned terminal focus navigation to use `setTerminalOpen(true)` in `ConversationView.tsx` and `focus.ts`, and added regression tests in `src/renderer/features/activity/tabs.test.ts`.
   - **Verification:** Unit tests pass, renderer compiles cleanly without exception.

2. **Cross-Platform Linux CI Test Fix:**
   - **Root Cause:** `SettingsManager.test.ts` hardcoded Windows backslash drive paths (`D:\work\project`), which failed `path.isAbsolute()` on Linux CI (`ubuntu-latest`).
   - **Fix:** Adapted test paths using `process.platform` to work on both Windows and POSIX environments.
   - **Verification:** CI Validate job on `ubuntu-latest` (Run 35350214301) passed completely.

---

## 3. Go / No-Go Gate Status: Verified Now vs. Required Before Publish

Per Spec 15 Acceptance Criterion 2, the table below clearly distinguishes what is **verified now** from what is **required before human Publish**:

| Category | Gate | Status | Verifier / Evidence |
| --- | --- | --- | --- |
| **Commit** | CI gates green on release commit | **VERIFIED NOW** | CI Run `35350214301` & Release Run `35350375584` passed |
| **Commit** | Packaging bundles pass | **VERIFIED NOW** | Forge fuses + asar + NSIS packaging succeeded |
| **Commit** | No unexplained regressions | **VERIFIED NOW** | Commits `6e73be2` and `190c4bd` fully documented |
| **Update** | Structural update check (alpha.1) | **VERIFIED NOW** | `latest.yml` points to `mohmaedeslam00116/ZEUS`, beta channel, valid sha512 |
| **Rollback**| Rollback runbook reviewed | **VERIFIED NOW** | `alpha-program.md` §4 reviewed; delete-and-republish procedure confirmed |
| **Draft** | Draft prerelease exists | **VERIFIED NOW** | Release `v0.1.0-alpha.1` created as draft on GitHub with 4 assets |
| **L3 Windows**| Process spawning (argv-only) | **REQUIRED BEFORE PUBLISH** | Maintainer smoke on host running packaged `.exe` |
| **L3 Windows**| Integrated terminal (PS/cmd/PTY) | **REQUIRED BEFORE PUBLISH** | Maintainer smoke on host running packaged `.exe` |
| **L3 Windows**| Path clamps & storage (`%APPDATA%\zeus`) | **REQUIRED BEFORE PUBLISH** | Maintainer verifies `%APPDATA%\zeus` and `zeus.db` presence |
| **L3 Windows**| Installer / Uninstaller behavior | **REQUIRED BEFORE PUBLISH** | Maintainer runs `ZEUS-Setup-0.1.0-alpha.1-x64.exe` |
| **Clean-Machine**| Clean-machine boot smoke | **REQUIRED BEFORE PUBLISH** | Maintainer boots packaged build on non-dev Windows host |
| **Invitation**| Invitation package dispatched | **REQUIRED BEFORE PUBLISH** | Maintainer sends invitation notes to 3–8 invited testers |
| **Publish** | Human maintainer click | **FINAL ACTION** | Maintainer reviews draft on GitHub and clicks "Publish release" |

---

## 4. Rollback Readiness Certification

The rollback procedure in `docs/operations/alpha-program.md` §4 was reviewed:
- **No downgrades:** electron-updater only moves forward.
- **Pull distribution:** If critical failure occurs post-publish, delete the GitHub release immediately.
- **Forward fix:** Release `v0.1.0-alpha.2` with fix; never reuse `v0.1.0-alpha.1`.
- **Tester communication:** Post notice on the GitHub Issues alpha channel.

---

## 5. Next Actions for Maintainer (Human Publish Step)

1. **Download Draft Installer:**
   - Go to [Releases Draft](https://github.com/mohmaedeslam00116/ZEUS/releases/tag/untagged-ad7ee9100ac555eefddc) and download `ZEUS-Setup-0.1.0-alpha.1-x64.exe`.
2. **Execute L3 Windows Verification:**
   - Run the installer on Windows.
   - Confirm SmartScreen ("More info" → "Run anyway").
   - Confirm launch window opens with `ZEUS` title and no black screen.
   - Verify `%APPDATA%\zeus\zeus.db` is created.
3. **Dispatch Tester Invitations:**
   - Share the release link and agreement terms with the invited cohort (3–8 testers).
4. **Publish Release:**
   - Click **Publish release** on GitHub.
