# ZEUS `to-spec` Phase Report

- **Date:** 2026-09-16
- **Status:** Phase 1 + Phase 2 specifications produced. No implementation,
  no tickets, no application-code changes.
- **Authoritative inputs honored:** `CONTEXT.md`, `AGENTS.md`, `CLAUDE.md`,
  `docs/adr/0001–0007` (closed), the `to-spec` handoff, `docs/architecture/*`.

## Specs created (in handoff order)

| # | File | Phase | Governing decision |
|---|------|-------|--------------------|
| 1 | `2026-09-16-spec-01-storage-identity.md` | 1 | ADR-0005 |
| 2 | `2026-09-16-spec-02-voice-removal.md` | 1 | Decision log (voice out of scope) |
| 3 | `2026-09-16-spec-03-typescript-5-upgrade.md` | 1 | Round-2 bounded-TS decision |
| 4 | `2026-09-16-spec-04-vitest-foundation.md` | 1 | ADR-0007 |
| 5 | `2026-09-16-spec-05-ci-verification-gates.md` | 1 | ADR-0007 + Dependabot unpause deliverable |
| 6 | `2026-09-16-spec-06-release-pipeline-isolation.md` | 1 | ADR-0006 |
| 7 | `2026-09-16-spec-07-session-worktree-defaults.md` | 2 | Round-2 plain-first decision |
| 8 | `2026-09-16-spec-08-provider-boundary-contract.md` | 2 | ADR-0003 |
| 9 | `2026-09-16-spec-09-security-invariants-cross-cutting.md` | 2 | ADR-0004 |
| 10 | `2026-09-16-spec-10-verification-architecture-integration.md` | 2 | ADR-0007 |

All specs use the 16-section template with mandatory `Non-goals`; all carry
Security impact (mapped to the ADR-0004 invariant set), Windows-specific
behavior, verification, acceptance criteria, dependencies, and known risks.
None touch the deferred scope list.

## Decisions / spec boundaries

- **Closed ADRs unchanged:** no spec reopens, reinterprets, or weakens
  ADR-0001–0007. Specs translate decisions into implementation scope; where
  inherited docs conflict (e.g. CLAUDE.md's "don't run tsc" instruction vs
  the bounded TS-5 decision), the spec notes the drift and updates the
  *documentation* in its implementation scope — the decision stands.
- **Spec boundaries drawn against drift:** Spec 1 explicitly fences out
  visible branding (appId/productName/installer stay Limboo until the
  deferred rebrand); Spec 3 fences out the ESLint major upgrade and all
  runtime-dep churn; Spec 5 fences out release jobs and takes over only the
  Dependabot policy replacement; Spec 6 keeps generic validators in-tree as
  reference; Spec 7 fences out the `branchPrefix` rebrand and any redesign
  of the offer flow.
- **Sequencing is dependency-real:** storage identity first (all later
  verification runs against `%APPDATA%/zeus`); voice removal before TS-5
  (smaller type surface); TS-5 before Vitest; Vitest before CI gates; CI
  gates before release isolation; Phase 2 rides the clean CI baseline.
- **New cross-cutting artifacts specified:** provider-neutrality CI gate
  (Spec 8), crown-jewel consistency gate (Spec 9), security-invariants
  reference with anchor mapping (Spec 9), verification ladder (Spec 10).
  These make the closed ADRs *enforceable* rather than aspirational.

## Assumptions discovered from the current implementation

1. **No `app.setName` exists anywhere** — identity work is genuinely
   greenfield inside `src/main/index.ts`; several managers resolve
   `userData` paths in constructors, so `setName` must precede the
   composition root (import-order audit is a named deliverable of Spec 1).
2. **`limboo.db` is referenced beyond `database.ts`** — crown-jewel matching
   logic and security notes inside `AgentManager.ts` match the filename;
   the DB rename must sweep those (Spec 1) or the three security layers
   drift.
3. **`tar-fs` is voice-only** — suspected sharing with attachments was
   disproven by grep; voice removal can take `tar-fs` + `@types/tar-fs`
   cleanly (Spec 2 verified-fact).
4. **Voice surface is large but enumerable** — 15 invoke + 6 push channels,
   34 preload references, ~10 renderer files, one native dep chain; removal
   is a bounded one-shot change with grep gates.
5. **TS 4.5 constraint documented in CLAUDE.md is stale under ZEUS decisions**
   — the code is esbuild-transpiled, so a TS 5 bump is runtime-neutral; the
   real boundary is the pinned `@typescript-eslint@5` toolchain (cap ~5.3–5.4)
   — Spec 3 chooses within that range rather than upgrading ESLint.
6. **Plain sessions already exist structurally** — `sessions` table carries
   nullable `worktree_path/branch/status`; `resolveSessionRoot` already
   falls back. Spec 7 is a defaults/migration change (`autoSetup: true →
   false` with explicit-choice preservation), not a data-model change.
7. **`autoSetup` only gates the renderer's auto-offer** (documented in
   WorktreeManager) — main-process provisioning is unconditional; the
   default flip therefore cannot strand any main-side flow.
8. **ZEUS CI is already running green** (CI/Security/CodeQL on main) — the
   inherited `validate` job is valuable and generic; Specs 5/6 extend the
   former and remove the release machinery around it, not the reverse.
9. **The `Electron security invariants` CI step exists but its exact
   assertions are unverified** — Spec 9 makes auditing it a deliverable
   rather than assuming its coverage.
10. **Cursor's Windows exec plumbing is seam-interior** — native layout
    resolver, ComSpec shim whitelist — and must be exempted from (and
    documented in) the provider-neutrality gate.

## Genuine contradictions requiring human architectural attention

None of these block Phase-1 implementation; all are recorded in the specs
and should be resolved (or accepted) before or during their spec's
implementation:

1. **TelemetryAccumulator's "pure" claim is unproven** (Spec 4 risk): if its
   construction needs Electron/clock, the class must accept injectable
   `HostFacts` (already exported) — a small design change to a core class
   that deserves a maintainer's yes/no before the Vitest ticket.
2. **TS 5 error tail is unknown** (Spec 3 risk): a TS 4.5 codebase may hide
   hundreds of errors. The spec's fallback (incremental per-project
   typecheck, remainder logged) is a deviation from "whole project passes"
   that needs sign-off if triggered.
3. **`SettingsManager.normalize` testability** (Spec 4): testing it purely
   may require extracting a pure function from a class with fs access — a
   tiny refactor Spec 4 deliberately forbids itself from doing casually;
   the extracted-function decision is left to implementation review.
4. **Inherited CI docs-integrity checks may be Limboo-identity-coupled**
   (Spec 5 risk / Spec 6 scope): if the release-notes/manifest sync checks
   fail on ZEUS for identity reasons, the spec routes the fix to Spec 6 —
   but if they are *load-bearing for the docs gates themselves*, a small
   ZEUS decision (repoint or drop) is needed from a human.
5. **Release-notes sync vs removed release machinery** (Spec 6): deleting
   the release stage while keeping `gen:notes --check`-style gates may be
   incoherent; the spec flags this rather than silently deciding.
6. **CI runs on ubuntu only while Windows is the primary target** (Spec 5
   non-goal): adding a Windows runner is explicitly deferred — a human
   should confirm this limitation is acceptable for Phase-2 implementation
   verification.
7. **Notification/tray identity during the pre-rebrand window** (Spec 1):
   `app.setName('zeus')` may make OS-level identity strings disagree with
   "Limboo" branding. Cosmetic, but a visible product decision — flagged
   for acceptance rather than silently chosen.

## What was NOT done (per constraints)

- No application/source code modified; no dependencies changed; no tickets
  or issues created; no deferred-scope work pulled in; ADRs untouched.
- Phase-2 specs (7–10) are specifications only; their own doc/code artifacts
  (contract docs, gates, ladder) are implementation deliverables.

---

## Addendum — contradiction-resolution review (post-spec, pre-to-tickets)

All seven issues were reviewed against actual code/config (see spec
"RESOLVED/CORRECTED" annotations). Outcome: **five resolved with no change,
four spec adjustments applied, zero items requiring a new architectural
decision, zero ADRs touched.**

| # | Issue | Classification | Resolution |
|---|-------|----------------|------------|
| 1 | TelemetryAccumulator purity | RESOLVED — no change required | No constructor; clock is a parameter; tests construct directly. HostFacts-constructor idea dropped (Spec 4). |
| 2 | TS 5 error tail | RESOLVED — no change required | All deps are esbuild-transpiled; no typecheck currently exists, so no hidden-error tail. Mechanical-only fixes; escalation clause stays as written. |
| 3 | SettingsManager.normalize testability | SPEC ADJUSTMENT | Body verified pure; `private` + fs-touching constructor is the only blocker. Spec 4 authorizes the minimal pure-function extraction (`normalizeSettings`), class delegates. |
| 4 | CI docs-integrity vs Limboo identity | RESOLVED — no change required | Checks are repo-internal/identity-agnostic; only a code comment mentions Limboo. Cosmetic ride-along in Spec 6. |
| 5 | Release-notes sync vs removed publishing | SPEC ADJUSTMENT | `gen:notes --check` is repo-internal and stays. Spec 6 gains an explicit KEEP list (generated modules, Release-document UI, CHANGELOG); deletion scope = publishing only. |
| 6 | Ubuntu-only CI vs Windows-first | SPEC ADJUSTMENT (premise corrected) | `ci.yml` already runs a three-OS smoke matrix incl. `windows-2022`. Spec 5 records the real boundary: ubuntu validate + cross-OS smoke matrix + L3 manual checklist. No new runner work. |
| 7 | app.setName('zeus') visible identity | SPEC ADJUSTMENT | Renderer/preload have zero identity strings; main has exactly one (`TrayManager` tooltip `'Limboo'`). Spec 1: switch tooltip to `app.getName()`; OS identity reads `zeus` — accepted ADR-0005 consequence, not a rebrand. |
