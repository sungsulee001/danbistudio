import type { CaptionStyle, ClipSpeedRampPoint, EditorAsset, TimelineClip, TimelineTrack } from '../../lib/editor/types';
import type { DanbiMenuLanguage } from '../../lib/editor/menu-language';
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
import { useMenuLanguage } from './use-menu-language';

type ClipPatch = Parameters<typeof updateClip>[2];
type ClipsPatch = Parameters<typeof updateClips>[2];
type FadeEdge = 'in' | 'out' | 'both';
type FormatTimecode = (seconds: number, fps: number) => string;
type FormatSignedDelta = (seconds: number) => string;

const inspectorMediaText: Record<DanbiMenuLanguage, {
  add: string;
  audio: string;
  audioFadeNone: string;
  audioNeeded: string;
  average: string;
  blend: string;
  both: string;
  cache: string;
  caching: string;
  clear: string;
  clearFreeze: string;
  clip: string;
  clipLabel: string;
  clipLock: string;
  clipMute: string;
  confidence: string;
  constant: string;
  detachAudio: string;
  duration: string;
  fade: string;
  fadeIn: string;
  fadeOut: string;
  freezeHere: string;
  gainDb: string;
  kind: string;
  labelColor: string;
  length: string;
  linkVa: string;
  live: string;
  mediaMissing: string;
  mixed: string;
  missing: string;
  name: string;
  noPreviewSource: string;
  opacity: string;
  offset: string;
  proxy: string;
  ready: string;
  relink: string;
  relinkAudio: string;
  render: string;
  reverse: string;
  sourceIn: string;
  sourceMedia: string;
  sourceUse: string;
  speed: string;
  speedRamp: string;
  start: string;
  sync: string;
  syncLink: string;
  syncReady: string;
  titleText: string;
  track: string;
  unlinkVa: string;
  visual: string;
  volume: string;
  waveform: string;
  waveformNeeded: string;
  waveformSync: string;
}> = {
  en: {
    add: 'Add',
    audio: 'Audio',
    audioFadeNone: 'none',
    audioNeeded: 'select V+A',
    average: 'Average',
    blend: 'Blend',
    both: 'Both',
    cache: 'Cache',
    caching: 'Caching',
    clear: 'Clear',
    clearFreeze: 'Clear freeze',
    clip: 'Clip',
    clipLabel: 'Label',
    clipLock: 'Clip lock',
    clipMute: 'Clip mute',
    confidence: 'confidence',
    constant: 'Constant',
    detachAudio: 'Detach audio',
    duration: 'Duration',
    fade: 'Fade',
    fadeIn: 'Fade in',
    fadeOut: 'Fade out',
    freezeHere: 'Freeze here',
    gainDb: 'Gain dB',
    kind: 'Kind',
    labelColor: 'Clip label color',
    length: 'Length',
    linkVa: 'Link V/A',
    live: 'live',
    mediaMissing: 'No source asset attached',
    mixed: 'Mixed',
    missing: 'missing',
    name: 'Name',
    noPreviewSource: 'No preview source',
    opacity: 'Opacity',
    offset: 'Offset',
    proxy: 'Proxy',
    ready: 'ready',
    relink: 'Relink',
    relinkAudio: 'Relink audio',
    render: 'Render',
    reverse: 'Reverse',
    sourceIn: 'Source In',
    sourceMedia: 'Source Media',
    sourceUse: 'Source use',
    speed: 'Speed',
    speedRamp: 'Speed Ramp',
    start: 'Start',
    sync: 'Sync',
    syncLink: 'Sync+Link',
    syncReady: 'ready',
    titleText: 'Title text',
    track: 'Track',
    unlinkVa: 'Unlink V/A',
    visual: 'Visual',
    volume: 'Volume',
    waveform: 'Waveform',
    waveformNeeded: 'waveform needed',
    waveformSync: 'Waveform sync',
  },
  ko: {
    add: '더하기',
    audio: '오디오',
    audioFadeNone: '없음',
    audioNeeded: 'V+A 선택',
    average: '평균',
    blend: '블렌드',
    both: '둘 다',
    cache: '캐시',
    caching: '캐시 중',
    clear: '해제',
    clearFreeze: '프리즈 해제',
    clip: '클립',
    clipLabel: '라벨',
    clipLock: '클립 잠금',
    clipMute: '클립 음소거',
    confidence: '신뢰도',
    constant: '고정',
    detachAudio: '오디오 분리',
    duration: '길이',
    fade: '페이드',
    fadeIn: '페이드 인',
    fadeOut: '페이드 아웃',
    freezeHere: '현재 프레임 고정',
    gainDb: '게인 dB',
    kind: '종류',
    labelColor: '클립 라벨 색상',
    length: '길이',
    linkVa: 'V/A 연결',
    live: '라이브',
    mediaMissing: '연결된 소스 에셋 없음',
    mixed: '혼합',
    missing: '없음',
    name: '이름',
    noPreviewSource: '프리뷰 소스 없음',
    opacity: '불투명도',
    offset: '오프셋',
    proxy: '프록시',
    ready: '준비됨',
    relink: '다시 연결',
    relinkAudio: '오디오 다시 연결',
    render: '렌더',
    reverse: '역재생',
    sourceIn: '소스 인',
    sourceMedia: '소스 미디어',
    sourceUse: '소스 사용',
    speed: '속도',
    speedRamp: '속도 램프',
    start: '시작',
    sync: '싱크',
    syncLink: '싱크+연결',
    syncReady: '준비됨',
    titleText: '타이틀 텍스트',
    track: '트랙',
    unlinkVa: 'V/A 해제',
    visual: '비주얼',
    volume: '볼륨',
    waveform: '파형',
    waveformNeeded: '파형 필요',
    waveformSync: '파형 싱크',
  },
};

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
  const language = useMenuLanguage();
  const text = inspectorMediaText[language];

  return (
    <div className="rounded-md border border-ds-200 bg-surface p-3">
      <h2 className="text-kicker font-heading font-semibold uppercase text-ds-600">{text.clip}</h2>
      <div className="mt-3 grid grid-cols-[1fr_44px] gap-3">
        <label className="block text-xs text-ds-600">
          {text.name}
          <input
            key={clip.id}
            defaultValue={clip.name}
            onBlur={(event) => {
              if (event.currentTarget.value !== clip.name) {
                onClipPatch('Clip name updated', { name: event.currentTarget.value });
              }
            }}
            className="mt-1 w-full rounded-md border border-ds-200 bg-paper px-2 py-2 text-sm text-ink outline-none focus:border-accent-500"
          />
        </label>
        <label className="block text-xs text-ds-600">
          {text.clipLabel}
          <input
            aria-label={text.labelColor}
            type="color"
            value={summary.color.value ?? clip.color}
            onChange={(event) => onSelectedClipsPatch('Clip color updated', { color: event.target.value })}
            className={`mt-1 h-[38px] w-full rounded-md border bg-paper p-1 ${
              summary.color.mixed ? 'border-warn-500' : 'border-ds-200'
            }`}
          />
        </label>
      </div>
      <label className="mt-3 block text-xs text-ds-600">
        {text.track}
        <select
          value={clip.trackId}
          disabled={moveTrackOptions.length === 0}
          onChange={(event) => {
            if (event.currentTarget.value !== clip.trackId) {
              onMoveSelectedClipsToTrack(event.currentTarget.value);
            }
          }}
          className="mt-1 w-full rounded-md border border-ds-200 bg-paper px-2 py-2 text-sm text-ink outline-none focus:border-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
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
          <label className="mt-3 block text-xs text-ds-600">
            {text.titleText}
            <textarea
              key={`${clip.id}-${asset?.id ?? 'title'}-${titleText}`}
              defaultValue={titleText}
              onBlur={(event) => {
                if (event.currentTarget.value !== titleText) {
                  onTitleTextPatch(event.currentTarget.value);
                }
              }}
              rows={3}
              className="mt-1 w-full resize-y rounded-md border border-ds-200 bg-paper px-2 py-2 text-sm text-ink outline-none focus:border-accent-500"
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
            className={`h-7 rounded border ${summary.color.value === color ? 'border-white' : 'border-ds-200 hover:border-white/70'}`}
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
        <NumberField label={text.start} value={clip.start} step={1 / fps} onChange={onInspectorStartChange} />
        <NumberField label={text.duration} value={clip.duration} step={1 / fps} min={0.25} onChange={onInspectorDurationChange} />
        <NumberField label={text.sourceIn} value={clip.sourceIn} step={1 / fps} min={0} onChange={(value) => onClipPatch('Clip source updated', { sourceIn: value })} />
        <NumberField label={text.speed} value={clip.speed} step={0.05} min={0.05} max={8} onChange={onRetimeSpeedChange} />
        <NumberField
          label={text.volume}
          value={normalizeClipVolume(summary.volume.value ?? clip.volume)}
          mixed={summary.volume.mixed}
          step={0.05}
          min={0}
          max={2}
          onChange={(value) => onSelectedClipsPatch('Clip volume updated', { volume: normalizeClipVolume(value) })}
        />
        <NumberField
          label={text.gainDb}
          value={clipVolumeToGainDb(summary.volume.value ?? clip.volume)}
          mixed={summary.volume.mixed}
          step={0.5}
          min={CLIP_GAIN_MIN_DB}
          max={CLIP_GAIN_MAX_DB}
          onChange={(value) => onSelectedClipsPatch('Clip gain updated', { volume: clipGainDbToVolume(value) })}
        />
        <NumberField
          label={text.opacity}
          value={summary.opacity.value ?? clip.opacity}
          mixed={summary.opacity.mixed}
          step={0.05}
          min={0}
          max={1}
          onChange={(value) => onSelectedClipsPatch('Clip opacity updated', { opacity: value })}
        />
      </div>
      <div className="mt-2 text-meta text-ds-600">
        {text.gainDb} {summary.volume.mixed ? text.mixed : formatClipGainDbFromVolume(summary.volume.value ?? clip.volume)}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[0.5, 1, 2, 4].map((speed) => (
          <button
            key={speed}
            type="button"
            onClick={() => onRetimeSpeedChange(speed)}
            className="rounded-md border border-ds-200 bg-paper px-2 py-2 text-xs text-ds-800 hover:border-accent-500"
          >
            {speed}x
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-md border border-ds-200 bg-paper p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-kicker font-heading font-semibold uppercase text-ds-600">{text.speedRamp}</h3>
          {selectedAnyHasSpeedRamp ? (
            <button type="button" onClick={onClearSpeedRamp} className="text-xs text-danger-700 hover:text-danger-800">
              {text.clear}
            </button>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {SPEED_RAMP_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onApplySpeedRamp(preset.id)}
              className="rounded border border-ds-200 px-2 py-2 text-meta text-ds-800 hover:border-accent-500"
            >
              {preset.label}
            </button>
          ))}
        </div>
        {selectedHasSpeedRamp ? (
          <div className="mt-3 space-y-2 text-meta text-ds-700">
            <div className="flex justify-between gap-2">
              <span>{text.average}</span>
              <span className="text-ds-800">{getAverageSpeed(clip).toFixed(2)}x</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>{text.sourceUse}</span>
              <span className="text-ds-800">{formatTimecode(getSpeedRampSourceDuration(clip), fps)}</span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {selectedSpeedRampPoints.map((point) => (
                <span key={point.id} className="rounded bg-surface px-2 py-1 tabular-nums">
                  {formatTimecode(point.time, fps)} / {point.speed.toFixed(2)}x
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-2 text-meta text-ds-600">{text.constant} {clip.speed.toFixed(2)}x</div>
        )}
      </div>
      <label className="mt-3 block text-xs text-ds-600">
        {text.blend}
        <select
          value={summary.blendMode.value ?? ''}
          onChange={(event) => onSelectedClipsPatch('Blend mode updated', { blendMode: event.target.value as TimelineClip['blendMode'] })}
          className={`mt-1 w-full rounded-md border bg-paper px-2 py-2 text-sm text-ink outline-none focus:border-accent-500 ${
            summary.blendMode.mixed ? 'border-warn-500' : 'border-ds-200'
          }`}
        >
          {summary.blendMode.mixed ? <option value="">{text.mixed}</option> : null}
          <option value="normal">{language === 'ko' ? '기본' : 'Normal'}</option>
          <option value="screen">{language === 'ko' ? '스크린' : 'Screen'}</option>
          <option value="multiply">{language === 'ko' ? '곱하기' : 'Multiply'}</option>
          <option value="overlay">{language === 'ko' ? '오버레이' : 'Overlay'}</option>
          <option value="add">{text.add}</option>
        </select>
      </label>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <ToggleButton
          label={text.reverse}
          active={summary.reversed.value === true}
          mixed={summary.reversed.mixed}
          onClick={() => onSelectedClipsPatch('Clip reverse toggled', {
            reversed: summary.reversed.mixed ? true : summary.reversed.value !== true,
          })}
        />
        <ToggleButton
          label={text.clipMute}
          active={summary.muted.value === true}
          mixed={summary.muted.mixed}
          onClick={() => onToggleSelectedClipState('muted')}
        />
        <ToggleButton
          label={text.clipLock}
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
          className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-sm text-ds-800 hover:border-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {text.freezeHere}
        </button>
        <button
          type="button"
          disabled={!canClearFreezeFrame}
          onClick={onClearFreezeFrame}
          className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-sm text-ds-800 hover:border-warn-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {text.clearFreeze}
        </button>
        <span className="text-meta text-ds-600">
          {clip.freezeFrameTime === undefined ? text.live : formatTimecode(clip.freezeFrameTime, fps)}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!canDetachAudio}
          onClick={onDetachAudio}
          className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-sm text-ds-800 hover:border-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {text.detachAudio}
        </button>
        <button
          type="button"
          disabled={!canRelinkAudio}
          onClick={onRelinkAudio}
          className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-sm text-ds-800 hover:border-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {text.relinkAudio}
        </button>
        <button
          type="button"
          disabled={!canUnlinkAudio}
          onClick={onUnlinkAudio}
          className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-sm text-ds-800 hover:border-warn-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {text.unlinkVa}
        </button>
        <button
          type="button"
          disabled={!canLinkAudio}
          onClick={onLinkAudio}
          className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-sm text-ds-800 hover:border-info-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {text.linkVa}
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
  const language = useMenuLanguage();
  const text = inspectorMediaText[language];

  if (!asset) {
    return (
      <div className="mt-3 border-t border-ds-200 pt-3 text-xs text-ds-600">
        {text.mediaMissing}
      </div>
    );
  }

  const previewSource = resolvePreviewMediaSource(asset);
  const canCache = Boolean(onRebuildMediaCache && asset.renderPath && isRenderableMediaAsset(asset));
  const hasActiveCacheJob = cacheJob?.status === 'queued' || cacheJob?.status === 'running';

  return (
    <div className="mt-3 border-t border-ds-200 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-kicker font-heading font-semibold uppercase text-ds-600">{text.sourceMedia}</h3>
        <span className={`rounded px-2 py-0.5 text-meta ${previewSource.mode === 'proxy' ? 'bg-accent-500/15 text-accent-800' : previewSource.mode === 'source' ? 'bg-info-500/15 text-info-800' : 'bg-danger-500/15 text-danger-800'}`}>
          {formatPreviewSourceMode(previewSource)}
        </span>
      </div>
      <div className="mt-2 min-w-0 truncate text-sm font-medium text-ink">{asset.name}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-meta text-ds-700">
        <InspectorMediaPill label={text.kind} value={formatInspectorAssetKind(asset, language)} />
        <InspectorMediaPill label={text.render} value={asset.renderPath ? text.ready : text.missing} tone={asset.renderPath ? 'ok' : 'bad'} />
        <InspectorMediaPill label={text.proxy} value={previewSource.hasProxy ? text.ready : text.missing} tone={previewSource.hasProxy ? 'ok' : 'warn'} />
        <InspectorMediaPill label={text.waveform} value={previewSource.hasWaveform ? text.ready : text.missing} tone={previewSource.hasWaveform ? 'ok' : 'warn'} />
      </div>
      <div className="mt-2 truncate text-meta text-ds-600">
        {previewSource.source || text.noPreviewSource}
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
          className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-xs text-ds-800 hover:border-info-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {hasActiveCacheJob ? text.caching : text.cache}
        </button>
        <button
          type="button"
          disabled={!onRelinkAsset}
          onClick={() => onRelinkAsset?.(asset.id)}
          className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-xs text-ds-800 hover:border-warn-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {text.relink}
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
    ? 'text-accent-800'
    : tone === 'warn'
      ? 'text-warn-800'
      : tone === 'bad'
        ? 'text-danger-800'
        : 'text-ds-800';

  return (
    <div className="min-w-0 rounded border border-ds-200 bg-paper px-2 py-1">
      <div className="text-micro uppercase tracking-normal text-ds-600">{label}</div>
      <div className={`truncate ${toneClassName}`}>{value}</div>
    </div>
  );
}

function formatInspectorAssetKind(asset: EditorAsset, language: DanbiMenuLanguage): string {
  if (language !== 'ko') {
    return resolveMediaBinAssetKindLabel(asset);
  }

  switch (asset.kind) {
    case 'video':
      return '비디오';
    case 'audio':
      return '오디오';
    case 'image':
      return '이미지';
    case 'text':
      return '텍스트';
    case 'ai':
      return 'AI';
    case 'effect':
      return '효과';
    default:
      return resolveMediaBinAssetKindLabel(asset);
  }
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
  const language = useMenuLanguage();
  const text = inspectorMediaText[language];

  return (
    <div className="rounded-md border border-ds-200 bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-kicker font-heading font-semibold uppercase text-ds-600">{text.visual}</h2>
        <span className="text-meta text-ds-600">
          {canApplyCanvasLayout
            ? `${canvasLayoutLabel(canvasLayoutMode)} / ${visualFadeClipCount} ${text.fade}`
            : `${visualFadeClipCount} ${text.fade}`}
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
                ? 'border-accent-500 bg-accent-500/15 text-accent-900'
                : 'border-ds-200 bg-paper text-ds-800 hover:border-accent-500'
            }`}
          >
            {canvasLayoutLabel(mode)}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <NumberField
          label={text.fade}
          value={visualFadeDuration}
          step={1 / fps}
          min={0.05}
          max={clip.duration}
          onChange={onVisualFadeDurationChange}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <FadeButton label={text.fadeIn} disabled={!canApplyVisualFade} onClick={() => onApplyVisualFade('in')} />
        <FadeButton label={text.fadeOut} disabled={!canApplyVisualFade} onClick={() => onApplyVisualFade('out')} />
        <FadeButton label={text.both} disabled={!canApplyVisualFade} onClick={() => onApplyVisualFade('both')} />
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
  const language = useMenuLanguage();
  const text = inspectorMediaText[language];
  const syncState = hasAudioSyncPair
    ? canSyncByWaveform ? 'ready' : 'waveform-needed'
    : 'select-video-audio';

  return (
    <div
      className="rounded-md border border-ds-200 bg-surface p-3"
      data-testid="inspector-audio-panel"
      data-clip-id={clip.id}
      data-can-apply-audio-fade={canApplyAudioFade ? 'true' : 'false'}
      data-audio-fade-clip-count={audioFadeClipCount}
      data-has-audio-sync-pair={hasAudioSyncPair ? 'true' : 'false'}
      data-can-sync-by-waveform={canSyncByWaveform ? 'true' : 'false'}
      data-waveform-sync-state={syncState}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-kicker font-heading font-semibold uppercase text-ds-600">{text.audio}</h2>
        <span className="text-meta text-ds-600" data-testid="inspector-audio-fade-state">
          {canApplyAudioFade ? `${audioFadeClipCount} ${text.fade}` : text.audioFadeNone}
        </span>
      </div>
      <div className="mt-3">
        <NumberField
          label={text.fade}
          value={audioFadeDuration}
          step={1 / fps}
          min={0.05}
          max={clip.duration}
          testId="inspector-audio-fade-duration"
          onChange={onAudioFadeDurationChange}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <FadeButton testId="inspector-audio-fade-in" label={text.fadeIn} disabled={!canApplyAudioFade} onClick={() => onApplyAudioFade('in')} />
        <FadeButton testId="inspector-audio-fade-out" label={text.fadeOut} disabled={!canApplyAudioFade} onClick={() => onApplyAudioFade('out')} />
        <FadeButton testId="inspector-audio-fade-both" label={text.both} disabled={!canApplyAudioFade} onClick={() => onApplyAudioFade('both')} />
      </div>
      <div
        className="mt-3 rounded-md border border-ds-200 bg-paper p-2"
        data-testid="inspector-audio-waveform-sync"
        data-waveform-sync-state={syncState}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-meta font-semibold uppercase tracking-wide text-accent-700">{text.waveformSync}</span>
          <span className="text-meta text-ds-600" data-testid="inspector-audio-waveform-sync-state">
            {hasAudioSyncPair
              ? canSyncByWaveform ? text.syncReady : text.waveformNeeded
              : text.audioNeeded}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="inspector-audio-sync"
            disabled={!canSyncByWaveform}
            onClick={() => onSyncByWaveform(false)}
            className="rounded-md border border-accent-300 bg-accent-100/30 px-3 py-2 text-xs font-medium text-accent-800 hover:border-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {text.sync}
          </button>
          <button
            type="button"
            data-testid="inspector-audio-sync-link"
            disabled={!canSyncByWaveform}
            onClick={() => onSyncByWaveform(true)}
            className="rounded-md border border-accent-300 bg-accent-100/30 px-3 py-2 text-xs font-medium text-accent-800 hover:border-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {text.syncLink}
          </button>
        </div>
        {lastAudioSyncPlan ? (
          <div
            className="mt-2 rounded border border-accent-600/20 bg-accent-600/10 px-2 py-1 text-meta text-accent-900"
            data-testid="inspector-audio-last-sync-plan"
            data-sync-confidence={lastAudioSyncPlan.confidence}
            data-sync-delta={lastAudioSyncPlan.appliedDelta}
          >
            {text.offset} {formatSignedEditDelta(lastAudioSyncPlan.appliedDelta)} / {text.confidence} {lastAudioSyncPlan.confidence.toFixed(2)}
            {lastAudioSyncPlan.warnings[0] ? (
              <div className="mt-1 text-warn-800/80">{lastAudioSyncPlan.warnings[0]}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FadeButton({
  testId,
  label,
  disabled,
  onClick,
}: {
  testId?: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-sm text-ds-800 hover:border-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}
