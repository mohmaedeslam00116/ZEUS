import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { NativeAgentRuntime } from './NativeAgentRuntime';
import * as transport from './transport';

import type { ProviderAuthManager } from '../ProviderAuthManager';
import type { ModelCatalogManager } from '../catalog/ModelCatalogManager';
import type { SettingsManager } from '../../SettingsManager';
import type { ProviderRunBridge } from '../providerBridge';
import type { ToolGateFunction } from '../types';
import type { AppSettings, SessionPermissionMode } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/constants';

async function* mockSseChunks(chunks: string[]): AsyncIterable<string> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe('NativeAgentRuntime', () => {
  let db: Database.Database;
  let mockSettings: AppSettings;
  let mockSettingsManager: SettingsManager;
  let mockAuthManager: ProviderAuthManager;
  let mockCatalogManager: ModelCatalogManager;
  let runtime: NativeAgentRuntime;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE agent_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        thinking TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    mockSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    mockSettingsManager = {
      getAll: () => mockSettings,
      onChange: () => () => {
        /* no-op for mock */
      },
    } as unknown as SettingsManager;

    mockAuthManager = {
      getEffectiveApiKey: vi.fn().mockImplementation((provider) => {
        if (provider === 'gemini') return 'mock-gemini-key';
        if (provider === 'deepseek') return 'mock-deepseek-key';
        if (provider === 'anthropic') return 'mock-anthropic-key';
        return undefined;
      }),
      getEffectiveBaseUrl: vi.fn().mockReturnValue(undefined),
    } as unknown as ProviderAuthManager;

    mockCatalogManager = {
      listModels: vi.fn().mockResolvedValue([]),
      getCachedModelsSync: vi.fn().mockReturnValue([]),
    } as unknown as ModelCatalogManager;

    runtime = new NativeAgentRuntime(
      mockAuthManager,
      mockCatalogManager,
      mockSettingsManager,
      db,
    );
  });

  it('runs Gemini stream and routes deltas, thinking, and result to bridge', async () => {
    mockSettings.agent.model = 'gemini:gemini-2.5-flash';

    const sseResponse = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Analyzing query...","thought":true}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"Here is the output."}]}}]}\n\n',
      'data: {"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5,"totalTokenCount":15}}\n\n',
    ];

    vi.spyOn(transport, 'guardedPostSse').mockResolvedValue(mockSseChunks(sseResponse));

    const queuedDeltas: string[] = [];
    const queuedThinking: string[] = [];
    let runResult: { ok: boolean; text: string } | null = null;
    let reportedUsage: unknown = null;

    const mockBridge: ProviderRunBridge = {
      ensureStreaming: vi.fn(),
      queueDelta: (text) => queuedDeltas.push(text),
      onThinking: (text) => queuedThinking.push(text),
      finishStreaming: vi.fn(),
      onToolUse: vi.fn(),
      onToolResult: vi.fn(),
      onInit: vi.fn(),
      onResult: (ok, text) => {
        runResult = { ok, text };
      },
      onUsage: (u) => {
        reportedUsage = u;
      },
      diag: vi.fn(),
    };

    const abort = new AbortController();

    await runtime.run(
      'session_123',
      'What is 2 + 2?',
      '/workspace',
      abort,
      'full' as SessionPermissionMode,
      {
        ensureStreaming: vi.fn(),
        queueDelta: (t) => mockBridge.queueDelta(t),
        finishStreaming: vi.fn(),
      },
      mockBridge,
    );

    expect(queuedThinking).toEqual(['Analyzing query...']);
    expect(queuedDeltas).toEqual(['Here is the output.']);
    expect(runResult).toEqual({ ok: true, text: 'Here is the output.' });
    expect(reportedUsage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    });
  });

  it('runs DeepSeek OpenAI-compatible stream and routes reasoning_content to onThinking', async () => {
    mockSettings.agent.model = 'deepseek:deepseek-r1';

    const sseResponse = [
      'data: {"choices":[{"delta":{"reasoning_content":"Thinking through arithmetic."}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"4" handshake}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    // clean json
    sseResponse[1] = 'data: {"choices":[{"delta":{"content":"4"}}]}\n\n';

    vi.spyOn(transport, 'guardedPostSse').mockResolvedValue(mockSseChunks(sseResponse));

    const queuedDeltas: string[] = [];
    const queuedThinking: string[] = [];

    const mockBridge: ProviderRunBridge = {
      ensureStreaming: vi.fn(),
      queueDelta: (text) => queuedDeltas.push(text),
      onThinking: (text) => queuedThinking.push(text),
      finishStreaming: vi.fn(),
      onToolUse: vi.fn(),
      onToolResult: vi.fn(),
      onInit: vi.fn(),
      onResult: vi.fn(),
      diag: vi.fn(),
    };

    await runtime.run(
      'session_456',
      '2 + 2?',
      '/workspace',
      new AbortController(),
      'full' as SessionPermissionMode,
      {
        ensureStreaming: vi.fn(),
        queueDelta: (t) => mockBridge.queueDelta(t),
        finishStreaming: vi.fn(),
      },
      mockBridge,
    );

    expect(queuedThinking).toEqual(['Thinking through arithmetic.']);
    expect(queuedDeltas).toEqual(['4']);
  });

  it('handles tool call emission and invokes tool gate', async () => {
    mockSettings.agent.model = 'gemini:gemini-2.5-flash';

    const sseResponse = [
      'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"run_command","args":{"cmd":"echo hi"}}}]}}]}\n\n',
    ];

    vi.spyOn(transport, 'guardedPostSse').mockResolvedValue(mockSseChunks(sseResponse));

    const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    const mockBridge: ProviderRunBridge = {
      ensureStreaming: vi.fn(),
      queueDelta: vi.fn(),
      onThinking: vi.fn(),
      finishStreaming: vi.fn(),
      onToolUse: (id, name, input) => {
        toolCalls.push({ id, name, input });
      },
      onToolResult: vi.fn(),
      onInit: vi.fn(),
      onResult: vi.fn(),
      diag: vi.fn(),
    };

    const mockGate = vi.fn().mockResolvedValue({ behavior: 'allow' });

    await runtime.run(
      'session_789',
      'run command',
      '/workspace',
      new AbortController(),
      'full' as SessionPermissionMode,
      {
        ensureStreaming: vi.fn(),
        queueDelta: vi.fn(),
        finishStreaming: vi.fn(),
      },
      mockBridge,
      mockGate,
    );

    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0].name).toBe('run_command');
    expect(toolCalls[0].input).toEqual({ cmd: 'echo hi' });
    expect(mockGate).toHaveBeenCalledWith('run_command', { cmd: 'echo hi' }, expect.any(Object));
  });

  it('throws descriptive error if required API key is missing', async () => {
    mockSettings.agent.model = 'deepseek:deepseek-chat';
    // Return null key for deepseek
    vi.spyOn(mockAuthManager, 'getEffectiveApiKey').mockReturnValue(null);

    const mockBridge: ProviderRunBridge = {
      ensureStreaming: vi.fn(),
      queueDelta: vi.fn(),
      finishStreaming: vi.fn(),
      onToolUse: vi.fn(),
      onToolResult: vi.fn(),
      onInit: vi.fn(),
      onResult: vi.fn(),
      diag: vi.fn(),
    };

    await expect(
      runtime.run(
        'session_err',
        'prompt',
        '/workspace',
        new AbortController(),
        'full' as SessionPermissionMode,
        {
          ensureStreaming: vi.fn(),
          queueDelta: vi.fn(),
          finishStreaming: vi.fn(),
        },
        mockBridge,
      ),
    ).rejects.toThrow(/API key missing for provider "deepseek"/);
  });

  it('runs Anthropic stream and routes thinking and text deltas', async () => {
    mockSettings.agent.model = 'anthropic:claude-3-7-sonnet';

    const sseResponse = [
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Analyzing logic..."}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Result: OK"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":42}}\n\n',
    ];

    vi.spyOn(transport, 'guardedPostSse').mockResolvedValue(mockSseChunks(sseResponse));

    const queuedDeltas: string[] = [];
    const queuedThinking: string[] = [];
    let runResult: { ok: boolean; text: string } | null = null;

    const mockBridge: ProviderRunBridge = {
      ensureStreaming: vi.fn(),
      queueDelta: (text) => queuedDeltas.push(text),
      onThinking: (text) => queuedThinking.push(text),
      finishStreaming: vi.fn(),
      onToolUse: vi.fn(),
      onToolResult: vi.fn(),
      onInit: vi.fn(),
      onResult: (ok, text) => {
        runResult = { ok, text };
      },
      onUsage: vi.fn(),
      diag: vi.fn(),
    };

    await runtime.run(
      'session_anthropic',
      'Analyze logic',
      '/workspace',
      new AbortController(),
      'full' as SessionPermissionMode,
      {
        ensureStreaming: vi.fn(),
        queueDelta: (t) => mockBridge.queueDelta(t),
        finishStreaming: vi.fn(),
      },
      mockBridge,
    );

    expect(queuedThinking).toEqual(['Analyzing logic...']);
    expect(queuedDeltas).toEqual(['Result: OK']);
    expect(runResult).toEqual({ ok: true, text: 'Result: OK' });
  });

  it('runs Ollama without requiring an API key and allows private loopback', async () => {
    mockSettings.agent.model = 'ollama:llama3.2:latest';
    vi.spyOn(mockAuthManager, 'getEffectiveApiKey').mockReturnValue(null);

    const postSpy = vi.spyOn(transport, 'guardedPostSse').mockResolvedValue(
      mockSseChunks(['data: {"choices":[{"delta":{"content":"Local response"}}]}\n\n', 'data: [DONE]\n\n']),
    );

    const queuedDeltas: string[] = [];
    const mockBridge: ProviderRunBridge = {
      ensureStreaming: vi.fn(),
      queueDelta: (text) => queuedDeltas.push(text),
      finishStreaming: vi.fn(),
      onToolUse: vi.fn(),
      onToolResult: vi.fn(),
      onInit: vi.fn(),
      onResult: vi.fn(),
      diag: vi.fn(),
    };

    await runtime.run(
      'session_ollama',
      'hi',
      '/workspace',
      new AbortController(),
      'full' as SessionPermissionMode,
      {
        ensureStreaming: vi.fn(),
        queueDelta: (t) => mockBridge.queueDelta(t),
        finishStreaming: vi.fn(),
      },
      mockBridge,
    );

    expect(queuedDeltas).toEqual(['Local response']);
    expect(postSpy).toHaveBeenCalledWith(
      expect.stringContaining('11434'),
      expect.any(Object),
      expect.objectContaining({ allowPrivate: true }),
    );
  });

  it('exits cleanly on user abort without throwing unhandled error', async () => {
    mockSettings.agent.model = 'gemini:gemini-2.5-flash';

    const abortController = new AbortController();

    async function* abortingStream(): AsyncIterable<string> {
      yield 'data: {"candidates":[{"content":{"parts":[{"text":"first "}]}}]}\n\n';
      abortController.abort();
      throw new Error('Request aborted by caller');
    }

    vi.spyOn(transport, 'guardedPostSse').mockResolvedValue(abortingStream());

    const finishStreamingSpy = vi.fn();
    const mockBridge: ProviderRunBridge = {
      ensureStreaming: vi.fn(),
      queueDelta: vi.fn(),
      finishStreaming: finishStreamingSpy,
      onToolUse: vi.fn(),
      onToolResult: vi.fn(),
      onInit: vi.fn(),
      onResult: vi.fn(),
      diag: vi.fn(),
    };

    // Should not throw when abort was triggered
    await runtime.run(
      'session_abort',
      'stop midway',
      '/workspace',
      abortController,
      'full' as SessionPermissionMode,
      {
        ensureStreaming: vi.fn(),
        queueDelta: vi.fn(),
        finishStreaming: finishStreamingSpy,
      },
      mockBridge,
    );

    expect(finishStreamingSpy).toHaveBeenCalled();
  });

  it('executes multi-turn tool execution loop with permission gating and model feedback', async () => {
    mockSettings.agent.model = 'openai:gpt-4o';
    vi.spyOn(mockAuthManager, 'getEffectiveApiKey').mockReturnValue('mock-openai-key');

    const testWs = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'zeus-react-test-'));

    try {
      // Turn 1: Model calls write_file
      const sseTurn1 = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_101","function":{"name":"write_file","arguments":"{\\"path\\":\\"created.txt\\",\\"content\\":\\"Hello from native agent\\"}"}}]}}]}\n\n',
      ];
      // Turn 2: Model finishes with textual summary
      const sseTurn2 = [
        'data: {"choices":[{"delta":{"content":"I have created the file for you."}}]}\n\n',
      ];

      const postSpy = vi
        .spyOn(transport, 'guardedPostSse')
        .mockResolvedValueOnce(mockSseChunks(sseTurn1))
        .mockResolvedValueOnce(mockSseChunks(sseTurn2));

      const queuedDeltas: string[] = [];
      const toolUseSpy = vi.fn();
      const toolResultSpy = vi.fn();

      const mockBridge: ProviderRunBridge = {
        ensureStreaming: vi.fn(),
        queueDelta: (d) => queuedDeltas.push(d),
        onThinking: vi.fn(),
        finishStreaming: vi.fn(),
        onToolUse: toolUseSpy,
        onToolResult: toolResultSpy,
        onInit: vi.fn(),
        onResult: vi.fn(),
        diag: vi.fn(),
      };

      const mockGate = vi.fn().mockResolvedValue({ behavior: 'allow' });

      await runtime.run(
        'session_react',
        'create a file',
        testWs,
        new AbortController(),
        'full' as SessionPermissionMode,
        {
          ensureStreaming: vi.fn(),
          queueDelta: (d) => queuedDeltas.push(d),
          finishStreaming: vi.fn(),
        },
        mockBridge,
        mockGate,
      );

      // Verify Turn 1 tool gating & execution
      expect(mockGate).toHaveBeenCalledWith(
        'write_file',
        { path: 'created.txt', content: 'Hello from native agent' },
        expect.any(Object),
      );
      expect(toolUseSpy).toHaveBeenCalledWith(
        'call_101',
        'write_file',
        { path: 'created.txt', content: 'Hello from native agent' },
      );
      expect(toolResultSpy).toHaveBeenCalledWith(
        'call_101',
        'done',
        expect.stringContaining('Successfully wrote'),
      );


      // Verify file was written to disk
      const fileOnDisk = await fs.promises.readFile(path.join(testWs, 'created.txt'), 'utf8');
      expect(fileOnDisk).toBe('Hello from native agent');

      // Verify Turn 2 completion
      expect(postSpy).toHaveBeenCalledTimes(2);
      expect(queuedDeltas).toContain('I have created the file for you.');
      expect(mockBridge.onResult).toHaveBeenCalledWith(true, 'I have created the file for you.');
    } finally {
      await fs.promises.rm(testWs, { recursive: true, force: true });
    }
  });

  it('handles ask_followup_question in multi-turn loop and resumes with user response', async () => {
    mockSettings.agent.model = 'openai:gpt-4o';
    vi.spyOn(mockAuthManager, 'getEffectiveApiKey').mockReturnValue('mock-openai-key');

    const turn1Sse = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_q1","type":"function","function":{"name":"ask_followup_question","arguments":"{\\"question\\":\\"Which framework?\\",\\"options\\":[\\"React\\",\\"Vue\\"]}"}}]}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const turn2Sse = [
      'data: {"choices":[{"delta":{"content":"Setting up React project."}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const postSpy = vi
      .spyOn(transport, 'guardedPostSse')
      .mockResolvedValueOnce(mockSseChunks(turn1Sse))
      .mockResolvedValueOnce(mockSseChunks(turn2Sse));

    const askHandler = vi.fn().mockResolvedValue('React');
    runtime.setAskUserQuestionHandler(askHandler);

    const queuedDeltas: string[] = [];
    const mockBridge: ProviderRunBridge = {
      ensureStreaming: vi.fn(),
      queueDelta: (d) => queuedDeltas.push(d),
      finishStreaming: vi.fn(),
      onToolUse: vi.fn(),
      onToolResult: vi.fn(),
      onInit: vi.fn(),
      onResult: vi.fn(),
      diag: vi.fn(),
    };
    const mockGate: ToolGateFunction = vi.fn().mockResolvedValue({ behavior: 'allow' });

    await runtime.run(
      's-interactive-1',
      'Start setup',
      os.tmpdir(),
      new AbortController(),
      'auto' as SessionPermissionMode,
      {
        ensureStreaming: vi.fn(),
        queueDelta: (d) => queuedDeltas.push(d),
        finishStreaming: vi.fn(),
      },
      mockBridge,
      mockGate,
    );

    expect(askHandler).toHaveBeenCalledWith('s-interactive-1', 'Which framework?', ['React', 'Vue'], expect.any(Object));
    expect(postSpy).toHaveBeenCalledTimes(2);
    expect(mockBridge.onToolResult).toHaveBeenCalledWith('call_q1', 'done', 'React');
    expect(mockBridge.onResult).toHaveBeenCalledWith(true, 'Setting up React project.');
  });

  it('handles attempt_completion and terminates multi-turn loop immediately', async () => {
    mockSettings.agent.model = 'openai:gpt-4o';
    vi.spyOn(mockAuthManager, 'getEffectiveApiKey').mockReturnValue('mock-openai-key');

    const turn1Sse = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_c1","type":"function","function":{"name":"attempt_completion","arguments":"{\\"result\\":\\"Refactoring complete.\\",\\"command\\":\\"npm test\\"}"}}]}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const postSpy = vi
      .spyOn(transport, 'guardedPostSse')
      .mockResolvedValueOnce(mockSseChunks(turn1Sse));

    const queuedDeltas: string[] = [];
    const mockBridge: ProviderRunBridge = {
      ensureStreaming: vi.fn(),
      queueDelta: (d) => queuedDeltas.push(d),
      finishStreaming: vi.fn(),
      onToolUse: vi.fn(),
      onToolResult: vi.fn(),
      onInit: vi.fn(),
      onResult: vi.fn(),
      diag: vi.fn(),
    };
    const mockGate: ToolGateFunction = vi.fn().mockResolvedValue({ behavior: 'allow' });

    await runtime.run(
      's-interactive-2',
      'Complete task',
      os.tmpdir(),
      new AbortController(),
      'auto' as SessionPermissionMode,
      {
        ensureStreaming: vi.fn(),
        queueDelta: (d) => queuedDeltas.push(d),
        finishStreaming: vi.fn(),
      },
      mockBridge,
      mockGate,
    );

    // Only 1 turn was made because attempt_completion terminated the loop
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(mockBridge.onToolUse).toHaveBeenCalledWith(
      'call_c1',
      'attempt_completion',
      { result: 'Refactoring complete.', command: 'npm test' },
    );
    expect(mockBridge.onToolResult).toHaveBeenCalledWith(
      'call_c1',
      'done',
      expect.stringContaining('Task Completion Summary:\nRefactoring complete.'),
    );
    expect(mockBridge.onResult).toHaveBeenCalledWith(
      true,
      expect.stringContaining('Task Completion Summary:\nRefactoring complete.'),
    );
  });

  it('breaks immediately from tool execution loop when attempt_completion is encountered', async () => {
    mockSettings.agent.model = 'openai:gpt-4o';
    vi.spyOn(mockAuthManager, 'getEffectiveApiKey').mockReturnValue('mock-openai-key');

    const turn1Sse = [
      'data: {"choices":[{"delta":{"tool_calls":[' +
        '{"index":0,"id":"call_c1","type":"function","function":{"name":"attempt_completion","arguments":"{\\"result\\":\\"Done.\\"}"}},' +
        '{"index":1,"id":"call_c2","type":"function","function":{"name":"run_command","arguments":"{\\"command\\":\\"ls\\"}"}}' +
      ']}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    vi.spyOn(transport, 'guardedPostSse').mockResolvedValueOnce(mockSseChunks(turn1Sse));

    const queuedDeltas: string[] = [];
    const mockBridge: ProviderRunBridge = {
      ensureStreaming: vi.fn(),
      queueDelta: (d) => queuedDeltas.push(d),
      finishStreaming: vi.fn(),
      onToolUse: vi.fn(),
      onToolResult: vi.fn(),
      onInit: vi.fn(),
      onResult: vi.fn(),
      diag: vi.fn(),
    };
    const mockGate: ToolGateFunction = vi.fn().mockResolvedValue({ behavior: 'allow' });

    await runtime.run(
      's-interactive-3',
      'Complete task and ignore extra tools',
      os.tmpdir(),
      new AbortController(),
      'auto' as SessionPermissionMode,
      {
        ensureStreaming: vi.fn(),
        queueDelta: (d) => queuedDeltas.push(d),
        finishStreaming: vi.fn(),
      },
      mockBridge,
      mockGate,
    );

    expect(mockBridge.onToolUse).toHaveBeenCalledWith('call_c1', 'attempt_completion', { result: 'Done.' });
    expect(mockBridge.onToolUse).not.toHaveBeenCalledWith('call_c2', 'run_command', expect.anything());
    expect(mockBridge.onResult).toHaveBeenCalledWith(true, expect.stringContaining('Task Completion Summary:\nDone.'));
  });

  it('scopes tools and injects Architect persona when running in plan mode', async () => {
    mockSettings.agent.model = 'openai:gpt-4o';
    vi.spyOn(mockAuthManager, 'getEffectiveApiKey').mockReturnValue('mock-openai-key');

    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Analysis complete."}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const postSpy = vi
      .spyOn(transport, 'guardedPostSse')
      .mockResolvedValueOnce(mockSseChunks(sseChunks));

    const queuedDeltas: string[] = [];
    const mockBridge: ProviderRunBridge = {
      ensureStreaming: vi.fn(),
      queueDelta: (d) => queuedDeltas.push(d),
      finishStreaming: vi.fn(),
      onToolUse: vi.fn(),
      onToolResult: vi.fn(),
      onInit: vi.fn(),
      onResult: vi.fn(),
      diag: vi.fn(),
    };

    await runtime.run(
      's-persona-1',
      'Analyze the system architecture',
      os.tmpdir(),
      new AbortController(),
      'plan',
      {
        ensureStreaming: vi.fn(),
        queueDelta: (d) => queuedDeltas.push(d),
        finishStreaming: vi.fn(),
      },
      mockBridge,
    );

    expect(postSpy).toHaveBeenCalledTimes(1);
    const sentBody = postSpy.mock.calls[0][1] as {
      messages: Array<{ role: string; content: string }>;
      tools: Array<{ type: string; function: { name: string } }>;
    };

    // System prompt contains persona definition
    expect(sentBody.messages[0].role).toBe('system');
    expect(sentBody.messages[0].content).toContain('Active Mode (Architect):');
    expect(sentBody.messages[0].content).toContain('You are Zeus in Architect mode');

    // Scoped tools omit mutating tools
    const toolNames = sentBody.tools.map((t) => t.function.name);
    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('list_directory_tree');
    expect(toolNames).toContain('view_code_symbols');
    expect(toolNames).toContain('memory_recall');
    expect(toolNames).not.toContain('write_file');
    expect(toolNames).not.toContain('edit_file');
    expect(toolNames).not.toContain('run_command');
  });

  it('loads and applies custom workspace modes from .zeusmodes.json', async () => {
    mockSettings.agent.model = 'openai:gpt-4o';
    vi.spyOn(mockAuthManager, 'getEffectiveApiKey').mockReturnValue('mock-openai-key');

    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-custom-modes-ws-'));
    try {
      const customModes = [
        {
          slug: 'code',
          name: 'Restricted Code',
          roleDefinition: 'You are in Restricted Code mode. Only edits are allowed.',
          groups: ['read', 'edit'],
          customInstructions: 'Strictly check types before every edit.',
        },
      ];
      fs.writeFileSync(
        path.join(tempWorkspace, '.zeusmodes.json'),
        JSON.stringify(customModes),
        'utf-8',
      );

      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"Code ready."}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const postSpy = vi
        .spyOn(transport, 'guardedPostSse')
        .mockResolvedValueOnce(mockSseChunks(sseChunks));

      const queuedDeltas: string[] = [];
      const mockBridge: ProviderRunBridge = {
        ensureStreaming: vi.fn(),
        queueDelta: (d) => queuedDeltas.push(d),
        finishStreaming: vi.fn(),
        onToolUse: vi.fn(),
        onToolResult: vi.fn(),
        onInit: vi.fn(),
        onResult: vi.fn(),
        diag: vi.fn(),
      };

      await runtime.run(
        's-custom-ws-1',
        'Implement feature',
        tempWorkspace,
        new AbortController(),
        'default',
        {
          ensureStreaming: vi.fn(),
          queueDelta: (d) => queuedDeltas.push(d),
          finishStreaming: vi.fn(),
        },
        mockBridge,
      );

      expect(postSpy).toHaveBeenCalledTimes(1);
      const sentBody = postSpy.mock.calls[0][1] as {
        messages: Array<{ role: string; content: string }>;
        tools: Array<{ type: string; function: { name: string } }>;
      };

      expect(sentBody.messages[0].content).toContain('Active Mode (Restricted Code):');
      expect(sentBody.messages[0].content).toContain(
        'Mode Custom Instructions:\nStrictly check types before every edit.',
      );

      const toolNames = sentBody.tools.map((t) => t.function.name);
      expect(toolNames).toContain('read_file');
      expect(toolNames).toContain('write_file');
      expect(toolNames).not.toContain('run_command'); // 'command' group was not in custom mode groups!
    } finally {
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
    }
  });
});

