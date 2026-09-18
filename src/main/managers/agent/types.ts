/**
 * Types and constants for headless agent providers (Cline, OpenCode, Codex).
 *
 * Defines model prefixes, provider interfaces, installation guidance, and
 * binary probe structures for the Agent Client Protocol (ACP) and native
 * process adapters.
 */
import type { SessionPermissionMode } from '@shared/types';
import type { AgentProvider } from '@shared/constants';

/** Headless CLI agent providers introduced in Spec #50. */
export type HeadlessAgentProvider = 'cline' | 'opencode' | 'codex';

/** Canonical model prefixes for headless CLI agents. */
export const CLINE_MODEL_PREFIX = 'cline:';
export const OPENCODE_MODEL_PREFIX = 'opencode:';
export const CODEX_MODEL_PREFIX = 'codex:';
export const OPENAI_CODEX_MODEL = 'openai-codex';

/** Default CLI executable names per provider. */
export const PROVIDER_BINARIES: Record<HeadlessAgentProvider, string> = {
  cline: 'cline',
  opencode: 'opencode',
  codex: 'codex',
};

/** Recommended CLI installation commands. */
export const PROVIDER_INSTALL_COMMANDS: Record<HeadlessAgentProvider, string> = {
  cline: 'npm install -g cline',
  opencode: 'npm install -g opencode-ai',
  codex: 'npm install -g @openai/codex',
};

/** Human-readable and actionable installation guidance when a binary is missing. */
export const PROVIDER_INSTALL_GUIDANCE: Record<HeadlessAgentProvider, string> = {
  cline:
    'The Cline CLI is not installed or not found on PATH. Install it using: npm install -g cline',
  opencode:
    'The OpenCode CLI is not installed or not found on PATH. Install it using: npm install -g opencode-ai',
  codex:
    'The Codex CLI is not installed or not found on PATH. Install it using: npm install -g @openai/codex',
};

/** Result of probing host PATH for an agent CLI executable. */
export interface BinaryProbeResult {
  available: boolean;
  binaryName: string;
  path?: string;
  version?: string;
  error?: string;
  installGuide: string;
}

/** Streaming callbacks passed to runtime adapters during execution. */
export interface AgentRuntimeStreamCallbacks {
  ensureStreaming: () => unknown;
  queueDelta: (text: string) => void;
  finishStreaming: (finalText?: string) => void;
}

/** Unified interface for headless agent runtime adapters (ACP and native process). */
export interface AgentRuntimeAdapter {
  readonly provider: HeadlessAgentProvider | AgentProvider;
  run(
    sessionId: string,
    prompt: string,
    cwd: string,
    abort: AbortController,
    permMode: SessionPermissionMode,
    stream: AgentRuntimeStreamCallbacks,
  ): Promise<void>;
}
