/**
 * Host configuration profile discovery and environment sanitization for ACP agents.
 *
 * Implements:
 * - Profile discovery for Cline (`~/.cline`) and OpenCode (`~/.config/opencode`).
 * - Environment sanitization stripping dangerous / interfering variables
 *   (e.g. `NODE_OPTIONS`, `ELECTRON_RUN_AS_NODE`) while preserving host PATH, HOME,
 *   and authentication credentials without leaking them in plaintext (SEC-14, SEC-16).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { HeadlessAgentProvider } from '../types';

export interface ProfileDiscoveryResult {
  configDir: string;
  exists: boolean;
}

/** Dangerous / process-interfering environment variables to strip. */
const STRIP_ENV_VARS = new Set([
  'ELECTRON_RUN_AS_NODE',
  'NODE_OPTIONS',
  'LD_PRELOAD',
  'DYLD_INSERT_LIBRARIES',
]);

/**
 * Discovers the host configuration/profile directory for an agent provider.
 */
export function discoverProfile(
  provider: 'cline' | 'opencode' | HeadlessAgentProvider,
  customConfigDir?: string,
): ProfileDiscoveryResult {
  if (customConfigDir) {
    return {
      configDir: customConfigDir,
      exists: fs.existsSync(customConfigDir),
    };
  }

  const homedir = os.homedir();

  if (provider === 'cline') {
    const candidates = [
      path.join(homedir, '.cline'),
      ...(process.platform === 'win32' && process.env.APPDATA
        ? [path.join(process.env.APPDATA, 'cline')]
        : []),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return { configDir: candidate, exists: true };
      }
    }

    return { configDir: candidates[0], exists: false };
  }

  // OpenCode
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(homedir, '.config');
  const candidates = [
    path.join(xdgConfig, 'opencode'),
    ...(process.platform === 'win32' && process.env.APPDATA
      ? [path.join(process.env.APPDATA, 'opencode')]
      : []),
    path.join(homedir, '.opencode'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { configDir: candidate, exists: true };
    }
  }

  return { configDir: candidates[0], exists: false };
}

/**
 * Sanitizes host environment variables for child agent processes.
 * Preserves standard system PATH, HOME, and auth tokens while stripping
 * process-contaminating flags like `NODE_OPTIONS` and `ELECTRON_RUN_AS_NODE`.
 */
export function sanitizeEnvironment(
  extraEnv?: Record<string, string>,
): NodeJS.ProcessEnv {
  const sanitized: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (STRIP_ENV_VARS.has(key)) continue;
    sanitized[key] = value;
  }

  if (extraEnv) {
    for (const [key, value] of Object.entries(extraEnv)) {
      if (value !== undefined) {
        sanitized[key] = value;
      }
    }
  }

  return sanitized;
}
