import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IpcChannels } from '@shared/ipc-channels';
import type { ModelInfo } from '@shared/types';
import type { ModelCatalogManager } from '../managers/agent/catalog/ModelCatalogManager';
import { registerModelHandlers } from './modelHandlers';

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

describe('modelHandlers', () => {
  let mockCatalog: ModelCatalogManager;

  beforeEach(() => {
    handlers.clear();
    mockCatalog = {
      listModels: vi.fn().mockResolvedValue([
        {
          id: 'gemini:gemini-2.0-flash',
          name: 'Gemini 2.0 Flash',
          provider: 'gemini',
          isFree: true,
          contextLength: 1048576,
          supportsThinking: false,
          supportsTools: true,
        },
      ] as ModelInfo[]),
      refreshModels: vi.fn().mockResolvedValue([]),
    } as unknown as ModelCatalogManager;

    registerModelHandlers(mockCatalog);
  });

  it('registers models:list and models:refresh channels', () => {
    expect(handlers.has(IpcChannels.modelsList)).toBe(true);
    expect(handlers.has(IpcChannels.modelsRefresh)).toBe(true);
  });

  describe(IpcChannels.modelsList, () => {
    it('calls listModels with validated provider and options', async () => {
      const handler = getHandler(IpcChannels.modelsList);
      const res = await handler({} as never, 'gemini', { forceRefresh: true, onlyFree: true });

      expect(mockCatalog.listModels).toHaveBeenCalledWith('gemini', {
        forceRefresh: true,
        onlyFree: true,
      });
      expect(Array.isArray(res)).toBe(true);
    });

    it('allows undefined provider to query all models', async () => {
      const handler = getHandler(IpcChannels.modelsList);
      await handler({} as never, undefined, undefined);

      expect(mockCatalog.listModels).toHaveBeenCalledWith(undefined, undefined);
    });

    it('rejects invalid provider identifiers', async () => {
      const handler = getHandler(IpcChannels.modelsList);
      await expect(
        handler({} as never, 'unsupported-provider'),
      ).rejects.toThrow('Invalid provider identifier: unsupported-provider');
      expect(mockCatalog.listModels).not.toHaveBeenCalled();
    });
  });

  describe(IpcChannels.modelsRefresh, () => {
    it('calls refreshModels with validated provider', async () => {
      const handler = getHandler(IpcChannels.modelsRefresh);
      await handler({} as never, 'ollama');

      expect(mockCatalog.refreshModels).toHaveBeenCalledWith('ollama');
    });

    it('rejects invalid provider identifiers on refresh', async () => {
      const handler = getHandler(IpcChannels.modelsRefresh);
      await expect(
        handler({} as never, 'invalid-ai'),
      ).rejects.toThrow('Invalid provider identifier: invalid-ai');
      expect(mockCatalog.refreshModels).not.toHaveBeenCalled();
    });
  });
});
