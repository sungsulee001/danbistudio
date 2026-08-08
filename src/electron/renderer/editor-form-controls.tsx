import type { ReactNode } from 'react';

export function NumberField({
  label,
  value,
  mixed = false,
  disabled = false,
  step,
  min,
  max,
  testId,
  onChange,
}: {
  label: string;
  value: number;
  mixed?: boolean;
  disabled?: boolean;
  step: number;
  min?: number;
  max?: number;
  testId?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-xs text-ds-600">
      {label}
      <input
        type="number"
        value={mixed ? '' : Number.isFinite(value) ? Number(value.toFixed(3)) : 0}
        placeholder={mixed ? 'Mixed' : undefined}
        min={min}
        max={max}
        step={step}
        data-testid={testId}
        disabled={disabled}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          if (Number.isFinite(nextValue)) {
            onChange(nextValue);
          }
        }}
        className={`mt-1 w-full rounded-md border bg-paper px-2 py-2 text-sm text-ink outline-none placeholder:text-warn-700 focus:border-accent-500 disabled:cursor-not-allowed disabled:opacity-50 ${
          mixed ? 'border-warn-500' : 'border-ds-200'
        }`}
      />
    </label>
  );
}

export function ToggleButton({
  label,
  active,
  mixed = false,
  testId,
  onClick,
}: {
  label: string;
  active: boolean;
  mixed?: boolean;
  testId?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-9 items-center justify-center rounded-md border px-3 py-2 text-sm ${
        mixed
          ? 'border-warn-500 bg-warn-500/10 text-warn-800'
          : active
          ? 'border-accent-500 bg-accent-500/10 text-accent-800'
          : 'border-ds-300 bg-surface text-ds-700 hover:border-accent-500'
      }`}
    >
      {mixed ? `${label} Mixed` : label}
    </button>
  );
}

export function ToolButton({
  label,
  icon,
  onClick,
  disabled = false,
  testId,
  compact = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      data-density={compact ? 'compact' : 'normal'}
      className={`inline-flex items-center justify-center gap-2 rounded-md border border-ds-300 bg-surface text-sm text-ink hover:border-accent-500 hover:bg-ds-200 disabled:cursor-not-allowed disabled:border-ds-200 disabled:text-ds-400 disabled:hover:bg-surface ${
        compact ? 'min-h-9 min-w-9 px-2 py-2' : 'min-h-10 px-3 py-2'
      }`}
      title={label}
    >
      {icon}
      <span className={compact ? 'sr-only' : undefined}>{label}</span>
    </button>
  );
}
