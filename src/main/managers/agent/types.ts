/**
 * Types and constants for headless agent providers (Cline, OpenCode, Codex).
 *
 * Defines model prefixes, provider interfaces, installation guidance, and
 * binary probe structures for the Agent Client Protocol (ACP) and native
 * process adapters.
 */
import type {
  BinaryProbeResult,
  HeadlessAgentProvider,
  SessionPermissionMode,
} from '@shared/types';
import type { AgentProvider } from '@shared/constants';
import type { ProviderRunBridge } from './providerBridge';

export type { HeadlessAgentProvider, BinaryProbeResult };

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

export { PROVIDER_INSTALL_COMMANDS } from '@shared/constants';

/** Human-readable and actionable installation guidance when a binary is missing. */
export const PROVIDER_INSTALL_GUIDANCE: Record<HeadlessAgentProvider, string> = {
  cline:
    'The Cline CLI is not installed or not found on PATH. Install it using: npm install -g cline',
  opencode:
    'The OpenCode CLI is not installed or not found on PATH. Install it using: npm install -g opencode-ai',
  codex:
    'The Codex CLI is not installed or not found on PATH. Install it using: npm install -g @openai/codex',
};

/** Streaming callbacks passed to runtime adapters during execution. */
export interface AgentRuntimeStreamCallbacks {
  ensureStreaming: () => unknown;
  queueDelta: (text: string) => void;
  finishStreaming: (finalText?: string) => void;
}

/** Tool permission gating callback for runtime adapters. */
export type ToolGateFunction = (
  toolName: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<{
  behavior: 'allow' | 'deny';
  message?: string;
  updatedInput?: Record<string, unknown>;
}>;

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
    bridge?: ProviderRunBridge,
    gate?: ToolGateFunction,
    resumeSessionId?: string,
  ): Promise<void>;
  closeSession?(sessionId: string): Promise<void>;
  dispose?(): Promise<void> | void;
}
