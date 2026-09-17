# ADR 0010 — Limboo → ZEUS functional rename; fresh release history

- **Status:** Accepted
- **Date:** 2026-09-17
- **Context:** Wayfinder Phase 3 decisions #26 (functional rename) and #30 (versioning/fresh history)

## Context

The functional and internal namespaces still carry the inherited name:
`limboo.json`, `.limboo/`, `limboo_memory`/`limboo_search`,
`mcp__limboo_*__*`, `refs/limboo/checkpoints/*`, `window.limboo`, `LIMBOO_*`
env vars, and `limboo-*` CSS classes. ZEUS has zero shipped users, so no
persisted state can realistically outlive a rename before first release. The
#25 inventory classified every occurrence as MUST-RENAME, DECIDE-LATER, or
MUST-NOT-RENAME (heritage).

## Decision

- **Mechanical scheme:** `limboo → zeus` wherever a MUST-RENAME identifier
  appears: `limboo.json → zeus.json`, `.limboo/ → .zeus/` (plus
  `.zeus-tmp`, `zeus-plans`, `zeus-context.mdc`), `limboo_memory →
  zeus_memory`, `limboo_search → zeus_search`,
  `mcp__limboo_*__* → mcp__zeus_*__*`, `refs/limboo/checkpoints/* →
  refs/zeus/checkpoints/*`, `[limboo checkpoint] → [zeus checkpoint]`,
  `limboo-main.log → zeus-main.log`.
- **Internal-namespace purity:** the never-user-visible namespaces rename in
  the same change — `window.limboo → window.zeus`, `LIMBOO_* → ZEUS_*`,
  `limboo-* CSS → zeus-*`.
- **Clean-cut compat posture:** no read-old/write-new layer, no migration
  logic, no dual-prefix scanning anywhere. Dev-build residue under old names
  (orphaned git refs, old staging dirs, old dev-repo configs) is classified
  harmless pre-release leftovers.
- **Upstream identity boundary:** only the behavior-bearing `RELEASE_REPO`
  repoints to `mohmaedeslam00116/ZEUS` here; cosmetic repository references
  (badges, issue-template links, tracker lines) follow the ADR 0009 identity
  package, not this rename. Historical/upstream heritage references classified
  by #25 remain untouched — including the crown-jewel gate's `limboo.db`
  guard literals, which police the legacy name by design.
- **Fresh release history (from #30):** first ZEUS tag `v0.1.0-alpha.1`
  (`alpha.N → beta.N → 0.1.0` SemVer progression, "tag is the version"
  mechanism unchanged); all 44 inherited Limboo `v1.x` local tags removed
  (the ZEUS remote never had tags); the CHANGELOG separates ZEUS history from
  an archived, heading-demotion Limboo heritage block so the existing parser
  never treats inherited releases as ZEUS releases. This change is already
  implemented and committed (`dda212d`).

## Consequences

- ZEUS's functional surface is self-consistently named before first contact.
- Anything persisted under an old name by a pre-alpha dev build is simply
  abandoned, by design.
- Gates and documentation synchronize with the rename: crown-jewel current-impl
  doc watch list, `CONTEXT.md` glossary, SEC-19 Cursor-rule examples
  (`Write(.zeus/**)`), and doc-index links, per the #26 checklist.
