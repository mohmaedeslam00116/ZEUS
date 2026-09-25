import { describe, it, expect, beforeAll } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ModelPicker, formatContextTokens } from './ModelPicker';
import { I18nProvider } from '@/renderer/i18n';

describe('ModelPicker (#66)', () => {
  beforeAll(() => {
    const mockZeus = {
      models: {
        list: async (): Promise<unknown[]> => [],
        refresh: async (): Promise<unknown[]> => [],
      },
      providers: {
        getStates: async (): Promise<unknown[]> => [],
        setApiKey: async (): Promise<void> => undefined,
        removeApiKey: async (): Promise<void> => undefined,
        discoverLocalAuth: async (): Promise<unknown[]> => [],
        importDiscoveredAuth: async (): Promise<boolean> => true,
        testConnection: async () => ({ ok: true, modelCount: 5 }),
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

  describe('formatContextTokens', () => {
    it('formats tokens into human readable metric strings', () => {
      expect(formatContextTokens(undefined)).toBeNull();
      expect(formatContextTokens(0)).toBeNull();
      expect(formatContextTokens(-10)).toBeNull();
      expect(formatContextTokens(500)).toBe('500');
      expect(formatContextTokens(128000)).toBe('128k');
      expect(formatContextTokens(200000)).toBe('200k');
      expect(formatContextTokens(1048576)).toBe('1m');
      expect(formatContextTokens(2097152)).toBe('2.1m');
      expect(formatContextTokens(4000000)).toBe('4m');
    });
  });

  describe('Rendering & Badging', () => {
    it('renders the model trigger button with provider icon and model label', () => {
      const html = renderToString(
        <I18nProvider initialLocale="en">
          <ModelPicker
            value="claude-opus-5"
            onChange={() => undefined}
          />
        </I18nProvider>,
      );

      expect(html).toContain('Opus 5');
      expect(html).toContain('aria-haspopup="listbox"');
      expect(html).toContain('aria-expanded="false"');
    });

    it('renders Free badge when the selected model is free', () => {
      const html = renderToString(
        <I18nProvider initialLocale="en">
          <ModelPicker
            value="gemini:gemini-2.5-flash"
            onChange={() => undefined}
          />
        </I18nProvider>,
      );

      // Model label and Free badge
      expect(html).toContain('gemini:gemini-2.5-flash');
      expect(html).toContain('FREE');
    });

    it('renders in Arabic RTL mode with proper dir="rtl" attribute', () => {
      const html = renderToString(
        <I18nProvider initialLocale="ar" initialLayoutDirection="canvas-rtl">
          <ModelPicker
            value="claude-opus-5"
            onChange={() => undefined}
          />
        </I18nProvider>,
      );

      expect(html).toContain('dir="rtl"');
      expect(html).toContain('Opus 5');
    });

    it('honors disabled prop on trigger button', () => {
      const html = renderToString(
        <I18nProvider initialLocale="en">
          <ModelPicker
            value="claude-opus-5"
            onChange={() => undefined}
            disabled
          />
        </I18nProvider>,
      );

      expect(html).toContain('disabled=""');
    });
  });
});
