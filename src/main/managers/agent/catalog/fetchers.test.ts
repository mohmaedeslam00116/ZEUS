import { describe, it, expect } from 'vitest';
import {
  normalizeOpenRouterModel,
  normalizeGeminiModel,
  normalizeOllamaModel,
  normalizeOpenAIModel,
  normalizeDeepSeekModel,
  normalizeAnthropicModel,
  STATIC_BASELINE_MODELS,
} from './fetchers';

describe('catalog fetchers & model normalization', () => {
  describe('normalizeOpenRouterModel', () => {
    it('classifies free models with :free suffix', () => {
      const raw = {
        id: 'meta-llama/llama-3.3-70b-instruct:free',
        name: 'Meta: Llama 3.3 70B Instruct (free)',
        context_length: 131072,
        pricing: { prompt: '0', completion: '0' },
        supported_parameters: ['tools', 'temperature'],
        description: 'Llama 3.3 free tier',
      };

      const model = normalizeOpenRouterModel(raw);
      expect(model.id).toBe('openrouter:meta-llama/llama-3.3-70b-instruct:free');
      expect(model.provider).toBe('openrouter');
      expect(model.isFree).toBe(true);
      expect(model.contextLength).toBe(131072);
      expect(model.supportsTools).toBe(true);
      expect(model.supportsThinking).toBe(false);
    });

    it('classifies free models by zero pricing', () => {
      const raw = {
        id: 'mistralai/mistral-7b-instruct',
        name: 'Mistral 7B',
        context_length: 32768,
        pricing: { prompt: 0, completion: 0 },
      };

      const model = normalizeOpenRouterModel(raw);
      expect(model.isFree).toBe(true);
    });

    it('classifies paid models and reasoning models', () => {
      const raw = {
        id: 'deepseek/deepseek-r1',
        name: 'DeepSeek R1',
        context_length: 64000,
        pricing: { prompt: '0.00000055', completion: '0.00000219' },
      };

      const model = normalizeOpenRouterModel(raw);
      expect(model.isFree).toBe(false);
      expect(model.supportsThinking).toBe(true);
    });
  });

  describe('normalizeGeminiModel', () => {
    it('strips models/ prefix and tags free tier models', () => {
      const raw = {
        name: 'models/gemini-2.0-flash',
        displayName: 'Gemini 2.0 Flash',
        inputTokenLimit: 1048576,
        supportedGenerationMethods: ['generateContent'],
        description: 'Fast multimodal model',
      };

      const model = normalizeGeminiModel(raw);
      expect(model.id).toBe('gemini:gemini-2.0-flash');
      expect(model.name).toBe('Gemini 2.0 Flash');
      expect(model.provider).toBe('gemini');
      expect(model.isFree).toBe(true);
      expect(model.contextLength).toBe(1048576);
      expect(model.supportsTools).toBe(true);
    });

    it('detects reasoning capabilities for thinking models', () => {
      const raw = {
        name: 'models/gemini-2.0-flash-thinking-exp',
        displayName: 'Gemini 2.0 Flash Thinking',
        inputTokenLimit: 1048576,
        supportedGenerationMethods: ['generateContent'],
      };

      const model = normalizeGeminiModel(raw);
      expect(model.supportsThinking).toBe(true);
      expect(model.isFree).toBe(true);
    });
  });

  describe('normalizeOllamaModel', () => {
    it('always tags local Ollama models as free', () => {
      const raw = {
        name: 'llama3.2:3b',
        model: 'llama3.2:3b',
        size: 2019393189,
        details: { family: 'llama', parameter_size: '3.2B' },
      };

      const model = normalizeOllamaModel(raw);
      expect(model.id).toBe('ollama:llama3.2:3b');
      expect(model.provider).toBe('ollama');
      expect(model.isFree).toBe(true);
      expect(model.supportsTools).toBe(true);
      expect(model.supportsThinking).toBe(false);
    });

    it('detects reasoning models in Ollama like deepseek-r1', () => {
      const raw = {
        name: 'deepseek-r1:8b',
        model: 'deepseek-r1:8b',
        details: { family: 'deepseek', parameter_size: '8B' },
      };

      const model = normalizeOllamaModel(raw);
      expect(model.isFree).toBe(true);
      expect(model.supportsThinking).toBe(true);
    });
  });

  describe('normalizeOpenAIModel', () => {
    it('normalizes chat models and excludes non-chat models', () => {
      expect(normalizeOpenAIModel({ id: 'whisper-1' })).toBeNull();
      expect(normalizeOpenAIModel({ id: 'text-embedding-3-small' })).toBeNull();
      expect(normalizeOpenAIModel({ id: 'dall-e-3' })).toBeNull();

      const gpt4 = normalizeOpenAIModel({ id: 'gpt-4o' });
      expect(gpt4).not.toBeNull();
      expect(gpt4?.id).toBe('openai:gpt-4o');
      expect(gpt4?.isFree).toBe(false);
      expect(gpt4?.contextLength).toBe(128000);
      expect(gpt4?.supportsTools).toBe(true);
      expect(gpt4?.supportsThinking).toBe(false);

      const o1 = normalizeOpenAIModel({ id: 'o1-preview' });
      expect(o1).not.toBeNull();
      expect(o1?.supportsThinking).toBe(true);
    });
  });

  describe('normalizeDeepSeekModel', () => {
    it('correctly maps deepseek-chat and deepseek-reasoner', () => {
      const chat = normalizeDeepSeekModel({ id: 'deepseek-chat' });
      expect(chat.id).toBe('deepseek:deepseek-chat');
      expect(chat.supportsTools).toBe(true);
      expect(chat.supportsThinking).toBe(false);

      const reasoner = normalizeDeepSeekModel({ id: 'deepseek-reasoner' });
      expect(reasoner.id).toBe('deepseek:deepseek-reasoner');
      expect(reasoner.supportsThinking).toBe(true);
      expect(reasoner.supportsTools).toBe(false);
    });
  });

  describe('normalizeAnthropicModel', () => {
    it('detects hybrid thinking on Claude 3.7 Sonnet', () => {
      const claude37 = normalizeAnthropicModel({
        id: 'claude-3-7-sonnet-20250219',
        display_name: 'Claude 3.7 Sonnet',
      });
      expect(claude37.id).toBe('anthropic:claude-3-7-sonnet-20250219');
      expect(claude37.supportsThinking).toBe(true);
      expect(claude37.supportsTools).toBe(true);
      expect(claude37.isFree).toBe(false);
      expect(claude37.contextLength).toBe(200000);
    });
  });

  describe('STATIC_BASELINE_MODELS', () => {
    it('contains baseline models for all 7 native providers', () => {
      const providers = ['gemini', 'anthropic', 'openai', 'deepseek', 'openrouter', 'ollama', 'kilo'] as const;
      for (const p of providers) {
        const models = STATIC_BASELINE_MODELS[p];
        expect(models).toBeDefined();
        expect(models.length).toBeGreaterThan(0);
        for (const m of models) {
          expect(m.provider).toBe(p);
          expect(typeof m.isFree).toBe('boolean');
          expect(m.contextLength).toBeGreaterThan(0);
        }
      }
    });
  });
});
