import Link from 'next/link';
import type { ReactNode } from 'react';

export type DanbiAppView =
  | 'hub'
  | 'editor'
  | 'ai'
  | 'automation'
  | 'render'
  | 'extensions'
  | 'settings';

interface DanbiAppShellProps {
  activeView: DanbiAppView;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

interface WorkspacePanelProps {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  action?: ReactNode;
}

interface StatusPillProps {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn' | 'pending';
}

const navigationItems: Array<{
  id: DanbiAppView;
  label: string;
  href: string;
  badge?: string;
}> = [
  { id: 'hub', label: 'Hub', href: '/' },
  { id: 'editor', label: 'Editor', href: '/editor' },
  { id: 'ai', label: 'AI Studio', href: '/ai-studio' },
  { id: 'automation', label: 'Automation', href: '/automation' },
  { id: 'render', label: 'Render', href: '/render-queue' },
  { id: 'extensions', label: 'Extensions', href: '/extensions' },
  { id: 'settings', label: 'Settings', href: '/settings' },
];

const defaultStatusItems = [
  { label: 'FFmpeg', value: 'Local', tone: 'good' as const },
  { label: 'Storage', value: 'userData', tone: 'good' as const },
  { label: 'ComfyUI', value: 'Check', tone: 'pending' as const },
  { label: 'Workers', value: 'Idle', tone: 'neutral' as const },
  { label: 'External QA', value: 'Pending', tone: 'pending' as const },
];

export function DanbiAppShell({
  activeView,
  title,
  subtitle,
  actions,
  children,
}: DanbiAppShellProps) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="grid min-h-screen grid-cols-[88px_minmax(0,1fr)] grid-rows-[64px_minmax(0,1fr)_40px]">
        <aside className="row-span-3 border-r border-zinc-800 bg-zinc-950/95">
          <div className="flex h-16 items-center justify-center border-b border-zinc-800">
            <span className="grid h-9 w-9 place-items-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-sm font-semibold text-emerald-200">
              DB
            </span>
          </div>
          <nav className="flex flex-col gap-1 p-2" aria-label="Danbi workspaces">
            {navigationItems.map((item) => {
              const active = item.id === activeView;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={[
                    'flex h-14 flex-col items-center justify-center rounded-lg border text-[11px] font-medium transition',
                    active
                      ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-100'
                      : 'border-transparent text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100',
                  ].join(' ')}
                >
                  <span>{item.label}</span>
                  {item.badge ? (
                    <span className="mt-1 rounded border border-amber-400/40 px-1 text-[10px] text-amber-200">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </aside>

        <header className="flex min-w-0 items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-950/95 px-6">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-emerald-300">Danbi Studio</p>
            <h1 className="truncate text-lg font-semibold text-zinc-50">{title}</h1>
          </div>
          {subtitle ? (
            <p className="hidden max-w-xl truncate text-sm text-zinc-400 lg:block">{subtitle}</p>
          ) : null}
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>

        <section className="min-w-0 overflow-auto bg-zinc-950 p-6 custom-scrollbar">
          {children}
        </section>

        <footer className="flex min-w-0 items-center gap-2 border-t border-zinc-800 bg-zinc-950/95 px-4">
          {defaultStatusItems.map((item) => (
            <StatusPill key={`${item.label}-${item.value}`} {...item} />
          ))}
        </footer>
      </div>
    </main>
  );
}

export function WorkspacePanel({
  title,
  eyebrow,
  children,
  action,
}: WorkspacePanelProps) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/60">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-3">
        <div>
          {eyebrow ? <p className="text-xs font-medium uppercase text-zinc-500">{eyebrow}</p> : null}
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function StatusPill({
  label,
  value,
  tone = 'neutral',
}: StatusPillProps) {
  const toneClass = {
    neutral: 'border-zinc-700 text-zinc-300',
    good: 'border-emerald-500/40 text-emerald-200',
    warn: 'border-amber-400/40 text-amber-200',
    pending: 'border-cyan-400/40 text-cyan-200',
  }[tone];

  return (
    <span className={`inline-flex h-7 items-center gap-2 rounded border px-2 text-xs ${toneClass}`}>
      {label ? <span className="text-zinc-500">{label}</span> : null}
      <span className="font-medium">{value}</span>
    </span>
  );
}

export function AppLink({
  href,
  children,
  variant = 'primary',
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
}) {
  const className = variant === 'primary'
    ? 'inline-flex h-9 items-center rounded-lg border border-emerald-400/50 bg-emerald-400/10 px-3 text-sm font-medium text-emerald-100 hover:bg-emerald-400/20'
    : 'inline-flex h-9 items-center rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800';

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function DataList({
  items,
}: {
  items: Array<{ label: string; value: string; tone?: 'neutral' | 'good' | 'warn' | 'pending' }>;
}) {
  return (
    <dl className="divide-y divide-zinc-800">
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`} className="flex items-center justify-between gap-4 py-2">
          <dt className="text-sm text-zinc-400">{item.label}</dt>
          <dd>
            <StatusPill label="" value={item.value} tone={item.tone ?? 'neutral'} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
