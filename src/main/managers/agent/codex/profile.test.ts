import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { discoverCodexProfile, sanitizeCodexEnvironment } from './profile';

describe('Codex Host Profile Discovery & Environment Sanitization (#59)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-codex-profile-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup best effort
    }
  });

  it('resolves custom configuration directory when provided', () => {
    const customDir = path.join(tempDir, 'custom-codex');
    fs.mkdirSync(customDir);

    const profile = discoverCodexProfile(customDir);
    expect(profile.configDir).toBe(path.resolve(customDir));
  });

  it('detects subscription auth mode when auth.json with tokens exists in config directory', () => {
    const codexDir = path.join(tempDir, '.codex');
    fs.mkdirSync(codexDir);
    fs.writeFileSync(
      path.join(codexDir, 'auth.json'),
      JSON.stringify({ tokens: { access_token: 'secret_token_123' }, chatgpt_plus: true }),
    );

    const profile = discoverCodexProfile(undefined, tempDir, {});
    expect(profile.configDir).toBe(codexDir);
    expect(profile.authMode).toBe('subscription');
    expect(profile.hasAuth).toBe(true);
    expect(profile.authFile).toBe(path.join(codexDir, 'auth.json'));
  });

  it('detects apiKey auth mode when no credentials file exists but OPENAI_API_KEY is in env', () => {
    const codexDir = path.join(tempDir, '.codex');
    fs.mkdirSync(codexDir);

    const profile = discoverCodexProfile(undefined, tempDir, {
      OPENAI_API_KEY: 'sk-test-openai-key',
    });
    expect(profile.authMode).toBe('apiKey');
    expect(profile.hasAuth).toBe(true);
    expect(profile.authFile).toBeUndefined();
  });

  it('detects none auth mode when neither credentials file nor OPENAI_API_KEY exists', () => {
    const codexDir = path.join(tempDir, '.codex');
    fs.mkdirSync(codexDir);

    const profile = discoverCodexProfile(undefined, tempDir, {});
    expect(profile.authMode).toBe('none');
    expect(profile.hasAuth).toBe(false);
  });

  it('falls back to APPDATA/codex/auth.json on Windows when primary ~/.codex lacks credentials', () => {
    const primaryDir = path.join(tempDir, '.codex');
    fs.mkdirSync(primaryDir);

    const appDataDir = path.join(tempDir, 'AppData', 'Roaming', 'codex');
    fs.mkdirSync(appDataDir, { recursive: true });
    fs.writeFileSync(
      path.join(appDataDir, 'auth.json'),
      JSON.stringify({ tokens: { access_token: 'appdata_token_456' }, chatgpt_pro: true }),
    );

    const profile = discoverCodexProfile(undefined, tempDir, {
      APPDATA: path.join(tempDir, 'AppData', 'Roaming'),
    });
    expect(profile.configDir).toBe(appDataDir);
    expect(profile.authMode).toBe('subscription');
    expect(profile.hasAuth).toBe(true);
    expect(profile.authFile).toBe(path.join(appDataDir, 'auth.json'));
  });

  it('sanitizes dangerous environment variables preventing execution hijacking (SEC-16)', () => {
    const dangerousEnv: NodeJS.ProcessEnv = {
      PATH: '/usr/bin:/bin',
      HOME: '/home/user',
      ELECTRON_RUN_AS_NODE: '1',
      NODE_OPTIONS: '--inspect=9229',
      LD_PRELOAD: '/evil/lib.so',
      DYLD_INSERT_LIBRARIES: '/evil/dylib',
    };

    const sanitized = sanitizeCodexEnvironment({ EXTRA_VAR: 'safe' }, dangerousEnv);

    expect(sanitized.PATH).toBe('/usr/bin:/bin');
    expect(sanitized.HOME).toBe('/home/user');
    expect(sanitized.EXTRA_VAR).toBe('safe');
    expect(sanitized.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(sanitized.NODE_OPTIONS).toBeUndefined();
    expect(sanitized.LD_PRELOAD).toBeUndefined();
    expect(sanitized.DYLD_INSERT_LIBRARIES).toBeUndefined();
  });

  it('strips dangerous variables even if passed in extraEnv', () => {
    const sanitized = sanitizeCodexEnvironment(
      {
        NODE_OPTIONS: '--require malicious.js',
        SAFE_SETTING: '1',
      },
      { PATH: '/bin' },
    );

    expect(sanitized.PATH).toBe('/bin');
    expect(sanitized.SAFE_SETTING).toBe('1');
    expect(sanitized.NODE_OPTIONS).toBeUndefined();
  });
});
