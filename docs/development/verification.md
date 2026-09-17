# Verification architecture — the canonical standard

**Authority:** ADR-0007 (closed) — incremental verification, pure-module
discipline, CI-enforced over time. This page is the single vocabulary for
"verified" in ZEUS: every ticket derives its **definition of done** from this
document and states its verification in these terms. It integrates with the
Security-impact contract in
[`docs/security/invariants.md`](../security/invariants.md) (ADR-0004) and the
spec-template guidance in the
[to-spec handoff](../superpowers/specs/2026-09-16-zeus-to-spec-handoff.md).

Every rung below names its concrete tool/script — nothing here is aspirational
except L4, which is explicitly deferred.

---

## The ladder

### L0 — Typecheck

```bash
npm run typecheck        # tsc --noEmit over the whole tree
```

**Applies to:** every change, without exception. **Non-negotiable** — it is
also a mandatory CI gate (#12). Established by the bounded TypeScript 5.1.6
upgrade (#10); before it, nothing type-checked at all.

### L1 — Unit (Vitest)

```bash
npm test                 # vitest run
npx vitest run src/shared/refName.test.ts   # one family, during iteration
```

**Applies to** pure logic that is **touched or added** — not to every change.
"Pure logic" means parsing, sanitization, decision, scoring, aggregation, or
normalization functions/classes with no DB, IPC, clock, or Electron
dependencies (the pure-module rule below is the design half of this rung).
**Identifying the relevant family:** the repo convention is an adjacent
`*.test.ts` next to the module (e.g. `src/shared/refName.ts` →
`src/shared/refName.test.ts`); run the single file while iterating, and the
full `npm test` before handing off. Existing families (the #11 foundation):
`refName`, `git/refs`, `git/parse`, `graph/builder`, `telemetry/accumulator`,
`SettingsManager` (incl. migrations), `SessionManager` persistence, plus the
`scripts/check-*.test.mjs` gate suites.

### L2 — Boot smoke

```bash
npm start                # electron-forge start
```

**Applies to** any change that reaches runtime (product logic, IPC, UI). The
application must **boot successfully** — no main-process crash, renderer
hydrates — **and the touched surface must actually be exercised**: open the
panel you changed, run the flow you wired, trigger the state you touched.
`npm start` alone proves the app boots; it does **not** prove the touched
behavior works. Say what you exercised.

### L3 — Windows manual checklist

The **primary platform-target gate** (ADR-0002: Windows first). A concrete,
per-ticket pass over the checklist template below — mandatory for
platform-sensitive surfaces, recorded in the ticket with what was checked and
what was observed. Not a CI step; it is a human gate named in the ticket.

### L4 — E2E (future/deferred)

**NOT required by current tickets.** L4 is the eventual home for automated
cross-process flows (real app, real IPC, real child processes) once the
foundation justifies it (ADR-0007: incremental, deliberate). No E2E framework
or automation exists or may be added by current work; **nothing in CI depends
on L4**. A ticket must not claim L4 coverage.

---

## Rung requirements by change class

| Change class | Required rungs | Notes |
|---|---|---|
| Infrastructure / CI-only | **L0** | plus CI observation (the workflow run itself is the verification) |
| Product logic (parsing, decision, scoring, aggregation, normalization) | **L0 + L1 + L2** | **+ L3 if platform-sensitive** (path handling, spawning, FS layout) |
| IPC / process-boundary changes | **L0 + L2 + L3** | **+ L1 for pure validation helpers** involved (e.g. a new argument whitelist) |
| UI-adjacent changes | **L0 + L2 + L3** | plus the **Impeccable outcome reference** where the `AGENTS.md` UI/UX rule triggered (the spec must record the review outcome; the rungs verify behavior, Impeccable verifies design) |
| Documentation-only | **existing documentation/CI gates** | `npm run lint`, `node ci/scripts/check-manifest.mjs`, `npm run gen:notes -- --check` where generated docs are touched — no additional invented gates |

A ticket's Verification plan names its class, therefore its rungs, therefore
its concrete cases (see the template guidance in the handoff).

---

## The pure-module rule

**New parsing, decision, scoring, or aggregation logic must land as pure
functions/classes AND carry an L1 suite.**

Pure means the module:

- imports **no DB** (`db/database`, `better-sqlite3`),
- imports **no IPC** (`ipc/*Handlers`, `ipcMain`/`ipcRenderer`),
- has **no clock/time dependency** (the clock is a per-call parameter — see
  `telemetry/accumulator.ts`, which takes timestamps as arguments),
- imports **no Electron** (`electron` main APIs).

Precedents already in the tree: `graph/builder.ts`, `telemetry/accumulator.ts`
("no DB, no IPC, no clock" by design), `refName.ts` (shared main/renderer rule
table), the `normalizeSettings` extraction (#11).

**If purity is genuinely impractical** (e.g. the logic is inseparable from a
live handle): the PR/ticket must **explicitly document why** — which
dependency makes it impure, and what partial purity is achievable. A silent
bypass is a review objection. The bar is honesty, not purity theater.

Do not modify existing product code merely to make examples fit this rule;
purity is a constraint on **new** logic. (Refactor-for-testability happens
only when a ticket explicitly authorizes it — as #11 did for
`normalizeSettings`.)

---

## Test-support export policy

Exports introduced **solely to support tests** must:

- carry a visible marker — `/** @visibleForTesting — <reason> */` on the
  symbol (the repo has no such exports yet; this establishes the convention
  before the first one lands),
- state the justification in the PR description,
- **never** cause production behavior to branch on test mode — no
  `process.env.NODE_ENV === 'test'` conditionals, no injected test flags that
  alter runtime paths. If behavior must differ, the seam is a parameter the
  caller passes, not a mode the module checks.

No runtime mechanism is introduced by this policy — it is a review-enforced
naming/justification convention.

---

## Fixture policy

Committed test fixtures must be **hermetic**, meaning in this repository:

- **network-free** — no fetch, no DNS, no socket; external behavior is encoded
  as data,
- **clock-free** — timestamps are fixed constants passed as parameters, never
  `Date.now()` at test runtime,
- **free from per-run git invocation** — git semantics are pre-generated into
  committed fixtures, not sampled from a live git binary at test time,
- **deterministic** — same inputs, same outputs, every run, on every OS (no
  path-separator drift: fixtures encode POSIX-style logical paths where the
  subject is cross-platform; Windows-specific joins belong to the subject
  under test, not the fixture),
- **isolated state** — temp dirs via the test framework (see
  `SessionManager.test.ts`'s hermetic electron mock + temp `zeus.db`), never
  the developer's real `%APPDATA%`.

**The model:** `src/shared/refName.test.ts` — the `git check-ref-format`
corpus is committed as literal data ("deliberately NOT verified against a
live git at test time"), so the suite runs in milliseconds, offline,
identically on every machine. New fixture suites follow that shape.

---

## Windows manual checklist template (L3)

Copy the relevant rows into the ticket and record observations — "Windows
tested" without concrete cases does not satisfy L3. Mandatory (all rows that
apply) for tickets touching **spawn, PTY, or paths**.

### Paths & semantics

- [ ] Absolute-path inputs rejected where required (no drive-letter escape,
      no UNC `\\server\share` handling surprise)
- [ ] Parent-traversal (`..`) and null-byte inputs rejected
- [ ] Containment holds across **separators and casing** — the guard
      resolves-then-compares (`path.resolve`/`path.relative`); try a
      case-variant of the root and a forward-slash spelling
- [ ] Symlink/realpath behavior verified where the surface uses realpath
      containment (worktree delete guards, crown-jewel realpath variants)

### Long paths & clamps

- [ ] Deep trees stay under MAX_PATH headroom (worktree bucket+slug layout —
      create a worktree and build inside it)
- [ ] Length caps enforced where defined (`assertInsideRepo` 4096,
      `CURSOR_LIMITS.execPathMax` 1024) — try an over-long value and observe
      the clean rejection, not a filesystem error

### Spawning

- [ ] Spawn uses argv arrays; output is captured and bounded (maxBuffer)
- [ ] No shell metacharacter in any argument changes behavior (try `&`, `^`,
      quotes in branch names / paths where user-supplied)
- [ ] `.cmd/.bat` shims only via the `%ComSpec%` whitelist (`SAFE_ARG_RE`);
      dynamic arguments never reach the cmd bridge
- [ ] Secrets visible in the child **environment only** — never in argv
      (check process listing while a run is live)

### PTY

- [ ] Terminal session starts, resizes, and exits cleanly on Windows
      (node-pty conpty path)
- [ ] Control keys, ANSI colors, and resize events behave; kill leaves no
      orphan conhost

### Installer / packaging-relevant

- [ ] Behavior verified against the packaged app (`npm run package`), not
      only dev mode — dev/prod differences (origin, CSP, userData layout) can
      mask platform bugs
- [ ] userData paths resolve to `%APPDATA%\zeus` (ZEUS identity, #8) — no
      path regression toward the legacy layout
- [ ] If update-adjacent: the read-only feed posture is unchanged (#13; no
      publishing path reappears)

Record per row: what was tried, what was observed, and any deviation (with
ticket/issue reference).

---

## Security integration (with #16, not instead of it)

The ladder does **not** create a second security framework — it makes the
existing one enforceable at the right depth:

- A security-relevant change (per the Security-impact contract in
  [`docs/security/invariants.md`](../security/invariants.md)) must
  1. **identify the touched security surface** (IPC, spawn argv, SQL, path
     joins, object merging, secrets, outbound network, permission/sandbox),
  2. **map it to the governing invariant ID** (SEC-01…SEC-21, XP-01),
  3. **name the anchor** that guards it — the test/CI step from the
     invariant's enforcement-anchor column,
  4. **reach L2 + L3** when the touched surface is platform-sensitive
     (spawning, paths, secrets-at-rest, sandbox translation on Windows).

- Where an invariant row is `review-enforced` and a ticket touches it, the
  ticket's L3/review notes must state what the reviewer should look at —
  the checklist template above already covers the recurring Windows cases.
- The crown-jewel surface has its own structural gate
  (`scripts/check-crown-jewels.mjs`); tickets touching the jewel set run L0 +
  that gate locally and expect CI to enforce it.

---

## What "done" means

A ticket is verified when: L0 is clean; its class's required rungs are
satisfied with **concrete recorded cases** (not rung labels); any pure-module
or export-policy deviation is documented; and its Security-impact section
names surfaces → invariant IDs → anchors. Reviewers may contest any claim;
the contest goes through the normal review, and — for security invariants —
through the regression protocol in
[`docs/security/invariants.md`](../security/invariants.md).
