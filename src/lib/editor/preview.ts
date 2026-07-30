import type { CaptionSegment, EditorAsset, EditorProject, TimelineClip, TimelineTrack } from './types';
import { audioDuckingGainAt, buildAudioDuckingIntervalsForClip, type AudioDuckingContext } from './audio-ducking';
import { buildStaticAudioEffectGain } from './audio-effect-gain';
import { audioTransitionGainAt, resolveClipAudioTransition } from './audio-transition';
import { clipVolumeDbToGain, normalizeTrackPan, trackVolumeDbToGain } from './audio-mixer';
import { buildClipWithAdjustmentEffects } from './adjustment-layer';
import { getClipMediaSourceTime, getClipSourceTime } from './clip-timing';
import { resolveClipNumericKeyframeValue } from './keyframe-interpolation';
import { clipHasTimelineAudio } from './media-metadata';
import { readClipMotionTransform } from './motion-transform';
import { isRenderableVisualMediaAsset, resolveRenderableAssetMediaKind } from './renderable-media-kind';
import { isTrackPlayable, isTrackPlayableForDomain } from './track-playback';

export interface ProgramPreviewStyle {
  opacity: number;
  positionX: number;
  positionY: number;
  scale: number;
  rotation: number;
  volume: number;
  pan: number;
}

export interface ProgramPreviewLayer {
  trackId: string;
  trackName: string;
  trackIndex: number;
  clip: TimelineClip;
  asset?: EditorAsset;
  text?: string;
  enabledEffects: string[];
  clipTime: number;
  localTime: number;
  mediaTime: number;
  style: ProgramPreviewStyle;
  visible: boolean;
  reason?: string;
}

export interface ProgramPreviewStack {
  playhead: number;
  canvasWidth: number;
  canvasHeight: number;
  layers: ProgramPreviewLayer[];
  visualLayers: ProgramPreviewLayer[];
  mediaLayers: ProgramPreviewLayer[];
  textLayers: ProgramPreviewLayer[];
  effectLayers: ProgramPreviewLayer[];
  primaryLayer?: ProgramPreviewLayer;
  audioLayers: ProgramPreviewLayer[];
  activeCaptions: CaptionSegment[];
  warnings: string[];
}

export function buildProgramPreviewStack(project: EditorProject, playhead: number): ProgramPreviewStack {
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const safePlayhead = roundTime(clamp(playhead, 0, project.duration));
  const warnings: string[] = [];
  const audioDuckingContexts = buildPreviewAudioDuckingContexts(project.tracks, assetById);

  const layers = project.tracks.flatMap((track, trackIndex) => (
    buildTrackPreviewLayers(track, project.tracks, trackIndex, safePlayhead, assetById, audioDuckingContexts, warnings)
  ));
  const layersWithAdjustments = applyAdjustmentLayersToPreviewLayers(project, layers, safePlayhead);

  const visualLayers = layersWithAdjustments.filter((layer) => (
    layer.visible &&
    layer.asset &&
    (isRenderableVisualMediaAsset(layer.asset) || layer.asset.kind === 'text')
  ));
  const mediaLayers = visualLayers.filter((layer) => isRenderableVisualMediaAsset(layer.asset));
  const textLayers = visualLayers.filter((layer) => layer.asset?.kind === 'text');
  const effectLayers = layersWithAdjustments.filter((layer) => layer.visible && (layer.asset?.kind === 'effect' || layer.clip.kind === 'effect'));
  const trackById = new Map(project.tracks.map((track) => [track.id, track]));
  const audioLayers = layersWithAdjustments.filter((layer) => {
    const track = trackById.get(layer.trackId);
    return Boolean(
      layer.visible &&
      track &&
      isTrackPlayableForDomain(track, project.tracks, 'audio') &&
      clipHasTimelineAudio(layer.clip, layer.asset),
    );
  });
  const activeCaptions = project.captions
    .filter((caption) => caption.text.trim().length > 0 && safePlayhead >= caption.start && safePlayhead <= caption.end)
    .sort((a, b) => a.start - b.start);

  const primaryLayer = mediaLayers[mediaLayers.length - 1];

  return {
    playhead: safePlayhead,
    canvasWidth: project.width,
    canvasHeight: project.height,
    layers: layersWithAdjustments,
    visualLayers,
    mediaLayers,
    textLayers,
    effectLayers,
    primaryLayer,
    audioLayers,
    activeCaptions,
    warnings,
  };
}

function applyAdjustmentLayersToPreviewLayers(
  project: EditorProject,
  layers: ProgramPreviewLayer[],
  playhead: number,
): ProgramPreviewLayer[] {
  return layers.map((layer) => {
    if (!layer.visible || !isRenderableVisualMediaAsset(layer.asset)) {
      return layer;
    }

    const clip = buildClipWithAdjustmentEffects(project, layer.clip, layer.asset, 'point', playhead);
    if (clip === layer.clip) {
      return layer;
    }

    return {
      ...layer,
      clip,
      enabledEffects: clip.effects.filter((effect) => effect.enabled).map((effect) => effect.label),
    };
  });
}

function buildTrackPreviewLayers(
  track: TimelineTrack,
  tracks: TimelineTrack[],
  trackIndex: number,
  playhead: number,
  assetById: Map<string, EditorAsset>,
  audioDuckingContexts: AudioDuckingContext[],
  warnings: string[],
): ProgramPreviewLayer[] {
  if (!isTrackPlayable(track, tracks)) {
    return [];
  }

  return track.clips
    .filter((clip) => playhead >= clip.start && playhead <= clip.start + clip.duration)
    .sort((a, b) => a.start - b.start)
    .map((clip) => {
      const asset = clip.assetId ? assetById.get(clip.assetId) : undefined;
      const clipTime = roundTime(Math.max(0, playhead - clip.start));
      const localTime = getClipSourceTime(clip, clipTime);
      const mediaTime = getClipMediaSourceTime(clip, asset, clipTime);
      const style = buildPreviewStyle(track, clip, clipTime, audioDuckingContexts);
      const enabledEffects = clip.effects.filter((effect) => effect.enabled).map((effect) => effect.label);
      const text = resolveLayerText(clip, asset);

      if (clip.muted) {
        return buildLayer(track, trackIndex, clip, asset, text, enabledEffects, clipTime, localTime, mediaTime, style, false, 'Clip is muted.');
      }

      if (!asset && clip.assetId) {
        warnings.push(`${clip.name} references a missing asset.`);
        return buildLayer(track, trackIndex, clip, asset, text, enabledEffects, clipTime, localTime, mediaTime, style, false, 'Missing asset.');
      }

      if (asset && !resolveRenderableAssetMediaKind(asset) && asset.kind !== 'text' && asset.kind !== 'effect') {
        warnings.push(`${clip.name} uses ${asset.kind} media, which is not composited in preview yet.`);
        return buildLayer(track, trackIndex, clip, asset, text, enabledEffects, clipTime, localTime, mediaTime, style, false, `${asset.kind} preview is not supported yet.`);
      }

      if (!asset && clip.kind === 'ai') {
        warnings.push(`${clip.name} has no rendered media for preview yet.`);
      }

      return buildLayer(track, trackIndex, clip, asset, text, enabledEffects, clipTime, localTime, mediaTime, style, true);
    });
}

function buildPreviewAudioDuckingContexts(
  tracks: TimelineTrack[],
  assetById: Map<string, EditorAsset>,
): AudioDuckingContext[] {
  return tracks
    .filter((track) => isTrackPlayable(track, tracks) && isTrackPlayableForDomain(track, tracks, 'audio'))
    .flatMap((track) => track.clips.flatMap((clip) => {
      if (clip.muted || !clip.assetId) {
        return [];
      }

      const asset = assetById.get(clip.assetId);
      if (!asset || !clipHasTimelineAudio(clip, asset)) {
        return [];
      }

      return [{ clip, asset }];
    }));
}

function buildLayer(
  track: TimelineTrack,
  trackIndex: number,
  clip: TimelineClip,
  asset: EditorAsset | undefined,
  text: string | undefined,
  enabledEffects: string[],
  clipTime: number,
  localTime: number,
  mediaTime: number,
  style: ProgramPreviewStyle,
  visible: boolean,
  reason?: string,
): ProgramPreviewLayer {
  return {
    trackId: track.id,
    trackName: track.name,
    trackIndex,
    clip,
    asset,
    text,
    enabledEffects,
    clipTime,
    localTime,
    mediaTime,
    style,
    visible,
    reason,
  };
}

function buildPreviewStyle(
  track: TimelineTrack,
  clip: TimelineClip,
  clipTime: number,
  audioDuckingContexts: AudioDuckingContext[],
): ProgramPreviewStyle {
  const motion = readClipMotionTransform(clip);
  const clipVolume = resolveClipNumericKeyframeValue(clip, 'volume', clipTime, clip.volume, { min: 0, max: 2, round: true });
  const effectGain = buildStaticAudioEffectGain(clip);
  const duckingGain = audioDuckingGainAt(clip, buildAudioDuckingIntervalsForClip(clip, audioDuckingContexts), clipTime);
  const transitionGain = audioTransitionGainAt(resolveClipAudioTransition(clip, track.clips), clipTime);

  return {
    opacity: resolveClipNumericKeyframeValue(clip, 'opacity', clipTime, clip.opacity, { min: 0, max: 1, round: true }),
    positionX: resolveClipNumericKeyframeValue(clip, 'positionX', clipTime, motion.positionX, { min: -200, max: 200, round: true }),
    positionY: resolveClipNumericKeyframeValue(clip, 'positionY', clipTime, motion.positionY, { min: -200, max: 200, round: true }),
    scale: resolveClipNumericKeyframeValue(clip, 'scale', clipTime, motion.scale, { min: 0.05, max: 8, round: true }),
    rotation: resolveClipNumericKeyframeValue(clip, 'rotation', clipTime, motion.rotation, { min: -360, max: 360, round: true }),
    volume: roundTime(clipVolume * effectGain * clipVolumeDbToGain(clip.volumeDb) * duckingGain * trackVolumeDbToGain(track.volumeDb) * transitionGain),
    pan: normalizeTrackPan(track.pan),
  };
}

function resolveLayerText(clip: TimelineClip, asset?: EditorAsset): string | undefined {
  if (asset?.kind === 'text') {
    return asset.source || clip.name;
  }

  if (clip.kind === 'text') {
    return clip.name;
  }

  if (asset?.kind === 'effect' || clip.kind === 'effect') {
    return clip.name;
  }

  return undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
