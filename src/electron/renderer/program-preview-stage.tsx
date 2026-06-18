import type { ProgramAudioAnalyzerSample, ProgramAudioFftSample } from '../../lib/editor/audio-analyzer';
import type { AudioMeterSample } from '../../lib/editor/audio-meter';
import type { ProgramPreviewLayer, ProgramPreviewStack } from '../../lib/editor/preview';
import { isRenderableVisualMediaAsset } from '../../lib/editor/renderable-media-kind';
import { resolvePreviewMediaSource } from '../../lib/editor/preview-source';
import type { VideoScopeReadout } from '../../lib/editor/video-scopes';
import type { MediaCacheJobView, ProgramCropPatch, ProgramMotionPatch } from './editor-view-model';
import { ProgramCompositePreview } from './program-composite-preview';

export function hasProgramPreviewVisualMediaLayer(layer: ProgramPreviewLayer): boolean {
  const asset = layer.asset;
  if (!asset || !isRenderableVisualMediaAsset(asset)) {
    return false;
  }

  return Boolean(asset.source || asset.renderPath || resolvePreviewMediaSource(asset).source);
}

export function PreviewStage({
  stack,
  audioMeter,
  audioAnalysis,
  isPlaying,
  playbackRate,
  playhead,
  active,
  onActivate,
  selectedClipId,
  canEditSelectedMotion,
  canEditSelectedCrop,
  onMotionDragCommit,
  onCropDragCommit,
  onSelectPreviewClip,
  activeCacheJobAssetIds,
  cacheJobsByAssetId,
  onQueuePreviewCache,
  onAudioFftSample,
  onVideoScopeReadout,
}: {
  stack: ProgramPreviewStack;
  audioMeter: AudioMeterSample;
  audioAnalysis: ProgramAudioAnalyzerSample;
  isPlaying: boolean;
  playbackRate: number;
  playhead: number;
  active: boolean;
  onActivate: () => void;
  selectedClipId?: string;
  canEditSelectedMotion: boolean;
  canEditSelectedCrop: boolean;
  onMotionDragCommit: (clipId: string, patch: ProgramMotionPatch) => void;
  onCropDragCommit: (clipId: string, patch: ProgramCropPatch) => void;
  onSelectPreviewClip: (clipId: string) => void;
  activeCacheJobAssetIds?: Set<string>;
  cacheJobsByAssetId?: Record<string, MediaCacheJobView>;
  onQueuePreviewCache?: (assetIds: string[]) => void;
  onAudioFftSample?: (sample: ProgramAudioFftSample) => void;
  onVideoScopeReadout?: (readout: VideoScopeReadout | null) => void;
}) {
  const hasPreviewMedia = stack.mediaLayers.some(hasProgramPreviewVisualMediaLayer);
  const hasPreviewLayers = hasPreviewMedia || stack.textLayers.length > 0 || stack.effectLayers.length > 0 || stack.audioLayers.length > 0;

  return (
    <div
      role="button"
      data-testid="program-monitor"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate();
        }
      }}
      className={`relative min-h-[320px] overflow-hidden rounded-md border bg-zinc-950 ${
        active ? 'border-emerald-500' : 'border-zinc-800'
      }`}
    >
      {hasPreviewLayers ? (
        <ProgramCompositePreview
          stack={stack}
          audioMeter={audioMeter}
          audioAnalysis={audioAnalysis}
          isPlaying={isPlaying}
          playbackRate={playbackRate}
          playhead={playhead}
          active={active}
          selectedClipId={selectedClipId}
          canEditSelectedMotion={canEditSelectedMotion}
          canEditSelectedCrop={canEditSelectedCrop}
          onMotionDragCommit={onMotionDragCommit}
          onCropDragCommit={onCropDragCommit}
          onSelectPreviewClip={onSelectPreviewClip}
          activeCacheJobAssetIds={activeCacheJobAssetIds}
          cacheJobsByAssetId={cacheJobsByAssetId}
          onQueuePreviewCache={onQueuePreviewCache}
          onAudioFftSample={onAudioFftSample}
          onVideoScopeReadout={onVideoScopeReadout}
        />
      ) : (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(20,184,166,0.26),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.2),rgba(20,20,20,0.96))]" />
          <div className="absolute inset-8 border border-white/10" />
          <div className="absolute left-8 top-8 h-24 w-40 rounded-sm border border-sky-300/40 bg-sky-300/10" />
          <div className="absolute bottom-10 right-10 h-28 w-52 rounded-sm border border-emerald-300/40 bg-emerald-300/10" />
          <div className="relative flex h-full min-h-[320px] items-end p-8">
            <div>
              <div className="mb-3 inline-flex rounded bg-black/40 px-3 py-1 text-xs uppercase tracking-wide text-zinc-300">
                Program Monitor
              </div>
              <h1 className="max-w-xl text-3xl font-semibold text-white">{stack.layers[0]?.clip.name ?? 'No active visual clip'}</h1>
              <p className="mt-2 max-w-xl text-sm text-zinc-300">
                {stack.warnings[0] ?? 'Move the playhead over a video or image clip to preview the timeline composite.'}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
