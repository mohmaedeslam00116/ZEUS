/**
 * Unit tests for Agent Schema, Model Routing, and Binary Probing (#56).
 *
 * Verifies:
 * - Model catalog and prefix routing for Cline, OpenCode, and Codex.
 * - Unknown model rejection.
 * - Cross-platform binary detection probe (Windows, Linux, macOS).
 * - Actionable installation guidance and error formatting.
 * - AgentManager preflight binary gating and runtime adapter delegation.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\fake\\userData' },
  BrowserWindow: { getAllWindows: (): unknown[] => [] },
}));

import {
  AGENT_MODELS,
  PROVIDER_HARNESS,
  HARNESS_LABELS,
  HARNESS_PROVIDER,
  resolveModelRouting,
  providerForModel,
} from '@shared/constants';
import type { SessionPermissionMode } from '@shared/types';
import {
  CLINE_MODEL_PREFIX,
  OPENCODE_MODEL_PREFIX,
  CODEX_MODEL_PREFIX,
  OPENAI_CODEX_MODEL,
  PROVIDER_INSTALL_COMMANDS,
  PROVIDER_INSTALL_GUIDANCE,
  type AgentRuntimeAdapter,
  type AgentRuntimeStreamCallbacks,
} from './types';
import * as binaryProbeModule from './binaryProbe';
import {
  clearBinaryProbeCache,
  isBinaryAvailable,
  probeBinary,
} from './binaryProbe';
import { AgentManager } from '../AgentManager';

describe('Agent Schema & Model Catalog (#56)', () => {
  it('registers cline, opencode, and codex in AGENT_MODELS', () => {
    const cline = AGENT_MODELS.find((m) => m.provider === 'cline');
    const opencode = AGENT_MODELS.find((m) => m.provider === 'opencode');
    const codex = AGENT_MODELS.find((m) => m.provider === 'codex');

    expect(cline).toBeDefined();
    expect(cline?.value).toBe('cline:default');

    expect(opencode).toBeDefined();
    expect(opencode?.value).toBe('opencode:default');

    expect(codex).toBeDefined();
    expect(codex?.value).toBe('codex:default');
  });

  it('registers harnesses and labels for headless providers', () => {
    expect(HARNESS_LABELS.cline).toBe('Cline');
    expect(HARNESS_LABELS.opencode).toBe('OpenCode');
    expect(HARNESS_LABELS.codex).toBe('Codex');

    expect(HARNESS_PROVIDER.cline).toBe('cline');
    expect(HARNESS_PROVIDER.opencode).toBe('opencode');
    expect(HARNESS_PROVIDER.codex).toBe('codex');

    expect(PROVIDER_HARNESS.cline).toBe('cline');
    expect(PROVIDER_HARNESS.opencode).toBe('opencode');
    expect(PROVIDER_HARNESS.codex).toBe('codex');
  });

  it('exports canonical model prefixes', () => {
    expect(CLINE_MODEL_PREFIX).toBe('cline:');
    expect(OPENCODE_MODEL_PREFIX).toBe('opencode:');
    expect(CODEX_MODEL_PREFIX).toBe('codex:');
    expect(OPENAI_CODEX_MODEL).toBe('openai-codex');
  });
});

describe('resolveModelRouting (#56)', () => {
  it('routes static default models to their respective providers', () => {
    expect(resolveModelRouting('cline:default')).toEqual({ provider: 'cline' });
    expect(resolveModelRouting('opencode:default')).toEqual({ provider: 'opencode' });
    expect(resolveModelRouting('codex:default')).toEqual({ provider: 'codex' });
  });

  it('routes cline:* prefix models to cline provider', () => {
    expect(resolveModelRouting('cline:claude-3-7-sonnet')).toEqual({ provider: 'cline' });
    expect(resolveModelRouting('cline:gpt-4o')).toEqual({ provider: 'cline' });
    expect(resolveModelRouting('cline')).toEqual({ provider: 'cline' });
    expect(providerForModel('cline:anything')).toBe('cline');
  });

  it('routes opencode:* prefix models to opencode provider', () => {
    expect(resolveModelRouting('opencode:deepseek-r1')).toEqual({ provider: 'opencode' });
    expect(resolveModelRouting('opencode:qwen-2.5-coder')).toEqual({ provider: 'opencode' });
    expect(resolveModelRouting('opencode')).toEqual({ provider: 'opencode' });
    expect(providerForModel('opencode:anything')).toBe('opencode');
  });

  it('routes codex:* and openai-codex models to codex provider', () => {
    expect(resolveModelRouting('codex:gpt-4.5')).toEqual({ provider: 'codex' });
    expect(resolveModelRouting('codex:o3-mini')).toEqual({ provider: 'codex' });
    expect(resolveModelRouting('codex')).toEqual({ provider: 'codex' });
    expect(resolveModelRouting('openai-codex')).toEqual({ provider: 'codex' });
    expect(resolveModelRouting('openai-codex:latest')).toEqual({ provider: 'codex' });
    expect(providerForModel('codex:gpt-4.5')).toBe('codex');
    expect(providerForModel('openai-codex')).toBe('codex');
  });

  it('preserves existing model routes for Anthropic, Cursor, and Pi', () => {
    expect(resolveModelRouting('claude-opus-5')).toEqual({ provider: 'anthropic' });
    expect(resolveModelRouting('composer-2')).toEqual({ provider: 'cursor' });
    expect(resolveModelRouting('pi:default')).toEqual({ provider: 'pi' });
  });

  it('rejects unknown model identifiers with descriptive reason', () => {
    const result = resolveModelRouting('unknown-model-xyz');
    expect('reason' in result).toBe(true);
    if ('reason' in result) {
      expect(result.reason).toContain('"unknown-model-xyz" is not a known model');
    }
  });
});

describe('Binary Probing & Installation Guidance (#56)', () => {
  beforeEach(() => {
    clearBinaryProbeCache();
  });

  it('exposes canonical install commands and guidance messages', () => {
    expect(PROVIDER_INSTALL_COMMANDS.cline).toBe('npm install -g cline');
    expect(PROVIDER_INSTALL_COMMANDS.opencode).toBe('npm install -g opencode-ai');
    expect(PROVIDER_INSTALL_COMMANDS.codex).toBe('npm install -g @openai/codex');

    expect(PROVIDER_INSTALL_GUIDANCE.cline).toContain('npm install -g cline');
    expect(PROVIDER_INSTALL_GUIDANCE.opencode).toContain('npm install -g opencode-ai');
    expect(PROVIDER_INSTALL_GUIDANCE.codex).toContain('npm install -g @openai/codex');
  });

  it('detects binary when present in PATH on POSIX', async () => {
    const fakeDirs = ['/usr/bin', '/home/user/.local/bin'];
    const fakePath = '/home/user/.local/bin/cline';

    const result = await probeBinary('cline', {
      platform: 'linux',
      env: { PATH: fakeDirs.join(':') },
      fsExists: (p) => p === fakePath,
      execFileFn: async (cmd, args) => {
        if (cmd === fakePath && args[0] === '--version') {
          return { ok: true, stdout: 'cline v1.2.3', stderr: '' };
        }
        return { ok: false, stdout: '', stderr: '' };
      },
    });

    expect(result.available).toBe(true);
    expect(result.path).toBe(fakePath);
    expect(result.version).toBe('cline v1.2.3');
    expect(await isBinaryAvailable('cline', { force: false })).toBe(true);
  });

  it('detects Windows .cmd shim in PATH', async () => {
    const fakeDirs = ['C:\\Users\\user\\AppData\\Roaming\\npm'];
    const fakePath = 'C:\\Users\\user\\AppData\\Roaming\\npm\\opencode.cmd';

    const result = await probeBinary('opencode', {
      platform: 'win32',
      env: { PATH: fakeDirs.join(';') },
      fsExists: (p) => p === fakePath,
      execFileFn: async (cmd, args) => {
        if (cmd === fakePath && args[0] === '--version') {
          return { ok: true, stdout: '1.0.0-opencode', stderr: '' };
        }
        return { ok: false, stdout: '', stderr: '' };
      },
    });

    expect(result.available).toBe(true);
    expect(result.path).toBe(fakePath);
    expect(result.version).toBe('1.0.0-opencode');
  });

  it('falls back to where.exe on Windows when not directly found in PATH variable', async () => {
    const fakeFoundPath = 'C:\\Program Files\\Codex\\codex.exe';

    const result = await probeBinary('codex', {
      platform: 'win32',
      env: { PATH: '' },
      fsExists: (p) => p === fakeFoundPath,
      execFileFn: async (cmd, args) => {
        if (cmd === 'where.exe' && args[0] === 'codex') {
          return { ok: true, stdout: `${fakeFoundPath}\r\n`, stderr: '' };
        }
        return { ok: false, stdout: '', stderr: '' };
      },
    });

    expect(result.available).toBe(true);
    expect(result.path).toBe(fakeFoundPath);
  });

  it('reports missing binary with actionable install command when not found', async () => {
    const result = await probeBinary('cline', {
      platform: 'linux',
      env: { PATH: '/usr/bin' },
      fsExists: () => false,
      execFileFn: async () => ({ ok: false, stdout: '', stderr: 'not found' }),
    });

    expect(result.available).toBe(false);
    expect(result.path).toBeUndefined();
    expect(result.error).toContain('was not found on PATH');
    expect(result.installGuide).toBe(PROVIDER_INSTALL_GUIDANCE.cline);
    expect(result.installGuide).toContain('npm install -g cline');
  });

  it('does not memoize missing binaries so newly installed CLIs are discovered immediately', async () => {
    let installed = false;
    const fakePath = '/usr/local/bin/cline';

    const firstCheck = await probeBinary('cline', {
      platform: 'linux',
      env: { PATH: '/usr/local/bin' },
      fsExists: (p) => (installed && p === fakePath),
      execFileFn: async () => ({ ok: false, stdout: '', stderr: '' }),
    });
    expect(firstCheck.available).toBe(false);

    // Now simulate user running `npm install -g cline` in terminal
    installed = true;
    const secondCheck = await probeBinary('cline', {
      platform: 'linux',
      env: { PATH: '/usr/local/bin' },
      fsExists: (p) => (installed && p === fakePath),
      execFileFn: async (cmd) => {
        if (cmd === fakePath) return { ok: true, stdout: '1.0.0', stderr: '' };
        return { ok: false, stdout: '', stderr: '' };
      },
    });
    expect(secondCheck.available).toBe(true);
    expect(secondCheck.path).toBe(fakePath);
  });
});

interface AgentManagerInternalRunner {
  runHeadlessOnce(
    provider: 'cline' | 'opencode' | 'codex',
    sessionId: string,
    prompt: string,
    cwd: string,
    abort: AbortController,
    permMode: SessionPermissionMode,
    stream: AgentRuntimeStreamCallbacks,
  ): Promise<void>;
}

describe('AgentManager Headless Provider Routing & Dispatch (#56)', () => {
  let agentManager: AgentManager;
  let runner: AgentManagerInternalRunner;
  let mockWorkspace: { getActive: ReturnType<typeof vi.fn> };
  let mockSettings: { getAll: ReturnType<typeof vi.fn> };
  let mockNotifications: { notify: ReturnType<typeof vi.fn> };
  let mockStream: AgentRuntimeStreamCallbacks;

  beforeEach(() => {
    mockWorkspace = {
      getActive: vi.fn().mockReturnValue({ id: 'w1', path: 'C:\\fake\\workspace' }),
    };
    mockSettings = {
      getAll: vi.fn().mockReturnValue({
        agent: {
          model: 'cline:default',
          harness: { legacyClaudeSdk: false },
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
    agentManager = new AgentManager(mockWorkspace as never, mockSettings as never, mockNotifications as never);
    runner = agentManager as unknown as AgentManagerInternalRunner;
  });

  it('rejects cline run when binary is not installed with actionable guidance', async () => {
    clearBinaryProbeCache();
    const probeSpy = vi.spyOn(binaryProbeModule, 'isBinaryAvailable').mockResolvedValue(false);

    await expect(
      runner.runHeadlessOnce(
        'cline',
        'sess-1',
        'Test prompt',
        'C:\\fake\\workspace',
        new AbortController(),
        'acceptEdits',
        mockStream,
      ),
    ).rejects.toThrow(PROVIDER_INSTALL_GUIDANCE.cline);

    probeSpy.mockRestore();
  });

  it('rejects opencode run when binary is not installed with actionable guidance', async () => {
    clearBinaryProbeCache();
    const probeSpy = vi.spyOn(binaryProbeModule, 'isBinaryAvailable').mockResolvedValue(false);

    await expect(
      runner.runHeadlessOnce(
        'opencode',
        'sess-1',
        'Test prompt',
        'C:\\fake\\workspace',
        new AbortController(),
        'acceptEdits',
        mockStream,
      ),
    ).rejects.toThrow(PROVIDER_INSTALL_GUIDANCE.opencode);

    probeSpy.mockRestore();
  });

  it('rejects codex run when binary is not installed with actionable guidance', async () => {
    clearBinaryProbeCache();
    const probeSpy = vi.spyOn(binaryProbeModule, 'isBinaryAvailable').mockResolvedValue(false);

    await expect(
      runner.runHeadlessOnce(
        'codex',
        'sess-1',
        'Test prompt',
        'C:\\fake\\workspace',
        new AbortController(),
        'acceptEdits',
        mockStream,
      ),
    ).rejects.toThrow(PROVIDER_INSTALL_GUIDANCE.codex);

    probeSpy.mockRestore();
  });

  it('throws when binary is available but runtime adapter is not yet wired', async () => {
    const probeSpy = vi.spyOn(binaryProbeModule, 'isBinaryAvailable').mockResolvedValue(true);

    await expect(
      runner.runHeadlessOnce(
        'cline',
        'sess-1',
        'Test prompt',
        'C:\\fake\\workspace',
        new AbortController(),
        'acceptEdits',
        mockStream,
      ),
    ).rejects.toThrow('The Cline ACP runtime is not available.');

    probeSpy.mockRestore();
  });

  it('dispatches to injected runtime adapter when binary is available and emits run start', async () => {
    const probeSpy = vi.spyOn(binaryProbeModule, 'isBinaryAvailable').mockResolvedValue(true);
    const mockAdapter: AgentRuntimeAdapter = {
      provider: 'cline',
      run: vi.fn().mockResolvedValue(undefined),
    };

    agentManager.setClineRuntime(mockAdapter);

    await runner.runHeadlessOnce(
      'cline',
      'sess-1',
      'Test prompt',
      'C:\\fake\\workspace',
      new AbortController(),
      'acceptEdits',
      mockStream,
    );

    expect(mockAdapter.run).toHaveBeenCalledWith(
      'sess-1',
      'Test prompt',
      'C:\\fake\\workspace',
      expect.any(AbortController),
      'acceptEdits',
      mockStream,
      expect.any(Object),
      expect.any(Function),
    );

    probeSpy.mockRestore();
  });

  it('wires openCodeRuntime and codexRuntime setters correctly', async () => {
    const probeSpy = vi.spyOn(binaryProbeModule, 'isBinaryAvailable').mockResolvedValue(true);

    const mockOpenCodeAdapter: AgentRuntimeAdapter = {
      provider: 'opencode',
      run: vi.fn().mockResolvedValue(undefined),
    };
    agentManager.setOpenCodeRuntime(mockOpenCodeAdapter);
    await runner.runHeadlessOnce(
      'opencode',
      'sess-2',
      'OpenCode prompt',
      'C:\\fake\\workspace',
      new AbortController(),
      'acceptEdits',
      mockStream,
    );
    expect(mockOpenCodeAdapter.run).toHaveBeenCalledTimes(1);

    const mockCodexAdapter: AgentRuntimeAdapter = {
      provider: 'codex',
      run: vi.fn().mockResolvedValue(undefined),
    };
    agentManager.setCodexRuntime(mockCodexAdapter);
    await runner.runHeadlessOnce(
      'codex',
      'sess-3',
      'Codex prompt',
      'C:\\fake\\workspace',
      new AbortController(),
      'acceptEdits',
      mockStream,
    );
    expect(mockCodexAdapter.run).toHaveBeenCalledWith(
      'sess-3',
      'Codex prompt',
      'C:\\fake\\workspace',
      expect.any(AbortController),
      'acceptEdits',
      mockStream,
      expect.any(Object),
      expect.any(Function),
    );

    probeSpy.mockRestore();
  });
});
