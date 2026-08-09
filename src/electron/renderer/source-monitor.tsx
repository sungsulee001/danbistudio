import { useCallback, useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import { buildSourceAudioMeter } from '../../lib/editor/audio-meter';
import { resolveMediaBinAssetKindLabel } from '../../lib/editor/media-bin';
import { stepShuttleRate } from '../../lib/editor/playback';
import { formatPreviewSourceMode, resolvePreviewMediaSource, resolveWaveformPeaks } from '../../lib/editor/preview-source';
import type { PreviewMediaSource } from '../../lib/editor/preview-source';
import { resolveRenderableAssetMediaKind } from '../../lib/editor/renderable-media-kind';
import { resolveAssetRuntimeWaveformPeaks } from '../../lib/editor/waveform-cache';
import {
  getAssetMediaTime,
  isMediaSubclipAsset,
  readAssetOriginalSourceOut,
  readAssetSourceOffset,
} from '../../lib/editor/subclip';
import type { EditorAsset } from '../../lib/editor/types';
import type { DanbiMenuLanguage } from '../../lib/editor/menu-language';
import type { VideoScopeSample } from '../../lib/editor/video-scopes';
import { resolveSourceRangePointerTime, type SourceRangeHandle } from './source-edit-workflow-helpers';
import type { SourceRange } from './editor-view-model';
import { ProgramAudioMeterOverlay, ProgramVideoScopesOverlay } from './program-monitor-overlays';
import { readMediaPreviewVideoScopeSample } from './video-scope-sampling';
import { useMenuLanguage } from './use-menu-language';

export type SourceMonitorPreviewStatus = 'ready' | 'missing-asset' | 'missing-preview';

export interface SourceMonitorPreviewState {
  status: SourceMonitorPreviewStatus;
  source: string;
  previewSource: PreviewMediaSource;
  message?: string;
}

const sourceMonitorText: Record<DanbiMenuLanguage, {
  audio: string;
  clear: string;
  close: string;
  closeAria: string;
  dragIn: string;
  dragOut: string;
  end: string;
  goIn: string;
  goOut: string;
  hideInfo: string;
  info: string;
  insert: string;
  loop: string;
  missingPreview: string;
  noRange: string;
  noSourceSelected: string;
  overwrite: string;
  selectAsset: string;
  setIn: string;
  setOut: string;
  source: string;
  sourceAudio: string;
  sourceMonitor: string;
  sourceScopes: string;
  start: string;
  stopped: string;
  tools: string;
}> = {
  en: {
    audio: 'audio',
    clear: 'Clear',
    close: 'Close',
    closeAria: 'Close source monitor',
    dragIn: 'Drag source In point',
    dragOut: 'Drag source Out point',
    end: 'End',
    goIn: 'Go In',
    goOut: 'Go Out',
    hideInfo: 'Hide info',
    info: 'Info',
    insert: 'Insert',
    loop: 'Loop',
    missingPreview: 'Missing preview source',
    noRange: 'no range',
    noSourceSelected: 'No source selected',
    overwrite: 'Overwrite',
    selectAsset: 'Select an asset as source',
    setIn: 'Set In',
    setOut: 'Set Out',
    source: 'Source',
    sourceAudio: 'Source Audio',
    sourceMonitor: 'Source Monitor',
    sourceScopes: 'Source Scopes',
    start: 'Start',
    stopped: 'stopped',
    tools: 'Tools',
  },
  ko: {
    audio: '오디오',
    clear: '해제',
    close: '닫기',
    closeAria: '소스 모니터 닫기',
    dragIn: '소스 인 지점 드래그',
    dragOut: '소스 아웃 지점 드래그',
    end: '끝',
    goIn: '인으로 이동',
    goOut: '아웃으로 이동',
    hideInfo: '정보 숨기기',
    info: '정보',
    insert: '삽입',
    loop: '반복',
    missingPreview: '프리뷰 소스 없음',
    noRange: '범위 없음',
    noSourceSelected: '선택된 소스 없음',
    overwrite: '덮어쓰기',
    selectAsset: '소스로 사용할 에셋을 선택하세요',
    setIn: '인 설정',
    setOut: '아웃 설정',
    source: '소스',
    sourceAudio: '소스 오디오',
    sourceMonitor: '소스 모니터',
    sourceScopes: '소스 스코프',
    start: '시작',
    stopped: '정지',
    tools: '도구',
  },
};

export function resolveSourceMonitorPreviewState(asset?: EditorAsset): SourceMonitorPreviewState {
  const previewSource = resolvePreviewMediaSource(asset);
  if (!asset) {
    return {
      status: 'missing-asset',
      source: '',
      previewSource,
      message: 'Missing source asset',
    };
  }

  if (!previewSource.source) {
    return {
      status: 'missing-preview',
      source: '',
      previewSource,
      message: 'Missing preview source',
    };
  }

  return {
    status: 'ready',
    source: previewSource.source,
    previewSource,
  };
}

export interface SourceMonitorProps {
  asset?: EditorAsset;
  range: SourceRange | null;
  playhead: number;
  playbackRate: number;
  loopPlaybackEnabled: boolean;
  audioPeaksByAssetId?: Record<string, number[]>;
  fps: number;
  active: boolean;
  onActivate: () => void;
  onPlayheadChange: (time: number) => void;
  onPlaybackRateChange: (rate: number) => void;
  onToggleLoopPlayback: () => void;
  onGoToStart: () => void;
  onGoToEnd: () => void;
  onSetIn: () => void;
  onSetOut: () => void;
  onGoToIn: () => void;
  onGoToOut: () => void;
  onClearMarks: () => void;
  onRangeHandleDrag: (handle: SourceRangeHandle, time: number) => void;
  onInsert: () => void;
  onOverwrite: () => void;
  compact?: boolean;
  onClose?: () => void;
}

export function SourceMonitor({
  asset,
  range,
  playhead,
  playbackRate,
  loopPlaybackEnabled,
  audioPeaksByAssetId = {},
  fps,
  active,
  onActivate,
  onPlayheadChange,
  onPlaybackRateChange,
  onToggleLoopPlayback,
  onGoToStart,
  onGoToEnd,
  onSetIn,
  onSetOut,
  onGoToIn,
  onGoToOut,
  onClearMarks,
  onRangeHandleDrag,
  onInsert,
  onOverwrite,
  compact = false,
  onClose,
}: SourceMonitorProps) {
  const language = useMenuLanguage();
  const text = sourceMonitorText[language];
  const duration = asset?.duration ?? 0;
  const rangeRailRef = useRef<HTMLDivElement>(null);
  const [sourceToolsExpanded, setSourceToolsExpanded] = useState(!compact);
  const showSourceTools = !compact || sourceToolsExpanded;
  const rangeStartPercent = duration > 0 && range ? (range.in / duration) * 100 : 0;
  const rangeWidthPercent = duration > 0 && range ? ((range.out - range.in) / duration) * 100 : 0;
  const handlePlayheadInput = (event: ChangeEvent<HTMLInputElement>) => {
    onPlayheadChange(Number(event.target.value));
  };
  const updateRangeHandleFromClientX = useCallback((handle: SourceRangeHandle, clientX: number) => {
    if (!asset || !rangeRailRef.current) {
      return;
    }

    onActivate();
    const rect = rangeRailRef.current.getBoundingClientRect();
    onRangeHandleDrag(handle, resolveSourceRangePointerTime({
      clientX,
      railLeft: rect.left,
      railWidth: rect.width,
      duration,
      fps,
    }));
  }, [asset, duration, fps, onActivate, onRangeHandleDrag]);

  const handleRangeHandlePointer = (handle: SourceRangeHandle, event: PointerEvent<HTMLButtonElement>) => {
    if (!asset || !rangeRailRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateRangeHandleFromClientX(handle, event.clientX);

    const target = event.currentTarget;
    const pointerId = event.pointerId;
    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      updateRangeHandleFromClientX(handle, moveEvent.clientX);
    };
    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="source-monitor"
      data-active={active ? 'true' : 'false'}
      data-source-asset-id={asset?.id ?? ''}
      data-compact={compact ? 'true' : 'false'}
      data-tools-expanded={showSourceTools ? 'true' : 'false'}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate();
        }
      }}
      className={`overflow-hidden rounded-md border bg-paper text-left ${compact ? 'min-h-0' : 'min-h-[260px]'} ${
        active ? 'border-accent-500' : 'border-ds-200'
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-ds-200 px-3 py-2">
        <div className="min-w-0">
          <div className="text-meta font-semibold uppercase tracking-wide text-accent-700">{text.sourceMonitor}</div>
          <div data-testid="source-monitor-asset-name" className="truncate text-sm font-medium text-ink">{asset?.name ?? text.noSourceSelected}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="rounded bg-surface px-2 py-1 text-meta text-ds-700">
            {formatPlaybackRate(playbackRate, language)}
          </span>
          {compact ? (
            <button
              type="button"
              data-testid="source-monitor-tools-toggle"
              aria-pressed={showSourceTools}
              className={`rounded border px-2 py-1 text-meta font-medium ${
                showSourceTools
                  ? 'border-accent-500/60 bg-accent-500/10 text-accent-900'
                  : 'border-ds-200 text-ds-700 hover:border-ds-400 hover:text-ink'
              }`}
              onClick={(event) => {
                event.stopPropagation();
                setSourceToolsExpanded((current) => !current);
              }}
            >
              {text.tools}
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              data-testid="source-monitor-close"
              aria-label={text.closeAria}
              className="rounded border border-ds-200 px-2 py-1 text-meta font-medium text-ds-700 hover:border-ds-400 hover:text-ink"
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
            >
              {text.close}
            </button>
          ) : null}
        </div>
      </div>

      <div className={`${compact ? 'min-h-[118px]' : 'min-h-[140px]'} on-dark bg-monitor`}>
        {asset ? (
          <SourceAssetPreview
            asset={asset}
            playhead={playhead}
            playbackRate={playbackRate}
            range={range}
            audioPeaksByAssetId={audioPeaksByAssetId}
            language={language}
          />
        ) : (
          <div className={`flex ${compact ? 'min-h-[118px]' : 'min-h-[140px]'} items-center justify-center text-sm text-ds-600`}>
            {text.selectAsset}
          </div>
        )}
      </div>

      <div className={`${compact ? 'space-y-2 p-2' : 'space-y-3 p-3'}`}>
        <div className="relative pt-4">
          <div ref={rangeRailRef} data-testid="source-range-rail" className="absolute left-0 right-0 top-0 h-3 rounded bg-surface">
            <span className="absolute left-0 right-0 top-1 h-1 rounded bg-ds-200" />
            {range && duration > 0 ? (
              <>
                <span
                  className="absolute top-1 h-1 rounded bg-accent-600"
                  style={{ left: `${rangeStartPercent}%`, width: `${Math.max(1, rangeWidthPercent)}%` }}
                />
                <SourceRangeHandleButton
                  label="I"
                  ariaLabel={text.dragIn}
                  percent={rangeStartPercent}
                  disabled={!asset}
                  onPointerDown={(event) => handleRangeHandlePointer('in', event)}
                  onPointerMove={(event) => {
                    if (event.buttons === 1) {
                      handleRangeHandlePointer('in', event);
                    }
                  }}
                />
                <SourceRangeHandleButton
                  label="O"
                  ariaLabel={text.dragOut}
                  percent={rangeStartPercent + rangeWidthPercent}
                  disabled={!asset}
                  onPointerDown={(event) => handleRangeHandlePointer('out', event)}
                  onPointerMove={(event) => {
                    if (event.buttons === 1) {
                      handleRangeHandlePointer('out', event);
                    }
                  }}
                />
              </>
            ) : null}
          </div>
          <input
            type="range"
            min={0}
            max={duration}
            step={1 / fps}
            value={Math.min(playhead, duration)}
            disabled={!asset}
            onInput={handlePlayheadInput}
            onChange={handlePlayheadInput}
            className="w-full"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ds-700">
          <span className="tabular-nums">{formatTimecode(playhead, fps)} / {formatTimecode(duration, fps)}</span>
          <span className="tabular-nums">
            I {range ? formatTimecode(range.in, fps) : '--:--'} / O {range ? formatTimecode(range.out, fps) : '--:--'}
          </span>
        </div>
        {showSourceTools ? (
        <div className="grid grid-cols-2 gap-2 2xl:grid-cols-3">
          <button className="rounded border border-ds-200 bg-surface px-2 py-1 text-xs text-ds-800 hover:border-accent-500" onClick={(event) => { event.stopPropagation(); onPlaybackRateChange(stepShuttleRate(playbackRate, 'reverse')); }}>J</button>
          <button className="rounded border border-ds-200 bg-surface px-2 py-1 text-xs text-ds-800 hover:border-accent-500" onClick={(event) => { event.stopPropagation(); onPlaybackRateChange(0); }}>K</button>
          <button className="rounded border border-ds-200 bg-surface px-2 py-1 text-xs text-ds-800 hover:border-accent-500" onClick={(event) => { event.stopPropagation(); onPlaybackRateChange(stepShuttleRate(playbackRate, 'forward')); }}>L</button>
          <button className="rounded border border-ds-200 bg-surface px-2 py-1 text-xs text-ds-800 hover:border-info-500" onClick={(event) => { event.stopPropagation(); onGoToStart(); }}>{text.start}</button>
          <button className="rounded border border-ds-200 bg-surface px-2 py-1 text-xs text-ds-800 hover:border-info-500" onClick={(event) => { event.stopPropagation(); onGoToEnd(); }}>{text.end}</button>
          <button
            className={`rounded border px-2 py-1 text-xs hover:border-accent-500 ${
              loopPlaybackEnabled
                ? 'border-accent-500 bg-accent-100/60 text-accent-900'
                : 'border-ds-200 bg-surface text-ds-800'
            }`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleLoopPlayback();
            }}
          >
            {text.loop}
          </button>
          <button className="rounded border border-ds-200 bg-surface px-2 py-1 text-xs text-ds-800 hover:border-info-500" onClick={(event) => { event.stopPropagation(); onGoToIn(); }}>{text.goIn}</button>
          <button className="rounded border border-ds-200 bg-surface px-2 py-1 text-xs text-ds-800 hover:border-info-500" onClick={(event) => { event.stopPropagation(); onGoToOut(); }}>{text.goOut}</button>
          <button className="rounded border border-ds-200 bg-surface px-2 py-1 text-xs text-ds-800 hover:border-accent-500" onClick={(event) => { event.stopPropagation(); onSetIn(); }}>{text.setIn}</button>
          <button className="rounded border border-ds-200 bg-surface px-2 py-1 text-xs text-ds-800 hover:border-accent-500" onClick={(event) => { event.stopPropagation(); onSetOut(); }}>{text.setOut}</button>
          <button className="rounded border border-ds-200 bg-surface px-2 py-1 text-xs text-ds-800 hover:border-warn-500" onClick={(event) => { event.stopPropagation(); onClearMarks(); }}>{text.clear}</button>
          <button className="rounded border border-accent-200 bg-accent-100/40 px-2 py-1 text-xs text-accent-800 hover:border-accent-600" onClick={(event) => { event.stopPropagation(); onInsert(); }}>{text.insert}</button>
          <button className="rounded border border-info-200 bg-info-100/40 px-2 py-1 text-xs text-info-800 hover:border-info-600" onClick={(event) => { event.stopPropagation(); onOverwrite(); }}>{text.overwrite}</button>
        </div>
        ) : null}
      </div>
    </div>
  );
}

function SourceRangeHandleButton({
  label,
  ariaLabel,
  percent,
  disabled,
  onPointerDown,
  onPointerMove,
}: {
  label: string;
  ariaLabel: string;
  percent: number;
  disabled: boolean;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      className="absolute top-0 z-20 h-3 w-4 -translate-x-1/2 rounded border border-accent-700 bg-paper text-micro font-semibold leading-none text-accent-900 shadow-sm shadow-black/40 disabled:cursor-not-allowed disabled:opacity-50"
      style={{ left: `${Math.min(100, Math.max(0, percent))}%` }}
    >
      {label}
    </button>
  );
}

function SourceAssetPreview({
  asset,
  playhead,
  playbackRate,
  range,
  audioPeaksByAssetId,
  language,
}: {
  asset: EditorAsset;
  playhead: number;
  playbackRate: number;
  range: SourceRange | null;
  audioPeaksByAssetId: Record<string, number[]>;
  language: DanbiMenuLanguage;
}) {
  const text = sourceMonitorText[language];
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [videoScopeSample, setVideoScopeSample] = useState<VideoScopeSample | undefined>(undefined);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const sourceTime = roundTime(clampNumber(playhead, 0, asset.duration));
  const mediaTime = getAssetMediaTime(asset, sourceTime);
  const previewState = resolveSourceMonitorPreviewState(asset);
  const previewSource = previewState.previewSource;
  const mediaSource = previewState.source;
  const runtimeWaveformPeaks = resolveAssetRuntimeWaveformPeaks(asset, audioPeaksByAssetId);
  const waveformPeaks = resolveWaveformPeaks(asset, runtimeWaveformPeaks);
  const sourceAudioMeter = buildSourceAudioMeter(asset, sourceTime, {
    range,
    runtimePeaks: runtimeWaveformPeaks,
  });
  const showSourceAudioMeter = sourceAudioMeter.activeLayerCount > 0;
  const handleVideoScopeSource = useCallback((source: HTMLVideoElement | HTMLImageElement | null) => {
    if (!source) {
      return;
    }

    const scopeSample = readMediaPreviewVideoScopeSample(source);
    if (scopeSample) {
      setVideoScopeSample(scopeSample);
    }
  }, []);

  useEffect(() => {
    const media = videoRef.current ?? audioRef.current;
    if (!media) {
      return;
    }

    if (Number.isFinite(mediaTime) && Math.abs(media.currentTime - mediaTime) > 0.18) {
      media.currentTime = mediaTime;
    }

    if (playbackRate > 0) {
      media.playbackRate = Math.max(0.25, Math.min(4, playbackRate));
      void media.play().catch(() => undefined);
      return;
    }

    media.pause();
  }, [mediaTime, playbackRate]);

  useEffect(() => {
    setVideoScopeSample(undefined);
  }, [asset.id, mediaSource]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || resolveRenderableAssetMediaKind(asset) !== 'video') {
      return;
    }

    const reportScope = () => handleVideoScopeSource(video);
    reportScope();
    video.addEventListener('loadeddata', reportScope);
    video.addEventListener('seeked', reportScope);
    const interval = window.setInterval(reportScope, 500);

    return () => {
      video.removeEventListener('loadeddata', reportScope);
      video.removeEventListener('seeked', reportScope);
      window.clearInterval(interval);
    };
  }, [asset, handleVideoScopeSource, mediaSource]);

  const mediaKind = resolveRenderableAssetMediaKind(asset);

  if (mediaKind === 'image') {
    return (
      <div className="relative flex min-h-[140px] items-center justify-center on-dark bg-monitor">
        <SourcePreviewInfoToggle visible={diagnosticsVisible} onToggle={() => setDiagnosticsVisible((current) => !current)} language={language} />
        {mediaSource ? (
          <img
            ref={imageRef}
            src={mediaSource}
            alt={asset.name}
            className="max-h-[180px] max-w-full object-contain"
            onLoad={(event) => handleVideoScopeSource(event.currentTarget)}
          />
        ) : (
          <div className="text-sm text-ds-600">{text.missingPreview}</div>
        )}
        {diagnosticsVisible ? (
          <>
            <ProgramVideoScopesOverlay sample={videoScopeSample} title={text.sourceScopes} testId="source-video-scopes" statusTestId="source-video-scope-status" />
            {showSourceAudioMeter ? <SourceAudioMeterOverlay meter={sourceAudioMeter} language={language} /> : null}
            <SourcePreviewOverlay asset={asset} sourceTime={sourceTime} range={range} previewSource={previewSource} language={language} />
          </>
        ) : null}
      </div>
    );
  }

  if (mediaKind === 'audio') {
    return (
      <div className="relative flex min-h-[140px] flex-col items-center justify-center gap-4 on-dark bg-monitor p-4">
        <SourcePreviewInfoToggle visible={diagnosticsVisible} onToggle={() => setDiagnosticsVisible((current) => !current)} language={language} />
        <SourceWaveform peaks={waveformPeaks} seed={asset.id} />
        {mediaSource ? (
          <audio
            ref={audioRef}
            src={mediaSource}
            preload="auto"
            data-testid={`source-monitor-audio-${asset.id}`}
            data-source-asset-id={asset.id}
            data-source-playback-rate={playbackRate}
            className="hidden"
          />
        ) : null}
        {diagnosticsVisible ? (
          <>
            {showSourceAudioMeter ? <SourceAudioMeterOverlay meter={sourceAudioMeter} language={language} /> : null}
            <SourcePreviewOverlay asset={asset} sourceTime={sourceTime} range={range} previewSource={previewSource} language={language} />
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[140px] items-center justify-center on-dark bg-monitor">
      <SourcePreviewInfoToggle visible={diagnosticsVisible} onToggle={() => setDiagnosticsVisible((current) => !current)} language={language} />
      {mediaSource ? (
        <video
          ref={videoRef}
          src={mediaSource}
          className="max-h-[180px] max-w-full object-contain"
          playsInline
        />
      ) : (
        <div className="text-sm text-ds-600">{previewState.message ? translatePreviewMessage(previewState.message, language) : text.missingPreview}</div>
      )}
      {diagnosticsVisible ? (
        <>
          <ProgramVideoScopesOverlay sample={videoScopeSample} title={text.sourceScopes} testId="source-video-scopes" statusTestId="source-video-scope-status" />
          {showSourceAudioMeter ? <SourceAudioMeterOverlay meter={sourceAudioMeter} language={language} /> : null}
          <SourcePreviewOverlay asset={asset} sourceTime={sourceTime} range={range} previewSource={previewSource} language={language} />
        </>
      ) : null}
    </div>
  );
}

function SourcePreviewInfoToggle({
  visible,
  onToggle,
  language,
}: {
  visible: boolean;
  onToggle: () => void;
  language: DanbiMenuLanguage;
}) {
  const text = sourceMonitorText[language];

  return (
    <button
      type="button"
      className="absolute left-3 top-3 z-30 rounded border border-ds-300 on-dark bg-black/70 px-2 py-1 text-meta font-medium text-ds-800 hover:border-accent-600 hover:text-white"
      aria-pressed={visible}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {visible ? text.hideInfo : text.info}
    </button>
  );
}

function SourceAudioMeterOverlay({ meter, language }: { meter: ReturnType<typeof buildSourceAudioMeter>; language: DanbiMenuLanguage }) {
  const text = sourceMonitorText[language];

  return (
    <ProgramAudioMeterOverlay
      meter={meter}
      title={text.sourceAudio}
      testId="source-audio-meter"
      statusTestId="source-audio-meter-status"
      positionClassName="absolute right-3 top-3"
      // The literal, not the translated label: `contextLabel` is a
      // discriminator that picks the clipping advice, so passing the Korean
      // '소스' made the comparison fail and showed the Program warning on the
      // source monitor.
      readoutOptions={{ contextLabel: 'Source' }}
    />
  );
}

function SourcePreviewOverlay({
  asset,
  sourceTime,
  range,
  previewSource,
  language,
}: {
  asset: EditorAsset;
  sourceTime: number;
  range: SourceRange | null;
  previewSource: ReturnType<typeof resolvePreviewMediaSource>;
  language: DanbiMenuLanguage;
}) {
  const text = sourceMonitorText[language];
  const subclipOffset = readAssetSourceOffset(asset);
  const subclipOut = readAssetOriginalSourceOut(asset);

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2">
      <div className="rounded on-dark bg-black/70 px-3 py-2">
        <div className="text-sm font-semibold text-white">{asset.name}</div>
        <div className="text-xs text-ds-700">
          {formatSourceAssetKindLabel(asset, language)} / {asset.width ?? '-'}x{asset.height ?? '-'} / {sourceTime.toFixed(1)}s / {formatPreviewSourceMode(previewSource)}
        </div>
        {isMediaSubclipAsset(asset) ? (
          <div className="mt-1 text-meta text-accent2-800">
            {text.source.toLowerCase()} {subclipOffset.toFixed(1)}s{subclipOut !== undefined ? ` - ${subclipOut.toFixed(1)}s` : ''}
          </div>
        ) : null}
      </div>
      <div className="rounded on-dark bg-black/70 px-3 py-2 text-xs text-ds-700">
        {range ? `${range.in.toFixed(1)}s - ${range.out.toFixed(1)}s` : text.noRange}
      </div>
    </div>
  );
}

function SourceWaveform({ peaks, seed = 'source' }: { peaks?: number[]; seed?: string }) {
  const values = peaks && peaks.length > 0
    ? peaks.slice(0, 96)
    : Array.from({ length: 48 }).map((_, index) => pseudoRandomWaveHeight(seed, index));

  return (
    <div className="flex h-16 w-full items-center gap-px">
      {values.map((value, index) => (
        <span
          key={index}
          className="flex-1 rounded-sm bg-accent-600/75"
          style={{ height: `${roundStylePercent(12 + Math.min(1, Math.max(0, value)) * 78)}%` }}
        />
      ))}
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

function formatPlaybackRate(rate: number, language: DanbiMenuLanguage): string {
  if (rate === 0) {
    return sourceMonitorText[language].stopped;
  }

  return `${rate > 0 ? 'x' : '-x'}${Math.abs(rate)}`;
}

function translatePreviewMessage(message: string, language: DanbiMenuLanguage): string {
  if (language !== 'ko') {
    return message;
  }

  if (message === 'Missing source asset') {
    return '소스 에셋 없음';
  }
  if (message === 'Missing preview source') {
    return sourceMonitorText.ko.missingPreview;
  }

  return message;
}

function formatSourceAssetKindLabel(asset: EditorAsset, language: DanbiMenuLanguage): string {
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

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function pseudoRandomWaveHeight(seed: string, index: number): number {
  let hash = 0;
  const input = `${seed}-${index}`;

  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }

  return Math.abs(Math.sin(hash) * 0.85 + Math.sin(index * 1.7) * 0.15);
}

function roundStylePercent(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function padTime(value: number): string {
  return Math.floor(value).toString().padStart(2, '0');
}
