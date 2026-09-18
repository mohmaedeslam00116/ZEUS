/**
 * Settings left rail: a search box on top that filters the navigation *and*
 * matches individual settings deeply (by label + keywords), followed by the
 * icon nav list. Selecting a deep-search result jumps to its category and
 * highlights the exact field.
 */
import { Search, CornerDownRight, X } from 'lucide-react';
import { cn } from '@/renderer/lib/cn';
import { useTranslation } from '@/renderer/i18n';
import { SETTINGS_CATALOG, searchCategories, searchFields } from './catalog';

interface SettingsNavProps {
  query: string;
  setQuery: (q: string) => void;
  activeId: string;
  onSelectCategory: (id: string) => void;
  onSelectField: (categoryId: string, fieldId: string) => void;
}

import type { KnownTranslationKey } from '@/renderer/i18n';

const CATEGORY_LABEL_MAP: Record<string, KnownTranslationKey> = {
  general: 'settings.general',
  appearance: 'settings.appearance',
  workspace: 'settings.workspace',
  behavior: 'settings.behavior',
  agent: 'settings.agent',
  runtime: 'settings.runtime',
  mcp: 'settings.mcp',
  planTasks: 'settings.planTasks',
  terminal: 'settings.terminal',
  git: 'settings.git',
  memory: 'settings.memory',
  graph: 'settings.graph',
  attachments: 'settings.attachments',
  shortcuts: 'settings.shortcuts',
  updates: 'settings.updates',
  about: 'settings.about',
};

export function getCategoryTitle(
  id: string,
  fallback: string,
  t: (key: KnownTranslationKey) => string,
): string {
  const key = CATEGORY_LABEL_MAP[id];
  return key ? t(key) : fallback;
}

export function SettingsNav({
  query,
  setQuery,
  activeId,
  onSelectCategory,
  onSelectField,
}: SettingsNavProps) {
  const { t } = useTranslation();
  const categories = searchCategories(query);
  const fieldHits = searchFields(query);
  const labelFor = (id: string) => {
    const fallback = SETTINGS_CATALOG.find((c) => c.id === id)?.label ?? id;
    return getCategoryTitle(id, fallback, t);
  };

  return (
    <div className="flex w-52 shrink-0 flex-col border-e border-line bg-surface">
      <div className="p-2">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`${t('common.search')} ${t('settings.title')}…`}
            spellCheck={false}
            autoFocus
            className="w-full rounded-md border border-line bg-surface-2 py-1.5 ps-8 pe-7 text-[12px] text-fg placeholder:text-faint focus:border-line-strong focus:outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute end-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-faint transition-colors hover:text-fg"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {/* Deep-search field matches */}
        {query && fieldHits.length > 0 && (
          <div className="mb-2">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
              Matching settings
            </p>
            <ul className="flex flex-col">
              {fieldHits.map((hit) => (
                <li key={`${hit.categoryId}.${hit.fieldId}`}>
                  <button
                    type="button"
                    onClick={() => hit.fieldId && onSelectField(hit.categoryId, hit.fieldId)}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-start text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    <CornerDownRight size={12} className="shrink-0 text-faint rtl-flip" />
                    <span className="truncate">{hit.label}</span>
                    <span className="ms-auto shrink-0 text-[10px] text-faint">
                      {labelFor(hit.categoryId)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Category nav */}
        {query && (
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
            Sections
          </p>
        )}
        {categories.length === 0 ? (
          <p className="px-2 py-3 text-[12px] text-faint">No settings found.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {categories.map((category) => {
              const active = category.id === activeId;
              const Icon = category.icon;
              return (
                <li key={category.id}>
                  <button
                    type="button"
                    onClick={() => onSelectCategory(category.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-start text-[12px] transition-colors',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
                      // Active is carried by COLOR, not a background plate (see
                      // ActivityRail). The label takes accent too: with the plate
                      // gone, `text-fg` alone is nearly indistinguishable from an
                      // inactive row on this palette.
                      active
                        ? 'text-accent'
                        : 'text-muted hover:bg-surface-2 hover:text-fg',
                    )}
                  >
                    <Icon size={15} className={active ? 'text-accent' : 'text-faint'} />
                    <span className={cn('truncate', active && 'font-semibold')}>
                      {labelFor(category.id)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </div>
  );
}
