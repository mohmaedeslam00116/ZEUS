# ZEUS — Architecture Handoff for `to-spec`

- **Date:** 2026-09-16
- **Status:** Grilling frontier **closed** (Rounds 1–2). All foundational
  decisions recorded. This document is the single input for the
  specification phase.
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

## Work item 1 — Architectural work

These items change or pin the system's structure. Each has an ADR or
architectural decision behind it; `to-spec` turns each into a spec.

1. **ZEUS storage identity** (ADR 0005) — `app.setName('zeus')` before any
   persistence-touching boot code; DB filename `limboo.db` → `zeus.db`;
   verify all userData-relative paths (`secrets/`, `worktrees/`,
   `attachments/`, window-state) resolve under the new root; no migration.
2. **Release-pipeline isolation** (ADR 0006) — remove `.gitlab-ci.yml`
   release stage + `v*` triggers, Bitbucket publish pipelines, GH Actions
   release workflows; keep minimal lint/build CI; preserve generic
   artifact-validation logic as reference.
3. **Session/worktree semantics** — canonical model:
   `Workspace → Session → {conversation, terminal, agent run, checkpoints,
   execution root}`. Plain session is the default (execution root = workspace
   directory); worktree-backed sessions are explicit opt-in. Preserve
   `resolveSessionRoot` behavior; change the *product defaults*, not the
   resolver. No task-centric rework.
4. **Provider/runtime boundaries** (ADR 0003) — AgentManager seam frozen as
   the only provider entry; new providers (incl. local models, later) enter
   as adapters only; parity (permissions, context, resume) checked against
   `decideToolUse`.
5. **Security invariants** (ADR 0004) — the eleven hardening patterns and
   three permission layers are non-negotiable constraints on every spec;
   security regressions are release blockers.
6. **Verification architecture** (ADR 0007) — Vitest foundation as part of
   the architecture, prioritizing security-sensitive parsing, git argument
   construction, state normalization, graph construction, telemetry
   accumulation, provider-independent logic.

## Work item 2 — Infrastructure work

Bounded, ordered enablers — not features:

1. **Voice removal** — one dedicated cleanup change before feature work:
   `managers/voice/`, `shared/voice-models.ts`, `sherpa-onnx-node` dep, voice
   IPC channels, preload namespace, renderer UI/store, settings category, and
   the related `SETTINGS_VERSION` migration handling. No feature flag.
2. **TypeScript 4.5 → 5.x (bounded)** — narrow scope, no unrelated churn,
   runtime behavior preserved (esbuild-bundled), validated by build/lint/
   tests; goal: `tsc --noEmit` runs successfully.
3. **Vitest foundation** — first targets: `graph/builder.ts`,
   `telemetry/accumulator.ts`, `src/shared/refName.ts` (fuzz vs real `git
   check-ref-format`), `SettingsManager.normalize`, git arg/ref parsers.
4. **CI verification gates** — minimal CI runs build + lint + tests; grows
   with the test suite; the `vite build + eslint`-only era ends here.

Suggested order: Voice removal → TS 5 → Vitest foundation → CI gates →
storage identity → release-pipeline isolation → session/worktree defaults.

## Work item 3 — Future / deferred work

Explicitly out of scope for the first spec cycle; do not let them leak into
specs:

- Local-model providers (Ollama/LM Studio) — future adapter behind the seam.
- Advanced Electron E2E coverage — after the unit foundation matures.
- ZEUS visual rebrand — deferred; storage identity already decoupled (0005).
- ZEUS-native release publishing — its own future decision + ADR.
- Previously identified non-v1 capabilities: Cursor Cloud Agents, ACP
  adapter, merge-conflict UI, stash, tree-sitter symbol extraction, vector
  embeddings on BM25, file-writer history → session timeline.

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
