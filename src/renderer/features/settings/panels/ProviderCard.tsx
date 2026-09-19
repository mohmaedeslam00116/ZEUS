/**
 * Shared harness status row for Settings › Agent › Harnesses. Claude, Cursor
 * (and any future adapter) render the same icon-tile + name + status line +
 * icon-pill layout, driven by the shared {@link LifecycleMeta} shape from
 * features/agent/status.ts — one status vocabulary, no per-provider pill
 * styling.
 *
 * A ROW, not a card. It carries no border or fill of its own: the settings
 * panels are flat lists of labelled rows (see `Section`/`Field` in
 * controls.tsx), and wrapping one group in a bordered well made this the only
 * place in Settings that looked like a container. The icon tile and the status
 * pill keep their shapes — those are controls, not chrome.
 */
import type { AgentProvider } from '@shared/constants';
import { cn } from '@/renderer/lib/cn';
import { ProviderIcon } from '@/renderer/components/brand/ProviderIcon';
import { CopyButton } from '@/renderer/components/ui/CopyButton';
import { useTranslation } from '@/renderer/i18n';
import type { LifecycleMeta } from '@/renderer/features/agent/status';

export function ProviderStatusRow({
  provider,
  name,
  statusLine,
  meta,
}: {
  provider: AgentProvider;
  name: string;
  statusLine: string;
  meta: LifecycleMeta;
}) {
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-3 px-2 py-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-elevated text-muted">
        <ProviderIcon provider={provider} size={18} className="text-muted" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-[13px] text-fg">{name}</span>
        <span className="truncate text-[11px] text-faint">{statusLine}</span>
      </div>
      <span
        title={statusLine}
        className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-elevated px-2 py-0.5 text-[10px] text-muted"
      >
        <Icon size={12} className={cn(meta.text, meta.spin && 'animate-spin')} aria-hidden />
        {meta.label}
      </span>
    </div>
  );
}

export function HeadlessProviderControls({
  description,
  installCommand,
  installed,
}: {
  description: string;
  installCommand: string;
  installed: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 px-2 pt-1 pb-2">
      <p className="text-[12px] leading-relaxed text-muted">{description}</p>
      {!installed && (
        <div className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-2 p-2.5">
          <span className="text-[11px] font-medium text-faint">
            {t('providers.installHint')}
          </span>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg">
              {installCommand}
            </code>
            <CopyButton value={installCommand} label={t('providers.copyCommand')} />
          </div>
        </div>
      )}
    </div>
  );
}
