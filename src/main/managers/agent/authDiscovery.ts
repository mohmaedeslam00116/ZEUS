/**
 * AuthDiscoveryService — discovers saved credentials and configuration from
 * local agent installations (Cline and OpenCode) on the host machine.
 *
 * Security Invariants:
 * - SEC-16: Discovered plaintext keys are NEVER logged and NEVER sent across IPC.
 * - SEC-17: All discovered keys remain main-process-internal unless explicitly
 *   imported by the user into Zeus's encrypted safeStorage SecretStore.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { NativeProviderId } from '@shared/types';
import { logger } from '../../logger';

export interface DiscoveredCredential {
  key?: string;
  baseUrl?: string;
  model?: string;
  source: 'cline' | 'opencode' | 'env';
}

export type DiscoveredCredentialsMap = Partial<Record<NativeProviderId, DiscoveredCredential>>;

/** Normalize vendor/profile string to canonical NativeProviderId. */
function mapProviderName(raw: string): NativeProviderId | null {
  const norm = raw.trim().toLowerCase();
  if (norm === 'gemini' || norm === 'google') return 'gemini';
  if (norm === 'anthropic' || norm === 'claude') return 'anthropic';
  if (norm === 'openai' || norm === 'openai-codex' || norm === 'codex') return 'openai';
  if (norm === 'deepseek') return 'deepseek';
  if (norm === 'openrouter' || norm === 'orcarouter') return 'openrouter';
  if (norm === 'ollama') return 'ollama';
  if (norm === 'kilo' || norm === 'kilogateway') return 'kilo';
  return null;
}

/**
 * Safely read and parse a JSON configuration file.
 * Guarded against secret leaks: errors log only the error name, never raw exception
 * snippets that might echo file contents or nearby API keys (SEC-16).
 */
function safeReadJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as T;
  } catch (err) {
    const reason = err instanceof Error ? err.name : 'UnknownError';
    logger.warn(`AuthDiscoveryService: failed to read settings at ${file} (${reason})`);
    return null;
  }
}

/**
 * Discover saved credentials from local Cline configuration.
 * Inspects `~/.cline/data/settings/providers.json` and standard platform locations.
 */
export function discoverClineAuth(customClineDir?: string): DiscoveredCredentialsMap {
  const out: DiscoveredCredentialsMap = {};
  const candidateFiles: string[] = [];

  if (customClineDir) {
    candidateFiles.push(
      path.join(customClineDir, 'data', 'settings', 'providers.json'),
      path.join(customClineDir, 'providers.json'),
    );
  } else {
    const home = os.homedir();
    candidateFiles.push(path.join(home, '.cline', 'data', 'settings', 'providers.json'));

    if (process.platform === 'win32' && process.env.APPDATA) {
      candidateFiles.push(
        path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'providers.json'),
      );
    } else if (process.platform === 'darwin') {
      candidateFiles.push(
        path.join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'providers.json'),
      );
    } else {
      candidateFiles.push(
        path.join(home, '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'providers.json'),
      );
    }
  }

  for (const file of candidateFiles) {
    const parsed = safeReadJson<{ providers?: Record<string, unknown> }>(file);
    if (!parsed || !parsed.providers || typeof parsed.providers !== 'object') continue;

    for (const [profileKey, profileData] of Object.entries(parsed.providers)) {
      if (!profileData || typeof profileData !== 'object') continue;
      const profileSettings =
        (profileData as { settings?: Record<string, unknown> }).settings ||
        (profileData as Record<string, unknown>);

      const rawProvider = String(
        profileSettings.apiProvider || profileSettings.provider || profileKey,
      );
      const mapped = mapProviderName(rawProvider);
      if (!mapped) continue;

      const key =
        typeof profileSettings.apiKey === 'string' && profileSettings.apiKey.trim().length > 0
          ? profileSettings.apiKey.trim()
          : undefined;
      const baseUrl =
        typeof profileSettings.baseUrl === 'string' && profileSettings.baseUrl.trim().length > 0
          ? profileSettings.baseUrl.trim()
          : undefined;
      const model =
        typeof profileSettings.model === 'string' && profileSettings.model.trim().length > 0
          ? profileSettings.model.trim()
          : undefined;

      if (key || baseUrl) {
        out[mapped] = {
          ...(key ? { key } : {}),
          ...(baseUrl ? { baseUrl } : {}),
          ...(model ? { model } : {}),
          source: 'cline',
        };
      }
    }
  }

  return out;
}

/**
 * Discover saved credentials from local OpenCode configuration (`opencode.json`).
 */
export function discoverOpenCodeAuth(customOpenCodeDir?: string): DiscoveredCredentialsMap {
  const out: DiscoveredCredentialsMap = {};
  const candidateFiles: string[] = [];

  if (customOpenCodeDir) {
    candidateFiles.push(
      path.join(customOpenCodeDir, 'opencode.json'),
      path.join(customOpenCodeDir, '.config', 'opencode', 'opencode.json'),
    );
  } else {
    const home = os.homedir();
    candidateFiles.push(
      path.join(home, '.config', 'opencode', 'opencode.json'),
      path.join(home, '.opencode', 'opencode.json'),
    );
    if (process.platform === 'win32' && process.env.APPDATA) {
      candidateFiles.push(path.join(process.env.APPDATA, 'opencode', 'opencode.json'));
    }
  }

  for (const file of candidateFiles) {
    const parsed = safeReadJson<{ provider?: Record<string, unknown> }>(file);
    if (!parsed || !parsed.provider || typeof parsed.provider !== 'object') continue;

    for (const [providerKey, providerConfig] of Object.entries(parsed.provider)) {
      const mapped = mapProviderName(providerKey);
      if (!mapped || !providerConfig || typeof providerConfig !== 'object') continue;

      const options = (providerConfig as { options?: Record<string, unknown> }).options || {};
      const key =
        typeof options.apiKey === 'string' && options.apiKey.trim().length > 0
          ? options.apiKey.trim()
          : undefined;
      const baseUrl =
        typeof options.baseURL === 'string' && options.baseURL.trim().length > 0
          ? options.baseURL.trim()
          : typeof options.baseUrl === 'string' && options.baseUrl.trim().length > 0
          ? options.baseUrl.trim()
          : undefined;

      if (key || baseUrl) {
        out[mapped] = {
          ...(key ? { key } : {}),
          ...(baseUrl ? { baseUrl } : {}),
          source: 'opencode',
        };
      }
    }
  }

  return out;
}

/**
 * Discover credentials from standard environment variables.
 */
export function discoverEnvAuth(
  customEnv?: Record<string, string | undefined>,
): DiscoveredCredentialsMap {
  const env = customEnv || process.env;
  const out: DiscoveredCredentialsMap = {};

  const map: Array<{ envKey: string; provider: NativeProviderId; isBaseUrl?: boolean }> = [
    { envKey: 'GEMINI_API_KEY', provider: 'gemini' },
    { envKey: 'GOOGLE_API_KEY', provider: 'gemini' },
    { envKey: 'ANTHROPIC_API_KEY', provider: 'anthropic' },
    { envKey: 'OPENAI_API_KEY', provider: 'openai' },
    { envKey: 'DEEPSEEK_API_KEY', provider: 'deepseek' },
    { envKey: 'OPENROUTER_API_KEY', provider: 'openrouter' },
    { envKey: 'KILO_API_KEY', provider: 'kilo' },
    { envKey: 'OLLAMA_BASE_URL', provider: 'ollama', isBaseUrl: true },
    { envKey: 'OLLAMA_HOST', provider: 'ollama', isBaseUrl: true },
  ];

  for (const item of map) {
    const val = env[item.envKey]?.trim();
    if (val && val.length > 0) {
      if (item.isBaseUrl) {
        out[item.provider] = {
          ...out[item.provider],
          baseUrl: val,
          source: 'env',
        };
      } else {
        out[item.provider] = {
          ...out[item.provider],
          key: val,
          source: 'env',
        };
      }
    }
  }

  return out;
}

/**
 * Aggregates all discovered authentication sources across Cline, OpenCode, and Environment.
 * Precedence: Cline > OpenCode > Environment.
 * Smart merge preserves both key and baseUrl when populated across multiple sources.
 */
export function discoverAllAuth(options?: {
  clineDir?: string;
  openCodeDir?: string;
  env?: Record<string, string | undefined>;
}): DiscoveredCredentialsMap {
  const envAuth = discoverEnvAuth(options?.env);
  const openCodeAuth = discoverOpenCodeAuth(options?.openCodeDir);
  const clineAuth = discoverClineAuth(options?.clineDir);

  const merged: DiscoveredCredentialsMap = {};
  const sources = [envAuth, openCodeAuth, clineAuth];

  for (const src of sources) {
    for (const [id, cred] of Object.entries(src) as Array<[NativeProviderId, DiscoveredCredential]>) {
      if (!cred) continue;
      const existing = merged[id];
      if (!existing) {
        merged[id] = { ...cred };
      } else {
        merged[id] = {
          ...existing,
          ...cred,
          key: cred.key || existing.key,
          baseUrl: cred.baseUrl || existing.baseUrl,
          source: cred.key ? cred.source : existing.source,
        };
      }
    }
  }

  return merged;
}
