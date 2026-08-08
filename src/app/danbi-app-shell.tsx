'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  readStoredMenuLanguage,
  setStoredMenuLanguage,
  subscribeMenuLanguage,
  type DanbiMenuLanguage,
} from '@/lib/editor/menu-language';

export type DanbiAppView =
  | 'hub'
  | 'editor'
  | 'ai'
  | 'automation'
  | 'render'
  | 'extensions'
  | 'settings';

export type ShellStatusItem = StatusPillProps;

interface DanbiAppShellProps {
  activeView: DanbiAppView;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  statusItems?: ShellStatusItem[];
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
  icon: string;
  href: string;
}> = [
  { id: 'hub', icon: 'H', href: '/' },
  { id: 'editor', icon: 'E', href: '/editor' },
  { id: 'ai', icon: 'AI', href: '/ai-studio' },
  { id: 'automation', icon: 'A', href: '/automation' },
  { id: 'render', icon: 'R', href: '/render-queue' },
  { id: 'extensions', icon: 'P', href: '/extensions' },
  { id: 'settings', icon: 'S', href: '/settings' },
];

const shellText = {
  en: {
    languageLabel: 'Menu language',
    menus: ['File', 'Edit', 'Clip', 'Timeline', 'AI', 'Automation', 'Render', 'View', 'Help'],
    workspaces: {
      hub: 'Home',
      editor: 'Edit',
      ai: 'AI Studio',
      automation: 'Automation',
      render: 'Render',
      extensions: 'Plugins',
      settings: 'Settings',
    },
    status: {
      ffmpeg: 'FFmpeg',
      storage: 'Storage',
      comfyui: 'ComfyUI',
      workers: 'Workers',
      qa: 'External QA',
      local: 'Local',
      userData: 'userData',
      check: 'Check',
      idle: 'Idle',
      pending: 'Pending',
    },
  },
  ko: {
    languageLabel: '메뉴 언어',
    menus: ['파일', '편집', '클립', '타임라인', 'AI', '자동화', '렌더', '보기', '도움말'],
    workspaces: {
      hub: '홈',
      editor: '편집',
      ai: 'AI 스튜디오',
      automation: '자동화',
      render: '렌더',
      extensions: '플러그인',
      settings: '설정',
    },
    status: {
      ffmpeg: 'FFmpeg',
      storage: '저장소',
      comfyui: 'ComfyUI',
      workers: '워커',
      qa: '외부 QA',
      local: '로컬',
      userData: 'userData',
      check: '확인',
      idle: '대기',
      pending: '대기',
    },
  },
} satisfies Record<DanbiMenuLanguage, {
  languageLabel: string;
  menus: string[];
  workspaces: Record<DanbiAppView, string>;
  status: Record<string, string>;
}>;

export function DanbiAppShell({
  activeView,
  title,
  subtitle,
  actions,
  statusItems: statusItemsProp,
  children,
}: DanbiAppShellProps) {
  const [language, setLanguage] = useState<DanbiMenuLanguage>('en');

  useEffect(() => {
    setLanguage(readStoredMenuLanguage());
    return subscribeMenuLanguage(setLanguage);
  }, []);

  const text = shellText[language];
  const defaultStatusItems = useMemo(() => [
    { label: text.status.ffmpeg, value: text.status.local, tone: 'good' as const },
    { label: text.status.storage, value: text.status.userData, tone: 'good' as const },
    { label: text.status.comfyui, value: text.status.check, tone: 'pending' as const },
    { label: text.status.workers, value: text.status.idle, tone: 'neutral' as const },
    { label: text.status.qa, value: text.status.pending, tone: 'pending' as const },
  ], [text]);
  const statusItems = statusItemsProp ?? defaultStatusItems;

  const handleLanguageChange = (nextLanguage: DanbiMenuLanguage) => {
    setLanguage(nextLanguage);
    setStoredMenuLanguage(nextLanguage);
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="grid min-h-screen grid-cols-[64px_minmax(0,1fr)] grid-rows-[42px_54px_minmax(0,1fr)_36px]">
        <header className="col-span-2 flex min-w-0 items-center justify-between border-b border-neutral-800 bg-neutral-950 px-3">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/" className="flex h-8 items-center gap-2 rounded border border-neutral-800 px-2 text-sm font-semibold text-neutral-100">
              <span className="grid h-5 w-5 place-items-center rounded bg-emerald-500 text-[10px] text-neutral-950">DB</span>
              <span>Danbi Studio</span>
            </Link>
            <nav className="hidden min-w-0 items-center gap-1 lg:flex" aria-label="Application menu">
              {text.menus.map((menu) => (
                <button
                  key={menu}
                  type="button"
                  className="h-8 rounded px-2 text-sm text-neutral-300 hover:bg-neutral-900 hover:text-neutral-50"
                >
                  {menu}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-xs text-neutral-500 sm:inline">{text.languageLabel}</span>
            <div className="flex rounded border border-neutral-800 bg-neutral-950 p-0.5">
              {(['en', 'ko'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleLanguageChange(item)}
                  className={[
                    'h-7 rounded px-2 text-xs font-medium',
                    language === item
                      ? 'bg-emerald-500 text-neutral-950'
                      : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100',
                  ].join(' ')}
                  aria-pressed={language === item}
                >
                  {item === 'en' ? 'ENG' : 'KOR'}
                </button>
              ))}
            </div>
          </div>
        </header>

        <aside className="row-span-2 border-r border-neutral-800 bg-neutral-950">
          <nav className="flex flex-col items-center gap-2 p-2" aria-label="Tool rail">
            {navigationItems.map((item) => {
              const active = item.id === activeView;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={[
                    'grid h-10 w-10 place-items-center rounded-lg border text-xs font-semibold transition',
                    active
                      ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-100'
                      : 'border-transparent text-neutral-500 hover:border-neutral-700 hover:bg-neutral-900 hover:text-neutral-100',
                  ].join(' ')}
                  aria-label={text.workspaces[item.id]}
                  title={text.workspaces[item.id]}
                >
                  {item.icon}
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="flex min-w-0 items-center justify-between gap-4 border-b border-neutral-800 bg-neutral-950 px-4">
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto custom-scrollbar" aria-label="Workspace tabs">
            {navigationItems.map((item) => {
              const active = item.id === activeView;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={[
                    'inline-flex h-9 shrink-0 items-center rounded-t-lg border border-b-0 px-3 text-sm font-medium transition',
                    active
                      ? 'border-neutral-700 bg-neutral-900 text-neutral-50'
                      : 'border-transparent text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100',
                  ].join(' ')}
                >
                  {text.workspaces[item.id]}
                </Link>
              );
            })}
          </nav>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </section>

        <section className="min-w-0 overflow-auto bg-neutral-950 p-4 custom-scrollbar">
          <div className="mb-4 flex min-w-0 items-end justify-between gap-4 border-b border-neutral-900 pb-3">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-neutral-50">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm text-neutral-500">{subtitle}</p> : null}
            </div>
          </div>
          {children}
        </section>

        <footer className="col-span-2 flex min-w-0 items-center gap-2 overflow-x-auto border-t border-neutral-800 bg-neutral-950 px-3 custom-scrollbar">
          {statusItems.map((item) => (
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
    <section className="rounded border border-neutral-800 bg-neutral-900/40">
      <div className="flex items-center justify-between gap-4 border-b border-neutral-800 bg-neutral-900/70 px-4 py-3">
        <div>
          {eyebrow ? <p className="text-xs font-medium uppercase text-neutral-500">{eyebrow}</p> : null}
          <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
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
    neutral: 'border-neutral-700 text-neutral-300',
    good: 'border-emerald-500/40 text-emerald-200',
    warn: 'border-amber-400/40 text-amber-200',
    pending: 'border-cyan-400/40 text-cyan-200',
  }[tone];

  return (
    <span className={`inline-flex h-7 shrink-0 items-center gap-2 rounded border px-2 text-xs ${toneClass}`}>
      {label ? <span className="text-neutral-500">{label}</span> : null}
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
    ? 'inline-flex h-9 items-center rounded border border-emerald-400/50 bg-emerald-400/10 px-3 text-sm font-medium text-emerald-100 hover:bg-emerald-400/20'
    : 'inline-flex h-9 items-center rounded border border-neutral-700 px-3 text-sm font-medium text-neutral-200 hover:bg-neutral-900';

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function DataList({
  items,
}: {
  items: ShellStatusItem[];
}) {
  return (
    <dl className="divide-y divide-neutral-800">
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`} className="flex items-center justify-between gap-4 py-2">
          <dt className="text-sm text-neutral-400">{item.label}</dt>
          <dd>
            <StatusPill label="" value={item.value} tone={item.tone ?? 'neutral'} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
