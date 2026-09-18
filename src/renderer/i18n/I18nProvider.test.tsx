import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { I18nProvider, useTranslation } from './index';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';

function TestConsumer() {
  const { t, locale, layoutDirection, isRTL } = useTranslation();
  return (
    <div
      data-locale={locale}
      data-direction={layoutDirection}
      data-rtl={String(isRTL)}
    >
      <span id="title">{t('sessions.title')}</span>
      <span id="close">{t('common.close')}</span>
    </div>
  );
}

describe('I18nProvider React integration', () => {
  it('renders default English translations and LTR attributes', () => {
    const html = renderToString(
      <I18nProvider initialLocale="en" initialLayoutDirection="canvas-rtl">
        <TestConsumer />
      </I18nProvider>,
    );
    expect(html).toContain('data-locale="en"');
    expect(html).toContain('data-direction="canvas-rtl"');
    expect(html).toContain('data-rtl="false"');
    expect(html).toContain('>Sessions<');
    expect(html).toContain('>Close<');
  });

  it('renders Arabic translations and RTL attributes when initialLocale is ar', () => {
    const html = renderToString(
      <I18nProvider initialLocale="ar" initialLayoutDirection="canvas-rtl">
        <TestConsumer />
      </I18nProvider>,
    );
    expect(html).toContain('data-locale="ar"');
    expect(html).toContain('data-direction="canvas-rtl"');
    expect(html).toContain('data-rtl="true"');
    expect(html).toContain('>الجلسات<');
    expect(html).toContain('>إغلاق<');
  });

  it('syncs with useSettingsStore when props are not explicitly provided', () => {
    // Set store state to Arabic
    useSettingsStore.setState((s) => ({
      ...s,
      settings: {
        ...s.settings,
        appearance: {
          ...s.settings.appearance,
          locale: 'ar',
          layoutDirection: 'full-rtl',
        },
      },
    }));

    const html = renderToString(
      <I18nProvider>
        <TestConsumer />
      </I18nProvider>,
    );
    expect(html).toContain('data-locale="ar"');
    expect(html).toContain('data-direction="full-rtl"');
    expect(html).toContain('data-rtl="true"');
    expect(html).toContain('>الجلسات<');

    // Reset store state back to English
    useSettingsStore.setState((s) => ({
      ...s,
      settings: {
        ...s.settings,
        appearance: {
          ...s.settings.appearance,
          locale: 'en',
          layoutDirection: 'canvas-rtl',
        },
      },
    }));
  });
});
