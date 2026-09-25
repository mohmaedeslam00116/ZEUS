/**
 * ProviderSettingsView — Multi-Provider Configuration, Key Management,
 * Test Connection, and Local Auth Import (Ticket #66).
 * Follows ZEUS dark-only token palette, WCAG AA standards, and full RTL layout support.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  Check,
  CheckCircle2,
  Compass,
  Download,
  Eye,
  EyeOff,
  Globe,
  Key,
  Loader2,
  Lock,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { NativeProviderId, ProviderPublicState } from '@shared/types';
import { cn } from '@/renderer/lib/cn';
import { ProviderIcon } from '@/renderer/components/brand/ProviderIcon';
import { useTranslation } from '@/renderer/i18n';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { Toggle } from '../controls';

export interface ProviderMeta {
  id: NativeProviderId;
  name: string;
  description: string;
  defaultBaseUrl: string;
  requiresKey: boolean;
}

export const NATIVE_PROVIDERS_META: ProviderMeta[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'High-speed multimodal intelligence with large context windows and native thinking support.',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    requiresKey: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: 'Direct Anthropic Messages API integration supporting Claude 3.5 & 3.7 Sonnet/Opus.',
    defaultBaseUrl: 'https://api.anthropic.com',
    requiresKey: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Official OpenAI Chat Completions API supporting GPT-4o, o1, and o3-mini.',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresKey: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'High-efficiency open-weight reasoning models (DeepSeek-V3 & DeepSeek-R1).',
    defaultBaseUrl: 'https://api.deepseek.com',
    requiresKey: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Unified AI gateway providing access to hundreds of open-source and commercial models.',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    requiresKey: true,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Local on-device inference running Llama, DeepSeek-R1, and Mistral without telemetry.',
    defaultBaseUrl: 'http://localhost:11434',
    requiresKey: false,
  },
  {
    id: 'kilo',
    name: 'Kilo Gateway',
    description: 'Dedicated low-latency gateway for hosted open-source coding models.',
    defaultBaseUrl: 'https://api.kilo.ai/v1',
    requiresKey: true,
  },
];

export function ProviderSettingsView() {
  const { t, isRTL } = useTranslation();
  const settings = useSettingsStore((s) => s.settings.providers);
  const updateSettings = useSettingsStore((s) => s.update);

  const [states, setStates] = useState<Record<NativeProviderId, ProviderPublicState | undefined>>({} as never);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const loadStates = useCallback(async () => {
    if (!window.zeus?.providers?.getStates) return;
    try {
      const publicStates = await window.zeus.providers.getStates();
      const map: Record<string, ProviderPublicState> = {};
      for (const s of publicStates) {
        map[s.id] = s;
      }
      setStates(map as never);
    } catch {
      // Graceful fallback
    }
  }, []);

  useEffect(() => {
    void loadStates();
  }, [loadStates]);

  const handleSaveKey = async (provider: NativeProviderId) => {
    const rawKey = keyInputs[provider]?.trim();
    if (!rawKey || !window.zeus?.providers?.setApiKey) return;

    try {
      await window.zeus.providers.setApiKey(provider, rawKey);
      setKeyInputs((prev) => ({ ...prev, [provider]: '' }));
      setTestResult((prev) => ({
        ...prev,
        [provider]: { ok: true, message: t('providers.keySaved') },
      }));
      await loadStates();
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [provider]: {
          ok: false,
          message: err instanceof Error ? err.message : 'Failed to save key',
        },
      }));
    }
  };

  const handleRemoveKey = async (provider: NativeProviderId) => {
    if (!window.zeus?.providers?.removeApiKey) return;
    try {
      await window.zeus.providers.removeApiKey(provider);
      setTestResult((prev) => ({
        ...prev,
        [provider]: { ok: true, message: t('providers.keyRemoved') },
      }));
      await loadStates();
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [provider]: {
          ok: false,
          message: err instanceof Error ? err.message : 'Failed to remove key',
        },
      }));
    }
  };

  const handleTestConnection = async (provider: NativeProviderId) => {
    if (!window.zeus?.providers?.testConnection) return;
    setTesting((prev) => ({ ...prev, [provider]: true }));
    setTestResult((prev) => {
      const next = { ...prev };
      delete next[provider];
      return next;
    });

    try {
      const res = await window.zeus.providers.testConnection(provider);
      if (res.ok) {
        setTestResult((prev) => ({
          ...prev,
          [provider]: {
            ok: true,
            message: `${t('providers.connectionSuccess')} (${res.modelCount ?? 0} models available)`,
          },
        }));
      } else {
        setTestResult((prev) => ({
          ...prev,
          [provider]: {
            ok: false,
            message: res.error || t('providers.connectionFailed'),
          },
        }));
      }
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [provider]: {
          ok: false,
          message: err instanceof Error ? err.message : 'Test failed',
        },
      }));
    } finally {
      setTesting((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const handleImportFromTools = async () => {
    if (!window.zeus?.providers?.discoverLocalAuth) return;
    setImporting(true);
    setImportStatus(null);

    try {
      const discovered = await window.zeus.providers.discoverLocalAuth();
      if (!discovered || discovered.length === 0) {
        setImportStatus(t('providers.noCredentialsFound'));
        return;
      }

      let importedCount = 0;
      for (const item of discovered) {
        const imported = await window.zeus.providers.importDiscoveredAuth(item.provider);
        if (imported) importedCount++;
      }

      if (importedCount > 0) {
        setImportStatus(t('providers.importedSuccess') + ` (${importedCount} providers)`);
        await loadStates();
      } else {
        setImportStatus(t('providers.noCredentialsFound'));
      }
    } catch {
      setImportStatus(t('providers.connectionFailed'));
    } finally {
      setImporting(false);
    }
  };

  const updateProviderSetting = (
    provider: NativeProviderId,
    patch: Partial<{ enabled: boolean; baseUrl: string; autoDetectLocalAuth: boolean }>,
  ) => {
    void updateSettings({
      providers: {
        [provider]: patch,
      } as never,
    });
  };

  return (
    <div className="flex flex-col gap-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header Description & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 p-3.5 shadow-xs">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Key size={15} className="text-accent" />
            <h3 className="text-[13px] font-medium text-fg">Native AI Providers</h3>
          </div>
          <p className="text-[12px] text-muted leading-relaxed">
            Configure direct API access for first-party native agent execution. Credentials are saved encrypted with OS SafeStorage.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleImportFromTools()}
            disabled={importing}
            className="flex items-center gap-1.5 rounded-md border border-line bg-elevated px-2.5 py-1.5 text-[11px] font-medium text-fg transition-colors hover:bg-surface hover:text-accent disabled:opacity-50"
          >
            {importing ? (
              <Loader2 size={12} className="animate-spin text-accent" />
            ) : (
              <Download size={12} className="text-muted" />
            )}
            <span>{t('providers.importFromTools')}</span>
          </button>

          <button
            type="button"
            onClick={() => void window.zeus?.models?.refresh?.()}
            title={t('providers.refreshModels')}
            className="flex items-center gap-1.5 rounded-md border border-line bg-elevated px-2.5 py-1.5 text-[11px] font-medium text-fg transition-colors hover:bg-surface disabled:opacity-50"
          >
            <RefreshCw size={12} className="text-muted" />
            <span>{t('providers.refreshModels')}</span>
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {importStatus && (
        <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-[12px] text-fg animate-pop-in">
          <Check size={14} className="text-accent shrink-0" />
          <span>{importStatus}</span>
        </div>
      )}

      {/* Provider Cards */}
      <div className="flex flex-col gap-4">
        {NATIVE_PROVIDERS_META.map((meta) => {
          const state = states[meta.id];
          const providerSettings = settings?.[meta.id];
          const isEnabled = providerSettings?.enabled !== false;
          const isConfigured = state?.keyMetadata.configured ?? false;
          const isTesting = testing[meta.id] ?? false;
          const result = testResult[meta.id];

          return (
            <div
              key={meta.id}
              className={cn(
                'flex flex-col gap-3 rounded-lg border border-line p-4 transition-colors',
                isEnabled ? 'bg-surface shadow-xs' : 'bg-surface/50 opacity-70',
              )}
            >
              {/* Card Header: Icon, Name, Status Badge, and Enabled Switch */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 text-fg">
                    <ProviderIcon provider={meta.id} size={15} />
                  </div>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[13px] text-fg truncate">
                        {meta.name}
                      </span>

                      {/* Status Badges */}
                      {isConfigured ? (
                        state?.keyMetadata.source === 'secret-store' ? (
                          <span className="flex items-center gap-1 rounded bg-success/10 border border-success/30 px-1.5 py-0.2 text-[10px] font-mono text-success">
                            <Lock size={10} />
                            {t('providers.configuredEncrypted')}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 rounded bg-accent/10 border border-accent/30 px-1.5 py-0.2 text-[10px] font-mono text-accent">
                            <Compass size={10} />
                            {t('providers.discoveredFrom', {
                              source: state?.keyMetadata.source || 'tools',
                            })}
                          </span>
                        )
                      ) : !meta.requiresKey ? (
                        <span className="flex items-center gap-1 rounded bg-accent/10 border border-accent/25 px-1.5 py-0.2 text-[10px] font-mono text-accent">
                          {t('providers.localNoKeyRequired')}
                        </span>
                      ) : (
                        <span className="rounded bg-surface-2 border border-line px-1.5 py-0.2 text-[10px] text-muted">
                          {t('providers.notConfigured')}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-muted truncate">{meta.description}</p>
                  </div>
                </div>

                <div className="shrink-0">
                  <Toggle
                    checked={isEnabled}
                    onChange={(checked) => updateProviderSetting(meta.id, { enabled: checked })}
                    aria-label={`Enable ${meta.name}`}
                  />
                </div>
              </div>

              {/* Controls when enabled */}
              {isEnabled && (
                <div className="flex flex-col gap-3 pt-2 border-t border-line/40">
                  {/* API Key Row (if provider uses key) */}
                  {meta.requiresKey && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showKey[meta.id] ? 'text' : 'password'}
                          value={keyInputs[meta.id] ?? ''}
                          onChange={(e) =>
                            setKeyInputs((prev) => ({ ...prev, [meta.id]: e.target.value }))
                          }
                          placeholder={
                            isConfigured
                              ? '••••••••••••••••••••••••••••••••'
                              : `Enter ${meta.name} API Key`
                          }
                          className="h-7 w-full rounded-md border border-line bg-surface-2 px-2.5 pe-8 text-[12px] font-mono text-fg outline-none focus:border-accent transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowKey((prev) => ({ ...prev, [meta.id]: !prev[meta.id] }))
                          }
                          className="absolute end-2 top-1.5 text-muted hover:text-fg transition-colors"
                        >
                          {showKey[meta.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={!keyInputs[meta.id]?.trim()}
                          onClick={() => void handleSaveKey(meta.id)}
                          className="flex items-center gap-1 rounded-md border border-line bg-elevated px-2.5 py-1 text-[11px] font-medium text-fg hover:bg-surface disabled:opacity-40 transition-colors"
                        >
                          <span>{t('providers.saveKey')}</span>
                        </button>

                        {isConfigured && state?.keyMetadata.source === 'secret-store' && (
                          <button
                            type="button"
                            onClick={() => void handleRemoveKey(meta.id)}
                            title={t('providers.removeKey')}
                            className="p-1 rounded-md border border-line bg-elevated text-warning hover:bg-surface transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Base URL Row */}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted w-18 shrink-0">
                      {t('providers.baseUrl')}:
                    </span>
                    <input
                      type="text"
                      value={providerSettings?.baseUrl ?? ''}
                      onChange={(e) =>
                        updateProviderSetting(meta.id, {
                          baseUrl: e.target.value.trim() || undefined,
                        })
                      }
                      placeholder={meta.defaultBaseUrl}
                      className="h-6 flex-1 rounded-md border border-line bg-surface-2 px-2 text-[11px] font-mono text-fg outline-none focus:border-accent transition-colors"
                    />
                  </div>

                  {/* Test Connection Bar & Status */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isTesting}
                        onClick={() => void handleTestConnection(meta.id)}
                        className="flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-muted hover:text-fg hover:bg-elevated disabled:opacity-40 transition-colors"
                      >
                        {isTesting ? (
                          <Loader2 size={11} className="animate-spin text-accent" />
                        ) : (
                          <Globe size={11} />
                        )}
                        <span>
                          {isTesting
                            ? t('providers.testing')
                            : t('providers.testConnection')}
                        </span>
                      </button>
                    </div>

                    {result && (
                      <div
                        className={cn(
                          'flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded border animate-pop-in',
                          result.ok
                            ? 'bg-success/10 text-success border-success/30'
                            : 'bg-danger/10 text-danger border-danger/30',
                        )}
                      >
                        {result.ok ? (
                          <CheckCircle2 size={12} className="shrink-0" />
                        ) : (
                          <XCircle size={12} className="shrink-0" />
                        )}
                        <span className="truncate max-w-[280px]">{result.message}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
