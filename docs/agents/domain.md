# Domain docs — single-context

This repository uses the **single-context** layout: one domain document and one
ADR directory at the repo root.

| Artifact     | Location    | Status                                  |
| ------------ | ----------- | --------------------------------------- |
| `CONTEXT.md` | repo root   | Exists — ZEUS glossary (living).        |
| ADRs         | `docs/adr/` | Exists — `0001`–`0007` accepted.        |

## What lives where

- **`CONTEXT.md`** — the domain model: vocabulary, entities, invariants, and how
  concepts relate. It is a map, not a spec; keep it short and current.
- **`docs/adr/`** — numbered Architecture Decision Records (`0001-title.md`),
  each recording context → decision → consequences. Append-only: supersede with
  a new ADR, never rewrite history.
- Long-form architecture narrative already lives in
  [`CLAUDE.md`](../CLAUDE.md), [`project.md`](../project.md), and
  `docs/architecture/` — the domain docs point at these; they do not duplicate
  them.

## Consumer rules (for skills and agents)

1. Before implementing anything that touches domain concepts, read `CONTEXT.md`
   if it exists; use its exact vocabulary in code, comments, tests, and UI copy.
2. When a task depends on a past decision, check `docs/adr/` for a relevant ADR
   before asking the user or guessing.
3. When you make a significant, hard-to-reverse decision — schema shape, an IPC
   channel contract, security posture, a new kind of outbound network request —
   record it as a new ADR in `docs/adr/`, and update `CONTEXT.md` if the
   terminology changed.
4. If `CONTEXT.md` does not exist and you have just had to explain the domain to
   yourself, that is the moment to create it: seed it from what you learned,
   cross-linking `CLAUDE.md` / `project.md` rather than copying them.
