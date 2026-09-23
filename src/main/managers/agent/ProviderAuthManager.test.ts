import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProviderAuthManager } from './ProviderAuthManager';
import { SecretStore } from '../../secrets/SecretStore';
import type { SettingsManager } from '../SettingsManager';
import type { AppSettings } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/constants';

describe('ProviderAuthManager', () => {
  let tmpDir: string;
  let secretStore: SecretStore;
  let mockSettings: AppSettings;
  let settingsManager: SettingsManager;
  let authManager: ProviderAuthManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-provider-auth-test-'));

    mockSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    settingsManager = {
      getAll: () => mockSettings,
      onChange: vi.fn(),
      update: vi.fn((patch) => {
        Object.assign(mockSettings, patch);
        return mockSettings;
      }),
    } as unknown as SettingsManager;

    secretStore = new SecretStore();
    vi.spyOn(secretStore as never, 'dir').mockReturnValue(tmpDir);
    vi.spyOn(secretStore, 'isEncryptionAvailable').mockReturnValue(true);

    authManager = new ProviderAuthManager(secretStore, settingsManager);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('setApiKey & removeApiKey', () => {
    it('stores and removes API keys via SecretStore without persisting in settings', () => {
      // Mock safeStorage encryption and decryption for SecretStore test
      const storeMock = new Map<string, string>();
      vi.spyOn(secretStore, 'set').mockImplementation((name, val) => {
        storeMock.set(name, val);
      });
      vi.spyOn(secretStore, 'has').mockImplementation((name) => storeMock.has(name));
      vi.spyOn(secretStore, 'metadata').mockImplementation((name) =>
        storeMock.has(name) ? { configured: true, updatedAt: 12345 } : { configured: false },
      );
      vi.spyOn(secretStore, 'getDecrypted').mockImplementation((name) => storeMock.get(name) ?? null);
      vi.spyOn(secretStore, 'remove').mockImplementation((name) => {
        storeMock.delete(name);
      });

      authManager.setApiKey('gemini', 'my-gemini-secret-key');
      expect(authManager.getKeyMetadata('gemini')).toEqual({
        configured: true,
        updatedAt: 12345,
        source: 'secret-store',
      });
      expect(authManager.getEffectiveApiKey('gemini')).toBe('my-gemini-secret-key');

      authManager.removeApiKey('gemini');
      expect(authManager.getKeyMetadata('gemini').configured).toBe(false);
      expect(authManager.getEffectiveApiKey('gemini')).toBeNull();
    });

    it('rejects invalid or oversized keys', () => {
      expect(() => authManager.setApiKey('gemini', '')).toThrow();
      expect(() => authManager.setApiKey('gemini', '   ')).toThrow();
      expect(() => authManager.setApiKey('gemini', 'x'.repeat(600))).toThrow();
    });
  });

  describe('local auth discovery fallback & precedence', () => {
    it('falls back to discovered credentials when autoDetectLocalAuth is true', () => {
      vi.spyOn(secretStore, 'has').mockReturnValue(false);
      vi.spyOn(secretStore, 'getDecrypted').mockReturnValue(null);

      // Mock discovery service to return a discovered key
      vi.spyOn(authManager as never, 'getDiscoveredCredentials').mockReturnValue({
        openrouter: { key: 'discovered-or-key', source: 'cline' },
      });

      expect(authManager.getKeyMetadata('openrouter')).toEqual({
        configured: true,
        source: 'discovered-cline',
      });
      expect(authManager.getEffectiveApiKey('openrouter')).toBe('discovered-or-key');
    });

    it('does not fall back to discovered credentials when autoDetectLocalAuth is false', () => {
      mockSettings.providers.openrouter.autoDetectLocalAuth = false;
      vi.spyOn(secretStore, 'has').mockReturnValue(false);
      vi.spyOn(secretStore, 'getDecrypted').mockReturnValue(null);

      vi.spyOn(authManager as never, 'getDiscoveredCredentials').mockReturnValue({
        openrouter: { key: 'discovered-or-key', source: 'cline' },
      });

      expect(authManager.getKeyMetadata('openrouter')).toEqual({
        configured: false,
      });
      expect(authManager.getEffectiveApiKey('openrouter')).toBeNull();
    });

    it('prioritizes SecretStore explicit key over discovered credentials', () => {
      vi.spyOn(secretStore, 'has').mockReturnValue(true);
      vi.spyOn(secretStore, 'metadata').mockReturnValue({ configured: true, updatedAt: 99999 });
      vi.spyOn(secretStore, 'getDecrypted').mockReturnValue('explicit-store-key');

      vi.spyOn(authManager as never, 'getDiscoveredCredentials').mockReturnValue({
        openrouter: { key: 'discovered-or-key', source: 'cline' },
      });

      expect(authManager.getKeyMetadata('openrouter')).toEqual({
        configured: true,
        updatedAt: 99999,
        source: 'secret-store',
      });
      expect(authManager.getEffectiveApiKey('openrouter')).toBe('explicit-store-key');
    });

    it('returns null for getEffectiveApiKey if provider is disabled in settings', () => {
      mockSettings.providers.gemini.enabled = false;
      vi.spyOn(secretStore, 'has').mockReturnValue(true);
      vi.spyOn(secretStore, 'getDecrypted').mockReturnValue('explicit-gemini-key');

      expect(authManager.getEffectiveApiKey('gemini')).toBeNull();
    });
  });

  describe('getEffectiveBaseUrl', () => {
    it('returns user-configured baseUrl when present in settings', () => {
      mockSettings.providers.openai.baseUrl = 'https://custom-openai-proxy.internal/v1';
      expect(authManager.getEffectiveBaseUrl('openai')).toBe('https://custom-openai-proxy.internal/v1');
    });

    it('falls back to discovered baseUrl when settings has none', () => {
      mockSettings.providers.deepseek.baseUrl = undefined;
      vi.spyOn(authManager as never, 'getDiscoveredCredentials').mockReturnValue({
        deepseek: { baseUrl: 'https://proxy.deepseek.internal/v1', source: 'opencode' },
      });
      expect(authManager.getEffectiveBaseUrl('deepseek')).toBe('https://proxy.deepseek.internal/v1');
    });

    it('returns undefined if provider is disabled in settings', () => {
      mockSettings.providers.ollama.enabled = false;
      expect(authManager.getEffectiveBaseUrl('ollama')).toBeUndefined();
    });
  });

  describe('importDiscoveredAuth', () => {
    it('imports discovered key into SecretStore', () => {
      let savedKey: string | null = null;
      vi.spyOn(secretStore, 'set').mockImplementation((_, val) => {
        savedKey = val;
      });

      vi.spyOn(authManager as never, 'getDiscoveredCredentials').mockReturnValue({
        deepseek: { key: 'sk-deepseek-discovered', source: 'cline' },
      });

      const success = authManager.importDiscoveredAuth('deepseek');
      expect(success).toBe(true);
      expect(savedKey).toBe('sk-deepseek-discovered');
    });

    it('supports keyless import for Ollama with baseUrl', () => {
      vi.spyOn(authManager as never, 'getDiscoveredCredentials').mockReturnValue({
        ollama: { baseUrl: 'http://custom-host:11434', source: 'env' },
      });

      const success = authManager.importDiscoveredAuth('ollama');
      expect(success).toBe(true);
      expect(settingsManager.update).toHaveBeenCalledWith(
        expect.objectContaining({
          providers: {
            ollama: { baseUrl: 'http://custom-host:11434' },
          },
        }),
      );
    });

    it('returns false if provider has no discovered key or baseUrl to import', () => {
      vi.spyOn(authManager as never, 'getDiscoveredCredentials').mockReturnValue({});
      const success = authManager.importDiscoveredAuth('gemini');
      expect(success).toBe(false);
    });
  });

  describe('getPublicStates', () => {
    it('returns public states for all 7 providers with no plaintext secrets', () => {
      vi.spyOn(secretStore, 'has').mockReturnValue(false);
      vi.spyOn(authManager as never, 'getDiscoveredCredentials').mockReturnValue({});

      const states = authManager.getPublicStates();
      expect(states.length).toBe(7);

      const gemini = states.find((s) => s.id === 'gemini');
      expect(gemini).toBeDefined();
      expect(gemini?.enabled).toBe(true);
      expect(gemini?.keyMetadata.configured).toBe(false);

      const ollama = states.find((s) => s.id === 'ollama');
      expect(ollama?.baseUrl).toBe('http://localhost:11434');

      // Crucial: no secret properties present in public state objects
      for (const s of states) {
        expect((s as unknown as Record<string, unknown>).apiKey).toBeUndefined();
        expect((s as unknown as Record<string, unknown>).key).toBeUndefined();
      }
    });
  });
});
