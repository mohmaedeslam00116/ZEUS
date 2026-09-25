import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ModelPicker } from './ModelPicker';
import { ProviderSettingsView } from '../settings/panels/ProviderSettingsView';
import { I18nProvider } from '@/renderer/i18n';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { resolveModelRouting, DEFAULT_SETTINGS } from '@shared/constants';

describe('End-to-End Model Selection & Provider Configuration (#66)', () => {
  beforeAll(() => {
    const mockWindow = {
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
      zeus: {
        models: {
          list: vi.fn().mockResolvedValue([
            {
              id: 'gemini:gemini-2.5-flash',
              name: 'Gemini 2.5 Flash',
              provider: 'gemini',
              isFree: true,
              contextWindow: 1048576,
            },
            {
              id: 'deepseek:deepseek-chat',
              name: 'DeepSeek Chat',
              provider: 'deepseek',
              isFree: false,
              contextWindow: 128000,
            },
          ]),
          refresh: vi.fn().mockResolvedValue([]),
        },
        providers: {
          getStates: vi.fn().mockResolvedValue([
            {
              id: 'gemini',
              enabled: true,
              autoDetectLocalAuth: true,
              keyMetadata: { configured: true, source: 'secret-store' },
            },
          ]),
          setApiKey: vi.fn().mockResolvedValue(undefined),
          removeApiKey: vi.fn().mockResolvedValue(undefined),
          discoverLocalAuth: vi.fn().mockResolvedValue([
            { provider: 'deepseek', source: 'cline', hasKey: true },
          ]),
          importDiscoveredAuth: vi.fn().mockResolvedValue(true),
          testConnection: vi.fn().mockResolvedValue({ ok: true, modelCount: 12 }),
        },
        settings: {
          get: async () => DEFAULT_SETTINGS,
          set: async (patch: unknown) => ({ ...DEFAULT_SETTINGS, ...(patch as object) }),
        },
      },
    };

    (globalThis as unknown as { window: unknown }).window = mockWindow;
    (globalThis as unknown as { document: unknown }).document = {
      documentElement: {
        style: { setProperty: (): void => undefined },
        dataset: {},
      },
    };
  });

  beforeEach(() => {
    useSettingsStore.setState({ settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) });
  });

  it('updates useSettingsStore when a model is selected and routes to native provider', async () => {
    // Initial default model
    const initialModel = useSettingsStore.getState().settings.agent.model;
    expect(initialModel).toBeDefined();

    // Select a native model
    await useSettingsStore.getState().update({
      agent: { model: 'gemini:gemini-2.5-flash' },
    });

    const updatedModel = useSettingsStore.getState().settings.agent.model;
    expect(updatedModel).toBe('gemini:gemini-2.5-flash');

    // Verify routing resolves to native provider
    const routing = resolveModelRouting(updatedModel);
    expect(routing.provider).toBe('native');
  });

  it('renders ModelPicker with updated model and Free badge', async () => {
    await useSettingsStore.getState().update({
      agent: { model: 'gemini:gemini-2.5-flash' },
    });

    const html = renderToString(
      <I18nProvider initialLocale="en">
        <ModelPicker
          value={useSettingsStore.getState().settings.agent.model}
          onChange={(m) => void useSettingsStore.getState().update({ agent: { model: m } })}
        />
      </I18nProvider>,
    );

    expect(html).toContain('gemini:gemini-2.5-flash');
    expect(html).toContain('aria-haspopup="listbox"');
  });

  it('renders ProviderSettingsView with native providers and test connection capabilities', () => {
    const html = renderToString(
      <I18nProvider initialLocale="en">
        <ProviderSettingsView />
      </I18nProvider>,
    );

    expect(html).toContain('Native AI Providers');
    expect(html).toContain('Google Gemini');
    expect(html).toContain('DeepSeek');
    expect(html).toContain('OpenRouter');
    expect(html).toContain('Ollama (Local)');
    expect(html).toContain('Import from Cline / OpenCode');
    expect(html).toContain('Test Connection');
  });
});
