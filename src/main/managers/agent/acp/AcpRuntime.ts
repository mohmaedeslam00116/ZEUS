/**
 * Headless Agent Client Protocol (ACP) Runtime Adapter for Cline and OpenCode.
 *
 * Implements:
 * - Spawns and configures `cline --acp` and `opencode acp` child processes via `AcpClient`.
 * - Discovers host configuration profiles (`~/.cline`, `~/.config/opencode`) and
 *   injects workspace `cwd` and sanitized environment variables without leaking credentials.
 * - Injects bilingual `LocaleContext` into session `instructions` to respect Arabic/English
 *   conversation guidance while keeping code syntax in English.
 * - Uses `translate.ts` to map ACP streaming notifications and progress events to
 *   canonical ZEUS `ProviderRunBridge` callbacks and `AgentEvent` objects (ADR-0003).
 * - Captures token usage reported by ACP runtimes into session run metrics.
 * - Wires synchronous tool permission gating (`session/request_permission`) to
 *   ZEUS's permission authority (SEC-19).
 */
import type { SessionPermissionMode } from '@shared/types';
import { ARABIC_LOCALE_INSTRUCTION } from '../locale';
import type { ProviderRunBridge } from '../providerBridge';
import type {
  AgentRuntimeAdapter,
  AgentRuntimeStreamCallbacks,
  HeadlessAgentProvider,
  ToolGateFunction,
} from '../types';
import { AcpClient, type ExtendedAcpClientOptions } from './AcpClient';
import { discoverProfile, sanitizeEnvironment } from './profile';
import { newAcpTranslateContext, translateAcpNotification } from './translate';
import type {
  AcpPermissionRequestParams,
  AcpPermissionResult,
  AcpSessionPromptResult,
} from './types';

export interface AcpRuntimeOptions {
  /** CLI executable path override (defaults to 'cline' or 'opencode'). */
  executablePath?: string;
  /** CLI arguments override. Defaults: cline -> ['--acp'], opencode -> ['acp']. */
  args?: string[];
  /** Custom host configuration directory (overrides auto-discovery). */
  configDir?: string;
  /** Extra environment variables passed to the child process. */
  extraEnv?: Record<string, string>;
  /** Request timeout in ms. */
  timeoutMs?: number;
  /** Grace period in ms before SIGKILL. */
  graceMs?: number;
  /** Optional client factory override for hermetic unit testing. */
  clientFactory?: (options: ExtendedAcpClientOptions) => AcpClient;
  /** Optional logger. */
  logger?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, detail?: unknown) => void;
}

interface ActiveAcpSession {
  client: AcpClient;
  acpSessionId: string;
  cwd: string;
  currentTurn?: {
    bridge: ProviderRunBridge;
    context: ReturnType<typeof newAcpTranslateContext>;
    gate?: ToolGateFunction;
    abortSignal: AbortSignal;
  };
}

export class AcpRuntime implements AgentRuntimeAdapter {
  readonly provider: 'cline' | 'opencode';
  private readonly activeSessions = new Map<string, ActiveAcpSession>();
  private isDisposed = false;

  constructor(
    provider: 'cline' | 'opencode' | HeadlessAgentProvider,
    private readonly options: AcpRuntimeOptions = {},
  ) {
    if (provider !== 'cline' && provider !== 'opencode') {
      throw new Error(`Unsupported ACP provider: "${provider}". Only "cline" and "opencode" are supported.`);
    }
    this.provider = provider;
  }

  /**
   * Executes a headless agent run turn, reusing persistent session and child process when available.
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
    resumeSessionId?: string,
  ): Promise<void> {
    if (this.isDisposed) {
      throw new Error(`AcpRuntime for ${this.provider} has been disposed.`);
    }

    const effectiveBridge: ProviderRunBridge = bridge ?? {
      ensureStreaming: () => stream.ensureStreaming(),
      queueDelta: (text) => stream.queueDelta(text),
      finishStreaming: (finalText) => stream.finishStreaming(finalText),
      onToolUse: () => undefined,
      onToolResult: () => undefined,
      onInit: () => undefined,
      onResult: () => undefined,
      diag: (cat, sev, label, detail) =>
        this.options.logger?.(sev === 'warning' ? 'warn' : sev, `[${cat}] ${label}: ${detail ?? ''}`),
    };

    const context = newAcpTranslateContext(sessionId);

    let session = this.activeSessions.get(sessionId);

    // If existing session process terminated or cwd changed, tear down and recreate
    if (session) {
      const isConnected = session.client.isConnected ? session.client.isConnected() : true;
      if (!isConnected || session.cwd !== cwd) {
        session.client.dispose();
        this.activeSessions.delete(sessionId);
        session = undefined;
      }
    }

    if (!session) {
      // 1. Discover host profile and sanitize environment
      const profile = discoverProfile(this.provider, this.options.configDir);
      const extraEnv: Record<string, string> = {
        ...(this.options.extraEnv ?? {}),
        ...(profile.configDir
          ? { [this.provider === 'cline' ? 'CLINE_DIR' : 'OPENCODE_CONFIG_DIR']: profile.configDir }
          : {}),
      };
      const env = sanitizeEnvironment(extraEnv);

      // 2. Resolve default executable and arguments
      const executablePath =
        this.options.executablePath ?? (this.provider === 'cline' ? 'cline' : 'opencode');
      const args = this.options.args ?? (this.provider === 'cline' ? ['--acp'] : ['acp']);

      // 3. Create ACP Client
      const clientFactory = this.options.clientFactory ?? ((opts) => new AcpClient(opts));
      const client = clientFactory({
        executablePath,
        args,
        cwd,
        env,
        timeoutMs: this.options.timeoutMs,
        graceMs: this.options.graceMs,
        logger:
          this.options.logger ??
          ((level, msg) => {
            const currentBridge = this.activeSessions.get(sessionId)?.currentTurn?.bridge ?? effectiveBridge;
            currentBridge.diag('agent', level === 'warn' ? 'warning' : level, msg);
          }),
        onRequestPermission: async (
          params: AcpPermissionRequestParams,
          signal?: AbortSignal,
        ): Promise<AcpPermissionResult> => {
          const activeTurn = this.activeSessions.get(sessionId)?.currentTurn;
          const currentGate = activeTurn?.gate ?? gate;
          const currentSignal = signal ?? activeTurn?.abortSignal ?? abort.signal;

          // SEC-19: Synchronous tool permission gating
          if (currentGate) {
            try {
              const decision = await currentGate(params.toolName, params.input, currentSignal);
              return {
                approved: decision.behavior === 'allow',
                reason: decision.message,
                updatedInput: decision.updatedInput,
              };
            } catch (err) {
              return {
                approved: false,
                reason: err instanceof Error ? err.message : 'Tool permission check failed',
              };
            }
          }

          // Default permission behavior when no explicit gate is passed
          const approved = permMode === 'acceptEdits';
          return {
            approved,
            reason: approved ? undefined : 'Permission denied: tool requires approval.',
          };
        },
        onNotification: (method: string, params: unknown) => {
          const activeTurn = this.activeSessions.get(sessionId)?.currentTurn;
          const targetBridge = activeTurn?.bridge ?? effectiveBridge;
          const targetContext = activeTurn?.context ?? context;
          translateAcpNotification(
            { jsonrpc: '2.0', method, params },
            targetBridge,
            targetContext,
          );
        },
      });

      // 4. Initialization handshake
      await client.start();

      let acpSessionId: string | null = null;

      // 5. Try loading existing session if resumeSessionId is supplied
      if (resumeSessionId && client.loadSession) {
        try {
          const loaded = await client.loadSession(resumeSessionId, cwd);
          if (loaded) {
            acpSessionId = resumeSessionId;
          }
        } catch {
          // Fall back to creating a new session
        }
      }

      // 6. If not loaded, create new ACP session
      if (!acpSessionId) {
        let instructions: string | undefined;
        if (prompt.includes(ARABIC_LOCALE_INSTRUCTION)) {
          instructions = ARABIC_LOCALE_INSTRUCTION;
        }
        acpSessionId = await client.createSession(cwd, instructions);
      }

      effectiveBridge.onInit(acpSessionId);

      session = {
        client,
        acpSessionId,
        cwd,
      };
      this.activeSessions.set(sessionId, session);
    }

    // Bind current turn context for streaming and gating
    session.currentTurn = {
      bridge: effectiveBridge,
      context,
      gate,
      abortSignal: abort.signal,
    };

    try {
      // 7. Start turn streaming
      effectiveBridge.ensureStreaming();

      const result: AcpSessionPromptResult = await session.client.prompt(
        session.acpSessionId,
        prompt,
        abort.signal,
      );

      // 8. Capture and report token usage
      if (result.usage) {
        effectiveBridge.onUsage?.({ ...result.usage });
      } else if (context.usage.totalTokens || context.usage.inputTokens) {
        effectiveBridge.onUsage?.({ ...context.usage });
      }

      const ok = result.stopReason !== 'cancelled';
      effectiveBridge.onResult(ok, context.accumulatedText);
      effectiveBridge.finishStreaming(context.accumulatedText);

      if (!ok) {
        await this.closeSession(sessionId);
      }
    } catch (err) {
      await this.closeSession(sessionId);
      throw err;
    } finally {
      if (session) {
        session.currentTurn = undefined;
      }
    }
  }

  /**
   * Explicitly closes and terminates the ACP client for a session.
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      this.activeSessions.delete(sessionId);
      session.client.dispose();
    }
  }

  /**
   * Terminate active child processes on shutdown.
   */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    for (const session of this.activeSessions.values()) {
      session.client.dispose();
    }
    this.activeSessions.clear();
  }
}
