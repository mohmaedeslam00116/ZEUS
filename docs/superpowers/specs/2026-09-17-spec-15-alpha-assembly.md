# Spec 15 — Alpha assembly and release execution (the #31 go/no-go bar)

- **Status:** Proposed (`ready-for-agent`)
- **Date:** 2026-09-17
- **Governing decisions:** Wayfinder #31 resolution · #27 minimum visual bar · ADR-0008/0009/0010
- **Format:** mandatory handoff template (16 sections) + User Stories

## Problem

The decision frontier locked every ingredient of the closed alpha — rename,
identity, pipeline, updater posture, versioning, tester program — but none of
it has been executed against a real packaged build, and nothing yet forces
the pieces to be true simultaneously before publication. Without a single
assembly gate, the alpha could ship with a stale identity string, an
unverified update path, or an unrecorded Windows check.

## Solution

Execute the #31 go/no-go bar as a release run: cut `v0.1.0-alpha.1`, run it
through the Spec 14 workflow, verify every gate against the **actual packaged
build** (packaged L3 Windows checklist, clean-machine boot smoke, structural
update check), write the changelog-derived alpha notes, dispatch invitations
with the tester agreement, and end at the human Publish decision. The
canonical checklist, per-gate evidence, and rollback runbook live in
`docs/operations/alpha-program.md` (created by #31); this spec binds the
release run to it.

## User Stories

1. As the maintainer, I want one assembly gate that verifies every locked decision against the packaged build, so that "ready to publish" is evidenced, not asserted.
2. As the maintainer, I want the go/no-go checklist recorded item-by-item with evidence, so that the publish decision is auditable.
3. As an alpha tester, I want an installer that was boot-verified on a clean Windows machine, so that my first install works.
4. As an alpha tester, I want honest invitation notes (unsigned binary, SmartScreen steps, known limitations, feedback path), so that I know what I'm agreeing to and how to get help.
5. As an alpha tester, I want release notes that describe the actual ZEUS alpha scope, so that I know what I'm testing.
6. As the maintainer, I want the update path structurally verified for alpha.1, so that testers can receive alpha.2 when it exists.
7. As the maintainer, I want a rehearsed rollback runbook, so that a broken release has a documented, immediate response.
8. As a security reviewer, I want the identity/storage checks (no Limboo residue, `%APPDATA%\zeus` intact) performed on the packaged build, so that decisions are proven in the shipped artifact, not the dev tree.
9. As the maintainer, I want the Publish click to remain the explicit human decision, so that nothing ships without me.
10. As a future maintainer, I want the alpha run's evidence recorded, so that alpha.2's bar (including the E2E update test) builds on a known baseline.

## Scope

The execution of the first ZEUS alpha release: tag creation
(`v0.1.0-alpha.1`), dispatch, packaged-build verification, evidence recording,
invitation dispatch, draft review, and the publish decision. All machine
gates are already defined; this spec adds only the assembly sequence and the
evidence standard that binds them to the packaged artifact.

## Non-goals (mandatory)

- No new product features, no UI work beyond Specs 12/13, no code changes
  beyond release-run fixes that fail a gate (each such fix re-runs the full
  bar).
- No E2E update test for alpha.1 (structurally impossible — no prior ZEUS
  alpha; it is alpha.2's mandatory release gate per #31).
- No code signing, no publisher claims, no non-Windows targets.
- No public beta, no application form, no community program.
- No new telemetry or data collection.
- No changes to the tester terms/feedback infrastructure (#31 artifacts are
  the source of truth; this spec consumes them).

## Current architecture

- `docs/operations/alpha-program.md` holds the canonical go/no-go checklist,
  per-gate evidence requirements, tester terms, feedback triage, and rollback
  runbook (created in #31).
- The alpha-feedback issue template and `alpha` label exist on the tracker.
- The release workflow (Spec 14), identity (Spec 13), rename (Spec 11), and
  UX fixes (Spec 12) are prerequisites landed by their own specs.
- The versioning mechanics (#30, landed): tag `v0.1.0-alpha.1` stamps the
  build version via the apply-tag script; `gen:notes` derives release
  documents from the changelog's first ZEUS section.

## Applicable ADR / decision

#31 resolution (this spec operationalizes it); ADR-0008 (draft-prerelease +
human Publish); ADR-0009 (identity verification rows); ADR-0010 (fresh
history — the first ZEUS tag and notes structure); ADR-0007 (the L3 ladder
rung and its evidence standard); ADR-0004 (no security regressions — the
packaged security checks are the proof).

## Detailed behavior

The release run proceeds in this order; each stage gates the next:

1. **Preconditions audit** — confirm on the tree: Specs 11–14 landed (the #31
   audit's blocker list empty: identity strings, `zeus_memory`, `Ctrl P`,
   `release.yml`, ZEUS feed, appId, interim mark, AA contrast all present);
   working tree clean; all machine gates green locally.
2. **Tag + dispatch** — create tag `v0.1.0-alpha.1` from `main`; dispatch
   `release.yml` with it (the workflow re-runs all gates; tag validation and
   duplicate protection apply).
3. **Packaged verification (the [M] core of the bar)** — against the actual
   produced installer, record evidence per `alpha-program.md`:
   - **L3 Windows manual checklist** (per `docs/development/verification.md`):
     process spawning, PTY behavior, Windows paths, long-path clamps,
     security-sensitive process boundaries, ZEUS identity/storage expectations
     (`%APPDATA%\zeus` created, `zeus.db` present, no Limboo paths),
     installer behavior (install → shortcut/ARP/tray/About identity →
     uninstall).
   - **Clean-machine boot smoke:** the packaged build boots on a machine
     without dev tooling; first-run completes; a session actually exercises
     the touched surfaces.
   - **Structural update check (alpha.1 split gate):** packaged
     `app-update.yml` points to `mohmaedeslam00116/ZEUS`; updater initializes
     without error; feed resolution is clean.
   - **Identity spot-check:** no Limboo string/mark at any first-contact
     surface; `Ctrl P` register; state copy legible.
4. **Notes + checksums** — the draft's body derives from the changelog's
   `v0.1.0-alpha.1` section (alpha scope, major changes, known limitations,
   unsigned/SmartScreen guidance, feedback path); checksums and manifest
   attached by the workflow.
5. **Invitation package** — the #31 invitation notes go to each invited
   tester (installation, SmartScreen handling, known limitations, what to
   report, diagnostics hygiene, feedback channel) with the tester
   acknowledgment required before the build link.
6. **Human Publish** — the maintainer reviews the draft (artifact, notes,
   checksums, evidence record) and clicks Publish. Publication is the
   maintainer's decision, made only when every checklist row has evidence.
7. **Rollback readiness** — the `alpha-program.md` runbook is the rehearsed
   response: delete-and-republish, higher-version forward fix, manual
   reinstall guidance to testers. Rehearsal = the runbook is reviewed and its
   steps confirmed executable before Publish (no dry-run release is created).

## Files/modules affected

No product code by default. The release run touches: the git tag, the
workflow dispatch, the changelog's `v0.1.0-alpha.1` section (authored before
dispatch), the alpha-program evidence record (a filled checklist appended to
or linked from `docs/operations/alpha-program.md`), and the draft release.
If any gate fails, the fix lands in the owning spec's scope and the run
restarts at stage 1.

## Data/migration impact

None. Testers' machines receive fresh installs; the updater feed is exercised
structurally only (no prior ZEUS release exists to update from).

## Security impact

1. **Surfaces touched:** none in code. The run *verifies* security posture on
   the packaged artifact: crown-jewel storage layout (`%APPDATA%\zeus`,
   `zeus.db`, `secrets/`), SEC-18/SEC-21 updater behavior (structural check),
   process-boundary behavior (L3 rows), no secrets in the draft/artifacts.
2. **Invariant mapping:** this spec weakens nothing; it is the evidence stage
   for the invariants the earlier specs touched. The recorded L3 and
   packaged checks are the ADR-0004 regression protocol's proof-of-absence
   for the alpha. Any discovered regression during the run is a release
   blocker per the protocol — fixed in the owning ticket, never waived.

## Windows-specific behavior

The entire spec is the Windows verification stage: the packaged L3 checklist
and clean-machine smoke ARE its primary deliverable. Distinction maintained
per #31: **L2 boot smoke in dev does not substitute** for the packaged
clean-machine boot; the structural update check does not claim E2E coverage.

## UI/UX impact

None new. The run verifies Specs 12/13's outcomes on the packaged build
(identity strings, mark, `Ctrl P`, AA copy) — closing the #27 minimum alpha
visual bar with recorded evidence.

## Impeccable review requirements

No new UI decisions. The identity spot-check re-uses the #27 audit's
acceptance definitions as its checklist rows.

## Verification plan

This spec IS a verification plan; its rungs per the standard:

- **L0:** all-machine-gates green at dispatch (the workflow re-proves them).
- **L1:** full suite green in the release run (no new tests; the run consumes
  existing families).
- **L2:** dev boot smoke — explicitly insufficient for publication; recorded
  only as a precondition.
- **L3:** the mandatory recorded packaged-build checklist (spawning, PTY,
  paths, clamps, process boundaries, storage identity, installer, uninstall)
  per `docs/development/verification.md`'s template.
- **Packaged-only:** clean-machine boot smoke; structural update check;
  identity spot-check. Evidence = filled checklist rows with observed
  results, stored with the run record.

## Acceptance criteria

1. Every `alpha-program.md` go/no-go row has recorded evidence against the
   packaged `v0.1.0-alpha.1` build (or the run does not reach Publish).
2. "Verified now" (machine gates, code audits) is distinguished from
   "required before Publish" (packaged L3, clean-machine smoke, structural
   update check) in the evidence record.
3. The draft release exists with correct notes/checksums/manifest; publication
   happens only by the maintainer's explicit action.
4. Invitations sent only after the tester acknowledgment is received.
5. The rollback runbook reviewed as executable before Publish.
6. The run's evidence is committed, creating the baseline alpha.2's gate
   builds on.

## Dependencies

**Specs 11–14 all landed** (this is the last ticket in the sequence). The #31
artifacts (`alpha-program.md`, `alpha-feedback.yml`, `alpha` label) exist.
Blocked by nothing else; blocks the alpha itself.

## Known risks

1. Packaged-build failures discovered late (identity or path drift between
   dev and packaged contexts): mitigated by running the full bar on the draft
   artifact, before Publish, with restart-at-stage-1 discipline.
2. Clean-machine availability: the smoke test requires one non-dev Windows
   machine or VM; scheduling is the maintainer's operational risk, not a
   scope question.
3. Tester availability/timing: the program targets 3–8 testers (target 5);
   the go/no-go bar does not depend on a specific count.
