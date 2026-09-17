# ZEUS shell — Impeccable audit + alpha fix-list

- **Ticket:** Wayfinder #27 (Prototype — audit/decision, not implementation)
- **Date:** 2026-09-17 · baseline `5a9fb30`
- **Destination served:** Windows-only closed alpha → first distributable ZEUS → *unmistakably ZEUS*
- **Posture honored:** no full redesign before first contact; highest-value minimum only. Dark-only token system is a **constraint**, not a finding.

## Method & limitations (read first)

- **Static code audit** of the real renderer shell (`src/renderer/**`, tokens, assets, main-process user-visible strings). The application was **not run**; no live screenshots were captured. The Limboo-era PNGs in `assets/screenshots/` document layout but are not current-state proof and are themselves an identity surface (row A5).
- The `impeccable` skill's bundled support files (`scripts/context.mjs`, `reference/audit.md`, `reference/critique.md`, PRODUCT.md/DESIGN.md flow) are **not present in this repository** (`.agents/skills/` does not exist here). The audit applies the skill's loaded methodology — contrast rules, absolute bans, slop test, product register — from its SKILL.md. This is a genuine but partial execution of the Impeccable workflow; live browser iteration (`impeccable live`) and its heuristic scoring were **not possible**. Creating PRODUCT.md/DESIGN.md via `impeccable init`/`document` is recommended when implementation begins (row C6).
- Contrast values are computed from the token hex values (`index.css:14-44`); rendered AA verification belongs on the L3 Windows checklist.
- **No design decisions are made here.** Mark/brand choices belong to the identity-package decision (#29). This audit bounds *what must change*, not *what the new design is*.

## Audit findings by coverage area

**Visual hierarchy — strong.** Deliberate two-layer shell: persistent chrome on pure black (`--color-base #000`), working area as one floating card (`bg-surface`, 6px radius, bordered — `AppShell.tsx:88`). Flat, disciplined token ramp (`base → surface → surface-2 → elevated`, `index.css:14-20`); no nested-card patterns, no ghost-card tells (no `border-radius >16px` hits; shadow use is restrained). Evidence of craft, not template.

**Information architecture / navigation — strong.** The title-bar search box is the declared universal entry (VSCode-style, `TitleBar.tsx:37-58`) with typewriter placeholders; drawer widths per tab are remembered separately (`AppShell.tsx:44-46`); terminal column has a presentational clamp that refuses to rewrite the user's persisted intent (`AppShell.tsx:29-31`, `TERMINAL_MAX_FRACTION`). Resize areas double as grab areas with the gutter as affordance (`AppShell.tsx:83`).

**Empty states — strong.** `EmptyState.tsx` is a purpose-built component (background-less glyph per theme rule, title/description/actions, compact variant for drawers). Welcome/empty copy exists at `CenterWorkspace.tsx:154,188`.

**Loading states — strong.** Full-window `LoadingScreen` (pure-black, logo pulse + spinner) prevents white flash; skeleton parts exist (`MessageSkeleton.tsx`); the `ActivationRibbon` is a model of honest loading UX — a *non-blocking* thin line with per-step human labels ("Rebinding the file watcher…") and a single source of truth shared with composer disabling (`ActivationRibbon.tsx:1-40`).

**Error states — strong (trust-positive).** `ErrorBoundary.tsx` renders an on-palette recoverable fallback with **copyable diagnostics** (message + stacks to clipboard, `:46-56`) — exactly the right trust pattern for an alpha. Bridge failures degrade to honest banners (the `MissingWorktreeBanner` idiom is referenced as the house style).

**Onboarding / first-run — adequate for alpha.** In-app workspace creation replaces the native-dialog reflex, with Windows name-guards mirrored client-side (`WorkspaceCreatePanel.tsx:24-35` — illegal chars, reserved names, trailing dot/space) and inline errors. `GitUnavailable.tsx` onboards the missing-`git` case. A guided first-run tour is **not** present and is **not needed** for the alpha (row C7).

**Trust signals — good, with two dents.** Honest-state patterns (above) read as a real product. The dents: (1) the Windows keyboard register is wrong at the most visible spot (row B1); (2) identity still says Limboo everywhere (group A). A tester who sees "Mod P" in a "Limboo" window does not perceive a real ZEUS product.

**Accessibility — mixed, mostly good, two concrete gaps.** Present: 147 `aria-*` attributes, 14 roles, 29 `focus-visible` usages, `IconButton` label prop, `aria-disabled` on the search pill, and **reduced-motion is properly handled twice** (CSS kill-switch `index.css:78-83` *and* a settings-driven `data-reduced-motion` attribute). Gaps: the `--color-faint #6b6b6b` token fails 4.5:1 wherever it carries *readable state copy* (row B2), and streaming-output announcement is unverified (row C5).

**Identity/rebrand surfaces — the work.** See group A; every first-contact surface still says Limboo: wordmark (`Logo.tsx:39`), loading screen (`LoadingScreen.tsx:9`), About (`AboutPanel.tsx:16`), tray (`TrayManager.ts:96`), close dialog (`index.ts:641`), updater copy (`AutoUpdateManager.ts:432-433,476,493,569`), window/taskbar title via `productName` (`package.json:3`; no BrowserWindow `title` override found in `index.ts`), the pink blob mark (`--color-brand #ff0066`, `index.css:38`) and icon assets (`assets/icon.*`, `assets/tray.png`).

---

## Fix-list

### A — Identity / Rebrand

| ID | Item | Evidence | Effort | Owner note |
|---|---|---|---|---|
| A1 | Window/taskbar title still resolves to "Limboo" | `package.json:3` `productName`; no `title:` in the BrowserWindow options (`index.ts`) | **S** | #29 identity package (+ #26 rename touches `productName`) |
| A2 | Wordmark + brand mark are Limboo (pink blob) | `Logo.tsx:2,39`; `assets/icon.ico/.png/.svg`, `tray.png`; `--color-brand #ff0066` (`index.css:38`) | **M** | New mark = #29 decision; wordmark string rides the rename |
| A3 | About panel identity | `AboutPanel.tsx:16` "About Limboo" + hint | **S** | #26 user-visible strings |
| A4 | First-contact copy set (welcome ×2, loading, tray, close dialog, updater notifications ×4, bridge deny messages) | `CenterWorkspace.tsx:154,188`, `LoadingScreen.tsx:9`, `TrayManager.ts:96`, `index.ts:641`, `AutoUpdateManager.ts:432-433,476,493,569`, `hookRunner.cjs:74` | **S** | Mostly #26's user-visible rename; deny messages reach the agent chat stream |
| A5 | Legacy Limboo screenshot assets ship in-tree; packaging status unverified | `assets/screenshots/*.png` (11 files) | **S** | Verify whether packaged; replace or exclude before alpha (#29) |

### B — Alpha-gating fixes (conservative; genuinely first-contact issues only)

| ID | Item | Evidence | Effort | Why it gates |
|---|---|---|---|---|
| B1 | **`Kbd` renders literal "Mod" on Windows** — the always-visible title-bar chip reads "Mod P" instead of "Ctrl P" | `Kbd.tsx:9-16` — `display()` returns the key unchanged off-mac; `TitleBar.tsx:56` passes `['Mod','P']` | **S** | Trust-destroying on the primary platform: the first thing a tester reads looks unfinished |
| B2 | **Faint token carries readable state copy below AA** — placeholder and status text at 3.5:1 (surface-2) / 3.9:1 (base) vs the 4.5:1 floor | token `#6b6b6b` (`index.css:28`); `GlobalSearch.tsx:210` `placeholder:text-faint`, `:213` "indexing N%", `:244`/`:298` "No matches" | **S** | Search is the declared universal entry; illegible state copy is a severe-a11y class issue, and it is cheap: bump those copies to `text-muted` (6.7:1) |

Nothing else observed rises to alpha-gating: layout, states, onboarding, and error surfaces are genuinely strong, and prettier-is-not-gating per the ticket.

### C — Post-alpha backlog

| ID | Item | Evidence / reason | Effort |
|---|---|---|---|
| C1 | Normalize mac-first copy ("Cmd/Ctrl") to platform-conditional phrasing | 13 sites (e.g. `TitleBar.tsx:48`, `MemoryPanel.tsx:190`); cosmetic once B1 lands | **S** |
| C2 | Systematic focus-visible sweep (drag handles, terminal focus, custom rows) beyond the existing 29 usages | Static count can't prove keyboard coverage of every interactive surface | **M** |
| C3 | `limboo-*` CSS classes/vars + `window.limboo` bridge rename | Already decided — #26 internal-namespace purity; listed only as cross-reference, **no new work here** | — |
| C4 | `aria-live` verification for streaming agent output; add if absent | Not verifiable statically; conversation stream is the app's core content | **M** |
| C5 | Guided first-run/onboarding tour | Welcome + create-panel + honest ribbons suffice for an invited alpha; a tour is polish real users need later | **L** |
| C6 | Run `impeccable init`/`document` to create PRODUCT.md/DESIGN.md before any UI implementation ticket | Skill support files absent (see limitations); makes future Impeccable workflows complete | **M** |
| C7 | UX copy pass (clarify) on banners/errors/deny messages | Functionally clear today; tone consistency is polish | **M** |
| C8 | Small-window / min-width behavior QA of the floating-card layout | Requires live runtime; static audit can't verify resize floors | **M** |

---

## Recommended minimum alpha visual bar

A tester perceives **a real ZEUS product** when all of these hold:

1. **Every first-contact surface reads ZEUS** — window/taskbar title, wordmark, loading screen, About, tray, updater copy (A1–A4; brand-*string* level, not brand-*design* level).
2. **No Limboo mark at first contact** — if the new ZEUS mark isn't ready, ship a neutral placeholder glyph rather than the pink blob (interim posture; the actual mark is #29's decision).
3. **Windows-native keyboard register correct** — "Ctrl P", not "Mod P" (B1).
4. **AA contrast on state copy** in the search/palette surfaces (B2).
5. **Existing gates + L3** — all CI gates green, and the L3 Windows checklist gains an identity spot-check row (taskbar label, tray tooltip, About panel).

Total alpha-gating surface: five S items + one M (mark asset) — a small, bounded identity-and-fix pass, exactly the "highest-value minimum" the release strategy calls for.

## Explicit assumptions

- The dark-only token system stays; no theme work is proposed (constraint).
- `productName` is the operative window-title source on Windows (no override found); verify at implementation.
- The rename (#26) and identity package (#29) implement group A; this audit adds no duplicate rename scope.
- Efforts are planning estimates, not commitments; implementation flows through ADR → to-spec → to-tickets.
