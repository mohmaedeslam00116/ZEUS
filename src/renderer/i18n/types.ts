import type { AppLayoutDirection, AppLocale } from '@shared/types';

/** Named parameters for string token interpolation (e.g. `{count}`). */
export type TranslationParams = Record<string, string | number>;

/** Canonical schema for all localized UI strings. */
export interface TranslationSchema {
  [section: string]: Record<string, string>;
  common: {
    ok: string;
    cancel: string;
    save: string;
    saving: string;
    saved: string;
    close: string;
    delete: string;
    edit: string;
    back: string;
    next: string;
    search: string;
    loading: string;
    error: string;
    settings: string;
    retry: string;
    confirm: string;
    revert: string;
    copy: string;
    copied: string;
    format: string;
    default: string;
    enabled: string;
    disabled: string;
    auto: string;
    dismiss: string;
    learnMore: string;
  };
  titlebar: {
    minimize: string;
    maximize: string;
    restore: string;
    close: string;
    switchWorkspace: string;
    newSession: string;
    connecting: string;
    offline: string;
    ready: string;
    search: string;
    searchShortcut: string;
    settingsWithUpdate: string;
  };
  sessions: {
    title: string;
    newSession: string;
    plainSession: string;
    worktreeSession: string;
    deleteSession: string;
    noSessions: string;
    filterSessions: string;
    activeSession: string;
    revertCheckpoint: string;
    checkpoints: string;
    pinned: string;
    archived: string;
    recentlyDeleted: string;
  };
  composer: {
    placeholder: string;
    send: string;
    stop: string;
    planMode: string;
    askMode: string;
    defaultMode: string;
    acceptEditsMode: string;
    attachFiles: string;
    attachments: string;
  };
  settings: {
    title: string;
    appearance: string;
    language: string;
    languageHint: string;
    layoutDirection: string;
    layoutDirectionHint: string;
    density: string;
    fontScale: string;
    chatFont: string;
    reducedMotion: string;
    agent: string;
    languageGuidance: string;
    languageGuidanceHint: string;
    permissions: string;
    model: string;
    thinking: string;
    canvasRtl: string;
    fullRtl: string;
    ltr: string;
    followUi: string;
    arabic: string;
    english: string;
    general: string;
    workspace: string;
    behavior: string;
    runtime: string;
    mcp: string;
    planTasks: string;
    terminal: string;
    git: string;
    memory: string;
    graph: string;
    attachments: string;
    shortcuts: string;
    updates: string;
    about: string;
  };
  activity: {
    files: string;
    changes: string;
    git: string;
    terminal: string;
    tasks: string;
    console: string;
    graph: string;
    diagnostics: string;
    memory: string;
  };
  dialogs: {
    confirmDeleteTitle: string;
    confirmDeleteBody: string;
    unsavedChangesTitle: string;
    unsavedChangesBody: string;
    discardTitle: string;
    keepEditing: string;
    discardChanges: string;
  };
  workspace: {
    welcomeTitle: string;
    welcomeSubtitle: string;
    startConversation: string;
    startConversationHint: string;
  };
  permissions: {
    required: string;
    allow: string;
    deny: string;
    alwaysAllow: string;
    read: string;
    write: string;
    command: string;
  };
}

/** Section-based dictionary structure for translations. */
export type TranslationDictionary = Record<string, Record<string, string>>;

export type DotNestedKeys<T> = {
  [K in keyof T & string]: T[K] extends Record<string, string>
    ? `${K}.${keyof T[K] & string}`
    : K;
}[keyof T & string];

export type KnownTranslationKey = DotNestedKeys<TranslationSchema>;

export type TranslationKey = KnownTranslationKey | (string & Record<never, never>);

/** The public i18n hook and context contract. */
export interface I18nContextValue {
  /** Active UI locale (`'en'` | `'ar'`). */
  locale: AppLocale;
  /** Active layout directionality mode. */
  layoutDirection: AppLayoutDirection;
  /** Whether the active locale is right-to-left. */
  isRTL: boolean;
  /** Translate a dotted key (e.g. `'common.save'`) with optional token params. */
  t: (key: TranslationKey, params?: TranslationParams) => string;
}
