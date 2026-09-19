/**
 * Type definitions for Agent Client Protocol (ACP) stdio JSON-RPC 2.0 communication.
 *
 * Defines JSON-RPC 2.0 wire representations, ACP capabilities, session lifecycle
 * schemas, and SEC-19 synchronous tool permission request/response payloads.
 */

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

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcResponse;

/* ---------------------------------------------------------------- */
/* ACP Capability & Handshake Types                                 */
/* ---------------------------------------------------------------- */

export interface AcpClientCapabilities {
  tools?: {
    requestPermission?: boolean;
  };
  streaming?: boolean;
}

export interface AcpAgentCapabilities {
  streaming?: boolean;
}

export interface AcpInitializeParams {
  protocolVersion: string;
  clientInfo: {
    name: string;
    version: string;
  };
  capabilities: AcpClientCapabilities;
}

export interface AcpInitializeResult {
  protocolVersion: string;
  agentInfo?: {
    name: string;
    version?: string;
  };
  capabilities?: AcpAgentCapabilities;
}

/* ---------------------------------------------------------------- */
/* ACP Session Lifecycle Types                                      */
/* ---------------------------------------------------------------- */

export interface AcpSessionNewParams {
  cwd: string;
  instructions?: string;
  env?: Record<string, string>;
}

export interface AcpSessionNewResult {
  sessionId: string;
}

export interface AcpSessionPromptParams {
  sessionId: string;
  prompt: string;
}

export interface AcpSessionPromptResult {
  stopReason?: 'endTurn' | 'complete' | 'cancelled' | 'maxTokens';
}

export interface AcpSessionCancelParams {
  sessionId: string;
}

/* ---------------------------------------------------------------- */
/* ACP Synchronous Permission Interception Types (SEC-19)           */
/* ---------------------------------------------------------------- */

export interface AcpPermissionRequestParams {
  sessionId: string;
  toolCallId?: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface AcpPermissionResult {
  approved: boolean;
  reason?: string;
  updatedInput?: Record<string, unknown>;
}

/* ---------------------------------------------------------------- */
/* ACP Streaming Notification Types                                 */
/* ---------------------------------------------------------------- */

export interface AcpSessionUpdateParams {
  sessionId: string;
  kind: 'textDelta' | 'thoughtDelta' | 'toolUse' | 'toolResult' | 'progress';
  delta?: string;
  toolCallId?: string;
  toolName?: string;
  input?: Record<string, unknown>;
  output?: string;
  status?: 'done' | 'error';
}

/* ---------------------------------------------------------------- */
/* AcpClient Configuration & Spawning Options                       */
/* ---------------------------------------------------------------- */

export interface AcpClientOptions {
  executablePath: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  graceMs?: number;
  onRequestPermission: (
    params: AcpPermissionRequestParams,
    signal?: AbortSignal,
  ) => Promise<AcpPermissionResult>;
  onNotification?: (method: string, params: unknown) => void;
  logger?: (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    detail?: unknown,
  ) => void;
}
