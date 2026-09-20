/**
 * Unified Agent Client Protocol (ACP) stdio JSON-RPC 2.0 client engine.
 *
 * Drives headless CLI agents (Cline, OpenCode) over child process stdio:
 * - Manages child process lifecycle with argv-only spawning (SEC-08).
 * - Performs capability exchange and handshake (`initialize`).
 * - Synchronously intercepts tool execution requests (`session/request_permission`)
 *   and gates them through ZEUS's permission authority (SEC-19).
 * - Provides graceful cancellation (`session/cancel`) and process tree cleanup
 *   via `killTree` on abort or termination.
 */
import path from 'node:path';
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { ACP_LIMITS } from '@shared/constants';
import { killTree } from '../killTree';
import { resolveSpawnTarget } from '../resolveSpawnTarget';
import { redactSecrets } from '../../graph/redact';
import {
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
  JsonRpcStreamParser,
  serializeJsonRpc,
} from './jsonRpc';
import type {
  AcpClientOptions,
  AcpContentBlock,
  AcpInitializeParams,
  AcpInitializeResult,
  AcpPermissionRequestParams,
  AcpPermissionResult,
  AcpSessionCancelParams,
  AcpSessionNewParams,
  AcpSessionNewResult,
  AcpSessionPromptParams,
  AcpSessionPromptResult,
  JsonRpcId,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
} from './types';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

export type SpawnFunction = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => ChildProcess;

export interface ExtendedAcpClientOptions extends AcpClientOptions {
  /** Optional spawn function override for hermetic unit testing. */
  spawnFn?: SpawnFunction;
}

export class AcpClient {
  private child: ChildProcess | null = null;
  private parser: JsonRpcStreamParser | null = null;
  private nextRequestId = 1;
  private readonly pendingRequests = new Map<JsonRpcId, PendingRequest>();
  private stderrTail = '';
  private currentAbortSignal?: AbortSignal;
  private activeSessionId: string | null = null;
  private isDisposed = false;

  constructor(private readonly options: ExtendedAcpClientOptions) {}

  /**
   * Spawns the CLI child process and completes the protocol initialization handshake.
   */
  async start(): Promise<AcpInitializeResult> {
    if (this.child) {
      throw new Error('AcpClient process is already running.');
    }

    const spawnFn = (this.options.spawnFn ?? spawn) as SpawnFunction;
    const { executablePath, args, cwd, env } = this.options;

    // SEC-11: Working directory must be an absolute path
    if (!path.isAbsolute(cwd)) {
      throw new Error(`Working directory must be an absolute path: "${cwd}"`);
    }

    const effectiveEnv = env ?? process.env;
    const target = resolveSpawnTarget(executablePath, args, { env: effectiveEnv });

    // SEC-08: argv-only spawning (shell: false by default).
    const child = spawnFn(target.command, target.args, {
      cwd,
      env: effectiveEnv,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child = child;

    // Prevent uncaught EPIPE errors if child process exits unexpectedly
    child.stdin?.on('error', () => undefined);

    this.parser = new JsonRpcStreamParser(
      (msg) => this.handleIncomingMessage(msg),
      (err) => {
        // SEC-16: Redact raw frame payload to prevent leaking secrets/tokens
        this.options.logger?.(
          'warn',
          `Malformed JSON-RPC frame received: ${err.message}`,
        );
      },
    );

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string | Buffer) => {
      this.parser?.feed(chunk);
    });

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-ACP_LIMITS.stderrTailMax);
      const text = redactSecrets(chunk.trim());
      if (text.length > 0) {
        this.options.logger?.('info', `[${this.options.executablePath} stderr] ${text}`);
      }
    });

    child.on('error', (err: Error) => {
      this.options.logger?.('error', `ACP child process error: ${err.message}`, err);
      this.rejectAllPending(new Error(`ACP child process error: ${err.message}`));
      if (this.child) {
        killTree(this.child, this.options.graceMs ?? ACP_LIMITS.killGraceMs);
        this.child = null;
      }
    });

    child.on('close', (code: number | null, signal: string | null) => {
      this.parser?.flush();
      const exitInfo = `code ${code ?? 'unknown'}, signal ${signal ?? 'none'}`;
      const errDetail = redactSecrets(this.stderrTail.trim());
      const errMsg = errDetail
        ? `ACP process exited prematurely (${exitInfo}): ${errDetail}`
        : `ACP process exited prematurely (${exitInfo})`;

      this.options.logger?.(
        code === 0 ? 'info' : 'warn',
        `ACP child process closed (${exitInfo})`,
      );

      this.rejectAllPending(new Error(errMsg));
      this.child = null;
    });

    // Perform ACP capabilities exchange per ACP specification
    const initParams: AcpInitializeParams = {
      protocolVersion: 1,
      clientInfo: {
        name: 'zeus',
        version: '0.2.0',
      },
      clientCapabilities: {
        fs: {
          readTextFile: false,
          writeTextFile: false,
        },
        terminal: false,
      },
      capabilities: {
        tools: {
          requestPermission: true,
        },
        streaming: true,
      },
    };

    const initResult = await this.sendRequest<AcpInitializeResult>(
      'initialize',
      initParams,
    );

    // Announce client readiness
    this.sendNotification('notifications/initialized', {});

    return initResult;
  }

  /**
   * Initiates an ACP session with the agent (`session/new`).
   */
  async createSession(params: AcpSessionNewParams): Promise<string>;
  async createSession(
    cwd: string,
    instructions?: string,
    env?: Record<string, string>,
  ): Promise<string>;
  async createSession(
    cwdOrParams: string | AcpSessionNewParams,
    instructions?: string,
    env?: Record<string, string>,
  ): Promise<string> {
    const rawParams: AcpSessionNewParams =
      typeof cwdOrParams === 'string'
        ? { cwd: cwdOrParams, instructions, env }
        : cwdOrParams;

    // SEC-11: Working directory must be an absolute path
    if (!path.isAbsolute(rawParams.cwd)) {
      throw new Error(`Session working directory must be an absolute path: "${rawParams.cwd}"`);
    }

    const payload: Record<string, unknown> = {
      cwd: rawParams.cwd,
      mcpServers: rawParams.mcpServers ?? [],
    };
    if (rawParams.additionalDirectories) {
      payload.additionalDirectories = rawParams.additionalDirectories;
    }
    if (rawParams.instructions) {
      payload.instructions = rawParams.instructions;
    }
    if (rawParams.env) {
      payload.env = rawParams.env;
    }

    const res = await this.sendRequest<AcpSessionNewResult>('session/new', payload);
    this.activeSessionId = res.sessionId;
    return res.sessionId;
  }

  /**
   * Prompts the agent within an active session (`session/prompt`).
   * Blocks until turn completion while streaming updates and synchronously gating tools.
   */
  async prompt(
    sessionId: string,
    promptText: string | AcpContentBlock[],
    signal?: AbortSignal,
  ): Promise<AcpSessionPromptResult> {
    this.currentAbortSignal = signal;

    const onAbort = (): void => {
      this.cancelSession(sessionId).catch((err) => {
        this.options.logger?.(
          'warn',
          `Failed to cancel ACP session on abort: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
      if (this.child) {
        killTree(this.child, this.options.graceMs ?? ACP_LIMITS.killGraceMs);
      }
    };

    if (signal?.aborted) {
      onAbort();
      return { stopReason: 'cancelled' };
    }

    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const promptPayload: AcpContentBlock[] = Array.isArray(promptText)
        ? (promptText as AcpContentBlock[])
        : [{ type: 'text', text: promptText }];
      const params = {
        sessionId,
        prompt: promptPayload,
      };
      const result = await this.sendRequest<AcpSessionPromptResult>(
        'session/prompt',
        params,
      );
      return result;
    } finally {
      signal?.removeEventListener('abort', onAbort);
      this.currentAbortSignal = undefined;
    }
  }

  /**
   * Signals cancellation of an in-flight prompt session (`session/cancel`).
   */
  async cancelSession(sessionId: string): Promise<void> {
    const params: AcpSessionCancelParams = { sessionId };
    this.sendNotification('session/cancel', params);
  }

  /**
   * Sends a JSON-RPC request and returns a Promise resolving with the result.
   */
  sendRequest<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.child || this.child.stdin?.destroyed) {
      return Promise.reject(new Error('Cannot send request: ACP process is not running.'));
    }

    const id = this.nextRequestId++;
    const timeoutMs = this.options.timeoutMs ?? ACP_LIMITS.requestTimeoutMs;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`ACP request "${method}" (id: ${id}) timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      // Don't hold Node event loop open solely for ACP request timeouts
      timer.unref?.();

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      const req: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.writeRaw(serializeJsonRpc(req));
    });
  }

  /**
   * Sends a JSON-RPC notification (fire-and-forget).
   */
  sendNotification(method: string, params?: unknown): void {
    if (!this.child || this.child.stdin?.destroyed) return;
    const notif: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.writeRaw(serializeJsonRpc(notif));
  }

  /**
   * Sends a JSON-RPC response back to the child process.
   */
  sendResponse(res: JsonRpcResponse): void {
    if (!this.child || this.child.stdin?.destroyed) return;
    this.writeRaw(serializeJsonRpc(res));
  }

  /**
   * Shuts down the client, kills child process tree, and rejects pending requests.
   */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    if (this.activeSessionId) {
      try {
        this.cancelSession(this.activeSessionId);
      } catch {
        // ignore
      }
    }

    this.rejectAllPending(new Error('AcpClient has been disposed.'));

    if (this.child) {
      killTree(this.child, this.options.graceMs ?? ACP_LIMITS.killGraceMs);
      this.child = null;
    }
  }

  /**
   * Dispatch incoming JSON-RPC messages from the child process.
   */
  private async handleIncomingMessage(msg: JsonRpcMessage): Promise<void> {
    if (isJsonRpcResponse(msg)) {
      this.handleResponse(msg);
      return;
    }

    if (isJsonRpcNotification(msg)) {
      this.options.onNotification?.(msg.method, msg.params);
      return;
    }

    if (isJsonRpcRequest(msg)) {
      await this.handleIncomingRequest(msg);
    }
  }

  /**
   * Resolve or reject an outgoing request that received a response.
   */
  private handleResponse(res: JsonRpcResponse): void {
    if (res.id === null) return;
    const pending = this.pendingRequests.get(res.id);
    if (!pending) return;

    this.pendingRequests.delete(res.id);
    clearTimeout(pending.timer);

    if ('error' in res) {
      pending.reject(
        new Error(`ACP RPC Error [${res.error.code}]: ${res.error.message}`),
      );
    } else {
      pending.resolve(res.result);
    }
  }

  /**
   * Synchronously intercept inbound requests from the agent process.
   *
   * SEC-19: `session/request_permission` pauses child execution until ZEUS's
   * permission gate callback resolves with approved/denied.
   */
  private async handleIncomingRequest(req: JsonRpcRequest): Promise<void> {
    if (req.method === 'session/request_permission') {
      const params = (req.params ?? {}) as AcpPermissionRequestParams;
      try {
        const decision: AcpPermissionResult = await this.options.onRequestPermission(
          params,
          this.currentAbortSignal,
        );

        const approved = Boolean(decision.approved);
        const reason = approved
          ? decision.reason
          : (decision.reason || 'Permission denied by user or security policy');

        this.sendResponse({
          jsonrpc: '2.0',
          id: req.id,
          result: {
            approved,
            reason,
            updatedInput: decision.updatedInput,
          },
        });
      } catch (err) {
        // Gating failure denies by default per SEC-19
        this.sendResponse({
          jsonrpc: '2.0',
          id: req.id,
          result: {
            approved: false,
            reason: err instanceof Error ? err.message : 'Permission request evaluation failed',
          },
        });
      }
      return;
    }

    // Unrecognized incoming method -> return MethodNotFound error (-32601)
    this.sendResponse({
      jsonrpc: '2.0',
      id: req.id,
      error: {
        code: -32601,
        message: `Method "${req.method}" not recognized by ZEUS ACP client.`,
      },
    });
  }

  private writeRaw(data: string): void {
    try {
      this.child?.stdin?.write(data);
    } catch (err) {
      this.options.logger?.(
        'error',
        `Failed to write to ACP stdin: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(err);
      this.pendingRequests.delete(id);
    }
  }
}
