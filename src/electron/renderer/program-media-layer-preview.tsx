import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';
import { isAiEnhancementEffect, readAiModelEffectPass, type AiModelEffectPass } from '../../lib/editor/ai-effects';
import { readClipCanvasLayoutMode } from '../../lib/editor/canvas-layout';
import { getClipPlaybackSpeed } from '../../lib/editor/clip-timing';
import { isCropMaskEffect, readCropMaskParameters } from '../../lib/editor/crop-mask';
import { interpolateObjectMask, isObjectMaskEffect } from '../../lib/editor/object-mask';
import { resolvePreviewMediaSource, resolvePreviewSourcePath, type PreviewSourcePathMode } from '../../lib/editor/preview-source';
import { buildPreviewFrameSampleFromVideoCallback, type PreviewFrameSample, type PreviewVideoFrameCallbackMetadata } from '../../lib/editor/preview-performance';
import { shouldUsePreviewWorkerDecodedFrame } from '../../lib/editor/preview-worker';
import { resolveRenderableAssetMediaKind } from '../../lib/editor/renderable-media-kind';
import { interpolateSubjectTrackingFocal } from '../../lib/editor/subject-tracking-reframe';
import type { ClipEffect, EditorAsset, TimelineClip } from '../../lib/editor/types';
import { isVisualFilterEffect, readPrivacyBlurRegionAtTime } from '../../lib/editor/visual-effects';
import type { VideoScopeSample } from '../../lib/editor/video-scopes';
import type { PreviewWorkerDecodedFrame } from './preview-worker-controller';
import { readMediaPreviewVideoScopeSample } from './video-scope-sampling';

export interface AiModelPassPreviewLayer {
  id: string;
  source: string;
  renderPath: string;
  sourceMode: PreviewSourcePathMode;
  unavailableReason?: string;
  kind: AiModelEffectPass['kind'];
  opacity: number;
  mixBlendMode: CSSProperties['mixBlendMode'];
  duration?: number;
}

export function ProgramMediaLayerPreview({
  asset,
  clip,
  isPlaying,
  playbackRate,
  playhead,
  localTime,
  mediaTime,
  active,
  workerFrame,
  onFrameSample,
  onScopeSample,
}: {
  asset: EditorAsset;
  clip: TimelineClip;
  isPlaying: boolean;
  playbackRate: number;
  playhead: number;
  localTime: number;
  mediaTime: number;
  active: boolean;
  workerFrame?: PreviewWorkerDecodedFrame;
  onFrameSample: (clipId: string, sample: PreviewFrameSample) => void;
  onScopeSample: (clipId: string, sample: VideoScopeSample) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const mediaPreviewStyle = buildMediaPreviewStyle(clip, localTime);
  const modelPassPreviewLayers = buildAiModelPassPreviewLayers(clip);
  const previewSource = resolvePreviewMediaSource(asset);
  const mediaKind = resolveRenderableAssetMediaKind(asset);
  const mediaSource = previewSource.source;
  const missingPreviewReason = previewSource.mode === 'none'
    ? 'Preview source unavailable'
    : 'Missing preview source';
  const clipActive = playhead >= clip.start && playhead <= clip.start + clip.duration;
  const effectivePlaybackRate = Math.max(0.25, Math.min(4, playbackRate * getClipPlaybackSpeed(clip, playhead - clip.start)));
  const freezeFrameActive = typeof clip.freezeFrameTime === 'number' && Number.isFinite(clip.freezeFrameTime);
  const useWorkerFrame = mediaKind === 'video' && shouldUsePreviewWorkerDecodedFrame(workerFrame, {
    mediaId: asset.id,
    mediaTime,
    isPlaying: active && isPlaying && clipActive && playbackRate > 0,
    freezeFrameActive,
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (Number.isFinite(mediaTime) && Math.abs(video.currentTime - mediaTime) > 0.25) {
      video.currentTime = mediaTime;
    }

    if (active && !freezeFrameActive && isPlaying && clipActive && playbackRate > 0) {
      video.playbackRate = effectivePlaybackRate;
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [active, clipActive, effectivePlaybackRate, freezeFrameActive, isPlaying, mediaTime, playbackRate]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || mediaKind !== 'video') {
      return;
    }
    const videoWithFrameCallback = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: (now: number, metadata: PreviewVideoFrameCallbackMetadata) => void) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    };

    const reportFrameSample = (metadata?: PreviewVideoFrameCallbackMetadata, timestampMs?: number) => {
      onFrameSample(
        clip.id,
        metadata
          ? buildPreviewFrameSampleFromVideoCallback(metadata, timestampMs)
          : readVideoPreviewFrameSample(video),
      );
      const scopeSample = readMediaPreviewVideoScopeSample(video);
      if (scopeSample) {
        onScopeSample(clip.id, scopeSample);
      }
    };

    reportFrameSample();
    if (typeof videoWithFrameCallback.requestVideoFrameCallback === 'function') {
      let cancelled = false;
      let callbackHandle: number | undefined;
      const scheduleNextFrameSample = () => {
        callbackHandle = videoWithFrameCallback.requestVideoFrameCallback?.((now, metadata) => {
          if (cancelled) {
            return;
          }

          reportFrameSample(metadata, now);
          scheduleNextFrameSample();
        });
      };

      scheduleNextFrameSample();

      return () => {
        cancelled = true;
        if (
          callbackHandle !== undefined &&
          typeof videoWithFrameCallback.cancelVideoFrameCallback === 'function'
        ) {
          videoWithFrameCallback.cancelVideoFrameCallback(callbackHandle);
        }
      };
    }

    const interval = window.setInterval(reportFrameSample, 500);
    return () => window.clearInterval(interval);
  }, [clip.id, mediaKind, onFrameSample, onScopeSample]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image || (mediaKind !== 'image' && !useWorkerFrame) || !image.complete) {
      return;
    }

    const scopeSample = readMediaPreviewVideoScopeSample(image);
    if (scopeSample) {
      onScopeSample(clip.id, scopeSample);
    }
  }, [clip.id, mediaKind, mediaSource, onScopeSample, useWorkerFrame, workerFrame?.source]);

  if (mediaKind === 'image') {
    return (
      <div className="relative flex h-full w-full items-center justify-center">
        {mediaSource ? (
          <img
            ref={imageRef}
            src={mediaSource}
            alt={asset.name}
            className="max-h-full max-w-full object-contain"
            style={mediaPreviewStyle}
            onLoad={(event) => {
              const scopeSample = readMediaPreviewVideoScopeSample(event.currentTarget);
              if (scopeSample) {
                onScopeSample(clip.id, scopeSample);
              }
            }}
          />
        ) : (
          <MissingMediaPreviewPlaceholder
            asset={asset}
            clip={clip}
            reason={missingPreviewReason}
            style={mediaPreviewStyle}
          />
        )}
        <AiModelPassPreviewOverlays layers={modelPassPreviewLayers} clipTime={playhead - clip.start} />
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {useWorkerFrame && workerFrame?.source ? (
        <img
          ref={imageRef}
          src={workerFrame.source}
          alt={`${asset.name} worker decoded frame`}
          className="max-h-full max-w-full object-contain"
          data-testid={`program-worker-frame-${clip.id}`}
          data-worker-frame-reason={workerFrame.reason ?? ''}
          style={mediaPreviewStyle}
          onLoad={(event) => {
            const scopeSample = readMediaPreviewVideoScopeSample(event.currentTarget);
            if (scopeSample) {
              onScopeSample(clip.id, scopeSample);
            }
          }}
        />
      ) : mediaSource ? (
        <video
          ref={videoRef}
          src={mediaSource}
          className="max-h-full max-w-full object-contain"
          data-testid={`program-media-video-${clip.id}`}
          data-program-asset-id={asset.id}
          data-program-clip-id={clip.id}
          muted
          playsInline
          style={mediaPreviewStyle}
        />
      ) : (
        <MissingMediaPreviewPlaceholder
          asset={asset}
          clip={clip}
          reason={missingPreviewReason}
          style={mediaPreviewStyle}
        />
      )}
      <AiModelPassPreviewOverlays layers={modelPassPreviewLayers} clipTime={playhead - clip.start} />
    </div>
  );
}

function MissingMediaPreviewPlaceholder({
  asset,
  clip,
  reason,
  style,
}: {
  asset: EditorAsset;
  clip: TimelineClip;
  reason: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden border border-ds-300 bg-paper text-ds-700"
      data-testid={`program-missing-media-placeholder-${clip.id}`}
      style={style}
    >
      <div
        className="absolute inset-0 opacity-35"
        style={{
          backgroundImage: 'linear-gradient(45deg, rgba(14,165,233,0.26) 25%, transparent 25%), linear-gradient(-45deg, rgba(16,185,129,0.22) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(14,165,233,0.22) 75%), linear-gradient(-45deg, transparent 75%, rgba(16,185,129,0.18) 75%)',
          backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0',
          backgroundSize: '24px 24px',
        }}
      />
      <div className="relative max-w-[78%] rounded border border-ds-300 on-dark bg-black/75 px-4 py-3 text-center shadow-lg">
        <div className="text-sm font-semibold text-ink">{asset.name || clip.name}</div>
        <div className="mt-1 text-meta uppercase tracking-wide text-info-700">{asset.kind} placeholder</div>
        <div className="mt-2 text-xs text-ds-700">{reason}</div>
      </div>
    </div>
  );
}

export function buildAiModelPassPreviewLayers(clip: TimelineClip): AiModelPassPreviewLayer[] {
  return clip.effects
    .filter((effect) => effect.enabled && effect.type === 'ai')
    .map(readAiModelEffectPass)
    .filter((pass): pass is AiModelEffectPass => Boolean(pass))
    .map((pass, index) => {
      const previewSource = resolvePreviewSourcePath(pass.source, pass.path);
      return {
        id: `${clip.id}-ai-pass-${index}-${previewSource.source || pass.path}`,
        source: previewSource.source,
        renderPath: pass.path,
        sourceMode: previewSource.mode,
        unavailableReason: previewSource.reason,
        kind: pass.kind,
        opacity: clampNumber(pass.opacity, 0, 1),
        mixBlendMode: previewAiModelPassBlendMode(pass.blendMode),
        duration: pass.duration,
      };
    });
}

function AiModelPassPreviewOverlays({
  layers,
  clipTime,
}: {
  layers: AiModelPassPreviewLayer[];
  clipTime: number;
}) {
  if (layers.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {layers.map((layer) => (
        <AiModelPassPreviewOverlay key={layer.id} layer={layer} clipTime={clipTime} />
      ))}
    </div>
  );
}

function AiModelPassPreviewOverlay({
  layer,
  clipTime,
}: {
  layer: AiModelPassPreviewLayer;
  clipTime: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const safeTime = clampNumber(clipTime, 0, layer.duration ?? Math.max(0, clipTime));
  const style: CSSProperties = {
    opacity: layer.opacity,
    mixBlendMode: layer.mixBlendMode,
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || layer.kind !== 'video') {
      return;
    }

    if (Number.isFinite(safeTime) && Math.abs(video.currentTime - safeTime) > 0.25) {
      video.currentTime = safeTime;
    }
    video.pause();
  }, [layer.kind, safeTime, layer.source]);

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={style}
      data-testid={`program-ai-model-pass-${layer.id}`}
      data-ai-model-pass-source={layer.source}
      data-ai-model-pass-source-mode={layer.sourceMode}
    >
      {!layer.source ? (
        <div className="rounded border border-warn-500/40 on-dark bg-black/80 px-3 py-2 text-center text-meta text-warn-900">
          {layer.unavailableReason ?? 'AI model pass preview source is unavailable.'}
        </div>
      ) : layer.kind === 'image' ? (
        <img
          src={layer.source}
          alt="AI model pass preview"
          className="h-full w-full object-contain"
        />
      ) : (
        <video
          ref={videoRef}
          src={layer.source}
          muted
          playsInline
          className="h-full w-full object-contain"
        />
      )}
    </div>
  );
}

export function ProgramPrivacyRegionOverlays({ clip, localTime }: { clip: TimelineClip; localTime: number }) {
  const effects = clip.effects.filter((effect) => (
    effect.enabled &&
    isVisualFilterEffect(effect) &&
    effect.parameters.visualEffect === 'privacy-blur'
  ));

  if (effects.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {effects.map((effect) => {
        const region = readPrivacyBlurRegionAtTime(effect, localTime, clip.duration);
        const left = clampNumber(region.centerX - (region.width / 2), 0, 1) * 100;
        const top = clampNumber(region.centerY - (region.height / 2), 0, 1) * 100;
        const right = clampNumber(1 - region.centerX - (region.width / 2), 0, 1) * 100;
        const bottom = clampNumber(1 - region.centerY - (region.height / 2), 0, 1) * 100;

        return (
          <div
            key={effect.id}
            className="absolute rounded-sm border border-warn-700/85 bg-warn-700/15 shadow-[0_0_0_1px_rgba(0,0,0,0.55)] backdrop-blur-[2px]"
            style={{
              left: `${left}%`,
              right: `${right}%`,
              top: `${top}%`,
              bottom: `${bottom}%`,
            }}
          />
        );
      })}
    </div>
  );
}

function buildMediaPreviewStyle(clip: TimelineClip, clipTime = 0): CSSProperties | undefined {
  const layoutStyle = buildCanvasLayoutPreviewStyle(clip);
  const cropStyle = buildCropPreviewMediaStyle(clip) ?? {};
  const objectMaskStyle = buildObjectMaskPreviewMediaStyle(clip, clipTime) ?? {};
  const reframeStyle = buildSmartReframePreviewStyle(clip, clipTime) ?? {};
  const visualFilterStyle = buildVisualFilterPreviewMediaStyle(clip) ?? {};
  const visualFilter = buildVisualFilterPreviewFilter(clip);
  const aiEnhancementFilter = buildAiEnhancementPreviewFilter(clip);
  const colorFilter = buildColorPreviewFilter(clip);
  const mediaFilters = [visualFilter, aiEnhancementFilter, colorFilter].filter(Boolean).join(' ');
  const style: CSSProperties = {
    ...layoutStyle,
    ...cropStyle,
    ...objectMaskStyle,
    ...reframeStyle,
    ...visualFilterStyle,
  };

  if (mediaFilters) {
    style.filter = mediaFilters;
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

function buildCanvasLayoutPreviewStyle(clip: TimelineClip): CSSProperties {
  const mode = readClipCanvasLayoutMode(clip);
  const objectFit = mode === 'fill'
    ? 'cover'
    : mode === 'stretch'
      ? 'fill'
      : 'contain';

  return {
    height: '100%',
    width: '100%',
    objectFit,
  };
}

function buildCropPreviewMediaStyle(clip: TimelineClip): CSSProperties | undefined {
  const effect = clip.effects.find((item) => item.enabled && isCropMaskEffect(item));
  if (!effect) {
    return undefined;
  }

  const { left, right, top, bottom } = readCropMaskParameters(effect);

  if (left + right + top + bottom <= 0.001) {
    return undefined;
  }

  const widthRatio = Math.max(0.05, 1 - left - right);
  const heightRatio = Math.max(0.05, 1 - top - bottom);

  return {
    clipPath: `inset(${top * 100}% ${right * 100}% ${bottom * 100}% ${left * 100}%)`,
    transform: `scale(${1 / widthRatio}, ${1 / heightRatio})`,
    transformOrigin: `${(left + widthRatio / 2) * 100}% ${(top + heightRatio / 2) * 100}%`,
  };
}

function buildObjectMaskPreviewMediaStyle(clip: TimelineClip, clipTime = 0): CSSProperties | undefined {
  const effect = clip.effects.find((item) => item.enabled && isObjectMaskEffect(item));
  if (!effect) {
    return undefined;
  }

  const mask = interpolateObjectMask(effect, clipTime);
  if (mask.invert) {
    return undefined;
  }

  const centerX = clampNumber(mask.centerX, 0, 1);
  const centerY = clampNumber(mask.centerY, 0, 1);
  const width = clampNumber(mask.width, 0.05, 1);
  const height = clampNumber(mask.height, 0.05, 1);

  if (mask.shape === 'rectangle') {
    const left = clampNumber(centerX - (width / 2), 0, 1) * 100;
    const right = clampNumber(1 - centerX - (width / 2), 0, 1) * 100;
    const top = clampNumber(centerY - (height / 2), 0, 1) * 100;
    const bottom = clampNumber(1 - centerY - (height / 2), 0, 1) * 100;

    return {
      clipPath: `inset(${top}% ${right}% ${bottom}% ${left}%)`,
    };
  }

  return {
    clipPath: `ellipse(${width * 50}% ${height * 50}% at ${centerX * 100}% ${centerY * 100}%)`,
  };
}

function buildSmartReframePreviewStyle(clip: TimelineClip, clipTime = 0): CSSProperties | undefined {
  const effect = clip.effects.find((item) => item.enabled && item.type === 'reframe');
  if (!effect) {
    return undefined;
  }

  const focal = interpolateSubjectTrackingFocal(effect, clipTime);
  const focalX = clampNumber(focal.focalX, 0, 1);
  const focalY = clampNumber(focal.focalY, 0, 1);
  const zoom = clampNumber(readEffectNumber(effect, 'zoom', 1), 1, 4);

  return {
    height: '100%',
    width: '100%',
    objectFit: 'cover',
    objectPosition: `${focalX * 100}% ${focalY * 100}%`,
    transform: `scale(${zoom})`,
  };
}

function buildColorPreviewFilter(clip: TimelineClip): string | undefined {
  const effects = clip.effects.filter((item) => item.enabled && item.type === 'color');
  if (effects.length === 0) {
    return undefined;
  }

  const filters = effects.map((effect) => {
    const brightness = 1 + clampNumber(readEffectNumber(effect, 'brightness', 0), -1, 1);
    const contrast = clampNumber(readEffectNumber(effect, 'contrast', 1), 0, 4);
    const saturation = clampNumber(readEffectNumber(effect, 'saturation', 1), 0, 4);
    const temperature = clampNumber(readEffectNumber(effect, 'temperature', 0), -1, 1) * 8;
    const tint = clampNumber(readEffectNumber(effect, 'tint', 0), -1, 1) * 6;
    const curveShadow = clampNumber(readEffectNumber(effect, 'curveShadow', 0.25), 0, 1);
    const curveHighlight = clampNumber(readEffectNumber(effect, 'curveHighlight', 0.75), 0, 1);
    const curveSpread = Math.max(0.01, curveHighlight - curveShadow);
    const curveContrast = effect.parameters.curveShadow !== undefined || effect.parameters.curveHighlight !== undefined
      ? 1 + ((curveSpread - 0.5) * 0.65)
      : 1;
    const curveLift = effect.parameters.curveShadow !== undefined
      ? 1 + ((curveShadow - 0.25) * 0.25)
      : 1;
    const lutHint = effect.parameters.lutPath !== undefined || effect.parameters.lutSource !== undefined
      ? ' contrast(1.02) saturate(1.03)'
      : '';
    return `brightness(${brightness * curveLift}) contrast(${contrast * curveContrast}) saturate(${saturation}) sepia(${Math.abs(temperature) / 20}) hue-rotate(${tint - temperature}deg)${lutHint}`;
  });

  return filters.join(' ');
}

function buildVisualFilterPreviewMediaStyle(clip: TimelineClip): CSSProperties | undefined {
  const hasPixelate = clip.effects.some((item) => (
    item.enabled &&
    isVisualFilterEffect(item) &&
    item.parameters.visualEffect === 'pixelate-blocks'
  ));

  return hasPixelate ? { imageRendering: 'pixelated' } : undefined;
}

function buildVisualFilterPreviewFilter(clip: TimelineClip): string | undefined {
  const effects = clip.effects.filter((item) => item.enabled && isVisualFilterEffect(item));
  if (effects.length === 0) {
    return undefined;
  }

  const filters = effects.map((effect) => {
    switch (effect.parameters.visualEffect) {
      case 'blur-soft': {
        const radius = clampNumber(readEffectNumber(effect, 'blurRadius', 4), 0, 32);
        return radius > 0.001 ? `blur(${radius}px)` : '';
      }
      case 'sharpen-crisp': {
        const amount = clampNumber(readEffectNumber(effect, 'sharpenAmount', 0.65), 0, 1.5);
        return `contrast(${1 + (amount * 0.08)}) saturate(${1 + (amount * 0.03)})`;
      }
      case 'vignette-focus': {
        const strength = clampNumber(readEffectNumber(effect, 'vignetteStrength', 0.35), 0, 1);
        return `contrast(${1 + (strength * 0.12)}) brightness(${1 - (strength * 0.04)})`;
      }
      case 'soft-glow': {
        const radius = clampNumber(readEffectNumber(effect, 'glowRadius', 2.5), 0, 16);
        const intensity = clampNumber(readEffectNumber(effect, 'glowIntensity', 0.22), 0, 1);
        const saturation = clampNumber(readEffectNumber(effect, 'glowSaturation', 1.08), 0, 4);
        return `brightness(${1 + (intensity * 0.08)}) contrast(${1 + (intensity * 0.05)}) saturate(${saturation}) blur(${Math.min(1.5, radius * 0.15)}px)`;
      }
      case 'advanced-bloom': {
        const radius = clampNumber(readEffectNumber(effect, 'bloomRadius', 6), 0, 32);
        const intensity = clampNumber(readEffectNumber(effect, 'bloomIntensity', 0.34), 0, 1);
        const threshold = clampNumber(readEffectNumber(effect, 'bloomThreshold', 0.72), 0.1, 0.98);
        const saturation = clampNumber(readEffectNumber(effect, 'bloomSaturation', 1.18), 0, 4);
        return `brightness(${1 + (intensity * (0.07 + ((1 - threshold) * 0.05)))}) contrast(${1 + (intensity * 0.12)}) saturate(${saturation}) blur(${Math.min(1.8, radius * 0.08)}px)`;
      }
      case 'motion-trails': {
        const frames = clampNumber(readEffectNumber(effect, 'trailFrames', 5), 2, 12);
        const decay = clampNumber(readEffectNumber(effect, 'trailDecay', 0.65), 0.1, 1);
        return `contrast(${1 + (frames * 0.004)}) brightness(${1 - ((1 - decay) * 0.05)}) blur(${Math.min(1.2, frames * 0.08)}px)`;
      }
      case 'optical-flow-blur': {
        const frames = clampNumber(readEffectNumber(effect, 'flowBlurFrames', 3), 2, 6);
        const strength = clampNumber(readEffectNumber(effect, 'flowBlurStrength', 0.58), 0.05, 1);
        return `contrast(${1 + (strength * 0.04)}) brightness(${1 - (strength * 0.025)}) blur(${Math.min(1.6, frames * strength * 0.18)}px)`;
      }
      case 'pixelate-blocks':
        return 'contrast(1.02)';
      case 'film-grain': {
        const strength = clampNumber(readEffectNumber(effect, 'grainStrength', 12), 0, 100);
        return `contrast(${1 + (strength * 0.0025)}) saturate(${1 - Math.min(0.12, strength * 0.001)})`;
      }
      case 'green-screen-key': {
        const similarity = clampNumber(readEffectNumber(effect, 'keySimilarity', 0.18), 0.01, 1);
        return `saturate(${Math.max(0.2, 1 - (similarity * 0.35))}) contrast(1.04)`;
      }
      default:
        return '';
    }
  }).filter(Boolean);

  return filters.length > 0 ? filters.join(' ') : undefined;
}

function buildAiEnhancementPreviewFilter(clip: TimelineClip): string | undefined {
  const effects = clip.effects.filter((item) => item.enabled && isAiEnhancementEffect(item));
  if (effects.length === 0) {
    return undefined;
  }

  const filters = effects.map((effect) => {
    switch (effect.parameters.aiEffect) {
      case 'denoise-sharpen':
        return 'contrast(1.04) saturate(1.02)';
      case 'cinematic-pop': {
        const brightness = 1 + clampNumber(readEffectNumber(effect, 'brightness', 0), -1, 1);
        const contrast = clampNumber(readEffectNumber(effect, 'contrast', 1.12), 0, 4);
        const saturation = clampNumber(readEffectNumber(effect, 'saturation', 1.08), 0, 4);
        return `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`;
      }
      case 'portrait-focus': {
        const focus = clampNumber(readEffectNumber(effect, 'focusStrength', 0.32), 0, 1);
        return `contrast(${1.04 + (focus * 0.05)}) saturate(${1.02 + (focus * 0.04)})`;
      }
      case 'deband-clean':
        return 'contrast(1.02) saturate(1.01)';
      default:
        return '';
    }
  }).filter(Boolean);

  return filters.length > 0 ? filters.join(' ') : undefined;
}

function previewAiModelPassBlendMode(blendMode: AiModelEffectPass['blendMode']): CSSProperties['mixBlendMode'] {
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

function readVideoPreviewFrameSample(video: HTMLVideoElement): PreviewFrameSample {
  const videoWithQuality = video as HTMLVideoElement & {
    getVideoPlaybackQuality?: () => VideoPlaybackQuality;
    webkitDecodedFrameCount?: number;
    webkitDroppedFrameCount?: number;
  };
  const quality = typeof videoWithQuality.getVideoPlaybackQuality === 'function'
    ? videoWithQuality.getVideoPlaybackQuality()
    : undefined;
  const decodedFrames = quality?.totalVideoFrames ?? videoWithQuality.webkitDecodedFrameCount;

  return {
    totalVideoFrames: decodedFrames,
    droppedVideoFrames: quality?.droppedVideoFrames ?? videoWithQuality.webkitDroppedFrameCount,
    corruptedVideoFrames: quality?.corruptedVideoFrames,
    timestampMs: quality?.creationTime ?? performance.now(),
  };
}

function readEffectNumber(effect: ClipEffect, key: string, fallback: number): number {
  const value = effect.parameters[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
