/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Written by `npm run gen:notes` (scripts/gen-release-notes.mjs) from
 * CHANGELOG.md, which is the single source of truth for release notes: the same
 * text becomes the GitHub release body, the in-app release document, and the
 * changelog itself. Re-run the script after editing CHANGELOG.md.
 *
 * Contains the 5 most recent released sections.
 */

/** One release's notes, as authored in CHANGELOG.md. */
export interface ReleaseNotesEntry {
  /** Semantic version, without a leading `v`. */
  version: string;
  /** ISO release date, or null for a section written without one. */
  date: string | null;
  /** The section body as Markdown — headings and bullets, no version heading. */
  markdown: string;
}

/** Newest first. */
export const RELEASE_NOTES: ReleaseNotesEntry[] = [
  {
    version: '0.1.0-alpha.7',
    date: '2026-09-21',
    markdown: `ZEUS 0.1.0-alpha.7 introduces a dedicated collapsible thinking/reasoning process display and fixes tool invocation row layout and RTL alignment issues:

### Added

- **Collapsible thinking/reasoning process display (\`ThinkingBlock\`)**:
  - The model's internal thinking and chain-of-thought reasoning stream is now displayed in its own dedicated, collapsible accordion block separate from conversational text.
  - Features real-time status badges ("Thinking..." / "يفكّر الآن..." while actively reasoning, and "Completed" / "مكتمل" once settled), a monospace pre-wrap transcript view with copy and toggle controls, and full bidirectional layout support.
  - Persisted in SQLite \`agent_messages\` (\`thinking\` column) so reasoning chains are preserved across session reload and app restarts.

### Fixed

- **Duplicated tool invocation rows and mangled RTL display in conversation view**:
  - Fixed duplicate string rendering where colon-delimited tool titles (emitted by Cline and ACP providers like \`fetch_web_content: https://...\`) were displayed twice on the same line.
  - Separated tool command names from arguments during ACP event translation, cleanly populating \`call.name\`, \`call.target\`, and \`call.input\`.
  - Reordered the tool call status dot to lead the invocation row, preventing layout reversal in RTL mode.
  - Added explicit LTR directional enforcement (\`dir="ltr"\`) and monospace formatting for command paths and URLs to eliminate text scrambling and left-edge truncation.`,
  },
  {
    version: '0.1.0-alpha.6',
    date: '2026-09-21',
    markdown: `ZEUS 0.1.0-alpha.6 fixes headless ACP agent conversation memory loss and session continuity across turns:

### Fixed

- **Headless ACP agents (Cline) losing conversational context across turns (\`0 Context used\`)**:
  - In multi-turn sessions, \`AcpRuntime\` previously disposed the underlying child process and ACP session at the end of each turn (\`client.dispose()\` in \`finally\`), forcing every subsequent turn to spawn a clean process with an empty session.
  - Sequential prompts in the same conversation session now maintain and reuse the active child process and ACP session (\`activeSessions\` registry), preserving full context, conversation history, and tool outputs.
  - Added support for ACP \`session/load\` in \`AcpClient\` to gracefully restore saved sessions from disk across application restarts or session reconnection using persisted provider session IDs.
  - \`AgentManager\` now forwards the saved \`providerSessionId\` to runtime adapters as \`resumeSessionId\` and coordinates clean process termination when sessions are explicitly closed or forgotten.`,
  },
  {
    version: '0.1.0-alpha.5',
    date: '2026-09-21',
    markdown: `ZEUS 0.1.0-alpha.5 resolves headless agent streaming, discovery, and handshake issues across Cline, Codex, and OpenCode on Windows:

### Fixed

- **Cline text and thought streaming omitted from conversation UI**:
  - Cline emits streamed text and thinking responses wrapped in ACP v1 nested session updates (\`{"method": "session/update", "params": {"update": {"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": "..."}}}}\`).
  - Previously, \`translateAcpNotification\` only inspected flat \`params.kind === 'textDelta'\`, dropping nested session chunks. ZEUS now unpacks \`agent_message_chunk\`, \`agent_thought_chunk\`, \`tool_call\`, and \`tool_call_update\` so all model outputs, thoughts, and tool actions stream live to the UI.
- **Codex initialize timeout (\`Codex request timed out after 60000ms: method "initialize" (id: 1)\`)**:
  - The Codex app-server emits initial response frames without an explicit \`"jsonrpc": "2.0"\` header (e.g. \`{"id": 1, "result": {...}}\`).
  - \`JsonRpcStreamParser\` previously rejected these frames as invalid JSON-RPC, causing \`initialize\` and subsequent method calls to hang until timeout. The parser now tolerates frames containing \`'id'\` or \`'method'\` without the strict \`"jsonrpc"\` header.
- **OpenCode CLI discovery on Windows (\`The OpenCode CLI is not installed or not found on PATH\`)**:
  - OpenCode installed on Windows under custom or standard system paths (e.g. \`D:\\Program Files\\OpenCode\\opencode-cli.exe\` or \`%LOCALAPPDATA%\\Programs\\@opencode-aidesktop\`) was not detected when not in system PATH or named \`opencode-cli\`.
  - Added binary probing and spawn resolution for both \`opencode\` and \`opencode-cli\` aliases across common Windows installation locations and PATH directories.`,
  },
  {
    version: '0.1.0-alpha.4',
    date: '2026-09-20',
    markdown: `ZEUS 0.1.0-alpha.4 resolves JSON-RPC wire-format incompatibilities with headless
agents running under the Agent Client Protocol (ACP) and Codex app-server protocols.

### Fixed

- **Headless ACP agent parameter validation failures (\`ACP RPC Error [-32602]: Invalid params\`)**:
  - In standard ACP v1, \`session/new\` enforces \`{"required": ["cwd", "mcpServers"]}\`.
    ZEUS previously omitted \`mcpServers\`, triggering schema rejections (\`mcpServers: Invalid input\`)
    in ACP runtimes like Cline and OpenCode. \`mcpServers: []\` is now always included.
  - In ACP v1, \`session/prompt\` requires \`prompt\` to be an array of \`ContentBlock\` objects
    (\`[{ type: 'text', text: ... }]\`). Raw strings previously caused schema rejection
    (\`prompt: Invalid input: expected array, received string\`). Prompts are now normalized
    into standard ACP content blocks.
  - Added \`clientCapabilities\` (fs/terminal) during the initial \`initialize\` handshake.
- **Codex turn dispatch error (\`Codex RPC Error [-32600]: Invalid request: missing field input\`)**:
  - The Codex app-server wire protocol expects prompts structured under \`input\` as content
    blocks rather than a top-level string \`prompt\`. Requests now supply \`input: [{ type: 'text', text: prompt }]\`
    and normalize \`turnId\` from the returned \`turn.id\`.`,
  },
  {
    version: '0.1.0-alpha.3',
    date: '2026-09-20',
    markdown: `ZEUS 0.1.0-alpha.3 is a critical stability patch resolving Windows installation shortcut
disappearance after updates and fixing the \`spawn ENOENT\` failure when running headless
agents (Cline, OpenCode, Codex) installed via npm on Windows.

### Fixed

- **Windows Desktop and Start Menu shortcuts wiped during updates & reinstalls**:
  - \`customInit\` in \`assets/installer/installer.nsh\` previously scrubbed \`ZEUS.lnk\` during
    pre-install cleanup. Combined with electron-builder's \`$keepShortcuts = "true"\` upgrade logic,
    the installer skipped recreating shortcuts, leaving updated machines without Desktop or
    Start Menu launchers.
  - Removed shortcut deletion from \`customInit\`, and added an automated safety net in \`customInstall\`
    to ensure \`$newStartMenuLink\` and \`$newDesktopLink\` exist and notify Windows Shell.
  - Enabled \`createDesktopShortcut: always\` in \`electron-builder.yml\`.
- **Headless agent spawning failure on Windows (\`spawn cline ENOENT\`)**:
  - On Windows, npm global CLIs (\`cline\`, \`opencode\`, \`codex\`) are \`.cmd\` / \`.bat\` shell shims.
    Node's \`child_process.spawn()\` with \`shell: false\` fails with \`ENOENT\` because Win32
    \`CreateProcessW\` only directly executes \`.exe\` binaries.
  - Introduced \`resolveSpawnTarget\` utility that bridges \`.cmd\` and \`.bat\` shims via
    \`%ComSpec% /d /s /c\` with static argv arrays, preserving SEC-08 (no \`shell: true\`).
  - Corrected ACP protocol initialization in \`AcpClient\`: updated \`protocolVersion\` to integer \`1\`
    per ACP standard, eliminating parameter validation rejections from Cline and OpenCode.`,
  },
];

/** The notes for one version, or null when this build does not carry them. */
export function releaseNotesFor(version: string): ReleaseNotesEntry | null {
  const wanted = version.replace(/^v/, '');
  return RELEASE_NOTES.find((r) => r.version === wanted) ?? null;
}
