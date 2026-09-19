/**
 * Host configuration profile discovery and environment sanitization for OpenAI Codex.
 *
 * Implements:
 * - Discovers local CLI configuration and credentials in `~/.codex/` (or Windows `%APPDATA%/codex`).
 * - Detects ChatGPT Plus/Pro subscription authentication status (SEC-14).
 * - Sanitizes process environment variables preventing code injection (SEC-16)
 *   while preserving essential system execution PATHs.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Known configuration file names checked for authentication credentials. */
const AUTH_FILE_CANDIDATES = ['auth.json'] as const;

/** Environment variables stripped to prevent node execution hijacking. */
const HAZARDOUS_ENV_VARS = [
  'ELECTRON_RUN_AS_NODE',
  'NODE_OPTIONS',
  'LD_PRELOAD',
  'DYLD_INSERT_LIBRARIES',
] as const;

export interface CodexProfile {
  configDir: string;
  authMode: 'subscription' | 'apiKey' | 'none';
  hasAuth: boolean;
  authFile?: string;
}

/**
 * Discovers host configuration directory and authentication credentials for OpenAI Codex.
 *
 * Checks primary `~/.codex` directory, followed by platform-specific fallbacks
 * (e.g. `%APPDATA%/codex` on Windows).
 */
export function discoverCodexProfile(
  customConfigDir?: string,
  homeDir?: string,
  env: NodeJS.ProcessEnv = process.env,
): CodexProfile {
  let resolvedDir: string;

  if (customConfigDir && customConfigDir.trim().length > 0) {
    resolvedDir = path.resolve(customConfigDir.trim());
  } else {
    const baseHome = homeDir ?? os.homedir();
    const primaryDir = path.join(baseHome, '.codex');
    const appDataDir = env.APPDATA ? path.join(env.APPDATA, 'codex') : null;

    const primaryAuth = path.join(primaryDir, 'auth.json');
    const appDataAuth = appDataDir ? path.join(appDataDir, 'auth.json') : null;

    if (fs.existsSync(primaryAuth)) {
      resolvedDir = primaryDir;
    } else if (appDataDir && appDataAuth && fs.existsSync(appDataAuth)) {
      resolvedDir = appDataDir;
    } else if (fs.existsSync(primaryDir)) {
      resolvedDir = primaryDir;
    } else if (appDataDir && fs.existsSync(appDataDir)) {
      resolvedDir = appDataDir;
    } else {
      resolvedDir = primaryDir;
    }
  }

  // Probe for subscription credentials file
  let authFile: string | undefined;
  let hasSubscriptionCreds = false;

  for (const candidate of AUTH_FILE_CANDIDATES) {
    const candidatePath = path.join(resolvedDir, candidate);
    try {
      if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
        const content = fs.readFileSync(candidatePath, 'utf8').trim();
        if (content.length > 0) {
          try {
            const parsed = JSON.parse(content) as Record<string, unknown>;
            if (
              parsed &&
              (parsed.tokens ||
                parsed.access_token ||
                parsed.session ||
                parsed.auth ||
                parsed.apiKey ||
                parsed.chatgpt_plus ||
                parsed.subscription)
            ) {
              hasSubscriptionCreds = true;
              authFile = candidatePath;
              break;
            }
          } catch {
            // Non-JSON or corrupt file; proceed to next candidate
          }
        }
      }
    } catch {
      // Permission or filesystem error reading candidate; proceed
    }
  }

  const apiKeyPresent = Boolean(env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim().length > 0);

  let authMode: 'subscription' | 'apiKey' | 'none';
  if (hasSubscriptionCreds) {
    authMode = 'subscription';
  } else if (apiKeyPresent) {
    authMode = 'apiKey';
  } else {
    authMode = 'none';
  }

  return {
    configDir: resolvedDir,
    authMode,
    hasAuth: authMode !== 'none',
    authFile,
  };
}

/**
 * Sanitizes environment variables for Codex child process execution.
 *
 * Strips dangerous variables while preserving essential system paths and credentials.
 */
export function sanitizeCodexEnvironment(
  extraEnv?: Record<string, string | undefined>,
  sourceEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const result: Record<string, string> = {};

  // Copy safe variables from source environment
  for (const [key, value] of Object.entries(sourceEnv)) {
    if (value === undefined) continue;
    if (HAZARDOUS_ENV_VARS.includes(key as (typeof HAZARDOUS_ENV_VARS)[number])) {
      continue;
    }
    result[key] = value;
  }

  // Merge extra variables, filtering out hazardous keys
  if (extraEnv) {
    for (const [key, value] of Object.entries(extraEnv)) {
      if (value === undefined) continue;
      if (HAZARDOUS_ENV_VARS.includes(key as (typeof HAZARDOUS_ENV_VARS)[number])) {
        continue;
      }
      result[key] = value;
    }
  }

  return result;
}
