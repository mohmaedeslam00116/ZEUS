/**
 * Bilingual prompt steering logic and commit convention prompts for ZEUS agents
 * (Ticket #54 / Spec #49).
 *
 * Keeps agent conversations and explanations in Modern Standard Arabic while
 * preserving English/ASCII isolation for code, terminal commands, diffs, symbol
 * names, file paths, tool arguments, and git commit messages.
 *
 * This module is pure (no Electron, no DB, no IPC) per ADR-0007.
 */
import type { AgentLanguageGuidance, AppLocale } from '@shared/types';

/**
 * Regex matching Arabic unicode script blocks (Arabic, Arabic Supplement,
 * Arabic Presentation Forms-A & B).
 */
export const ARABIC_CHAR_PATTERN = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * Bilingual system prompt instruction steering the model to converse and explain
 * in Modern Standard Arabic while preserving strict English/ASCII for code, commands,
 * diffs, paths, and tool calls.
 */
export const ARABIC_LOCALE_INSTRUCTION =
  'User interface and conversation preference is Arabic. Explain concepts, thoughts, ' +
  'and conversational responses in clear Modern Standard Arabic. Keep all code, ' +
  'terminal commands, diffs, symbol names, file paths, and tool parameters strictly ' +
  'in English/ASCII. Never translate code syntax, CLI commands, or variable names.';

/**
 * System prompt used when generating git commit messages. Explicitly mandates
 * English Conventional Commits for international CI/CD compatibility regardless
 * of the user's active interface or conversation language.
 */
export const COMMIT_SYSTEM_PROMPT =
  'You write git commit messages. Output ONLY the commit message text — no ' +
  'preamble, no explanations, no code fences, no surrounding quotes. Always write ' +
  'commit messages in English using Conventional Commits convention (e.g. "feat:", "fix(scope):") ' +
  'for international CI/CD compatibility regardless of conversation language. First ' +
  'line: an imperative-mood subject of at most 72 characters. If the change ' +
  'needs explanation, add one blank line then a short body wrapped at ~72 ' +
  'columns. If the repository\'s recent commit subjects follow a consistent ' +
  'convention, match it; otherwise use standard Conventional Commits with a plain ' +
  'imperative subject.';

/**
 * Resolves whether the bilingual Arabic instruction should be injected given the user's
 * configured guidance setting, active UI locale, and current prompt text.
 *
 * Modes:
 * - 'ar': unconditionally active.
 * - 'en': unconditionally inactive (English only).
 * - 'follow-ui': active if UI locale is Arabic ('ar').
 * - 'auto': dynamically active if the user prompt contains Arabic script.
 */
export function resolveArabicLocaleGuidance(
  guidance: AgentLanguageGuidance = 'follow-ui',
  locale: AppLocale = 'en',
  prompt = '',
): string | undefined {
  if (guidance === 'ar') {
    return ARABIC_LOCALE_INSTRUCTION;
  }
  if (guidance === 'en') {
    return undefined;
  }
  if (guidance === 'follow-ui') {
    return locale === 'ar' ? ARABIC_LOCALE_INSTRUCTION : undefined;
  }
  if (guidance === 'auto') {
    return ARABIC_CHAR_PATTERN.test(prompt) ? ARABIC_LOCALE_INSTRUCTION : undefined;
  }
  return undefined;
}
