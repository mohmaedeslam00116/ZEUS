import type { AppLocale } from '@shared/types';
import type { TranslationDictionary, TranslationParams } from './types';

const hasOwn = Object.prototype.hasOwnProperty;

/**
 * Replaces `{paramName}` placeholders in a string with their stringified values.
 * Uses hasOwnProperty guard to protect against prototype pollution (SEC-07).
 */
export function interpolate(text: string, params?: TranslationParams): string {
  if (!params) return text;
  return text.replace(/\{([a-zA-Z0-9_-]+)\}/g, (match, key: string) => {
    return hasOwn.call(params, key) ? String(params[key]) : match;
  });
}

function safeLookup(dict: TranslationDictionary, section: string, subKey?: string): string | undefined {
  const container = dict[section];
  if (!container) return undefined;
  const val = subKey ? container[subKey] : (container as unknown);
  return typeof val === 'string' ? val : undefined;
}

const isDev = typeof process !== 'undefined' ? process.env?.NODE_ENV !== 'production' : true;

/**
 * Pure translation factory.
 * Resolves dotted keys (e.g. `'common.save'`) from the active dictionary,
 * falling back to the English fallback dictionary if missing,
 * and falling back to the raw key string if missing from both.
 */
export function createTranslator(
  locale: AppLocale,
  dict: TranslationDictionary,
  fallbackDict: TranslationDictionary,
): (key: string, params?: TranslationParams) => string {
  return (key: string, params?: TranslationParams): string => {
    const dotIndex = key.indexOf('.');
    const section = dotIndex !== -1 ? key.slice(0, dotIndex) : key;
    const subKey = dotIndex !== -1 ? key.slice(dotIndex + 1) : undefined;

    let value = safeLookup(dict, section, subKey);
    if (value === undefined && dict !== fallbackDict) {
      if (isDev) {
        console.warn(`[i18n] Missing translation for key: "${key}" in locale "${locale}", falling back to English`);
      }
      value = safeLookup(fallbackDict, section, subKey);
    }

    if (value === undefined) {
      if (isDev) {
        console.warn(`[i18n] Missing translation for key: "${key}" in all dictionaries`);
      }
      return key;
    }

    return interpolate(value, params);
  };
}
