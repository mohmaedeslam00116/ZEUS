/**
 * Unit and integration tests for Headless Cline & OpenCode ACP Runtimes (#58).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SessionPermissionMode } from '@shared/types';
import { ARABIC_LOCALE_INSTRUCTION } from '../locale';
import type { ProviderRunBridge } from '../providerBridge';
import type { AgentRuntimeStreamCallbacks, ToolGateFunction } from '../types';
import { AcpRuntime } from './AcpRuntime';
import type {
  AcpClientOptions,
  AcpInitializeResult,
  AcpPermissionRequestParams,
  AcpPermissionResult,
  AcpSessionNewParams,
  AcpSessionPromptResult,
  AcpSessionUpdateParams,
} from './types';
import type { AcpClient } from './AcpClient';

function createMockStream(): AgentRuntimeStreamCallbacks {
  return {
    ensureStreaming: vi.fn(),
    queueDelta: vi.fn(),
    finishStreaming: vi.fn(),
  };
}

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

interface FakeAcpClientState {
  startCalled: boolean;
  sessionParams: AcpSessionNewParams | null;
  promptText: string | null;
  disposed: boolean;
  options: AcpClientOptions;
}

function createFakeClientFactory(state: FakeAcpClientState) {
  return (options: AcpClientOptions): AcpClient => {
    state.options = options;
    return {
      start: vi.fn().mockImplementation(async (): Promise<AcpInitializeResult> => {
        state.startCalled = true;
        return {
          protocolVersion: 1,
          agentInfo: { name: options.executablePath, version: '1.0.0' },
        };
      }),
      createSession: vi.fn().mockImplementation(
        async (cwdOrParams: string | AcpSessionNewParams, instructions?: string, env?: Record<string, string>): Promise<string> => {
          if (typeof cwdOrParams === 'string') {
            state.sessionParams = { cwd: cwdOrParams, instructions, env };
          } else {
            state.sessionParams = cwdOrParams;
          }
          return 'sess-fake-123';
        },
      ),
      prompt: vi.fn().mockImplementation(
        async (_sessionId: string, promptText: string, signal?: AbortSignal): Promise<AcpSessionPromptResult> => {
          state.promptText = promptText;

          if (signal?.aborted) {
            return { stopReason: 'cancelled' };
          }

          // Simulate emitting streaming text delta
          options.onNotification?.('session/update', {
            sessionId: 'sess-fake-123',
            kind: 'textDelta',
            delta: 'Translated response chunk',
          } as AcpSessionUpdateParams);

          // Simulate emitting toolUse
          options.onNotification?.('session/update', {
            sessionId: 'sess-fake-123',
            kind: 'toolUse',
            toolCallId: 'call-1',
            toolName: 'ReadFile',
            input: { path: 'file.txt' },
          } as AcpSessionUpdateParams);

          // Simulate emitting toolResult
          options.onNotification?.('session/update', {
            sessionId: 'sess-fake-123',
            kind: 'toolResult',
            toolCallId: 'call-1',
            status: 'done',
            output: 'content',
          } as AcpSessionUpdateParams);

          return {
            stopReason: 'endTurn',
            usage: {
              inputTokens: 100,
              outputTokens: 50,
              totalTokens: 150,
              durationMs: 800,
            },
          };
        },
      ),
      isConnected: vi.fn().mockReturnValue(true),
      loadSession: vi.fn().mockResolvedValue(true),
      cancelSession: vi.fn(),
      dispose: vi.fn().mockImplementation(() => {
        state.disposed = true;
      }),
    } as unknown as AcpClient;
  };
}

describe('Headless Cline & OpenCode ACP Runtimes (#58)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('spawns and drives cline with default --acp args and discovers profile', async () => {
    const state: FakeAcpClientState = {
      startCalled: false,
      sessionParams: null,
      promptText: null,
      disposed: false,
      options: {} as AcpClientOptions,
    };

    const runtime = new AcpRuntime('cline', {
      clientFactory: createFakeClientFactory(state),
    });

    const stream = createMockStream();
    const bridge = createMockBridge();
    const abort = new AbortController();

    await runtime.run(
      'sess-1',
      'Explain this code',
      '/fake/workspace',
      abort,
      'ask' as SessionPermissionMode,
      stream,
      bridge,
    );

    expect(state.startCalled).toBe(true);
    expect(state.options.executablePath).toBe('cline');
    expect(state.options.args).toEqual(['--acp']);
    expect(state.options.cwd).toBe('/fake/workspace');
    expect(state.sessionParams?.cwd).toBe('/fake/workspace');
    expect(state.disposed).toBe(false);
    runtime.dispose();
    expect(state.disposed).toBe(true);

    // Verify bridge calls from simulated stream
    expect(bridge.onInit).toHaveBeenCalledWith('sess-fake-123');
    expect(bridge.queueDelta).toHaveBeenCalledWith('Translated response chunk');
    expect(bridge.onToolUse).toHaveBeenCalledWith('call-1', 'ReadFile', { path: 'file.txt' });
    expect(bridge.onToolResult).toHaveBeenCalledWith('call-1', 'done', 'content');
    expect(bridge.onUsage).toHaveBeenCalledWith({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      durationMs: 800,
    });
    expect(bridge.onResult).toHaveBeenCalledWith(true, 'Translated response chunk');
    expect(bridge.finishStreaming).toHaveBeenCalledWith('Translated response chunk');
  });

  it('spawns and drives opencode with default acp args', async () => {
    const state: FakeAcpClientState = {
      startCalled: false,
      sessionParams: null,
      promptText: null,
      disposed: false,
      options: {} as AcpClientOptions,
    };

    const runtime = new AcpRuntime('opencode', {
      clientFactory: createFakeClientFactory(state),
    });

    const stream = createMockStream();
    const abort = new AbortController();

    await runtime.run(
      'sess-2',
      'Refactor function',
      '/fake/workspace',
      abort,
      'auto' as SessionPermissionMode,
      stream,
    );

    expect(state.startCalled).toBe(true);
    expect(state.options.executablePath).toBe('opencode');
    expect(state.options.args).toEqual(['acp']);
    expect(state.disposed).toBe(false);
    runtime.dispose();
    expect(state.disposed).toBe(true);
  });

  it('injects bilingual LocaleContext into session instructions when present in prompt', async () => {
    const state: FakeAcpClientState = {
      startCalled: false,
      sessionParams: null,
      promptText: null,
      disposed: false,
      options: {} as AcpClientOptions,
    };

    const runtime = new AcpRuntime('cline', {
      clientFactory: createFakeClientFactory(state),
    });

    const stream = createMockStream();
    const abort = new AbortController();
    const promptWithLocale = `${ARABIC_LOCALE_INSTRUCTION}\n\nاشرح هذا الكود`;

    await runtime.run(
      'sess-3',
      promptWithLocale,
      '/fake/workspace',
      abort,
      'ask' as SessionPermissionMode,
      stream,
    );

    expect(state.sessionParams?.instructions).toBe(ARABIC_LOCALE_INSTRUCTION);
  });

  it('synchronously routes session/request_permission through permission gate', async () => {
    const state: FakeAcpClientState = {
      startCalled: false,
      sessionParams: null,
      promptText: null,
      disposed: false,
      options: {} as AcpClientOptions,
    };

    const runtime = new AcpRuntime('cline', {
      clientFactory: createFakeClientFactory(state),
    });

    const stream = createMockStream();
    const abort = new AbortController();

    const gate: ToolGateFunction = vi.fn().mockResolvedValue({
      behavior: 'allow',
    });

    await runtime.run(
      'sess-4',
      'Test tool permission',
      '/fake/workspace',
      abort,
      'ask' as SessionPermissionMode,
      stream,
      undefined,
      gate,
    );

    // Trigger permission request through client options
    const permRequest: AcpPermissionRequestParams = {
      sessionId: 'sess-fake-123',
      toolCallId: 'call-bash-1',
      toolName: 'Bash',
      input: { command: 'rm -rf temp' },
    };

    const decision: AcpPermissionResult = await state.options.onRequestPermission(permRequest);

    expect(gate).toHaveBeenCalledWith('Bash', { command: 'rm -rf temp' }, abort.signal);
    expect(decision.approved).toBe(true);
  });

  it('denies tool permission when gate returns deny behavior', async () => {
    const state: FakeAcpClientState = {
      startCalled: false,
      sessionParams: null,
      promptText: null,
      disposed: false,
      options: {} as AcpClientOptions,
    };

    const runtime = new AcpRuntime('cline', {
      clientFactory: createFakeClientFactory(state),
    });

    const stream = createMockStream();
    const abort = new AbortController();

    const gate: ToolGateFunction = vi.fn().mockResolvedValue({
      behavior: 'deny',
      message: 'Blocked by user policy',
    });

    await runtime.run(
      'sess-5',
      'Denied tool test',
      '/fake/workspace',
      abort,
      'ask' as SessionPermissionMode,
      stream,
      undefined,
      gate,
    );

    const decision = await state.options.onRequestPermission({
      sessionId: 'sess-fake-123',
      toolName: 'Bash',
      input: { command: 'drop table' },
    });

    expect(decision.approved).toBe(false);
    expect(decision.reason).toBe('Blocked by user policy');
  });

  it('cleans up client on abort signal', async () => {
    const state: FakeAcpClientState = {
      startCalled: false,
      sessionParams: null,
      promptText: null,
      disposed: false,
      options: {} as AcpClientOptions,
    };

    const runtime = new AcpRuntime('cline', {
      clientFactory: createFakeClientFactory(state),
    });

    const stream = createMockStream();
    const bridge = createMockBridge();
    const abort = new AbortController();
    abort.abort();

    await runtime.run(
      'sess-6',
      'Cancelled prompt',
      '/fake/workspace',
      abort,
      'ask' as SessionPermissionMode,
      stream,
      bridge,
    );

    expect(bridge.onResult).toHaveBeenCalledWith(false, '');
    expect(state.disposed).toBe(true);
  });

  it('rejects unsupported provider string in constructor', () => {
    // @ts-expect-error testing invalid provider
    expect(() => new AcpRuntime('invalid-agent')).toThrow(
      'Unsupported ACP provider: "invalid-agent". Only "cline" and "opencode" are supported.',
    );
  });

  it('honors custom executablePath and args overrides', async () => {
    const state: FakeAcpClientState = {
      startCalled: false,
      sessionParams: null,
      promptText: null,
      disposed: false,
      options: {} as AcpClientOptions,
    };

    const runtime = new AcpRuntime('cline', {
      executablePath: '/opt/custom/cline-bin',
      args: ['--custom-flag', '--acp'],
      clientFactory: createFakeClientFactory(state),
    });

    const stream = createMockStream();
    const abort = new AbortController();

    await runtime.run(
      'sess-7',
      'Test custom bin',
      '/fake/workspace',
      abort,
      'ask' as SessionPermissionMode,
      stream,
    );

    expect(state.options.executablePath).toBe('/opt/custom/cline-bin');
    expect(state.options.args).toEqual(['--custom-flag', '--acp']);
  });

  it('denies permission by default if gate callback throws an exception', async () => {
    const state: FakeAcpClientState = {
      startCalled: false,
      sessionParams: null,
      promptText: null,
      disposed: false,
      options: {} as AcpClientOptions,
    };

    const runtime = new AcpRuntime('cline', {
      clientFactory: createFakeClientFactory(state),
    });

    const stream = createMockStream();
    const abort = new AbortController();

    const faultyGate: ToolGateFunction = vi.fn().mockRejectedValue(new Error('Internal database fault'));

    await runtime.run(
      'sess-8',
      'Test faulty gate',
      '/fake/workspace',
      abort,
      'ask' as SessionPermissionMode,
      stream,
      undefined,
      faultyGate,
    );

    const decision = await state.options.onRequestPermission({
      sessionId: 'sess-fake-123',
      toolName: 'Bash',
      input: { command: 'ls' },
    });

    expect(decision.approved).toBe(false);
    expect(decision.reason).toBe('Internal database fault');
  });

  it('handles dispose() cleanly when runtime is shut down', () => {
    const runtime = new AcpRuntime('cline');
    runtime.dispose();
    expect(() => runtime.dispose()).not.toThrow();
  });

  it('reuses active client and ACP session across sequential turns in same conversation', async () => {
    let clientInstantiations = 0;
    const promptCalls: string[] = [];

    const mockClient = {
      start: vi.fn().mockResolvedValue({}),
      createSession: vi.fn().mockResolvedValue('acp-persistent-sess-1'),
      prompt: vi.fn().mockImplementation((_sessId, promptText) => {
        promptCalls.push(promptText);
        return { stopReason: 'endTurn' };
      }),
      isConnected: vi.fn().mockReturnValue(true),
      cancelSession: vi.fn(),
      dispose: vi.fn(),
    } as unknown as AcpClient;

    const runtime = new AcpRuntime('cline', {
      clientFactory: () => {
        clientInstantiations++;
        return mockClient;
      },
    });

    const stream = createMockStream();
    const abort1 = new AbortController();
    const abort2 = new AbortController();

    // Turn 1
    await runtime.run('session-persistent', 'Turn 1 prompt', '/workspace', abort1, 'ask', stream);

    // Turn 2
    await runtime.run('session-persistent', 'Turn 2 prompt', '/workspace', abort2, 'ask', stream);

    expect(clientInstantiations).toBe(1);
    expect(mockClient.createSession).toHaveBeenCalledTimes(1);
    expect(mockClient.prompt).toHaveBeenCalledTimes(2);
    expect(promptCalls).toEqual(['Turn 1 prompt', 'Turn 2 prompt']);
    expect(mockClient.dispose).not.toHaveBeenCalled();

    // Close session
    await runtime.closeSession?.('session-persistent');
    expect(mockClient.dispose).toHaveBeenCalledTimes(1);
  });
});
