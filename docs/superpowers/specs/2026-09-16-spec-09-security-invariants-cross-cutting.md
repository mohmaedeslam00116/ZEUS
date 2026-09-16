# Spec 9 — Security Invariants as Cross-Cutting Requirements

- **Phase:** 2 (Product/architecture specifications, item 9)
- **Applicable ADR / decision:** ADR-0004 (closed) — security model preserved
  unchanged; deny-by-default; security regressions are release blockers
- **Status:** Draft for review — specification only

## Problem

ADR-0004 makes the eleven hardening patterns and three permission layers
non-negotiable, and the handoff makes security cross-cutting for EVERY spec
and ticket. But "cross-cutting" needs an operational form: a canonical,
enumerated invariant list with enforcement anchors, a concrete definition of
what each spec's `Security impact` section must contain, and the regression
protocol that makes "release blocker" real. Without this, the section
degenerates into boilerplate.

## Scope

- Author the canonical security-invariants reference: every invariant →
  mechanism → enforcement anchor (code pattern, CI step, or test post-Spec-4)
  → verification method.
- Define the mandatory content contract for the `Security impact` section of
  every ZEUS spec and implementation ticket.
- Define the ADR-0004 regression protocol (review gates, blocker semantics).
- Audit the inherited CI "Electron security invariants" step: what it asserts
  today, and which invariants lack an anchor.

## Non-goals

- No code changes and no new security tooling beyond the one consistency
  script below.
- No threat-model redesign, no pen-test program, no new security deps.
- No weakening, re-scoping, or "rationalizing" of any existing pattern.

## Current architecture (verified)

- `docs/architecture/security-model.md`: the eleven patterns (process
  isolation, sender validation, deny-by-default permissions, nav/webview
  lockdown, CSP, argv-only spawn + shim whitelist, path-traversal guards,
  bound SQL, prototype-pollution filters, redaction, safeStorage) + input
  caps; three permission layers (decision core / provider translation / OS
  sandbox floor with `crownJewelPaths()`).
- `CLAUDE.md` §6: contracts for new code (same rules, agent-facing).
- `.github/workflows/ci.yml` `validate` job includes an inherited
  **"Electron security invariants"** step (exact assertions to be audited in
  implementation) — the enforcement anchor that already exists.
- Post-Spec-4: unit suites for ref sanitization, git arg construction,
  settings normalization become enforcement anchors.

## Applicable ADR / decision

ADR-0004 and the handoff's binding rule 2 (ADR 0004 applies to EVERY
specification and implementation ticket).

## Detailed behavior

1. **New `docs/security/invariants.md`** — the canonical table. Each entry:
   invariant statement, where it is enforced (file/pattern), enforcement
   anchor (CI step / test / review), how to verify a change preserves it.
   Includes the Windows-specific invariants (ComSpec shim whitelist, native
   cursor-agent layout resolver, path-separator/casing joins, MAX_PATH
   clamps) and the outbound-network rule (SSRF allowlist, resolve+check
   before connect) and the three-layer crown-jewel rule.
2. **`Security impact` section contract** (added as guidance to the spec
   template in the handoff): the section must (a) enumerate the
   security-relevant surfaces the change touches — IPC channels added/
   changed, spawn argv construction, SQL statements, path joins/resolution,
   merges or keying of renderer-supplied objects, secrets handling, outbound
   network, permission/sandbox posture — and (b) map each to the governing
   invariant from `invariants.md`. Writing "none" requires the explicit
   justification "no security-relevant surface touched", which reviewers may
   contest.
3. **Regression protocol:** any diff that weakens an invariant (guard
   loosened, validation skipped, allowlist widened, sandbox floor breached,
   secret path added) is a **release blocker**: merge is refused until
   resolved or an explicit ZEUS ADR amends the model — a "follow-up ticket"
   is not an acceptable resolution. Protocol documented in `invariants.md`
   and referenced from `AGENTS.md` (one line, authority-model compliant).
4. **Crown-jewel consistency script** — `scripts/check-crown-jewels.mjs`:
   asserts the three consumers of the crown-jewel path set
   (`AgentManager` decision core, Cursor declarative deny rules,
   `sandbox/policy.ts` floor) resolve the SAME logical set (guards against
   exactly the drift class ADR-0005's DB rename could cause). Wired into CI
   `validate` alongside the existing security-invariants step.
5. **Audit the inherited security-invariants CI step:** document what it
   asserts; extend it only with cheap structural checks (like #4); missing
   anchors are logged in `invariants.md` as "review-enforced" rows.

## Files/modules affected

- `docs/security/invariants.md` (new), `docs/architecture/security-model.md`
  (link), `AGENTS.md` (one-line pointer)
- `scripts/check-crown-jewels.mjs` (new) + `.github/workflows/ci.yml`
  (one step, coordinated with Spec 5)
- Handoff doc: `Security impact` guidance appended to the template section

## Data/migration impact

None.

## Security impact

This spec *is* the security process artifact; it adds no runtime surface and
weakens nothing. Its own additions (a script, CI step) are read-only checks.

## Windows-specific behavior

Windows invariants are first-class rows in the table (shim whitelist, exec
layout resolver, path semantics, update-feed signing posture notes
inherited from `docs/operations/auto-update.md`).

## UI/UX impact

None.

## Impeccable review requirements

Not applicable.

## Verification plan

- Apply the new `Security impact` contract retroactively to Specs 1–8 as a
  validation exercise (each already enumerates surfaces; gaps fixed).
- Crown-jewel script green in CI; seeded drift (temporarily rename the DB in
  one consumer) makes it fail.
- Invariants table reviewed against code line-by-line.

## Acceptance criteria

1. `docs/security/invariants.md` is the canonical, anchor-mapped list.
2. The `Security impact` contract is part of the spec template guidance.
3. Regression protocol (blocker semantics) is documented and referenced from
   `AGENTS.md`.
4. Crown-jewel consistency is CI-enforced.

## Dependencies

After Spec 5 (CI baseline) and Spec 8 (same CI coordination pattern);
applies to all Phase-2 and future specs immediately upon merge.

## Known risks

- Checklist theater (uncontested "none" declarations) — mitigated by the
  surface-enumeration requirement and reviewer authority to contest.
- Doc/code drift over time — mitigated by anchor mapping (every invariant
  must name a CI/test/review anchor that fails when the invariant breaks).
