# ADR 0006 — Release identity decoupled; inherited Limboo publishing neutralized

- **Status:** Accepted
- **Date:** 2026-09-16
- **Context:** Round 2 grilling — release safety

## Context

The cloned codebase carries Limboo's full release machinery: `.gitlab-ci.yml`
with a `release` stage that fires on `v*` tags and publishes installers to
Limboo's GitLab and GitHub release feeds, plus Bitbucket mirror pipelines and
GitHub Actions supplement workflows. The ZEUS repository's remotes point only
at the ZEUS repo, but the pipeline definitions still target Limboo
infrastructure and secrets. A single accidental `git push origin vX.Y.Z` — or
a mirrored trigger — would publish ZEUS builds as Limboo releases. Developer
discipline is not a safety mechanism.

## Decision

Neutralize the inherited release pipelines **now**, during implementation,
before any feature work:

- Remove/disable the inherited release stages and their `v*` triggers.
- Remove Limboo-specific publishing paths and identities.
- Retain a minimal CI path for build/lint/basic verification.
- Preserve artifact-validation logic where it is generic
  (`verify-artifacts.mjs` invariants are engineering knowledge worth keeping).
- Re-establish ZEUS-native release publishing later, as its own decision.

## Consequences

- A tag in the ZEUS repository cannot trigger a Limboo release, structurally.
- ZEUS has no release channel until ZEUS-native publishing is designed —
  acceptable for the pre-v1 phase.
- The release invariants learned from shipped bugs (feed merging, packaging
  rules) are preserved as reference for the future ZEUS release design.
