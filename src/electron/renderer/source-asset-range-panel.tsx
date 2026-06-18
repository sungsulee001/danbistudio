import { resolveMediaBinAssetKindLabel } from '../../lib/editor/media-bin';
import type { EditorAsset } from '../../lib/editor/types';
import { NumberField } from './editor-form-controls';
import type { SourceRange } from './editor-view-model';
import type { SourcePatchTrackOption } from './track-workflow-helpers';

export function SourceAssetRangePanel({
  asset,
  range,
  assetBin,
  fps,
  sourceDuration,
  markedRange,
  playhead,
  hasPrimaryPatch,
  hasAudioPatch,
  primaryPatchEnabled,
  audioPatchEnabled,
  primaryPatchTrackId,
  audioPatchTrackId,
  primaryPatchTrackName,
  audioPatchTrackName,
  primaryPatchTrackOptions,
  audioPatchTrackOptions,
  canReplaceSelected,
  onAssetBinChange,
  onRangePatch,
  onTogglePrimaryPatch,
  onToggleAudioPatch,
  onPrimaryPatchTrackChange,
  onAudioPatchTrackChange,
  onResetRange,
  onMatchMarkedRange,
  onCreateSubclip,
  onInsert,
  onOverwrite,
  onReplaceSelected,
}: {
  asset: EditorAsset;
  range: SourceRange;
  assetBin: string;
  fps: number;
  sourceDuration: number;
  markedRange: { start: number; end: number } | null;
  playhead: number;
  hasPrimaryPatch: boolean;
  hasAudioPatch: boolean;
  primaryPatchEnabled: boolean;
  audioPatchEnabled: boolean;
  primaryPatchTrackId?: string;
  audioPatchTrackId?: string;
  primaryPatchTrackName?: string;
  audioPatchTrackName?: string;
  primaryPatchTrackOptions: SourcePatchTrackOption[];
  audioPatchTrackOptions: SourcePatchTrackOption[];
  canReplaceSelected: boolean;
  onAssetBinChange: (binName: string) => void;
  onRangePatch: (patch: Partial<SourceRange>) => void;
  onTogglePrimaryPatch: () => void;
  onToggleAudioPatch: () => void;
  onPrimaryPatchTrackChange: (trackId: string) => void;
  onAudioPatchTrackChange: (trackId: string) => void;
  onResetRange: () => void;
  onMatchMarkedRange: () => void;
  onCreateSubclip: () => void;
  onInsert: () => void;
  onOverwrite: () => void;
  onReplaceSelected: () => void;
}) {
  return (
    <div className="mt-3 rounded-md border border-emerald-900/70 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Source</h3>
        <span className="rounded bg-zinc-800 px-2 py-1 text-[11px] uppercase text-zinc-400">
          {resolveMediaBinAssetKindLabel(asset)}
        </span>
      </div>
      <div className="mt-2 truncate text-sm font-medium text-zinc-100">{asset.name}</div>
      <label className="mt-3 block text-xs text-zinc-500">
        Bin
        <input
          key={`${asset.id}-${assetBin}`}
          defaultValue={assetBin}
          onBlur={(event) => onAssetBinChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
          className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
        />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <NumberField
          label="Source In"
          value={range.in}
          step={1 / fps}
          min={0}
          max={asset.duration}
          onChange={(value) => onRangePatch({ in: value })}
        />
        <NumberField
          label="Source Out"
          value={range.out}
          step={1 / fps}
          min={0}
          max={asset.duration}
          onChange={(value) => onRangePatch({ out: value })}
        />
      </div>
      <dl className="mt-3 space-y-2 text-xs">
        <Readout label="Source len" value={formatTimecode(sourceDuration, fps)} />
        <Readout
          label="Target"
          value={markedRange
            ? `${formatTimecode(markedRange.start, fps)} - ${formatTimecode(markedRange.end, fps)}`
            : `Playhead ${formatTimecode(playhead, fps)}`}
        />
      </dl>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!hasPrimaryPatch}
          onClick={onTogglePrimaryPatch}
          className={`rounded border px-2 py-2 text-xs ${
            primaryPatchEnabled && hasPrimaryPatch
              ? 'border-emerald-500 bg-emerald-950/30 text-emerald-200'
              : 'border-zinc-700 text-zinc-400 disabled:cursor-not-allowed disabled:opacity-40'
          }`}
        >
          V {primaryPatchTrackName ?? 'None'}
        </button>
        <button
          type="button"
          disabled={!hasAudioPatch}
          onClick={onToggleAudioPatch}
          className={`rounded border px-2 py-2 text-xs ${
            audioPatchEnabled && hasAudioPatch
              ? 'border-lime-500 bg-lime-950/30 text-lime-200'
              : 'border-zinc-700 text-zinc-400 disabled:cursor-not-allowed disabled:opacity-40'
          }`}
        >
          A {audioPatchTrackName ?? 'None'}
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <SourcePatchTrackSelect
          label="V target"
          value={primaryPatchTrackId}
          options={primaryPatchTrackOptions}
          disabled={!hasPrimaryPatch || primaryPatchTrackOptions.every((option) => option.disabled)}
          emptyLabel={hasPrimaryPatch ? 'No editable V track' : 'No V source'}
          onChange={onPrimaryPatchTrackChange}
        />
        <SourcePatchTrackSelect
          label="A target"
          value={audioPatchTrackId}
          options={audioPatchTrackOptions}
          disabled={!hasAudioPatch || audioPatchTrackOptions.every((option) => option.disabled)}
          emptyLabel={hasAudioPatch ? 'No editable A track' : 'No A source'}
          onChange={onAudioPatchTrackChange}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onResetRange}
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-emerald-500"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onMatchMarkedRange}
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-emerald-500"
        >
          Match marks
        </button>
        <button
          type="button"
          onClick={onCreateSubclip}
          disabled={sourceDuration <= 0.05}
          className="col-span-2 rounded border border-violet-700 bg-violet-950/30 px-2 py-2 text-xs font-medium text-violet-200 hover:border-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Create subclip
        </button>
        <button
          type="button"
          onClick={onInsert}
          disabled={sourceDuration <= 0}
          className="rounded border border-emerald-700 bg-emerald-950/40 px-2 py-2 text-xs font-medium text-emerald-200 hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          3P Insert
        </button>
        <button
          type="button"
          onClick={onOverwrite}
          disabled={sourceDuration <= 0}
          className="rounded border border-sky-700 bg-sky-950/40 px-2 py-2 text-xs font-medium text-sky-200 hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          3P Overwrite
        </button>
        <button
          type="button"
          onClick={onReplaceSelected}
          disabled={!canReplaceSelected || sourceDuration <= 0}
          className="col-span-2 rounded border border-amber-700 bg-amber-950/30 px-2 py-2 text-xs font-medium text-amber-200 hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Replace selected
        </button>
      </div>
    </div>
  );
}

function SourcePatchTrackSelect({
  label,
  value,
  options,
  disabled,
  emptyLabel,
  onChange,
}: {
  label: string;
  value?: string;
  options: SourcePatchTrackOption[];
  disabled: boolean;
  emptyLabel: string;
  onChange: (trackId: string) => void;
}) {
  const selectedValue = value && options.some((option) => option.id === value) ? value : '';

  return (
    <label className="block text-[11px] text-zinc-500">
      {label}
      <select
        value={selectedValue}
        disabled={disabled}
        onChange={(event) => {
          if (event.currentTarget.value) {
            onChange(event.currentTarget.value);
          }
        }}
        className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id} disabled={option.disabled}>
            {option.name}{option.disabledReason ? ` (${option.disabledReason})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="truncate text-right text-zinc-200">{value}</dd>
    </div>
  );
}

function formatTimecode(seconds: number, fps: number): string {
  const safeSeconds = Math.max(0, seconds);
  const wholeSeconds = Math.floor(safeSeconds);
  const frames = Math.round((safeSeconds - wholeSeconds) * fps);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;

  return `${padTime(hours)}:${padTime(minutes)}:${padTime(secs)}:${padTime(Math.min(frames, fps - 1))}`;
}

function padTime(value: number): string {
  return Math.floor(value).toString().padStart(2, '0');
}
