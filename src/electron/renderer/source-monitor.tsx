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
import type { VideoScopeSample } from '../../lib/editor/video-scopes';
import { resolveSourceRangePointerTime, type SourceRangeHandle } from './source-edit-workflow-helpers';
import type { SourceRange } from './editor-view-model';
import { ProgramAudioMeterOverlay, ProgramVideoScopesOverlay } from './program-monitor-overlays';
import { readMediaPreviewVideoScopeSample } from './video-scope-sampling';

export type SourceMonitorPreviewStatus = 'ready' | 'missing-asset' | 'missing-preview';

export interface SourceMonitorPreviewState {
  status: SourceMonitorPreviewStatus;
  source: string;
  previewSource: PreviewMediaSource;
  message?: string;
}

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
}: SourceMonitorProps) {
  const duration = asset?.duration ?? 0;
  const rangeRailRef = useRef<HTMLDivElement>(null);
  const rangeStartPercent = duration > 0 && range ? (range.in / duration) * 100 : 0;
  const rangeWidthPercent = duration > 0 && range ? ((range.out - range.in) / duration) * 100 : 0;
  const handlePlayheadInput = (event: ChangeEvent<HTMLInputElement>) => {
    onPlayheadChange(Number(event.target.value));
  };
  const handleRangeHandlePointer = (handle: SourceRangeHandle, event: PointerEvent<HTMLButtonElement>) => {
    if (!asset || !rangeRailRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onActivate();
    event.currentTarget.setPointerCapture(event.pointerId);

    const rect = rangeRailRef.current.getBoundingClientRect();
    onRangeHandleDrag(handle, resolveSourceRangePointerTime({
      clientX: event.clientX,
      railLeft: rect.left,
      railWidth: rect.width,
      duration,
      fps,
    }));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate();
        }
      }}
      className={`min-h-[320px] overflow-hidden rounded-md border bg-zinc-950 text-left ${
        active ? 'border-emerald-500' : 'border-zinc-800'
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">Source Monitor</div>
          <div className="truncate text-sm font-medium text-zinc-100">{asset?.name ?? 'No source selected'}</div>
        </div>
        <span className="shrink-0 rounded bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400">
          {formatPlaybackRate(playbackRate)}
        </span>
      </div>

      <div className="min-h-[220px] bg-black">
        {asset ? (
          <SourceAssetPreview
            asset={asset}
            playhead={playhead}
            playbackRate={playbackRate}
            range={range}
            audioPeaksByAssetId={audioPeaksByAssetId}
          />
        ) : (
          <div className="flex min-h-[220px] items-center justify-center text-sm text-zinc-500">
            Select an asset as source
          </div>
        )}
      </div>

      <div className="space-y-3 p-3">
        <div className="relative pt-4">
          <div ref={rangeRailRef} data-testid="source-range-rail" className="absolute left-0 right-0 top-0 h-3 rounded bg-zinc-900">
            <span className="absolute left-0 right-0 top-1 h-1 rounded bg-zinc-800" />
            {range && duration > 0 ? (
              <>
                <span
                  className="absolute top-1 h-1 rounded bg-emerald-400"
                  style={{ left: `${rangeStartPercent}%`, width: `${Math.max(1, rangeWidthPercent)}%` }}
                />
                <SourceRangeHandleButton
                  label="I"
                  ariaLabel="Drag source In point"
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
                  ariaLabel="Drag source Out point"
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
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
          <span className="tabular-nums">{formatTimecode(playhead, fps)} / {formatTimecode(duration, fps)}</span>
          <span className="tabular-nums">
            I {range ? formatTimecode(range.in, fps) : '--:--'} / O {range ? formatTimecode(range.out, fps) : '--:--'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-4 2xl:grid-cols-6">
          <button className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:border-emerald-500" onClick={(event) => { event.stopPropagation(); onPlaybackRateChange(stepShuttleRate(playbackRate, 'reverse')); }}>J</button>
          <button className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:border-emerald-500" onClick={(event) => { event.stopPropagation(); onPlaybackRateChange(0); }}>K</button>
          <button className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:border-emerald-500" onClick={(event) => { event.stopPropagation(); onPlaybackRateChange(stepShuttleRate(playbackRate, 'forward')); }}>L</button>
          <button className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:border-sky-500" onClick={(event) => { event.stopPropagation(); onGoToStart(); }}>Start</button>
          <button className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:border-sky-500" onClick={(event) => { event.stopPropagation(); onGoToEnd(); }}>End</button>
          <button
            className={`rounded border px-2 py-1 text-xs hover:border-emerald-500 ${
              loopPlaybackEnabled
                ? 'border-emerald-500 bg-emerald-950/60 text-emerald-100'
                : 'border-zinc-800 bg-zinc-900 text-zinc-200'
            }`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleLoopPlayback();
            }}
          >
            Loop
          </button>
          <button className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:border-sky-500" onClick={(event) => { event.stopPropagation(); onGoToIn(); }}>Go In</button>
          <button className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:border-sky-500" onClick={(event) => { event.stopPropagation(); onGoToOut(); }}>Go Out</button>
          <button className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:border-emerald-500" onClick={(event) => { event.stopPropagation(); onSetIn(); }}>Set In</button>
          <button className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:border-emerald-500" onClick={(event) => { event.stopPropagation(); onSetOut(); }}>Set Out</button>
          <button className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:border-amber-500" onClick={(event) => { event.stopPropagation(); onClearMarks(); }}>Clear</button>
          <button className="rounded border border-emerald-800 bg-emerald-950/40 px-2 py-1 text-xs text-emerald-200 hover:border-emerald-400" onClick={(event) => { event.stopPropagation(); onInsert(); }}>Insert</button>
          <button className="rounded border border-sky-800 bg-sky-950/40 px-2 py-1 text-xs text-sky-200 hover:border-sky-400" onClick={(event) => { event.stopPropagation(); onOverwrite(); }}>Overwrite</button>
        </div>
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
      className="absolute top-0 h-3 w-4 -translate-x-1/2 rounded border border-emerald-300 bg-zinc-950 text-[8px] font-semibold leading-none text-emerald-100 shadow-sm shadow-black/40 disabled:cursor-not-allowed disabled:opacity-50"
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
}: {
  asset: EditorAsset;
  playhead: number;
  playbackRate: number;
  range: SourceRange | null;
  audioPeaksByAssetId: Record<string, number[]>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [videoScopeSample, setVideoScopeSample] = useState<VideoScopeSample | undefined>(undefined);
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
      <div className="relative flex min-h-[220px] items-center justify-center bg-black">
        {mediaSource ? (
          <img
            ref={imageRef}
            src={mediaSource}
            alt={asset.name}
            className="max-h-[260px] max-w-full object-contain"
            onLoad={(event) => handleVideoScopeSource(event.currentTarget)}
          />
        ) : (
          <div className="text-sm text-zinc-500">Missing preview source</div>
        )}
        <ProgramVideoScopesOverlay sample={videoScopeSample} title="Source Scopes" testId="source-video-scopes" statusTestId="source-video-scope-status" />
        {showSourceAudioMeter ? <SourceAudioMeterOverlay meter={sourceAudioMeter} /> : null}
        <SourcePreviewOverlay asset={asset} sourceTime={sourceTime} range={range} previewSource={previewSource} />
      </div>
    );
  }

  if (mediaKind === 'audio') {
    return (
      <div className="relative flex min-h-[220px] flex-col items-center justify-center gap-5 bg-black p-6">
        <SourceWaveform peaks={waveformPeaks} seed={asset.id} />
        {mediaSource ? <audio ref={audioRef} src={mediaSource} className="hidden" /> : null}
        {showSourceAudioMeter ? <SourceAudioMeterOverlay meter={sourceAudioMeter} /> : null}
        <SourcePreviewOverlay asset={asset} sourceTime={sourceTime} range={range} previewSource={previewSource} />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[220px] items-center justify-center bg-black">
      {mediaSource ? (
        <video
          ref={videoRef}
          src={mediaSource}
          className="max-h-[300px] max-w-full object-contain"
          muted
        />
      ) : (
        <div className="text-sm text-zinc-500">{previewState.message ?? 'Missing preview source'}</div>
      )}
      <ProgramVideoScopesOverlay sample={videoScopeSample} title="Source Scopes" testId="source-video-scopes" statusTestId="source-video-scope-status" />
      {showSourceAudioMeter ? <SourceAudioMeterOverlay meter={sourceAudioMeter} /> : null}
      <SourcePreviewOverlay asset={asset} sourceTime={sourceTime} range={range} previewSource={previewSource} />
    </div>
  );
}

function SourceAudioMeterOverlay({ meter }: { meter: ReturnType<typeof buildSourceAudioMeter> }) {
  return (
    <ProgramAudioMeterOverlay
      meter={meter}
      title="Source Audio"
      testId="source-audio-meter"
      statusTestId="source-audio-meter-status"
      positionClassName="absolute right-3 top-3"
      readoutOptions={{ contextLabel: 'Source' }}
    />
  );
}

function SourcePreviewOverlay({
  asset,
  sourceTime,
  range,
  previewSource,
}: {
  asset: EditorAsset;
  sourceTime: number;
  range: SourceRange | null;
  previewSource: ReturnType<typeof resolvePreviewMediaSource>;
}) {
  const subclipOffset = readAssetSourceOffset(asset);
  const subclipOut = readAssetOriginalSourceOut(asset);

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2">
      <div className="rounded bg-black/70 px-3 py-2">
        <div className="text-sm font-semibold text-white">{asset.name}</div>
        <div className="text-xs text-zinc-300">
          {resolveMediaBinAssetKindLabel(asset)} / {asset.width ?? '-'}x{asset.height ?? '-'} / {sourceTime.toFixed(1)}s / {formatPreviewSourceMode(previewSource)}
        </div>
        {isMediaSubclipAsset(asset) ? (
          <div className="mt-1 text-[11px] text-violet-200">
            source {subclipOffset.toFixed(1)}s{subclipOut !== undefined ? ` - ${subclipOut.toFixed(1)}s` : ''}
          </div>
        ) : null}
      </div>
      <div className="rounded bg-black/70 px-3 py-2 text-xs text-zinc-300">
        {range ? `${range.in.toFixed(1)}s - ${range.out.toFixed(1)}s` : 'no range'}
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
          className="flex-1 rounded-sm bg-emerald-400/75"
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

function formatPlaybackRate(rate: number): string {
  if (rate === 0) {
    return 'stopped';
  }

  return `${rate > 0 ? 'x' : '-x'}${Math.abs(rate)}`;
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
