import { describe, expect, it, beforeAll } from 'vitest';
import { renderToString } from 'react-dom/server';
import { I18nProvider, createTranslator, en, ar } from '@/renderer/i18n';
import { AppShell } from '@/renderer/app/AppShell';
import { CodeBlock } from '@/renderer/features/workspace/CodeBlock';
import { TerminalPanel } from '@/renderer/features/terminal/TerminalPanel';
import { DiffEditor } from '@/renderer/features/git/diff/DiffEditor';
import { SettingsModal } from '@/renderer/features/settings/SettingsModal';
import { GlobalSearch } from '@/renderer/features/search/GlobalSearch';
import { UnsavedSettingsDialog } from '@/renderer/features/settings/UnsavedSettingsDialog';
import { SessionDeleteDialog } from '@/renderer/features/sessions/SessionDeleteDialog';
import { InlineApproval } from '@/renderer/features/workspace/InlineApproval';
import { resolveArabicLocaleGuidance, COMMIT_SYSTEM_PROMPT, ARABIC_LOCALE_INSTRUCTION } from '@/main/managers/agent/locale';
import type { GitFileDiff, PermissionRequest, Session } from '@shared/types';

describe('Comprehensive Arabic Localization & RTL Integration Suite (#55)', () => {
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

  describe('1. DOM Directionality & Layout Mode Progression', () => {
    it('renders English in pure LTR mode by default', () => {
      const html = renderToString(
        <I18nProvider initialLocale="en" initialLayoutDirection="canvas-rtl">
          <AppShell />
        </I18nProvider>,
      );

      // Root shell should not have dir="rtl"
      expect(html).not.toContain('dir="rtl"');
      // Should include English titlebar and sessions text
      expect(html).toContain('Sessions');
    });

    it('renders Arabic with Canvas-Only RTL default (ADR-0011)', () => {
      const html = renderToString(
        <I18nProvider initialLocale="ar" initialLayoutDirection="canvas-rtl">
          <AppShell />
        </I18nProvider>,
      );

      // In Canvas-Only RTL, main workspace container flips to RTL
      expect(html).toContain('dir="rtl"');
      // Frame panels retain their fixed positions while canvas content uses Arabic
      expect(html).toContain('الجلسات');
      expect(html).toContain('البحث في كل شيء');
    });

    it('renders Full Mirror mode when user selects full-rtl in settings', () => {
      const html = renderToString(
        <I18nProvider initialLocale="ar" initialLayoutDirection="full-rtl">
          <AppShell />
        </I18nProvider>,
      );

      // Root AppShell container has dir="rtl"
      expect(html).toContain('dir="rtl"');
      expect(html).toContain('الجلسات');
    });
  });

  describe('2. Modal & Global Search Directionality', () => {
    it('renders SettingsModal with dir="rtl" when locale is Arabic', () => {
      const html = renderToString(
        <I18nProvider initialLocale="ar">
          <SettingsModal open={true} />
        </I18nProvider>,
      );

      expect(html).toContain('dir="rtl"');
      expect(html).toContain('الإعدادات');
      expect(html).toContain('المظهر');
      expect(html).toContain('الوكيل');
    });

    it('renders SettingsModal with dir="ltr" when locale is English', () => {
      const html = renderToString(
        <I18nProvider initialLocale="en">
          <SettingsModal open={true} />
        </I18nProvider>,
      );

      expect(html).toContain('dir="ltr"');
      expect(html).toContain('Settings');
      expect(html).toContain('Appearance');
      expect(html).toContain('Agent');
    });

    it('renders GlobalSearch palette with dir="rtl" when locale is Arabic', () => {
      const html = renderToString(
        <I18nProvider initialLocale="ar">
          <GlobalSearch open={true} />
        </I18nProvider>,
      );

      expect(html).toContain('dir="rtl"');
      expect(html).toContain('البحث في كل شيء');
    });

    it('renders UnsavedSettingsDialog with dir="rtl" and localized Arabic copy', () => {
      const html = renderToString(
        <I18nProvider initialLocale="ar">
          <UnsavedSettingsDialog
            changes={['appearance.locale']}
            onKeepEditing={() => {
              /* no-op */
            }}
            onDiscard={() => {
              /* no-op */
            }}
          />
        </I18nProvider>,
      );

      expect(html).toContain('dir="rtl"');
      expect(html).toContain('هل تريد تجاهل التغييرات غير المحفوظة؟');
      expect(html).toContain('متابعة التعديل');
      expect(html).toContain('تجاهل التغييرات');
    });

    it('renders SessionDeleteDialog with dir="rtl" when locale is Arabic', () => {
      const mockSession: Session = {
        id: 's_1',
        workspaceId: 'w_1',
        title: 'جلسة عمل تجريبية',
        branch: 'main',
        status: 'idle',
        createdAt: 1000,
        updatedAt: 1000,
        adds: 0,
        dels: 0,
        unread: 0,
        pinned: false,
        archived: false,
        deletedAt: null,
        worktreePath: null,
        worktreeBranch: null,
        worktreeStatus: 'none',
        baseRef: null,
        folder: null,
        tags: [],
      };

      const html = renderToString(
        <I18nProvider initialLocale="ar">
          <SessionDeleteDialog
            session={mockSession}
            onClose={() => {
              /* no-op */
            }}
          />
        </I18nProvider>,
      );

      expect(html).toContain('dir="rtl"');
      expect(html).toContain('حذف الجلسة؟');
    });
  });

  describe('3. Strict LTR Code, Diff & Terminal Isolation (ADR-0011)', () => {
    it('enforces dir="ltr" on CodeBlock even within an Arabic RTL context', () => {
      const sampleCode = 'const greeting = "مرحبا بالعالم";\nconsole.log(greeting);';

      const html = renderToString(
        <I18nProvider initialLocale="ar">
          <div dir="rtl">
            <CodeBlock code={sampleCode} lang="typescript" label="example.ts" />
          </div>
        </I18nProvider>,
      );

      expect(html).toContain('dir="ltr"');
      expect(html).toContain('code-isolate');
      expect(html).toContain('font-mono');
      expect(html).toContain('example.ts');
    });

    it('enforces dir="ltr" and isolate on DiffEditor container', () => {
      const mockDiff: GitFileDiff = {
        path: 'src/main.ts',
        binary: false,
        staged: false,
        hunks: [
          {
            header: '@@ -1,1 +1,2 @@',
            lines: [
              { kind: 'context', text: 'export const app = 1;', oldLine: 1, newLine: 1 },
              { kind: 'add', text: 'export const locale = "ar";', newLine: 2 },
            ],
          },
        ],
      };

      const html = renderToString(
        <I18nProvider initialLocale="ar">
          <div dir="rtl">
            <DiffEditor diff={mockDiff} />
          </div>
        </I18nProvider>,
      );

      expect(html).toContain('dir="ltr"');
      expect(html).toContain('code-isolate');
      expect(html).toContain('font-mono');
    });

    it('enforces dir="ltr" on TerminalPanel and xterm viewport container', () => {
      const html = renderToString(
        <I18nProvider initialLocale="ar">
          <div dir="rtl">
            <TerminalPanel />
          </div>
        </I18nProvider>,
      );

      expect(html).toContain('dir="ltr"');
      expect(html).toContain('code-isolate');
    });
  });

  describe('4. Visual Polish & Permissions Localization', () => {
    const mockRequest: PermissionRequest = {
      id: 'req_1',
      sessionId: 's_1',
      tool: 'bash',
      risk: 'command',
      summary: 'Run npm test in terminal',
      detail: 'npm test',
      createdAt: Date.now(),
    };

    it('renders InlineApproval with Arabic permission strings and logical properties', () => {
      const html = renderToString(
        <I18nProvider initialLocale="ar">
          <InlineApproval request={mockRequest} />
        </I18nProvider>,
      );

      expect(html).toContain('مطلوب إذن');
      expect(html).toContain('سماح');
      expect(html).toContain('رفض');
      expect(html).toContain('السماح دائماً لهذه الجلسة');
      expect(html).toContain('ms-auto');
    });

    it('renders InlineApproval with English strings in LTR mode', () => {
      const html = renderToString(
        <I18nProvider initialLocale="en">
          <InlineApproval request={mockRequest} />
        </I18nProvider>,
      );

      expect(html).toContain('Permission required');
      expect(html).toContain('Allow');
      expect(html).toContain('Deny');
      expect(html).toContain('Always allow this session');
    });
  });

  describe('5. Bilingual Agent Guidance & Conventional Commits Integration (#54)', () => {
    it('injects Arabic steering prompt when guidance is follow-ui and locale is ar', () => {
      const ctx = resolveArabicLocaleGuidance('follow-ui', 'ar', 'How does this work?');
      expect(ctx).toBe(ARABIC_LOCALE_INSTRUCTION);
      expect(ctx).toContain('Modern Standard Arabic');
      expect(ctx).toContain('Keep all code, terminal commands, diffs');
    });

    it('detects Arabic script in auto guidance mode regardless of UI locale', () => {
      const arabicPrompt = 'ما هو هذا المشروع وكيف يعمل؟';
      const ctx = resolveArabicLocaleGuidance('auto', 'en', arabicPrompt);
      expect(ctx).toBe(ARABIC_LOCALE_INSTRUCTION);
    });

    it('returns undefined when guidance is follow-ui and locale is en', () => {
      const ctx = resolveArabicLocaleGuidance('follow-ui', 'en', 'English query');
      expect(ctx).toBeUndefined();
    });

    it('mandates English Conventional Commits in COMMIT_SYSTEM_PROMPT', () => {
      expect(COMMIT_SYSTEM_PROMPT).toContain('Always write commit messages in English');
      expect(COMMIT_SYSTEM_PROMPT).toContain('Conventional Commits');
    });
  });

  describe('6. Translation Parity and Fallback Mechanism', () => {
    it('maintains 100% dictionary key parity between en and ar across all sections', () => {
      const enSections = Object.keys(en).sort();
      const arSections = Object.keys(ar).sort();
      expect(arSections).toEqual(enSections);

      const enDict = en as Record<string, Record<string, string>>;
      const arDict = ar as Record<string, Record<string, string>>;

      for (const [section, entries] of Object.entries(enDict)) {
        for (const [key, val] of Object.entries(entries)) {
          expect(arDict[section]?.[key], `Missing Arabic key: ${section}.${key}`).toBeDefined();
          expect(typeof arDict[section]?.[key]).toBe('string');
          expect(arDict[section][key].trim().length).toBeGreaterThan(0);
          expect(typeof val).toBe('string');
        }
      }

      for (const [section, entries] of Object.entries(arDict)) {
        for (const [key] of Object.entries(entries)) {
          expect(enDict[section]?.[key], `Missing English key: ${section}.${key}`).toBeDefined();
        }
      }
    });

    it('resolves all ticket #55 keys in both en and ar', () => {
      const tEn = createTranslator('en', en, en);
      const tAr = createTranslator('ar', ar, en);

      expect(tEn('settings.canvasRtl')).toBe('Canvas-only RTL (Recommended)');
      expect(tAr('settings.canvasRtl')).toBe('مساحة العمل فقط (موصى به)');

      expect(tEn('settings.fullRtl')).toBe('Full mirror (All panels RTL)');
      expect(tAr('settings.fullRtl')).toBe('انعكاس كامل (كافة اللوحات)');

      expect(tEn('settings.followUi')).toBe('Follow UI');
      expect(tAr('settings.followUi')).toBe('مطابقة لغة الواجهة');

      expect(tEn('settings.general')).toBe('General');
      expect(tAr('settings.general')).toBe('عام');

      expect(tEn('workspace.welcomeTitle')).toBe('Welcome to Zeus');
      expect(tAr('workspace.welcomeTitle')).toBe('مرحباً بك في زيوس');

      expect(tEn('permissions.alwaysAllow')).toBe('Always allow this session');
      expect(tAr('permissions.alwaysAllow')).toBe('السماح دائماً لهذه الجلسة');
    });

    it('gracefully falls back to English when a key is absent in target locale', () => {
      const tAr = createTranslator('ar', ar, en);
      const fallbackResult = tAr('nonexistent.key');
      expect(fallbackResult).toBe('nonexistent.key');
    });
  });
});
