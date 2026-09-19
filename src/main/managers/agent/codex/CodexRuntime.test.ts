import { describe, it, expect, vi } from 'vitest';
import { CodexRuntime } from './CodexRuntime';
import { CodexClient } from './CodexClient';
import { ARABIC_LOCALE_INSTRUCTION } from '../locale';
import type { ProviderRunBridge } from '../providerBridge';
import type { AgentRuntimeStreamCallbacks, ToolGateFunction } from '../types';
import type { CodexClientOptions, CodexTurnStartResult } from './types';

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

function createMockStream(): AgentRuntimeStreamCallbacks {
  return {
    ensureStreaming: vi.fn(),
    queueDelta: vi.fn(),
    finishStreaming: vi.fn(),
  };
}

describe('CodexRuntime Adapter Lifecycle & Tool Gating (#59)', () => {
  it('runs complete lifecycle: start -> startThread -> runTurn -> dispose', async () => {
    const mockClient = {
      start: vi.fn().mockResolvedValue({ serverInfo: { name: 'codex' } }),
      startThread: vi.fn().mockResolvedValue('th_test_123'),
      runTurn: vi.fn().mockResolvedValue({
        turnId: 'turn_456',
        usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70, durationMs: 500 },
      } satisfies CodexTurnStartResult),
      dispose: vi.fn(),
    } as unknown as CodexClient;

    const runtime = new CodexRuntime({
      extraEnv: { OPENAI_API_KEY: 'test-key' },
      clientFactory: () => mockClient,
    });

    const bridge = createMockBridge();
    const stream = createMockStream();
    const abort = new AbortController();

    await runtime.run(
      'sess-1',
      'Explain async generators',
      process.platform === 'win32' ? 'C:\\test\\repo' : '/test/repo',
      abort,
      'default',
      stream,
      bridge,
    );

    expect(mockClient.start).toHaveBeenCalledTimes(1);
    expect(mockClient.startThread).toHaveBeenCalledWith({
      cwd: process.platform === 'win32' ? 'C:\\test\\repo' : '/test/repo',
      instructions: undefined,
    });
    expect(bridge.onInit).toHaveBeenCalledWith('th_test_123');
    expect(bridge.ensureStreaming).toHaveBeenCalled();
    expect(mockClient.runTurn).toHaveBeenCalledWith(
      { threadId: 'th_test_123', prompt: 'Explain async generators' },
      abort.signal,
    );
    expect(bridge.onUsage).toHaveBeenCalledWith({
      inputTokens: 50,
      outputTokens: 20,
      totalTokens: 70,
      durationMs: 500,
    });
    expect(bridge.finishStreaming).toHaveBeenCalled();
    expect(bridge.onResult).toHaveBeenCalledWith(true, '');
    expect(mockClient.dispose).toHaveBeenCalledTimes(1);
  });

  it('injects bilingual LocaleContext instruction when prompt includes it (#54)', async () => {
    const mockClient = {
      start: vi.fn().mockResolvedValue({}),
      startThread: vi.fn().mockResolvedValue('th_ar_1'),
      runTurn: vi.fn().mockResolvedValue({}),
      dispose: vi.fn(),
    } as unknown as CodexClient;

    const runtime = new CodexRuntime({
      extraEnv: { OPENAI_API_KEY: 'test-key' },
      clientFactory: () => mockClient,
    });

    const bridge = createMockBridge();
    const stream = createMockStream();
    const prompt = `${ARABIC_LOCALE_INSTRUCTION}\n\nاشرح لي كيفية عمل الدالة`;

    await runtime.run(
      'sess-2',
      prompt,
      process.platform === 'win32' ? 'C:\\test\\repo' : '/test/repo',
      new AbortController(),
      'default',
      stream,
      bridge,
    );

    expect(mockClient.startThread).toHaveBeenCalledWith({
      cwd: process.platform === 'win32' ? 'C:\\test\\repo' : '/test/repo',
      instructions: ARABIC_LOCALE_INSTRUCTION,
    });
  });

  it('routes tool approval requests through the synchronous gate (SEC-19)', async () => {
    let capturedOptions: CodexClientOptions | undefined;
    const mockClient = {
      start: vi.fn().mockResolvedValue({}),
      startThread: vi.fn().mockResolvedValue('th_gate_1'),
      runTurn: vi.fn().mockResolvedValue({}),
      dispose: vi.fn(),
    } as unknown as CodexClient;

    const runtime = new CodexRuntime({
      extraEnv: { OPENAI_API_KEY: 'test-key' },
      clientFactory: (opts) => {
        capturedOptions = opts;
        return mockClient;
      },
    });

    const gate: ToolGateFunction = vi.fn().mockResolvedValue({
      behavior: 'allow',
      updatedInput: { command: 'git status --short' },
    });

    const bridge = createMockBridge();
    const stream = createMockStream();
    const abort = new AbortController();

    await runtime.run(
      'sess-gate',
      'Check git status',
      process.platform === 'win32' ? 'C:\\test\\repo' : '/test/repo',
      abort,
      'default',
      stream,
      bridge,
      gate,
    );

    const onRequestApproval = capturedOptions?.onRequestApproval;
    expect(onRequestApproval).toBeDefined();
    if (!onRequestApproval) throw new Error('onRequestApproval expected');

    // Trigger approval handler
    const decision = await onRequestApproval({
      callId: 'call-1',
      toolName: 'Bash',
      command: 'git status',
      input: { command: 'git status' },
    });

    expect(gate).toHaveBeenCalledWith('Bash', { command: 'git status' }, abort.signal);
    expect(decision).toEqual({
      approved: true,
      reason: undefined,
      updatedInput: { command: 'git status --short' },
    });
  });

  it('fails closed when gate denies or throws an error (SEC-19)', async () => {
    let capturedOptions: CodexClientOptions | undefined;
    const mockClient = {
      start: vi.fn().mockResolvedValue({}),
      startThread: vi.fn().mockResolvedValue('th_gate_2'),
      runTurn: vi.fn().mockResolvedValue({}),
      dispose: vi.fn(),
    } as unknown as CodexClient;

    const runtime = new CodexRuntime({
      extraEnv: { OPENAI_API_KEY: 'test-key' },
      clientFactory: (opts) => {
        capturedOptions = opts;
        return mockClient;
      },
    });

    const gate: ToolGateFunction = vi.fn().mockResolvedValue({
      behavior: 'deny',
      message: 'Operation forbidden in read-only mode',
    });

    await runtime.run(
      'sess-deny',
      'Modify file',
      process.platform === 'win32' ? 'C:\\test\\repo' : '/test/repo',
      new AbortController(),
      'plan',
      createMockStream(),
      createMockBridge(),
      gate,
    );

    const onRequestApproval = capturedOptions?.onRequestApproval;
    expect(onRequestApproval).toBeDefined();
    if (!onRequestApproval) throw new Error('onRequestApproval expected');

    const decision = await onRequestApproval({
      toolName: 'Write',
      input: { path: 'critical.ts' },
    });

    expect(decision).toEqual({
      approved: false,
      reason: 'Operation forbidden in read-only mode',
      updatedInput: undefined,
    });
  });

  it('fails closed when no gate is provided (SEC-19)', async () => {
    let capturedOptions: CodexClientOptions | undefined;
    const mockClient = {
      start: vi.fn().mockResolvedValue({}),
      startThread: vi.fn().mockResolvedValue('th_gate_3'),
      runTurn: vi.fn().mockResolvedValue({}),
      dispose: vi.fn(),
    } as unknown as CodexClient;

    const runtime = new CodexRuntime({
      extraEnv: { OPENAI_API_KEY: 'test-key' },
      clientFactory: (opts) => {
        capturedOptions = opts;
        return mockClient;
      },
    });

    await runtime.run(
      'sess-nogate',
      'Execute command',
      process.platform === 'win32' ? 'C:\\test\\repo' : '/test/repo',
      new AbortController(),
      'acceptEdits',
      createMockStream(),
      createMockBridge(),
    );

    const onRequestApproval = capturedOptions?.onRequestApproval;
    expect(onRequestApproval).toBeDefined();
    if (!onRequestApproval) throw new Error('onRequestApproval expected');

    const decision = await onRequestApproval({
      toolName: 'Bash',
      command: 'rm -rf /',
      input: { command: 'rm -rf /' },
    });

    expect(decision).toEqual({
      approved: false,
      reason: 'Permission denied: tool requires approval.',
    });
  });

  it('translates streaming notifications to the bridge during run', async () => {
    let capturedOptions: CodexClientOptions | undefined;
    const mockClient = {
      start: vi.fn().mockResolvedValue({}),
      startThread: vi.fn().mockResolvedValue('th_notif'),
      runTurn: vi.fn().mockImplementation(async () => {
        capturedOptions?.onNotification?.('item/message/delta', { delta: 'Streaming text...' });
        capturedOptions?.onNotification?.('item/command/start', { callId: 'c1', command: 'ls' });
        capturedOptions?.onNotification?.('item/command/finish', { callId: 'c1', status: 'done', output: 'a.txt' });
        return {};
      }),
      dispose: vi.fn(),
    } as unknown as CodexClient;

    const runtime = new CodexRuntime({
      extraEnv: { OPENAI_API_KEY: 'test-key' },
      clientFactory: (opts) => {
        capturedOptions = opts;
        return mockClient;
      },
    });

    const bridge = createMockBridge();
    await runtime.run(
      'sess-stream',
      'List files',
      process.platform === 'win32' ? 'C:\\test\\repo' : '/test/repo',
      new AbortController(),
      'default',
      createMockStream(),
      bridge,
    );

    expect(bridge.queueDelta).toHaveBeenCalledWith('Streaming text...');
    expect(bridge.onToolUse).toHaveBeenCalledWith('c1', 'Bash', { command: 'ls' });
    expect(bridge.onToolResult).toHaveBeenCalledWith('c1', 'done', 'a.txt');
  });

  it('always disposes client even when runTurn throws an error', async () => {
    const mockClient = {
      start: vi.fn().mockResolvedValue({}),
      startThread: vi.fn().mockResolvedValue('th_err'),
      runTurn: vi.fn().mockRejectedValue(new Error('Turn failure')),
      dispose: vi.fn(),
    } as unknown as CodexClient;

    const runtime = new CodexRuntime({
      extraEnv: { OPENAI_API_KEY: 'test-key' },
      clientFactory: () => mockClient,
    });

    const bridge = createMockBridge();
    await expect(
      runtime.run(
        'sess-err',
        'Fail prompt',
        process.platform === 'win32' ? 'C:\\test\\repo' : '/test/repo',
        new AbortController(),
        'default',
        createMockStream(),
        bridge,
      ),
    ).rejects.toThrow('Turn failure');

    expect(bridge.diag).toHaveBeenCalledWith('error', 'error', 'Turn failure');
    expect(mockClient.dispose).toHaveBeenCalledTimes(1);
  });

  it('throws actionable error when neither subscription credentials nor OPENAI_API_KEY is found', async () => {
    const runtime = new CodexRuntime({
      configDir: 'C:\\nonexistent_dir_12345',
      extraEnv: { OPENAI_API_KEY: '' },
    });

    await expect(
      runtime.run(
        'sess-no-auth',
        'Hello',
        process.platform === 'win32' ? 'C:\\test\\repo' : '/test/repo',
        new AbortController(),
        'default',
        createMockStream(),
        createMockBridge(),
      ),
    ).rejects.toThrow('OpenAI Codex authentication required');
  });
});
