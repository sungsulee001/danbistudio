import { useEffect, useRef } from 'react';
import type { EditorCommandId } from '../../lib/editor/command-registry';
import { resolveCommandPaletteNavigation, type CommandPaletteItem, type CommandPaletteItemPayload } from './command-palette-helpers';

export function CommandPalette({
  open,
  query,
  items,
  activeIndex,
  resultCount,
  hiddenCount,
  hiddenLabel,
  onQueryChange,
  onActiveIndexChange,
  onRunCommand,
  onClose,
}: {
  open: boolean;
  query: string;
  items: CommandPaletteItem[];
  activeIndex: number;
  resultCount: number;
  hiddenCount: number;
  hiddenLabel?: string;
  onQueryChange: (query: string) => void;
  onActiveIndexChange: (index: number) => void;
  onRunCommand: (commandId: EditorCommandId, payload?: CommandPaletteItemPayload) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const activeItem = activeIndex >= 0 ? items[activeIndex] : undefined;
  const resultLabel = formatCommandPaletteResultLabel(resultCount, query);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 py-16 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-2xl overflow-hidden rounded-md border border-zinc-700 bg-zinc-950 shadow-2xl"
      >
        <div className="border-b border-zinc-800 p-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              onQueryChange(event.currentTarget.value);
              onActiveIndexChange(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
              }

              if (event.key === 'ArrowDown') {
                event.preventDefault();
                onActiveIndexChange(resolveCommandPaletteNavigation({
                  currentIndex: activeIndex,
                  itemCount: items.length,
                  direction: 'next',
                }));
                return;
              }

              if (event.key === 'ArrowUp') {
                event.preventDefault();
                onActiveIndexChange(resolveCommandPaletteNavigation({
                  currentIndex: activeIndex,
                  itemCount: items.length,
                  direction: 'previous',
                }));
                return;
              }

              if (event.key === 'Home') {
                event.preventDefault();
                onActiveIndexChange(resolveCommandPaletteNavigation({
                  currentIndex: activeIndex,
                  itemCount: items.length,
                  direction: 'first',
                }));
                return;
              }

              if (event.key === 'End') {
                event.preventDefault();
                onActiveIndexChange(resolveCommandPaletteNavigation({
                  currentIndex: activeIndex,
                  itemCount: items.length,
                  direction: 'last',
                }));
                return;
              }

              if (event.key === 'Enter' && activeItem) {
                event.preventDefault();
                onRunCommand(activeItem.id, activeItem.payload);
              }
            }}
            placeholder="Search commands"
            className="h-11 w-full rounded border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
          />
          <div className="mt-2 text-xs text-zinc-500" aria-live="polite">
            {resultLabel}
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {items.length > 0 ? (
            items.map((item, index) => (
              <button
                key={item.key}
                type="button"
                onMouseEnter={() => onActiveIndexChange(index)}
                onClick={() => onRunCommand(item.id, item.payload)}
                className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded px-3 py-2 text-left ${
                  index === activeIndex
                    ? 'bg-emerald-500/15 text-emerald-100'
                    : 'text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-zinc-500">{item.group} / {item.id}</span>
                </span>
                <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-300">
                  {item.keys || 'no key'}
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-8 text-center text-sm text-zinc-500">No matching command</div>
          )}
          {hiddenCount > 0 && hiddenLabel ? (
            <div className="px-3 py-2 text-xs text-zinc-500">{hiddenLabel}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatCommandPaletteResultLabel(resultCount: number, query: string): string {
  const noun = query.trim() ? 'result' : 'command';
  return `${resultCount} ${resultCount === 1 ? noun : `${noun}s`}`;
}
