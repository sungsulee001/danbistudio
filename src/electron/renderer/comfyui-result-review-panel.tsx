import { useEffect, useRef } from 'react';
import type { ComfyUIResultReviewReport } from '../../lib/editor/comfyui-results';
import { formatPreviewSourceMode, resolvePreviewMediaSource } from '../../lib/editor/preview-source';
import type { PreviewMediaSource } from '../../lib/editor/preview-source';
import { resolveRenderableAssetMediaKind } from '../../lib/editor/renderable-media-kind';
import type { EditorAsset, TimelineClip } from '../../lib/editor/types';
import type { ComfyUIReviewItem } from './editor-view-model';

export type ReviewMediaPreviewStatus = 'ready' | 'missing-asset' | 'missing-preview';

export interface ReviewMediaPreviewState {
  status: ReviewMediaPreviewStatus;
  source: string;
  previewSource: PreviewMediaSource;
  message?: string;
}

export function resolveReviewMediaPreviewState(asset?: EditorAsset): ReviewMediaPreviewState {
  const previewSource = resolvePreviewMediaSource(asset);
  if (!asset || (!asset.source && !asset.renderPath)) {
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
      message: 'Preview source unavailable',
    };
  }

  return {
    status: 'ready',
    source: previewSource.source,
    previewSource,
  };
}

export function ComfyUIResultReviewPanel({
  items,
  selectedItem,
  playhead,
  fps,
  onSelect,
  onImportAll,
  onReplaceAll,
  onApplyAllAsAiEffectPass,
}: {
  items: ComfyUIReviewItem[];
  selectedItem: ComfyUIReviewItem;
  playhead: number;
  fps: number;
  onSelect: (automationJobId: string) => void;
  onImportAll: () => void;
  onReplaceAll: () => void;
  onApplyAllAsAiEffectPass: () => void;
}) {
  const localTime = roundTime(clampNumber(playhead - selectedItem.sourceClip.start, 0, selectedItem.sourceClip.duration));
  const sourceLabel = selectedItem.sourceAsset?.name ?? selectedItem.sourceClip.name;
  const resultDuration = selectedItem.result.media?.duration ?? selectedItem.resultAsset.duration;
  const promptLabel = selectedItem.result.prompt
    ?? selectedItem.result.workflowName
    ?? selectedItem.result.promptId
    ?? 'prepared';
  const lineage = selectedItem.reviewReport.lineage;

  return (
    <div className="rounded-md border border-accent2-500/30 bg-accent2-500/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-kicker font-heading font-semibold uppercase text-accent2-900">AI Result Review</h2>
        <span className="text-meta text-accent2-800">{items.length} ready</span>
      </div>

      {items.length > 1 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {items.map((item, index) => (
            <button
              key={item.result.automationJobId}
              type="button"
              className={`shrink-0 rounded border px-2 py-1 text-meta ${
                item.result.automationJobId === selectedItem.result.automationJobId
                  ? 'border-accent2-700 bg-accent2-700/15 text-ink'
                  : 'border-ds-300 bg-paper text-ds-700 hover:border-accent2-600'
              }`}
              onClick={() => onSelect(item.result.automationJobId)}
            >
              {index + 1}. {item.sourceClip.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 2xl:grid-cols-2">
        <ReviewMediaPreview
          label="Original"
          asset={selectedItem.sourceAsset}
          clip={selectedItem.sourceClip}
          localTime={localTime}
          fallbackName={sourceLabel}
        />
        <ReviewMediaPreview
          label="ComfyUI"
          asset={selectedItem.resultAsset}
          clip={selectedItem.resultClip}
          localTime={localTime}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-meta text-ds-700">
        <ReviewReadout label="Clip" value={selectedItem.sourceClip.name} />
        <ReviewReadout label="Time" value={formatTimecode(selectedItem.sourceClip.start + localTime, fps)} />
        <ReviewReadout label="Source" value={`${selectedItem.sourceClip.duration.toFixed(2)}s ${selectedItem.reviewReport.sourceResolution ?? 'source'}`} />
        <ReviewReadout label="Result" value={`${resultDuration.toFixed(2)}s ${selectedItem.reviewReport.resultResolution ?? selectedItem.resultAsset.kind}`} />
        <ReviewReadout label="Workflow" value={selectedItem.result.workflowName ?? 'workflow'} />
        <ReviewReadout label="Model" value={selectedItem.result.modelName ?? 'model'} />
        <ReviewReadout label="Prompt" value={promptLabel} />
        <ReviewReadout label="Cache" value={`${selectedItem.reviewReport.hasProxy ? 'proxy' : 'no proxy'} / ${selectedItem.reviewReport.hasWaveform ? 'waveform' : 'no waveform'}`} />
      </div>

      <div className="mt-3 rounded border border-accent2-600/20 bg-paper/70 p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-meta font-semibold uppercase tracking-wide text-accent2-900">Prompt lineage</span>
          <span className={`rounded px-2 py-0.5 text-meta ${comfyUIPromptLineageClass(lineage.versionLabel)}`}>
            {formatComfyUIPromptLineageVersion(lineage.versionLabel)}
          </span>
        </div>
        <div className="mt-2 space-y-1 text-meta text-ds-700">
          {lineage.changes.length > 0 ? (
            lineage.changes.map((change) => (
              <div key={change.field} className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 rounded bg-surface/70 px-2 py-1">
                <span className="text-ds-600">{change.label}</span>
                <span className="min-w-0 truncate" title={`${formatLineageValue(change.before)} -> ${formatLineageValue(change.after)}`}>
                  {formatLineageValue(change.before)} <span className="text-accent2-700">-&gt;</span> {formatLineageValue(change.after)}
                </span>
              </div>
            ))
          ) : (
            <div className="rounded bg-surface/70 px-2 py-1 text-ds-700">
              {lineage.warnings[0] ?? 'Prompt, workflow, and seed match the source generation.'}
            </div>
          )}
        </div>
      </div>

      {selectedItem.reviewReport.issues[0] || selectedItem.reviewReport.warnings[0] ? (
        <div className="mt-3 rounded border border-warn-500/30 bg-warn-500/10 p-2 text-xs text-warn-900">
          {selectedItem.reviewReport.issues[0] ?? selectedItem.reviewReport.warnings[0]}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-xs">
        <button
          type="button"
          className="rounded border border-accent-500/40 bg-accent-500/10 px-3 py-1.5 text-accent-900 hover:border-accent-700"
          onClick={onImportAll}
        >
          Import all
        </button>
        <button
          type="button"
          className="rounded border border-accent2-600/50 bg-accent2-600/10 px-3 py-1.5 text-accent2-900 hover:border-accent2-800"
          onClick={onReplaceAll}
        >
          Replace originals
        </button>
        <button
          type="button"
          className="rounded border border-info-600/50 bg-info-600/10 px-3 py-1.5 text-info-900 hover:border-info-800"
          onClick={onApplyAllAsAiEffectPass}
        >
          Apply as AI FX
        </button>
      </div>
    </div>
  );
}

function formatComfyUIPromptLineageVersion(version: ComfyUIResultReviewReport['lineage']['versionLabel']): string {
  switch (version) {
    case 'same':
      return 'Same version';
    case 'changed':
      return 'Changed';
    case 'missing-source':
      return 'No source metadata';
    case 'missing-result':
      return 'No result metadata';
    default:
      return version;
  }
}

function comfyUIPromptLineageClass(version: ComfyUIResultReviewReport['lineage']['versionLabel']): string {
  switch (version) {
    case 'same':
      return 'border border-accent-500/30 bg-accent-500/10 text-accent-800';
    case 'changed':
      return 'border border-accent2-600/30 bg-accent2-600/10 text-accent2-900';
    case 'missing-source':
    case 'missing-result':
      return 'border border-warn-500/30 bg-warn-500/10 text-warn-900';
    default:
      return 'border border-ds-300 bg-surface text-ds-700';
  }
}

function formatLineageValue(value?: string | number): string {
  if (value === undefined || value === '') {
    return 'missing';
  }

  return String(value);
}

function ReviewMediaPreview({
  label,
  asset,
  clip,
  localTime,
  fallbackName,
}: {
  label: string;
  asset?: EditorAsset;
  clip: TimelineClip;
  localTime: number;
  fallbackName?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const previewState = resolveReviewMediaPreviewState(asset);

  useEffect(() => {
    const media = videoRef.current ?? audioRef.current;
    if (!media || !Number.isFinite(localTime)) {
      return;
    }

    if (Math.abs(media.currentTime - localTime) > 0.2) {
      media.currentTime = Math.max(0, localTime);
    }
  }, [localTime, previewState.source]);

  if (!asset || previewState.status !== 'ready') {
    return (
      <div className="relative flex min-h-40 items-center justify-center overflow-hidden rounded border border-ds-200 on-dark bg-monitor p-4 text-center text-xs text-ds-600">
        <ReviewPreviewBadge label={label} name={asset?.name ?? fallbackName ?? clip.name} time={localTime} />
        {previewState.message}
      </div>
    );
  }

  const previewSource = previewState.previewSource;
  const source = previewState.source;
  const overlay = <ReviewPreviewBadge label={label} name={asset.name} time={localTime} />;
  const waveform = asset.mediaCache?.waveformPeaks?.length
    ? <ReviewWaveform peaks={asset.mediaCache.waveformPeaks} />
    : null;
  const cacheBadge = (
    <div className="pointer-events-none absolute bottom-2 right-2 rounded on-dark bg-black/75 px-2 py-1 text-micro text-ds-700">
      {formatPreviewSourceMode(previewSource)}
      {previewSource.hasWaveform ? ' / waveform' : ''}
    </div>
  );

  const mediaKind = resolveRenderableAssetMediaKind(asset);
  if (mediaKind === 'image') {
    return (
      <div className="relative flex min-h-40 items-center justify-center overflow-hidden rounded border border-ds-200 on-dark bg-monitor">
        <img src={source} alt={asset.name} className="max-h-48 max-w-full object-contain" />
        {overlay}
        {cacheBadge}
      </div>
    );
  }

  if (mediaKind === 'audio') {
    return (
      <div className="relative flex min-h-40 flex-col items-center justify-center gap-3 overflow-hidden rounded border border-ds-200 on-dark bg-monitor p-4">
        {waveform ?? <ReviewWaveform peaks={undefined} seed={clip.id} />}
        <audio ref={audioRef} src={source} controls className="w-full" />
        {overlay}
        {cacheBadge}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-40 items-center justify-center overflow-hidden rounded border border-ds-200 on-dark bg-monitor">
      <video
        ref={videoRef}
        src={source}
        controls
        muted
        className="max-h-52 max-w-full object-contain"
      />
      {waveform ? (
        <div className="absolute inset-x-3 bottom-3 h-10 rounded on-dark bg-black/70 p-1">
          <ReviewWaveform peaks={asset.mediaCache?.waveformPeaks} compact />
        </div>
      ) : null}
      {overlay}
      {cacheBadge}
    </div>
  );
}

function ReviewWaveform({ peaks, seed = 'review', compact = false }: { peaks?: number[]; seed?: string; compact?: boolean }) {
  const values = peaks && peaks.length > 0
    ? peaks.slice(0, 96)
    : Array.from({ length: 48 }).map((_, index) => pseudoRandomWaveHeight(seed, index));

  return (
    <div className={`flex w-full items-center gap-px ${compact ? 'h-full' : 'h-16'}`}>
      {values.map((value, index) => (
        <span
          key={index}
          className="flex-1 rounded-sm bg-accent-600/75"
          style={{ height: `${12 + Math.min(1, Math.max(0, value)) * 78}%` }}
        />
      ))}
    </div>
  );
}

function ReviewPreviewBadge({ label, name, time }: { label: string; name: string; time: number }) {
  return (
    <div className="pointer-events-none absolute left-2 top-2 max-w-[88%] rounded on-dark bg-black/75 px-2 py-1 text-meta text-ds-800">
      <span className="font-semibold text-white">{label}</span>
      <span className="mx-1 text-ds-600">/</span>
      <span>{name}</span>
      <span className="ml-1 text-ds-700">{time.toFixed(2)}s</span>
    </div>
  );
}

function ReviewReadout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-ds-200 py-2 text-sm">
      <span className="text-ds-600">{label}</span>
      <span className="text-ink">{value}</span>
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

  return `${padTime(hours)}:${padTime(minutes)}:${padTime(secs)}:${padTime(frames)}`;
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function pseudoRandomWaveHeight(seed: string, index: number): number {
  let value = 0;
  const input = `${seed}-${index}`;
  for (let i = 0; i < input.length; i += 1) {
    value = (value * 31 + input.charCodeAt(i)) % 997;
  }

  return 0.18 + (value % 82) / 100;
}

function padTime(value: number): string {
  return String(value).padStart(2, '0');
}
