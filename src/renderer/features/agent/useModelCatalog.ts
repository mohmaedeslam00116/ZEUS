/**
 * Hook to retrieve and merge dynamic and static models across all providers (Ticket #66).
 * Loads live/cached models from `window.zeus.models.list()`, enriched with free/paid status,
 * context sizes, and reasoning capabilities, merged with static and discovered Cursor/CLI models.
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import type { AgentProvider } from '@shared/constants';
import { AGENT_MODELS } from '@shared/constants';
import type { ModelInfo, NativeProviderId } from '@shared/types';
import { useAgentStore } from '@/renderer/stores/useAgentStore';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';

export interface ExtendedModelOption {
  value: string;
  label: string;
  provider: AgentProvider | NativeProviderId;
  providerLabel: string;
  isFree: boolean;
  contextWindow?: number;
  supportsThinking?: boolean;
  supportsTools?: boolean;
  description?: string;
}

export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  gemini: 'Google Gemini',
  anthropic: 'Anthropic Claude',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter',
  ollama: 'Ollama (Local)',
  kilo: 'Kilo Gateway',
  cursor: 'Cursor',
  'claude-code': 'Claude Code',
  codex: 'Codex CLI',
  cline: 'Cline ACP',
  opencode: 'OpenCode ACP',
  pi: 'Pi',
  native: 'Native Agent',
};

export function useModelCatalog(): {
  models: ExtendedModelOption[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [dynamicModels, setDynamicModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const discoveredLive = useAgentStore((s) => s.cursorAuth?.models);
  const discoveredPersisted = useSettingsStore((s) => s.settings.agent.cursor.discoveredModels);

  const fetchCatalog = useCallback(async (forceRefresh = false) => {
    if (!window.zeus?.models?.list) return;
    setLoading(true);
    try {
      const list = forceRefresh
        ? await window.zeus.models.refresh()
        : await window.zeus.models.list();
      if (Array.isArray(list) && list.length > 0) {
        setDynamicModels(list);
      }
    } catch {
      // Graceful fallback to static list
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCatalog(false);
  }, [fetchCatalog]);

  const models = useMemo(() => {
    const list: ExtendedModelOption[] = [];
    const seen = new Set<string>();

    // 1. Dynamic Models from Native Catalog
    for (const m of dynamicModels) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        list.push({
          value: m.id,
          label: m.name || m.id,
          provider: m.provider,
          providerLabel: PROVIDER_DISPLAY_NAMES[m.provider] || m.provider,
          isFree: Boolean(m.isFree),
          contextWindow: m.contextWindow || (m as { contextLength?: number }).contextLength,
          supportsThinking:
            m.supportsReasoning || (m as { supportsThinking?: boolean }).supportsThinking,
          supportsTools: m.supportsTools,
          description: m.description,
        });
      }
    }

    // 2. Static Curated Models
    for (const m of AGENT_MODELS) {
      if (!seen.has(m.value)) {
        seen.add(m.value);
        list.push({
          value: m.value,
          label: m.label,
          provider: m.provider,
          providerLabel: PROVIDER_DISPLAY_NAMES[m.provider] || m.provider,
          isFree: false,
          contextWindow: undefined,
          supportsThinking: false,
          supportsTools: true,
        });
      }
    }

    // 3. Discovered Cursor Models
    const cursorIds = new Set([...(discoveredLive ?? []), ...(discoveredPersisted ?? [])]);
    for (const id of cursorIds) {
      if (!seen.has(id)) {
        seen.add(id);
        list.push({
          value: id,
          label: id,
          provider: 'cursor',
          providerLabel: PROVIDER_DISPLAY_NAMES.cursor,
          isFree: false,
          supportsTools: true,
        });
      }
    }

    return list;
  }, [dynamicModels, discoveredLive, discoveredPersisted]);

  return {
    models,
    loading,
    refresh: () => fetchCatalog(true),
  };
}
