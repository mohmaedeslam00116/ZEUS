/**
 * JSON-RPC 2.0 line-delimited stream framing, serialization, and parsing for ACP.
 */
import { ACP_LIMITS } from '@shared/constants';
import type {
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
} from './types';

/** Check if a JSON-RPC message is a request (has both id and method). */
export function isJsonRpcRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'id' in msg &&
    'method' in msg &&
    typeof (msg as JsonRpcRequest).method === 'string'
  );
}

/** Check if a JSON-RPC message is a notification (has method, but no id). */
export function isJsonRpcNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    !('id' in msg) &&
    'method' in msg &&
    typeof (msg as JsonRpcNotification).method === 'string'
  );
}

/** Check if a JSON-RPC message is a response (has id and either result or error). */
export function isJsonRpcResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'id' in msg &&
    ('result' in msg || 'error' in msg)
  );
}

/** Serialize a message to a newline-terminated JSON-RPC 2.0 frame. */
export function serializeJsonRpc(msg: JsonRpcMessage): string {
  return JSON.stringify(msg) + '\n';
}

/**
 * Accumulating parser for newline-delimited JSON-RPC stream data.
 * Resilient against chunk splitting, multi-message chunks, and malformed lines.
 * Capped by ACP_LIMITS.maxBuffer per XP-01.
 */
export class JsonRpcStreamParser {
  private buffer = '';
  private readonly maxBuffer: number;

  constructor(
    private readonly onMessage: (message: JsonRpcMessage) => void,
    private readonly onError?: (error: Error, rawText: string) => void,
    maxBuffer?: number,
  ) {
    this.maxBuffer = maxBuffer ?? ACP_LIMITS.maxBuffer;
  }

  /**
   * Feed a chunk of text or UTF-8 buffer into the parser.
   */
  feed(chunk: string | Buffer): void {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');

    // XP-01: prevent memory exhaustion from an unbounded stream without newlines
    if (this.buffer.length + text.length > this.maxBuffer * 2) {
      this.onError?.(
        new Error(`JSON-RPC buffer overflow: stream exceeded maxBuffer (${this.maxBuffer} bytes)`),
        this.buffer.slice(0, 200),
      );
      this.buffer = '';
    }

    this.buffer += text;

    let newlineIdx: number;
    while ((newlineIdx = this.buffer.indexOf('\n')) !== -1) {
      const rawLine = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);
      this.parseLine(rawLine);
    }
  }

  /**
   * Flush any remaining buffer on stream close (if trailing line without \n exists).
   */
  flush(): void {
    const rawLine = this.buffer.trim();
    this.buffer = '';
    this.parseLine(rawLine);
  }

  private parseLine(rawLine: string): void {
    if (!rawLine) return;

    try {
      const parsed = JSON.parse(rawLine) as unknown;
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        ('jsonrpc' in parsed || 'id' in parsed || 'method' in parsed)
      ) {
        this.onMessage(parsed as JsonRpcMessage);
      } else {
        this.onError?.(
          new Error('Invalid JSON-RPC frame: missing "jsonrpc", "id", or "method" header'),
          rawLine,
        );
      }
    } catch (err) {
      this.onError?.(
        err instanceof Error ? err : new Error(String(err)),
        rawLine,
      );
    }
  }
}
