/**
 * Unit tests for ACP canonical event translation (#58).
 */
import { describe, expect, it, vi } from 'vitest';
import type { ProviderRunBridge } from '../providerBridge';
import type { AcpSessionUpdateParams } from './types';
import {
  acpNotificationToAgentEvent,
  newAcpTranslateContext,
  translateAcpNotification,
} from './translate';

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

describe('ACP Notification to ProviderRunBridge Translation (#58)', () => {
  it('translates textDelta to queueDelta', () => {
    const bridge = createMockBridge();
    const ctx = newAcpTranslateContext('sess-1');

    const notif = {
      jsonrpc: '2.0' as const,
      method: 'session/update',
      params: {
        sessionId: 'sess-1',
        kind: 'textDelta',
        delta: 'Hello world',
      } as AcpSessionUpdateParams,
    };

    translateAcpNotification(notif, bridge, ctx);

    expect(bridge.queueDelta).toHaveBeenCalledWith('Hello world');
    expect(ctx.accumulatedText).toBe('Hello world');
  });

  it('translates thoughtDelta to onThinking', () => {
    const bridge = createMockBridge();
    const ctx = newAcpTranslateContext('sess-1');

    const notif = {
      jsonrpc: '2.0' as const,
      method: 'session/update',
      params: {
        sessionId: 'sess-1',
        kind: 'thoughtDelta',
        delta: 'Analyzing codebase structure...',
      } as AcpSessionUpdateParams,
    };

    translateAcpNotification(notif, bridge, ctx);

    expect(bridge.onThinking).toHaveBeenCalledWith('Analyzing codebase structure...');
  });

  it('translates toolUse to onToolUse and tracks open calls', () => {
    const bridge = createMockBridge();
    const ctx = newAcpTranslateContext('sess-1');

    const notif = {
      jsonrpc: '2.0' as const,
      method: 'session/update',
      params: {
        sessionId: 'sess-1',
        kind: 'toolUse',
        toolCallId: 'call-101',
        toolName: 'ReadFile',
        input: { path: 'src/index.ts' },
      } as AcpSessionUpdateParams,
    };

    translateAcpNotification(notif, bridge, ctx);

    expect(bridge.onToolUse).toHaveBeenCalledWith('call-101', 'ReadFile', { path: 'src/index.ts' });
    expect(ctx.openCalls.has('call-101')).toBe(true);
  });

  it('translates toolResult to onToolResult and clears open call tracking', () => {
    const bridge = createMockBridge();
    const ctx = newAcpTranslateContext('sess-1');
    ctx.openCalls.add('call-101');

    const notif = {
      jsonrpc: '2.0' as const,
      method: 'session/update',
      params: {
        sessionId: 'sess-1',
        kind: 'toolResult',
        toolCallId: 'call-101',
        status: 'done',
        output: 'file contents',
      } as AcpSessionUpdateParams,
    };

    translateAcpNotification(notif, bridge, ctx);

    expect(bridge.onToolResult).toHaveBeenCalledWith('call-101', 'done', 'file contents');
    expect(ctx.openCalls.has('call-101')).toBe(false);
  });

  it('captures token usage from update params into context and calls onUsage', () => {
    const bridge = createMockBridge();
    const ctx = newAcpTranslateContext('sess-1');

    const notif = {
      jsonrpc: '2.0' as const,
      method: 'session/update',
      params: {
        sessionId: 'sess-1',
        kind: 'usage',
        usage: {
          inputTokens: 150,
          outputTokens: 75,
          totalTokens: 225,
          durationMs: 1200,
        },
      } as AcpSessionUpdateParams,
    };

    translateAcpNotification(notif, bridge, ctx);

    expect(ctx.usage.inputTokens).toBe(150);
    expect(ctx.usage.outputTokens).toBe(75);
    expect(ctx.usage.totalTokens).toBe(225);
    expect(bridge.onUsage).toHaveBeenCalledWith({
      inputTokens: 150,
      outputTokens: 75,
      totalTokens: 225,
      durationMs: 1200,
    });
  });

  it('translates progress to diagnostics', () => {
    const bridge = createMockBridge();
    const ctx = newAcpTranslateContext('sess-1');

    const notif = {
      jsonrpc: '2.0' as const,
      method: 'session/update',
      params: {
        sessionId: 'sess-1',
        kind: 'progress',
        delta: 'Compiling project...',
      } as AcpSessionUpdateParams,
    };

    translateAcpNotification(notif, bridge, ctx);

    expect(bridge.diag).toHaveBeenCalledWith('activity', 'info', 'Compiling project...', undefined);
  });
});

describe('Direct ACP to AgentEvent Mapping (#58)', () => {
  it('maps textDelta to message-delta AgentEvent', () => {
    const ctx = newAcpTranslateContext('sess-1');
    const notif = {
      jsonrpc: '2.0' as const,
      method: 'session/update',
      params: {
        sessionId: 'sess-1',
        kind: 'textDelta',
        delta: 'Streaming content',
      } as AcpSessionUpdateParams,
    };

    const event = acpNotificationToAgentEvent(notif, 'sess-1', ctx);
    expect(event).toEqual({
      kind: 'message-delta',
      sessionId: 'sess-1',
      messageId: ctx.messageId,
      text: 'Streaming content',
    });
  });

  it('maps toolUse to tool-start AgentEvent', () => {
    const ctx = newAcpTranslateContext('sess-1');
    const notif = {
      jsonrpc: '2.0' as const,
      method: 'session/update',
      params: {
        sessionId: 'sess-1',
        kind: 'toolUse',
        toolCallId: 'call-5',
        toolName: 'Bash',
        input: { command: 'git status' },
      } as AcpSessionUpdateParams,
    };

    const event = acpNotificationToAgentEvent(notif, 'sess-1', ctx);
    expect(event).toMatchObject({
      kind: 'tool-start',
      sessionId: 'sess-1',
      call: {
        id: 'call-5',
        sessionId: 'sess-1',
        name: 'Bash',
        status: 'running',
      },
    });
  });

  it('maps toolResult to tool-end AgentEvent', () => {
    const ctx = newAcpTranslateContext('sess-1');
    const notif = {
      jsonrpc: '2.0' as const,
      method: 'session/update',
      params: {
        sessionId: 'sess-1',
        kind: 'toolResult',
        toolCallId: 'call-5',
        status: 'done',
      } as AcpSessionUpdateParams,
    };

    const event = acpNotificationToAgentEvent(notif, 'sess-1', ctx);
    expect(event).toEqual({
      kind: 'tool-end',
      sessionId: 'sess-1',
      callId: 'call-5',
      status: 'done',
    });
  });
});
