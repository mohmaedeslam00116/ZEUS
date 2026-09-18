# AGENTS.md

Agent entry point for this repository — applicable to any AI coding agent
(Claude, Codex, Cursor, etc.).

> **Read [`CLAUDE.md`](CLAUDE.md) first.** It is the full operational contract
> for working here: what Zeus is, the tech stack, the renderer/preload/main
> process boundaries, theming rules, security invariants, the release process,
> and what is and isn't built yet. When this file and `CLAUDE.md` disagree about
> current reality, `CLAUDE.md` wins.

## Documentation authority

- **Current implementation reality:** `CLAUDE.md` is the detailed code-level
  contract describing the inherited/current implementation of the codebase.
- **ZEUS architectural decisions:** `CONTEXT.md` + accepted ADRs
  (`docs/adr/0001`–`0007`) are authoritative for ZEUS architectural decisions.
- **Architecture narrative:** `docs/architecture/` explains the existing
  architecture and implementation rationale.
- **Product/specification decisions:** the ZEUS specification/handoff
  documents under `docs/superpowers/specs/` define the approved ZEUS scope for
  the specification phase.

**Critical rule:** a closed ZEUS ADR must not be silently overridden by an
inherited Zeus statement in `CLAUDE.md`, `project.md`, or older architecture
documentation. If an inherited document conflicts with an accepted ZEUS ADR,
treat the conflict as documentation drift to be resolved explicitly — not as
permission to reopen the ADR.

**Inherited UI content:** UI layout/content described in `project.md` and
other Zeus-era documentation (left Sessions, center Conversation/Agent
Output, right Activity/Files/Changes, and similar) is a reference for the
current implementation only. It must be validated for ZEUS before being
treated as an approved ZEUS design; the `## UI/UX Design` rule below remains
authoritative for any ZEUS UI/UX decision.

**Security:** [`docs/security/invariants.md`](docs/security/invariants.md) is
the canonical invariant list. Every ticket's Security-impact section follows
the Security-impact contract there, and the regression protocol applies: any
change that weakens an invariant is a release blocker, not a follow-up ticket.

**Verification:** [`docs/development/verification.md`](docs/development/verification.md)
is the canonical ladder (L0–L4) and change-class mapping; every ticket's
Verification plan names its rungs with concrete cases.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `mohmaedeslam00116/ZEUS`, driven via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical five-role triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## UI/UX Design

Any non-trivial UI/UX decision, redesign, new interface, interaction change,
visual refinement, navigation change, accessibility change, or user-facing
design decision MUST use the `impeccable` skill.

This applies to:

- layout
- navigation
- information architecture
- visual hierarchy
- typography
- spacing
- colors
- contrast
- components
- forms
- dialogs
- settings
- onboarding
- empty/loading/error states
- animations and motion
- interaction patterns
- responsive behavior
- accessibility
- design-system changes
- visual polish
- user-facing UX behavior

### Required workflow

1. For a new UI, use Impeccable during the design/shape phase before
   implementation.
2. For a significant change to an existing UI, first use Impeccable to
   critique/audit the current interface.
3. For visual refinement or polish, use the appropriate Impeccable refinement
   workflow.
4. Record important UI/UX decisions and constraints in the relevant
   specification.
5. Preserve approved ZEUS design decisions unless an explicit new decision
   changes them.
6. Backend, infrastructure, database, security, or agent-runtime work does not
   require Impeccable unless it changes the user-facing experience.
7. Do not duplicate the Impeccable methodology inside `AGENTS.md`; the skill
   itself remains the source of detailed methodology.

### Specification requirement

Any `to-spec` specification containing UI/UX decisions MUST use the relevant
Impeccable workflow before those decisions are considered final. The
specification must capture, where applicable:

- UX goals
- layout and interaction decisions
- accessibility requirements
- design-system constraints
- important states and edge cases
- the outcome of the Impeccable review
