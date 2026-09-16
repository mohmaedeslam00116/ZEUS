# Spec 6 — Release-Pipeline Isolation (ADR-0006 Implementation)

- **Phase:** 1 (Infrastructure prerequisites, item 6)
- **Applicable ADR / decision:** ADR-0006 (closed) — inherited Limboo release
  publishing neutralized; ZEUS-native publishing deferred
- **Status:** Draft for review — specification only

## Problem

The cloned codebase carries Limboo's complete release machinery. The
repository's remotes point only at the ZEUS repo, but the pipeline
*definitions* still target Limboo infrastructure: `.gitlab-ci.yml` declares
`stages: [validate, build, test, package, secure, release]` with a release
stage that fires on `v*` tags and publishes installers to Limboo's GitLab and
GitHub release feeds; `bitbucket-pipelines.yml` co-publishes; GitHub Actions
`release.yml` / `release-supplement.yml` / `_package.yml` / `cd.yml` package,
attest, and upload. A single accidental `v*` tag push (or a mirrored trigger)
would attempt to publish ZEUS builds as Limboo releases. ADR-0006: neutralize
structurally, not by discipline.

## Scope

- Remove/disable the inherited release stages, their `v*` triggers, and
  Limboo-specific publishing paths in all CI definitions.
- Retain a minimal CI path (build/lint/basic verification) — the generic
  gates from the inherited `validate` job.
- Preserve generic artifact-validation logic as reference for the future
  ZEUS-native release design.

## Non-goals

- No new ZEUS release publishing (deferred decision + future ADR).
- No tag/versioning changes to package.json.
- No signing, update-feed, or installer-art work (rebrand/publishing are
  deferred).
- No changes to `ci/scripts/*.mjs` beyond what removal requires; generic
  validators stay in-tree even if currently unreferenced (they are reference
  material per ADR-0006).

## Current architecture (verified)

- `.gitlab-ci.yml`: six stages incl. `release`; `v*`-tag-triggered release
  stage publishing to GitLab + GitHub releases; uses `ci/scripts/*.mjs`
  (apply-tag-version, verify-artifacts, generate-release-manifest,
  make-checksums, check-release-manifest, merge-update-metadata).
- `bitbucket-pipelines.yml`: mirrors GitLab; Linux packaging pass co-publishes
  the GitHub Release on `v*` tags.
- `.github/workflows/`: `release.yml` (tag-triggered packaging+upload),
  `release-supplement.yml` (per-arch supplement + feed merge),
  `_package.yml` (reusable packaging+attestation; called by `cd.yml` and
  `release.yml`), `cd.yml` (manual dry-run of the package pipeline),
  `ci.yml` (validate only — Spec 5 extends it), `codeql.yml`, `security.yml`
  (generic — stay).
- `electron-builder.yml` / `forge.config.ts`: Limboo identities
  (`dev.limboo.app`, `Limboo`, Squirrel/NSIS/deb/rpm/ZIP makers, update-feed
  config) — **unchanged in this spec** (identity work is deferred; the goal
  is that nothing *triggers* them).

## Applicable ADR / decision

ADR-0006: neutralize now; preserve generic artifact-validation knowledge;
ZEUS-native publishing later as its own decision.

## Detailed behavior

1. **`.gitlab-ci.yml`:** reduce to the validate-equivalent stages (lint/build
   checks) — delete `package`, `secure`, `release` stages and all `v*`-tag
   rules; delete publish/upload jobs. If GitLab CI is not wanted at all on
   ZEUS, the file may be deleted outright (simpler; record choice in PR) —
   but no Limboo publishing definition may remain.
2. **`bitbucket-pipelines.yml`:** delete the tag-triggered publish pipeline;
   either reduce to basic CI or delete the file (same record-the-choice rule).
3. **GitHub Actions:** delete `release.yml`, `release-supplement.yml`,
   `_package.yml`, `cd.yml`. Keep `ci.yml`, `codeql.yml`, `security.yml`.
4. **Reference preservation:** move the release-machinery knowledge rather
   than deleting it blind — keep `ci/scripts/verify-artifacts.mjs`,
   `merge-update-metadata.mjs`, and the packaging invariants documented in
   `docs/operations/auto-update.md` + `docs/ci/*` in-tree, marked as
   reference for the future ZEUS release design (they encode shipped-bug
   invariants worth keeping per ADR-0006).
5. **Explicit KEEP list (verified repo-internal, unaffected by de-publishing):**
   the `gen:notes -- --check` CI step, the committed generated modules
   (`releaseNotes.generated.ts`, `releaseManifest.generated.ts`),
   `CHANGELOG.md`, and the in-app **Release document UI feature** — release
   notes are a user-facing feature that reads the generated modules, entirely
   independent of release *publishing*. Deletion scope is publishing only:
   tag triggers, package/attest/upload jobs, feed merging, publish
   entrypoints. Do not remove the release-notes feature or its gates.
6. **Guard against re-trigger:** after removal, no workflow/pipeline in the
   repo may contain a `v*` tag trigger or a publish/Upload-release step —
   verified by grep gate in the PR.
7. **Docs:** update `docs/ci/release-process.md`, `docs/operations/
   auto-update.md`, and `CLAUDE.md` §5 release paragraphs with a ZEUS status
   note (release publishing intentionally absent until the future decision;
   inherited docs describe Limboo's process). Authority-model compliant:
   implementation-reality docs get the note; the ADR stays authoritative.

## Files/modules affected

- `.gitlab-ci.yml`, `bitbucket-pipelines.yml` (reduce or delete)
- `.github/workflows/release.yml`, `release-supplement.yml`,
  `_package.yml`, `cd.yml` (delete)
- `docs/ci/*`, `docs/operations/auto-update.md`, `CLAUDE.md` (status notes)
- `ci/scripts/*.mjs` — retained as reference (only removal of release-only
  entrypoints like `dist.mjs` if they become dead and misleading; justify
  each in the PR)

## Data/migration impact

None.

## Security impact

- Positive: removes OIDC attestation/upload surfaces and external-publish
  credentials paths from the repository's active CI — a real attack-surface
  reduction aligned with ADR-0004's posture.
- The gitleaks/dependency-review/CodeQL workflows stay active.
- No new permissions; total workflow `permissions:` scope shrinks.

## Windows-specific behavior

- Windows installers are no longer produced by CI at all (was part of the
  neutralized machinery). Local `npm run package`/`dist` still work for
  development; document that they are developer-local until ZEUS-native
  publishing exists.

## UI/UX impact

None.

## Impeccable review requirements

Not applicable.

## Verification plan

- Grep gate (in PR + repeatable): `grep -rn "v\*" .github/workflows/
  .gitlab-ci.yml bitbucket-pipelines.yml` shows no tag triggers;
  `grep -rn "softprops\|gh-release\|upload-release\|ghr_"` shows no release
  upload actions.
- Push a scratch tag `v0.0.0-test` **on a disposable branch** (never main)
  during implementation: no pipeline/workflow fires — then delete it.
  (This validates the structural guarantee ADR-0006 requires.)
- All remaining workflows visible in the GitHub Actions tab are only CI,
  Security, CodeQL.

## Acceptance criteria

1. No pipeline definition in the repo can publish a release or fire on `v*`
   tags (structurally verified).
2. Generic validation CI still runs (lint/build/typecheck/tests per Spec 5).
3. Reference validators + packaging invariants remain in-tree and marked as
   reference.
4. Docs state the release-publishing posture accurately.

## Dependencies

After Spec 5 (clean CI baseline). Completes Phase 1; Phase 2 specs may then
proceed knowing no release automation interferes.

## Known risks

- Deleting `_package.yml` removes the reusable packaging recipe the future
  ZEUS release design might adapt — mitigated by keeping it recoverable from
  git history and keeping the *invariant documentation* in-tree.
- **RESOLVED (contradiction review):** the release-notes sync gate
  (`gen:notes --check`) verifies committed generated modules against
  `CHANGELOG.md` — repo-internal, independent of publishing — so it stays
  (see the KEEP list in Detailed behavior). No coherence gap exists.
- Inherited `ci.yml` steps mention Limboo in comments only
  (`check-electron-security.mjs` header); the checks themselves are
  identity-agnostic — cosmetic comment updates ride along in this spec's
  implementation.
- Mirror remotes: the repo's push fan-out configuration (if any user copies
  it) is a local-config concern, not in-repo — the structural neutralization
  covers the repository itself.
