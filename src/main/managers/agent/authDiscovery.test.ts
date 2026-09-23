import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  discoverClineAuth,
  discoverOpenCodeAuth,
  discoverEnvAuth,
  discoverAllAuth,
} from './authDiscovery';

describe('authDiscovery', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-auth-discovery-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('discoverClineAuth', () => {
    it('returns empty record if directory or providers.json does not exist', () => {
      const nonExistent = path.join(tmpDir, 'does-not-exist');
      const result = discoverClineAuth(nonExistent);
      expect(result).toEqual({});
    });

    it('returns empty record if providers.json is malformed JSON', () => {
      const settingsDir = path.join(tmpDir, 'data', 'settings');
      fs.mkdirSync(settingsDir, { recursive: true });
      fs.writeFileSync(path.join(settingsDir, 'providers.json'), '{ not valid json');

      const result = discoverClineAuth(tmpDir);
      expect(result).toEqual({});
    });

    it('extracts API keys and base URLs from Cline providers.json using apiProvider or provider', () => {
      const settingsDir = path.join(tmpDir, 'data', 'settings');
      fs.mkdirSync(settingsDir, { recursive: true });
      fs.writeFileSync(
        path.join(settingsDir, 'providers.json'),
        JSON.stringify({
          version: 1,
          providers: {
            customProfile1: {
              settings: {
                apiProvider: 'openrouter',
                apiKey: 'sk-or-v1-test-openrouter-key',
                model: 'anthropic/claude-3.7-sonnet',
              },
            },
            'openai-codex': {
              settings: {
                provider: 'openai-codex',
                apiKey: 'sk-openai-test-key',
                baseUrl: 'https://api.openai.com/v1',
              },
            },
            freemodel: {
              settings: {
                provider: 'deepseek',
                apiKey: 'sk-deepseek-test-key',
              },
            },
            ollama: {
              settings: {
                apiProvider: 'ollama',
                baseUrl: 'http://localhost:11434',
              },
            },
          },
        }),
      );

      const result = discoverClineAuth(tmpDir);
      expect(result.openrouter?.key).toBe('sk-or-v1-test-openrouter-key');
      expect(result.openrouter?.source).toBe('cline');
      expect(result.openai?.key).toBe('sk-openai-test-key');
      expect(result.openai?.baseUrl).toBe('https://api.openai.com/v1');
      expect(result.deepseek?.key).toBe('sk-deepseek-test-key');
      expect(result.ollama?.baseUrl).toBe('http://localhost:11434');
    });
  });

  describe('discoverOpenCodeAuth', () => {
    it('returns empty record if opencode.json does not exist', () => {
      const nonExistent = path.join(tmpDir, 'does-not-exist');
      const result = discoverOpenCodeAuth(nonExistent);
      expect(result).toEqual({});
    });

    it('returns empty record if opencode.json is malformed JSON', () => {
      fs.writeFileSync(path.join(tmpDir, 'opencode.json'), 'invalid json');
      const result = discoverOpenCodeAuth(tmpDir);
      expect(result).toEqual({});
    });

    it('extracts API keys and base URLs from opencode.json', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'opencode.json'),
        JSON.stringify({
          model: 'ollama/llama3',
          provider: {
            ollama: {
              options: {
                baseURL: 'http://127.0.0.1:11434',
              },
            },
            anthropic: {
              options: {
                apiKey: 'sk-ant-test-key',
              },
            },
            google: {
              options: {
                apiKey: 'gemini-test-key',
              },
            },
          },
        }),
      );

      const result = discoverOpenCodeAuth(tmpDir);
      expect(result.ollama?.baseUrl).toBe('http://127.0.0.1:11434');
      expect(result.anthropic?.key).toBe('sk-ant-test-key');
      expect(result.anthropic?.source).toBe('opencode');
      expect(result.gemini?.key).toBe('gemini-test-key');
    });
  });

  describe('discoverEnvAuth', () => {
    it('extracts known provider environment variables including GOOGLE_API_KEY and OLLAMA_HOST', () => {
      const mockEnv = {
        GOOGLE_API_KEY: 'env-google-key',
        ANTHROPIC_API_KEY: 'env-anthropic-key',
        OPENAI_API_KEY: 'env-openai-key',
        DEEPSEEK_API_KEY: 'env-deepseek-key',
        OPENROUTER_API_KEY: 'env-openrouter-key',
        KILO_API_KEY: 'env-kilo-key',
        OLLAMA_HOST: 'http://custom-ollama:11434',
      };

      const result = discoverEnvAuth(mockEnv);
      expect(result.gemini?.key).toBe('env-google-key');
      expect(result.gemini?.source).toBe('env');
      expect(result.anthropic?.key).toBe('env-anthropic-key');
      expect(result.openai?.key).toBe('env-openai-key');
      expect(result.deepseek?.key).toBe('env-deepseek-key');
      expect(result.openrouter?.key).toBe('env-openrouter-key');
      expect(result.kilo?.key).toBe('env-kilo-key');
      expect(result.ollama?.baseUrl).toBe('http://custom-ollama:11434');
    });
  });

  describe('discoverAllAuth', () => {
    it('aggregates discoveries with correct precedence and smart field preservation', () => {
      const clineDir = path.join(tmpDir, 'cline');
      const clineSettings = path.join(clineDir, 'data', 'settings');
      fs.mkdirSync(clineSettings, { recursive: true });
      fs.writeFileSync(
        path.join(clineSettings, 'providers.json'),
        JSON.stringify({
          providers: {
            openrouter: { settings: { apiKey: 'cline-openrouter-key' } },
            // Cline has baseUrl only for deepseek
            deepseek: { settings: { baseUrl: 'https://api.deepseek.com/v1' } },
          },
        }),
      );

      const openCodeDir = path.join(tmpDir, 'opencode');
      fs.mkdirSync(openCodeDir, { recursive: true });
      fs.writeFileSync(
        path.join(openCodeDir, 'opencode.json'),
        JSON.stringify({
          provider: {
            anthropic: { options: { apiKey: 'opencode-anthropic-key' } },
          },
        }),
      );

      const mockEnv = {
        GEMINI_API_KEY: 'env-gemini-key',
        OPENROUTER_API_KEY: 'env-openrouter-key', // overridden by cline
        DEEPSEEK_API_KEY: 'env-deepseek-key', // should be preserved alongside cline baseUrl
      };

      const all = discoverAllAuth({ clineDir, openCodeDir, env: mockEnv });
      expect(all.openrouter?.key).toBe('cline-openrouter-key');
      expect(all.openrouter?.source).toBe('cline');
      expect(all.anthropic?.key).toBe('opencode-anthropic-key');
      expect(all.anthropic?.source).toBe('opencode');
      expect(all.gemini?.key).toBe('env-gemini-key');
      expect(all.gemini?.source).toBe('env');
      // Preserved deepseek key from env and baseUrl from cline
      expect(all.deepseek?.key).toBe('env-deepseek-key');
      expect(all.deepseek?.baseUrl).toBe('https://api.deepseek.com/v1');
    });
  });
});
