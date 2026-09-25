/**
 * Types and interfaces for the ZEUS Native Agent Runtime Engine (Spec #61 / Issue #64).
 */
import type { NativeProviderId } from '@shared/types';

/** Normalized delta stream chunk yielded across all providers. */
export type NormalizedStreamChunk =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; id: string; name: string; argsChunk: string }
  | { type: 'tool_call_complete'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number; totalTokens?: number }
  | { type: 'finish'; reason?: string };

/** Unified normalized conversation message for context hydration and pruning. */
export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  thinking?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
  toolCallId?: string;
}


/** Options passed to native streaming transport requests. */
export interface NativeStreamTransportOptions {
  headers?: Record<string, string>;
  allowPrivate?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Resolved execution parameters for a native agent run turn. */
export interface ResolvedNativeModelConfig {
  provider: NativeProviderId;
  rawModelName: string;
  apiKey?: string;
  baseUrl?: string;
  contextLimit: number;
  supportsThinking: boolean;
}
