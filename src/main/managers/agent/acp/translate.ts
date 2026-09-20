/**
 * Pure translators: ACP JSON-RPC notifications → ProviderRunBridge and canonical AgentEvents.
 *
 * Implements:
 * - Translates `session/update` notifications (textDelta, thoughtDelta, toolUse,
 *   toolResult, progress, usage) into provider-neutral `ProviderRunBridge` callbacks (ADR-0003).
 * - Maps directly to typed `AgentEvent` objects (`message-delta`, `tool-start`,
 *   `tool-end`, `activity`, `error`).
 * - Accumulates token usage and telemetry metrics.
 *
 * This module is deliberately pure: no DB, no IPC, no clock.
 */
import type { AgentEvent, ToolRisk } from '@shared/types';
import type { ProviderRunBridge } from '../providerBridge';
import type {
  AcpSessionUpdateParams,
  AcpUsageMetrics,
  JsonRpcNotification,
} from './types';

export interface AcpTranslateContext {
  sessionId: string;
  accumulatedText: string;
  readonly openCalls: Set<string>;
  usage: AcpUsageMetrics;
  messageId: string;
}

export function newAcpTranslateContext(sessionId: string): AcpTranslateContext {
  return {
    sessionId,
    accumulatedText: '',
    openCalls: new Set<string>(),
    usage: {},
    messageId: `msg_${Math.random().toString(36).slice(2, 10)}`,
  };
}

/**
 * Folds an inbound ACP JSON-RPC notification into the provider run bridge.
 */
export function translateAcpNotification(
  notif: JsonRpcNotification,
  bridge: ProviderRunBridge,
  context: AcpTranslateContext,
): void {
  if (notif.method === 'session/update') {
    const params = (notif.params ?? {}) as AcpSessionUpdateParams;

    // 1. Standard ACP v1 nested sessionUpdate structure (e.g. from Cline / OpenCode)
    if (params.update && typeof params.update === 'object') {
      const update = params.update;
      const sessionUpdate = update.sessionUpdate;

      switch (sessionUpdate) {
        case 'agent_message_chunk': {
          let text = '';
          if (typeof update.content === 'string') {
            text = update.content;
          } else if (Array.isArray(update.content)) {
            text = update.content
              .map((c) => (typeof c === 'object' && c && 'text' in c ? String(c.text ?? '') : ''))
              .join('');
          } else if (typeof update.content === 'object' && update.content !== null) {
            text = String(update.content.text ?? '');
          }
          if (text) {
            context.accumulatedText += text;
            bridge.queueDelta(text);
          }
          break;
        }

        case 'agent_thought_chunk': {
          let thought = '';
          if (typeof update.content === 'string') {
            thought = update.content;
          } else if (Array.isArray(update.content)) {
            thought = update.content
              .map((c) => (typeof c === 'object' && c && 'text' in c ? String(c.text ?? '') : ''))
              .join('');
          } else if (typeof update.content === 'object' && update.content !== null) {
            thought = String(update.content.text ?? '');
          }
          if (thought) {
            bridge.onThinking?.(thought);
          }
          break;
        }

        case 'tool_call': {
          const id = update.toolCallId ?? `call_${Math.random().toString(36).slice(2, 8)}`;
          let name = update.toolName;
          let targetStr: string | undefined;
          if (!name && update.title) {
            const colonIdx = update.title.indexOf(':');
            if (colonIdx > 0) {
              name = update.title.slice(0, colonIdx).trim();
              targetStr = update.title.slice(colonIdx + 1).trim();
            } else {
              name = update.title.trim();
            }
          }
          name = name || 'tool';
          const input = { ...((update.input ?? update.rawInput ?? {}) as Record<string, unknown>) };
          if (targetStr && !input.url && !input.path && !input.command && !input.query && !input.file_path) {
            if (targetStr.startsWith('http://') || targetStr.startsWith('https://')) {
              input.url = targetStr;
            } else if (targetStr.startsWith('{') && targetStr.endsWith('}')) {
              try {
                Object.assign(input, JSON.parse(targetStr));
              } catch {
                input.target = targetStr;
              }
            } else {
              input.target = targetStr;
            }
          }
          context.openCalls.add(id);
          bridge.onToolUse(id, name, input);
          break;
        }

        case 'tool_call_update':
        case 'tool_result': {
          const id = update.toolCallId ?? '';
          const status = update.status === 'error' ? 'error' : 'done';
          const output = update.output ?? '';
          context.openCalls.delete(id);
          bridge.onToolResult(id, status, output);
          break;
        }

        case 'session_info_update': {
          bridge.diag('activity', 'info', 'Session updated', undefined);
          break;
        }

        default: {
          break;
        }
      }

      if (update.usage) {
        applyUsage(update.usage, context, bridge);
      }
    }

    // 2. Flat kind structure (legacy/internal ACP framing)
    switch (params.kind) {
      case 'textDelta': {
        const text = params.delta ?? '';
        if (text) {
          context.accumulatedText += text;
          bridge.queueDelta(text);
        }
        break;
      }

      case 'thoughtDelta': {
        const thought = params.delta ?? '';
        if (thought) {
          bridge.onThinking?.(thought);
        }
        break;
      }

      case 'toolUse': {
        const id = params.toolCallId ?? `call_${Math.random().toString(36).slice(2, 8)}`;
        let name = params.toolName;
        let targetStr: string | undefined;
        if (!name && params.title) {
          const colonIdx = params.title.indexOf(':');
          if (colonIdx > 0) {
            name = params.title.slice(0, colonIdx).trim();
            targetStr = params.title.slice(colonIdx + 1).trim();
          } else {
            name = params.title.trim();
          }
        }
        name = name || 'tool';
        const input = { ...((params.input ?? {}) as Record<string, unknown>) };
        if (targetStr && !input.url && !input.path && !input.command && !input.query && !input.file_path) {
          if (targetStr.startsWith('http://') || targetStr.startsWith('https://')) {
            input.url = targetStr;
          } else {
            input.target = targetStr;
          }
        }
        context.openCalls.add(id);
        bridge.onToolUse(id, name, input);
        break;
      }

      case 'toolResult': {
        const id = params.toolCallId ?? '';
        const status = params.status === 'error' ? 'error' : 'done';
        const output = params.output ?? '';
        context.openCalls.delete(id);
        bridge.onToolResult(id, status, output);
        break;
      }

      case 'progress': {
        const message = params.delta ?? 'Agent working...';
        bridge.diag('activity', 'info', message, undefined);
        break;
      }

      case 'usage': {
        if (params.usage) {
          applyUsage(params.usage, context, bridge);
        }
        break;
      }

      default: {
        // Unknown or future update kind -> safely ignore or record debug diagnostic
        if (params.delta && !params.update) {
          bridge.diag('stream', 'debug', `Unrecognized ACP update kind: ${String(params.kind)}`, params.delta);
        }
        break;
      }
    }

    // Capture usage if embedded alongside other update kinds
    if (params.usage && params.kind !== 'usage') {
      applyUsage(params.usage, context, bridge);
    }
    return;
  }

  if (notif.method === 'session/usage') {
    const usage = (notif.params ?? {}) as AcpUsageMetrics;
    applyUsage(usage, context, bridge);
    return;
  }

  if (notif.method === 'session/error') {
    const err = (notif.params ?? {}) as { message?: string; error?: string };
    const errMsg = err.message ?? err.error ?? 'ACP agent reported error';
    bridge.diag('lifecycle', 'error', 'ACP Session Error', errMsg);
  }
}

/**
 * Direct mapping of ACP notification to canonical ZEUS AgentEvent.
 */
export function acpNotificationToAgentEvent(
  notif: JsonRpcNotification,
  sessionId: string,
  context: AcpTranslateContext,
): AgentEvent | null {
  if (notif.method === 'session/update') {
    const params = (notif.params ?? {}) as AcpSessionUpdateParams;

    switch (params.kind) {
      case 'textDelta':
        return {
          kind: 'message-delta',
          sessionId,
          messageId: context.messageId,
          text: params.delta ?? '',
        };

      case 'toolUse': {
        const toolName = params.toolName ?? 'tool';
        return {
          kind: 'tool-start',
          sessionId,
          call: {
            id: params.toolCallId ?? `call_${Math.random().toString(36).slice(2, 8)}`,
            sessionId,
            name: toolName,
            risk: inferToolRisk(toolName),
            summary: `${toolName} call`,
            status: 'running',
            startedAt: Date.now(),
          },
        };
      }

      case 'toolResult':
        return {
          kind: 'tool-end',
          sessionId,
          callId: params.toolCallId ?? '',
          status: params.status === 'error' ? 'error' : 'done',
        };

      case 'progress':
        return {
          kind: 'activity',
          sessionId,
          item: {
            id: `act_${params.toolCallId ?? Math.random().toString(36).slice(2, 8)}`,
            sessionId,
            type: 'status',
            label: params.delta ?? 'Agent progress',
            at: Date.now(),
          },
        };

      default:
        return null;
    }
  }

  if (notif.method === 'session/error') {
    const err = (notif.params ?? {}) as { message?: string; error?: string };
    return {
      kind: 'error',
      sessionId,
      message: err.message ?? err.error ?? 'ACP session error',
      outcome: 'failed',
    };
  }

  return null;
}

function applyUsage(
  usage: AcpUsageMetrics,
  context: AcpTranslateContext,
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

