/**
 * IPC handlers for the Multi-Provider Hub authentication and configuration.
 * Reached from the renderer through `window.zeus.providers.*`.
 *
 * Security Invariants (SEC-16):
 * - Raw API keys cross IPC exactly ONCE (during `setApiKey`).
 * - Plaintext keys are NEVER returned across IPC, echoed in errors, or logged.
 * - `getStates` and `discoverLocalAuth` return strictly public metadata.
 */
import { IpcChannels } from '@shared/ipc-channels';
import { PROVIDER_LIMITS } from '@shared/constants';
import type {
  DiscoveredProviderAuth,
  NativeProviderId,
  ProviderPublicState,
} from '@shared/types';
import { NATIVE_PROVIDER_IDS } from '@shared/types';
import type { ProviderAuthManager } from '../managers/agent/ProviderAuthManager';
import { handle } from './registry';

function assertProviderId(value: unknown): NativeProviderId {
  if (typeof value !== 'string' || !NATIVE_PROVIDER_IDS.includes(value as NativeProviderId)) {
    throw new Error(`Invalid provider identifier: ${value}`);
  }
  return value as NativeProviderId;
}

function assertApiKey(value: unknown): string {
  const key = typeof value === 'string' ? value.trim() : '';
  if (
    key.length === 0 ||
    key.length > PROVIDER_LIMITS.apiKeyMax ||
    !/^[\x21-\x7e]+$/.test(key)
  ) {
    throw new Error('Invalid API key format: must be printable ASCII without spaces or newlines.');
  }
  return key;
}

export function registerProviderHandlers(providerAuth: ProviderAuthManager): void {
  handle<[], ProviderPublicState[]>(IpcChannels.providersGetStates, async () =>
    providerAuth.getPublicStates(),
  );

  handle<[string, string], void>(IpcChannels.providersSetApiKey, async (_event, provider, key) =>
    providerAuth.setApiKey(assertProviderId(provider), assertApiKey(key)),
  );

  handle<[string], void>(IpcChannels.providersRemoveApiKey, async (_event, provider) =>
    providerAuth.removeApiKey(assertProviderId(provider)),
  );

  handle<[], DiscoveredProviderAuth[]>(IpcChannels.providersDiscoverLocalAuth, async () =>
    providerAuth.discoverLocalAuth(),
  );

  handle<[string], boolean>(IpcChannels.providersImportDiscoveredAuth, async (_event, provider) =>
    providerAuth.importDiscoveredAuth(assertProviderId(provider)),
  );

  handle<[string], unknown>(IpcChannels.providersTestConnection, async (_event, provider) =>
    providerAuth.testConnection(assertProviderId(provider)),
  );
}
