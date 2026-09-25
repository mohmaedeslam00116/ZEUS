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
    "version": "0.1.0-alpha.8",
    "date": "2026-09-25",
    "channel": "preview",
    "codename": null,
    "gitTag": "v0.1.0-alpha.8",
    "commit": null,
    "buildNumber": null,
    "summary": "ZEUS 0.1.0-alpha.8 delivers the first-party Native Agent Engine and Multi-Provider Hub (Master Spec #61):",
    "sections": [
      {
        "category": "added",
        "title": "Added",
        "items": [
          {
            "lead": "First-Party Native Agent Runtime (`NativeAgentRuntime`)",
            "text": ":\n  - Direct HTTP/SSE streaming connection to Google Gemini, Anthropic Claude, OpenAI, DeepSeek, OpenRouter, local Ollama, and Kilo Gateway without external CLI dependencies.\n  - Context Compactor with sliding window token management, SQLite message history hydration, and bilingual Arabic `LocaleContext` guidance.\n  - Native Thinking/Reasoning block support separating model thought streams from conversation text."
          },
          {
            "lead": "Native Tool Suite with 3-Layer Security Gating (SEC-19)",
            "text": ":\n  - Built-in file system tools (`read_file`, `write_file`, `edit_file` with unified diff preview), sandboxed command execution (`run_command`), codebase search (`search_codebase`), and SSRF-guarded web fetch (`fetch_web_content`).\n  - Synchronous 3-layer security gating: workspace containment & crown jewels protection, interactive user permission approval, and sandboxed execution."
          },
          {
            "lead": "Dynamic Model Catalog Service",
            "text": ":\n  - Live model discovery per provider with 24-hour TTL SQLite caching and offline fallback.\n  - Free vs Paid tier badging and context window size metadata."
          },
          {
            "lead": "Modern Model Selector & Provider Settings UI",
            "text": ":\n  - Filterable, keyboard-accessible dropdown with Free/Paid badges, context metrics, and provider grouping.\n  - Dedicated \"AI Providers\" settings tab with API key encryption in `SafeStorage`, custom base URLs, test connection button, and one-click import from Cline / OpenCode."
          }
        ],
        "markdown": "- **First-Party Native Agent Runtime (`NativeAgentRuntime`)**:\n  - Direct HTTP/SSE streaming connection to Google Gemini, Anthropic Claude, OpenAI, DeepSeek, OpenRouter, local Ollama, and Kilo Gateway without external CLI dependencies.\n  - Context Compactor with sliding window token management, SQLite message history hydration, and bilingual Arabic `LocaleContext` guidance.\n  - Native Thinking/Reasoning block support separating model thought streams from conversation text.\n- **Native Tool Suite with 3-Layer Security Gating (SEC-19)**:\n  - Built-in file system tools (`read_file`, `write_file`, `edit_file` with unified diff preview), sandboxed command execution (`run_command`), codebase search (`search_codebase`), and SSRF-guarded web fetch (`fetch_web_content`).\n  - Synchronous 3-layer security gating: workspace containment & crown jewels protection, interactive user permission approval, and sandboxed execution.\n- **Dynamic Model Catalog Service**:\n  - Live model discovery per provider with 24-hour TTL SQLite caching and offline fallback.\n  - Free vs Paid tier badging and context window size metadata.\n- **Modern Model Selector & Provider Settings UI**:\n  - Filterable, keyboard-accessible dropdown with Free/Paid badges, context metrics, and provider grouping.\n  - Dedicated \"AI Providers\" settings tab with API key encryption in `SafeStorage`, custom base URLs, test connection button, and one-click import from Cline / OpenCode."
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
      "release": "https://github.com/mohmaedeslam00116/ZEUS/releases/tag/v0.1.0-alpha.8",
      "compare": null,
      "tag": "https://github.com/mohmaedeslam00116/ZEUS/releases/tag/v0.1.0-alpha.8",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "mohmaedeslam00116/ZEUS",
    "markdown": "ZEUS 0.1.0-alpha.8 delivers the first-party Native Agent Engine and Multi-Provider Hub (Master Spec #61):\n\n### Added\n\n- **First-Party Native Agent Runtime (`NativeAgentRuntime`)**:\n  - Direct HTTP/SSE streaming connection to Google Gemini, Anthropic Claude, OpenAI, DeepSeek, OpenRouter, local Ollama, and Kilo Gateway without external CLI dependencies.\n  - Context Compactor with sliding window token management, SQLite message history hydration, and bilingual Arabic `LocaleContext` guidance.\n  - Native Thinking/Reasoning block support separating model thought streams from conversation text.\n- **Native Tool Suite with 3-Layer Security Gating (SEC-19)**:\n  - Built-in file system tools (`read_file`, `write_file`, `edit_file` with unified diff preview), sandboxed command execution (`run_command`), codebase search (`search_codebase`), and SSRF-guarded web fetch (`fetch_web_content`).\n  - Synchronous 3-layer security gating: workspace containment & crown jewels protection, interactive user permission approval, and sandboxed execution.\n- **Dynamic Model Catalog Service**:\n  - Live model discovery per provider with 24-hour TTL SQLite caching and offline fallback.\n  - Free vs Paid tier badging and context window size metadata.\n- **Modern Model Selector & Provider Settings UI**:\n  - Filterable, keyboard-accessible dropdown with Free/Paid badges, context metrics, and provider grouping.\n  - Dedicated \"AI Providers\" settings tab with API key encryption in `SafeStorage`, custom base URLs, test connection button, and one-click import from Cline / OpenCode."
  },
  {
    "version": "0.1.0-alpha.7",
    "date": "2026-09-21",
    "channel": "preview",
    "codename": null,
    "gitTag": "v0.1.0-alpha.7",
    "commit": null,
    "buildNumber": null,
    "summary": "ZEUS 0.1.0-alpha.7 introduces a dedicated collapsible thinking/reasoning process display and fixes tool invocation row layout and RTL alignment issues:",
    "sections": [
      {
        "category": "added",
        "title": "Added",
        "items": [
          {
            "lead": "Collapsible thinking/reasoning process display (`ThinkingBlock`)",
            "text": ":\n  - The model's internal thinking and chain-of-thought reasoning stream is now displayed in its own dedicated, collapsible accordion block separate from conversational text.\n  - Features real-time status badges (\"Thinking...\" / \"يفكّر الآن...\" while actively reasoning, and \"Completed\" / \"مكتمل\" once settled), a monospace pre-wrap transcript view with copy and toggle controls, and full bidirectional layout support.\n  - Persisted in SQLite `agent_messages` (`thinking` column) so reasoning chains are preserved across session reload and app restarts."
          }
        ],
        "markdown": "- **Collapsible thinking/reasoning process display (`ThinkingBlock`)**:\n  - The model's internal thinking and chain-of-thought reasoning stream is now displayed in its own dedicated, collapsible accordion block separate from conversational text.\n  - Features real-time status badges (\"Thinking...\" / \"يفكّر الآن...\" while actively reasoning, and \"Completed\" / \"مكتمل\" once settled), a monospace pre-wrap transcript view with copy and toggle controls, and full bidirectional layout support.\n  - Persisted in SQLite `agent_messages` (`thinking` column) so reasoning chains are preserved across session reload and app restarts."
      },
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "Duplicated tool invocation rows and mangled RTL display in conversation view",
            "text": ":\n  - Fixed duplicate string rendering where colon-delimited tool titles (emitted by Cline and ACP providers like `fetch_web_content: https://...`) were displayed twice on the same line.\n  - Separated tool command names from arguments during ACP event translation, cleanly populating `call.name`, `call.target`, and `call.input`.\n  - Reordered the tool call status dot to lead the invocation row, preventing layout reversal in RTL mode.\n  - Added explicit LTR directional enforcement (`dir=\"ltr\"`) and monospace formatting for command paths and URLs to eliminate text scrambling and left-edge truncation."
          }
        ],
        "markdown": "- **Duplicated tool invocation rows and mangled RTL display in conversation view**:\n  - Fixed duplicate string rendering where colon-delimited tool titles (emitted by Cline and ACP providers like `fetch_web_content: https://...`) were displayed twice on the same line.\n  - Separated tool command names from arguments during ACP event translation, cleanly populating `call.name`, `call.target`, and `call.input`.\n  - Reordered the tool call status dot to lead the invocation row, preventing layout reversal in RTL mode.\n  - Added explicit LTR directional enforcement (`dir=\"ltr\"`) and monospace formatting for command paths and URLs to eliminate text scrambling and left-edge truncation."
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
      "release": "https://github.com/mohmaedeslam00116/ZEUS/releases/tag/v0.1.0-alpha.7",
      "compare": null,
      "tag": "https://github.com/mohmaedeslam00116/ZEUS/releases/tag/v0.1.0-alpha.7",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "mohmaedeslam00116/ZEUS",
    "markdown": "ZEUS 0.1.0-alpha.7 introduces a dedicated collapsible thinking/reasoning process display and fixes tool invocation row layout and RTL alignment issues:\n\n### Added\n\n- **Collapsible thinking/reasoning process display (`ThinkingBlock`)**:\n  - The model's internal thinking and chain-of-thought reasoning stream is now displayed in its own dedicated, collapsible accordion block separate from conversational text.\n  - Features real-time status badges (\"Thinking...\" / \"يفكّر الآن...\" while actively reasoning, and \"Completed\" / \"مكتمل\" once settled), a monospace pre-wrap transcript view with copy and toggle controls, and full bidirectional layout support.\n  - Persisted in SQLite `agent_messages` (`thinking` column) so reasoning chains are preserved across session reload and app restarts.\n\n### Fixed\n\n- **Duplicated tool invocation rows and mangled RTL display in conversation view**:\n  - Fixed duplicate string rendering where colon-delimited tool titles (emitted by Cline and ACP providers like `fetch_web_content: https://...`) were displayed twice on the same line.\n  - Separated tool command names from arguments during ACP event translation, cleanly populating `call.name`, `call.target`, and `call.input`.\n  - Reordered the tool call status dot to lead the invocation row, preventing layout reversal in RTL mode.\n  - Added explicit LTR directional enforcement (`dir=\"ltr\"`) and monospace formatting for command paths and URLs to eliminate text scrambling and left-edge truncation."
  },
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
  }
];

/** Every released version, newest first. */
export const RELEASE_INDEX: ReleaseIndexEntry[] = [
  {
    "version": "0.1.0-alpha.8",
    "date": "2026-09-25",
    "channel": "preview",
    "summary": "ZEUS 0.1.0-alpha.8 delivers the first-party Native Agent Engine and Multi-Provider Hub (Master Spec #61):",
    "detailed": true
  },
  {
    "version": "0.1.0-alpha.7",
    "date": "2026-09-21",
    "channel": "preview",
    "summary": "ZEUS 0.1.0-alpha.7 introduces a dedicated collapsible thinking/reasoning process display and fixes tool invocation row layout and RTL alignment issues:",
    "detailed": true
  },
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
    "detailed": false
  },
  {
    "version": "0.1.0-alpha.2",
    "date": "2026-09-19",
    "channel": "preview",
    "summary": "ZEUS 0.1.0-alpha.2 delivers the complete ZEUS v0.2.0 milestone, introducing comprehensive\nbidirectional Arabic localization across the application shell and expanding the coding agent\necosystem to support headless Cline, OpenCode, and OpenAI Codex behind ZEUS's provider-neutral\norchestration seam.",
    "detailed": false
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
