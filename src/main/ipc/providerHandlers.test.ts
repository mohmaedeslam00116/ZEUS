import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IpcChannels } from '@shared/ipc-channels';
import { PROVIDER_LIMITS } from '@shared/constants';
import type { ProviderAuthManager } from '../managers/agent/ProviderAuthManager';
import { registerProviderHandlers } from './providerHandlers';

type HandlerFn = (...args: unknown[]) => unknown;
const handlers = new Map<string, HandlerFn>();

vi.mock('./registry', () => ({
  handle: vi.fn((channel: string, fn: HandlerFn) => {
    handlers.set(channel, fn);
  }),
}));

function getHandler(channel: string): HandlerFn {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`Handler not registered for ${channel}`);
  }
  return handler;
}

describe('providerHandlers', () => {
  let mockProviderAuth: ProviderAuthManager;

  beforeEach(() => {
    handlers.clear();
    mockProviderAuth = {
      getPublicStates: vi.fn().mockResolvedValue([
        {
          id: 'anthropic',
          enabled: true,
          autoDetectLocalAuth: true,
          keyMetadata: { configured: true, source: 'secret-store' },
        },
      ]),
      setApiKey: vi.fn().mockResolvedValue(undefined),
      removeApiKey: vi.fn().mockResolvedValue(undefined),
      discoverLocalAuth: vi.fn().mockResolvedValue([]),
      importDiscoveredAuth: vi.fn().mockResolvedValue(true),
    } as unknown as ProviderAuthManager;

    registerProviderHandlers(mockProviderAuth);
  });

  it('registers all 5 IPC channels', () => {
    expect(handlers.has(IpcChannels.providersGetStates)).toBe(true);
    expect(handlers.has(IpcChannels.providersSetApiKey)).toBe(true);
    expect(handlers.has(IpcChannels.providersRemoveApiKey)).toBe(true);
    expect(handlers.has(IpcChannels.providersDiscoverLocalAuth)).toBe(true);
    expect(handlers.has(IpcChannels.providersImportDiscoveredAuth)).toBe(true);
  });

  describe(IpcChannels.providersGetStates, () => {
    it('calls getPublicStates and returns the result', async () => {
      const handler = getHandler(IpcChannels.providersGetStates);
      const res = await handler({} as never);
      expect(mockProviderAuth.getPublicStates).toHaveBeenCalledTimes(1);
      expect(res).toEqual([
        {
          id: 'anthropic',
          enabled: true,
          autoDetectLocalAuth: true,
          keyMetadata: { configured: true, source: 'secret-store' },
        },
      ]);
    });
  });

  describe(IpcChannels.providersSetApiKey, () => {
    it('validates provider and API key, trimming key before storing', async () => {
      const handler = getHandler(IpcChannels.providersSetApiKey);
      await handler({} as never, 'anthropic', '  sk-ant-test-12345  ');
      expect(mockProviderAuth.setApiKey).toHaveBeenCalledWith(
        'anthropic',
        'sk-ant-test-12345',
      );
    });

    it('rejects invalid provider IDs', async () => {
      const handler = getHandler(IpcChannels.providersSetApiKey);
      await expect(
        handler({} as never, 'invalid-vendor', 'sk-valid-key'),
      ).rejects.toThrow('Invalid provider identifier: invalid-vendor');
      expect(mockProviderAuth.setApiKey).not.toHaveBeenCalled();
    });

    it('rejects empty or whitespace-only API keys', async () => {
      const handler = getHandler(IpcChannels.providersSetApiKey);
      await expect(
        handler({} as never, 'gemini', '   '),
      ).rejects.toThrow('Invalid API key format');
      expect(mockProviderAuth.setApiKey).not.toHaveBeenCalled();
    });

    it('rejects API keys exceeding maximum length', async () => {
      const handler = getHandler(IpcChannels.providersSetApiKey);
      const oversizedKey = 'a'.repeat(PROVIDER_LIMITS.apiKeyMax + 1);
      await expect(
        handler({} as never, 'openai', oversizedKey),
      ).rejects.toThrow('Invalid API key format');
      expect(mockProviderAuth.setApiKey).not.toHaveBeenCalled();
    });

    it('rejects API keys with non-printable ASCII or control characters', async () => {
      const handler = getHandler(IpcChannels.providersSetApiKey);
      await expect(
        handler({} as never, 'deepseek', 'sk-key-with\nnewline'),
      ).rejects.toThrow('Invalid API key format');
      await expect(
        handler({} as never, 'deepseek', 'sk-key with space'),
      ).rejects.toThrow('Invalid API key format');
      expect(mockProviderAuth.setApiKey).not.toHaveBeenCalled();
    });
  });

  describe(IpcChannels.providersRemoveApiKey, () => {
    it('validates provider and calls removeApiKey', async () => {
      const handler = getHandler(IpcChannels.providersRemoveApiKey);
      await handler({} as never, 'openrouter');
      expect(mockProviderAuth.removeApiKey).toHaveBeenCalledWith('openrouter');
    });

    it('rejects invalid provider identifiers', async () => {
      const handler = getHandler(IpcChannels.providersRemoveApiKey);
      await expect(
        handler({} as never, 'unknown'),
      ).rejects.toThrow('Invalid provider identifier: unknown');
      expect(mockProviderAuth.removeApiKey).not.toHaveBeenCalled();
    });
  });

  describe(IpcChannels.providersDiscoverLocalAuth, () => {
    it('delegates to discoverLocalAuth', async () => {
      const handler = getHandler(IpcChannels.providersDiscoverLocalAuth);
      await handler({} as never);
      expect(mockProviderAuth.discoverLocalAuth).toHaveBeenCalledTimes(1);
    });
  });

  describe(IpcChannels.providersImportDiscoveredAuth, () => {
    it('validates provider and calls importDiscoveredAuth', async () => {
      const handler = getHandler(IpcChannels.providersImportDiscoveredAuth);
      const res = await handler({} as never, 'kilo');
      expect(mockProviderAuth.importDiscoveredAuth).toHaveBeenCalledWith('kilo');
      expect(res).toBe(true);
    });

    it('rejects invalid provider identifiers', async () => {
      const handler = getHandler(IpcChannels.providersImportDiscoveredAuth);
      await expect(
        handler({} as never, 'non-existent'),
      ).rejects.toThrow('Invalid provider identifier: non-existent');
      expect(mockProviderAuth.importDiscoveredAuth).not.toHaveBeenCalled();
    });
  });
});
