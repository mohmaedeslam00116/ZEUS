# Spec 8 — Provider/Runtime Boundary Contract

- **Phase:** 2 (Product/architecture specifications, item 8)
- **Applicable ADR / decision:** ADR-0003 (closed) — provider-neutral seam
  retained; Claude + Cursor primary; new providers enter as adapters only
- **Status:** Draft for review — specification only

## Problem

The provider seam exists and is dual-use (Claude SDK + Cursor CLI), but its
rules live partly as prose in `CLAUDE.md` (which still frames the adapter
architecture as "IN PROGRESS" with Cloud Agents/ACP "later"). ZEUS needs the
boundary to be an explicit, *enforceable* contract: what is frozen, where
provider awareness may live, and how provider differences may be represented
— so that renderer/UI code never becomes generally coupled to Claude- or
Cursor-specific runtime behavior, and so a future adapter has a checklist
instead of archaeology.

## Scope

- Codify the provider-boundary contract as documentation anchored in code
  structure: frozen types, the adapter seam inventory, the capability model,
  and the single sanctioned home for provider-aware presentation.
- Add a CI-enforceable neutrality gate (static check) that fails when
  renderer code reaches past the seam.
- Update inherited docs to the ZEUS framing (seam frozen per ADR-0003).

## Non-goals

- No new provider/adapter (local models, Cloud Agents, ACP — deferred).
- No harness-path promotion or removal.
- No changes to `AgentEvent` / `AgentState` / `PermissionRequest` /
  `SessionPermissionMode` (frozen surface).
- No AgentManager refactor or file split.
- No UI changes.

## Current architecture (verified)

- **The seam** (`CLAUDE.md` §8, verified against `src/main/managers/`):
  `AgentManager` concentrates provider coupling — `probeHealth`, `run(spec)`,
  `buildOptions`, wire translation (`handleMessage`), the shared permission
  decision core `decideToolUse`, resume tokens (`agent_provider_sessions`,
  provider-keyed), `classifyAgentError`. Cursor's side lives in
  `managers/cursor/*` (runtime/stream/translate/errors/permissions/hooks/
  mcpConfig/sandbox) over the token-authed bridge pipe.
- **Capability model precedent:** `PROVIDER_CAPABILITIES` /
  `CAPABILITY_NOTE` in `src/shared/runtime.ts` are stamped by MAIN onto
  `RuntimeSnapshot`; the renderer reads `snapshot.capabilities` and *never
  the provider id*. Main-only capability tables — importing them into
  `src/renderer/**` is the documented review-catchable mistake.
- **Sanctioned provider-aware presentation:** `features/agent/status.ts`
  (`agentDisplayName()`, status meta) is the small shared module for
  provider-aware copy.
- Frozen neutral surfaces: shared types, agent IPC channels, preload
  namespace, `useAgentStore`, Composer/permission/plan/timeline UI.

## Applicable ADR / decision

ADR-0003: the seam is preserved and strengthened, never bypassed; provider
differences surface through normalized capabilities/state wherever possible.

## Detailed behavior

1. **Contract document** — new `docs/architecture/provider-boundary.md`
   (linked from `overview.md` + `agent-manager.md`), containing:
   - The frozen surface list (types/channels/preload namespaces above).
   - The adapter seam inventory (what a new adapter MUST implement:
     probe, run, translate, permission mapping into `decideToolUse`, resume
     token get/set, error classification, capability declaration) — the
     future-provider checklist.
   - The capability rule: provider-conditional behavior is expressed ONLY as
     declared capabilities consumed via normalized state (the
     `PROVIDER_CAPABILITIES` idiom generalized); provider-id conditionals in
     the renderer are forbidden.
   - The single sanctioned exception for presentation copy
     (`features/agent/status.ts`).
2. **Neutrality gate** — new `scripts/check-provider-neutrality.mjs`:
   fails when `src/renderer/**` (a) imports from
   `src/main/managers/cursor/**`, `src/main/managers/agent/**`,
   `src/main/managers/AgentManager`, or (b) references provider id literals
   (`'claude'`/`'cursor'` in provider-decision contexts) — with a small,
   reviewed allowlist (shared `runtime.ts` capability constants;
   `features/agent/status.ts`; `shared/subagents.ts` tool-name table which is
   provider-shape normalization, not coupling). Wired into the CI `validate`
   job (coordinate the step addition with Spec 5's CI baseline).
3. **Main-side rule** (documented, not new code): capability tables remain
   main-only; anything the renderer needs about a provider must arrive as
   stamped normalized state.
4. **Doc alignment:** `CLAUDE.md`'s adapter section header moves from "IN
   PROGRESS" to the ZEUS framing (seam frozen per ADR-0003; remaining
   adapter ideas are deferred scope); `docs/agents/cursor-integration.txt`
   gets a header note (historical research input).

## Files/modules affected

- `docs/architecture/provider-boundary.md` (new) + links from
  `docs/architecture/overview.md`, `subsystems/agent-manager.md`
- `scripts/check-provider-neutrality.mjs` (new)
- `.github/workflows/ci.yml` (one gate step, coordinated with Spec 5)
- `CLAUDE.md`, `docs/agents/cursor-integration.txt` (status notes)

## Data/migration impact

None.

## Security impact

- `decideToolUse` remains the single permission decision core for all
  providers; the contract documents that per-adapter permission translation
  may only *tighten* (Cursor's deny-first floor + hooks-tighten-only rule is
  the canonical example) and must be re-validated per adapter.
- The neutrality gate is itself a security control: renderer-side provider
  branching is the shape that historically precedes bypassing normalized
  permission/capability state. Gate additions must not weaken the existing
  CI security-invariants step.
- No new IPC, network, or permission surface.

## Windows-specific behavior

- Cursor's Windows exec plumbing (native `%LOCALAPPDATA%\cursor-agent` node
  layout resolution, `.cmd` shim ComSpec whitelist, registry-PATH blindness
  workaround) is seam *interior* — explicitly out of the neutrality gate's
  scope and documented as such in the contract.

## UI/UX impact

None — no visual or interaction change; the contract constrains future UI
work (provider awareness only via capabilities/status module).

## Impeccable review requirements

Not applicable (no UI/UX decisions).

## Verification plan

- Seeded-violation test: temporarily add a `cursor` import to a renderer
  file → gate fails in CI → remove.
- Full grep audit of current `src/renderer/**` passes the gate (proves the
  allowlist matches reality).
- Contract doc reviewed line-by-line against the code inventory (no invented
  architecture).

## Acceptance criteria

1. `docs/architecture/provider-boundary.md` exists and matches the code.
2. Neutrality gate runs in CI and demonstrably catches violations.
3. Frozen-surface list and adapter checklist are explicit.
4. Inherited docs no longer describe the seam as in-progress.

## Dependencies

After Spec 5 (CI baseline) — the gate step rides the validate job. No Phase-2
product spec may introduce renderer provider coupling from this point.

## Known risks

- Literal-matching gates can false-positive on benign uses of the words
  (`provider`, `claude`, `cursor` in unrelated contexts) — mitigated by
  narrow patterns (imports + decision-context literals) and the reviewed
  allowlist; the gate must fail loudly on its own patterns, never on
  annotated exceptions.
- "Frozen" is a governance claim, not a technical wall — the gate covers the
  renderer side; main-side drift (e.g. new provider conditionals above the
  seam) remains a review-discipline item, documented in the contract.
