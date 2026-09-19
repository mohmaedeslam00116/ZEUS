import { describe, it, expect, vi } from 'vitest';
import {
  newCodexTranslateContext,
  translateCodexNotification,
  codexNotificationToAgentEvent,
} from './translate';
import type { ProviderRunBridge } from '../providerBridge';

function createMockBridge(): ProviderRunBridge {
  return {
    ensureStreaming: vi.fn(),
    queueDelta: vi.fn(),
    finishStreaming: vi.fn(),
    onToolUse: vi.fn(),
    onToolResult: vi.fn(),
    onInit: vi.fn(),
    onResult: vi.fn(),
    onUsage: vi.fn(),
    onThinking: vi.fn(),
    diag: vi.fn(),
  };
}

describe('Codex Event Translation to ProviderRunBridge (#59)', () => {
  it('translates item/message/delta to queueDelta and accumulates text', () => {
    const bridge = createMockBridge();
    const ctx = newCodexTranslateContext('sess-1');

    const notif1 = {
      method: 'item/message/delta',
      params: { delta: 'Hello ' },
    };
    const notif2 = {
      method: 'item/message/delta',
      params: { delta: 'World!' },
    };

    translateCodexNotification(notif1, bridge, ctx);
    translateCodexNotification(notif2, bridge, ctx);

    expect(bridge.ensureStreaming).toHaveBeenCalledTimes(2);
    expect(bridge.queueDelta).toHaveBeenNthCalledWith(1, 'Hello ');
    expect(bridge.queueDelta).toHaveBeenNthCalledWith(2, 'World!');
    expect(ctx.accumulatedText).toBe('Hello World!');
  });

  it('translates item/thought/delta to onThinking', () => {
    const bridge = createMockBridge();
    const ctx = newCodexTranslateContext('sess-1');

    const notif = {
      method: 'item/thought/delta',
      params: { text: 'Analyzing repository structure...' },
    };

    translateCodexNotification(notif, bridge, ctx);

    expect(bridge.onThinking).toHaveBeenCalledWith('Analyzing repository structure...');
  });

  it('translates item/command/start to onToolUse and tracks open call', () => {
    const bridge = createMockBridge();
    const ctx = newCodexTranslateContext('sess-1');

    const notif = {
      method: 'item/command/start',
      params: {
        callId: 'call-42',
        command: 'git status',
      },
    };

    translateCodexNotification(notif, bridge, ctx);

    expect(bridge.onToolUse).toHaveBeenCalledWith('call-42', 'Bash', { command: 'git status' });
    expect(ctx.openCalls.has('call-42')).toBe(true);
  });

  it('translates item/command/finish to onToolResult and clears open call tracking', () => {
    const bridge = createMockBridge();
    const ctx = newCodexTranslateContext('sess-1');
    ctx.openCalls.add('call-42');

    const notif = {
      method: 'item/command/finish',
      params: {
        callId: 'call-42',
        status: 'done' as const,
        output: 'clean working tree',
      },
    };

    translateCodexNotification(notif, bridge, ctx);

    expect(bridge.onToolResult).toHaveBeenCalledWith('call-42', 'done', 'clean working tree');
    expect(ctx.openCalls.has('call-42')).toBe(false);
  });

  it('captures token usage from turn/completed and calls onUsage', () => {
    const bridge = createMockBridge();
    const ctx = newCodexTranslateContext('sess-1');

    const notif = {
      method: 'turn/completed',
      params: {
        status: 'completed' as const,
        usage: {
          inputTokens: 300,
          outputTokens: 120,
          totalTokens: 420,
          durationMs: 2500,
        },
      },
    };

    translateCodexNotification(notif, bridge, ctx);

    expect(ctx.usage.inputTokens).toBe(300);
    expect(ctx.usage.outputTokens).toBe(120);
    expect(ctx.usage.totalTokens).toBe(420);
    expect(bridge.onUsage).toHaveBeenCalledWith({
      inputTokens: 300,
      outputTokens: 120,
      totalTokens: 420,
      durationMs: 2500,
    });
    expect(bridge.onResult).toHaveBeenCalledWith(true, '');
  });

  it('translates turn/progress to diagnostics', () => {
    const bridge = createMockBridge();
    const ctx = newCodexTranslateContext('sess-1');

    const notif = {
      method: 'turn/progress',
      params: {
        message: 'Running linter...',
      },
    };

    translateCodexNotification(notif, bridge, ctx);

    expect(bridge.diag).toHaveBeenCalledWith('activity', 'info', 'Running linter...');
  });
});

describe('Direct Codex to AgentEvent Mapping (#59)', () => {
  it('maps item/message/delta to message-delta AgentEvent', () => {
    const ctx = newCodexTranslateContext('sess-1');
    const notif = {
      method: 'item/message/delta',
      params: {
        delta: 'Streaming Codex output',
      },
    };

    const event = codexNotificationToAgentEvent(notif, 'sess-1', ctx);
    expect(event).toEqual({
      kind: 'message-delta',
      sessionId: 'sess-1',
      messageId: ctx.messageId,
      text: 'Streaming Codex output',
    });
  });

  it('maps item/command/start to tool-start AgentEvent with inferred ToolRisk', () => {
    const ctx = newCodexTranslateContext('sess-1');
    const notif = {
      method: 'item/command/start',
      params: {
        callId: 'call-99',
        command: 'npm test',
      },
    };

    const event = codexNotificationToAgentEvent(notif, 'sess-1', ctx);
    expect(event).toMatchObject({
      kind: 'tool-start',
      sessionId: 'sess-1',
      call: {
        id: 'call-99',
        sessionId: 'sess-1',
        name: 'Bash',
        risk: 'command',
        status: 'running',
      },
    });
  });

  it('maps item/command/finish to tool-end AgentEvent', () => {
    const ctx = newCodexTranslateContext('sess-1');
    const notif = {
      method: 'item/command/finish',
      params: {
        callId: 'call-99',
        status: 'done' as const,
      },
    };

    const event = codexNotificationToAgentEvent(notif, 'sess-1', ctx);
    expect(event).toEqual({
      kind: 'tool-end',
      sessionId: 'sess-1',
      callId: 'call-99',
      status: 'done',
    });
  });
});
