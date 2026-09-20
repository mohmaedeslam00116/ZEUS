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
  {
    version: '0.1.0-alpha.2',
    date: '2026-09-19',
    markdown: `ZEUS 0.1.0-alpha.2 delivers the complete ZEUS v0.2.0 milestone, introducing comprehensive
bidirectional Arabic localization across the application shell and expanding the coding agent
ecosystem to support headless Cline, OpenCode, and OpenAI Codex behind ZEUS's provider-neutral
orchestration seam.

### Major user-visible changes

- **Bidirectional Arabic localization & RTL layout system (ADR-0011)**:
  - Added Arabic (\`'ar'\`) and English (\`'en'\`) language switching in Settings › Appearance with
    zero-restart, instantaneous in-memory catalog updates.
  - Implemented Canvas-Only RTL as default, preserving physical muscle-memory navigation for the
    Sessions sidebar and Activity drawer while presenting the central conversation and prompt
    canvas in natural right-to-left layout.
  - Optional Full Mirror mode (\`'full-rtl'\`) flips the entire desktop chrome when preferred.
  - Cairo Arabic typography (\`--font-sans-ar\`) with relaxed leading to prevent diacritic clipping.
  - Strict LTR isolation (\`unicode-bidi: isolate; direction: ltr !important\`) enforced across all
    code blocks, diff views, file paths, and terminal streams.
- **Bilingual agent prompt guidance & English Conventional Commits**:
  - Centralized \`LocaleContext\` in \`AgentManager\`: when Arabic interface or guidance is active,
    agents are instructed to reason and converse in Modern Standard Arabic while keeping all code,
    terminal commands, symbol names, file paths, and parameters strictly in ASCII/English.
  - Automated git commit generation (\`COMMIT_SYSTEM_PROMPT\`) preserves standard English
    Conventional Commits (\`feat:\`, \`fix:\`) for global CI/CD compatibility.
- **Headless agent provider expansion (Cline, OpenCode, OpenAI Codex)**:
  - Support for autonomous CLI agents running headlessly behind ZEUS's unified permission core:
    \`cline\`, \`opencode\`, and \`codex\`.
  - Added \`AcpRuntime\` driving \`cline --acp\` and \`opencode acp\` via stdio JSON-RPC Agent Client Protocol.
  - Added native \`CodexRuntime\` interfacing directly with \`codex app-server\` over stdio JSON-RPC,
    eliminating harness-level tool approval bypasses.
  - Automatic local credential and profile discovery (\`~/.codex/auth.json\`, \`~/.cline\`, \`~/.config/opencode\`),
    allowing ChatGPT Plus/Pro subscribers to use Codex without pay-per-token API keys.
  - Settings › Agent displays live CLI probe availability and actionable copy-paste installation commands.
- **Strict security & permission invariants (SEC-14, SEC-16, SEC-19)**:
  - Synchronous fail-closed tool permission gating (\`decideToolUse\`) for all tool calls from Cline,
    OpenCode, and Codex, blocking execution until approved by user or session policy.
  - Crown-jewel database and secrets paths (\`userData/zeus.db\`, \`userData/secrets/\`) strictly off-limits.
  - Stdio debug streams and diagnostic logging automatically redact API tokens, bearer keys, and credentials.
  - Complete process and abort-signal isolation across concurrent multi-provider sessions.

### Installing (Windows, unsigned)

1. Download \`ZEUS-Setup-0.1.0-alpha.2-x64.exe\` from this release.
2. If SmartScreen appears, choose **More info** → **Run anyway** — expected for an unsigned build.
   Verify the SHA-256 checksum against \`SHA256SUMS\`.
3. The installer is per-user (no administrator rights required). If updating from \`v0.1.0-alpha.1\`,
   ZEUS will detect this update automatically via the in-app update channel.`,
  },
];

/** The notes for one version, or null when this build does not carry them. */
export function releaseNotesFor(version: string): ReleaseNotesEntry | null {
  const wanted = version.replace(/^v/, '');
  return RELEASE_NOTES.find((r) => r.version === wanted) ?? null;
}
