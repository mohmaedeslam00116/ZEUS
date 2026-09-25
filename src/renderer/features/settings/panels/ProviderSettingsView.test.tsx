import { describe, it, expect, beforeAll } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ProviderSettingsView, NATIVE_PROVIDERS_META } from './ProviderSettingsView';
import { I18nProvider } from '@/renderer/i18n';

describe('ProviderSettingsView (#66)', () => {
  beforeAll(() => {
    const mockZeus = {
      providers: {
        getStates: async (): Promise<unknown[]> => [],
        setApiKey: async (): Promise<void> => undefined,
        removeApiKey: async (): Promise<void> => undefined,
        discoverLocalAuth: async (): Promise<unknown[]> => [],
        importDiscoveredAuth: async (): Promise<boolean> => true,
        testConnection: async () => ({ ok: true, modelCount: 5 }),
      },
      models: {
        list: async (): Promise<unknown[]> => [],
        refresh: async (): Promise<unknown[]> => [],
      },
    };

    (globalThis as unknown as { window: unknown }).window = {
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
      zeus: mockZeus,
    };
  });

  it('renders all 7 native providers in the view', () => {
    const html = renderToString(
      <I18nProvider initialLocale="en">
        <ProviderSettingsView />
      </I18nProvider>,
    );

    expect(html).toContain('Native AI Providers');
    for (const meta of NATIVE_PROVIDERS_META) {
      expect(html).toContain(meta.name);
    }
  });

  it('renders Import from Cline / OpenCode action button and refresh button', () => {
    const html = renderToString(
      <I18nProvider initialLocale="en">
        <ProviderSettingsView />
      </I18nProvider>,
    );

    expect(html).toContain('Import from Cline / OpenCode');
    expect(html).toContain('Refresh Models');
  });

  it('renders Test Connection buttons for enabled providers', () => {
    const html = renderToString(
      <I18nProvider initialLocale="en">
        <ProviderSettingsView />
      </I18nProvider>,
    );

    expect(html).toContain('Test Connection');
  });

  it('renders correctly in Arabic RTL mode with Arabic labels and dir="rtl"', () => {
    const html = renderToString(
      <I18nProvider initialLocale="ar" initialLayoutDirection="canvas-rtl">
        <ProviderSettingsView />
      </I18nProvider>,
    );

    expect(html).toContain('dir="rtl"');
    expect(html).toContain('استيراد من Cline / OpenCode');
    expect(html).toContain('اختبار الاتصال');
    expect(html).toContain('حفظ المفتاح');
  });
});
