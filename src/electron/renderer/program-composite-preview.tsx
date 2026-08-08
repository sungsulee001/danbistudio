import type { ChangeEvent, CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { WheelEvent as ReactWheelEvent } from 'react';
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
import { clampProgramMonitorViewportPan, resolveProgramMonitorWheelZoomInteraction } from './program-monitor-interaction-adapter';
import { usePreviewWorkerController } from './preview-worker-controller';
import { formatTimecode } from './editor-time-helpers';

export function ProgramCompositePreview({
  stack,
  audioMeter,
  audioAnalysis,
  isPlaying,
  playbackRate,
  playhead,
  duration,
  fps,
  active,
  selectedClipId,
  canEditSelectedMotion,
  canEditSelectedCrop,
  onMotionDragCommit,
  onCropDragCommit,
  onSelectPreviewClip,
  onTogglePlayback,
  onPlayheadChange,
  activeCacheJobAssetIds,
  cacheJobsByAssetId,
  onQueuePreviewCache,
  onAudioFftSample,
  onVideoScopeReadout,
  audioAnalyzerVisible = false,
}: {
  stack: ProgramPreviewStack;
  audioMeter: AudioMeterSample;
  audioAnalysis: ProgramAudioAnalyzerSample;
  isPlaying: boolean;
  playbackRate: number;
  playhead: number;
  duration: number;
  fps: number;
  active: boolean;
  selectedClipId?: string;
  canEditSelectedMotion: boolean;
  canEditSelectedCrop: boolean;
  onMotionDragCommit: (clipId: string, patch: ProgramMotionPatch) => void;
  onCropDragCommit: (clipId: string, patch: ProgramCropPatch) => void;
  onSelectPreviewClip: (clipId: string) => void;
  onTogglePlayback: () => void;
  onPlayheadChange: (time: number) => void;
  activeCacheJobAssetIds?: Set<string>;
  cacheJobsByAssetId?: Record<string, MediaCacheJobView>;
  onQueuePreviewCache?: (assetIds: string[]) => void;
  onAudioFftSample?: (sample: ProgramAudioFftSample) => void;
  onVideoScopeReadout?: (readout: VideoScopeReadout | null) => void;
  audioAnalyzerVisible?: boolean;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const stageViewportRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [monitorZoomPercent, setMonitorZoomPercent] = useState(100);
  const [monitorPan, setMonitorPan] = useState({ x: 0, y: 0 });
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [motionDraft, setMotionDraft] = useState<{ clipId: string; patch: ProgramMotionPatch } | null>(null);
  const [cropDraft, setCropDraft] = useState<{ clipId: string; parameters: CropMaskParameters } | null>(null);
  const [programGuides, setProgramGuides] = useState<ProgramMonitorGuides | null>(null);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [previewFrameTelemetryByClipId, setPreviewFrameTelemetryByClipId] = useState<Record<string, PreviewFrameTelemetry>>({});
  const [videoScopeSampleByClipId, setVideoScopeSampleByClipId] = useState<Record<string, VideoScopeSample>>({});
  const monitorPanSessionRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    panX: number;
    panY: number;
  } | null>(null);

  useEffect(() => {
    const node = stageViewportRef.current;
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
    ? Math.min(previewSize.width / stack.canvasWidth, previewSize.height / stack.canvasHeight) * (monitorZoomPercent / 100)
    : 1;
  const hasMeasuredPreviewSize = previewSize.width > 0 && previewSize.height > 0;
  const canvasStageSize = useMemo(() => (
    hasMeasuredPreviewSize
      ? {
        width: Math.max(1, stack.canvasWidth * canvasScale),
        height: Math.max(1, stack.canvasHeight * canvasScale),
      }
      : {
        width: stack.canvasWidth,
        height: stack.canvasHeight,
      }
  ), [canvasScale, hasMeasuredPreviewSize, stack.canvasHeight, stack.canvasWidth]);
  const canvasStageStyle = buildProgramCanvasStageStyle(canvasStageSize, hasMeasuredPreviewSize, monitorPan);
  const displayedMediaLayers = useMemo(() => (
    stack.mediaLayers.map((layer) => buildDisplayedProgramMediaLayer(layer, motionDraft, cropDraft))
  ), [cropDraft, motionDraft, stack.mediaLayers]);
  const displayedTextLayers = useMemo(() => (
    stack.textLayers.map((layer) => buildDisplayedProgramTextLayer(layer, motionDraft))
  ), [motionDraft, stack.textLayers]);
  const displayedSelectedLayer = selectedClipId
    ? displayedMediaLayers.find((layer) => layer.clip.id === selectedClipId)
      ?? displayedTextLayers.find((layer) => layer.clip.id === selectedClipId)
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
  const projectAspectLabel = useMemo(() => formatAspectRatioLabel(stack.canvasWidth, stack.canvasHeight), [stack.canvasHeight, stack.canvasWidth]);
  const handleQueuePreviewCache = useCallback(() => {
    if (previewCacheQueueableAssetIds.length === 0) {
      return;
    }

    onQueuePreviewCache?.(previewCacheQueueableAssetIds);
  }, [onQueuePreviewCache, previewCacheQueueableAssetIds]);
  const handleMonitorZoomChange = useCallback((nextPercent: number) => {
    const nextZoomPercent = clampNumber(Math.round(nextPercent / 10) * 10, 50, 200);
    setMonitorZoomPercent(nextZoomPercent);
    if (nextZoomPercent <= 100) {
      setMonitorPan({ x: 0, y: 0 });
      return;
    }

    setMonitorPan((current) => clampProgramMonitorViewportPan({
      pan: current,
      stageWidth: canvasStageSize.width,
      stageHeight: canvasStageSize.height,
      viewportWidth: previewSize.width,
      viewportHeight: previewSize.height,
    }));
  }, [canvasStageSize, previewSize]);
  const handleFitMonitor = useCallback(() => {
    setMonitorZoomPercent(100);
    setMonitorPan({ x: 0, y: 0 });
  }, []);
  const handleMonitorViewportPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 1 || monitorZoomPercent <= 100) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    monitorPanSessionRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      panX: monitorPan.x,
      panY: monitorPan.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [monitorPan, monitorZoomPercent]);
  const handleMonitorViewportPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = monitorPanSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    setMonitorPan(clampProgramMonitorViewportPan({
      pan: {
        x: session.panX + event.clientX - session.clientX,
        y: session.panY + event.clientY - session.clientY,
      },
      stageWidth: canvasStageSize.width,
      stageHeight: canvasStageSize.height,
      viewportWidth: previewSize.width,
      viewportHeight: previewSize.height,
    }));
  }, [canvasStageSize, previewSize]);
  const handleMonitorViewportPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = monitorPanSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    monitorPanSessionRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);
  const handleMonitorViewportWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const plan = resolveProgramMonitorWheelZoomInteraction({
      clientX: event.clientX,
      clientY: event.clientY,
      viewportLeft: rect.left,
      viewportTop: rect.top,
      viewportWidth: rect.width,
      viewportHeight: rect.height,
      stageWidth: canvasStageSize.width,
      stageHeight: canvasStageSize.height,
      pan: monitorPan,
      currentZoomPercent: monitorZoomPercent,
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
    });

    if (!plan.shouldZoom) {
      return;
    }

    setMonitorZoomPercent(plan.nextZoomPercent);
    setMonitorPan(plan.nextPan);
  }, [canvasStageSize, monitorPan, monitorZoomPercent]);
  const handleToggleFullscreen = useCallback(() => {
    const node = previewRef.current;
    if (!node || typeof document === 'undefined') {
      return;
    }

    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      return;
    }

    void node.requestFullscreen?.();
  }, []);
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

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const handleFullscreenChange = () => {
      setFullscreenActive(Boolean(document.fullscreenElement === previewRef.current));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    handleFullscreenChange();
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

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
      data-monitor-zoom={monitorZoomPercent}
      data-monitor-aspect={projectAspectLabel}
      data-monitor-fullscreen={fullscreenActive ? 'true' : 'false'}
      data-monitor-pan-x={Math.round(monitorPan.x)}
      data-monitor-pan-y={Math.round(monitorPan.y)}
      data-playhead-value={Number(playhead.toFixed(3))}
      data-playback-state={isPlaying ? 'playing' : 'paused'}
      data-playback-rate={playbackRate}
      data-audio-layer-count={stack.audioLayers.length}
      data-video-layer-count={videoLayerIds.length}
      data-overlay-mode={diagnosticsVisible ? 'diagnostics' : 'clean'}
      className="relative flex h-full min-h-[240px] w-full flex-col overflow-hidden bg-surface"
      style={{
        position: 'relative',
        height: '100%',
        minHeight: 240,
        overflow: 'hidden',
        // Background comes from `bg-monitor` — the warm near-black the
        // prototype judges picture against, not a hard #000.
      }}
    >
      <div className="relative flex min-h-[180px] flex-1 p-3">
        <div
          ref={stageViewportRef}
          data-testid="program-monitor-canvas-viewport"
          data-zoomed={monitorZoomPercent > 100 ? 'true' : 'false'}
          data-pan-enabled={monitorZoomPercent > 100 ? 'true' : 'false'}
          className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-sm on-dark bg-monitor ${monitorZoomPercent > 100 ? 'cursor-grab' : ''}`}
          onPointerDown={handleMonitorViewportPointerDown}
          onPointerMove={handleMonitorViewportPointerMove}
          onPointerUp={handleMonitorViewportPointerUp}
          onPointerCancel={handleMonitorViewportPointerUp}
          onWheel={handleMonitorViewportWheel}
        >
          <div
            style={canvasStageStyle}
            className="isolate mx-auto my-auto overflow-visible on-dark bg-monitor shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
            data-testid="program-monitor-canvas-stage"
            data-canvas-width={stack.canvasWidth}
            data-canvas-height={stack.canvasHeight}
            data-canvas-scale={Number(canvasScale.toFixed(4))}
            data-zoom-percent={monitorZoomPercent}
            data-pan-x={Math.round(monitorPan.x)}
            data-pan-y={Math.round(monitorPan.y)}
          >
            {stack.mediaLayers.length > 0 ? (
              <div className="absolute inset-0 isolate overflow-hidden on-dark bg-monitor">
                {displayedMediaLayers.map((displayedLayer, index) => {
                  if (!displayedLayer.asset) {
                    return null;
                  }

                  return (
                    <div
                      key={`${displayedLayer.trackId}-${displayedLayer.clip.id}`}
                      style={buildCompositeMediaLayerStyle(displayedLayer, index, canvasScale)}
                    >
                      <ProgramMediaLayerPreview
                        asset={displayedLayer.asset}
                        clip={displayedLayer.clip}
                        isPlaying={isPlaying}
                        playbackRate={playbackRate}
                        playhead={playhead}
                        localTime={displayedLayer.localTime}
                        mediaTime={displayedLayer.mediaTime}
                        active={active}
                        workerFrame={displayedLayer.asset?.id === previewWorkerState.decodedFrame?.mediaId ? previewWorkerState.decodedFrame : undefined}
                        onFrameSample={handlePreviewFrameSample}
                        onScopeSample={handleVideoScopeSample}
                      />
                      <ProgramPrivacyRegionOverlays clip={displayedLayer.clip} localTime={displayedLayer.localTime} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center on-dark bg-monitor text-sm text-ds-600">
                No active media layer
              </div>
            )}
            <ProgramTextOverlays stack={stack} canvasScale={canvasScale} motionDraft={motionDraft} />
            <ProgramLayerSelectionTargets
              layers={[...displayedMediaLayers, ...displayedTextLayers]}
              selectedClipId={selectedClipId}
              canvasScale={canvasScale}
              canvasWidth={stack.canvasWidth}
              canvasHeight={stack.canvasHeight}
              onSelect={onSelectPreviewClip}
              onMotionDraft={(clipId, patch) => setMotionDraft({ clipId, patch })}
              onMotionCommit={(clipId, patch) => {
                setMotionDraft(null);
                setProgramGuides(null);
                onMotionDragCommit(clipId, patch);
              }}
              onMotionCancel={() => {
                setMotionDraft(null);
                setProgramGuides(null);
              }}
              onGuidesChange={setProgramGuides}
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
          <ProgramAudioMixer
            stack={stack}
            isPlaying={isPlaying}
            playbackRate={playbackRate}
            active={active}
            onFftSample={diagnosticsVisible || audioAnalyzerVisible ? onAudioFftSample : undefined}
          />
          {diagnosticsVisible ? (
            <>
              <ProgramVideoScopesOverlay sample={activeVideoScopeSample} />
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
            </>
          ) : null}
        </div>
      </div>
      <ProgramMonitorControlBar
        playhead={playhead}
        duration={duration}
        fps={fps}
        isPlaying={isPlaying}
        playbackRate={playbackRate}
        monitorZoomPercent={monitorZoomPercent}
        aspectLabel={projectAspectLabel}
        fullscreenActive={fullscreenActive}
        audioLayerCount={stack.audioLayers.length}
        videoLayerCount={videoLayerIds.length}
        previewCacheQueueableCount={previewCacheQueueableAssetIds.length}
        activePreviewCacheJobCount={previewCacheProgress.activeCount}
        activePreviewCacheJobProgress={previewCacheProgress.averageProgress}
        diagnosticsVisible={diagnosticsVisible}
        onTogglePlayback={onTogglePlayback}
        onPlayheadChange={onPlayheadChange}
        onMonitorZoomChange={handleMonitorZoomChange}
        onFitMonitor={handleFitMonitor}
        onQueuePreviewCache={previewCacheQueueableAssetIds.length > 0 ? handleQueuePreviewCache : undefined}
        onToggleDiagnostics={() => setDiagnosticsVisible((current) => !current)}
        onToggleFullscreen={handleToggleFullscreen}
      />
    </div>
  );
}

function ProgramMonitorControlBar({
  playhead,
  duration,
  fps,
  isPlaying,
  playbackRate,
  monitorZoomPercent,
  aspectLabel,
  fullscreenActive,
  audioLayerCount,
  videoLayerCount,
  previewCacheQueueableCount,
  activePreviewCacheJobCount,
  activePreviewCacheJobProgress,
  diagnosticsVisible,
  onTogglePlayback,
  onPlayheadChange,
  onMonitorZoomChange,
  onFitMonitor,
  onQueuePreviewCache,
  onToggleDiagnostics,
  onToggleFullscreen,
}: {
  playhead: number;
  duration: number;
  fps: number;
  isPlaying: boolean;
  playbackRate: number;
  monitorZoomPercent: number;
  aspectLabel: string;
  fullscreenActive: boolean;
  audioLayerCount: number;
  videoLayerCount: number;
  previewCacheQueueableCount: number;
  activePreviewCacheJobCount: number;
  activePreviewCacheJobProgress: number;
  diagnosticsVisible: boolean;
  onTogglePlayback: () => void;
  onPlayheadChange: (time: number) => void;
  onMonitorZoomChange: (percent: number) => void;
  onFitMonitor: () => void;
  onQueuePreviewCache?: () => void;
  onToggleDiagnostics: () => void;
  onToggleFullscreen: () => void;
}) {
  const safeDuration = Math.max(0, duration);
  const playbackLabel = isPlaying ? `Pause ${formatPlaybackRate(playbackRate)}` : 'Play';
  const cacheLabel = activePreviewCacheJobCount > 0
    ? `Proxy ${activePreviewCacheJobProgress}%`
    : previewCacheQueueableCount > 0
      ? `Proxy ${previewCacheQueueableCount}`
      : 'Proxy ready';
  const handlePlayheadInput = (event: ChangeEvent<HTMLInputElement>) => {
    onPlayheadChange(Number(event.currentTarget.value));
  };
  const handleZoomInput = (event: ChangeEvent<HTMLInputElement>) => {
    onMonitorZoomChange(Number(event.currentTarget.value));
  };

  return (
    <div
      className="shrink-0 bg-surface px-3 py-2"
      data-testid="program-monitor-controls"
      data-monitor-zoom={monitorZoomPercent}
      data-monitor-aspect={aspectLabel}
      data-monitor-fullscreen={fullscreenActive ? 'true' : 'false'}
      data-playhead-value={Number(playhead.toFixed(3))}
      data-playback-state={isPlaying ? 'playing' : 'paused'}
      data-playback-rate={playbackRate}
      data-audio-layer-count={audioLayerCount}
      data-video-layer-count={videoLayerCount}
      data-overlay-mode={diagnosticsVisible ? 'diagnostics' : 'clean'}
      data-controls-density="compact"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="grid grid-cols-1 items-center gap-2 ed:grid-cols-[auto_minmax(180px,1fr)_auto]">
        <span className="justify-self-center text-xs tabular-nums text-ds-700 ed:justify-self-start">
          <span className="text-info-700">{formatTimecode(playhead, fps)}</span>
          <span className="mx-1 text-ds-400">/</span>
          <span>{formatTimecode(safeDuration, fps)}</span>
        </span>
        <div className="flex min-w-0 items-center justify-center gap-3">
          <button
            type="button"
            className="rounded-full border border-ds-300 bg-surface px-3 py-1 text-xs font-semibold text-ink hover:border-accent-600"
            aria-label={playbackLabel}
            onClick={onTogglePlayback}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <input
            type="range"
            min={0}
            max={safeDuration}
            step={1 / fps}
            value={Math.min(playhead, safeDuration)}
            aria-label="Program monitor playhead"
            data-testid="program-monitor-playhead-slider"
            data-playhead-value={Number(playhead.toFixed(3))}
            onInput={handlePlayheadInput}
            onChange={handlePlayheadInput}
            className="min-w-0 flex-1"
          />
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-center gap-2 ed:justify-end">
          <button
            type="button"
            className="rounded border border-ds-300 px-2 py-1 text-xs text-ds-800 hover:border-info-600 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!onQueuePreviewCache}
            onClick={() => onQueuePreviewCache?.()}
          >
            {cacheLabel}
          </button>
          <button
            type="button"
            className={`rounded border px-2 py-1 text-xs hover:border-accent-600 ${
              diagnosticsVisible
                ? 'border-accent-500 bg-accent-500/10 text-accent-900'
                : 'border-ds-300 text-ds-800'
            }`}
            aria-pressed={diagnosticsVisible}
            onClick={onToggleDiagnostics}
          >
            {diagnosticsVisible ? 'Hide info' : 'Info'}
          </button>
          <label className="flex items-center gap-2 text-xs text-ds-700">
            Zoom
            <input
              type="range"
              min={50}
              max={200}
              step={10}
              value={monitorZoomPercent}
              aria-label="Program monitor zoom"
              data-testid="program-monitor-zoom-slider"
              onInput={handleZoomInput}
              onChange={handleZoomInput}
              className="w-24"
            />
          </label>
          <button
            type="button"
            data-testid="program-monitor-fit-button"
            className="rounded border border-ds-300 px-2 py-1 text-xs text-ds-800 hover:border-accent-600"
            onClick={onFitMonitor}
          >
            Fit
          </button>
          <span
            data-testid="program-monitor-zoom-readout"
            data-zoom-percent={monitorZoomPercent}
            className="w-12 rounded border border-ds-200 bg-surface px-2 py-1 text-center text-xs text-ds-700"
          >
            {monitorZoomPercent}%
          </span>
          <span
            data-testid="program-monitor-aspect-label"
            data-aspect-label={aspectLabel}
            className="rounded border border-ds-300 px-2 py-1 text-xs text-ds-700"
            title="Project canvas aspect ratio"
          >
            {aspectLabel}
          </span>
          <button
            type="button"
            className="rounded border border-ds-300 px-2 py-1 text-xs text-ds-800 hover:border-accent-600"
            onClick={onToggleFullscreen}
          >
            {fullscreenActive ? 'Exit full' : 'Full'}
          </button>
        </div>
      </div>
    </div>
  );
}

function buildProgramCanvasStageStyle(
  size: { width: number; height: number },
  measured: boolean,
  pan: { x: number; y: number },
): CSSProperties {
  if (!measured) {
    return {
      position: 'relative',
      width: '100%',
      height: '100%',
      transform: `translate(${pan.x}px, ${pan.y}px)`,
    };
  }

  return {
    position: 'relative',
    flex: '0 0 auto',
    width: size.width,
    height: size.height,
    transform: `translate(${pan.x}px, ${pan.y}px)`,
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

function buildDisplayedProgramTextLayer(
  layer: ProgramPreviewStack['textLayers'][number],
  motionDraft: { clipId: string; patch: ProgramMotionPatch } | null,
): ProgramPreviewStack['textLayers'][number] {
  return {
    ...layer,
    style: {
      ...layer.style,
      ...(motionDraft?.clipId === layer.clip.id ? motionDraft.patch : {}),
    },
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

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function formatPlaybackRate(rate: number): string {
  if (!Number.isFinite(rate) || rate === 0) {
    return '';
  }

  return `${rate < 0 ? '-' : ''}x${Math.abs(rate).toFixed(Math.abs(rate) % 1 === 0 ? 0 : 2)}`;
}

function formatAspectRatioLabel(width: number, height: number): string {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const divisor = gcd(safeWidth, safeHeight);
  const aspectWidth = safeWidth / divisor;
  const aspectHeight = safeHeight / divisor;

  if (aspectWidth <= 32 && aspectHeight <= 32) {
    return `${aspectWidth}:${aspectHeight}`;
  }

  return `${safeWidth}x${safeHeight}`;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y > 0) {
    const next = x % y;
    x = y;
    y = next;
  }

  return x || 1;
}
