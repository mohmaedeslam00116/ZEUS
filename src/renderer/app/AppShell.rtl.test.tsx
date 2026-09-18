import { describe, expect, it, beforeAll } from 'vitest';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '@/renderer/i18n';
import { AppShell } from './AppShell';
import { useLayoutStore } from '@/renderer/stores/useLayoutStore';
import { CodeBlock } from '@/renderer/features/workspace/CodeBlock';
import { TerminalPanel } from '@/renderer/features/terminal/TerminalPanel';

describe('AppShell RTL Layout Architecture (ADR-0011)', () => {
  beforeAll(() => {
    if (typeof window === 'undefined') {
      (globalThis as unknown as { window: unknown }).window = {
        innerWidth: 1024,
        innerHeight: 768,
        addEventListener: () => {
          /* no-op */
        },
        removeEventListener: () => {
          /* no-op */
        },
      };
    }
  });

  it('renders Canvas-Only RTL (default for Arabic) with anchored shell and RTL canvas', () => {
    useLayoutStore.setState((s) => ({
      ...s,
      terminalOpen: true,
    }));

    const html = renderToString(
      <I18nProvider initialLocale="ar" initialLayoutDirection="canvas-rtl">
        <AppShell />
      </I18nProvider>,
    );

    // Root window shell remains dir="ltr" to keep Sessions sidebar on left & Activity rail on right
    expect(html).toContain('dir="ltr" data-layout-direction="canvas-rtl" class="flex h-full w-full flex-col bg-base text-fg"');

    // TitleBar header stays dir="ltr" so window controls remain pinned to the top-right
    expect(html).toContain('<header dir="ltr"');
    expect(html).toContain('<div dir="ltr" class="no-drag flex h-10 items-stretch">');

    // Center workspace canvas container has dir="rtl"
    expect(html).toContain('dir="rtl" class="min-w-0 flex-1"');
  });

  it('renders Full Mirror RTL when layoutDirection is full-rtl', () => {
    useLayoutStore.setState((s) => ({
      ...s,
      terminalOpen: true,
    }));

    const html = renderToString(
      <I18nProvider initialLocale="ar" initialLayoutDirection="full-rtl">
        <AppShell />
      </I18nProvider>,
    );

    // Entire window shell flips to dir="rtl"
    expect(html).toContain('dir="rtl" data-layout-direction="full-rtl" class="flex h-full w-full flex-col bg-base text-fg"');

    // TitleBar header stays dir="ltr" pinning window controls to top-right on Windows
    expect(html).toContain('<header dir="ltr"');
    expect(html).toContain('<div dir="ltr" class="no-drag flex h-10 items-stretch">');

    // Center workspace has dir="rtl"
    expect(html).toContain('dir="rtl" class="min-w-0 flex-1"');
  });

  it('renders standard LTR layout when locale is en', () => {
    const html = renderToString(
      <I18nProvider initialLocale="en" initialLayoutDirection="canvas-rtl">
        <AppShell />
      </I18nProvider>,
    );

    // Root window shell is dir="ltr"
    expect(html).toContain('dir="ltr" data-layout-direction="canvas-rtl" class="flex h-full w-full flex-col bg-base text-fg"');

    // Center workspace is dir="ltr"
    expect(html).toContain('dir="ltr" class="min-w-0 flex-1"');
  });

  it('CodeBlock enforces dir="ltr", code-isolate class, and data-code-block invariant', () => {
    const html = renderToString(
      <CodeBlock code="const greeting = 'مرحبا';" lang="typescript" />,
    );

    expect(html).toContain('dir="ltr"');
    expect(html).toContain('data-code-block="true"');
    expect(html).toContain('code-isolate');
    expect(html).toContain('font-mono');
  });

  it('TerminalPanel enforces dir="ltr" and code-isolate invariant', () => {
    const html = renderToString(<TerminalPanel />);
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('code-isolate');
  });
});
