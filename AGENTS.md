# AGENTS.md

Agent entry point for this repository — applicable to any AI coding agent
(Claude, Codex, Cursor, etc.).

> **Read [`CLAUDE.md`](CLAUDE.md) first.** It is the full operational contract
> for working here: what Limboo is, the tech stack, the renderer/preload/main
> process boundaries, theming rules, security invariants, the release process,
> and what is and isn't built yet. When this file and `CLAUDE.md` disagree about
> current reality, `CLAUDE.md` wins.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `limboo-ai/limboo`, driven via the `gh` CLI. See `docs/agents/issue-tracker.md`.

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
