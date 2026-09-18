# ADR 0011 — Arabic Localization & RTL Layout Architecture: Canvas-Only RTL by Default, Full Mirror Optional

- **Status:** Accepted
- **Date:** 2026-09-18
- **Context:** Wayfinder Issue #42, Prototype Ticket #43 — Arabic Localization Strategy

## Context

ZEUS v0.2.0 introduces bidirectional localization, supporting Arabic alongside English. In desktop IDEs and coding agent shells, the relationship between natural language text and programming language code creates a unique UX challenge:
1. Programming languages, file tree paths, terminals, and git diffs are strictly LTR and English-centric.
2. Software engineers possess deeply ingrained muscle memory for IDE layout (sessions/file tree anchored to the left, primary action controls).
3. A full window mirror (Sessions on the far right, activity rail on the far left) inverts this muscle memory and creates visual zigzagging when scanning from left-to-right code to a right-anchored sidebar.

Three architectural prototype variants were evaluated on `prototype/rtl-design-system`:
- **Variant A (Full Architectural Mirror):** Entire window flips `dir="rtl"`.
- **Variant B (Canvas-Only RTL / Fixed Frame):** Shell frame remains anchored to standard developer positions (sessions on left, activity rail on right); conversation, modals, drawer content, and settings render in RTL with Arabic typography.
- **Variant C (Adaptive Hybrid):** Message-level directionality.

## Decision

Adopt **Canvas-Only RTL (Variant B) as the default layout for the Arabic locale**, with an optional **Full Mirror (Variant A)** setting in `Settings → Appearance → Layout Direction`.

Strictly enforce **Code Isolation**:
- All terminals (`xterm.js`), code blocks (`pre`, `code`), git diffs, and monospace paths are unconditionally isolated with `direction: ltr !important`, `text-align: left !important`, and `unicode-bidi: isolate !important`.
- Typography integrates geometric Arabic fonts (*IBM Plex Sans Arabic* and *Cairo*) with system fallbacks (*Segoe UI*, *Tahoma*).
- Windows TitleBar controls (Minimize, Maximize, Close) remain pinned to the top-right corner on Windows regardless of locale.

## Consequences

- Preserves developer muscle memory for navigation while delivering a native, beautiful Arabic reading experience for conversation, reasoning, prompts, and settings.
- Developers who prefer complete mirroring can easily toggle it via settings without breaking code blocks.
- Eliminates visual friction and bidi corruption in code syntax and terminal streams.
