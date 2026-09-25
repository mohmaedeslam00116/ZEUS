/**
 * ModelPicker — Rich, accessible, filterable model selector with Free/Paid badges (Ticket #66).
 * Conforms to Impeccable design system, WCAG AA contrast standards, and full RTL layout support.
 */
import { useEffect, useRef, useState, useMemo } from 'react';
import {
  Brain,
  Check,
  ChevronDown,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/renderer/lib/cn';
import { ProviderIcon } from '@/renderer/components/brand/ProviderIcon';
import { useTranslation } from '@/renderer/i18n';
import {
  useModelCatalog,
  type ExtendedModelOption,
} from './useModelCatalog';

export interface ModelPickerProps {
  value: string;
  onChange: (modelValue: string) => void;
  disabled?: boolean;
  className?: string;
}

export function formatContextTokens(tokens?: number): string | null {
  if (!tokens || tokens <= 0) return null;
  if (tokens >= 1_000_000) {
    const m = Number((tokens / 1_000_000).toFixed(1));
    return `${m}m`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}k`;
  }
  return String(tokens);
}

export function ModelPicker({
  value,
  onChange,
  disabled = false,
  className,
}: ModelPickerProps) {
  const { t, isRTL } = useTranslation();
  const { models, loading, refresh } = useModelCatalog();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Active selected model descriptor
  const selectedModel = useMemo(() => {
    return (
      models.find((m) => m.value === value) || {
        value,
        label: value,
        provider: 'native' as const,
        providerLabel: 'Unknown',
        isFree: value.endsWith(':free') || value.includes('gemini-2.5-flash'),
      }
    );
  }, [models, value]);

  // Filter models based on query and freeOnly filter
  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter((m) => {
      if (freeOnly && !m.isFree) return false;
      if (!q) return true;
      const haystack = `${m.label} ${m.value} ${m.provider} ${m.providerLabel}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [models, search, freeOnly]);

  // Group models by provider
  const groupedModels = useMemo(() => {
    const groups: Array<{
      provider: string;
      providerLabel: string;
      items: ExtendedModelOption[];
    }> = [];
    const map = new Map<string, ExtendedModelOption[]>();

    for (const m of filteredModels) {
      const key = String(m.provider);
      const existing = map.get(key);
      if (existing) {
        existing.push(m);
      } else {
        map.set(key, [m]);
      }
    }

    for (const [provider, items] of map.entries()) {
      groups.push({
        provider,
        providerLabel: items[0].providerLabel || provider,
        items,
      });
    }

    return groups;
  }, [filteredModels]);

  // Flattened items for keyboard indexing
  const flatVisibleItems = useMemo(() => {
    const out: ExtendedModelOption[] = [];
    for (const g of groupedModels) {
      for (const item of g.items) {
        out.push(item);
      }
    }
    return out;
  }, [groupedModels]);

  // Reset highlight index when filter changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [search, freeOnly]);

  // Reset state on open/close and setup event listeners
  useEffect(() => {
    if (!open) {
      setSearch('');
      setFreeOnly(false);
      return;
    }

    // Auto-focus input when opened
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);

    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [open]);

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(highlightedIndex + 1, flatVisibleItems.length - 1);
      setHighlightedIndex(next);
      scrollItemIntoView(next);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(highlightedIndex - 1, 0);
      setHighlightedIndex(prev);
      scrollItemIntoView(prev);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatVisibleItems[highlightedIndex];
      if (item) {
        onChange(item.value);
        setOpen(false);
      }
      return;
    }
  };

  const scrollItemIntoView = (index: number) => {
    if (!listRef.current) return;
    const elements = listRef.current.querySelectorAll('[data-model-item]');
    const target = elements[index] as HTMLElement | undefined;
    if (target) {
      target.scrollIntoView({ block: 'nearest' });
    }
  };

  const freeModelsCount = useMemo(() => {
    return models.filter((m) => m.isFree).length;
  }, [models]);

  let currentItemIndex = 0;

  return (
    <div
      ref={containerRef}
      className={cn('relative no-drag min-w-0', className)}
      onKeyDown={handleKeyDown}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Trigger Button */}
      <button
        type="button"
        title={selectedModel.label}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex h-6 min-w-0 max-w-full items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors',
          'disabled:cursor-not-allowed disabled:opacity-50',
          open
            ? 'bg-elevated text-fg border border-line shadow-sm'
            : 'text-muted hover:bg-elevated hover:text-fg border border-transparent',
        )}
      >
        <ProviderIcon
          provider={selectedModel.provider}
          size={12}
          className="shrink-0 text-faint"
        />
        <span className="max-w-[130px] truncate font-medium text-fg">
          {selectedModel.label}
        </span>

        {selectedModel.isFree && (
          <span
            className="flex items-center gap-0.5 rounded bg-success/15 px-1 py-0.2 text-[9px] font-mono font-medium text-success border border-success/30"
            title={t('providers.free')}
          >
            {t('providers.free')}
          </span>
        )}

        <ChevronDown
          size={11}
          className={cn(
            'shrink-0 text-faint transition-transform duration-150',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Popover Dropdown */}
      {open && (
        <div
          role="listbox"
          className={cn(
            'absolute bottom-full mb-1.5 z-40 w-[310px] animate-pop-in rounded-lg border border-line bg-elevated shadow-2xl overflow-hidden',
            isRTL ? 'right-0' : 'left-0',
          )}
        >
          {/* Header Controls: Search + Filter Tabs */}
          <div className="border-b border-line p-2 space-y-2 bg-surface">
            {/* Search Input */}
            <div className="flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-1 focus-within:border-accent/60 transition-colors">
              <Search size={12} className="shrink-0 text-muted" />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('providers.searchModels')}
                className="h-5 w-full bg-transparent text-[12px] text-fg outline-none placeholder:text-muted"
              />
              {loading && (
                <RefreshCw size={11} className="animate-spin text-faint shrink-0" />
              )}
            </div>

            {/* Filter Pills & Refresh */}
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFreeOnly(false)}
                  className={cn(
                    'px-2 py-0.5 rounded transition-colors',
                    !freeOnly
                      ? 'bg-elevated text-fg font-medium shadow-xs border border-line'
                      : 'text-muted hover:text-fg',
                  )}
                >
                  {t('providers.allModels')}
                </button>
                <button
                  type="button"
                  onClick={() => setFreeOnly(true)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-0.5 rounded transition-colors',
                    freeOnly
                      ? 'bg-success/15 text-success font-medium border border-success/30'
                      : 'text-muted hover:text-fg',
                  )}
                >
                  <Sparkles size={10} className="text-success" />
                  <span>{t('providers.freeOnly')}</span>
                  {freeModelsCount > 0 && (
                    <span className="ms-0.5 rounded-full bg-success/20 px-1 text-[9px] font-mono text-success">
                      {freeModelsCount}
                    </span>
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={() => void refresh()}
                disabled={loading}
                title={t('providers.refreshModels')}
                className="p-1 rounded text-muted hover:text-fg hover:bg-surface-2 transition-colors disabled:opacity-40"
              >
                <RefreshCw size={11} className={cn(loading && 'animate-spin')} />
              </button>
            </div>
          </div>

          {/* Model Groups & Rows */}
          <div
            ref={listRef}
            className="max-h-72 overflow-y-auto p-1 divide-y divide-line/30 focus:outline-none"
          >
            {groupedModels.map((group) => (
              <div key={group.provider} className="py-1">
                {/* Group Provider Header */}
                <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted">
                  <ProviderIcon provider={group.provider as never} size={11} />
                  <span>{group.providerLabel}</span>
                  <span className="ms-auto text-[9px] font-mono opacity-60">
                    {group.items.length}
                  </span>
                </div>

                {/* Model Rows */}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const thisIndex = currentItemIndex++;
                    const isSelected = item.value === value;
                    const isHighlighted = thisIndex === highlightedIndex;
                    const ctx = formatContextTokens(item.contextWindow);

                    return (
                      <button
                        key={item.value}
                        data-model-item
                        type="button"
                        onClick={() => {
                          onChange(item.value);
                          setOpen(false);
                        }}
                        onMouseEnter={() => setHighlightedIndex(thisIndex)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start transition-colors',
                          isHighlighted
                            ? 'bg-surface-2 text-fg'
                            : 'text-muted hover:bg-surface-2 hover:text-fg',
                          isSelected && 'font-medium text-fg',
                        )}
                      >
                        {/* Checkmark indicator */}
                        <div className="w-3.5 shrink-0 flex items-center justify-center">
                          {isSelected && <Check size={12} className="text-accent" />}
                        </div>

                        {/* Title & Technical ID */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[12px] text-fg font-medium">
                              {item.label}
                            </span>
                          </div>

                          <div
                            dir="ltr"
                            className="truncate text-[10px] text-muted font-mono opacity-80"
                          >
                            {item.value}
                          </div>
                        </div>

                        {/* Metadata Badges */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Free / Paid Badge */}
                          {item.isFree ? (
                            <span className="rounded bg-success/15 border border-success/30 px-1.5 py-0.2 text-[9px] font-mono font-medium text-success">
                              {t('providers.free')}
                            </span>
                          ) : (
                            <span className="rounded bg-surface-2 border border-line px-1.5 py-0.2 text-[9px] font-mono text-muted">
                              {t('providers.paid')}
                            </span>
                          )}

                          {/* Context Window Badge */}
                          {ctx && (
                            <span
                              title={t('providers.contextTokens', { count: ctx })}
                              className="rounded bg-accent/15 border border-accent/30 px-1 py-0.2 text-[9px] font-mono text-accent"
                            >
                              {ctx}
                            </span>
                          )}

                          {/* Reasoning / Thinking Badge */}
                          {item.supportsThinking && (
                            <span
                              title="Thinking / Reasoning"
                              className="rounded bg-accent/15 border border-accent/30 p-0.5 text-accent"
                            >
                              <Brain size={10} />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Empty state */}
            {filteredModels.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px] text-muted space-y-1">
                <p>{t('providers.noModelsFound')}</p>
                {freeOnly && (
                  <button
                    type="button"
                    onClick={() => setFreeOnly(false)}
                    className="text-accent hover:underline text-[11px]"
                  >
                    {t('providers.allModels')}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Footer Bar */}
          <div className="border-t border-line bg-surface px-2.5 py-1.5 text-[11px] text-muted flex items-center justify-between">
            <span>
              {t('providers.modelsCount', { count: filteredModels.length })}
            </span>
            <span className="text-[10px] opacity-70">
              Esc to close • ↵ to select
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
