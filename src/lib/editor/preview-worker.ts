import type { PreviewFrameCacheStats } from './preview-frame-cache';

export type PreviewWorkerMode = 'webcodecs-worker' | 'offscreen-worker' | 'element-telemetry' | 'unsupported';
export type PreviewWorkerStatus = 'ready' | 'degraded' | 'unsupported';

export interface PreviewWorkerCapabilitySnapshot {
  workerSupported: boolean;
  webCodecsSupported: boolean;
  videoDecoderSupported: boolean;
  videoFrameSupported: boolean;
  encodedVideoChunkSupported: boolean;
  offscreenCanvasSupported: boolean;
  imageBitmapSupported: boolean;
  requestVideoFrameCallbackSupported: boolean;
}

export interface PreviewWorkerBenchmark {
  averageFrameMs?: number;
  width?: number;
  height?: number;
  samples?: number;
}

export type PreviewWorkerSourceMode = 'proxy' | 'source' | 'none';
export type PreviewWorkerFrameKind = 'image' | 'video';
export type PreviewWorkerFrameDecodeSourceKind = 'image' | 'video';
export type PreviewWorkerFrameStatus = 'decoded' | 'unsupported' | 'failed';
export type PreviewWorkerVideoContainer = 'mp4' | 'webm' | 'unknown';
export type PreviewWorkerVideoDecodeReadinessStatus = 'ready' | 'fallback' | 'unsupported';

export interface PreviewWorkerSourceLayer {
  assetId?: string;
  kind?: 'video' | 'image' | 'ai';
  mode: PreviewWorkerSourceMode;
  width?: number;
  height?: number;
  source?: string;
  frameSource?: string;
  time?: number;
}

export interface PreviewWorkerFrameRequest {
  requestId: string;
  mediaId: string;
  kind: PreviewWorkerFrameKind;
  decodeSourceKind: PreviewWorkerFrameDecodeSourceKind;
  source: string;
  fallbackSource?: string;
  time: number;
  targetWidth: number;
  targetHeight: number;
}

export interface PreviewWorkerFrameResult {
  requestId: string;
  mediaId: string;
  kind: PreviewWorkerFrameKind;
  status: PreviewWorkerFrameStatus;
  timestamp: number;
  duration: number;
  width: number;
  height: number;
  decodeMs?: number;
  reason?: string;
}

export interface PreviewWorkerFrameDeliveryStats {
  requestedFrames: number;
  decodedFrames: number;
  failedFrames: number;
  unsupportedFrames: number;
  averageDecodeMs?: number;
  lastStatus: PreviewWorkerFrameStatus | 'none';
  label: string;
}

export interface PreviewWorkerVideoDecodeReadiness {
  status: PreviewWorkerVideoDecodeReadinessStatus;
  container: PreviewWorkerVideoContainer;
  canAttempt: boolean;
  reason: string;
}

export interface PreviewWorkerDecodedFrameCandidate {
  mediaId: string;
  source?: string;
  timestamp: number;
  duration?: number;
}

export interface PreviewWorkerSourceStats {
  videoLayerCount: number;
  proxyLayerCount: number;
  sourceLayerCount: number;
  missingLayerCount: number;
  browserOnlyLayerCount: number;
  estimatedSourcePixels: number;
  maxSourcePixels: number;
  label: string;
}

export interface PreviewWorkerPlanOptions {
  videoLayerCount?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  fps?: number;
  benchmark?: PreviewWorkerBenchmark;
  previewFrameCache?: PreviewFrameCacheStats;
  sourceStats?: PreviewWorkerSourceStats;
  frameDelivery?: PreviewWorkerFrameDeliveryStats;
}

export interface PreviewWorkerPlan {
  mode: PreviewWorkerMode;
  status: PreviewWorkerStatus;
  label: string;
  workerEnabled: boolean;
  webCodecsEnabled: boolean;
  offscreenCanvasEnabled: boolean;
  frameBudgetMs: number;
  estimatedFrameCostMs: number;
  recommendedMaxVideoLayers: number;
  sourceSummaryLabel: string;
  frameDeliveryLabel: string;
  warnings: string[];
  reasons: string[];
}

const DEFAULT_CAPABILITIES: PreviewWorkerCapabilitySnapshot = {
  workerSupported: false,
  webCodecsSupported: false,
  videoDecoderSupported: false,
  videoFrameSupported: false,
  encodedVideoChunkSupported: false,
  offscreenCanvasSupported: false,
  imageBitmapSupported: false,
  requestVideoFrameCallbackSupported: false,
};

export function buildPreviewWorkerPlan(
  capabilities: Partial<PreviewWorkerCapabilitySnapshot> = {},
  options: PreviewWorkerPlanOptions = {},
): PreviewWorkerPlan {
  const snapshot = { ...DEFAULT_CAPABILITIES, ...capabilities };
  const sourceStats = normalizePreviewWorkerSourceStats(options.sourceStats, options.videoLayerCount);
  const videoLayerCount = sourceStats.videoLayerCount;
  const fps = clampNumber(options.fps ?? 30, 1, 240);
  const frameBudgetMs = roundNumber(1000 / fps);
  const canvasPixels = Math.max(1, Math.round(options.canvasWidth ?? 0) * Math.round(options.canvasHeight ?? 0));
  const benchmarkFrameMs = readBenchmarkFrameMs(options.benchmark);
  const fallbackLayerCostMs = estimateFallbackLayerCost(canvasPixels, snapshot);
  const singleLayerCostMs = roundNumber((benchmarkFrameMs ?? fallbackLayerCostMs) * estimateSourceCostFactor(sourceStats, canvasPixels));
  const estimatedFrameCostMs = roundNumber(singleLayerCostMs * Math.max(1, videoLayerCount));
  const recommendedMaxVideoLayers = Math.max(1, Math.floor(frameBudgetMs / Math.max(0.1, singleLayerCostMs)));
  const mode = resolvePreviewWorkerMode(snapshot);
  const status = resolvePreviewWorkerStatus(mode);
  const frameDelivery = options.frameDelivery ?? summarizePreviewWorkerFrameResults([]);
  const reasons = buildPreviewWorkerReasons(snapshot, mode, options.previewFrameCache, sourceStats, frameDelivery);
  const warnings = buildPreviewWorkerWarnings({
    mode,
    status,
    videoLayerCount,
    recommendedMaxVideoLayers,
    estimatedFrameCostMs,
    frameBudgetMs,
    previewFrameCache: options.previewFrameCache,
    sourceStats,
    frameDelivery,
  });

  return {
    mode,
    status,
    label: formatPreviewWorkerLabel(mode, status, estimatedFrameCostMs, frameBudgetMs),
    workerEnabled: mode === 'webcodecs-worker' || mode === 'offscreen-worker',
    webCodecsEnabled: mode === 'webcodecs-worker',
    offscreenCanvasEnabled: snapshot.offscreenCanvasSupported,
    frameBudgetMs,
    estimatedFrameCostMs,
    recommendedMaxVideoLayers,
    sourceSummaryLabel: sourceStats.label,
    frameDeliveryLabel: frameDelivery.label,
    warnings,
    reasons,
  };
}

export function buildPreviewWorkerSourceStats(layers: PreviewWorkerSourceLayer[]): PreviewWorkerSourceStats {
  const normalizedLayers = layers.map((layer) => ({
    ...layer,
    mode: layer.mode ?? 'none',
    width: normalizeDimension(layer.width),
    height: normalizeDimension(layer.height),
    source: layer.source ?? '',
  }));
  const videoLayerCount = normalizedLayers.length;
  const proxyLayerCount = normalizedLayers.filter((layer) => layer.mode === 'proxy').length;
  const sourceLayerCount = normalizedLayers.filter((layer) => layer.mode === 'source').length;
  const missingLayerCount = normalizedLayers.filter((layer) => layer.mode === 'none' || !layer.source).length;
  const browserOnlyLayerCount = normalizedLayers.filter((layer) => isBrowserOnlyPreviewSource(layer.source)).length;
  const sourcePixels = normalizedLayers.map((layer) => layer.width * layer.height).filter((pixels) => pixels > 0);
  const estimatedSourcePixels = sourcePixels.reduce((total, pixels) => total + pixels, 0);
  const maxSourcePixels = sourcePixels.length > 0 ? Math.max(...sourcePixels) : 0;

  return {
    videoLayerCount,
    proxyLayerCount,
    sourceLayerCount,
    missingLayerCount,
    browserOnlyLayerCount,
    estimatedSourcePixels,
    maxSourcePixels,
    label: formatPreviewWorkerSourceStatsLabel({
      videoLayerCount,
      proxyLayerCount,
      sourceLayerCount,
      missingLayerCount,
      browserOnlyLayerCount,
      maxSourcePixels,
    }),
  };
}

export function resolvePreviewWorkerCacheAssetIds(layers: PreviewWorkerSourceLayer[]): string[] {
  const queuedAssetIds = new Set<string>();
  const assetIds: string[] = [];

  for (const layer of layers) {
    const assetId = layer.assetId?.trim();
    if (!assetId || queuedAssetIds.has(assetId) || layer.mode === 'proxy' || layer.kind === 'image') {
      continue;
    }

    queuedAssetIds.add(assetId);
    assetIds.push(assetId);
  }

  return assetIds;
}

export function buildPreviewWorkerFrameRequest(
  layers: PreviewWorkerSourceLayer[],
  options: {
    requestId?: string;
    targetWidth?: number;
    targetHeight?: number;
    time?: number;
    preferVideoDecode?: boolean;
  } = {},
): PreviewWorkerFrameRequest | null {
  const candidates = layers.filter((candidate) => isPreviewWorkerFrameRequestCandidate(candidate));
  const layer = candidates[candidates.length - 1];
  if (!layer) {
    return null;
  }

  const layerSource = layer.source || '';
  const fallbackSource = layer.frameSource || '';
  const requestTime = options.time ?? layer.time ?? 0;
  const targetWidth = normalizeDimension(options.targetWidth ?? layer.width ?? 320);
  const targetHeight = normalizeDimension(options.targetHeight ?? layer.height ?? 180);
  const kind: PreviewWorkerFrameKind = layer.kind === 'video' || layer.kind === 'ai' ? 'video' : 'image';
  const shouldPreferVideoDecode = kind === 'video'
    && options.preferVideoDecode === true
    && Boolean(layerSource)
    && !isBrowserOnlyPreviewSource(layerSource);
  const source = shouldPreferVideoDecode
    ? layerSource
    : fallbackSource || layerSource;
  const decodeSourceKind: PreviewWorkerFrameDecodeSourceKind = kind === 'video' && (shouldPreferVideoDecode || !fallbackSource)
    ? 'video'
    : 'image';

  return {
    requestId: options.requestId ?? `preview-frame-${layer.assetId ?? 'source'}`,
    mediaId: layer.assetId ?? source,
    kind,
    decodeSourceKind,
    source,
    ...(fallbackSource && fallbackSource !== source ? { fallbackSource } : {}),
    time: Math.max(0, Number.isFinite(requestTime) ? requestTime : 0),
    targetWidth: clampNumber(targetWidth, 16, 4096),
    targetHeight: clampNumber(targetHeight, 16, 4096),
  };
}

export function resolvePreviewWorkerVideoDecodeReadiness(
  request: PreviewWorkerFrameRequest,
  capabilities: Partial<PreviewWorkerCapabilitySnapshot> = {},
): PreviewWorkerVideoDecodeReadiness {
  const snapshot = { ...DEFAULT_CAPABILITIES, ...capabilities };
  const container = readPreviewWorkerVideoContainer(request.source);

  if (request.decodeSourceKind !== 'video') {
    return {
      status: 'fallback',
      container,
      canAttempt: false,
      reason: 'Frame request uses image/thumbnail delivery.',
    };
  }

  if (!snapshot.workerSupported) {
    return fallbackOrUnsupportedReadiness(request, container, 'Worker is unavailable.');
  }

  if (!snapshot.videoDecoderSupported || !snapshot.videoFrameSupported || !snapshot.encodedVideoChunkSupported) {
    return fallbackOrUnsupportedReadiness(request, container, 'WebCodecs VideoDecoder, VideoFrame, or EncodedVideoChunk support is incomplete.');
  }

  if (container === 'mp4') {
    return {
      status: 'ready',
      container,
      canAttempt: true,
      reason: 'Progressive, fragmented, or QuickTime-compatible MP4/MOV/M4V/QT H.264/H.265/AV1/VP8/VP9 WebCodecs worker decode with CTTS/edit-list timing, compact sample-size tables, and orientation metadata can be attempted.',
    };
  }

  if (container === 'webm') {
    return {
      status: 'ready',
      container,
      canAttempt: true,
      reason: 'WebM/Matroska VP8/VP9/AV1/H.264/H.265 WebCodecs worker decode can be attempted, including unknown-size EBML Segment/Cluster parsing and Matroska CodecPrivate profile metadata for VP9, AV1, H.264, and H.265.',
    };
  }

  return fallbackOrUnsupportedReadiness(request, container, 'Unknown worker video container; MP4/MOV/M4V/QT/WebM/MKV demux support is required.');
}

export function readPreviewWorkerVideoContainer(source: string): PreviewWorkerVideoContainer {
  const normalized = source.split(/[?#]/, 1)[0]?.toLowerCase() ?? '';
  if (/\.(mp4|m4v|mov|qt)$/.test(normalized)) {
    return 'mp4';
  }

  if (/\.(webm|mkv)$/.test(normalized)) {
    return 'webm';
  }

  return 'unknown';
}

export function shouldUsePreviewWorkerDecodedFrame(
  frame: PreviewWorkerDecodedFrameCandidate | undefined,
  options: {
    mediaId?: string;
    mediaTime: number;
    isPlaying?: boolean;
    freezeFrameActive?: boolean;
    toleranceSeconds?: number;
  },
): boolean {
  if (!frame?.source || !frame.mediaId || !options.mediaId || frame.mediaId !== options.mediaId) {
    return false;
  }

  if (options.isPlaying && !options.freezeFrameActive) {
    return false;
  }

  const mediaTime = Math.max(0, Number.isFinite(options.mediaTime) ? options.mediaTime : 0);
  const frameTimestamp = Math.max(0, Number.isFinite(frame.timestamp) ? frame.timestamp : 0);
  const durationTolerance = Math.max(0.1, Number.isFinite(frame.duration) ? (frame.duration ?? 0) * 2 : 0);
  const tolerance = clampNumber(options.toleranceSeconds ?? Math.max(0.5, durationTolerance), 0.1, 5);

  return Math.abs(frameTimestamp - mediaTime) <= tolerance;
}

export function summarizePreviewWorkerFrameResults(results: PreviewWorkerFrameResult[]): PreviewWorkerFrameDeliveryStats {
  const requestedFrames = results.length;
  const decodedFrames = results.filter((result) => result.status === 'decoded').length;
  const failedFrames = results.filter((result) => result.status === 'failed').length;
  const unsupportedFrames = results.filter((result) => result.status === 'unsupported').length;
  const decodeTimes = results
    .map((result) => result.decodeMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
  const averageDecodeMs = decodeTimes.length > 0
    ? roundNumber(decodeTimes.reduce((total, value) => total + value, 0) / decodeTimes.length)
    : undefined;
  const lastStatus = results.at(-1)?.status ?? 'none';

  return {
    requestedFrames,
    decodedFrames,
    failedFrames,
    unsupportedFrames,
    averageDecodeMs,
    lastStatus,
    label: formatPreviewWorkerFrameDeliveryLabel({
      requestedFrames,
      decodedFrames,
      failedFrames,
      unsupportedFrames,
      averageDecodeMs,
      lastStatus,
    }),
  };
}

function resolvePreviewWorkerMode(snapshot: PreviewWorkerCapabilitySnapshot): PreviewWorkerMode {
  if (
    snapshot.workerSupported
    && snapshot.webCodecsSupported
    && snapshot.videoDecoderSupported
    && snapshot.videoFrameSupported
    && snapshot.encodedVideoChunkSupported
  ) {
    return 'webcodecs-worker';
  }

  if (snapshot.workerSupported && snapshot.offscreenCanvasSupported && snapshot.imageBitmapSupported) {
    return 'offscreen-worker';
  }

  if (snapshot.requestVideoFrameCallbackSupported) {
    return 'element-telemetry';
  }

  return 'unsupported';
}

function resolvePreviewWorkerStatus(mode: PreviewWorkerMode): PreviewWorkerStatus {
  if (mode === 'webcodecs-worker') {
    return 'ready';
  }

  if (mode === 'unsupported') {
    return 'unsupported';
  }

  return 'degraded';
}

function buildPreviewWorkerReasons(
  snapshot: PreviewWorkerCapabilitySnapshot,
  mode: PreviewWorkerMode,
  previewFrameCache?: PreviewFrameCacheStats,
  sourceStats?: PreviewWorkerSourceStats,
  frameDelivery?: PreviewWorkerFrameDeliveryStats,
): string[] {
  const reasons: string[] = [];

  if (mode === 'webcodecs-worker') {
    reasons.push('Worker WebCodecs decode path is available.');
  } else if (mode === 'offscreen-worker') {
    reasons.push('Worker canvas path is available, but VideoDecoder/VideoFrame is missing.');
  } else if (mode === 'element-telemetry') {
    reasons.push('Falling back to HTMLVideoElement preview telemetry.');
  } else {
    reasons.push('Browser preview worker capabilities are unavailable.');
  }

  if (!snapshot.workerSupported) {
    reasons.push('Worker is not available.');
  }

  if (!snapshot.videoDecoderSupported || !snapshot.videoFrameSupported || !snapshot.encodedVideoChunkSupported) {
    reasons.push('WebCodecs VideoDecoder/VideoFrame/EncodedVideoChunk support is incomplete.');
  }

  if (!snapshot.offscreenCanvasSupported) {
    reasons.push('OffscreenCanvas is not available.');
  }

  if (previewFrameCache && previewFrameCache.totalSinks > 0) {
    reasons.push(
      `Preview frame cache has ${previewFrameCache.cachedFrames} cached frames across ${previewFrameCache.activeSinks}/${previewFrameCache.totalSinks} active sources.`,
    );
  }

  if (sourceStats && sourceStats.videoLayerCount > 0) {
    reasons.push(`Active preview sources: ${sourceStats.label}.`);
  }

  if (frameDelivery && frameDelivery.requestedFrames > 0) {
    reasons.push(`Worker frame delivery: ${frameDelivery.label}.`);
  }

  return reasons;
}

function buildPreviewWorkerWarnings({
  mode,
  status,
  videoLayerCount,
  recommendedMaxVideoLayers,
  estimatedFrameCostMs,
  frameBudgetMs,
  previewFrameCache,
  sourceStats,
  frameDelivery,
}: {
  mode: PreviewWorkerMode;
  status: PreviewWorkerStatus;
  videoLayerCount: number;
  recommendedMaxVideoLayers: number;
  estimatedFrameCostMs: number;
  frameBudgetMs: number;
  previewFrameCache?: PreviewFrameCacheStats;
  sourceStats: PreviewWorkerSourceStats;
  frameDelivery: PreviewWorkerFrameDeliveryStats;
}): string[] {
  const warnings: string[] = [];

  if (status === 'unsupported') {
    warnings.push('Preview worker is unavailable; Program Monitor uses element playback only.');
  } else if (mode !== 'webcodecs-worker') {
    warnings.push('WebCodecs worker decode is unavailable; proxy media remains important for smooth preview.');
  }

  if (videoLayerCount > recommendedMaxVideoLayers) {
    warnings.push(`${videoLayerCount} video layers exceed the estimated worker frame budget of ${recommendedMaxVideoLayers}.`);
  }

  if (estimatedFrameCostMs > frameBudgetMs) {
    warnings.push(`Estimated preview frame cost ${estimatedFrameCostMs.toFixed(1)}ms exceeds ${frameBudgetMs.toFixed(1)}ms frame budget.`);
  }

  if (previewFrameCache && previewFrameCache.pendingRequests > 0) {
    warnings.push(`${previewFrameCache.pendingRequests} preview frame cache requests are pending.`);
  }

  if (frameDelivery.failedFrames > 0) {
    warnings.push(`${frameDelivery.failedFrames} preview worker frame ${frameDelivery.failedFrames === 1 ? 'request failed' : 'requests failed'}.`);
  }

  if (frameDelivery.unsupportedFrames > 0) {
    warnings.push(`${frameDelivery.unsupportedFrames} preview worker frame ${frameDelivery.unsupportedFrames === 1 ? 'request is' : 'requests are'} unsupported.`);
  }

  if (sourceStats.missingLayerCount > 0) {
    warnings.push(`${formatLayerCount(sourceStats.missingLayerCount)} ${sourceStats.missingLayerCount === 1 ? 'has' : 'have'} no preview source.`);
  }

  if (sourceStats.sourceLayerCount > 0) {
    warnings.push(`${formatLayerCount(sourceStats.sourceLayerCount)} ${sourceStats.sourceLayerCount === 1 ? 'is' : 'are'} using original media without proxy.`);
  }

  if (sourceStats.browserOnlyLayerCount > 0) {
    warnings.push(`${formatLayerCount(sourceStats.browserOnlyLayerCount)} ${sourceStats.browserOnlyLayerCount === 1 ? 'uses' : 'use'} browser-only preview URLs; import/cache them for reliable local preview.`);
  }

  if (sourceStats.maxSourcePixels >= 3840 * 2160 && sourceStats.proxyLayerCount < sourceStats.videoLayerCount) {
    warnings.push('4K or larger source preview is active without proxy on every video layer.');
  }

  return warnings;
}

function formatPreviewWorkerLabel(
  mode: PreviewWorkerMode,
  status: PreviewWorkerStatus,
  estimatedFrameCostMs: number,
  frameBudgetMs: number,
): string {
  const modeLabel = mode === 'webcodecs-worker'
    ? 'WebCodecs worker'
    : mode === 'offscreen-worker'
      ? 'Offscreen worker'
      : mode === 'element-telemetry'
        ? 'Element telemetry'
        : 'Worker unavailable';

  return `${modeLabel} / ${status} / ${estimatedFrameCostMs.toFixed(1)}ms of ${frameBudgetMs.toFixed(1)}ms`;
}

function estimateFallbackLayerCost(canvasPixels: number, snapshot: PreviewWorkerCapabilitySnapshot): number {
  const megapixels = canvasPixels / 1_000_000;
  if (snapshot.webCodecsSupported && snapshot.videoDecoderSupported && snapshot.videoFrameSupported && snapshot.encodedVideoChunkSupported) {
    return roundNumber(1.2 + megapixels * 0.9);
  }

  if (snapshot.offscreenCanvasSupported) {
    return roundNumber(2 + megapixels * 1.4);
  }

  return roundNumber(3.5 + megapixels * 2.2);
}

function normalizePreviewWorkerSourceStats(
  sourceStats: PreviewWorkerSourceStats | undefined,
  fallbackVideoLayerCount: number | undefined,
): PreviewWorkerSourceStats {
  if (sourceStats) {
    return sourceStats;
  }

  return buildPreviewWorkerSourceStats(Array.from({ length: Math.max(0, Math.round(fallbackVideoLayerCount ?? 0)) }).map(() => ({
    mode: 'source',
  })));
}

function formatLayerCount(count: number): string {
  return `${count} active video layer${count === 1 ? '' : 's'}`;
}

function estimateSourceCostFactor(sourceStats: PreviewWorkerSourceStats, canvasPixels: number): number {
  if (sourceStats.videoLayerCount === 0) {
    return 1;
  }

  const layerFactor = (
    sourceStats.proxyLayerCount * 0.75 +
    sourceStats.sourceLayerCount * 1.2 +
    sourceStats.missingLayerCount * 0.25
  ) / sourceStats.videoLayerCount;
  const resolutionFactor = sourceStats.maxSourcePixels > canvasPixels * 1.5 ? 1.3 : 1;
  const browserOnlyFactor = sourceStats.browserOnlyLayerCount > 0 ? 1.08 : 1;

  return roundNumber(clampNumber(layerFactor * resolutionFactor * browserOnlyFactor, 0.5, 2.5));
}

function formatPreviewWorkerSourceStatsLabel({
  videoLayerCount,
  proxyLayerCount,
  sourceLayerCount,
  missingLayerCount,
  browserOnlyLayerCount,
  maxSourcePixels,
}: Pick<PreviewWorkerSourceStats, 'videoLayerCount' | 'proxyLayerCount' | 'sourceLayerCount' | 'missingLayerCount' | 'browserOnlyLayerCount' | 'maxSourcePixels'>): string {
  if (videoLayerCount === 0) {
    return 'no video sources';
  }

  const sourceParts = [
    `${proxyLayerCount} proxy`,
    `${sourceLayerCount} source`,
    `${missingLayerCount} missing`,
  ];
  const browserOnly = browserOnlyLayerCount > 0 ? ` / ${browserOnlyLayerCount} browser-only` : '';
  const maxResolution = maxSourcePixels > 0 ? ` / max ${formatMegapixels(maxSourcePixels)}MP` : '';

  return `${videoLayerCount} video / ${sourceParts.join(' / ')}${browserOnly}${maxResolution}`;
}

function formatMegapixels(pixels: number): string {
  return (Math.round((pixels / 1_000_000) * 10) / 10).toFixed(1);
}

function normalizeDimension(value: number | undefined): number {
  return Math.max(0, Math.round(Number.isFinite(value) ? value! : 0));
}

function isBrowserOnlyPreviewSource(source: string): boolean {
  return source.startsWith('blob:') || source.startsWith('local://');
}

function isPreviewWorkerFrameRequestCandidate(layer: PreviewWorkerSourceLayer): boolean {
  const source = layer.frameSource || layer.source || '';
  if (!source || layer.mode === 'none' || isBrowserOnlyPreviewSource(source)) {
    return false;
  }

  if (layer.kind === 'video' || layer.kind === 'ai') {
    return true;
  }

  return layer.kind === 'image';
}

function fallbackOrUnsupportedReadiness(
  request: PreviewWorkerFrameRequest,
  container: PreviewWorkerVideoContainer,
  reason: string,
): PreviewWorkerVideoDecodeReadiness {
  if (request.fallbackSource) {
    return {
      status: 'fallback',
      container,
      canAttempt: false,
      reason: `${reason} Falling back to cached thumbnail frame delivery.`,
    };
  }

  return {
    status: 'unsupported',
    container,
    canAttempt: false,
    reason,
  };
}

function formatPreviewWorkerFrameDeliveryLabel({
  requestedFrames,
  decodedFrames,
  failedFrames,
  unsupportedFrames,
  averageDecodeMs,
  lastStatus,
}: Pick<PreviewWorkerFrameDeliveryStats, 'requestedFrames' | 'decodedFrames' | 'failedFrames' | 'unsupportedFrames' | 'averageDecodeMs' | 'lastStatus'>): string {
  if (requestedFrames === 0) {
    return 'no worker frames requested';
  }

  const timing = averageDecodeMs ? ` / ${averageDecodeMs.toFixed(1)}ms avg` : '';
  return `${decodedFrames}/${requestedFrames} decoded / ${failedFrames} failed / ${unsupportedFrames} unsupported / ${lastStatus}${timing}`;
}

function readBenchmarkFrameMs(benchmark?: PreviewWorkerBenchmark): number | undefined {
  const value = benchmark?.averageFrameMs;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? clampNumber(value, 0.1, 1000) : undefined;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}
