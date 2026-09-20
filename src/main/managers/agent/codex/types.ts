/**
 * Types and JSON-RPC wire protocol definitions for OpenAI Codex native app-server.
 *
 * Implements the protocol structures for:
 * - Handshake: `initialize` and `initialized`
 * - Conversation management: `thread/start` and `thread/resume`
 * - Turn execution: `turn/start` and `turn/cancel`
 * - Synchronous tool approval gating: `approval/request` (SEC-19)
 * - Streaming updates: `item/*`, `turn/progress`, `turn/completed`
 * - Telemetry & token usage metrics
 */

/* ---------------------------------------------------------------- */
/* JSON-RPC 2.0 Core Wire Definitions                               */
/* ---------------------------------------------------------------- */

export type JsonRpcId = string | number;

export interface JsonRpcRequest<T = unknown> {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: T;
}

export interface JsonRpcNotification<T = unknown> {
  jsonrpc: '2.0';
  method: string;
  params?: T;
}

export interface JsonRpcSuccessResponse<T = unknown> {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: T;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: JsonRpcId | null;
  error: JsonRpcErrorObject;
}

export type JsonRpcResponse<T = unknown> =
  | JsonRpcSuccessResponse<T>
  | JsonRpcErrorResponse;

export type JsonRpcError = JsonRpcErrorObject;

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcResponse;

/* ---------------------------------------------------------------- */
/* Handshake Types                                                  */
/* ---------------------------------------------------------------- */

export interface CodexClientInfo {
  name: string;
  version?: string;
}

export interface CodexInitializeParams {
  clientInfo?: CodexClientInfo;
  capabilities?: {
    tools?: {
      approval?: boolean;
    };
    streaming?: boolean;
  };
}

export interface CodexInitializeResult {
  serverInfo?: {
    name: string;
    version?: string;
  };
  capabilities?: Record<string, unknown>;
}

/* ---------------------------------------------------------------- */
/* Thread Management Types                                          */
/* ---------------------------------------------------------------- */

export interface CodexThreadStartParams {
  cwd: string;
  instructions?: string;
  model?: string;
  env?: Record<string, string>;
}

export interface CodexThreadStartResult {
  threadId: string;
}

export interface CodexContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface CodexTurnStartParams {
  threadId: string;
  prompt?: string;
  input?: string | CodexContentBlock[];
  mode?: string;
}

export interface CodexTurnStartResult {
  turnId?: string;
  turn?: {
    id?: string;
    status?: string;
    error?: unknown;
  };
  status?: string;
  usage?: CodexUsageMetrics;
}

export interface CodexTurnCancelParams {
  threadId: string;
  turnId?: string;
}

/* ---------------------------------------------------------------- */
/* Synchronous Tool Approval Gating Types (SEC-19)                  */
/* ---------------------------------------------------------------- */

export interface CodexApprovalRequestParams {
  approvalId?: string;
  callId?: string;
  toolName: string;
  input: Record<string, unknown>;
  command?: string;
  reason?: string;
}

export interface CodexApprovalResult {
  approved: boolean;
  reason?: string;
  updatedInput?: Record<string, unknown>;
}

/* ---------------------------------------------------------------- */
/* Streaming & Progress Notification Types                          */
/* ---------------------------------------------------------------- */

export interface CodexUsageMetrics {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  durationMs?: number;
}

export interface CodexItemDeltaParams {
  threadId?: string;
  turnId?: string;
  itemId?: string;
  delta?: string;
  text?: string;
}

export interface CodexItemToolStartParams {
  threadId?: string;
  turnId?: string;
  callId: string;
  toolName?: string;
  command?: string;
  input?: Record<string, unknown>;
}

export interface CodexItemToolFinishParams {
  threadId?: string;
  turnId?: string;
  callId: string;
  status: 'done' | 'error';
  output?: string;
  exitCode?: number;
}

export interface CodexTurnProgressParams {
  threadId?: string;
  turnId?: string;
  message?: string;
  progress?: string;
}

export interface CodexTurnCompletedParams {
  threadId?: string;
  turnId?: string;
  status?: 'completed' | 'cancelled' | 'error';
  error?: string;
  usage?: CodexUsageMetrics;
}

/* ---------------------------------------------------------------- */
/* Client Configuration Options                                     */
/* ---------------------------------------------------------------- */

export interface CodexClientOptions {
  binaryPath?: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  graceMs?: number;
  configDir?: string;
  onRequestApproval?: (params: CodexApprovalRequestParams) => Promise<CodexApprovalResult>;
  onNotification?: (method: string, params: unknown) => void;
  onError?: (err: Error) => void;
  onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
  spawnFn?: (command: string, args: readonly string[], options: unknown) => import('node:child_process').ChildProcess;
}
