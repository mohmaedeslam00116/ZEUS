/**
 * ModelCatalogManager — Dynamic multi-provider model discovery and catalog service.
 * Spec #61 / Ticket #63.
 *
 * Capabilities:
 * - Dynamically queries live `/models` or `/api/tags` endpoints for all 7 native providers.
 * - Categorizes models into Free vs Paid tiers, context window length, and reasoning capabilities.
 * - Persistent caching in SQLite (`provider_model_catalog` in `zeus.db`) with 24-hour TTL.
 * - Resilient offline fallback: serves previous cached catalog or static baseline when network is unavailable.
 */
import type Database from 'better-sqlite3';
import type { ModelCatalogListOptions, ModelInfo, NativeProviderId } from '@shared/types';
import { NATIVE_PROVIDER_IDS } from '@shared/types';
import { MODEL_CATALOG_LIMITS } from '@shared/constants';
import {
  getCachedModels,
  replaceCachedModels,
} from '../../../db/database';
import type { ProviderAuthManager } from '../ProviderAuthManager';
import type { SettingsManager } from '../../SettingsManager';
import {
  fetchModelsForProvider,
  STATIC_BASELINE_MODELS,
} from './fetchers';
import { logger } from '../../../logger';

export class ModelCatalogManager {
  constructor(
    private readonly db: Database.Database,
    private readonly authManager: ProviderAuthManager,
    private readonly settings: SettingsManager,
  ) {}

  /**
   * Save models to SQLite cache (SEC-15 bound parameters).
   */
  protected saveToCache(
    provider: NativeProviderId,
    models: ModelInfo[],
    fetchedAt: number = Date.now(),
  ): void {
    replaceCachedModels(this.db, provider, models, fetchedAt);
  }

  /**
   * Return cached models from SQLite synchronously (useful for fast UI initial state).
   */
  getCachedModelsSync(provider?: NativeProviderId): ModelInfo[] {
    return getCachedModels(this.db, provider);
  }

  /**
   * Fetch and refresh models for a single provider.
   * If network fails or throws, gracefully falls back to previous cached data or static baseline.
   */
  private async queryProviderModels(
    provider: NativeProviderId,
    options?: ModelCatalogListOptions,
  ): Promise<ModelInfo[]> {
    const cached = getCachedModels(this.db, provider);
    const now = Date.now();
    const lastFetchedAt = cached.length > 0 ? Math.max(...cached.map((m) => m.fetchedAt ?? 0)) : 0;
    const isCacheFresh =
      cached.length > 0 && now - lastFetchedAt < MODEL_CATALOG_LIMITS.defaultTtlMs;

    // Use fresh cache unless forceRefresh is explicitly requested
    if (isCacheFresh && !options?.forceRefresh) {
      return cached;
    }

    const apiKey = this.authManager.getEffectiveApiKey(provider) ?? undefined;
    const baseUrl = this.authManager.getEffectiveBaseUrl(provider) ?? undefined;

    try {
      const fetched = await fetchModelsForProvider(provider, { apiKey, baseUrl });
      if (fetched && fetched.length > 0) {
        this.saveToCache(provider, fetched, now);
        return fetched;
      }
    } catch (err) {
      logger.warn(
        `ModelCatalogManager: network fetch failed for "${provider}", falling back to cache/baseline`,
        err instanceof Error ? err.name : 'UnknownError',
      );
    }

    // Network returned empty or threw — fall back to previous cache (even if expired)
    if (cached.length > 0) {
      return cached;
    }

    // If cache is completely empty, use static baseline without corrupting cache
    return STATIC_BASELINE_MODELS[provider] || [];
  }

  /**
   * Alias for listModels to provide direct cached-or-fetch semantics.
   */
  async getCachedOrFetch(
    provider?: NativeProviderId,
    options?: ModelCatalogListOptions,
  ): Promise<ModelInfo[]> {
    return this.listModels(provider, options);
  }

  /**
   * List models for a specific provider or across all enabled providers.
   * Results are sorted with free models first, then alphabetically by name.
   */
  async listModels(
    provider?: NativeProviderId,
    options?: ModelCatalogListOptions,
  ): Promise<ModelInfo[]> {
    let result: ModelInfo[] = [];

    if (provider) {
      if (!NATIVE_PROVIDER_IDS.includes(provider)) {
        throw new Error(`Invalid provider identifier: ${provider}`);
      }
      result = await this.queryProviderModels(provider, options);
    } else {
      const allProvidersSettings = this.settings.getAll().providers;
      const enabledProviders = NATIVE_PROVIDER_IDS.filter(
        (id) => allProvidersSettings?.[id]?.enabled !== false,
      );

      const promises = enabledProviders.map((id) => this.queryProviderModels(id, options));
      const settled = await Promise.allSettled(promises);

      for (const res of settled) {
        if (res.status === 'fulfilled') {
          result.push(...res.value);
        }
      }
    }

    // Apply filtering
    if (options?.onlyFree) {
      result = result.filter((m) => m.isFree);
    }

    // Sort: free models first, then alphabetically by name
    return result.sort((a, b) => {
      if (a.isFree && !b.isFree) return -1;
      if (!a.isFree && b.isFree) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Force refresh models for a specific provider or all enabled providers.
   */
  async refreshModels(provider?: NativeProviderId): Promise<ModelInfo[]> {
    return this.listModels(provider, { forceRefresh: true });
  }
}
