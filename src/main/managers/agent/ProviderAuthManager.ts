/**
 * ProviderAuthManager — manages authentication and secure credential persistence
 * for first-party native agent providers (Spec #61 / Ticket #62).
 *
 * Security Invariants:
 * - SEC-17: API keys are stored encrypted via Electron `safeStorage` using {@link SecretStore}.
 *   Secrets decrypt only at the point of use (request/child spawn time).
 * - SEC-16: Plaintext keys NEVER cross IPC to the renderer and are NEVER logged.
 * - Renderer only ever sees presence metadata (`configured: boolean`, `source`, `updatedAt`).
 * - Discovered credentials are not cached in long-lived memory.
 */
import type {
  DiscoveredProviderAuth,
  NativeProviderId,
  ProviderKeyMetadata,
  ProviderPublicState,
} from '@shared/types';
import { NATIVE_PROVIDER_IDS } from '@shared/types';
import { PROVIDER_LIMITS } from '@shared/constants';
import { SecretStore } from '../../secrets/SecretStore';
import type { SettingsManager } from '../SettingsManager';
import { discoverAllAuth, type DiscoveredCredentialsMap } from './authDiscovery';
import { logger } from '../../logger';

/** Secret name prefix in SecretStore. */
const SECRET_PREFIX = 'provider-key-';

function secretNameFor(provider: NativeProviderId): string {
  return `${SECRET_PREFIX}${provider}`;
}

function sanitizeBaseUrl(url: string | undefined): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (
    trimmed.length > 0 &&
    trimmed.length <= PROVIDER_LIMITS.baseUrlMax &&
    !trimmed.includes('\0') &&
    /^(https?:\/\/)/i.test(trimmed)
  ) {
    return trimmed;
  }
  return undefined;
}

export class ProviderAuthManager {
  constructor(
    private readonly secretStore: SecretStore,
    private readonly settings: SettingsManager,
  ) {}

  /**
   * Encrypt and store an API key for a native provider.
   * Throws if the key is empty, invalid, or encryption is unavailable.
   */
  setApiKey(provider: NativeProviderId, key: string): void {
    if (!NATIVE_PROVIDER_IDS.includes(provider)) {
      throw new Error(`Invalid provider identifier: ${provider}`);
    }
    const trimmed = typeof key === 'string' ? key.trim() : '';
    if (trimmed.length === 0) {
      throw new Error(`API key for provider "${provider}" cannot be empty.`);
    }
    if (trimmed.length > PROVIDER_LIMITS.apiKeyMax) {
      throw new Error(
        `API key for provider "${provider}" exceeds maximum length of ${PROVIDER_LIMITS.apiKeyMax} characters.`,
      );
    }
    this.secretStore.set(secretNameFor(provider), trimmed);
    logger.info(`ProviderAuthManager: encrypted API key stored for provider "${provider}"`);
  }

  /** Remove the stored API key for a provider. */
  removeApiKey(provider: NativeProviderId): void {
    if (!NATIVE_PROVIDER_IDS.includes(provider)) {
      throw new Error(`Invalid provider identifier: ${provider}`);
    }
    this.secretStore.remove(secretNameFor(provider));
    logger.info(`ProviderAuthManager: removed API key for provider "${provider}"`);
  }

  /**
   * On-demand discovery of credentials on host without long-lived memoization (SEC-17).
   */
  protected getDiscoveredCredentials(): DiscoveredCredentialsMap {
    return discoverAllAuth();
  }

  /**
   * Key presence metadata safe to surface to the renderer (SEC-16).
   * Checks SecretStore first, then falls back to local discovery if autoDetectLocalAuth is enabled.
   */
  getKeyMetadata(provider: NativeProviderId): ProviderKeyMetadata {
    const secretName = secretNameFor(provider);
    if (this.secretStore.has(secretName)) {
      const meta = this.secretStore.metadata(secretName);
      return {
        configured: true,
        updatedAt: meta.updatedAt,
        source: 'secret-store',
      };
    }

    const providerSettings = this.settings.getAll().providers?.[provider];
    if (providerSettings?.autoDetectLocalAuth !== false) {
      const discovered = this.getDiscoveredCredentials()[provider];
      if (discovered?.key) {
        return {
          configured: true,
          source:
            discovered.source === 'cline'
              ? 'discovered-cline'
              : discovered.source === 'opencode'
              ? 'discovered-opencode'
              : 'env',
        };
      }
      if (provider === 'ollama' && discovered?.baseUrl) {
        return {
          configured: true,
          source:
            discovered.source === 'cline'
              ? 'discovered-cline'
              : discovered.source === 'opencode'
              ? 'discovered-opencode'
              : 'env',
        };
      }
    }

    return { configured: false };
  }

  /**
   * Decrypt and return the active API key for a provider.
   * Returns null if provider is disabled in settings or no key is present.
   *
   * SECURITY CONTRACT:
   * Main-process ONLY. Must NEVER be logged or forwarded across IPC to the renderer (SEC-16).
   */
  getEffectiveApiKey(provider: NativeProviderId): string | null {
    const providerSettings = this.settings.getAll().providers?.[provider];
    if (providerSettings && providerSettings.enabled === false) {
      return null;
    }

    const secretName = secretNameFor(provider);
    const explicitKey = this.secretStore.getDecrypted(secretName);
    if (explicitKey) return explicitKey;

    if (providerSettings?.autoDetectLocalAuth !== false) {
      const discovered = this.getDiscoveredCredentials()[provider];
      if (discovered?.key) return discovered.key;
    }

    return null;
  }

  /**
   * Get the effective base URL for a provider (user settings override, discovered override, or default).
   * Returns undefined if provider is disabled in settings.
   */
  getEffectiveBaseUrl(provider: NativeProviderId): string | undefined {
    const providerSettings = this.settings.getAll().providers?.[provider];
    if (providerSettings && providerSettings.enabled === false) {
      return undefined;
    }

    if (providerSettings?.baseUrl) return providerSettings.baseUrl;

    if (providerSettings?.autoDetectLocalAuth !== false) {
      const discovered = this.getDiscoveredCredentials()[provider];
      if (discovered?.baseUrl) return sanitizeBaseUrl(discovered.baseUrl);
    }

    return undefined;
  }

  /**
   * Return renderer-safe states for all 7 native providers.
   * Contains zero secret data (SEC-16).
   */
  getPublicStates(): ProviderPublicState[] {
    const allSettings = this.settings.getAll().providers;
    return NATIVE_PROVIDER_IDS.map((id) => {
      const s = allSettings?.[id];
      return {
        id,
        enabled: s?.enabled !== false,
        baseUrl: s?.baseUrl,
        organizationId: s?.organizationId,
        autoDetectLocalAuth: s?.autoDetectLocalAuth !== false,
        keyMetadata: this.getKeyMetadata(id),
      };
    });
  }

  /**
   * Scan host machine and return discovered credentials overview (NO secrets included).
   */
  discoverLocalAuth(): DiscoveredProviderAuth[] {
    const discovered = this.getDiscoveredCredentials();
    const out: DiscoveredProviderAuth[] = [];

    for (const id of NATIVE_PROVIDER_IDS) {
      const cred = discovered[id];
      if (cred && (cred.key || cred.baseUrl)) {
        out.push({
          provider: id,
          source: cred.source,
          hasKey: !!cred.key,
          baseUrl: cred.baseUrl,
          model: cred.model,
        });
      }
    }

    return out;
  }

  /**
   * Import a discovered credential into the safeStorage SecretStore and update baseUrl if applicable.
   * Supports keyless import for local providers (such as Ollama).
   * Returns true if imported, false if no credentials were discovered.
   */
  importDiscoveredAuth(provider: NativeProviderId): boolean {
    const discovered = this.getDiscoveredCredentials()[provider];
    if (!discovered?.key && !discovered?.baseUrl) {
      return false;
    }

    if (discovered.key) {
      this.setApiKey(provider, discovered.key);
    }

    const sanitizedUrl = sanitizeBaseUrl(discovered.baseUrl);
    if (sanitizedUrl) {
      this.settings.update({
        providers: {
          [provider]: { baseUrl: sanitizedUrl },
        } as never,
      });
    }

    return true;
  }
}
