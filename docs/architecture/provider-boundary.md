# Provider boundary contract

**Status:** Frozen per ADR-0003 (2026-09-16). This page is the enforceable
statement of the agent provider seam: what the renderer may consume, what an
adapter must implement, and how the CI gate (`scripts/check-provider-neutrality.mjs`)
polices the renderer side.

## The boundary

```text
Provider-specific implementation        src/main/managers/cursor/**, managers/harness/**,
        ↓                               managers/agent/providerBridge.ts consumers
Provider/runtime boundary               start(spec, bridge) + ProviderRunBridge
        ↓
Normalized application state            AgentEvent / AgentState / RuntimeSnapshot (src/shared/types.ts)
        ↓
IPC / preload boundary                  agent:* channels → window.limboo.agent (contextIsolated)
        ↓
Renderer                                useAgentStore + Composer / permission / plan / timeline UI
```

The renderer consumes the **normalized contract only**. It has no import path
into `src/main/**` — agent state reaches it exclusively through the preload
bridge, typed by the shared types below. A third adapter can be added without a
renderer edit: it registers in `agent/harnessRegistry.ts`, translates its wire
format into `ProviderRunBridge` calls, and its declared capabilities drive the
existing UI.

## Frozen surface (stable contract — changes require an ADR)

| Surface | Location |
| --- | --- |
| `AgentEvent` (the render stream) | `src/shared/types.ts` |
| `AgentState` (per-session agent state) | `src/shared/types.ts` |
| `PermissionRequest` (approval flow) | `src/shared/types.ts` |
| `SessionPermissionMode` | `src/shared/types.ts` |
| Agent IPC channels (`agent:*`, plan + diagnostics included) | `src/shared/ipc-channels.ts` |
| Preload agent namespace (`window.limboo.agent`) | `src/preload/index.ts` |
| `useAgentStore` (normalized renderer agent state) | `src/renderer/stores/useAgentStore.ts` |
| Composer, permission dialog, plan, timeline UI | `src/renderer/features/**` |

Runtime telemetry rides the same shape: main stamps
`PROVIDER_CAPABILITIES` / `CAPABILITY_NOTE` onto every `RuntimeSnapshot`
(`src/shared/runtime.ts` — main-only exports; the renderer reads
`snapshot.capabilities` and nothing else).

## Adapter seam inventory (the future-provider checklist)

Everything a new provider runtime must provide. The two shipped adapters
(Cursor CLI, AI-SDK harnesses incl. Claude) are the reference implementations.

| Seam member | Artifact |
| --- | --- |
| Registration / descriptor | `src/main/managers/agent/harnessRegistry.ts` (`HarnessDescriptor`: id, provider, module, `settingsShape`, `needsSandbox`, `envKeys`, `capabilities`) |
| Run entry | `start(spec, bridge): Promise<RunHandle>` — `cursor/CursorRuntime.ts`, `harness/HarnessRuntime.ts` share the exact signature |
| Reporting contract | `src/main/managers/agent/providerBridge.ts` (`ProviderRunBridge`). **Extension rule: new members must be OPTIONAL** so an older runtime keeps compiling untouched |
| Wire-format translation | adapter-internal (`cursor/stream.ts` + `cursor/translate.ts`, `harness/translate.ts`) → bridge calls |
| Options/settings shape | `harness/adapterSettings.ts` (`settingsShape` tag); adapter builds its own options from normalized settings |
| Permission mapping | adapter translation **into** the single decision core `decideToolUse`; adapters may only TIGHTEN (Cursor's deny-first floor is the canonical example). Per-adapter permission translation is re-validated on adapter changes |
| Resume tokens | per-(session, provider) rows in `agent_provider_sessions` (schema v12); adapter supplies get/set |
| Error classification | adapter maps raw errors into the structural Classification shape (`cursor/errors.ts` ↔ AgentManager's classifier; `harness/errors.ts` for refusals) |
| Capability declaration | `HarnessDescriptor.capabilities` (`gatesReads`, `gatesBuiltins`, `subagents`, `plan`, `vision`, `tokenUsage`) + `PROVIDER_CAPABILITIES` |
| Health/availability probe | availability + auth diagnostics feeding the Settings surface (`agent:getDiagnostics` path) |

An adapter that cannot gate its built-in tools (`gatesBuiltins: false`) is
**refused at preflight** (`HarnessUngatedError`) — it gets no models and no runs.
`decideToolUse` remains the single permission decision core for every adapter.

## The capability rule

Provider-conditional behavior in the renderer may be expressed **only** as
declared capabilities consumed from normalized state. Branching on a provider id
in renderer decision contexts is forbidden — that is the shape which historically
precedes bypassing normalized permission/capability state. The neutrality gate
enforces this mechanically (below). Table-driven presentation
(`HARNESS_LABELS` / `PROVIDER_HARNESS` lookups, e.g. `features/agent/status.ts`)
is the sanctioned idiom: data, not branches.

## Renderer neutrality gate

`node scripts/check-provider-neutrality.mjs` runs in the CI `validate` job.
It fails when `src/renderer/**`:

1. **imports from `src/main/**`** (AgentManager, `managers/cursor/**`,
   `managers/agent/**`, `managers/harness/**`, anything main-side); or
2. **branches on a provider id literal** (`===`/`!==`/`case` against
   `claude`, `cursor`, `anthropic`, `claude-code`, `cursor-cli`, `openai`, `pi`)
   — comparisons only, so provider names in labels/keywords/copy are not
   violations.

### Reviewed allowlist

Each entry is pre-existing code, reviewed in #15, justified inline in the
script. The gate keys on exact file paths; an entry must be re-reviewed on any
refactor. Mirroring the script:

| File | Why it exists |
| --- | --- |
| `features/git/GitPanel.tsx` | pre-existing connectivity gate picking which normalized readiness signal (install probe vs lifecycle) feeds the commit-message button; capability refactor deferred |
| `features/workspace/Composer.tsx` | same shape — send-enablement gate over normalized install/lifecycle state |
| `features/workspace/ComposerBanner.tsx` | provider-named banner copy for rate-limit/auth lifecycle states; presentation, not permission logic |
| `features/settings/panels/AgentPanel.tsx` | Settings › Agent is BY DESIGN provider-visible (the user configures providers there); no runtime state branches |
| `components/brand/ProviderIcon.tsx` | brand glyph per provider — pure presentation mapping |

Adding an exception: edit the script's `ALLOWLIST` with an inline justification
**and** this table, in the same change. Never weaken the patterns.

## Explicitly out of the gate's scope

- **Seam-interior plumbing.** The Windows exec plumbing (`cursor/exec.ts`
  %LOCALAPPDATA% layout resolver, ComSpec shim whitelist) lives INSIDE the
  seam; the renderer never sees it, so renderer neutrality does not apply.
- **Main-side conditionals.** Provider conditionals above the seam in
  `src/main/**` stay a review-discipline item — the gate is a renderer
  contract, not a main-process linter.
- The `cursor` word in benign contexts (terminal cursor style, text cursors,
  CSS) — the narrow comparison-only patterns exist precisely so these never
  trip the gate.
