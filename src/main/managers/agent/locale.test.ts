import { describe, expect, it } from 'vitest';
import {
  ARABIC_CHAR_PATTERN,
  ARABIC_LOCALE_INSTRUCTION,
  COMMIT_SYSTEM_PROMPT,
  resolveArabicLocaleGuidance,
} from './locale';

describe('resolveArabicLocaleGuidance (#54)', () => {
  const AR_PROMPT = 'اشرح لي كيفية عمل هذا الكود بالتفصيل';
  const EN_PROMPT = 'Explain how this function works in detail';
  const MIXED_PROMPT = 'Please review this function: دالة المعالجة';

  describe('all permutations of guidance and locale', () => {
    // 1. follow-ui
    it('follow-ui: active on ar locale with both Arabic and English prompts', () => {
      expect(resolveArabicLocaleGuidance('follow-ui', 'ar', AR_PROMPT)).toBe(ARABIC_LOCALE_INSTRUCTION);
      expect(resolveArabicLocaleGuidance('follow-ui', 'ar', EN_PROMPT)).toBe(ARABIC_LOCALE_INSTRUCTION);
    });

    it('follow-ui: inactive on en locale regardless of prompt', () => {
      expect(resolveArabicLocaleGuidance('follow-ui', 'en', AR_PROMPT)).toBeUndefined();
      expect(resolveArabicLocaleGuidance('follow-ui', 'en', EN_PROMPT)).toBeUndefined();
    });

    // 2. auto
    it('auto: dynamically activates only when prompt contains Arabic script', () => {
      // With en locale
      expect(resolveArabicLocaleGuidance('auto', 'en', AR_PROMPT)).toBe(ARABIC_LOCALE_INSTRUCTION);
      expect(resolveArabicLocaleGuidance('auto', 'en', MIXED_PROMPT)).toBe(ARABIC_LOCALE_INSTRUCTION);
      expect(resolveArabicLocaleGuidance('auto', 'en', EN_PROMPT)).toBeUndefined();

      // With ar locale (auto dynamically respects prompt language even if UI is Arabic)
      expect(resolveArabicLocaleGuidance('auto', 'ar', AR_PROMPT)).toBe(ARABIC_LOCALE_INSTRUCTION);
      expect(resolveArabicLocaleGuidance('auto', 'ar', MIXED_PROMPT)).toBe(ARABIC_LOCALE_INSTRUCTION);
      expect(resolveArabicLocaleGuidance('auto', 'ar', EN_PROMPT)).toBeUndefined();
    });

    // 3. ar
    it('ar: unconditionally active regardless of locale or prompt content', () => {
      expect(resolveArabicLocaleGuidance('ar', 'en', EN_PROMPT)).toBe(ARABIC_LOCALE_INSTRUCTION);
      expect(resolveArabicLocaleGuidance('ar', 'en', AR_PROMPT)).toBe(ARABIC_LOCALE_INSTRUCTION);
      expect(resolveArabicLocaleGuidance('ar', 'ar', EN_PROMPT)).toBe(ARABIC_LOCALE_INSTRUCTION);
      expect(resolveArabicLocaleGuidance('ar', 'ar', AR_PROMPT)).toBe(ARABIC_LOCALE_INSTRUCTION);
    });

    // 4. en
    it('en: unconditionally inactive regardless of locale or prompt content', () => {
      expect(resolveArabicLocaleGuidance('en', 'en', EN_PROMPT)).toBeUndefined();
      expect(resolveArabicLocaleGuidance('en', 'en', AR_PROMPT)).toBeUndefined();
      expect(resolveArabicLocaleGuidance('en', 'ar', EN_PROMPT)).toBeUndefined();
      expect(resolveArabicLocaleGuidance('en', 'ar', AR_PROMPT)).toBeUndefined();
    });
  });

  describe('defaults and resilience', () => {
    it('falls back to follow-ui and en when called with defaults or empty strings', () => {
      expect(resolveArabicLocaleGuidance()).toBeUndefined();
      expect(resolveArabicLocaleGuidance('follow-ui')).toBeUndefined();
      expect(resolveArabicLocaleGuidance('follow-ui', 'ar')).toBe(ARABIC_LOCALE_INSTRUCTION);
      expect(resolveArabicLocaleGuidance('auto', 'en', '')).toBeUndefined();
    });
  });

  describe('ARABIC_CHAR_PATTERN regex', () => {
    it('matches Arabic letters, signs, and numerals', () => {
      expect(ARABIC_CHAR_PATTERN.test('مرحبا')).toBe(true);
      expect(ARABIC_CHAR_PATTERN.test('١٢٣')).toBe(true); // Arabic-Indic digits
      expect(ARABIC_CHAR_PATTERN.test('English only 123')).toBe(false);
      expect(ARABIC_CHAR_PATTERN.test('')).toBe(false);
    });
  });

  describe('ARABIC_LOCALE_INSTRUCTION wording', () => {
    it('contains Arabic conversation instruction and strict English/ASCII isolation', () => {
      expect(ARABIC_LOCALE_INSTRUCTION).toContain('Modern Standard Arabic');
      expect(ARABIC_LOCALE_INSTRUCTION).toContain('English/ASCII');
      expect(ARABIC_LOCALE_INSTRUCTION).toContain('Never translate code syntax, CLI commands, or variable names');
    });
  });

  describe('COMMIT_SYSTEM_PROMPT (#54)', () => {
    it('strictly instructs English Conventional Commits for international CI/CD compatibility', () => {
      expect(COMMIT_SYSTEM_PROMPT).toContain('Always write commit messages in English using Conventional Commits convention');
      expect(COMMIT_SYSTEM_PROMPT).toContain('feat:');
      expect(COMMIT_SYSTEM_PROMPT).toContain('fix(scope):');
      expect(COMMIT_SYSTEM_PROMPT).toContain('international CI/CD compatibility regardless of conversation language');
    });
  });
});
