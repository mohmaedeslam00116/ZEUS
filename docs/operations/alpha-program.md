# ZEUS closed-alpha program

The operational record of the ZEUS closed alpha: tester terms, the feedback
flow, the go/no-go bar a release must clear before Publish, and the rollback
runbook. Decided by Wayfinder ticket #31; the release mechanics it references
are #28's, the visual bar is #27's, and the history rules are #30's.

## 1. Tester group

- **Size:** 3–8 invited testers, target 5.
- **Required profile:** technical Windows users comfortable with terminals and
  Git. ZEUS is a coding-agent product; a tester who cannot run a terminal
  cannot exercise it.
- **Preferred, not required:** professional developers (better log literacy).
- **OS coverage:** Windows 11 primary. At least one Windows 10 tester if
  reachable — welcome, not a hard gate.
- **Terminal coverage:** default PowerShell plus at least one Windows Terminal
  or `cmd.exe` user. Git Bash welcome, optional.
- **GPU diversity: not required** — ZEUS ships no GPU-dependent functionality.
- **Selection:** direct maintainer invitation; no application form.
- **Agreement required before receiving a build:** the tester acknowledges
  (in the invitation reply): this is prerelease software; crashes, data loss,
  and rough edges are possible; ZEUS is local-first (workspace data, settings,
  logs, and the database live under `%APPDATA%\zeus` on their machine; there
  is no backend and ZEUS submits no telemetry anywhere); diagnostics hygiene —
  remove secrets, tokens, credentials, and private source code from anything
  submitted; feedback is for improving the alpha, not a support guarantee.

## 2. Feedback channel

Canonical channel: **GitHub Issues on `mohmaedeslam00116/ZEUS`** — the single
`alpha-feedback.yml` template with the `alpha` label. No external service.

- **Report contents:** build version (Settings → About), install source
  (installer vs in-app update), Windows version, what happened vs expected,
  relevant log paths (`%APPDATA%\zeus\logs\`).
- **Triage flow:** crash/log reports → relabel `bug`; UX/visual feedback →
  aggregated into the post-alpha polish backlog (#27 rows C1–C8); confusion
  reports → treated as UX defects; **data-handling concerns → immediate
  priority**, above everything else.
- **Separation from unrelated issues:** only testers receive the template
  link; the `alpha` label makes the queue filterable.

## 3. Go / no-go bar

Every gate below is checked against the **actual packaged ZEUS build**
(`ZEUS-Setup-<version>-x64.exe`), not `npm start`. Gates marked **[M]** are
manual human-recorded verifications; everything else is machine-checked. The active
release run record for `v0.1.0-alpha.1` is documented in [alpha-1-release-evidence.md](alpha-1-release-evidence.md).

### Release commit

- [ ] All CI gates green on the release commit: `npm run typecheck`,
      `npm test`, `npm run lint`, `check-manifest`, `check:unions`,
      `gen:notes -- --check`, crown-jewel gate
      (`node scripts/check-crown-jewels.mjs`), provider-neutrality gate,
      Electron security gate, `npm audit`.
- [ ] Renderer build + main/preload bundles pass
      (`vite.renderer.config.mts`, Forge packaging).
- [ ] No known unexplained regression: every red-to-green or behavior change
      since the previous commit is attributable to a named ticket.

### L3 Windows manual checklist (per `docs/development/verification.md`)

Recorded observations against the packaged build, not assertions:

- [ ] **[M] Process spawning:** agent runs spawn argv-only (no shell), ComSpec
      `.cmd/.bat` bridge honors the static-safe argument policy; a tool spawn
      failure produces a visible, correct error.
- [ ] **[M] Shell/terminal:** integrated terminal works in PowerShell (default)
      and Windows Terminal/`cmd.exe`; Git-based features work in a Git Bash
      environment if present.
- [ ] **[M] PTY behavior:** PTY sessions start, stream, resize, and terminate
      cleanly (conpty path).
- [ ] **[M] Windows paths:** workspaces with spaces, deep paths, and long-path
      clamps behave as documented (4096 repo-walk cap, 1024 exec-path clamp);
      path separator/casing semantics hold.
- [ ] **[M] Security-sensitive process boundaries:** permission prompts appear
      and deny-by-default holds; sandbox floor denies crown-jewel writes
      (`secrets/`, `zeus.db`, `settings.json`, `window-state.json`); deny
      messages render correctly.
- [ ] **[M] ZEUS identity/storage expectations:** storage lands in
      `%APPDATA%\zeus` (`zeus.db`, `secrets/`, `settings.json`,
      `window-state.json`); taskbar/window title, tray icon + tooltip read
      `ZEUS`; About panel shows the correct version.
- [ ] **[M] Installer/package behavior:** NSIS wizard completes per-user,
      shortcuts created (`ZEUS`), uninstaller present, data preserved on
      uninstall (`deleteAppDataOnUninstall: false`).

### Clean-machine boot smoke

- [ ] **[M]** The packaged build boots successfully on a clean Windows machine
      (no dev tools, no repo clone): installer runs, app launches to the
      launcher, creating/opening a workspace works. Verified on the packaged
      application — `npm start` alone does not satisfy this gate.

### Update path

- [ ] **[M] alpha.1 (structural):** the packaged build's
      `resources/app-update.yml` points to `mohmaedeslam00116/ZEUS`; the
      updater initializes without error; the update check resolves cleanly
      against the real feed (no malformed-feed or 404 error state beyond the
      expected "no newer release").
- [ ] **[M] alpha.2 (end-to-end, mandatory release gate for alpha.2):** a real
      `alpha.1 → alpha.2` in-app update installs and relaunches. Not
      performable for alpha.1 — there is no previous ZEUS alpha; publishing a
      throwaway release to fake it is prohibited.

### Invitation package

- [ ] **[M]** Invitation notes sent and covering: installation steps, unsigned
      binary expectations, Windows SmartScreen handling ("More info → Run
      anyway"), known limitations, the feedback channel + template link, what
      testers should report, basic data-handling guidance (per §1 agreement).

### Rollback readiness

- [ ] **[M]** The maintainer has read the rollback runbook (§4) before Publish.

## 4. Rollback runbook (broken published alpha)

No downgrade or channel-pinning mechanism exists; electron-updater only ever
moves up. The procedure is delete-and-republish with a forward fix:

1. **Stop distribution:** delete the broken GitHub release immediately (new
   installs can no longer reach it; installed testers' updaters get a clean
   "no release" resolution).
2. **Communicate:** post in the alpha feedback channel that the release was
   pulled and a fixed build is coming.
3. **Forward fix:** produce a fixed build at a **higher version**
   (`alpha.N+1`); never republish the same version.
4. **Re-verify:** the go/no-go bar applies to the fixed build in full,
   including the L3 rows implicated by the breakage.
5. **Recover affected testers:** testers already on the broken build manually
   download and install the fixed build from the release page — include this
   instruction in the re-release notes and the feedback-channel post.
6. **Post-mortem note:** record what the draft-review gate (which exists to
   catch exactly this) missed, in the release ticket.

## 5. Ready to publish — definition

ZEUS is ready to publish an alpha when ALL of the following hold:

1. **Prerequisite implementations applied** (see §6 — currently the blocker).
2. Every machine gate in §3 is green on the release commit.
3. Every **[M]** gate has a recorded human observation against the packaged
   build for the exact version being published.
4. The draft prerelease exists with correct artifacts (installer, `latest.yml`,
   blockmap, SHA256SUMS, release notes from the changelog) and the maintainer
   has completed the draft review.
5. The invitation package has been sent.
6. The rollback runbook (§4) has been read.

Publishing is then the maintainer's human approval click on the draft — the
#28 gate.

## 6. Prerequisite status (updated 2026-09-17, Ticket 4)

All blockers recorded at decision time have now been **implemented and
landed on `origin/main`**: the functional rename (#37) and alpha UX fixes
(#38, `Ctrl P` + AA state copy) in `cbebd1c`; the identity package (#39) in
`81f3509`; the ZEUS-native release pipeline, feed repoint, and beta-channel
default (#40, this runbook's referenced machinery) in its ticket commit.
The inherited 44 Limboo tags are deleted; the first ZEUS tag is
`v0.1.0-alpha.1`.

**Remaining before any Publish (per §3, unverifiable in a dev environment):**
the packaged-build L3 Windows checklist, the clean-machine boot smoke, and
the draft review itself. These are performed on the real packaged build at
release time, not before.

## 7. Explicitly NOT part of the go/no-go bar

Code signing (post-alpha decision per #28) · uninstall/reinstall coverage ·
non-Windows validation (Windows-only alpha per charting Q6) · any new telemetry
or data collection (none exists; none may be added for the alpha) · public
community program. None of these may be quietly added as hidden requirements.

## 8. Rejected alternatives

| Decision | Alternative | Why rejected |
|---|---|---|
| Feedback channel | Discord/Slack/dedicated service | Splits the record; GitHub Issues is the established infrastructure |
| Feedback channel | Four separate templates | Tester-facing taxonomy burden; one category selector does the job |
| Testers | Open application form | Closed invited alpha; the maintainer knows the cohort |
| Testers | GPU diversity requirement | No GPU-dependent functionality exists |
| Update gate | Publish a throwaway release to test the updater | Pollutes the release history the whole map exists to keep clean |
| Update gate | Skip update verification entirely for alpha.1 | The structural check catches feed/config mistakes cheaply; alpha.2 carries the real end-to-end gate |
| Go bar | Re-verify every L3 row for every alpha | Proportionality: re-run the rows implicated by the delta, full bar for alpha.1 |
