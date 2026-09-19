/**
 * OpenAI Codex native process adapter implementing AgentRuntimeAdapter (Track B of Spec #50).
 *
 * Implements:
 * - Spawns and manages `codex app-server` via `CodexClient`.
 * - Automatically discovers host configuration and credentials in `~/.codex/` (SEC-14).
 * - Sanitizes process environment variables preventing execution hijacking (SEC-16).
 * - Injects bilingual `LocaleContext` (#54) instructions into thread initialization.
 * - Bridges tool execution approvals into ZEUS's `decideToolUse` core (SEC-19).
 * - Translates streaming notifications into `ProviderRunBridge` callbacks (ADR-0003).
 * - Manages child process tree teardown via `killTree`.
 */
import type { SessionPermissionMode } from '@shared/types';
import type { ProviderRunBridge } from '../providerBridge';
import type {
  AgentRuntimeAdapter,
  AgentRuntimeStreamCallbacks,
  HeadlessAgentProvider,
  ToolGateFunction,
} from '../types';
import { ARABIC_LOCALE_INSTRUCTION } from '../locale';
import { CodexClient } from './CodexClient';
import { discoverCodexProfile, sanitizeCodexEnvironment } from './profile';
import {
  applyUsage,
  newCodexTranslateContext,
  translateCodexNotification,
} from './translate';
import type {
  CodexApprovalRequestParams,
  CodexApprovalResult,
  CodexClientOptions,
  CodexTurnStartResult,
} from './types';

export interface CodexRuntimeOptions {
  binaryPath?: string;
  configDir?: string;
  timeoutMs?: number;
  graceMs?: number;
  extraEnv?: Record<string, string>;
  clientFactory?: (options: CodexClientOptions) => CodexClient;
}

export class CodexRuntime implements AgentRuntimeAdapter {
  readonly provider: HeadlessAgentProvider = 'codex';
  private readonly activeClients = new Map<string, CodexClient>();
  private isDisposed = false;

  constructor(private readonly options: CodexRuntimeOptions = {}) {}

  /**
   * Executes a single turn against OpenAI Codex app-server.
   */
  async run(
    sessionId: string,
    prompt: string,
    cwd: string,
    abort: AbortController,
    permMode: SessionPermissionMode,
    stream: AgentRuntimeStreamCallbacks,
    bridge?: ProviderRunBridge,
    gate?: ToolGateFunction,
  ): Promise<void> {
    if (this.isDisposed) {
      throw new Error('CodexRuntime has been disposed.');
    }

    const effectiveBridge: ProviderRunBridge = bridge ?? {
      ensureStreaming: () => stream.ensureStreaming(),
      queueDelta: (text) => stream.queueDelta(text),
      finishStreaming: (finalText) => stream.finishStreaming(finalText),
      onToolUse: () => undefined,
      onToolResult: () => undefined,
      onInit: () => undefined,
      onResult: () => undefined,
      diag: () => undefined,
    };

    const context = newCodexTranslateContext(sessionId);

    // 1. Discover local CLI credentials & configuration
    const profile = discoverCodexProfile(this.options.configDir);
    const extraEnv = { ...(this.options.extraEnv ?? {}) };
    const env = sanitizeCodexEnvironment(extraEnv);

    // Verify authentication availability (ChatGPT Plus/Pro credentials or API key)
    if (!profile.hasAuth && !env.OPENAI_API_KEY) {
      throw new Error(
        'OpenAI Codex authentication required: no active ChatGPT Plus/Pro subscription credentials found in auth.json and no OPENAI_API_KEY provided.',
      );
    }

    // 2. Resolve binary path
    const binaryPath = this.options.binaryPath ?? 'codex';

    // 3. Create and configure CodexClient
    const clientFactory = this.options.clientFactory ?? ((opts) => new CodexClient(opts));
    const client = clientFactory({
      binaryPath,
      cwd,
      env,
      timeoutMs: this.options.timeoutMs,
      graceMs: this.options.graceMs,
      onRequestApproval: async (
        params: CodexApprovalRequestParams,
      ): Promise<CodexApprovalResult> => {
        // SEC-19: Synchronous tool permission gating
        if (gate) {
          try {
            const input = params.input ?? (params.command ? { command: params.command } : {});
            const decision = await gate(params.toolName, input, abort.signal);
            return {
              approved: decision.behavior === 'allow',
              reason: decision.message,
              updatedInput: decision.updatedInput,
            };
          } catch (err) {
            return {
              approved: false,
              reason: err instanceof Error ? err.message : 'Tool approval check failed',
            };
          }
        }

        // SEC-19: Deny by default when no explicit gate is passed (fail-closed)
        return {
          approved: false,
          reason: 'Permission denied: tool requires approval.',
        };
      },
      onNotification: (method: string, params: unknown) => {
        translateCodexNotification(
          { jsonrpc: '2.0', method, params },
          effectiveBridge,
          context,
        );
      },
      onLog: (level, message) => {
        effectiveBridge.diag('agent', level === 'warn' ? 'warning' : level, message);
      },
    });

    this.activeClients.set(sessionId, client);

    try {
      // 4. Initialization handshake
      await client.start();

      // 5. Extract bilingual instructions if present in prompt
      let instructions: string | undefined;
      if (prompt.includes(ARABIC_LOCALE_INSTRUCTION)) {
        instructions = ARABIC_LOCALE_INSTRUCTION;
      }

      // 6. Start Codex conversation thread
      const threadId = await client.startThread({ cwd, instructions });
      effectiveBridge.onInit(threadId);

      // 7. Start turn streaming
      effectiveBridge.ensureStreaming();

      const result: CodexTurnStartResult = await client.runTurn(
        { threadId, prompt },
        abort.signal,
      );

      // 8. Finalize streaming and emit terminal outcome if not already emitted by notifications
      if (result.usage) {
        applyUsage(result.usage, context, effectiveBridge);
      }
      if (!context.finished) {
        context.finished = true;
        effectiveBridge.finishStreaming(context.accumulatedText);
        effectiveBridge.onResult(true, context.accumulatedText);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      effectiveBridge.diag('error', 'error', msg);
      throw err;
    } finally {
      client.dispose();
      this.activeClients.delete(sessionId);
    }
  }

  /**
   * Disposes of the runtime, terminating any active client process tree.
   */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    for (const client of this.activeClients.values()) {
      client.dispose();
    }
    this.activeClients.clear();
  }
}
