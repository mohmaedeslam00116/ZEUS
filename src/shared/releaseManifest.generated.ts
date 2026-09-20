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
    "version": "0.1.0-alpha.6",
    "date": "2026-09-21",
    "channel": "preview",
    "codename": null,
    "gitTag": "v0.1.0-alpha.6",
    "commit": null,
    "buildNumber": null,
    "summary": "ZEUS 0.1.0-alpha.6 fixes headless ACP agent conversation memory loss and session continuity across turns:",
    "sections": [
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "Headless ACP agents (Cline) losing conversational context across turns (`0 Context used`)",
            "text": ":\n  - In multi-turn sessions, `AcpRuntime` previously disposed the underlying child process and ACP session at the end of each turn (`client.dispose()` in `finally`), forcing every subsequent turn to spawn a clean process with an empty session.\n  - Sequential prompts in the same conversation session now maintain and reuse the active child process and ACP session (`activeSessions` registry), preserving full context, conversation history, and tool outputs.\n  - Added support for ACP `session/load` in `AcpClient` to gracefully restore saved sessions from disk across application restarts or session reconnection using persisted provider session IDs.\n  - `AgentManager` now forwards the saved `providerSessionId` to runtime adapters as `resumeSessionId` and coordinates clean process termination when sessions are explicitly closed or forgotten."
          }
        ],
        "markdown": "- **Headless ACP agents (Cline) losing conversational context across turns (`0 Context used`)**:\n  - In multi-turn sessions, `AcpRuntime` previously disposed the underlying child process and ACP session at the end of each turn (`client.dispose()` in `finally`), forcing every subsequent turn to spawn a clean process with an empty session.\n  - Sequential prompts in the same conversation session now maintain and reuse the active child process and ACP session (`activeSessions` registry), preserving full context, conversation history, and tool outputs.\n  - Added support for ACP `session/load` in `AcpClient` to gracefully restore saved sessions from disk across application restarts or session reconnection using persisted provider session IDs.\n  - `AgentManager` now forwards the saved `providerSessionId` to runtime adapters as `resumeSessionId` and coordinates clean process termination when sessions are explicitly closed or forgotten."
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
      "release": "https://github.com/mohmaedeslam00116/ZEUS/releases/tag/v0.1.0-alpha.6",
      "compare": null,
      "tag": "https://github.com/mohmaedeslam00116/ZEUS/releases/tag/v0.1.0-alpha.6",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "mohmaedeslam00116/ZEUS",
    "markdown": "ZEUS 0.1.0-alpha.6 fixes headless ACP agent conversation memory loss and session continuity across turns:\n\n### Fixed\n\n- **Headless ACP agents (Cline) losing conversational context across turns (`0 Context used`)**:\n  - In multi-turn sessions, `AcpRuntime` previously disposed the underlying child process and ACP session at the end of each turn (`client.dispose()` in `finally`), forcing every subsequent turn to spawn a clean process with an empty session.\n  - Sequential prompts in the same conversation session now maintain and reuse the active child process and ACP session (`activeSessions` registry), preserving full context, conversation history, and tool outputs.\n  - Added support for ACP `session/load` in `AcpClient` to gracefully restore saved sessions from disk across application restarts or session reconnection using persisted provider session IDs.\n  - `AgentManager` now forwards the saved `providerSessionId` to runtime adapters as `resumeSessionId` and coordinates clean process termination when sessions are explicitly closed or forgotten."
  },
  {
    "version": "0.1.0-alpha.5",
    "date": "2026-09-21",
    "channel": "preview",
    "codename": null,
    "gitTag": "v0.1.0-alpha.5",
    "commit": null,
    "buildNumber": null,
    "summary": "ZEUS 0.1.0-alpha.5 resolves headless agent streaming, discovery, and handshake issues across Cline, Codex, and OpenCode on Windows:",
    "sections": [
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "Cline text and thought streaming omitted from conversation UI",
            "text": ":\n  - Cline emits streamed text and thinking responses wrapped in ACP v1 nested session updates (`{\"method\": \"session/update\", \"params\": {\"update\": {\"sessionUpdate\": \"agent_message_chunk\", \"content\": {\"type\": \"text\", \"text\": \"...\"}}}}`).\n  - Previously, `translateAcpNotification` only inspected flat `params.kind === 'textDelta'`, dropping nested session chunks. ZEUS now unpacks `agent_message_chunk`, `agent_thought_chunk`, `tool_call`, and `tool_call_update` so all model outputs, thoughts, and tool actions stream live to the UI."
          },
          {
            "lead": "Codex initialize timeout (`Codex request timed out after 60000ms: method \"initialize\" (id: 1)`)",
            "text": ":\n  - The Codex app-server emits initial response frames without an explicit `\"jsonrpc\": \"2.0\"` header (e.g. `{\"id\": 1, \"result\": {...}}`).\n  - `JsonRpcStreamParser` previously rejected these frames as invalid JSON-RPC, causing `initialize` and subsequent method calls to hang until timeout. The parser now tolerates frames containing `'id'` or `'method'` without the strict `\"jsonrpc\"` header."
          },
          {
            "lead": "OpenCode CLI discovery on Windows (`The OpenCode CLI is not installed or not found on PATH`)",
            "text": ":\n  - OpenCode installed on Windows under custom or standard system paths (e.g. `D:\\Program Files\\OpenCode\\opencode-cli.exe` or `%LOCALAPPDATA%\\Programs\\@opencode-aidesktop`) was not detected when not in system PATH or named `opencode-cli`.\n  - Added binary probing and spawn resolution for both `opencode` and `opencode-cli` aliases across common Windows installation locations and PATH directories."
          }
        ],
        "markdown": "- **Cline text and thought streaming omitted from conversation UI**:\n  - Cline emits streamed text and thinking responses wrapped in ACP v1 nested session updates (`{\"method\": \"session/update\", \"params\": {\"update\": {\"sessionUpdate\": \"agent_message_chunk\", \"content\": {\"type\": \"text\", \"text\": \"...\"}}}}`).\n  - Previously, `translateAcpNotification` only inspected flat `params.kind === 'textDelta'`, dropping nested session chunks. ZEUS now unpacks `agent_message_chunk`, `agent_thought_chunk`, `tool_call`, and `tool_call_update` so all model outputs, thoughts, and tool actions stream live to the UI.\n- **Codex initialize timeout (`Codex request timed out after 60000ms: method \"initialize\" (id: 1)`)**:\n  - The Codex app-server emits initial response frames without an explicit `\"jsonrpc\": \"2.0\"` header (e.g. `{\"id\": 1, \"result\": {...}}`).\n  - `JsonRpcStreamParser` previously rejected these frames as invalid JSON-RPC, causing `initialize` and subsequent method calls to hang until timeout. The parser now tolerates frames containing `'id'` or `'method'` without the strict `\"jsonrpc\"` header.\n- **OpenCode CLI discovery on Windows (`The OpenCode CLI is not installed or not found on PATH`)**:\n  - OpenCode installed on Windows under custom or standard system paths (e.g. `D:\\Program Files\\OpenCode\\opencode-cli.exe` or `%LOCALAPPDATA%\\Programs\\@opencode-aidesktop`) was not detected when not in system PATH or named `opencode-cli`.\n  - Added binary probing and spawn resolution for both `opencode` and `opencode-cli` aliases across common Windows installation locations and PATH directories."
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
      "release": "https://github.com/mohmaedeslam00116/ZEUS/releases/tag/v0.1.0-alpha.5",
      "compare": null,
      "tag": "https://github.com/mohmaedeslam00116/ZEUS/releases/tag/v0.1.0-alpha.5",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "mohmaedeslam00116/ZEUS",
    "markdown": "ZEUS 0.1.0-alpha.5 resolves headless agent streaming, discovery, and handshake issues across Cline, Codex, and OpenCode on Windows:\n\n### Fixed\n\n- **Cline text and thought streaming omitted from conversation UI**:\n  - Cline emits streamed text and thinking responses wrapped in ACP v1 nested session updates (`{\"method\": \"session/update\", \"params\": {\"update\": {\"sessionUpdate\": \"agent_message_chunk\", \"content\": {\"type\": \"text\", \"text\": \"...\"}}}}`).\n  - Previously, `translateAcpNotification` only inspected flat `params.kind === 'textDelta'`, dropping nested session chunks. ZEUS now unpacks `agent_message_chunk`, `agent_thought_chunk`, `tool_call`, and `tool_call_update` so all model outputs, thoughts, and tool actions stream live to the UI.\n- **Codex initialize timeout (`Codex request timed out after 60000ms: method \"initialize\" (id: 1)`)**:\n  - The Codex app-server emits initial response frames without an explicit `\"jsonrpc\": \"2.0\"` header (e.g. `{\"id\": 1, \"result\": {...}}`).\n  - `JsonRpcStreamParser` previously rejected these frames as invalid JSON-RPC, causing `initialize` and subsequent method calls to hang until timeout. The parser now tolerates frames containing `'id'` or `'method'` without the strict `\"jsonrpc\"` header.\n- **OpenCode CLI discovery on Windows (`The OpenCode CLI is not installed or not found on PATH`)**:\n  - OpenCode installed on Windows under custom or standard system paths (e.g. `D:\\Program Files\\OpenCode\\opencode-cli.exe` or `%LOCALAPPDATA%\\Programs\\@opencode-aidesktop`) was not detected when not in system PATH or named `opencode-cli`.\n  - Added binary probing and spawn resolution for both `opencode` and `opencode-cli` aliases across common Windows installation locations and PATH directories."
  },
  {
    "version": "0.1.0-alpha.4",
    "date": "2026-09-20",
    "channel": "preview",
    "codename": null,
    "gitTag": "v0.1.0-alpha.4",
    "commit": null,
    "buildNumber": null,
    "summary": "ZEUS 0.1.0-alpha.4 resolves JSON-RPC wire-format incompatibilities with headless\nagents running under the Agent Client Protocol (ACP) and Codex app-server protocols.",
    "sections": [
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "Headless ACP agent parameter validation failures (`ACP RPC Error [-32602]: Invalid params`)",
            "text": ":\n  - In standard ACP v1, `session/new` enforces `{\"required\": [\"cwd\", \"mcpServers\"]}`.\n    ZEUS previously omitted `mcpServers`, triggering schema rejections (`mcpServers: Invalid input`)\n    in ACP runtimes like Cline and OpenCode. `mcpServers: []` is now always included.\n  - In ACP v1, `session/prompt` requires `prompt` to be an array of `ContentBlock` objects\n    (`[{ type: 'text', text: ... }]`). Raw strings previously caused schema rejection\n    (`prompt: Invalid input: expected array, received string`). Prompts are now normalized\n    into standard ACP content blocks.\n  - Added `clientCapabilities` (fs/terminal) during the initial `initialize` handshake."
          },
          {
            "lead": "Codex turn dispatch error (`Codex RPC Error [-32600]: Invalid request: missing field input`)",
            "text": ":\n  - The Codex app-server wire protocol expects prompts structured under `input` as content\n    blocks rather than a top-level string `prompt`. Requests now supply `input: [{ type: 'text', text: prompt }]`\n    and normalize `turnId` from the returned `turn.id`."
          }
        ],
        "markdown": "- **Headless ACP agent parameter validation failures (`ACP RPC Error [-32602]: Invalid params`)**:\n  - In standard ACP v1, `session/new` enforces `{\"required\": [\"cwd\", \"mcpServers\"]}`.\n    ZEUS previously omitted `mcpServers`, triggering schema rejections (`mcpServers: Invalid input`)\n    in ACP runtimes like Cline and OpenCode. `mcpServers: []` is now always included.\n  - In ACP v1, `session/prompt` requires `prompt` to be an array of `ContentBlock` objects\n    (`[{ type: 'text', text: ... }]`). Raw strings previously caused schema rejection\n    (`prompt: Invalid input: expected array, received string`). Prompts are now normalized\n    into standard ACP content blocks.\n  - Added `clientCapabilities` (fs/terminal) during the initial `initialize` handshake.\n- **Codex turn dispatch error (`Codex RPC Error [-32600]: Invalid request: missing field input`)**:\n  - The Codex app-server wire protocol expects prompts structured under `input` as content\n    blocks rather than a top-level string `prompt`. Requests now supply `input: [{ type: 'text', text: prompt }]`\n    and normalize `turnId` from the returned `turn.id`."
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
      "release": "https://github.com/mohmaedeslam00116/ZEUS/releases/tag/v0.1.0-alpha.4",
      "compare": null,
      "tag": "https://github.com/mohmaedeslam00116/ZEUS/releases/tag/v0.1.0-alpha.4",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "mohmaedeslam00116/ZEUS",
    "markdown": "ZEUS 0.1.0-alpha.4 resolves JSON-RPC wire-format incompatibilities with headless\nagents running under the Agent Client Protocol (ACP) and Codex app-server protocols.\n\n### Fixed\n\n- **Headless ACP agent parameter validation failures (`ACP RPC Error [-32602]: Invalid params`)**:\n  - In standard ACP v1, `session/new` enforces `{\"required\": [\"cwd\", \"mcpServers\"]}`.\n    ZEUS previously omitted `mcpServers`, triggering schema rejections (`mcpServers: Invalid input`)\n    in ACP runtimes like Cline and OpenCode. `mcpServers: []` is now always included.\n  - In ACP v1, `session/prompt` requires `prompt` to be an array of `ContentBlock` objects\n    (`[{ type: 'text', text: ... }]`). Raw strings previously caused schema rejection\n    (`prompt: Invalid input: expected array, received string`). Prompts are now normalized\n    into standard ACP content blocks.\n  - Added `clientCapabilities` (fs/terminal) during the initial `initialize` handshake.\n- **Codex turn dispatch error (`Codex RPC Error [-32600]: Invalid request: missing field input`)**:\n  - The Codex app-server wire protocol expects prompts structured under `input` as content\n    blocks rather than a top-level string `prompt`. Requests now supply `input: [{ type: 'text', text: prompt }]`\n    and normalize `turnId` from the returned `turn.id`."
  },
  {
    "version": "0.1.0-alpha.3",
    "date": "2026-09-20",
    "channel": "preview",
    "codename": null,
    "gitTag": "v0.1.0-alpha.3",
    "commit": null,
    "buildNumber": null,
    "summary": "ZEUS 0.1.0-alpha.3 is a critical stability patch resolving Windows installation shortcut\ndisappearance after updates and fixing the `spawn ENOENT` failure when running headless\nagents (Cline, OpenCode, Codex) installed via npm on Windows.",
    "sections": [
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "Windows Desktop and Start Menu shortcuts wiped during updates & reinstalls",
            "text": ":\n  - `customInit` in `assets/installer/installer.nsh` previously scrubbed `ZEUS.lnk` during\n    pre-install cleanup. Combined with electron-builder's `$keepShortcuts = \"true\"` upgrade logic,\n    the installer skipped recreating shortcuts, leaving updated machines without Desktop or\n    Start Menu launchers.\n  - Removed shortcut deletion from `customInit`, and added an automated safety net in `customInstall`\n    to ensure `$newStartMenuLink` and `$newDesktopLink` exist and notify Windows Shell.\n  - Enabled `createDesktopShortcut: always` in `electron-builder.yml`."
          },
          {
            "lead": "Headless agent spawning failure on Windows (`spawn cline ENOENT`)",
            "text": ":\n  - On Windows, npm global CLIs (`cline`, `opencode`, `codex`) are `.cmd` / `.bat` shell shims.\n    Node's `child_process.spawn()` with `shell: false` fails with `ENOENT` because Win32\n    `CreateProcessW` only directly executes `.exe` binaries.\n  - Introduced `resolveSpawnTarget` utility that bridges `.cmd` and `.bat` shims via\n    `%ComSpec% /d /s /c` with static argv arrays, preserving SEC-08 (no `shell: true`).\n  - Corrected ACP protocol initialization in `AcpClient`: updated `protocolVersion` to integer `1`\n    per ACP standard, eliminating parameter validation rejections from Cline and OpenCode."
          }
        ],
        "markdown": "- **Windows Desktop and Start Menu shortcuts wiped during updates & reinstalls**:\n  - `customInit` in `assets/installer/installer.nsh` previously scrubbed `ZEUS.lnk` during\n    pre-install cleanup. Combined with electron-builder's `$keepShortcuts = \"true\"` upgrade logic,\n    the installer skipped recreating shortcuts, leaving updated machines without Desktop or\n    Start Menu launchers.\n  - Removed shortcut deletion from `customInit`, and added an automated safety net in `customInstall`\n    to ensure `$newStartMenuLink` and `$newDesktopLink` exist and notify Windows Shell.\n  - Enabled `createDesktopShortcut: always` in `electron-builder.yml`.\n- **Headless agent spawning failure on Windows (`spawn cline ENOENT`)**:\n  - On Windows, npm global CLIs (`cline`, `opencode`, `codex`) are `.cmd` / `.bat` shell shims.\n    Node's `child_process.spawn()` with `shell: false` fails with `ENOENT` because Win32\n    `CreateProcessW` only directly executes `.exe` binaries.\n  - Introduced `resolveSpawnTarget` utility that bridges `.cmd` and `.bat` shims via\n    `%ComSpec% /d /s /c` with static argv arrays, preserving SEC-08 (no `shell: true`).\n  - Corrected ACP protocol initialization in `AcpClient`: updated `protocolVersion` to integer `1`\n    per ACP standard, eliminating parameter validation rejections from Cline and OpenCode."
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
      "release": "https://github.com/mohmaedeslam00116/ZEUS/releases/tag/v0.1.0-alpha.3",
      "compare": null,
      "tag": "https://github.com/mohmaedeslam00116/ZEUS/releases/tag/v0.1.0-alpha.3",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "mohmaedeslam00116/ZEUS",
    "markdown": "ZEUS 0.1.0-alpha.3 is a critical stability patch resolving Windows installation shortcut\ndisappearance after updates and fixing the `spawn ENOENT` failure when running headless\nagents (Cline, OpenCode, Codex) installed via npm on Windows.\n\n### Fixed\n\n- **Windows Desktop and Start Menu shortcuts wiped during updates & reinstalls**:\n  - `customInit` in `assets/installer/installer.nsh` previously scrubbed `ZEUS.lnk` during\n    pre-install cleanup. Combined with electron-builder's `$keepShortcuts = \"true\"` upgrade logic,\n    the installer skipped recreating shortcuts, leaving updated machines without Desktop or\n    Start Menu launchers.\n  - Removed shortcut deletion from `customInit`, and added an automated safety net in `customInstall`\n    to ensure `$newStartMenuLink` and `$newDesktopLink` exist and notify Windows Shell.\n  - Enabled `createDesktopShortcut: always` in `electron-builder.yml`.\n- **Headless agent spawning failure on Windows (`spawn cline ENOENT`)**:\n  - On Windows, npm global CLIs (`cline`, `opencode`, `codex`) are `.cmd` / `.bat` shell shims.\n    Node's `child_process.spawn()` with `shell: false` fails with `ENOENT` because Win32\n    `CreateProcessW` only directly executes `.exe` binaries.\n  - Introduced `resolveSpawnTarget` utility that bridges `.cmd` and `.bat` shims via\n    `%ComSpec% /d /s /c` with static argv arrays, preserving SEC-08 (no `shell: true`).\n  - Corrected ACP protocol initialization in `AcpClient`: updated `protocolVersion` to integer `1`\n    per ACP standard, eliminating parameter validation rejections from Cline and OpenCode."
  },
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
  }
];

/** Every released version, newest first. */
export const RELEASE_INDEX: ReleaseIndexEntry[] = [
  {
    "version": "0.1.0-alpha.6",
    "date": "2026-09-21",
    "channel": "preview",
    "summary": "ZEUS 0.1.0-alpha.6 fixes headless ACP agent conversation memory loss and session continuity across turns:",
    "detailed": true
  },
  {
    "version": "0.1.0-alpha.5",
    "date": "2026-09-21",
    "channel": "preview",
    "summary": "ZEUS 0.1.0-alpha.5 resolves headless agent streaming, discovery, and handshake issues across Cline, Codex, and OpenCode on Windows:",
    "detailed": true
  },
  {
    "version": "0.1.0-alpha.4",
    "date": "2026-09-20",
    "channel": "preview",
    "summary": "ZEUS 0.1.0-alpha.4 resolves JSON-RPC wire-format incompatibilities with headless\nagents running under the Agent Client Protocol (ACP) and Codex app-server protocols.",
    "detailed": true
  },
  {
    "version": "0.1.0-alpha.3",
    "date": "2026-09-20",
    "channel": "preview",
    "summary": "ZEUS 0.1.0-alpha.3 is a critical stability patch resolving Windows installation shortcut\ndisappearance after updates and fixing the `spawn ENOENT` failure when running headless\nagents (Cline, OpenCode, Codex) installed via npm on Windows.",
    "detailed": true
  },
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
    "detailed": false
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
