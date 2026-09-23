/**
 * IPC handlers for the Dynamic Model Catalog Service (Spec #61 / #63).
 * Reached from the renderer through `window.zeus.models.*`.
 */
import { IpcChannels } from '@shared/ipc-channels';
import type {
  ModelCatalogListOptions,
  ModelInfo,
  NativeProviderId,
} from '@shared/types';
import { NATIVE_PROVIDER_IDS } from '@shared/types';
import type { ModelCatalogManager } from '../managers/agent/catalog/ModelCatalogManager';
import { handle } from './registry';

function assertProviderIdOptional(value: unknown): NativeProviderId | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string' || !NATIVE_PROVIDER_IDS.includes(value as NativeProviderId)) {
    throw new Error(`Invalid provider identifier: ${value}`);
  }
  return value as NativeProviderId;
}

function sanitizeListOptions(raw: unknown): ModelCatalogListOptions | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  return {
    forceRefresh: Boolean(obj.forceRefresh),
    onlyFree: Boolean(obj.onlyFree),
  };
}

export function registerModelHandlers(catalog: ModelCatalogManager): void {
  handle<[string?, unknown?], ModelInfo[]>(
    IpcChannels.modelsList,
    async (_event, provider, rawOptions) => {
      const validatedProvider = assertProviderIdOptional(provider);
      const sanitizedOpts = sanitizeListOptions(rawOptions);
      return catalog.listModels(validatedProvider, sanitizedOpts);
    },
  );

  handle<[string?], ModelInfo[]>(
    IpcChannels.modelsRefresh,
    async (_event, provider) => {
      const validatedProvider = assertProviderIdOptional(provider);
      return catalog.refreshModels(validatedProvider);
    },
  );
}
