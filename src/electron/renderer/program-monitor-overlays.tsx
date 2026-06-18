import type { CSSProperties } from 'react';
import { resolveAudioAnalyzerReadout, type ProgramAudioAnalyzerSample, type AudioAnalyzerStatus } from '../../lib/editor/audio-analyzer';
import { formatTrackPan } from '../../lib/editor/audio-mixer';
import { formatAudioMeterDb, resolveAudioMeterReadout, type AudioMeterReadoutOptions, type AudioMeterSample, type AudioMeterStatus } from '../../lib/editor/audio-meter';
import type { ProgramPreviewStack } from '../../lib/editor/preview';
import type { PreviewFrameStatus, PreviewFrameTelemetry } from '../../lib/editor/preview-performance';
import type { PreviewWorkerPlan, PreviewWorkerStatus } from '../../lib/editor/preview-worker';
import { resolveVideoScopeReadout, type VideoScopePoint, type VideoScopeReadoutStatus, type VideoScopeSample } from '../../lib/editor/video-scopes';

export function ProgramVideoScopesOverlay({
  sample,
  title = 'Scopes',
  testId = 'program-video-scopes',
  statusTestId = 'program-video-scope-status',
}: {
  sample?: VideoScopeSample;
  title?: string;
  testId?: string;
  statusTestId?: string;
}) {
  if (!sample || sample.sampledPixels === 0) {
    return null;
  }

  const histogramPeak = Math.max(0.001, ...sample.histogram);
  const vectorPoints = sample.vectorscope.slice(0, 72);
  const readout = resolveVideoScopeReadout(sample);

  return (
    <div className="pointer-events-none absolute bottom-28 left-3 w-72 max-w-[70%] rounded bg-black/75 px-3 py-2 text-[10px] text-zinc-300" data-testid={testId}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-white">{title}</span>
        <span className={`rounded px-1.5 py-0.5 font-semibold ${videoScopeStatusClassName(readout.status)}`} data-testid={statusTestId}>
          {readout.label}
        </span>
      </div>
      <div className="mb-2 flex items-center justify-between gap-2 text-[9px] text-zinc-500">
        <span className="truncate">{readout.warning ?? readout.detail}</span>
        <span className="shrink-0 tabular-nums">{sample.width}x{sample.height} / {sample.sampledPixels}px</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <ScopeReadout label="Avg" value={formatScopePercent(sample.averageLuma)} />
        <ScopeReadout label="Low" value={formatScopePercent(sample.lowLuma)} />
        <ScopeReadout label="Peak" value={formatScopePercent(sample.peakLuma)} />
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_5rem] gap-3">
        <div className="min-w-0 space-y-2">
          <div>
            <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-normal text-zinc-500">
              <span>Histogram</span>
              <span>Luma</span>
            </div>
            <div className="flex h-10 items-end gap-px border border-zinc-800 bg-zinc-950/80 px-1 pb-1 pt-1">
              {sample.histogram.map((value, index) => (
                <span
                  key={`histogram-${index}`}
                  className="block flex-1 bg-emerald-300/70"
                  style={{ height: `${Math.max(3, (value / histogramPeak) * 100)}%` }}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-normal text-zinc-500">
              <span>Waveform</span>
              <span>Y</span>
            </div>
            <div className="flex h-10 items-end gap-px border border-zinc-800 bg-zinc-950/80 px-1 pb-1 pt-1">
              {sample.waveform.map((value, index) => (
                <span
                  key={`waveform-${index}`}
                  className="block flex-1 bg-cyan-300/70"
                  style={{ height: `${Math.max(3, value * 100)}%` }}
                />
              ))}
            </div>
          </div>
          <div data-testid="program-rgb-parade">
            <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-normal text-zinc-500">
              <span>RGB Parade</span>
              <span>RGB</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <ScopeChannelWaveform label="R" values={sample.rgbWaveform.red} className="bg-rose-300/75" />
              <ScopeChannelWaveform label="G" values={sample.rgbWaveform.green} className="bg-emerald-300/75" />
              <ScopeChannelWaveform label="B" values={sample.rgbWaveform.blue} className="bg-sky-300/75" />
            </div>
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-normal text-zinc-500">
            <span>Vector</span>
            <span>UV</span>
          </div>
          <div className="relative h-20 overflow-hidden border border-zinc-800 bg-zinc-950/80">
            <span className="absolute left-1/2 top-0 h-full w-px bg-zinc-700/80" />
            <span className="absolute left-0 top-1/2 h-px w-full bg-zinc-700/80" />
            <span className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-700/70" />
            {vectorPoints.map((point, index) => (
              <span
                key={`vector-${index}-${point.x}-${point.y}`}
                className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-300"
                style={buildScopeVectorPointStyle(point)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProgramAudioMeterOverlay({
  meter,
  title = 'Audio',
  testId = 'program-audio-meter',
  statusTestId = 'program-audio-meter-status',
  positionClassName = 'absolute bottom-3 right-3',
  readoutOptions,
}: {
  meter: AudioMeterSample;
  title?: string;
  testId?: string;
  statusTestId?: string;
  positionClassName?: string;
  readoutOptions?: AudioMeterReadoutOptions;
}) {
  const readout = resolveAudioMeterReadout(meter, readoutOptions);
  const leftWidth = `${Math.min(100, Math.round(meter.left * 100))}%`;
  const rightWidth = `${Math.min(100, Math.round(meter.right * 100))}%`;
  const barClassName = audioMeterBarClassName(readout.status);

  return (
    <div className={`pointer-events-none ${positionClassName} w-52 rounded bg-black/75 px-3 py-2 text-[11px] text-zinc-300`} data-testid={testId}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-white">{title}</span>
        <span className={audioMeterStatusClassName(readout.status)} data-testid={statusTestId}>
          {readout.label}
        </span>
      </div>
      <div className="space-y-1">
        <MeterBar label="L" width={leftWidth} className={barClassName} value={formatAudioMeterDb(readout.leftDb)} />
        <MeterBar label="R" width={rightWidth} className={barClassName} value={formatAudioMeterDb(readout.rightDb)} />
      </div>
      <div className={`mt-2 truncate text-[10px] ${readout.warning ? 'text-amber-200' : 'text-zinc-500'}`}>
        {readout.warning ?? readout.detail}
      </div>
    </div>
  );
}

export function ProgramAudioAnalyzerOverlay({ sample }: { sample: ProgramAudioAnalyzerSample }) {
  const readout = resolveAudioAnalyzerReadout(sample);
  const fftSample = sample.fft && sample.fft.capturedLayerCount > 0 ? sample.fft : undefined;

  if (sample.activeLayerCount === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute bottom-28 right-3 w-52 rounded bg-black/75 px-3 py-2 text-[10px] text-zinc-300" data-testid="program-audio-analyzer">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-white">Analyzer</span>
        <span className={audioAnalyzerStatusClassName(readout.status)} data-testid="program-audio-analyzer-status">
          {readout.label}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {sample.bands.map((band) => (
          <div key={band.id} className="min-w-0 border border-zinc-800 bg-zinc-950/70 px-1 py-1">
            <div className="truncate text-[9px] uppercase tracking-normal text-zinc-500">{band.label}</div>
            <div className="mt-1 flex h-8 items-end overflow-hidden bg-zinc-900">
              <div
                className="block w-full bg-cyan-300/80"
                style={{ height: `${Math.max(3, Math.min(100, Math.round(band.value * 100)))}%` }}
              />
            </div>
            <div className="mt-1 truncate text-right tabular-nums text-zinc-400">{formatAudioMeterDb(band.db)}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 border-t border-zinc-800 pt-2" data-testid="program-audio-mono-compatibility">
        <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-normal text-zinc-500">
          <span>Mono</span>
          <span className="tabular-nums">{formatMonoCompatibility(sample.monoCompatibility)}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded bg-zinc-800">
          <div
            className={`h-full rounded ${monoCompatibilityBarClassName(sample.monoCompatibility)}`}
            style={{ width: `${Math.max(4, Math.round(clampNumber((sample.monoCompatibility ?? 0) * 100, 0, 100)))}%` }}
          />
        </div>
      </div>
      {fftSample ? (
        <div className="mt-2 border-t border-zinc-800 pt-2">
          <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-normal text-zinc-500">
            <span>Live FFT</span>
            <span className="tabular-nums">{fftSample.capturedLayerCount}/{fftSample.sourceLayerCount}</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {fftSample.bands.map((band) => (
              <div key={band.id} className="min-w-0">
                <div className="flex h-6 items-end overflow-hidden bg-zinc-900">
                  <div
                    className="block w-full bg-fuchsia-300/80"
                    style={{ height: `${Math.max(3, Math.min(100, Math.round(band.value * 100)))}%` }}
                  />
                </div>
                <div className="mt-1 truncate text-center text-[9px] text-zinc-500">{band.label}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className={`mt-2 truncate text-[10px] ${readout.warning ? 'text-amber-200' : 'text-zinc-500'}`}>
        {readout.warning ?? readout.detail}
      </div>
    </div>
  );
}

export function ProgramPreviewPerformanceOverlay({
  telemetry,
  workerPlan,
  videoLayerCount,
  previewCacheCandidateCount = 0,
  previewCacheQueueableCount = 0,
  activePreviewCacheJobCount = 0,
  activePreviewCacheJobProgress = 0,
  activePreviewCacheJobLabel,
  onQueuePreviewCache,
}: {
  telemetry: PreviewFrameTelemetry;
  workerPlan: PreviewWorkerPlan;
  videoLayerCount: number;
  previewCacheCandidateCount?: number;
  previewCacheQueueableCount?: number;
  activePreviewCacheJobCount?: number;
  activePreviewCacheJobProgress?: number;
  activePreviewCacheJobLabel?: string;
  onQueuePreviewCache?: () => void;
}) {
  const statusClassName = previewFrameStatusClassName(telemetry.status);
  const workerStatusClassName = previewWorkerStatusClassName(workerPlan.status);
  const hasPreviewCacheCandidates = previewCacheCandidateCount > 0;
  const canQueuePreviewCache = previewCacheQueueableCount > 0 && Boolean(onQueuePreviewCache);
  const previewCacheButtonLabel = canQueuePreviewCache
    ? `Cache preview (${previewCacheQueueableCount})`
    : activePreviewCacheJobCount > 0
      ? `Caching preview ${activePreviewCacheJobProgress}%`
      : 'Cache preview';

  return (
    <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/75 px-3 py-2 text-[11px] text-zinc-300" data-testid="program-preview-performance">
      <div className="mb-1 flex items-center gap-2">
        <span className="font-semibold text-white">Preview</span>
        <span className={`rounded px-1.5 py-0.5 font-semibold ${statusClassName}`}>
          {telemetry.status}
        </span>
      </div>
      <div className="tabular-nums">
        {telemetry.label}
      </div>
      <div className="mt-1 text-[10px] text-zinc-500">
        {videoLayerCount} video layer{videoLayerCount === 1 ? '' : 's'} / +{telemetry.totalFrameDelta} frames / -{telemetry.droppedFrameDelta} drop
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px]">
        <span className={`rounded px-1.5 py-0.5 font-semibold ${workerStatusClassName}`}>
          {workerPlan.mode}
        </span>
        <span className="text-zinc-400">
          {workerPlan.estimatedFrameCostMs.toFixed(1)}ms / {workerPlan.frameBudgetMs.toFixed(1)}ms
        </span>
      </div>
      <div className="mt-1 max-w-56 truncate text-[10px] text-zinc-400">
        {workerPlan.sourceSummaryLabel}
      </div>
      <div className="mt-1 max-w-56 truncate text-[10px] text-zinc-500">
        {workerPlan.frameDeliveryLabel}
      </div>
      {workerPlan.warnings[0] ? (
        <div className="mt-1 max-w-56 truncate text-[10px] text-amber-200">
          {workerPlan.warnings[0]}
        </div>
      ) : null}
      {hasPreviewCacheCandidates ? (
        <button
          type="button"
          className={`pointer-events-auto mt-2 rounded border px-2 py-1 text-[10px] font-semibold ${
            canQueuePreviewCache
              ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25'
              : 'cursor-not-allowed border-zinc-700 bg-zinc-800/60 text-zinc-400'
          }`}
          disabled={!canQueuePreviewCache}
          title={activePreviewCacheJobCount > 0 ? `${activePreviewCacheJobCount} preview cache job${activePreviewCacheJobCount === 1 ? '' : 's'} already running` : undefined}
          onClick={(event) => {
            event.stopPropagation();
            onQueuePreviewCache?.();
          }}
        >
          {previewCacheButtonLabel}
        </button>
      ) : null}
      {activePreviewCacheJobCount > 0 ? (
        <div className="mt-2 max-w-56">
          <div className="flex items-center justify-between gap-2 text-[10px] text-sky-100">
            <span>Preview cache</span>
            <span className="tabular-nums">{activePreviewCacheJobProgress}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded bg-zinc-800">
            <div className="h-full rounded bg-sky-300" style={{ width: `${Math.max(4, Math.min(100, activePreviewCacheJobProgress))}%` }} />
          </div>
          {activePreviewCacheJobLabel ? (
            <div className="mt-1 truncate text-[10px] text-zinc-400">
              {activePreviewCacheJobLabel}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ProgramStackOverlay({ stack }: { stack: ProgramPreviewStack }) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 max-w-[55%] space-y-2" data-testid="program-stack-overlay">
      <div className="rounded bg-black/70 px-3 py-2 text-xs text-zinc-200">
        <div className="font-semibold text-white">Composite stack</div>
        <div className="mt-1 text-zinc-300" data-testid="program-stack-summary">{stack.mediaLayers.length} media / {stack.textLayers.length} text / {stack.activeCaptions.length} caption / {stack.audioLayers.length} audio</div>
      </div>
      <div className="max-h-28 space-y-1 overflow-hidden">
        {stack.visualLayers.slice().reverse().slice(0, 4).map((layer) => (
          <div
            key={`${layer.trackId}-${layer.clip.id}`}
            className="rounded bg-black/65 px-2 py-1 text-[11px] text-zinc-200"
            data-testid={`program-visual-layer-${layer.trackId}-${layer.clip.id}`}
          >
            <span className="font-medium text-white">{layer.trackName}</span>
            <span className="mx-1 text-zinc-500">/</span>
            <span>{layer.clip.name}</span>
            <span className="ml-1 text-zinc-400">
              {layer.clip.blendMode !== 'normal' ? layer.clip.blendMode : `${Math.round(layer.style.opacity * 100)}%`}
            </span>
          </div>
        ))}
      </div>
      {stack.audioLayers.length > 0 ? (
        <div className="max-h-24 space-y-1 overflow-hidden">
          {stack.audioLayers.slice(0, 3).map((layer) => (
            <div
              key={`audio-${layer.trackId}-${layer.clip.id}`}
              className="rounded bg-black/65 px-2 py-1 text-[11px] text-sky-100"
              data-testid={`program-audio-layer-${layer.trackId}-${layer.clip.id}`}
            >
              <span className="font-medium text-white">{layer.trackName}</span>
              <span className="mx-1 text-zinc-500">/</span>
              <span>{layer.clip.name}</span>
              <span className="ml-1 text-sky-200">
                {Math.round(layer.style.volume * 100)}% {formatTrackPan(layer.style.pan)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {stack.warnings.length > 0 ? (
        <div className="rounded bg-amber-950/80 px-3 py-2 text-[11px] text-amber-100">
          {stack.warnings[0]}
        </div>
      ) : null}
    </div>
  );
}

function ScopeReadout({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border border-zinc-800 bg-zinc-950/70 px-2 py-1">
      <div className="text-[9px] uppercase tracking-normal text-zinc-500">{label}</div>
      <div className="tabular-nums text-zinc-100">{value}</div>
    </div>
  );
}

function ScopeChannelWaveform({ label, values, className }: { label: string; values: number[]; className: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-center text-[9px] font-semibold text-zinc-500">{label}</div>
      <div className="flex h-8 items-end gap-px border border-zinc-800 bg-zinc-950/80 px-0.5 pb-0.5 pt-0.5">
        {values.map((value, index) => (
          <span
            key={`${label}-${index}`}
            className={`block flex-1 ${className}`}
            style={{ height: `${Math.max(3, clampNumber(value, 0, 1) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function MeterBar({ label, width, className, value }: { label: string; width: string; className: string; value: string }) {
  return (
    <div className="grid grid-cols-[10px_minmax(0,1fr)_48px] items-center gap-2">
      <span className="text-zinc-500">{label}</span>
      <span className="h-2 overflow-hidden rounded bg-zinc-800">
        <span className={`block h-full rounded ${className}`} style={{ width }} />
      </span>
      <span className="text-right tabular-nums text-zinc-400">{value}</span>
    </div>
  );
}

function audioMeterBarClassName(status: AudioMeterStatus): string {
  switch (status) {
    case 'clipping':
      return 'bg-rose-400';
    case 'hot':
      return 'bg-amber-300';
    case 'pending':
      return 'bg-zinc-600';
    default:
      return 'bg-emerald-400';
  }
}

function audioMeterStatusClassName(status: AudioMeterStatus): string {
  switch (status) {
    case 'clipping':
      return 'font-semibold text-rose-300';
    case 'hot':
      return 'font-semibold text-amber-200';
    case 'nominal':
      return 'text-emerald-300';
    default:
      return 'text-zinc-500';
  }
}

function audioAnalyzerStatusClassName(status: AudioAnalyzerStatus): string {
  switch (status) {
    case 'left-heavy':
    case 'right-heavy':
    case 'dense':
    case 'wide':
      return 'font-semibold text-amber-200';
    case 'balanced':
      return 'text-emerald-300';
    case 'live':
      return 'text-fuchsia-200';
    case 'pending':
    case 'silent':
    default:
      return 'text-zinc-500';
  }
}

function videoScopeStatusClassName(status: VideoScopeReadoutStatus): string {
  switch (status) {
    case 'balanced':
      return 'bg-emerald-500/20 text-emerald-200';
    case 'clipped':
      return 'bg-rose-500/20 text-rose-200';
    case 'underexposed':
    case 'overexposed':
    case 'low-contrast':
      return 'bg-amber-500/20 text-amber-200';
    case 'pending':
    default:
      return 'bg-zinc-600/40 text-zinc-300';
  }
}

function formatMonoCompatibility(value: number | null): string {
  return value === null ? '--' : `${Math.round(clampNumber(value, 0, 1) * 100)}%`;
}

function monoCompatibilityBarClassName(value: number | null): string {
  if (value === null) {
    return 'bg-zinc-600';
  }

  if (value <= 0.25) {
    return 'bg-amber-300';
  }

  return 'bg-emerald-300';
}

function buildScopeVectorPointStyle(point: VideoScopePoint): CSSProperties {
  return {
    left: `${clampNumber((point.x + 1) * 50, 0, 100)}%`,
    top: `${clampNumber((1 - point.y) * 50, 0, 100)}%`,
    opacity: clampNumber(0.25 + point.intensity * 0.75, 0.25, 1),
  };
}

function formatScopePercent(value: number): string {
  return `${Math.round(clampNumber(value, 0, 1) * 100)}%`;
}

function previewFrameStatusClassName(status: PreviewFrameStatus): string {
  switch (status) {
    case 'smooth':
      return 'bg-emerald-500/20 text-emerald-200';
    case 'warning':
      return 'bg-amber-500/20 text-amber-200';
    case 'dropping':
      return 'bg-rose-500/20 text-rose-200';
    default:
      return 'bg-zinc-600/40 text-zinc-300';
  }
}

function previewWorkerStatusClassName(status: PreviewWorkerStatus): string {
  switch (status) {
    case 'ready':
      return 'bg-cyan-500/20 text-cyan-200';
    case 'degraded':
      return 'bg-amber-500/20 text-amber-200';
    default:
      return 'bg-zinc-600/40 text-zinc-300';
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
