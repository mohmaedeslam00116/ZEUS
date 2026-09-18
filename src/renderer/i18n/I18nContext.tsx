import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { AppLayoutDirection, AppLocale } from '@shared/types';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import type { I18nContextValue } from './types';
import { createTranslator } from './translate';
import { en } from './locales/en';
import { ar } from './locales/ar';

const dictionaries = { en, ar };

const defaultTranslator = createTranslator('en', en, en);

const defaultContextValue: I18nContextValue = {
  locale: 'en',
  layoutDirection: 'canvas-rtl',
  isRTL: false,
  t: defaultTranslator,
};

export const I18nContext = createContext<I18nContextValue>(defaultContextValue);

export interface I18nProviderProps {
  children: ReactNode;
  /** Optional override for testing or isolated previews. */
  initialLocale?: AppLocale;
  initialLayoutDirection?: AppLayoutDirection;
}

export function I18nProvider({
  children,
  initialLocale,
  initialLayoutDirection,
}: I18nProviderProps) {
  const inClient = typeof window !== 'undefined';
  const hookLocale = useSettingsStore((s) => s.settings.appearance.locale);
  const hookLayoutDirection = useSettingsStore((s) => s.settings.appearance.layoutDirection);

  const storeLocale = inClient ? hookLocale : useSettingsStore.getState().settings.appearance.locale;
  const storeLayoutDirection = inClient ? hookLayoutDirection : useSettingsStore.getState().settings.appearance.layoutDirection;

  const locale = initialLocale ?? storeLocale ?? 'en';
  const layoutDirection = initialLayoutDirection ?? storeLayoutDirection ?? 'canvas-rtl';
  const isRTL = locale === 'ar';

  const t = useMemo(() => {
    const dict = dictionaries[locale] ?? en;
    return createTranslator(locale, dict, en);
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      layoutDirection,
      isRTL,
      t,
    }),
    [locale, layoutDirection, isRTL, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Hook to access current translation function, active locale, and RTL status.
 */
export function useTranslation(): I18nContextValue {
  return useContext(I18nContext);
}
