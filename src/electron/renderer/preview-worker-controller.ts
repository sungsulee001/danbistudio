import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildPreviewWorkerFrameRequest,
  buildPreviewWorkerPlan,
  summarizePreviewWorkerFrameResults,
  type PreviewWorkerBenchmark,
  type PreviewWorkerCapabilitySnapshot,
  type PreviewWorkerFrameResult,
  type PreviewWorkerPlan,
  type PreviewWorkerSourceLayer,
  type PreviewWorkerSourceStats,
} from '../../lib/editor/preview-worker';

export interface PreviewWorkerDecodedFrame {
  requestId: string;
  mediaId: string;
  source: string;
  timestamp: number;
  duration: number;
  width: number;
  height: number;
  reason?: string;
}

export interface PreviewWorkerControllerOptions {
  previewWidth: number;
  previewHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  videoLayerCount: number;
  videoLayerSignature: string;
  sourceStats?: PreviewWorkerSourceStats;
  sourceLayers?: PreviewWorkerSourceLayer[];
  fps?: number;
  workerUrl?: string;
  benchmarkSamples?: number;
}

export interface PreviewWorkerControllerState {
  plan: PreviewWorkerPlan;
  decodedFrame?: PreviewWorkerDecodedFrame;
}

type PreviewWorkerMessage =
  | { type: 'capabilities'; id: string; capabilities: PreviewWorkerCapabilitySnapshot }
  | { type: 'benchmark'; id: string; benchmark: PreviewWorkerBenchmark }
  | { type: 'frame'; id: string; result: PreviewWorkerFrameResult; bitmap?: ImageBitmap };

export function usePreviewWorkerController({
  previewWidth,
  previewHeight,
  canvasWidth,
  canvasHeight,
  videoLayerCount,
  videoLayerSignature,
  sourceStats,
  sourceLayers = [],
  fps = 30,
  workerUrl = '/editor-preview-worker.js',
  benchmarkSamples = 12,
}: PreviewWorkerControllerOptions): PreviewWorkerControllerState {
  const [capabilities, setCapabilities] = useState<Partial<PreviewWorkerCapabilitySnapshot>>({});
  const [benchmark, setBenchmark] = useState<PreviewWorkerBenchmark | undefined>();
  const [frameResults, setFrameResults] = useState<PreviewWorkerFrameResult[]>([]);
  const [decodedFrame, setDecodedFrame] = useState<PreviewWorkerDecodedFrame | undefined>();
  const workerRef = useRef<Worker | null>(null);
  const workerMessageIdRef = useRef('');
  const latestFrameRequestIdRef = useRef('');
  const decodedFrameUrlRef = useRef('');
  const sourceLayerIdentitySignature = useMemo(() => (
    sourceLayers.map((layer) => `${layer.assetId ?? 'source'}:${layer.kind ?? 'media'}:${layer.mode}:${layer.source ?? ''}:${layer.frameSource ?? ''}`).join('|')
  ), [sourceLayers]);
  const sourceLayerFrameSignature = useMemo(() => (
    sourceLayers.map((layer) => `${layer.assetId ?? 'source'}:${roundFrameRequestTime(layer.time)}:${layer.source ?? ''}:${layer.frameSource ?? ''}`).join('|')
  ), [sourceLayers]);
  const frameDelivery = useMemo(() => summarizePreviewWorkerFrameResults(frameResults), [frameResults]);

  const plan = useMemo<PreviewWorkerPlan>(() => (
    buildPreviewWorkerPlan(capabilities, {
      videoLayerCount,
      canvasWidth: previewWidth || canvasWidth,
      canvasHeight: previewHeight || canvasHeight,
      fps,
      benchmark,
      sourceStats,
      frameDelivery,
    })
  ), [benchmark, capabilities, canvasHeight, canvasWidth, fps, frameDelivery, previewHeight, previewWidth, sourceStats, videoLayerCount]);

  useEffect(() => {
    const mainThreadCapabilities = detectMainThreadPreviewWorkerCapabilities();
    setCapabilities(mainThreadCapabilities);
    setBenchmark(undefined);
    setFrameResults([]);
    setDecodedFrame(undefined);
    revokeObjectUrl(decodedFrameUrlRef.current);
    decodedFrameUrlRef.current = '';
    workerRef.current = null;
    workerMessageIdRef.current = '';
    latestFrameRequestIdRef.current = '';

    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return undefined;
    }

    const worker = new Worker(workerUrl);
    const requestId = `preview-${Date.now()}`;
    workerRef.current = worker;
    workerMessageIdRef.current = requestId;
    worker.onmessage = (event: MessageEvent<PreviewWorkerMessage>) => {
      const message = event.data;
      if (!message || message.id !== requestId) {
        return;
      }

      if (message.type === 'capabilities') {
        setCapabilities({
          ...mainThreadCapabilities,
          ...message.capabilities,
          requestVideoFrameCallbackSupported: mainThreadCapabilities.requestVideoFrameCallbackSupported,
        });
      }

      if (message.type === 'benchmark') {
        setBenchmark(message.benchmark);
      }

      if (message.type === 'frame') {
        if (!shouldAcceptPreviewWorkerFrameResult(message.result.requestId, latestFrameRequestIdRef.current)) {
          message.bitmap?.close();
          return;
        }

        setFrameResults((current) => [...current.slice(-3), message.result]);
        if (message.result.status !== 'decoded' || !message.bitmap) {
          setDecodedFrame(undefined);
          revokeObjectUrl(decodedFrameUrlRef.current);
          decodedFrameUrlRef.current = '';
          message.bitmap?.close();
          return;
        }

        void createObjectUrlFromImageBitmap(message.bitmap)
          .then((source) => {
            if (!shouldAcceptPreviewWorkerFrameResult(message.result.requestId, latestFrameRequestIdRef.current)) {
              revokeObjectUrl(source);
              return;
            }

            revokeObjectUrl(decodedFrameUrlRef.current);
            decodedFrameUrlRef.current = source;
            setDecodedFrame({
              requestId: message.result.requestId,
              mediaId: message.result.mediaId,
              source,
              timestamp: message.result.timestamp,
              duration: message.result.duration,
              width: message.result.width,
              height: message.result.height,
              reason: message.result.reason,
            });
          })
          .catch(() => {
            if (shouldAcceptPreviewWorkerFrameResult(message.result.requestId, latestFrameRequestIdRef.current)) {
              setDecodedFrame(undefined);
            }
          });
      }
    };

    worker.postMessage({ type: 'detect', id: requestId });
    worker.postMessage({
      type: 'benchmark',
      id: requestId,
      width: Math.round(previewWidth || canvasWidth),
      height: Math.round(previewHeight || canvasHeight),
      samples: benchmarkSamples,
    });

    return () => {
      if (workerRef.current === worker) {
        workerRef.current = null;
        workerMessageIdRef.current = '';
        latestFrameRequestIdRef.current = '';
      }
      worker.terminate();
      revokeObjectUrl(decodedFrameUrlRef.current);
      decodedFrameUrlRef.current = '';
    };
  }, [benchmarkSamples, canvasHeight, canvasWidth, previewHeight, previewWidth, workerUrl]);

  useEffect(() => {
    setFrameResults([]);
    setDecodedFrame(undefined);
    latestFrameRequestIdRef.current = '';
    revokeObjectUrl(decodedFrameUrlRef.current);
    decodedFrameUrlRef.current = '';
  }, [sourceLayerIdentitySignature]);

  useEffect(() => {
    const worker = workerRef.current;
    const requestId = workerMessageIdRef.current;
    if (!worker || !requestId) {
      return;
    }

    const frameRequest = buildPreviewWorkerFrameRequest(sourceLayers, {
      requestId: `${requestId}-frame-${Date.now()}`,
      targetWidth: Math.round(previewWidth || canvasWidth),
      targetHeight: Math.round(previewHeight || canvasHeight),
      preferVideoDecode: Boolean(capabilities.workerSupported && capabilities.videoDecoderSupported && capabilities.videoFrameSupported && capabilities.encodedVideoChunkSupported),
    });
    if (frameRequest) {
      latestFrameRequestIdRef.current = frameRequest.requestId;
      worker.postMessage({
        type: 'frame',
        id: requestId,
        request: frameRequest,
      });
    }
  }, [canvasHeight, canvasWidth, capabilities.encodedVideoChunkSupported, capabilities.videoDecoderSupported, capabilities.videoFrameSupported, capabilities.workerSupported, previewHeight, previewWidth, sourceLayerFrameSignature, sourceLayers, videoLayerSignature]);

  return { plan, decodedFrame };
}

export function detectMainThreadPreviewWorkerCapabilities(): Partial<PreviewWorkerCapabilitySnapshot> {
  if (typeof window === 'undefined') {
    return {};
  }

  const globalScope = globalThis as typeof globalThis & {
    VideoDecoder?: unknown;
    VideoFrame?: unknown;
    EncodedVideoChunk?: unknown;
    OffscreenCanvas?: unknown;
    createImageBitmap?: unknown;
  };
  const videoPrototype = typeof HTMLVideoElement !== 'undefined' ? HTMLVideoElement.prototype as HTMLVideoElement & {
    requestVideoFrameCallback?: unknown;
  } : undefined;

  return {
    workerSupported: typeof Worker !== 'undefined',
    webCodecsSupported: typeof globalScope.VideoDecoder !== 'undefined' || typeof globalScope.VideoFrame !== 'undefined',
    videoDecoderSupported: typeof globalScope.VideoDecoder !== 'undefined',
    videoFrameSupported: typeof globalScope.VideoFrame !== 'undefined',
    encodedVideoChunkSupported: typeof globalScope.EncodedVideoChunk !== 'undefined',
    offscreenCanvasSupported: typeof globalScope.OffscreenCanvas !== 'undefined',
    imageBitmapSupported: typeof globalScope.createImageBitmap === 'function',
    requestVideoFrameCallbackSupported: typeof videoPrototype?.requestVideoFrameCallback === 'function',
  };
}

export function shouldAcceptPreviewWorkerFrameResult(requestId: string, latestRequestId: string): boolean {
  return Boolean(requestId) && requestId === latestRequestId;
}

function roundFrameRequestTime(value: number | undefined): number {
  return Math.round(Math.max(0, Number.isFinite(value) ? value! : 0) * 4) / 4;
}

function createObjectUrlFromImageBitmap(bitmap: ImageBitmap): Promise<string> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    bitmap.close();
    return Promise.reject(new Error('Document canvas is unavailable for decoded preview frames.'));
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width));
  canvas.height = Math.max(1, Math.round(bitmap.height));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    bitmap.close();
    return Promise.reject(new Error('Canvas 2D context is unavailable for decoded preview frames.'));
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas blob export failed for decoded preview frame.'));
        return;
      }

      resolve(URL.createObjectURL(blob));
    }, 'image/webp', 0.9);
  });
}

function revokeObjectUrl(source: string): void {
  if (!source || typeof URL === 'undefined') {
    return;
  }

  URL.revokeObjectURL(source);
}
