import type { CaptionStyle, ClipSpeedRampPoint, EditorAsset, TimelineClip, TimelineTrack } from '../../lib/editor/types';
import type { updateClip, updateClips } from '../../lib/editor/timeline';
import type { WaveformSyncPlan } from '../../lib/editor/audio-sync';
import { CLIP_GAIN_MAX_DB, CLIP_GAIN_MIN_DB, clipGainDbToVolume, clipVolumeToGainDb, formatClipGainDbFromVolume, normalizeClipVolume } from '../../lib/editor/audio-mixer';
import { canvasLayoutLabel, type CanvasLayoutMode } from '../../lib/editor/canvas-layout';
import { resolveMediaBinAssetKindLabel } from '../../lib/editor/media-bin';
import type { MediaAssetHealth } from '../../lib/editor/media-health';
import { formatPreviewSourceMode, resolvePreviewMediaSource } from '../../lib/editor/preview-source';
import { isRenderableMediaAsset } from '../../lib/editor/renderable-media-kind';
import { getAverageSpeed, getSpeedRampSourceDuration, SPEED_RAMP_PRESETS, type SpeedRampPresetId } from '../../lib/editor/speed-ramp';
import type { ClipSelectionPropertySummary } from '../../lib/editor/selection-summary';
import { CLIP_LABEL_COLORS, type MediaCacheJobView } from './editor-view-model';
import { NumberField, ToggleButton } from './editor-form-controls';
import { TitleStyleControls } from './inspector-controls';
import { AssetHealthBadge, CacheJobStatus } from './media-health-cache-panels';

type ClipPatch = Parameters<typeof updateClip>[2];
type ClipsPatch = Parameters<typeof updateClips>[2];
type FadeEdge = 'in' | 'out' | 'both';
type FormatTimecode = (seconds: number, fps: number) => string;
type FormatSignedDelta = (seconds: number) => string;

interface InspectorClipMediaPanelProps {
  clip: TimelineClip;
  asset?: EditorAsset;
  mediaHealth?: MediaAssetHealth;
  cacheJob?: MediaCacheJobView;
  tracks: TimelineTrack[];
  fps: number;
  projectHeight: number;
  summary: ClipSelectionPropertySummary;
  moveTrackOptions: TimelineTrack[];
  isTitleClip: boolean;
  titleText: string;
  selectedAnyHasSpeedRamp: boolean;
  selectedHasSpeedRamp: boolean;
  selectedSpeedRampPoints: ClipSpeedRampPoint[];
  canApplyFreezeFrame: boolean;
  canClearFreezeFrame: boolean;
  canDetachAudio: boolean;
  canRelinkAudio: boolean;
  canUnlinkAudio: boolean;
  canLinkAudio: boolean;
  onClipPatch: (label: string, patch: ClipPatch) => void;
  onSelectedClipsPatch: (label: string, patch: ClipsPatch) => void;
  onMoveSelectedClipsToTrack: (targetTrackId: string) => void;
  onTitleTextPatch: (text: string) => void;
  onTitleStylePatch: (patch: CaptionStyle) => void;
  onInspectorStartChange: (value: number) => void;
  onInspectorDurationChange: (value: number) => void;
  onRetimeSpeedChange: (value: number) => void;
  onApplySpeedRamp: (presetId: SpeedRampPresetId) => void;
  onClearSpeedRamp: () => void;
  onToggleSelectedClipState: (state: 'muted' | 'locked') => void;
  onApplyFreezeFrame: () => void;
  onClearFreezeFrame: () => void;
  onDetachAudio: () => void;
  onRelinkAudio: () => void;
  onUnlinkAudio: () => void;
  onLinkAudio: () => void;
  onRebuildMediaCache?: (asset: EditorAsset) => void | Promise<void>;
  onCancelMediaCache?: (assetId: string) => void | Promise<void>;
  onRetryMediaCache?: (assetId: string) => void | Promise<void>;
  onRelinkAsset?: (assetId: string) => void;
  formatTimecode: FormatTimecode;
}

interface InspectorVisualPanelProps {
  clip: TimelineClip;
  fps: number;
  visualFadeDuration: number;
  visualFadeClipCount: number;
  canApplyCanvasLayout: boolean;
  canApplyVisualFade: boolean;
  canvasLayoutMode: CanvasLayoutMode;
  onVisualFadeDurationChange: (value: number) => void;
  onApplyCanvasLayout: (mode: CanvasLayoutMode) => void;
  onApplyVisualFade: (edge: FadeEdge) => void;
}

interface InspectorAudioPanelProps {
  clip: TimelineClip;
  fps: number;
  audioFadeDuration: number;
  audioFadeClipCount: number;
  canApplyAudioFade: boolean;
  hasAudioSyncPair: boolean;
  canSyncByWaveform: boolean;
  lastAudioSyncPlan: WaveformSyncPlan | null;
  onAudioFadeDurationChange: (value: number) => void;
  onApplyAudioFade: (edge: FadeEdge) => void;
  onSyncByWaveform: (linkAfterSync?: boolean) => void;
  formatSignedEditDelta: FormatSignedDelta;
}

export function InspectorClipMediaPanel({
  clip,
  asset,
  mediaHealth,
  cacheJob,
  tracks,
  fps,
  projectHeight,
  summary,
  moveTrackOptions,
  isTitleClip,
  titleText,
  selectedAnyHasSpeedRamp,
  selectedHasSpeedRamp,
  selectedSpeedRampPoints,
  canApplyFreezeFrame,
  canClearFreezeFrame,
  canDetachAudio,
  canRelinkAudio,
  canUnlinkAudio,
  canLinkAudio,
  onClipPatch,
  onSelectedClipsPatch,
  onMoveSelectedClipsToTrack,
  onTitleTextPatch,
  onTitleStylePatch,
  onInspectorStartChange,
  onInspectorDurationChange,
  onRetimeSpeedChange,
  onApplySpeedRamp,
  onClearSpeedRamp,
  onToggleSelectedClipState,
  onApplyFreezeFrame,
  onClearFreezeFrame,
  onDetachAudio,
  onRelinkAudio,
  onUnlinkAudio,
  onLinkAudio,
  onRebuildMediaCache,
  onCancelMediaCache,
  onRetryMediaCache,
  onRelinkAsset,
  formatTimecode,
}: InspectorClipMediaPanelProps) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Clip</h2>
      <div className="mt-3 grid grid-cols-[1fr_44px] gap-3">
        <label className="block text-xs text-zinc-500">
          Name
          <input
            key={clip.id}
            defaultValue={clip.name}
            onBlur={(event) => {
              if (event.currentTarget.value !== clip.name) {
                onClipPatch('Clip name updated', { name: event.currentTarget.value });
              }
            }}
            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          />
        </label>
        <label className="block text-xs text-zinc-500">
          Label
          <input
            aria-label="Clip label color"
            type="color"
            value={summary.color.value ?? clip.color}
            onChange={(event) => onSelectedClipsPatch('Clip color updated', { color: event.target.value })}
            className={`mt-1 h-[38px] w-full rounded-md border bg-zinc-950 p-1 ${
              summary.color.mixed ? 'border-amber-500' : 'border-zinc-800'
            }`}
          />
        </label>
      </div>
      <label className="mt-3 block text-xs text-zinc-500">
        Track
        <select
          value={clip.trackId}
          disabled={moveTrackOptions.length === 0}
          onChange={(event) => {
            if (event.currentTarget.value !== clip.trackId) {
              onMoveSelectedClipsToTrack(event.currentTarget.value);
            }
          }}
          className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value={clip.trackId}>
            {tracks.find((track) => track.id === clip.trackId)?.name ?? clip.trackId}
          </option>
          {moveTrackOptions.map((track) => (
            <option key={track.id} value={track.id}>{track.name}</option>
          ))}
        </select>
      </label>
      {isTitleClip ? (
        <>
          <label className="mt-3 block text-xs text-zinc-500">
            Title text
            <textarea
              key={`${clip.id}-${asset?.id ?? 'title'}-${titleText}`}
              defaultValue={titleText}
              onBlur={(event) => {
                if (event.currentTarget.value !== titleText) {
                  onTitleTextPatch(event.currentTarget.value);
                }
              }}
              rows={3}
              className="mt-1 w-full resize-y rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
          </label>
          <TitleStyleControls
            clip={clip}
            projectHeight={projectHeight}
            onChange={onTitleStylePatch}
          />
        </>
      ) : null}
      <div className="mt-3 grid grid-cols-8 gap-2">
        {CLIP_LABEL_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Set clip label ${color}`}
            onClick={() => onSelectedClipsPatch('Clip color updated', { color })}
            className={`h-7 rounded border ${summary.color.value === color ? 'border-white' : 'border-zinc-800 hover:border-white/70'}`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <InspectorAssetCacheSection
        asset={asset}
        health={mediaHealth}
        cacheJob={cacheJob}
        onRebuildMediaCache={onRebuildMediaCache}
        onCancelMediaCache={onCancelMediaCache}
        onRetryMediaCache={onRetryMediaCache}
        onRelinkAsset={onRelinkAsset}
      />
      <div className="mt-3 grid grid-cols-2 gap-3">
        <NumberField label="Start" value={clip.start} step={1 / fps} onChange={onInspectorStartChange} />
        <NumberField label="Duration" value={clip.duration} step={1 / fps} min={0.25} onChange={onInspectorDurationChange} />
        <NumberField label="Source In" value={clip.sourceIn} step={1 / fps} min={0} onChange={(value) => onClipPatch('Clip source updated', { sourceIn: value })} />
        <NumberField label="Speed" value={clip.speed} step={0.05} min={0.05} max={8} onChange={onRetimeSpeedChange} />
        <NumberField
          label="Volume"
          value={normalizeClipVolume(summary.volume.value ?? clip.volume)}
          mixed={summary.volume.mixed}
          step={0.05}
          min={0}
          max={2}
          onChange={(value) => onSelectedClipsPatch('Clip volume updated', { volume: normalizeClipVolume(value) })}
        />
        <NumberField
          label="Gain dB"
          value={clipVolumeToGainDb(summary.volume.value ?? clip.volume)}
          mixed={summary.volume.mixed}
          step={0.5}
          min={CLIP_GAIN_MIN_DB}
          max={CLIP_GAIN_MAX_DB}
          onChange={(value) => onSelectedClipsPatch('Clip gain updated', { volume: clipGainDbToVolume(value) })}
        />
        <NumberField
          label="Opacity"
          value={summary.opacity.value ?? clip.opacity}
          mixed={summary.opacity.mixed}
          step={0.05}
          min={0}
          max={1}
          onChange={(value) => onSelectedClipsPatch('Clip opacity updated', { opacity: value })}
        />
      </div>
      <div className="mt-2 text-[11px] text-zinc-500">
        Clip gain {summary.volume.mixed ? 'Mixed' : formatClipGainDbFromVolume(summary.volume.value ?? clip.volume)}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[0.5, 1, 2, 4].map((speed) => (
          <button
            key={speed}
            type="button"
            onClick={() => onRetimeSpeedChange(speed)}
            className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-200 hover:border-emerald-500"
          >
            {speed}x
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Speed Ramp</h3>
          {selectedAnyHasSpeedRamp ? (
            <button type="button" onClick={onClearSpeedRamp} className="text-xs text-rose-300 hover:text-rose-200">
              Clear
            </button>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {SPEED_RAMP_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onApplySpeedRamp(preset.id)}
              className="rounded border border-zinc-800 px-2 py-2 text-[11px] text-zinc-200 hover:border-emerald-500"
            >
              {preset.label}
            </button>
          ))}
        </div>
        {selectedHasSpeedRamp ? (
          <div className="mt-3 space-y-2 text-[11px] text-zinc-400">
            <div className="flex justify-between gap-2">
              <span>Average</span>
              <span className="text-zinc-200">{getAverageSpeed(clip).toFixed(2)}x</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Source use</span>
              <span className="text-zinc-200">{formatTimecode(getSpeedRampSourceDuration(clip), fps)}</span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {selectedSpeedRampPoints.map((point) => (
                <span key={point.id} className="rounded bg-zinc-900 px-2 py-1 tabular-nums">
                  {formatTimecode(point.time, fps)} / {point.speed.toFixed(2)}x
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-2 text-[11px] text-zinc-500">Constant {clip.speed.toFixed(2)}x</div>
        )}
      </div>
      <label className="mt-3 block text-xs text-zinc-500">
        Blend
        <select
          value={summary.blendMode.value ?? ''}
          onChange={(event) => onSelectedClipsPatch('Blend mode updated', { blendMode: event.target.value as TimelineClip['blendMode'] })}
          className={`mt-1 w-full rounded-md border bg-zinc-950 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500 ${
            summary.blendMode.mixed ? 'border-amber-500' : 'border-zinc-800'
          }`}
        >
          {summary.blendMode.mixed ? <option value="">Mixed</option> : null}
          <option value="normal">Normal</option>
          <option value="screen">Screen</option>
          <option value="multiply">Multiply</option>
          <option value="overlay">Overlay</option>
          <option value="add">Add</option>
        </select>
      </label>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <ToggleButton
          label="Reverse"
          active={summary.reversed.value === true}
          mixed={summary.reversed.mixed}
          onClick={() => onSelectedClipsPatch('Clip reverse toggled', {
            reversed: summary.reversed.mixed ? true : summary.reversed.value !== true,
          })}
        />
        <ToggleButton
          label="Clip mute"
          active={summary.muted.value === true}
          mixed={summary.muted.mixed}
          onClick={() => onToggleSelectedClipState('muted')}
        />
        <ToggleButton
          label="Clip lock"
          active={summary.locked.value === true}
          mixed={summary.locked.mixed}
          onClick={() => onToggleSelectedClipState('locked')}
        />
      </div>
      <div className="mt-3 grid grid-cols-[1fr_1fr_auto] items-center gap-2">
        <button
          type="button"
          disabled={!canApplyFreezeFrame}
          onClick={onApplyFreezeFrame}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Freeze here
        </button>
        <button
          type="button"
          disabled={!canClearFreezeFrame}
          onClick={onClearFreezeFrame}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear freeze
        </button>
        <span className="text-[11px] text-zinc-500">
          {clip.freezeFrameTime === undefined ? 'live' : formatTimecode(clip.freezeFrameTime, fps)}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!canDetachAudio}
          onClick={onDetachAudio}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Detach audio
        </button>
        <button
          type="button"
          disabled={!canRelinkAudio}
          onClick={onRelinkAudio}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Relink audio
        </button>
        <button
          type="button"
          disabled={!canUnlinkAudio}
          onClick={onUnlinkAudio}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Unlink V/A
        </button>
        <button
          type="button"
          disabled={!canLinkAudio}
          onClick={onLinkAudio}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Link V/A
        </button>
      </div>
    </div>
  );
}

function InspectorAssetCacheSection({
  asset,
  health,
  cacheJob,
  onRebuildMediaCache,
  onCancelMediaCache,
  onRetryMediaCache,
  onRelinkAsset,
}: {
  asset?: EditorAsset;
  health?: MediaAssetHealth;
  cacheJob?: MediaCacheJobView;
  onRebuildMediaCache?: (asset: EditorAsset) => void | Promise<void>;
  onCancelMediaCache?: (assetId: string) => void | Promise<void>;
  onRetryMediaCache?: (assetId: string) => void | Promise<void>;
  onRelinkAsset?: (assetId: string) => void;
}) {
  if (!asset) {
    return (
      <div className="mt-3 border-t border-zinc-800 pt-3 text-xs text-zinc-500">
        No source asset attached
      </div>
    );
  }

  const previewSource = resolvePreviewMediaSource(asset);
  const canCache = Boolean(onRebuildMediaCache && asset.renderPath && isRenderableMediaAsset(asset));
  const hasActiveCacheJob = cacheJob?.status === 'queued' || cacheJob?.status === 'running';

  return (
    <div className="mt-3 border-t border-zinc-800 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Source Media</h3>
        <span className={`rounded px-2 py-0.5 text-[11px] ${previewSource.mode === 'proxy' ? 'bg-emerald-500/15 text-emerald-200' : previewSource.mode === 'source' ? 'bg-sky-500/15 text-sky-200' : 'bg-rose-500/15 text-rose-200'}`}>
          {formatPreviewSourceMode(previewSource)}
        </span>
      </div>
      <div className="mt-2 min-w-0 truncate text-sm font-medium text-zinc-100">{asset.name}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
        <InspectorMediaPill label="Kind" value={resolveMediaBinAssetKindLabel(asset)} />
        <InspectorMediaPill label="Render" value={asset.renderPath ? 'ready' : 'missing'} tone={asset.renderPath ? 'ok' : 'bad'} />
        <InspectorMediaPill label="Proxy" value={previewSource.hasProxy ? 'ready' : 'missing'} tone={previewSource.hasProxy ? 'ok' : 'warn'} />
        <InspectorMediaPill label="Waveform" value={previewSource.hasWaveform ? 'ready' : 'missing'} tone={previewSource.hasWaveform ? 'ok' : 'warn'} />
      </div>
      <div className="mt-2 truncate text-[11px] text-zinc-500">
        {previewSource.source || 'No preview source'}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!canCache || hasActiveCacheJob}
          onClick={() => {
            if (canCache) {
              void onRebuildMediaCache?.(asset);
            }
          }}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {hasActiveCacheJob ? 'Caching' : 'Cache'}
        </button>
        <button
          type="button"
          disabled={!onRelinkAsset}
          onClick={() => onRelinkAsset?.(asset.id)}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Relink
        </button>
      </div>
      <AssetHealthBadge health={health} />
      {cacheJob ? (
        <CacheJobStatus
          job={cacheJob}
          onCancel={() => void onCancelMediaCache?.(asset.id)}
          onRetry={() => void onRetryMediaCache?.(asset.id)}
        />
      ) : null}
    </div>
  );
}

function InspectorMediaPill({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad';
}) {
  const toneClassName = tone === 'ok'
    ? 'text-emerald-200'
    : tone === 'warn'
      ? 'text-amber-200'
      : tone === 'bad'
        ? 'text-rose-200'
        : 'text-zinc-200';

  return (
    <div className="min-w-0 rounded border border-zinc-800 bg-zinc-950 px-2 py-1">
      <div className="text-[9px] uppercase tracking-normal text-zinc-500">{label}</div>
      <div className={`truncate ${toneClassName}`}>{value}</div>
    </div>
  );
}

export function InspectorVisualPanel({
  clip,
  fps,
  visualFadeDuration,
  visualFadeClipCount,
  canApplyCanvasLayout,
  canApplyVisualFade,
  canvasLayoutMode,
  onVisualFadeDurationChange,
  onApplyCanvasLayout,
  onApplyVisualFade,
}: InspectorVisualPanelProps) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Visual</h2>
        <span className="text-[11px] text-zinc-500">
          {canApplyCanvasLayout
            ? `${canvasLayoutLabel(canvasLayoutMode)} / ${visualFadeClipCount} fade`
            : `${visualFadeClipCount} fade`}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(['fit', 'fill', 'stretch'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            disabled={!canApplyCanvasLayout}
            onClick={() => onApplyCanvasLayout(mode)}
            className={`rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
              canvasLayoutMode === mode
                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-100'
                : 'border-zinc-800 bg-zinc-950 text-zinc-200 hover:border-emerald-500'
            }`}
          >
            {canvasLayoutLabel(mode)}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <NumberField
          label="Fade"
          value={visualFadeDuration}
          step={1 / fps}
          min={0.05}
          max={clip.duration}
          onChange={onVisualFadeDurationChange}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <FadeButton label="Fade in" disabled={!canApplyVisualFade} onClick={() => onApplyVisualFade('in')} />
        <FadeButton label="Fade out" disabled={!canApplyVisualFade} onClick={() => onApplyVisualFade('out')} />
        <FadeButton label="Both" disabled={!canApplyVisualFade} onClick={() => onApplyVisualFade('both')} />
      </div>
    </div>
  );
}

export function InspectorAudioPanel({
  clip,
  fps,
  audioFadeDuration,
  audioFadeClipCount,
  canApplyAudioFade,
  hasAudioSyncPair,
  canSyncByWaveform,
  lastAudioSyncPlan,
  onAudioFadeDurationChange,
  onApplyAudioFade,
  onSyncByWaveform,
  formatSignedEditDelta,
}: InspectorAudioPanelProps) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Audio</h2>
        <span className="text-[11px] text-zinc-500">
          {canApplyAudioFade ? `${audioFadeClipCount} fade` : 'none'}
        </span>
      </div>
      <div className="mt-3">
        <NumberField
          label="Fade"
          value={audioFadeDuration}
          step={1 / fps}
          min={0.05}
          max={clip.duration}
          onChange={onAudioFadeDurationChange}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <FadeButton label="Fade in" disabled={!canApplyAudioFade} onClick={() => onApplyAudioFade('in')} />
        <FadeButton label="Fade out" disabled={!canApplyAudioFade} onClick={() => onApplyAudioFade('out')} />
        <FadeButton label="Both" disabled={!canApplyAudioFade} onClick={() => onApplyAudioFade('both')} />
      </div>
      <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950 p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-lime-300">Waveform sync</span>
          <span className="text-[11px] text-zinc-500">
            {hasAudioSyncPair
              ? canSyncByWaveform ? 'ready' : 'waveform needed'
              : 'select V+A'}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!canSyncByWaveform}
            onClick={() => onSyncByWaveform(false)}
            className="rounded-md border border-lime-700 bg-lime-950/30 px-3 py-2 text-xs font-medium text-lime-200 hover:border-lime-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Sync
          </button>
          <button
            type="button"
            disabled={!canSyncByWaveform}
            onClick={() => onSyncByWaveform(true)}
            className="rounded-md border border-emerald-700 bg-emerald-950/30 px-3 py-2 text-xs font-medium text-emerald-200 hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Sync+Link
          </button>
        </div>
        {lastAudioSyncPlan ? (
          <div className="mt-2 rounded border border-lime-400/20 bg-lime-400/10 px-2 py-1 text-[11px] text-lime-100">
            Offset {formatSignedEditDelta(lastAudioSyncPlan.appliedDelta)} / confidence {lastAudioSyncPlan.confidence.toFixed(2)}
            {lastAudioSyncPlan.warnings[0] ? (
              <div className="mt-1 text-amber-200/80">{lastAudioSyncPlan.warnings[0]}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FadeButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}
