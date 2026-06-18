import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CROP_MASK_EFFECT_LABEL, findCropMaskEffect, isCropMaskEffect, normalizeCropMaskParameters, type CropMaskParameters } from '../../lib/editor/crop-mask';
import type { ProgramPreviewStack } from '../../lib/editor/preview';
import { aggregatePreviewFrameTelemetry, buildPreviewFrameTelemetry, type PreviewFrameSample, type PreviewFrameTelemetry } from '../../lib/editor/preview-performance';
import { buildPreviewWorkerSourceStats } from '../../lib/editor/preview-worker';
import { isRenderableVideoMediaAsset, isRenderableVisualMediaAsset } from '../../lib/editor/renderable-media-kind';
import { resolveVideoScopeReadout, type VideoScopeReadout, type VideoScopeSample } from '../../lib/editor/video-scopes';
import type { ProgramAudioAnalyzerSample, ProgramAudioFftSample } from '../../lib/editor/audio-analyzer';
import type { AudioMeterSample } from '../../lib/editor/audio-meter';
import type { ClipEffect, TimelineClip } from '../../lib/editor/types';
import type { MediaCacheJobView, ProgramCropPatch, ProgramMonitorGuides, ProgramMotionPatch } from './editor-view-model';
import { resolveMediaCacheProgressSummary } from './media-cache-workflow-helpers';
import { buildProgramPreviewWorkerSourceLayers, filterQueueableProgramPreviewCacheAssetIds, resolveProgramPreviewCacheCandidateAssetIds } from './program-preview-cache-helpers';
import { ProgramAudioMixer } from './program-audio-graph-controller';
import { ProgramCaptionOverlays, ProgramEffectOverlay, ProgramTextOverlays } from './program-caption-title-overlays';
import { ProgramMediaLayerPreview, ProgramPrivacyRegionOverlays } from './program-media-layer-preview';
import {
  ProgramAudioAnalyzerOverlay,
  ProgramAudioMeterOverlay,
  ProgramPreviewPerformanceOverlay,
  ProgramStackOverlay,
  ProgramVideoScopesOverlay,
} from './program-monitor-overlays';
import { ProgramCropOverlay, ProgramLayerSelectionTargets, ProgramMonitorCenterGuides, ProgramTransformOverlay } from './program-transform-crop-overlays';
import { usePreviewWorkerController } from './preview-worker-controller';

export function ProgramCompositePreview({
  stack,
  audioMeter,
  audioAnalysis,
  isPlaying,
  playbackRate,
  playhead,
  active,
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
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [motionDraft, setMotionDraft] = useState<{ clipId: string; patch: ProgramMotionPatch } | null>(null);
  const [cropDraft, setCropDraft] = useState<{ clipId: string; parameters: CropMaskParameters } | null>(null);
  const [programGuides, setProgramGuides] = useState<ProgramMonitorGuides | null>(null);
  const [previewFrameTelemetryByClipId, setPreviewFrameTelemetryByClipId] = useState<Record<string, PreviewFrameTelemetry>>({});
  const [videoScopeSampleByClipId, setVideoScopeSampleByClipId] = useState<Record<string, VideoScopeSample>>({});

  useEffect(() => {
    const node = previewRef.current;
    if (!node || typeof ResizeObserver === 'undefined') {
      return;
    }

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setPreviewSize({
        width: Math.max(0, rect.width),
        height: Math.max(0, rect.height),
      });
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    updateSize();

    return () => observer.disconnect();
  }, []);

  const canvasScale = previewSize.width > 0 && previewSize.height > 0
    ? Math.min(previewSize.width / stack.canvasWidth, previewSize.height / stack.canvasHeight)
    : 1;
  const hasMeasuredPreviewSize = previewSize.width > 0 && previewSize.height > 0;
  const canvasStageSize = hasMeasuredPreviewSize
    ? {
      width: Math.max(1, stack.canvasWidth * canvasScale),
      height: Math.max(1, stack.canvasHeight * canvasScale),
    }
    : {
      width: stack.canvasWidth,
      height: stack.canvasHeight,
    };
  const canvasStageStyle = buildProgramCanvasStageStyle(canvasStageSize, hasMeasuredPreviewSize);
  const selectedLayer = selectedClipId
    ? stack.mediaLayers.find((layer) => layer.clip.id === selectedClipId)
      ?? stack.textLayers.find((layer) => layer.clip.id === selectedClipId)
    : undefined;
  const displayedSelectedLayer = selectedLayer
    ? {
      ...selectedLayer,
      style: {
        ...selectedLayer.style,
        ...(motionDraft?.clipId === selectedLayer.clip.id ? motionDraft.patch : {}),
      },
      clip: cropDraft?.clipId === selectedLayer.clip.id
        ? buildPreviewClipWithCropParameters(selectedLayer.clip, cropDraft.parameters)
        : selectedLayer.clip,
    }
    : undefined;
  const videoLayerIds = useMemo(() => (
    stack.mediaLayers
      .filter((layer) => isRenderableVideoMediaAsset(layer.asset))
      .map((layer) => layer.clip.id)
  ), [stack.mediaLayers]);
  const previewWorkerSourceLayers = useMemo(() => (
    buildProgramPreviewWorkerSourceLayers(stack)
  ), [stack]);
  const previewWorkerSourceStats = useMemo(() => (
    buildPreviewWorkerSourceStats(previewWorkerSourceLayers)
  ), [previewWorkerSourceLayers]);
  const previewCacheCandidateAssetIds = useMemo(() => (
    resolveProgramPreviewCacheCandidateAssetIds(stack)
  ), [stack]);
  const previewCacheQueueableAssetIds = useMemo(() => (
    filterQueueableProgramPreviewCacheAssetIds(previewCacheCandidateAssetIds, activeCacheJobAssetIds)
  ), [activeCacheJobAssetIds, previewCacheCandidateAssetIds]);
  const previewCacheProgress = useMemo(() => (
    resolveMediaCacheProgressSummary(cacheJobsByAssetId ?? {}, previewCacheCandidateAssetIds)
  ), [cacheJobsByAssetId, previewCacheCandidateAssetIds]);
  const handleQueuePreviewCache = useCallback(() => {
    if (previewCacheQueueableAssetIds.length === 0) {
      return;
    }

    onQueuePreviewCache?.(previewCacheQueueableAssetIds);
  }, [onQueuePreviewCache, previewCacheQueueableAssetIds]);
  const scopeLayerIds = useMemo(() => (
    stack.mediaLayers
      .filter((layer) => isRenderableVisualMediaAsset(layer.asset))
      .map((layer) => layer.clip.id)
  ), [stack.mediaLayers]);
  const videoLayerSignature = videoLayerIds.join('|');
  const previewFrameTelemetry = useMemo(() => (
    aggregatePreviewFrameTelemetry(Object.values(previewFrameTelemetryByClipId))
  ), [previewFrameTelemetryByClipId]);
  const previewWorkerState = usePreviewWorkerController({
    previewWidth: canvasStageSize.width,
    previewHeight: canvasStageSize.height,
    canvasWidth: stack.canvasWidth,
    canvasHeight: stack.canvasHeight,
    videoLayerCount: videoLayerIds.length,
    videoLayerSignature,
    sourceStats: previewWorkerSourceStats,
    sourceLayers: previewWorkerSourceLayers,
  });
  const previewWorkerPlan = previewWorkerState.plan;
  const activeScopeClipId = displayedSelectedLayer && isRenderableVisualMediaAsset(displayedSelectedLayer.asset)
    ? displayedSelectedLayer.clip.id
    : stack.primaryLayer?.clip.id;
  const activeVideoScopeSample = activeScopeClipId ? videoScopeSampleByClipId[activeScopeClipId] : undefined;
  const activeVideoScopeReadout = useMemo(() => (
    activeVideoScopeSample ? resolveVideoScopeReadout(activeVideoScopeSample) : null
  ), [activeVideoScopeSample]);

  useEffect(() => {
    const activeIds = new Set(videoLayerIds);
    setPreviewFrameTelemetryByClipId((current) => {
      const nextEntries = Object.entries(current).filter(([clipId]) => activeIds.has(clipId));
      return nextEntries.length === Object.keys(current).length ? current : Object.fromEntries(nextEntries);
    });
  }, [videoLayerIds]);

  useEffect(() => {
    const activeIds = new Set(scopeLayerIds);
    setVideoScopeSampleByClipId((current) => {
      const nextEntries = Object.entries(current).filter(([clipId]) => activeIds.has(clipId));
      return nextEntries.length === Object.keys(current).length ? current : Object.fromEntries(nextEntries);
    });
  }, [scopeLayerIds]);

  useEffect(() => {
    onVideoScopeReadout?.(activeVideoScopeReadout);
  }, [activeVideoScopeReadout, onVideoScopeReadout]);

  const handlePreviewFrameSample = useCallback((clipId: string, sample: PreviewFrameSample) => {
    setPreviewFrameTelemetryByClipId((current) => ({
      ...current,
      [clipId]: buildPreviewFrameTelemetry(sample, current[clipId]),
    }));
  }, []);

  const handleVideoScopeSample = useCallback((clipId: string, sample: VideoScopeSample) => {
    setVideoScopeSampleByClipId((current) => ({
      ...current,
      [clipId]: sample,
    }));
  }, []);

  return (
    <div
      ref={previewRef}
      data-testid="program-monitor-frame"
      className="relative min-h-[320px] overflow-hidden bg-black"
      style={{
        position: 'relative',
        minHeight: 320,
        overflow: 'hidden',
        backgroundColor: '#000000',
      }}
    >
      <div style={canvasStageStyle} className="isolate overflow-hidden bg-black">
        {stack.mediaLayers.length > 0 ? (
          <div className="absolute inset-0 isolate bg-black">
            {stack.mediaLayers.map((layer, index) => {
              if (!layer.asset) {
                return null;
              }

              const displayedLayer = buildDisplayedProgramMediaLayer(layer, motionDraft, cropDraft);
              return (
                <div
                  key={`${layer.trackId}-${layer.clip.id}`}
                  style={buildCompositeMediaLayerStyle(displayedLayer, index, canvasScale)}
                >
                  <ProgramMediaLayerPreview
                    asset={layer.asset}
                    clip={displayedLayer.clip}
                    isPlaying={isPlaying}
                    playbackRate={playbackRate}
                    playhead={playhead}
                    localTime={layer.localTime}
                    mediaTime={layer.mediaTime}
                    active={active}
                    workerFrame={layer.asset?.id === previewWorkerState.decodedFrame?.mediaId ? previewWorkerState.decodedFrame : undefined}
                    onFrameSample={handlePreviewFrameSample}
                    onScopeSample={handleVideoScopeSample}
                  />
                  <ProgramPrivacyRegionOverlays clip={displayedLayer.clip} localTime={layer.localTime} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center bg-black text-sm text-zinc-500">
            No active media layer
          </div>
        )}
        <ProgramTextOverlays stack={stack} canvasScale={canvasScale} motionDraft={motionDraft} />
        <ProgramLayerSelectionTargets
          layers={[...stack.mediaLayers, ...stack.textLayers]}
          selectedClipId={selectedClipId}
          canvasScale={canvasScale}
          canvasWidth={stack.canvasWidth}
          canvasHeight={stack.canvasHeight}
          onSelect={onSelectPreviewClip}
        />
        {programGuides ? (
          <ProgramMonitorCenterGuides
            guides={programGuides}
            canvasScale={canvasScale}
            canvasWidth={stack.canvasWidth}
            canvasHeight={stack.canvasHeight}
          />
        ) : null}
        {displayedSelectedLayer?.asset && canEditSelectedMotion ? (
          <ProgramTransformOverlay
            layer={displayedSelectedLayer}
            canvasScale={canvasScale}
            canvasWidth={stack.canvasWidth}
            canvasHeight={stack.canvasHeight}
            onDraft={(patch) => setMotionDraft({ clipId: displayedSelectedLayer.clip.id, patch })}
            onCommit={(patch) => {
              setMotionDraft(null);
              setProgramGuides(null);
              onMotionDragCommit(displayedSelectedLayer.clip.id, patch);
            }}
            onCancel={() => {
              setMotionDraft(null);
              setProgramGuides(null);
            }}
            onGuidesChange={setProgramGuides}
          />
        ) : null}
        {displayedSelectedLayer?.asset && canEditSelectedCrop && isRenderableVisualMediaAsset(displayedSelectedLayer.asset) ? (
          <ProgramCropOverlay
            layer={displayedSelectedLayer}
            canvasScale={canvasScale}
            canvasWidth={stack.canvasWidth}
            canvasHeight={stack.canvasHeight}
            onDraft={(parameters) => setCropDraft({ clipId: displayedSelectedLayer.clip.id, parameters })}
            onCommit={(parameters) => {
              setCropDraft(null);
              onCropDragCommit(displayedSelectedLayer.clip.id, parameters);
            }}
            onCancel={() => setCropDraft(null)}
          />
        ) : null}
        <ProgramCaptionOverlays stack={stack} />
        <ProgramEffectOverlay stack={stack} />
      </div>
      <ProgramVideoScopesOverlay sample={activeVideoScopeSample} />
      <ProgramAudioMixer stack={stack} isPlaying={isPlaying} playbackRate={playbackRate} active={active} onFftSample={onAudioFftSample} />
      <ProgramAudioAnalyzerOverlay sample={audioAnalysis} />
      <ProgramAudioMeterOverlay meter={audioMeter} />
      <ProgramPreviewPerformanceOverlay
        telemetry={previewFrameTelemetry}
        workerPlan={previewWorkerPlan}
        videoLayerCount={videoLayerIds.length}
        previewCacheCandidateCount={previewCacheCandidateAssetIds.length}
        previewCacheQueueableCount={previewCacheQueueableAssetIds.length}
        activePreviewCacheJobCount={previewCacheProgress.activeCount}
        activePreviewCacheJobProgress={previewCacheProgress.averageProgress}
        activePreviewCacheJobLabel={previewCacheProgress.label}
        onQueuePreviewCache={handleQueuePreviewCache}
      />
      <ProgramStackOverlay stack={stack} />
    </div>
  );
}

function buildProgramCanvasStageStyle(
  size: { width: number; height: number },
  measured: boolean,
): CSSProperties {
  if (!measured) {
    return {
      position: 'absolute',
      inset: 0,
    };
  }

  return {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: size.width,
    height: size.height,
    transform: 'translate(-50%, -50%)',
  };
}

function buildDisplayedProgramMediaLayer(
  layer: ProgramPreviewStack['mediaLayers'][number],
  motionDraft: { clipId: string; patch: ProgramMotionPatch } | null,
  cropDraft: { clipId: string; parameters: CropMaskParameters } | null,
): ProgramPreviewStack['mediaLayers'][number] {
  return {
    ...layer,
    style: {
      ...layer.style,
      ...(motionDraft?.clipId === layer.clip.id ? motionDraft.patch : {}),
    },
    clip: cropDraft?.clipId === layer.clip.id
      ? buildPreviewClipWithCropParameters(layer.clip, cropDraft.parameters)
      : layer.clip,
  };
}

function buildPreviewClipWithCropParameters(clip: TimelineClip, parameters: CropMaskParameters): TimelineClip {
  const existingEffect = findCropMaskEffect(clip);
  const cropEffect: ClipEffect = {
    id: existingEffect?.id ?? `effect-crop-mask-preview-${clip.id}`,
    type: 'mask',
    label: existingEffect?.label ?? CROP_MASK_EFFECT_LABEL,
    enabled: true,
    parameters: { ...normalizeCropMaskParameters(parameters) },
  };

  return {
    ...clip,
    effects: [
      ...clip.effects.filter((effect) => !isCropMaskEffect(effect)),
      cropEffect,
    ],
  };
}

function buildCompositeMediaLayerStyle(layer: ProgramPreviewStack['mediaLayers'][number], index: number, canvasScale = 1): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    zIndex: index + 1,
    opacity: layer.style.opacity,
    transform: `translate(${layer.style.positionX * canvasScale}px, ${layer.style.positionY * canvasScale}px) scale(${layer.style.scale}) rotate(${layer.style.rotation}deg)`,
    transformOrigin: 'center',
    mixBlendMode: previewBlendMode(layer.clip.blendMode),
    pointerEvents: 'none',
  };
}

function previewBlendMode(blendMode: TimelineClip['blendMode']): CSSProperties['mixBlendMode'] {
  switch (blendMode) {
    case 'screen':
      return 'screen';
    case 'multiply':
      return 'multiply';
    case 'overlay':
      return 'overlay';
    case 'add':
      return 'plus-lighter' as CSSProperties['mixBlendMode'];
    default:
      return 'normal';
  }
}
