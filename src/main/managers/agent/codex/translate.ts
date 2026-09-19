/**
 * Pure translators: OpenAI Codex app-server JSON-RPC notifications → ProviderRunBridge and canonical AgentEvents.
 *
 * Implements:
 * - Translates streaming notifications (`item/message/delta`, `item/reasoning/delta`,
 *   `item/command/start`, `item/command/finish`, `turn/progress`, `turn/completed`)
 *   into provider-neutral `ProviderRunBridge` callbacks (ADR-0003).
 * - Maps directly to typed `AgentEvent` objects (`message-delta`, `tool-start`,
 *   `tool-end`, `activity`, `error`).
 * - Accumulates token usage and telemetry metrics.
 *
 * This module is deliberately pure: no DB, no IPC.
 */
import type { AgentEvent, ToolRisk } from '@shared/types';
import type { ProviderRunBridge } from '../providerBridge';
import type {
  CodexItemDeltaParams,
  CodexItemToolFinishParams,
  CodexItemToolStartParams,
  CodexTurnCompletedParams,
  CodexTurnProgressParams,
  CodexUsageMetrics,
  JsonRpcNotification,
} from './types';

export interface CodexTranslateContext {
  sessionId: string;
  accumulatedText: string;
  readonly openCalls: Set<string>;
  usage: CodexUsageMetrics;
  messageId: string;
  finished: boolean;
}

export function newCodexTranslateContext(sessionId: string): CodexTranslateContext {
  return {
    sessionId,
    accumulatedText: '',
    openCalls: new Set<string>(),
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      durationMs: 0,
    },
    messageId: `msg_${Math.random().toString(36).slice(2, 10)}`,
    finished: false,
  };
}

export type CodexNotificationLike =
  | JsonRpcNotification
  | { method: string; params?: unknown; jsonrpc?: string };

/**
 * Translates a Codex app-server notification into calls against the provider-neutral ProviderRunBridge.
 */
export function translateCodexNotification(
  notif: CodexNotificationLike,
  bridge: ProviderRunBridge,
  context: CodexTranslateContext,
): void {
  const method = notif.method;

  switch (method) {
    case 'item/message/delta':
    case 'item/agentMessage/delta': {
      const p = (notif.params ?? {}) as CodexItemDeltaParams;
      const text = p.delta ?? p.text ?? '';
      if (text.length > 0) {
        context.accumulatedText += text;
        bridge.ensureStreaming();
        bridge.queueDelta(text);
      }
      break;
    }

    case 'item/thought/delta':
    case 'item/reasoning/delta': {
      const p = (notif.params ?? {}) as CodexItemDeltaParams;
      const text = p.delta ?? p.text ?? '';
      if (text.length > 0 && bridge.onThinking) {
        bridge.onThinking(text);
      }
      break;
    }

    case 'item/command/start':
    case 'item/tool/start':
    case 'item/fileEdit/start': {
      const p = (notif.params ?? {}) as CodexItemToolStartParams;
      const callId = p.callId || `call_${Math.random().toString(36).slice(2, 8)}`;
      const toolName = p.toolName ?? (p.command ? 'Bash' : 'tool');
      const input = p.input ?? (p.command ? { command: p.command } : {});

      context.openCalls.add(callId);
      bridge.onToolUse(callId, toolName, input);
      break;
    }

    case 'item/command/finish':
    case 'item/tool/finish':
    case 'item/fileEdit/finish': {
      const p = (notif.params ?? {}) as CodexItemToolFinishParams;
      const callId = p.callId;
      if (callId) {
        context.openCalls.delete(callId);
        const status = p.status === 'error' ? 'error' : 'done';
        bridge.onToolResult(callId, status, p.output);
      }
      break;
    }

    case 'turn/progress': {
      const p = (notif.params ?? {}) as CodexTurnProgressParams;
      const label = p.message ?? p.progress ?? 'Agent progress';
      bridge.diag('activity', 'info', label);
      break;
    }

    case 'turn/completed': {
      const p = (notif.params ?? {}) as CodexTurnCompletedParams;
      if (p.usage) {
        applyUsage(p.usage, context, bridge);
      }
      if (!context.finished) {
        context.finished = true;
        const ok = p.status !== 'error';
        bridge.finishStreaming(context.accumulatedText);
        bridge.onResult(ok, p.error ?? context.accumulatedText);
      }
      break;
    }

    case 'turn/error':
    case 'session/error': {
      const p = (notif.params ?? {}) as { message?: string; error?: string };
      const msg = p.message ?? p.error ?? 'Codex turn error';
      bridge.diag('error', 'error', msg);
      break;
    }

    default:
      // Unknown or non-essential notifications ignored
      break;
  }
}

/**
 * Maps a Codex app-server notification directly to a canonical typed AgentEvent.
 */
export function codexNotificationToAgentEvent(
  notif: CodexNotificationLike,
  sessionId: string,
  context: CodexTranslateContext,
): AgentEvent | null {
  const method = notif.method;

  switch (method) {
    case 'item/message/delta':
    case 'item/agentMessage/delta': {
      const p = (notif.params ?? {}) as CodexItemDeltaParams;
      return {
        kind: 'message-delta',
        sessionId,
        messageId: context.messageId,
        text: p.delta ?? p.text ?? '',
      };
    }

    case 'item/command/start':
    case 'item/tool/start':
    case 'item/fileEdit/start': {
      const p = (notif.params ?? {}) as CodexItemToolStartParams;
      const callId = p.callId || `call_${Math.random().toString(36).slice(2, 8)}`;
      const toolName = p.toolName ?? (p.command ? 'Bash' : 'tool');
      return {
        kind: 'tool-start',
        sessionId,
        call: {
          id: callId,
          sessionId,
          name: toolName,
          risk: inferToolRisk(toolName),
          summary: `${toolName} call`,
          status: 'running',
          startedAt: Date.now(),
        },
      };
    }

    case 'item/command/finish':
    case 'item/tool/finish':
    case 'item/fileEdit/finish': {
      const p = (notif.params ?? {}) as CodexItemToolFinishParams;
      return {
        kind: 'tool-end',
        sessionId,
        callId: p.callId,
        status: p.status === 'error' ? 'error' : 'done',
      };
    }

    case 'turn/progress': {
      const p = (notif.params ?? {}) as CodexTurnProgressParams;
      return {
        kind: 'activity',
        sessionId,
        item: {
          id: `act_${Math.random().toString(36).slice(2, 8)}`,
          sessionId,
          type: 'status',
          label: p.message ?? p.progress ?? 'Agent working...',
          at: Date.now(),
        },
      };
    }

    case 'turn/error':
    case 'session/error': {
      const p = (notif.params ?? {}) as { message?: string; error?: string };
      return {
        kind: 'error',
        sessionId,
        message: p.message ?? p.error ?? 'Codex error',
        outcome: 'failed',
      };
    }

    default:
      return null;
  }
}

export function applyUsage(
  usage: CodexUsageMetrics,
  context: CodexTranslateContext,
  bridge: ProviderRunBridge,
): void {
  if (typeof usage.inputTokens === 'number') {
    context.usage.inputTokens = (context.usage.inputTokens ?? 0) + usage.inputTokens;
  }
  if (typeof usage.outputTokens === 'number') {
    context.usage.outputTokens = (context.usage.outputTokens ?? 0) + usage.outputTokens;
  }
  if (typeof usage.totalTokens === 'number') {
    context.usage.totalTokens = (context.usage.totalTokens ?? 0) + usage.totalTokens;
  }
  if (typeof usage.durationMs === 'number') {
    context.usage.durationMs = usage.durationMs;
  }
  bridge.onUsage?.({ ...usage });
}

function inferToolRisk(toolName: string): ToolRisk {
  const lower = toolName.toLowerCase();
  if (
    lower.includes('read') ||
    lower.includes('view') ||
    lower.includes('list') ||
    lower.includes('search') ||
    lower.includes('fetch')
  ) {
    return 'read';
  }
  if (
    lower.includes('write') ||
    lower.includes('edit') ||
    lower.includes('create') ||
    lower.includes('delete') ||
    lower.includes('patch')
  ) {
    return 'write';
  }
  return 'command';
}
