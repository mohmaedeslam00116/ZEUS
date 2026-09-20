/**
 * Client for OpenAI Codex native app-server communicating over stdio JSON-RPC.
 *
 * Implements:
 * - Spawning and lifecycle management for `codex app-server` (SEC-08).
 * - Enforcing absolute path containment on process cwd and threads (SEC-11).
 * - Protocol initialization handshake (`initialize` / `initialized`).
 * - Thread and turn management (`thread/start`, `turn/start`, `turn/cancel`).
 * - Synchronous tool approval gating (`approval/request` / SEC-19).
 * - Process tree cleanup via `killTree` on error, abort, and teardown.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { CODEX_LIMITS } from '@shared/constants';
import { killTree } from '../killTree';
import { resolveSpawnTarget } from '../resolveSpawnTarget';
import { redactSecrets } from '../../graph/redact';
import {
  JsonRpcStreamParser,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
  serializeJsonRpc,
} from '../acp/jsonRpc';
import { sanitizeCodexEnvironment } from './profile';
import type {
  CodexApprovalRequestParams,
  CodexApprovalResult,
  CodexClientOptions,
  CodexInitializeParams,
  CodexInitializeResult,
  CodexThreadStartParams,
  CodexThreadStartResult,
  CodexTurnStartParams,
  CodexTurnStartResult,
  JsonRpcError,
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

export class CodexClient {
  private child: ChildProcess | null = null;
  private parser: JsonRpcStreamParser | null = null;
  private requestIdCounter = 1;
  private readonly pendingRequests = new Map<JsonRpcId, PendingRequest>();
  private disposed = false;
  private stderrTail = '';

  constructor(private readonly options: CodexClientOptions) {}

  /**
   * Spawns the `codex app-server` process and completes the protocol initialization handshake.
   */
  async start(): Promise<CodexInitializeResult> {
    if (this.child) {
      throw new Error('CodexClient process is already running.');
    }
    if (this.disposed) {
      throw new Error('CodexClient has been disposed and cannot be restarted.');
    }

    const binary = this.options.binaryPath ?? 'codex';
    const effectiveCwd = this.options.cwd;

    // SEC-11: working directory must be explicitly provided and absolute
    if (!effectiveCwd || !path.isAbsolute(effectiveCwd)) {
      throw new Error(
        `Codex process working directory must be an absolute path: ${effectiveCwd ?? 'undefined'}`,
      );
    }

    const env = sanitizeCodexEnvironment(this.options.env);
    const target = resolveSpawnTarget(binary, ['app-server'], { env });

    const spawnFn = this.options.spawnFn ?? spawn;
    // SEC-08: spawn directly without shell wrapping
    const child = spawnFn(target.command, target.args, {
      cwd: effectiveCwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });

    this.child = child;

    // Guard against EPIPE crashes on sudden child exit
    child.stdin?.on('error', () => undefined);

    // Bounded stderr accumulation for crash diagnostics
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-CODEX_LIMITS.stderrTailMax);
      const text = redactSecrets(chunk.trim());
      if (text.length > 0) {
        this.options.onLog?.('info', `[codex stderr] ${text}`);
      }
    });

    // Wire JSON-RPC stream parser
    this.parser = new JsonRpcStreamParser(
      (msg) => this.handleInboundMessage(msg),
      (err) => {
        this.options.onError?.(err);
      },
      CODEX_LIMITS.maxBuffer,
    );

    child.stdout?.on('data', (chunk: Buffer) => {
      this.parser?.feed(chunk);
    });

    child.on('error', (err) => {
      this.options.onLog?.('error', `Codex process error: ${err.message}`);
      this.rejectAllPending(new Error(`Codex process error: ${err.message}`));
      this.options.onError?.(err);
      if (this.child) {
        killTree(this.child, this.options.graceMs ?? CODEX_LIMITS.killGraceMs);
      }
    });

    child.on('exit', (code, signal) => {
      const errDetail = redactSecrets(this.stderrTail.trim());
      const exitReason = errDetail
        ? `Codex process exited with code ${code ?? 'null'} (signal: ${signal ?? 'none'}). Stderr tail: ${errDetail}`
        : `Codex process exited with code ${code ?? 'null'} (signal: ${signal ?? 'none'})`;
      if (code !== 0 && code !== null) {
        this.options.onLog?.('warn', exitReason);
      }
      this.rejectAllPending(new Error(exitReason));
    });

    // Protocol handshake: initialize -> initialized
    const initParams: CodexInitializeParams = {
      clientInfo: {
        name: 'zeus',
        version: '0.2.0',
      },
      capabilities: {
        tools: {
          approval: true,
        },
        streaming: true,
      },
    };

    const initResult = await this.sendRequest<CodexInitializeResult>(
      'initialize',
      initParams,
    );
    this.sendNotification('initialized');

    return initResult;
  }

  /**
   * Starts a new conversation thread on the Codex app-server.
   */
  async startThread(params: CodexThreadStartParams): Promise<string> {
    if (!path.isAbsolute(params.cwd)) {
      throw new Error(`Thread working directory must be absolute: ${params.cwd}`);
    }

    const res = await this.sendRequest<CodexThreadStartResult>('thread/start', params);
    if (!res || !res.threadId) {
      throw new Error('Codex app-server did not return a valid threadId');
    }
    return res.threadId;
  }

  /**
   * Executes a turn within an active thread, streaming progress and handling approvals.
   */
  async runTurn(
    params: CodexTurnStartParams,
    signal?: AbortSignal,
  ): Promise<CodexTurnStartResult> {
    if (signal?.aborted) {
      throw new Error('Codex turn was aborted before starting');
    }

    let abortHandler: (() => void) | undefined;
    if (signal) {
      abortHandler = () => {
        this.sendNotification('turn/cancel', { threadId: params.threadId });
        if (this.child) {
          killTree(this.child, this.options.graceMs ?? CODEX_LIMITS.killGraceMs);
        }
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    try {
      return await this.sendRequest<CodexTurnStartResult>('turn/start', params);
    } finally {
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler);
      }
    }
  }

  /**
   * Sends a JSON-RPC request to the Codex app-server and awaits the response.
   */
  async sendRequest<T = unknown>(
    method: string,
    params?: unknown,
    timeoutMs?: number,
  ): Promise<T> {
    if (!this.child || !this.child.stdin?.writable) {
      throw new Error('Codex client is not connected or child process is dead');
    }

    const id = String(this.requestIdCounter++);
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const effectiveTimeout = timeoutMs ?? this.options.timeoutMs ?? CODEX_LIMITS.requestTimeoutMs;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new Error(
            `Codex request timed out after ${effectiveTimeout}ms: method "${method}" (id: ${id})`,
          ),
        );
      }, effectiveTimeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (val: unknown) => void,
        reject,
        timer,
      });

      const frame = serializeJsonRpc(req);
      this.child?.stdin?.write(frame);
    });
  }

  /**
   * Sends a JSON-RPC notification to the Codex app-server without expecting a response.
   */
  sendNotification(method: string, params?: unknown): void {
    if (!this.child || !this.child.stdin?.writable) return;
    const notif: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.child.stdin.write(serializeJsonRpc(notif));
  }

  /**
   * Sends a response to a server-initiated request (e.g. approval decisions).
   */
  private sendResponse(id: JsonRpcId, result?: unknown, error?: JsonRpcError): void {
    if (!this.child || !this.child.stdin?.writable) return;
    const res: JsonRpcResponse = error
      ? { jsonrpc: '2.0', id, error }
      : { jsonrpc: '2.0', id, result: result ?? {} };
    this.child.stdin.write(serializeJsonRpc(res));
  }

  /**
   * Inbound message router.
   */
  private handleInboundMessage(msg: JsonRpcMessage): void {
    if (isJsonRpcResponse(msg)) {
      this.handleResponse(msg);
    } else if (isJsonRpcRequest(msg)) {
      void this.handleInboundRequest(msg);
    } else if (isJsonRpcNotification(msg)) {
      this.options.onNotification?.(msg.method, msg.params);
    }
  }

  private handleResponse(res: JsonRpcResponse): void {
    if (res.id === null) return;
    const pending = this.pendingRequests.get(res.id);
    if (!pending) return;

    this.pendingRequests.delete(res.id);
    clearTimeout(pending.timer);

    if ('error' in res && res.error) {
      pending.reject(
        new Error(
          `Codex error ${res.error.code}: ${res.error.message}`,
        ),
      );
    } else if ('result' in res) {
      pending.resolve(res.result);
    } else {
      pending.resolve(undefined);
    }
  }

  /**
   * Handles server-initiated requests such as synchronous tool execution approval (SEC-19).
   */
  private async handleInboundRequest(req: JsonRpcRequest): Promise<void> {
    const isApproval = req.method === 'approval/request';

    if (isApproval) {
      const p = (req.params ?? {}) as Record<string, unknown>;
      const approvalParams: CodexApprovalRequestParams = {
        approvalId: p.approvalId as string | undefined,
        callId: (p.callId ?? p.id) as string | undefined,
        toolName: (p.toolName ?? (p.command ? 'Bash' : 'tool')) as string,
        input: (p.input ?? (p.command ? { command: p.command } : {})) as Record<string, unknown>,
        command: p.command as string | undefined,
        reason: p.reason as string | undefined,
      };

      if (this.options.onRequestApproval) {
        try {
          const decision = await this.options.onRequestApproval(approvalParams);
          this.sendResponse(req.id, decision);
        } catch (err) {
          // SEC-19: fail closed on error
          this.sendResponse(req.id, {
            approved: false,
            reason: err instanceof Error ? err.message : 'Approval check failed',
          } satisfies CodexApprovalResult);
        }
      } else {
        // Fail closed by default if no approval handler is configured
        this.sendResponse(req.id, {
          approved: false,
          reason: 'Permission denied: no approval handler configured',
        } satisfies CodexApprovalResult);
      }
      return;
    }

    // Default unknown server-initiated request fallback
    this.sendResponse(req.id, null, {
      code: -32601,
      message: `Method not found: ${req.method}`,
    });
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  /**
   * Disposes of the client, cancelling pending requests and killing the child process tree.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.rejectAllPending(new Error('CodexClient has been disposed'));

    if (this.child) {
      killTree(this.child, this.options.graceMs ?? CODEX_LIMITS.killGraceMs);
      this.child = null;
    }
    this.parser = null;
  }
}
