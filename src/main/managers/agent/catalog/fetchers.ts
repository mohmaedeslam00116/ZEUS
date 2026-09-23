/**
 * Provider Model Fetchers and Normalization (Spec #61 / #63).
 *
 * Security Invariants:
 * - SEC-18: Outbound fetches use `makeGuardedLookup` to prevent SSRF and DNS rebinding.
 *   Private/loopback IPs are blocked for all remote providers; local Ollama allows private/loopback
 *   but cloud metadata (169.254.169.254) remains unconditionally blocked.
 * - SEC-16: API keys passed in request headers/queries are never logged.
 */
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import type { ModelInfo, NativeProviderId } from '@shared/types';
import { MODEL_CATALOG_LIMITS } from '@shared/constants';
import { makeGuardedLookup } from '../../../net/ssrfGuard';

/**
 * Curated static baseline models used when offline or on first boot before network fetch.
 */
export const STATIC_BASELINE_MODELS: Record<NativeProviderId, ModelInfo[]> = {
  gemini: [
    {
      id: 'gemini:gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      provider: 'gemini',
      isFree: true,
      contextLength: 1048576,
      supportsThinking: true,
      supportsTools: true,
      description: 'Next-generation lightweight, multimodal workhorse model with thinking.',
    },
    {
      id: 'gemini:gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      provider: 'gemini',
      isFree: true,
      contextLength: 1048576,
      supportsThinking: false,
      supportsTools: true,
      description: 'High-speed multimodal flagship for agentic workflows.',
    },
    {
      id: 'gemini:gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      provider: 'gemini',
      isFree: false,
      contextLength: 2097152,
      supportsThinking: true,
      supportsTools: true,
      description: 'State-of-the-art coding and complex reasoning model.',
    },
  ],
  anthropic: [
    {
      id: 'anthropic:claude-3-7-sonnet',
      name: 'Claude 3.7 Sonnet',
      provider: 'anthropic',
      isFree: false,
      contextLength: 200000,
      supportsThinking: true,
      supportsTools: true,
      description: 'Hybrid reasoning and standard agent model by Anthropic.',
    },
    {
      id: 'anthropic:claude-3-5-sonnet',
      name: 'Claude 3.5 Sonnet',
      provider: 'anthropic',
      isFree: false,
      contextLength: 200000,
      supportsThinking: false,
      supportsTools: true,
      description: 'Industry benchmark coding agent model.',
    },
    {
      id: 'anthropic:claude-3-5-haiku',
      name: 'Claude 3.5 Haiku',
      provider: 'anthropic',
      isFree: false,
      contextLength: 200000,
      supportsThinking: false,
      supportsTools: true,
      description: 'Ultra-fast lightweight coding model.',
    },
  ],
  openai: [
    {
      id: 'openai:gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      isFree: false,
      contextLength: 128000,
      supportsThinking: false,
      supportsTools: true,
      description: 'High-intelligence multimodal flagship by OpenAI.',
    },
    {
      id: 'openai:gpt-4o-mini',
      name: 'GPT-4o Mini',
      provider: 'openai',
      isFree: false,
      contextLength: 128000,
      supportsThinking: false,
      supportsTools: true,
      description: 'Fast, cost-efficient model for focused coding tasks.',
    },
    {
      id: 'openai:o1',
      name: 'o1',
      provider: 'openai',
      isFree: false,
      contextLength: 200000,
      supportsThinking: true,
      supportsTools: true,
      description: 'Advanced reasoning model for complex STEM and architecture problems.',
    },
    {
      id: 'openai:o3-mini',
      name: 'o3-mini',
      provider: 'openai',
      isFree: false,
      contextLength: 200000,
      supportsThinking: true,
      supportsTools: true,
      description: 'High-speed reasoning model specialized in coding and STEM.',
    },
  ],
  deepseek: [
    {
      id: 'deepseek:deepseek-chat',
      name: 'DeepSeek V3 (Chat)',
      provider: 'deepseek',
      isFree: false,
      contextLength: 64000,
      supportsThinking: false,
      supportsTools: true,
      description: 'High-performance open-weights general & coding model.',
    },
    {
      id: 'deepseek:deepseek-reasoner',
      name: 'DeepSeek R1 (Reasoner)',
      provider: 'deepseek',
      isFree: false,
      contextLength: 64000,
      supportsThinking: true,
      supportsTools: false,
      description: 'State-of-the-art open reasoning model with chain-of-thought.',
    },
  ],
  openrouter: [
    {
      id: 'openrouter:meta-llama/llama-3.3-70b-instruct:free',
      name: 'Llama 3.3 70B Instruct (free)',
      provider: 'openrouter',
      isFree: true,
      contextLength: 131072,
      supportsThinking: false,
      supportsTools: true,
      description: 'OpenRouter zero-cost tier for Llama 3.3 70B.',
    },
    {
      id: 'openrouter:deepseek/deepseek-r1:free',
      name: 'DeepSeek R1 (free)',
      provider: 'openrouter',
      isFree: true,
      contextLength: 64000,
      supportsThinking: true,
      supportsTools: false,
      description: 'OpenRouter zero-cost tier for DeepSeek R1 reasoning.',
    },
    {
      id: 'openrouter:anthropic/claude-3.7-sonnet',
      name: 'Claude 3.7 Sonnet (via OpenRouter)',
      provider: 'openrouter',
      isFree: false,
      contextLength: 200000,
      supportsThinking: true,
      supportsTools: true,
      description: 'Claude 3.7 Sonnet served through OpenRouter gateway.',
    },
  ],
  ollama: [
    {
      id: 'ollama:llama3.2:latest',
      name: 'llama3.2:latest',
      provider: 'ollama',
      isFree: true,
      contextLength: 32768,
      supportsThinking: false,
      supportsTools: true,
      description: 'Local Llama 3.2 running via Ollama.',
    },
    {
      id: 'ollama:deepseek-r1:latest',
      name: 'deepseek-r1:latest',
      provider: 'ollama',
      isFree: true,
      contextLength: 32768,
      supportsThinking: true,
      supportsTools: false,
      description: 'Local DeepSeek R1 reasoning model running via Ollama.',
    },
    {
      id: 'ollama:qwen2.5-coder:latest',
      name: 'qwen2.5-coder:latest',
      provider: 'ollama',
      isFree: true,
      contextLength: 32768,
      supportsThinking: false,
      supportsTools: true,
      description: 'Local Qwen 2.5 Coder specialized coding model.',
    },
  ],
  kilo: [
    {
      id: 'kilo:kilo-router-auto',
      name: 'Kilo Router (Auto)',
      provider: 'kilo',
      isFree: false,
      contextLength: 128000,
      supportsThinking: true,
      supportsTools: true,
      description: 'Intelligent cost/speed router by Kilo Gateway.',
    },
  ],
};

/**
 * Normalization helpers
 */

export function normalizeOpenRouterModel(raw: {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string | number; completion?: string | number };
  supported_parameters?: string[];
  description?: string;
}): ModelInfo {
  const isFreeSuffix = raw.id.endsWith(':free');
  const zeroPricing =
    raw.pricing &&
    Number(raw.pricing.prompt ?? 1) === 0 &&
    Number(raw.pricing.completion ?? 1) === 0;

  const isFree = isFreeSuffix || Boolean(zeroPricing);
  const lowerId = raw.id.toLowerCase();
  const lowerName = (raw.name || '').toLowerCase();

  const supportsThinking =
    lowerId.includes('r1') ||
    lowerId.includes('o1') ||
    lowerId.includes('o3') ||
    lowerId.includes('thinking') ||
    lowerId.includes('reasoner') ||
    lowerId.includes('qwq') ||
    lowerName.includes('reasoner') ||
    lowerName.includes('thinking');

  const supportsTools =
    Boolean(raw.supported_parameters?.includes('tools')) ||
    Boolean(raw.supported_parameters?.includes('function_call')) ||
    (!supportsThinking &&
      (lowerId.includes('gpt') ||
        lowerId.includes('claude') ||
        lowerId.includes('gemini') ||
        lowerId.includes('llama') ||
        lowerId.includes('qwen')));

  return {
    id: `openrouter:${raw.id}`,
    name: raw.name || raw.id,
    provider: 'openrouter',
    isFree,
    contextLength: raw.context_length || 4096,
    contextWindow: raw.context_length || 4096,
    supportsThinking,
    supportsReasoning: supportsThinking,
    supportsTools,
    supportsVision: lowerId.includes('vision') || lowerId.includes('vl') || lowerName.includes('vision'),
    pricing: raw.pricing
      ? {
          prompt: Number(raw.pricing.prompt ?? 0),
          completion: Number(raw.pricing.completion ?? 0),
        }
      : undefined,
    description: raw.description,
  };
}

export function normalizeGeminiModel(raw: {
  name: string;
  displayName?: string;
  inputTokenLimit?: number;
  supportedGenerationMethods?: string[];
  description?: string;
}): ModelInfo {
  const cleanId = raw.name.replace(/^models\//, '');
  const lowerId = cleanId.toLowerCase();

  const isFree =
    lowerId.includes('flash') ||
    lowerId.includes('gemini-2.0-flash') ||
    lowerId.includes('gemini-1.5-flash') ||
    lowerId.includes('gemini-2.5-flash');

  const supportsThinking = lowerId.includes('thinking') || lowerId.includes('2.5');
  const supportsTools = raw.supportedGenerationMethods?.includes('generateContent') ?? true;

  return {
    id: `gemini:${cleanId}`,
    name: raw.displayName || cleanId,
    provider: 'gemini',
    isFree,
    contextLength: raw.inputTokenLimit || 1048576,
    contextWindow: raw.inputTokenLimit || 1048576,
    supportsThinking,
    supportsReasoning: supportsThinking,
    supportsTools,
    supportsVision: true,
    description: raw.description,
  };
}

export function normalizeOllamaModel(raw: {
  name: string;
  model?: string;
  details?: { family?: string; parameter_size?: string };
}): ModelInfo {
  const lowerName = raw.name.toLowerCase();
  const supportsThinking =
    lowerName.includes('r1') ||
    lowerName.includes('reasoner') ||
    lowerName.includes('qwq');

  return {
    id: `ollama:${raw.name}`,
    name: raw.name,
    provider: 'ollama',
    isFree: true, // Local Ollama models have zero API cost
    contextLength: 32768,
    contextWindow: 32768,
    supportsThinking,
    supportsReasoning: supportsThinking,
    supportsTools: !supportsThinking,
    supportsVision: lowerName.includes('llava') || lowerName.includes('vision'),
    description: raw.details?.family ? `Family: ${raw.details.family} (${raw.details.parameter_size || ''})` : undefined,
  };
}

export function normalizeOpenAIModel(raw: { id: string }): ModelInfo | null {
  const lowerId = raw.id.toLowerCase();
  // Filter out non-chat models
  if (
    lowerId.includes('whisper') ||
    lowerId.includes('embedding') ||
    lowerId.includes('dall-e') ||
    lowerId.includes('tts') ||
    lowerId.includes('babbage') ||
    lowerId.includes('davinci') ||
    lowerId.includes('moderation') ||
    lowerId.includes('audio') ||
    lowerId.includes('realtime')
  ) {
    return null;
  }

  const supportsThinking = lowerId.startsWith('o1') || lowerId.startsWith('o3');
  const contextLength = supportsThinking ? 200000 : 128000;

  return {
    id: `openai:${raw.id}`,
    name: raw.id,
    provider: 'openai',
    isFree: false,
    contextLength,
    contextWindow: contextLength,
    supportsThinking,
    supportsReasoning: supportsThinking,
    supportsTools: true,
    supportsVision: lowerId.includes('gpt-4o') || lowerId.includes('vision'),
  };
}

export function normalizeDeepSeekModel(raw: { id: string }): ModelInfo {
  const isReasoner = raw.id.includes('reasoner');
  return {
    id: `deepseek:${raw.id}`,
    name: isReasoner ? 'DeepSeek R1 (Reasoner)' : 'DeepSeek V3 (Chat)',
    provider: 'deepseek',
    isFree: false,
    contextLength: 64000,
    contextWindow: 64000,
    supportsThinking: isReasoner,
    supportsReasoning: isReasoner,
    supportsTools: !isReasoner,
    supportsVision: raw.id.includes('vl'),
  };
}

export function normalizeAnthropicModel(raw: { id: string; display_name?: string }): ModelInfo {
  const lowerId = raw.id.toLowerCase();
  const supportsThinking = lowerId.includes('3-7') || lowerId.includes('3.7');
  return {
    id: `anthropic:${raw.id}`,
    name: raw.display_name || raw.id,
    provider: 'anthropic',
    isFree: false,
    contextLength: 200000,
    contextWindow: 200000,
    supportsThinking,
    supportsReasoning: supportsThinking,
    supportsTools: true,
    supportsVision: true,
  };
}

/**
 * SSRF-Guarded HTTP/HTTPS GET JSON requester (SEC-18).
 */
export async function guardedGetJson<T>(
  targetUrl: string,
  options: {
    headers?: Record<string, string>;
    allowPrivate?: boolean;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const url = new URL(targetUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error('URL must not contain embedded credentials');
  }

  const mod = url.protocol === 'https:' ? https : http;
  const timeoutMs = options.timeoutMs || MODEL_CATALOG_LIMITS.fetchTimeoutMs;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const req = mod.request(
      url,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'user-agent': 'ZEUS-Desktop-Agent',
          ...options.headers,
        },
        lookup: makeGuardedLookup({ allowPrivate: options.allowPrivate }),
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          settled = true;
          return reject(new Error(`HTTP ${res.statusCode} from ${url.hostname}`));
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (c: Buffer) => {
          if (settled) return;
          total += c.length;
          // Guard against memory exhaustion
          if (total > 10 * 1024 * 1024) {
            settled = true;
            req.destroy(new Error('Response payload exceeds maximum allowed size (10MB)'));
            return reject(new Error('Response payload too large'));
          }
          chunks.push(c);
        });
        res.on('end', () => {
          if (settled) return;
          settled = true;
          try {
            const raw = Buffer.concat(chunks).toString('utf8');
            const data = JSON.parse(raw);
            resolve(data as T);
          } catch (err) {
            reject(new Error(`Failed to parse response JSON: ${err instanceof Error ? err.message : String(err)}`));
          }
        });
      },
    );

    req.on('timeout', () => {
      if (settled) return;
      settled = true;
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    req.end();
  });
}

/**
 * Fetch models for a given native provider.
 */
export async function fetchModelsForProvider(
  provider: NativeProviderId,
  config: { apiKey?: string; baseUrl?: string },
): Promise<ModelInfo[]> {
  switch (provider) {
    case 'openrouter': {
      const headers: Record<string, string> = {};
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
      const data = await guardedGetJson<{ data: unknown[] }>(
        'https://openrouter.ai/api/v1/models',
        { headers },
      );
      if (!Array.isArray(data.data)) return [];
      return data.data
        .map((m) => normalizeOpenRouterModel(m as Parameters<typeof normalizeOpenRouterModel>[0]))
        .slice(0, MODEL_CATALOG_LIMITS.maxModelsPerProvider);
    }

    case 'gemini': {
      if (!config.apiKey) {
        throw new Error('Gemini API key is required to query models');
      }
      const url = 'https://generativelanguage.googleapis.com/v1beta/models';
      const headers = { 'x-goog-api-key': config.apiKey };
      const data = await guardedGetJson<{ models: Array<{ name: string; supportedGenerationMethods?: string[] }> }>(
        url,
        { headers },
      );
      if (!Array.isArray(data.models)) return [];
      return data.models
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => normalizeGeminiModel(m as Parameters<typeof normalizeGeminiModel>[0]))
        .slice(0, MODEL_CATALOG_LIMITS.maxModelsPerProvider);
    }

    case 'ollama': {
      const baseUrl = config.baseUrl || 'http://localhost:11434';
      const url = `${baseUrl.replace(/\/+$/, '')}/api/tags`;
      const data = await guardedGetJson<{ models: unknown[] }>(url, {
        allowPrivate: true, // Ollama is local
      });
      if (!Array.isArray(data.models)) return [];
      return data.models
        .map((m) => normalizeOllamaModel(m as Parameters<typeof normalizeOllamaModel>[0]))
        .slice(0, MODEL_CATALOG_LIMITS.maxModelsPerProvider);
    }

    case 'openai': {
      const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
      const url = `${baseUrl.replace(/\/+$/, '')}/models`;
      const headers: Record<string, string> = {};
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
      const data = await guardedGetJson<{ data: Array<{ id: string }> }>(url, { headers });
      if (!Array.isArray(data.data)) return [];
      const models: ModelInfo[] = [];
      for (const item of data.data) {
        const norm = normalizeOpenAIModel(item);
        if (norm) models.push(norm);
      }
      return models.slice(0, MODEL_CATALOG_LIMITS.maxModelsPerProvider);
    }

    case 'deepseek': {
      const baseUrl = config.baseUrl || 'https://api.deepseek.com';
      const url = `${baseUrl.replace(/\/+$/, '')}/models`;
      const headers: Record<string, string> = {};
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
      const data = await guardedGetJson<{ data: Array<{ id: string }> }>(url, { headers });
      if (!Array.isArray(data.data)) return [];
      return data.data
        .map((item) => normalizeDeepSeekModel(item))
        .slice(0, MODEL_CATALOG_LIMITS.maxModelsPerProvider);
    }

    case 'anthropic': {
      if (!config.apiKey) {
        throw new Error('Anthropic API key is required to query models');
      }
      const url = 'https://api.anthropic.com/v1/models';
      const headers = {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      };
      const data = await guardedGetJson<{ data: Array<{ id: string; display_name?: string }> }>(url, { headers });
      if (!Array.isArray(data.data)) return [];
      return data.data
        .map((item) => normalizeAnthropicModel(item))
        .slice(0, MODEL_CATALOG_LIMITS.maxModelsPerProvider);
    }

    case 'kilo': {
      const baseUrl = config.baseUrl || 'https://api.kilo.ai/v1';
      const url = `${baseUrl.replace(/\/+$/, '')}/models`;
      const headers: Record<string, string> = {};
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
      const data = await guardedGetJson<{ data: Array<{ id: string }> }>(url, { headers });
      if (!Array.isArray(data.data)) return [];
      return data.data.map((item) => ({
        id: `kilo:${item.id}`,
        name: item.id,
        provider: 'kilo' as NativeProviderId,
        isFree: item.id.includes('free'),
        contextLength: 128000,
        contextWindow: 128000,
        supportsThinking: item.id.includes('r1') || item.id.includes('reasoner'),
        supportsReasoning: item.id.includes('r1') || item.id.includes('reasoner'),
        supportsTools: true,
        supportsVision: false,
      }));
    }
  }
}
