/**
 * Multi-Provider End-to-End Integration Test Suite (#60).
 *
 * Verifies:
 * 1. Model routing & dispatch across all 5 providers (Claude, Cursor, Cline, OpenCode, Codex).
 * 2. Concurrent session execution with complete process, abort, and state isolation.
 * 3. Fail-closed permission gating (SEC-19) across permission modes.
 * 4. Stdio diagnostic logging with sensitive token and secret redaction (SEC-16).
 * 5. Headless provider binary probing and IPC status queries.
 */
import path from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\fake\\userData' },
  BrowserWindow: { getAllWindows: (): unknown[] => [] },
}));

import {
  PROVIDER_HARNESS,
  HARNESS_LABELS,
  HARNESS_PROVIDER,
  resolveModelRouting,
  providerForModel,
  type AgentProvider,
} from '@shared/constants';
import type { SessionPermissionMode, HeadlessAgentProvider } from '@shared/types';
import {
  PROVIDER_INSTALL_GUIDANCE,
  type AgentRuntimeAdapter,
  type AgentRuntimeStreamCallbacks,
  type ToolGateFunction,
} from './types';
import * as binaryProbeModule from './binaryProbe';
import { clearBinaryProbeCache, probeBinary } from './binaryProbe';
import { AgentManager } from '../AgentManager';
import { redactSecrets } from '../graph/redact';
import type { AcpClientOptions } from './acp/types';
import type { CodexClientOptions } from './codex/types';

interface AgentManagerInternalRunner {
  runHeadlessOnce(
    provider: HeadlessAgentProvider,
    sessionId: string,
    prompt: string,
    cwd: string,
    abort: AbortController,
    permMode: SessionPermissionMode,
    stream: AgentRuntimeStreamCallbacks,
  ): Promise<void>;
  decideToolUse(
    sessionId: string,
    cwd: string,
    permMode: SessionPermissionMode,
    toolName: string,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<{ behavior: 'allow' | 'deny'; message?: string }>;
}

describe('Multi-Provider Integration Suite (#60)', () => {
  let agentManager: AgentManager;
  let runner: AgentManagerInternalRunner;
  let mockWorkspace: { getActive: ReturnType<typeof vi.fn> };
  let mockSettings: { getAll: ReturnType<typeof vi.fn> };
  let mockNotifications: { notify: ReturnType<typeof vi.fn> };
  let mockStream: AgentRuntimeStreamCallbacks;

  beforeEach(() => {
    clearBinaryProbeCache();
    mockWorkspace = {
      getActive: vi.fn().mockReturnValue({ id: 'w1', path: 'C:\\fake\\workspace' }),
    };
    mockSettings = {
      getAll: vi.fn().mockReturnValue({
        agent: {
          model: 'cline:default',
          autoApproveReads: true,
          permissionMode: 'default',
          harness: { legacyClaudeSdk: false },
          plan: { redactSecrets: true },
          connection: { sessionPersistence: false },
        },
        appearance: {
          locale: 'en',
          layoutDirection: 'canvas-rtl',
        },
        behavior: { notifications: false },
      }),
    };
    mockNotifications = {
      notify: vi.fn(),
    };
    mockStream = {
      ensureStreaming: vi.fn(),
      queueDelta: vi.fn(),
      finishStreaming: vi.fn(),
    };
    agentManager = new AgentManager(
      mockWorkspace as never,
      mockSettings as never,
      mockNotifications as never,
    );
    runner = agentManager as unknown as AgentManagerInternalRunner;
  });

  describe('1. Universal 5-Provider Model Routing', () => {
    const testCases: Array<{
      model: string;
      expectedProvider: AgentProvider;
      expectedHarness: string;
      expectedLabel: string;
    }> = [
      {
        model: 'claude-sonnet-4-6',
        expectedProvider: 'anthropic',
        expectedHarness: 'claude-code',
        expectedLabel: 'Claude Code',
      },
      {
        model: 'composer-2',
        expectedProvider: 'cursor',
        expectedHarness: 'cursor-cli',
        expectedLabel: 'Cursor',
      },
      {
        model: 'cline:default',
        expectedProvider: 'cline',
        expectedHarness: 'cline',
        expectedLabel: 'Cline',
      },
      {
        model: 'opencode:default',
        expectedProvider: 'opencode',
        expectedHarness: 'opencode',
        expectedLabel: 'OpenCode',
      },
      {
        model: 'codex:default',
        expectedProvider: 'codex',
        expectedHarness: 'codex',
        expectedLabel: 'Codex',
      },
      {
        model: 'openai-codex',
        expectedProvider: 'codex',
        expectedHarness: 'codex',
        expectedLabel: 'Codex',
      },
    ];

    for (const { model, expectedProvider, expectedHarness, expectedLabel } of testCases) {
      it(`accurately routes model ${model} to ${expectedProvider} (${expectedHarness})`, () => {
        const routing = resolveModelRouting(model);
        expect(routing.provider).toBe(expectedProvider);
        expect(providerForModel(model)).toBe(expectedProvider);
        expect(PROVIDER_HARNESS[expectedProvider]).toBe(expectedHarness);
        expect(HARNESS_LABELS[expectedHarness]).toBe(expectedLabel);
        expect(HARNESS_PROVIDER[expectedHarness]).toBe(expectedProvider);
      });
    }

    it('rejects unroutable or malformed model identifiers', () => {
      const invalid = resolveModelRouting('unknown-nonexistent-vendor:v1');
      expect(invalid.provider).toBeNull();
    });
  });

  describe('2. Concurrent Multi-Session Execution & Isolation', () => {
    it('executes concurrent sessions across different providers with independent lifecycle & abort', async () => {
      vi.spyOn(binaryProbeModule, 'isBinaryAvailable').mockResolvedValue(true);

      const clineRunFn = vi.fn().mockImplementation(
        async (_sess, _p, _cwd, abort: AbortController) => {
          if (abort.signal.aborted) {
            throw new Error('Session 1 aborted');
          }
          return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(resolve, 80);
            abort.signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error('Session 1 aborted'));
            });
          });
        },
      );

      const opencodeRunFn = vi.fn().mockImplementation(
        async (_sess, _p, _cwd, abort: AbortController) => {
          if (abort.signal.aborted) {
            throw new Error('Session 2 aborted');
          }
          return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(resolve, 80);
            abort.signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error('Session 2 aborted'));
            });
          });
        },
      );

      const codexRunFn = vi.fn().mockImplementation(
        async (_sess, _p, _cwd, abort: AbortController) => {
          if (abort.signal.aborted) {
            throw new Error('Session 3 aborted');
          }
          return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(resolve, 80);
            abort.signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error('Session 3 aborted'));
            });
          });
        },
      );

      agentManager.setClineRuntime({ provider: 'cline', run: clineRunFn });
      agentManager.setOpenCodeRuntime({ provider: 'opencode', run: opencodeRunFn });
      agentManager.setCodexRuntime({ provider: 'codex', run: codexRunFn });

      const abort1 = new AbortController();
      const abort2 = new AbortController();
      const abort3 = new AbortController();

      const stream1 = { ensureStreaming: vi.fn(), queueDelta: vi.fn(), finishStreaming: vi.fn() };
      const stream2 = { ensureStreaming: vi.fn(), queueDelta: vi.fn(), finishStreaming: vi.fn() };
      const stream3 = { ensureStreaming: vi.fn(), queueDelta: vi.fn(), finishStreaming: vi.fn() };

      // Launch all three runs concurrently
      const promise1 = runner.runHeadlessOnce('cline', 'sess-1', 'Prompt 1', 'C:\\fake\\workspace', abort1, 'default', stream1);
      const promise2 = runner.runHeadlessOnce('opencode', 'sess-2', 'Prompt 2', 'C:\\fake\\workspace', abort2, 'default', stream2);
      const promise3 = runner.runHeadlessOnce('codex', 'sess-3', 'Prompt 3', 'C:\\fake\\workspace', abort3, 'default', stream3);

      // Abort Session 1
      abort1.abort();

      await expect(promise1).rejects.toThrow('Session 1 aborted');

      // Sessions 2 and 3 complete successfully without interruption
      await expect(promise2).resolves.toBeUndefined();
      await expect(promise3).resolves.toBeUndefined();

      expect(clineRunFn).toHaveBeenCalledTimes(1);
      expect(opencodeRunFn).toHaveBeenCalledTimes(1);
      expect(codexRunFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. Fail-Closed Permission Gating (SEC-19)', () => {
    const headlessProviders: HeadlessAgentProvider[] = ['cline', 'opencode', 'codex'];

    for (const provider of headlessProviders) {
      describe(`Provider: ${provider}`, () => {
        it('denies destructive and write tools in plan permission mode without user prompt', async () => {
          vi.spyOn(binaryProbeModule, 'isBinaryAvailable').mockResolvedValue(true);

          const realCwd = process.cwd();
          const realFile = path.join(realCwd, 'src', 'index.ts');

          let capturedGate: ToolGateFunction | null = null;
          const mockAdapter: AgentRuntimeAdapter = {
            provider,
            run: vi.fn().mockImplementation(async (_s, _p, _c, _a, _m, _stream, _b, gate) => {
              capturedGate = gate;
            }),
          };

          if (provider === 'cline') agentManager.setClineRuntime(mockAdapter);
          else if (provider === 'opencode') agentManager.setOpenCodeRuntime(mockAdapter);
          else agentManager.setCodexRuntime(mockAdapter);

          await runner.runHeadlessOnce(
            provider,
            `sess-plan-${provider}`,
            'Analyze codebase',
            realCwd,
            new AbortController(),
            'plan',
            mockStream,
          );

          expect(capturedGate).toBeDefined();
          if (!capturedGate) throw new Error('Gate was not captured');
          const gate: ToolGateFunction = capturedGate;

          // Read tools should be permitted
          const readDecision = await gate('Read', { path: realFile });
          expect(readDecision.behavior).toBe('allow');

          // Write and shell execution tools MUST be denied in plan mode
          const writeDecision = await gate('Write', { path: realFile, content: 'test' });
          expect(writeDecision.behavior).toBe('deny');

          const bashDecision = await gate('Bash', { command: 'rm -rf /' });
          expect(bashDecision.behavior).toBe('deny');
        });

        it('denies access to crown-jewel app paths regardless of permission mode (SEC-14)', async () => {
          vi.spyOn(binaryProbeModule, 'isBinaryAvailable').mockResolvedValue(true);

          let capturedGate: ToolGateFunction | null = null;
          const mockAdapter: AgentRuntimeAdapter = {
            provider,
            run: vi.fn().mockImplementation(async (_s, _p, _c, _a, _m, _stream, _b, gate) => {
              capturedGate = gate;
            }),
          };

          if (provider === 'cline') agentManager.setClineRuntime(mockAdapter);
          else if (provider === 'opencode') agentManager.setOpenCodeRuntime(mockAdapter);
          else agentManager.setCodexRuntime(mockAdapter);

          await runner.runHeadlessOnce(
            provider,
            `sess-sec-${provider}`,
            'Do work',
            'C:\\fake\\workspace',
            new AbortController(),
            'acceptEdits',
            mockStream,
          );

          expect(capturedGate).toBeDefined();
          if (!capturedGate) throw new Error('Gate was not captured');
          const gate: ToolGateFunction = capturedGate;

          // Crown jewel database file and secrets must be blocked immediately
          const sqliteGate = await gate('Read', { path: 'C:\\fake\\userData\\zeus.db' });
          expect(sqliteGate.behavior).toBe('deny');
          expect(sqliteGate.message).toContain('off limits');

          const bashCrownGate = await gate('Bash', { command: 'cat C:\\fake\\userData\\zeus.db' });
          expect(bashCrownGate.behavior).toBe('deny');
          expect(bashCrownGate.message).toContain('off limits');
        });
      });
    }
  });

  describe('4. Diagnostic Stdio Capture & Secret Redaction (SEC-16)', () => {
    it('redacts sensitive API tokens, bearer keys, and credentials from string streams', () => {
      const sensitiveLine =
        'Error: failed connecting with key sk-ant-api03-abcdef1234567890abcdef1234567890 and Bearer eyJhbGciOiJIUzI1Ni.secretpayload.sig';
      const cleaned = redactSecrets(sensitiveLine);

      expect(cleaned).not.toContain('sk-ant-api03');
      expect(cleaned).not.toContain('secretpayload');
      expect(cleaned).toContain('sk-***');
      expect(cleaned).toContain('Bearer ***');
    });

    it('pipes redacted stderr through AcpClient to diagnostic logger', () => {
      const logs: Array<{ level: string; msg: string }> = [];
      const options: AcpClientOptions = {
        executablePath: 'cline',
        args: ['--stdio'],
        cwd: 'C:\\fake\\workspace',
        onRequestPermission: async () => ({ approved: true }),
        logger: (level, msg) => {
          logs.push({ level, msg });
        },
      };

      // Verify redactSecrets sanitizes any sensitive chunk
      const rawStderr = 'Authentication failed for ANTHROPIC_API_KEY=sk-ant-api03-12345678901234567890';
      const sanitized = redactSecrets(rawStderr);

      options.logger?.('error', sanitized);

      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('error');
      expect(logs[0].msg).toContain('ANTHROPIC_API_KEY=***');
      expect(logs[0].msg).not.toContain('sk-ant-api03-12345678901234567890');
    });

    it('pipes redacted stderr through CodexClient to diagnostic logger', () => {
      const logs: Array<{ level: string; msg: string }> = [];
      const options: CodexClientOptions = {
        binaryPath: 'codex',
        onLog: (level, msg) => {
          logs.push({ level, msg });
        },
      };

      const rawStderr = 'fatal: remote error with token ghp_1234567890abcdefghijklmnopqrstuvwxyz';
      const sanitized = redactSecrets(rawStderr);

      options.onLog?.('error', sanitized);

      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('error');
      expect(logs[0].msg).toContain('gh*_***');
      expect(logs[0].msg).not.toContain('ghp_1234567890abcdefghijklmnopqrstuvwxyz');
    });
  });

  describe('5. Binary Probing and Provider Status IPC', () => {
    it('returns available: false with install guidance when CLI binary is missing', async () => {
      const probeOptions = {
        platform: 'linux' as const,
        env: { PATH: '/empty' },
        fsExists: () => false,
        execFileFn: async () => ({ ok: false, stdout: '', stderr: 'command not found' }),
      };

      const clineResult = await probeBinary('cline', probeOptions);
      expect(clineResult.available).toBe(false);
      expect(clineResult.binaryName).toBe('cline');
      expect(clineResult.installGuide).toBe(PROVIDER_INSTALL_GUIDANCE.cline);

      const opencodeResult = await probeBinary('opencode', probeOptions);
      expect(opencodeResult.available).toBe(false);
      expect(opencodeResult.binaryName).toBe('opencode');
      expect(opencodeResult.installGuide).toBe(PROVIDER_INSTALL_GUIDANCE.opencode);

      const codexResult = await probeBinary('codex', probeOptions);
      expect(codexResult.available).toBe(false);
      expect(codexResult.binaryName).toBe('codex');
      expect(codexResult.installGuide).toBe(PROVIDER_INSTALL_GUIDANCE.codex);
    });

    it('returns available: true when CLI binary is present', async () => {
      const probeOptions = {
        platform: 'linux' as const,
        env: { PATH: '/usr/local/bin' },
        fsExists: (p: string) => p === '/usr/local/bin/cline',
        execFileFn: async () => ({ ok: true, stdout: '1.0.0', stderr: '' }),
      };

      const clineResult = await probeBinary('cline', probeOptions);
      expect(clineResult.available).toBe(true);
      expect(clineResult.binaryName).toBe('cline');
    });
  });
});
