/**
 * Unit tests for host configuration profile discovery and environment sanitization (#58).
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { discoverProfile, sanitizeEnvironment } from './profile';

describe('Host Configuration Profile Discovery (#58)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('discovers ~/.cline directory when it exists on the host', () => {
    const expectedDir = path.join(os.homedir(), '.cline');
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === expectedDir);

    const result = discoverProfile('cline');
    expect(result.exists).toBe(true);
    expect(result.configDir).toBe(expectedDir);
  });

  it('falls back to default path when ~/.cline does not exist', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const result = discoverProfile('cline');
    expect(result.exists).toBe(false);
    expect(result.configDir).toBe(path.join(os.homedir(), '.cline'));
  });

  it('discovers ~/.config/opencode when it exists', () => {
    const expectedDir = path.join(os.homedir(), '.config', 'opencode');
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === expectedDir);

    const result = discoverProfile('opencode');
    expect(result.exists).toBe(true);
    expect(result.configDir).toBe(expectedDir);
  });

  it('respects customConfigDir override if provided', () => {
    const custom = '/custom/path/to/cline';
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === custom);

    const result = discoverProfile('cline', custom);
    expect(result.exists).toBe(true);
    expect(result.configDir).toBe(custom);
  });
});

describe('Environment Sanitization (#58)', () => {
  it('preserves system path, home, and standard shell variables', () => {
    const env = sanitizeEnvironment();
    expect(env.PATH !== undefined || env.Path !== undefined).toBe(true);
  });

  it('strips process-interfering and dangerous variables (e.g. ELECTRON_RUN_AS_NODE, NODE_OPTIONS)', () => {
    const originalNodeOptions = process.env.NODE_OPTIONS;
    const originalElectron = process.env.ELECTRON_RUN_AS_NODE;
    try {
      process.env.NODE_OPTIONS = '--inspect=9229';
      process.env.ELECTRON_RUN_AS_NODE = '1';

      const sanitized = sanitizeEnvironment();
      expect(sanitized.NODE_OPTIONS).toBeUndefined();
      expect(sanitized.ELECTRON_RUN_AS_NODE).toBeUndefined();
    } finally {
      if (originalNodeOptions === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = originalNodeOptions;
      if (originalElectron === undefined) delete process.env.ELECTRON_RUN_AS_NODE;
      else process.env.ELECTRON_RUN_AS_NODE = originalElectron;
    }
  });

  it('merges extraEnv securely without mutating process.env', () => {
    const extra = { MY_CUSTOM_AGENT_VAR: 'hello' };
    const sanitized = sanitizeEnvironment(extra);
    expect(sanitized.MY_CUSTOM_AGENT_VAR).toBe('hello');
    expect(process.env.MY_CUSTOM_AGENT_VAR).toBeUndefined();
  });
});
