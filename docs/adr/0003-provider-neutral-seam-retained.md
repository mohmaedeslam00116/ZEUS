# ADR 0003 — Provider-neutral agent seam retained; Claude + Cursor primary

- **Status:** Accepted
- **Date:** 2026-09-16
- **Context:** Round 1 grilling — agent/provider strategy

## Context

Limboo's `AgentManager` is a narrow adapter seam: health probe, run(spec) →
AsyncIterable, wire-format → neutral event translation, per-provider
permission translation, resume tokens, and one shared permission decision
core (`decideToolUse`). Two adapters exist today (Claude Agent SDK, Cursor
CLI print-mode) plus a consent-gated harness path.

Alternatives considered: making the third-party `@ai-sdk/harness` the
primary runtime, or redesigning around N providers including local models
(Ollama/LM Studio) from day one.

## Decision

Keep the current seam and both adapters as primary. Local providers are a
future adapter, not a v1 architectural redesign. The seam is preserved and
strengthened, never bypassed.

## Consequences

- Adding a provider (including local models) must happen as a new adapter
  behind the existing seam — no provider conditionals above it.
- The harness path stays available but is not the primary runtime.
- Adapter parity (permissions, context injection, resume) remains a per-
  adapter obligation, checked against the shared decision core.
