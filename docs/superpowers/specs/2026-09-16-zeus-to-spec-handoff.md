# ZEUS — Architecture Handoff for `to-spec`

- **Date:** 2026-09-16
- **Status:** Grilling frontier **closed** (Rounds 1–2). This is the
  **authoritative handoff** for the specification phase.
- **Closed decisions:** ADRs 0001–0007 are closed and must not be reopened by
  `to-spec`. `to-spec` translates accepted decisions into implementation-ready
  specifications; if it discovers an actual contradiction in the codebase, it
  documents a discrepancy/risk instead of silently changing an ADR.
- **Authoritative artifacts:** `CONTEXT.md` (glossary), `docs/adr/0001–0007`
  (permanent decisions), this file (scope split + open risks).

## ADR index (permanent architectural decisions)

| ADR | Decision |
| --- | -------- |
| 0001 | ZEUS evolves the Limboo codebase in place |
| 0002 | Windows-first, cross-platform retained |
| 0003 | Provider-neutral seam retained; Claude + Cursor primary; local models = future adapter |
| 0004 | Security model preserved unchanged; deny-by-default |
| 0005 | Storage identity pinned: `app.setName('zeus')` → `%APPDATA%/zeus`; no Limboo migration |
| 0006 | Inherited Limboo release publishing neutralized; ZEUS-native publishing later |
| 0007 | Vitest verification strategy: incremental, pure modules first, E2E later |

Decision-log entries (scoped, reversible — no ADR): five platform services
kept; Voice removed; visual rebrand deferred; session-centric model kept;
plain sessions default; worktrees optional; TypeScript 5 bounded upgrade.

---

## Binding rules for `to-spec`

1. **Closed decisions.** ADRs 0001–0007 are closed and must not be reopened.
   Discovered code-level contradictions are documented as discrepancies/risks,
   never resolved by silently changing an ADR. Documentation conflicts are
   governed by the authority model in `AGENTS.md` (§ Documentation authority):
   an inherited Limboo statement never silently overrides a closed ZEUS ADR.
2. **Security is cross-cutting.** ADR 0004 applies to EVERY specification and
   implementation ticket: every spec accounts for the security invariants
   relevant to its scope; security regressions are release blockers.
3. **Provider boundary.** `AgentManager` remains the provider-neutral entry
   point. The renderer/UI must not become generally coupled to Claude- or
   Cursor-specific runtime behavior; provider differences surface through
   normalized capabilities/state wherever possible.
4. **Session model.** `Workspace → Session → execution root`. Plain session
   is the default; worktree-backed session is opt-in. No task-centric
   redesign.
5. **Migration distinction.** Limboo → ZEUS external migration is NOT
   supported in v1 (ADR 0005). ZEUS's own schema/settings migrations ARE
   supported when required. Every storage/settings specification documents
   its migration/version behavior.
6. **Impeccable requirement.** Any specification containing UI/UX decisions
   MUST use the `impeccable` skill before those UI/UX decisions are finalized.
   The spec captures: UX goals; layout/interaction decisions; accessibility
   requirements; design-system constraints; important states/edge cases; the
   outcome of the Impeccable review.

## Specification workflow and ordering

`to-spec` produces specifications only — this ordering is the specification
workflow, not permission to implement.

### Phase 1 — Infrastructure prerequisites

1. **ZEUS storage identity** (ADR 0005) — `app.setName('zeus')` before any
   persistence-touching boot code; DB filename `limboo.db` → `zeus.db`;
   verify all userData-relative paths (`secrets/`, `worktrees/`,
   `attachments/`, window-state) resolve under the new root; no migration.
2. **Voice removal** — one dedicated cleanup change before feature work:
   `managers/voice/`, `shared/voice-models.ts`, `sherpa-onnx-node` dep, voice
   IPC channels, preload namespace, renderer UI/store, settings category, and
   the related `SETTINGS_VERSION` migration handling. No feature flag.
3. **TypeScript 4.5 → 5.x (bounded)** — narrow scope, no unrelated churn,
   runtime behavior preserved (esbuild-bundled), validated by build/lint/
   tests; goal: `tsc --noEmit` runs successfully.
4. **Vitest foundation** — first targets: `graph/builder.ts`,
   `telemetry/accumulator.ts`, `src/shared/refName.ts` (fuzz vs real `git
   check-ref-format`), `SettingsManager.normalize`, git arg/ref parsers.
5. **CI verification gates** — minimal CI runs build + lint + tests; grows
   with the test suite; the `vite build + eslint`-only era ends here. This
   deliverable also replaces the paused Dependabot configuration with the
   ZEUS-native monthly/security-driven policy.
6. **Release-pipeline isolation** (ADR 0006) — remove `.gitlab-ci.yml`
   release stage + `v*` triggers, Bitbucket publish pipelines, GH Actions
   release workflows; keep minimal lint/build CI; preserve generic
   artifact-validation logic as reference.

### Phase 2 — Product / architecture specifications

7. **Session/worktree defaults** — canonical model:
   `Workspace → Session → {conversation, terminal, agent run, checkpoints,
   execution root}`. Plain session is the default (execution root = workspace
   directory); worktree-backed sessions are explicit opt-in. Preserve
   `resolveSessionRoot` behavior; change the *product defaults*, not the
   resolver. No task-centric rework.
8. **Provider/runtime boundary contract** (ADR 0003) — AgentManager seam
   frozen as the only provider entry; new providers (incl. local models,
   later) enter as adapters only; parity (permissions, context, resume)
   checked against `decideToolUse`.
9. **Security invariants as cross-cutting requirements** (ADR 0004) — the
   eleven hardening patterns and three permission layers are non-negotiable
   constraints on every spec; security regressions are release blockers.
10. **Verification architecture integration** (ADR 0007) — how the Vitest
    foundation, CI gates, and the pure-module discipline attach to product
    specs; prioritizing security-sensitive parsing, git argument
    construction, state normalization, graph construction, telemetry
    accumulation, provider-independent logic.

### Specification template

Every `to-spec` output contains, in this order:

- Problem
- Scope
- **Non-goals** (mandatory)
- Current architecture
- Applicable ADR / decision
- Detailed behavior
- Files/modules affected
- Data/migration impact
- Security impact (mandatory content — see the Security-impact contract below)
- Windows-specific behavior
- UI/UX impact
- Impeccable review requirements, when applicable
- Verification plan
- Acceptance criteria
- Dependencies
- Known risks

#### Security-impact contract (mandatory)

Every `Security impact` section must do both of the following:

1. **Enumerate the security-relevant surfaces the change touches**, checking
   each of: IPC channels added/changed; process spawn argv construction; SQL
   statements; path joins/resolution; merges/keying of renderer-supplied
   objects; secrets handling; outbound network; permission/sandbox posture.
2. **Map each touched surface to the governing invariant ID** in
   `docs/security/invariants.md` (the canonical operational reference), stating
   how the change preserves it.

If nothing is touched, the section must literally declare
`no security-relevant surface touched` plus a one-line justification — a bare
"none" is not acceptable, and the declaration is a positive claim reviewers may
contest. Any change that weakens an invariant is a **release blocker** under
the regression protocol in `docs/security/invariants.md` — not a follow-up
ticket.

## Deferred scope — future work requiring future decisions/specifications

These stay out of v1 specifications; none may leak into Phase 1/2 specs:

- Ollama / LM Studio / local model adapters
- Advanced Electron E2E coverage
- ZEUS visual rebrand (storage identity already decoupled — ADR 0005)
- ZEUS-native release publishing
- Cursor Cloud Agents
- ACP adapter
- Merge-conflict UI
- Stash
- Tree-sitter symbol extraction
- Vector embeddings
- File-writer history → session timeline

---

## Standing risks to carry into specs

1. **No tests exist yet** — until the Vitest foundation lands, every change
   is verified by build/lint only; keep changes small and review-heavy.
2. **Type-checking is impossible until TS 5** — esbuild transpiles but never
   checks; the upgrade is the gate for enforceable correctness.
3. **Limboo product assumptions surface in UI copy, docs, and the shell** —
   each spec must sweep for them in its own surface rather than a single
   big-bang pass.
4. **Windows is the primary validation target** (ADR 0002) — specs that touch
   spawning, paths, shims, or updates must state their Windows behavior
   explicitly.
5. **`SETTINGS_VERSION` churn** — voice removal and any storage/identity work
   touch settings migrations; each spec must pin the resulting version and
   migration steps.

## What `to-spec` should produce first

One spec per architectural work item (1–6 above), in the suggested
infrastructure-first order, each referencing its ADR, its files-of-interest,
its Windows behavior, and its verification plan. `to-tickets` follows from
those specs; no tickets exist yet by design.
