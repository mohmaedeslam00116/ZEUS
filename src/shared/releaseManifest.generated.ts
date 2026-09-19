/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Written by `npm run gen:notes` (scripts/gen-release-notes.mjs) from
 * CHANGELOG.md. Types live in `./release`; this file carries only data.
 *
 * `RELEASE_MANIFESTS` holds the 5 most recent releases in full.
 * `RELEASE_INDEX` lists EVERY released version, so the release document can
 * show a complete history without the changelog becoming app payload.
 *
 * Git-derived fields (commit, buildNumber, contributors, pullRequests,
 * mergedBranches, stats) are null/empty here and are stamped in at package time
 * by `ci/scripts/embed-release-manifest.mjs`, the same way
 * `apply-tag-version.mjs` stamps the version — a laptop has no tag to read them
 * from. That step also resolves each contributor to their forge account and
 * embeds the profile picture as a `data:` URI, which is why the app can show
 * real avatars under a CSP that forbids it from fetching one.
 * Asset digests and signing status appear only in the PUBLISHED manifest
 * (`dist/release-manifest.json`): a build cannot contain the hash of an
 * installer that does not exist until after it is built.
 */
import type { ReleaseIndexEntry, ReleaseManifestEntry } from './release';

/** Newest first. */
export const RELEASE_MANIFESTS: ReleaseManifestEntry[] = [
  {
    "version": "0.1.0-alpha.2",
    "date": "2026-09-19",
    "channel": "preview",
    "codename": null,
    "gitTag": "v0.1.0-alpha.2",
    "commit": null,
    "buildNumber": null,
    "summary": "ZEUS 0.1.0-alpha.2 delivers the complete ZEUS v0.2.0 milestone, introducing comprehensive\nbidirectional Arabic localization across the application shell and expanding the coding agent\necosystem to support headless Cline, OpenCode, and OpenAI Codex behind ZEUS's provider-neutral\norchestration seam.",
    "sections": [
      {
        "category": "other",
        "title": "Major user-visible changes",
        "items": [
          {
            "lead": "Bidirectional Arabic localization & RTL layout system (ADR-0011)",
            "text": ":\n  - Added Arabic (`'ar'`) and English (`'en'`) language switching in Settings › Appearance with\n    zero-restart, instantaneous in-memory catalog updates.\n  - Implemented Canvas-Only RTL as default, preserving physical muscle-memory navigation for the\n    Sessions sidebar and Activity drawer while presenting the central conversation and prompt\n    canvas in natural right-to-left layout.\n  - Optional Full Mirror mode (`'full-rtl'`) flips the entire desktop chrome when preferred.\n  - Cairo Arabic typography (`--font-sans-ar`) with relaxed leading to prevent diacritic clipping.\n  - Strict LTR isolation (`unicode-bidi: isolate; direction: ltr !important`) enforced across all\n    code blocks, diff views, file paths, and terminal streams."
          },
          {
            "lead": "Bilingual agent prompt guidance & English Conventional Commits",
            "text": ":\n  - Centralized `LocaleContext` in `AgentManager`: when Arabic interface or guidance is active,\n    agents are instructed to reason and converse in Modern Standard Arabic while keeping all code,\n    terminal commands, symbol names, file paths, and parameters strictly in ASCII/English.\n  - Automated git commit generation (`COMMIT_SYSTEM_PROMPT`) preserves standard English\n    Conventional Commits (`feat:`, `fix:`) for global CI/CD compatibility."
          },
          {
            "lead": "Headless agent provider expansion (Cline, OpenCode, OpenAI Codex)",
            "text": ":\n  - Support for autonomous CLI agents running headlessly behind ZEUS's unified permission core:\n    `cline`, `opencode`, and `codex`.\n  - Added `AcpRuntime` driving `cline --acp` and `opencode acp` via stdio JSON-RPC Agent Client Protocol.\n  - Added native `CodexRuntime` interfacing directly with `codex app-server` over stdio JSON-RPC,\n    eliminating harness-level tool approval bypasses.\n  - Automatic local credential and profile discovery (`~/.codex/auth.json`, `~/.cline`, `~/.config/opencode`),\n    allowing ChatGPT Plus/Pro subscribers to use Codex without pay-per-token API keys.\n  - Settings › Agent displays live CLI probe availability and actionable copy-paste installation commands."
          },
          {
            "lead": "Strict security & permission invariants (SEC-14, SEC-16, SEC-19)",
            "text": ":\n  - Synchronous fail-closed tool permission gating (`decideToolUse`) for all tool calls from Cline,\n    OpenCode, and Codex, blocking execution until approved by user or session policy.\n  - Crown-jewel database and secrets paths (`userData/zeus.db`, `userData/secrets/`) strictly off-limits.\n  - Stdio debug streams and diagnostic logging automatically redact API tokens, bearer keys, and credentials.\n  - Complete process and abort-signal isolation across concurrent multi-provider sessions."
          }
        ],
        "markdown": "- **Bidirectional Arabic localization & RTL layout system (ADR-0011)**:\n  - Added Arabic (`'ar'`) and English (`'en'`) language switching in Settings › Appearance with\n    zero-restart, instantaneous in-memory catalog updates.\n  - Implemented Canvas-Only RTL as default, preserving physical muscle-memory navigation for the\n    Sessions sidebar and Activity drawer while presenting the central conversation and prompt\n    canvas in natural right-to-left layout.\n  - Optional Full Mirror mode (`'full-rtl'`) flips the entire desktop chrome when preferred.\n  - Cairo Arabic typography (`--font-sans-ar`) with relaxed leading to prevent diacritic clipping.\n  - Strict LTR isolation (`unicode-bidi: isolate; direction: ltr !important`) enforced across all\n    code blocks, diff views, file paths, and terminal streams.\n- **Bilingual agent prompt guidance & English Conventional Commits**:\n  - Centralized `LocaleContext` in `AgentManager`: when Arabic interface or guidance is active,\n    agents are instructed to reason and converse in Modern Standard Arabic while keeping all code,\n    terminal commands, symbol names, file paths, and parameters strictly in ASCII/English.\n  - Automated git commit generation (`COMMIT_SYSTEM_PROMPT`) preserves standard English\n    Conventional Commits (`feat:`, `fix:`) for global CI/CD compatibility.\n- **Headless agent provider expansion (Cline, OpenCode, OpenAI Codex)**:\n  - Support for autonomous CLI agents running headlessly behind ZEUS's unified permission core:\n    `cline`, `opencode`, and `codex`.\n  - Added `AcpRuntime` driving `cline --acp` and `opencode acp` via stdio JSON-RPC Agent Client Protocol.\n  - Added native `CodexRuntime` interfacing directly with `codex app-server` over stdio JSON-RPC,\n    eliminating harness-level tool approval bypasses.\n  - Automatic local credential and profile discovery (`~/.codex/auth.json`, `~/.cline`, `~/.config/opencode`),\n    allowing ChatGPT Plus/Pro subscribers to use Codex without pay-per-token API keys.\n  - Settings › Agent displays live CLI probe availability and actionable copy-paste installation commands.\n- **Strict security & permission invariants (SEC-14, SEC-16, SEC-19)**:\n  - Synchronous fail-closed tool permission gating (`decideToolUse`) for all tool calls from Cline,\n    OpenCode, and Codex, blocking execution until approved by user or session policy.\n  - Crown-jewel database and secrets paths (`userData/zeus.db`, `userData/secrets/`) strictly off-limits.\n  - Stdio debug streams and diagnostic logging automatically redact API tokens, bearer keys, and credentials.\n  - Complete process and abort-signal isolation across concurrent multi-provider sessions."
      },
      {
        "category": "other",
        "title": "Installing (Windows, unsigned)",
        "items": [],
        "markdown": "1. Download `ZEUS-Setup-0.1.0-alpha.2-x64.exe` from this release.\n2. If SmartScreen appears, choose **More info** → **Run anyway** — expected for an unsigned build.\n   Verify the SHA-256 checksum against `SHA256SUMS`.\n3. The installer is per-user (no administrator rights required). If updating from `v0.1.0-alpha.1`,\n   ZEUS will detect this update automatically via the in-app update channel."
      }
    ],
    "contributors": [],
    "pullRequests": [],
    "mergedBranches": [],
    "assets": [],
    "signing": [],
    "stats": {
      "commits": null,
      "filesChanged": null,
      "additions": null,
      "deletions": null
    },
    "links": {
      "release": "https://github.com/mohmaedeslam00116/ZEUS/releases/tag/v0.1.0-alpha.2",
      "compare": null,
      "tag": "https://github.com/mohmaedeslam00116/ZEUS/releases/tag/v0.1.0-alpha.2",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "mohmaedeslam00116/ZEUS",
    "markdown": "ZEUS 0.1.0-alpha.2 delivers the complete ZEUS v0.2.0 milestone, introducing comprehensive\nbidirectional Arabic localization across the application shell and expanding the coding agent\necosystem to support headless Cline, OpenCode, and OpenAI Codex behind ZEUS's provider-neutral\norchestration seam.\n\n### Major user-visible changes\n\n- **Bidirectional Arabic localization & RTL layout system (ADR-0011)**:\n  - Added Arabic (`'ar'`) and English (`'en'`) language switching in Settings › Appearance with\n    zero-restart, instantaneous in-memory catalog updates.\n  - Implemented Canvas-Only RTL as default, preserving physical muscle-memory navigation for the\n    Sessions sidebar and Activity drawer while presenting the central conversation and prompt\n    canvas in natural right-to-left layout.\n  - Optional Full Mirror mode (`'full-rtl'`) flips the entire desktop chrome when preferred.\n  - Cairo Arabic typography (`--font-sans-ar`) with relaxed leading to prevent diacritic clipping.\n  - Strict LTR isolation (`unicode-bidi: isolate; direction: ltr !important`) enforced across all\n    code blocks, diff views, file paths, and terminal streams.\n- **Bilingual agent prompt guidance & English Conventional Commits**:\n  - Centralized `LocaleContext` in `AgentManager`: when Arabic interface or guidance is active,\n    agents are instructed to reason and converse in Modern Standard Arabic while keeping all code,\n    terminal commands, symbol names, file paths, and parameters strictly in ASCII/English.\n  - Automated git commit generation (`COMMIT_SYSTEM_PROMPT`) preserves standard English\n    Conventional Commits (`feat:`, `fix:`) for global CI/CD compatibility.\n- **Headless agent provider expansion (Cline, OpenCode, OpenAI Codex)**:\n  - Support for autonomous CLI agents running headlessly behind ZEUS's unified permission core:\n    `cline`, `opencode`, and `codex`.\n  - Added `AcpRuntime` driving `cline --acp` and `opencode acp` via stdio JSON-RPC Agent Client Protocol.\n  - Added native `CodexRuntime` interfacing directly with `codex app-server` over stdio JSON-RPC,\n    eliminating harness-level tool approval bypasses.\n  - Automatic local credential and profile discovery (`~/.codex/auth.json`, `~/.cline`, `~/.config/opencode`),\n    allowing ChatGPT Plus/Pro subscribers to use Codex without pay-per-token API keys.\n  - Settings › Agent displays live CLI probe availability and actionable copy-paste installation commands.\n- **Strict security & permission invariants (SEC-14, SEC-16, SEC-19)**:\n  - Synchronous fail-closed tool permission gating (`decideToolUse`) for all tool calls from Cline,\n    OpenCode, and Codex, blocking execution until approved by user or session policy.\n  - Crown-jewel database and secrets paths (`userData/zeus.db`, `userData/secrets/`) strictly off-limits.\n  - Stdio debug streams and diagnostic logging automatically redact API tokens, bearer keys, and credentials.\n  - Complete process and abort-signal isolation across concurrent multi-provider sessions.\n\n### Installing (Windows, unsigned)\n\n1. Download `ZEUS-Setup-0.1.0-alpha.2-x64.exe` from this release.\n2. If SmartScreen appears, choose **More info** → **Run anyway** — expected for an unsigned build.\n   Verify the SHA-256 checksum against `SHA256SUMS`.\n3. The installer is per-user (no administrator rights required). If updating from `v0.1.0-alpha.1`,\n   ZEUS will detect this update automatically via the in-app update channel."
  },
  {
    "version": "0.1.0-alpha.1",
    "date": "2026-09-17",
    "channel": "preview",
    "codename": null,
    "gitTag": "v0.1.0-alpha.1",
    "commit": null,
    "buildNumber": null,
    "summary": "The first ZEUS release: a Windows-only closed alpha for invited testers. ZEUS is a\nlocal-first coding-agent desktop — a session shell that drives AI coding agents\n(Claude Code, Cursor) against your workspaces, with git-integrated change review,\nmemory, tasks, an integrated terminal, and global search. Everything is stored\nlocally under `%APPDATA%zeus`; there is no backend and no telemetry.",
    "sections": [
      {
        "category": "other",
        "title": "Scope",
        "items": [],
        "markdown": "This alpha includes the complete ZEUS functional surface for local use:\nmulti-workspace session management (plain workspace sessions by default, explicit\ngit-worktree sessions), agent streaming under a three-layer permission model\n(session deny rules, declarative approval, OS sandbox policy), MCP tool\nintegration (`zeus_memory`, `zeus_search`), checkpointing, runtime telemetry, and\npackaged auto-update against this repository’s releases."
      },
      {
        "category": "other",
        "title": "Major user-visible changes",
        "items": [
          {
            "lead": null,
            "text": "ZEUS ships under its own identity: package `zeus`, app ID\n  `io.github.mohmaedeslam00116.zeus`, display name `ZEUS` on every first-contact\n  surface (installer, shortcuts, tray, window title), and an interim neutral\n  geometric mark. No inherited branding remains."
          },
          {
            "lead": null,
            "text": "Functional namespaces are ZEUS-canonical: `zeus.json` worktree agent config,\n  `.zeus/` state directories, `zeus_memory` / `zeus_search` MCP tools, and\n  `refs/zeus/checkpoints/*`."
          },
          {
            "lead": null,
            "text": "The title-bar shortcut hint reads `Ctrl P` on Windows, and global-search state\n  copy meets WCAG AA contrast."
          },
          {
            "lead": null,
            "text": "Fresh installs track the prerelease (beta) update channel so alpha testers\n  receive every alpha build; every update still requires explicit consent and\n  nothing auto-downloads."
          }
        ],
        "markdown": "- ZEUS ships under its own identity: package `zeus`, app ID\n  `io.github.mohmaedeslam00116.zeus`, display name `ZEUS` on every first-contact\n  surface (installer, shortcuts, tray, window title), and an interim neutral\n  geometric mark. No inherited branding remains.\n- Functional namespaces are ZEUS-canonical: `zeus.json` worktree agent config,\n  `.zeus/` state directories, `zeus_memory` / `zeus_search` MCP tools, and\n  `refs/zeus/checkpoints/*`.\n- The title-bar shortcut hint reads `Ctrl P` on Windows, and global-search state\n  copy meets WCAG AA contrast.\n- Fresh installs track the prerelease (beta) update channel so alpha testers\n  receive every alpha build; every update still requires explicit consent and\n  nothing auto-downloads."
      },
      {
        "category": "known-issues",
        "title": "Known limitations",
        "items": [
          {
            "lead": null,
            "text": "Windows x64 only for this alpha."
          },
          {
            "lead": null,
            "text": "The build is **unsigned**: SmartScreen warns on first install (see below).\n  Update integrity is enforced by sha512 digests in the update feed, not\n  signatures."
          },
          {
            "lead": null,
            "text": "The end-to-end update path (alpha.1 → alpha.2) is verified at the alpha.2\n  release by design; alpha.1 verifies the update configuration structurally."
          },
          {
            "lead": null,
            "text": "Accessibility and visual polish are pre-alpha quality in places; the full\n  design pass is post-alpha."
          }
        ],
        "markdown": "- Windows x64 only for this alpha.\n- The build is **unsigned**: SmartScreen warns on first install (see below).\n  Update integrity is enforced by sha512 digests in the update feed, not\n  signatures.\n- The end-to-end update path (alpha.1 → alpha.2) is verified at the alpha.2\n  release by design; alpha.1 verifies the update configuration structurally.\n- Accessibility and visual polish are pre-alpha quality in places; the full\n  design pass is post-alpha."
      },
      {
        "category": "other",
        "title": "Installing (Windows, unsigned)",
        "items": [],
        "markdown": "1. Download `ZEUS-Setup-0.1.0-alpha.1-x64.exe` from this release.\n2. If SmartScreen appears, choose **More info** → **Run anyway** — expected for\n   an unsigned build. To confirm integrity first, verify the SHA-256 checksum\n   against `SHA256SUMS`.\n3. The installer is per-user (no administrator rights required). Launch ZEUS from\n   the Start Menu or the desktop shortcut."
      },
      {
        "category": "other",
        "title": "Feedback",
        "items": [],
        "markdown": "Report everything on [GitHub Issues](https://github.com/mohmaedeslam00116/ZEUS/issues)\nwith the **alpha feedback** form (label `alpha`): bugs, UX feedback, confusion, and\ndata-handling concerns (treated as highest priority). Keep secrets, tokens,\ncredentials, and private source code out of logs, screenshots, and reports. Alpha\nfeedback improves the product but is not a support guarantee."
      }
    ],
    "contributors": [],
    "pullRequests": [],
    "mergedBranches": [],
    "assets": [],
    "signing": [],
    "stats": {
      "commits": null,
      "filesChanged": null,
      "additions": null,
      "deletions": null
    },
    "links": {
      "release": "https://github.com/mohmaedeslam00116/ZEUS/releases/tag/v0.1.0-alpha.1",
      "compare": null,
      "tag": "https://github.com/mohmaedeslam00116/ZEUS/releases/tag/v0.1.0-alpha.1",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "mohmaedeslam00116/ZEUS",
    "markdown": "The first ZEUS release: a Windows-only closed alpha for invited testers. ZEUS is a\nlocal-first coding-agent desktop — a session shell that drives AI coding agents\n(Claude Code, Cursor) against your workspaces, with git-integrated change review,\nmemory, tasks, an integrated terminal, and global search. Everything is stored\nlocally under `%APPDATA%zeus`; there is no backend and no telemetry.\n\n### Scope\n\nThis alpha includes the complete ZEUS functional surface for local use:\nmulti-workspace session management (plain workspace sessions by default, explicit\ngit-worktree sessions), agent streaming under a three-layer permission model\n(session deny rules, declarative approval, OS sandbox policy), MCP tool\nintegration (`zeus_memory`, `zeus_search`), checkpointing, runtime telemetry, and\npackaged auto-update against this repository’s releases.\n\n### Major user-visible changes\n\n- ZEUS ships under its own identity: package `zeus`, app ID\n  `io.github.mohmaedeslam00116.zeus`, display name `ZEUS` on every first-contact\n  surface (installer, shortcuts, tray, window title), and an interim neutral\n  geometric mark. No inherited branding remains.\n- Functional namespaces are ZEUS-canonical: `zeus.json` worktree agent config,\n  `.zeus/` state directories, `zeus_memory` / `zeus_search` MCP tools, and\n  `refs/zeus/checkpoints/*`.\n- The title-bar shortcut hint reads `Ctrl P` on Windows, and global-search state\n  copy meets WCAG AA contrast.\n- Fresh installs track the prerelease (beta) update channel so alpha testers\n  receive every alpha build; every update still requires explicit consent and\n  nothing auto-downloads.\n\n### Known limitations\n\n- Windows x64 only for this alpha.\n- The build is **unsigned**: SmartScreen warns on first install (see below).\n  Update integrity is enforced by sha512 digests in the update feed, not\n  signatures.\n- The end-to-end update path (alpha.1 → alpha.2) is verified at the alpha.2\n  release by design; alpha.1 verifies the update configuration structurally.\n- Accessibility and visual polish are pre-alpha quality in places; the full\n  design pass is post-alpha.\n\n### Installing (Windows, unsigned)\n\n1. Download `ZEUS-Setup-0.1.0-alpha.1-x64.exe` from this release.\n2. If SmartScreen appears, choose **More info** → **Run anyway** — expected for\n   an unsigned build. To confirm integrity first, verify the SHA-256 checksum\n   against `SHA256SUMS`.\n3. The installer is per-user (no administrator rights required). Launch ZEUS from\n   the Start Menu or the desktop shortcut.\n\n### Feedback\n\nReport everything on [GitHub Issues](https://github.com/mohmaedeslam00116/ZEUS/issues)\nwith the **alpha feedback** form (label `alpha`): bugs, UX feedback, confusion, and\ndata-handling concerns (treated as highest priority). Keep secrets, tokens,\ncredentials, and private source code out of logs, screenshots, and reports. Alpha\nfeedback improves the product but is not a support guarantee."
  }
];

/** Every released version, newest first. */
export const RELEASE_INDEX: ReleaseIndexEntry[] = [
  {
    "version": "0.1.0-alpha.2",
    "date": "2026-09-19",
    "channel": "preview",
    "summary": "ZEUS 0.1.0-alpha.2 delivers the complete ZEUS v0.2.0 milestone, introducing comprehensive\nbidirectional Arabic localization across the application shell and expanding the coding agent\necosystem to support headless Cline, OpenCode, and OpenAI Codex behind ZEUS's provider-neutral\norchestration seam.",
    "detailed": true
  },
  {
    "version": "0.1.0-alpha.1",
    "date": "2026-09-17",
    "channel": "preview",
    "summary": "The first ZEUS release: a Windows-only closed alpha for invited testers. ZEUS is a\nlocal-first coding-agent desktop — a session shell that drives AI coding agents\n(Claude Code, Cursor) against your workspaces, with git-integrated change review,\nmemory, tasks, an integrated terminal, and global search. Everything is stored\nlocally under `%APPDATA%zeus`; there is no backend and no telemetry.",
    "detailed": true
  }
];

/** The full manifest for one version, or null when this build does not carry it. */
export function releaseManifestFor(version: string): ReleaseManifestEntry | null {
  const wanted = version.replace(/^v/, '');
  return RELEASE_MANIFESTS.find((r) => r.version === wanted) ?? null;
}

/** The index entry for one version, or null when the changelog has no section. */
export function releaseIndexFor(version: string): ReleaseIndexEntry | null {
  const wanted = version.replace(/^v/, '');
  return RELEASE_INDEX.find((r) => r.version === wanted) ?? null;
}
