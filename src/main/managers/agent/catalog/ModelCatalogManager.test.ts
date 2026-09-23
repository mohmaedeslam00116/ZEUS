import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { ModelCatalogManager } from './ModelCatalogManager';
import * as fetchers from './fetchers';
import type { ProviderAuthManager } from '../ProviderAuthManager';
import type { SettingsManager } from '../../SettingsManager';
import type { AppSettings, ModelInfo } from '@shared/types';
import { DEFAULT_SETTINGS, MODEL_CATALOG_LIMITS } from '@shared/constants';

describe('ModelCatalogManager', () => {
  let db: Database.Database;
  let mockSettings: AppSettings;
  let mockSettingsManager: SettingsManager;
  let mockAuthManager: ProviderAuthManager;
  let catalogManager: ModelCatalogManager;

  beforeEach(() => {
    // In-memory SQLite for test isolation
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS provider_model_catalog (
        provider          TEXT NOT NULL,
        model_id          TEXT NOT NULL,
        name              TEXT NOT NULL,
        is_free           INTEGER NOT NULL DEFAULT 0,
        context_len       INTEGER NOT NULL DEFAULT 0,
        supports_thinking INTEGER NOT NULL DEFAULT 0,
        supports_tools    INTEGER NOT NULL DEFAULT 0,
        description       TEXT,
        fetched_at        INTEGER NOT NULL,
        PRIMARY KEY (provider, model_id)
      );
      CREATE INDEX IF NOT EXISTS idx_provider_model_catalog_provider
        ON provider_model_catalog (provider, fetched_at DESC);
    `);

    mockSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    mockSettingsManager = {
      getAll: () => mockSettings,
      onChange: vi.fn(),
      update: vi.fn(),
    } as unknown as SettingsManager;

    mockAuthManager = {
      getEffectiveApiKey: vi.fn().mockReturnValue('test-api-key'),
      getEffectiveBaseUrl: vi.fn().mockReturnValue(undefined),
    } as unknown as ProviderAuthManager;

    catalogManager = new ModelCatalogManager(db, mockAuthManager, mockSettingsManager);
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  describe('listModels', () => {
    it('fetches from network and populates cache on initial query', async () => {
      const mockModels: ModelInfo[] = [
        {
          id: 'openrouter:meta-llama/llama-3.3-70b-instruct:free',
          name: 'Llama 3.3 70B (free)',
          provider: 'openrouter',
          isFree: true,
          contextLength: 131072,
          supportsThinking: false,
          supportsTools: true,
        },
        {
          id: 'openrouter:anthropic/claude-3.7-sonnet',
          name: 'Claude 3.7 Sonnet',
          provider: 'openrouter',
          isFree: false,
          contextLength: 200000,
          supportsThinking: true,
          supportsTools: true,
        },
      ];

      const fetchSpy = vi.spyOn(fetchers, 'fetchModelsForProvider').mockResolvedValue(mockModels);

      const models = await catalogManager.listModels('openrouter');
      expect(fetchSpy).toHaveBeenCalledWith('openrouter', expect.any(Object));
      expect(models.length).toBe(2);
      expect(models[0].isFree).toBe(true);

      // Verify cached in SQLite
      const cached = catalogManager.getCachedModelsSync('openrouter');
      expect(cached.length).toBe(2);
    });

    it('returns cached models without making network call when cache is within TTL', async () => {
      const mockModels: ModelInfo[] = [
        {
          id: 'gemini:gemini-2.0-flash',
          name: 'Gemini 2.0 Flash',
          provider: 'gemini',
          isFree: true,
          contextLength: 1048576,
          supportsThinking: false,
          supportsTools: true,
        },
      ];

      const fetchSpy = vi.spyOn(fetchers, 'fetchModelsForProvider').mockResolvedValue(mockModels);

      // First call fetches from network
      await catalogManager.listModels('gemini');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Second call returns from cache
      const cached = await catalogManager.listModels('gemini');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(cached.length).toBe(1);
      expect(cached[0].id).toBe('gemini:gemini-2.0-flash');
    });

    it('forces live fetch and updates cache when forceRefresh is true', async () => {
      const initialModels: ModelInfo[] = [
        {
          id: 'ollama:llama3:latest',
          name: 'llama3:latest',
          provider: 'ollama',
          isFree: true,
          contextLength: 8192,
          supportsThinking: false,
          supportsTools: true,
        },
      ];
      const refreshedModels: ModelInfo[] = [
        ...initialModels,
        {
          id: 'ollama:deepseek-r1:latest',
          name: 'deepseek-r1:latest',
          provider: 'ollama',
          isFree: true,
          contextLength: 32768,
          supportsThinking: true,
          supportsTools: false,
        },
      ];

      const fetchSpy = vi.spyOn(fetchers, 'fetchModelsForProvider')
        .mockResolvedValueOnce(initialModels)
        .mockResolvedValueOnce(refreshedModels);

      await catalogManager.listModels('ollama');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const refreshed = await catalogManager.listModels('ollama', { forceRefresh: true });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(refreshed.length).toBe(2);
    });

    it('filters results by onlyFree', async () => {
      const mockModels: ModelInfo[] = [
        {
          id: 'openrouter:free-model',
          name: 'Free Model',
          provider: 'openrouter',
          isFree: true,
          contextLength: 4096,
          supportsThinking: false,
          supportsTools: true,
        },
        {
          id: 'openrouter:paid-model',
          name: 'Paid Model',
          provider: 'openrouter',
          isFree: false,
          contextLength: 8192,
          supportsThinking: false,
          supportsTools: true,
        },
      ];

      vi.spyOn(fetchers, 'fetchModelsForProvider').mockResolvedValue(mockModels);

      const onlyFree = await catalogManager.listModels('openrouter', { onlyFree: true });
      expect(onlyFree.length).toBe(1);
      expect(onlyFree[0].id).toBe('openrouter:free-model');
    });

    it('gracefully falls back to expired cached models when live network fetch fails', async () => {
      const oldModels: ModelInfo[] = [
        {
          id: 'deepseek:deepseek-chat',
          name: 'DeepSeek Chat',
          provider: 'deepseek',
          isFree: false,
          contextLength: 64000,
          supportsThinking: false,
          supportsTools: true,
        },
      ];

      // Pre-seed an expired record (> 24h ago)
      const oldTime = Date.now() - (MODEL_CATALOG_LIMITS.defaultTtlMs + 5000);
      catalogManager['saveToCache']('deepseek', oldModels, oldTime);

      // Network throws
      vi.spyOn(fetchers, 'fetchModelsForProvider').mockRejectedValue(new Error('Network offline'));

      const result = await catalogManager.listModels('deepseek');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('deepseek:deepseek-chat');
    });

    it('falls back to static baseline catalog when cache is empty and network fails', async () => {
      vi.spyOn(fetchers, 'fetchModelsForProvider').mockRejectedValue(new Error('DNS resolution failure'));

      const result = await catalogManager.listModels('anthropic');
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((m) => m.id.includes('claude-3-7-sonnet'))).toBe(true);
    });

    it('skips disabled providers when querying all models', async () => {
      mockSettings.providers.deepseek.enabled = false;
      vi.spyOn(fetchers, 'fetchModelsForProvider').mockResolvedValue([]);

      const all = await catalogManager.listModels();
      expect(all.some((m) => m.provider === 'deepseek')).toBe(false);
    });
  });
});
