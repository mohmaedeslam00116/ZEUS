import { describe, expect, it, vi } from 'vitest';
import { createTranslator, interpolate } from './translate';
import { en } from './locales/en';
import { ar } from './locales/ar';

describe('i18n — interpolate', () => {
  it('replaces tokens enclosed in curly braces', () => {
    expect(interpolate('Hello, {name}!', { name: 'Zeus' })).toBe('Hello, Zeus!');
    expect(interpolate('{count} files changed in {ms}ms', { count: 5, ms: 120 })).toBe('5 files changed in 120ms');
  });

  it('leaves unsupplied tokens intact or handles empty params', () => {
    expect(interpolate('Hello, {name}!')).toBe('Hello, {name}!');
    expect(interpolate('Plain string', { foo: 'bar' })).toBe('Plain string');
  });
});

describe('i18n — createTranslator & dictionary resolution', () => {
  it('translates existing keys in English', () => {
    const tEn = createTranslator('en', en, en);
    expect(tEn('common.save')).toBe('Save');
    expect(tEn('common.cancel')).toBe('Cancel');
    expect(tEn('sessions.newSession')).toBe('New session');
  });

  it('translates existing keys in Arabic', () => {
    const tAr = createTranslator('ar', ar, en);
    expect(tAr('common.save')).toBe('حفظ');
    expect(tAr('common.cancel')).toBe('إلغاء');
    expect(tAr('sessions.newSession')).toBe('جلسة جديدة');
  });

  it('falls back to English when a key is missing in Arabic dictionary and logs dev warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* no-op */
    });
    const partialAr = {
      common: {
        save: 'حفظ',
      },
    };
    const t = createTranslator('ar', partialAr, en);
    // Key exists in Arabic:
    expect(t('common.save')).toBe('حفظ');
    expect(warnSpy).not.toHaveBeenCalled();

    // Key missing in Arabic, present in English:
    expect(t('common.cancel')).toBe('Cancel');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing translation for key: "common.cancel" in locale "ar"'),
    );
    expect(t('sessions.newSession')).toBe('New session');
    warnSpy.mockRestore();
  });

  it('falls back to raw key name when key is missing in both dictionaries', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* no-op */
    });
    const t = createTranslator('ar', ar, en);
    expect(t('nonexistent.key.name')).toBe('nonexistent.key.name');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing translation for key: "nonexistent.key.name" in all dictionaries'),
    );
    warnSpy.mockRestore();
  });

  it('safely handles non-dotted or section-only key lookups without throwing', () => {
    const t = createTranslator('en', en, en);
    expect(t('common')).toBe('common');
    expect(t('sessions')).toBe('sessions');
  });

  it('safely guards against prototype pollution in interpolate (SEC-07)', () => {
    const polluted = Object.create({ inherited: 'evil' });
    polluted.valid = 'good';

    expect(interpolate('Test {valid} and {inherited}', polluted)).toBe('Test good and {inherited}');
  });

  it('interpolates parameters in translated strings', () => {
    const customEn = {
      test: {
        greeting: 'Hello, {user}!',
      },
    };
    const customAr = {
      test: {
        greeting: 'مرحباً، {user}!',
      },
    };
    const tEn = createTranslator('en', customEn, customEn);
    const tAr = createTranslator('ar', customAr, customEn);

    expect(tEn('test.greeting', { user: 'Alice' })).toBe('Hello, Alice!');
    expect(tAr('test.greeting', { user: 'أحمد' })).toBe('مرحباً، أحمد!');
  });
});

describe('i18n — catalog completeness & parity', () => {
  const enDict = en as Record<string, Record<string, string>>;
  const arDict = ar as Record<string, Record<string, string>>;

  it('en and ar dictionaries have matching top-level sections', () => {
    const enSections = Object.keys(enDict).sort();
    const arSections = Object.keys(arDict).sort();
    expect(arSections).toEqual(enSections);
  });

  it('every key in en exists in ar with a non-empty string', () => {
    for (const [section, entries] of Object.entries(enDict)) {
      expect(arDict[section]).toBeDefined();
      for (const [key, value] of Object.entries(entries)) {
        expect(typeof value).toBe('string');
        expect(value.trim().length).toBeGreaterThan(0);

        const arValue = arDict[section]?.[key];
        expect(arValue, `Missing Arabic translation for "${section}.${key}"`).toBeDefined();
        expect(typeof arValue).toBe('string');
        expect(arValue?.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('every key in ar exists in en with a non-empty string', () => {
    for (const [section, entries] of Object.entries(arDict)) {
      expect(enDict[section]).toBeDefined();
      for (const key of Object.keys(entries)) {
        const enValue = enDict[section]?.[key];
        expect(enValue, `Extraneous Arabic key without English equivalent: "${section}.${key}"`).toBeDefined();
        expect(typeof enValue).toBe('string');
        expect(enValue?.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

