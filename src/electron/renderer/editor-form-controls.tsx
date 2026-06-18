import type { ReactNode } from 'react';

export function NumberField({
  label,
  value,
  mixed = false,
  disabled = false,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  mixed?: boolean;
  disabled?: boolean;
  step: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-xs text-zinc-500">
      {label}
      <input
        type="number"
        value={mixed ? '' : Number.isFinite(value) ? Number(value.toFixed(3)) : 0}
        placeholder={mixed ? 'Mixed' : undefined}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          if (Number.isFinite(nextValue)) {
            onChange(nextValue);
          }
        }}
        className={`mt-1 w-full rounded-md border bg-zinc-950 px-2 py-2 text-sm text-zinc-100 outline-none placeholder:text-amber-300 focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 ${
          mixed ? 'border-amber-500' : 'border-zinc-800'
        }`}
      />
    </label>
  );
}

export function ToggleButton({
  label,
  active,
  mixed = false,
  onClick,
}: {
  label: string;
  active: boolean;
  mixed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-9 items-center justify-center rounded-md border px-3 py-2 text-sm ${
        mixed
          ? 'border-amber-500 bg-amber-500/10 text-amber-200'
          : active
          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-200'
          : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-emerald-500'
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
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 hover:border-emerald-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-600 disabled:hover:bg-zinc-900"
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
