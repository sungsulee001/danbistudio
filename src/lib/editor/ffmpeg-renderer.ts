import { buildExportManifest } from './automation';
import { hasSupportedAiEnhancementEffect, readAiEnhancementPresetId, readAiModelEffectPass, type AiModelEffectPass } from './ai-effects';
import { buildFfmpegAudioCleanupFilters } from './audio-cleanup-effects';
import { buildClipWithAdjustmentEffects, isAdjustmentLayerClip, resolveAdjustmentEffectsForClip } from './adjustment-layer';
import { buildAudioDuckingIntervalsForClip, resolveAudioDuckingSettings, type AudioDuckingInterval } from './audio-ducking';
import { buildStaticAudioEffectGain, hasSupportedAudioEffect } from './audio-effect-gain';
import { resolveClipAudioTransition, type ResolvedAudioTransition } from './audio-transition';
import { clipVolumeDbToGain, normalizeTrackPan, trackVolumeDbToGain } from './audio-mixer';
import { captionColorToFfmpeg, normalizeCaptionRenderStyle } from './caption-style';
import { buildFfmpegChapterMetadata } from './chapter-metadata';
import { hasSupportedColorLutEffect, isColorLutEffect } from './color-lut';
import { getClipMediaSourceIn, getClipPlaybackSpeed, getClipSourceDuration } from './clip-timing';
import { defaultFfmpegEncoderPreference, selectFfmpegVideoEncoder, type FfmpegCapabilities, type FfmpegEncoderPreference, type FfmpegVideoEncoderSelection } from './ffmpeg-capabilities';
import { resolveMasterAudioSettings, truePeakDbToLinearLimit, type MasterAudioSettings } from './master-audio';
import { buildDefaultRenderOutputPath } from './render-output';
import { resolveRenderableAssetMediaKind, type RenderableAssetMediaKind } from './renderable-media-kind';
import { isCanvasLayoutEffect, readClipCanvasLayoutMode } from './canvas-layout';
import { hasSupportedCropMaskEffect, readCropMaskParameters } from './crop-mask';
import { findEnabledMotionTransformEffect, isMotionTransformEffect, readClipMotionTransform } from './motion-transform';
import { hasSupportedObjectMaskEffect, isObjectMaskEffect, readObjectMaskParameters } from './object-mask';
import { isTitleStyleEffect, readTitleStyle } from './title-style';
import { hasSpeedRamp, normalizeSpeedRampPoints } from './speed-ramp';
import { isTrackPlayableForDomain } from './track-playback';
import { hasSupportedVisualFilterEffect, readPrivacyBlurRegionAtTime, readVisualFilterPresetId } from './visual-effects';
import type { CaptionSegment, CaptionStyle, ClipEffect, EditorAsset, EditorProject, ExportProfile, TimelineClip, TimelineTrack, TimelineTransition } from './types';

export interface FfmpegRenderInput {
  index: number;
  assetId: string;
  clipId: string;
  source: string;
  kind: string;
  seekSeconds: number;
  durationSeconds: number;
}

export interface FfmpegRenderPlan {
  projectId: string;
  outputPath: string;
  profile: ExportProfile;
  exportRange?: {
    start: number;
    end: number;
    duration: number;
  };
  ffmpegPath: string;
  videoEncoder: FfmpegVideoEncoderSelection;
  inputs: FfmpegRenderInput[];
  chapterMetadata?: {
    inputIndex: number;
    path: string;
    content: string;
    chapterCount: number;
  };
  filterGraph: string[];
  command: string[];
  commandText: string;
  warnings: string[];
}

export interface FfmpegRenderPlanOptions {
  ffmpegPath?: string;
  encoderPreference?: FfmpegEncoderPreference;
  capabilities?: FfmpegCapabilities;
  exportRange?: {
    start: number;
    end: number;
  };
}

interface VisualClipContext {
  track: TimelineTrack;
  clip: TimelineClip;
  asset: EditorAsset;
  inputIndex: number;
}

interface TextClipContext {
  track: TimelineTrack;
  clip: TimelineClip;
  asset?: EditorAsset;
}

interface AudioClipContext {
  track: TimelineTrack;
  clip: TimelineClip;
  asset: EditorAsset;
  inputIndex: number;
}

type FfmpegRenderableAssetKind = RenderableAssetMediaKind;

interface VisualUnit {
  id: string;
  track: TimelineTrack;
  clips: TimelineClip[];
  label: string;
  start: number;
  end: number;
  blendMode: TimelineClip['blendMode'];
  opacity: number;
}

interface VisualBuildResult {
  filters: string[];
  units: VisualUnit[];
  warnings: string[];
}

export function buildFfmpegRenderPlan(
  project: EditorProject,
  profileId: string,
  outputPath: string | undefined = undefined,
  options: FfmpegRenderPlanOptions = {},
): FfmpegRenderPlan {
  const manifest = buildExportManifest(project, profileId, { exportRange: options.exportRange });
  const resolvedOutputPath = outputPath ?? buildDefaultRenderOutputPath(project, profileId);
  const ffmpegPath = options.ffmpegPath ?? readEnv('FFMPEG_PATH') ?? 'ffmpeg';
  const videoEncoder = selectFfmpegVideoEncoder(
    manifest.profile.codec,
    options.capabilities,
    options.encoderPreference ?? defaultFfmpegEncoderPreference(),
  );
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const inputClips = project.tracks
    .flatMap((track) => track.clips.map((clip) => ({ track, clip })))
    .filter(({ track, clip }) => (
      !track.muted &&
      !clip.muted &&
      clip.assetId &&
      clipOverlapsExportRange(clip, manifest.exportRange)
    ))
    .sort((a, b) => a.clip.start - b.clip.start);

  const inputs: FfmpegRenderInput[] = [];
  const filterGraph: string[] = [];
  const warnings: string[] = [...manifest.issues];
  const audioLabels: string[] = [];
  const videoClips: VisualClipContext[] = [];
  const textClips: TextClipContext[] = [];
  const audioClips: AudioClipContext[] = [];

  for (const { track, clip } of inputClips) {
    const asset = assetById.get(clip.assetId as string);
    if (!asset) {
      warnings.push(`${clip.name} references a missing asset.`);
      continue;
    }

    if (asset.kind === 'text' || clip.kind === 'text') {
      if (isTrackPlayableForDomain(track, project.tracks, 'visual')) {
        textClips.push({ track, clip, asset });
      }
      continue;
    }

    const renderKind = resolveFfmpegRenderableAssetKind(asset);
    if (!renderKind) {
      warnings.push(`${clip.name} is a ${asset.kind} asset and is not rendered by FFmpeg yet.`);
      continue;
    }

    const playsVisual = isTrackPlayableForDomain(track, project.tracks, 'visual');
    const playsAudio = isTrackPlayableForDomain(track, project.tracks, 'audio');
    const playsTimelineAudio = playsAudio && (clip.kind === 'audio' || renderKind === 'audio' || playsVisual);
    const needsVisualInput = (renderKind === 'video' || renderKind === 'image') && playsVisual;
    const needsAudioInput = clipHasRenderableTimelineAudio(clip, asset, renderKind) && playsTimelineAudio;
    if (!needsVisualInput && !needsAudioInput) {
      continue;
    }

    const source = getRenderSource(asset);
    if (!isRenderableSource(source)) {
      warnings.push(`${asset.name} uses ${source}; map it to a filesystem path before FFmpeg render.`);
    }

    const inputIndex = inputs.length;
    inputs.push({
      index: inputIndex,
      assetId: asset.id,
      clipId: clip.id,
      source,
      kind: renderKind,
      seekSeconds: getClipMediaSourceIn(asset, clip),
      durationSeconds: getInputDurationSeconds(asset, clip, renderKind),
    });

    if ((renderKind === 'audio' || (clip.kind === 'audio' && hasRenderableEmbeddedAudio(asset, renderKind))) && playsTimelineAudio) {
      audioClips.push({ track, clip, asset, inputIndex });
    } else if (renderKind === 'video' || renderKind === 'image') {
      if (playsVisual) {
        videoClips.push({ track, clip, asset, inputIndex });
      }
      if (clipHasRenderableTimelineAudio(clip, asset, renderKind) && playsTimelineAudio) {
        audioClips.push({ track, clip, asset, inputIndex });
      }
    }
  }

  for (const { track, clip, inputIndex } of audioClips) {
    const trackAudioClips = audioClips
      .filter((context) => context.track.id === track.id)
      .map((context) => context.clip);
    const clipFilters = buildAudioClipFilters(
      inputIndex,
      track,
      clip,
      project.duration,
      buildAudioDuckingIntervalsForClip(clip, audioClips),
      resolveClipAudioTransition(clip, trackAudioClips),
    );
    filterGraph.push(...clipFilters.filters);
    audioLabels.push(clipFilters.audioLabel);
  }

  const visualBuild = buildVisualUnits(project, videoClips, textClips, manifest.profile);
  filterGraph.push(...visualBuild.filters);
  warnings.push(...visualBuild.warnings);
  const masterAudioSettings = resolveMasterAudioSettings(project);

  const captionSegments = project.captions
    .filter((caption) => (
      caption.end > caption.start &&
      caption.text.trim().length > 0 &&
      captionOverlapsExportRange(caption, manifest.exportRange)
    ))
    .sort((a, b) => a.start - b.start);
  const hasVideoOutput = visualBuild.units.length > 0 || captionSegments.length > 0;
  const videoOutputLabel = manifest.exportRange ? '[vfull]' : '[vout]';
  const audioOutputLabel = manifest.exportRange ? '[afull]' : '[aout]';

  if (hasVideoOutput) {
    filterGraph.unshift(`color=c=black:s=${manifest.profile.width}x${manifest.profile.height}:r=${manifest.profile.fps}:d=${formatSeconds(project.duration)}[base0]`);
    if (visualBuild.units.length > 0) {
      filterGraph.push(...buildCompositeFilters(
        visualBuild.units,
        manifest.profile,
        project.duration,
        captionSegments.length > 0 ? '[vprecap]' : videoOutputLabel,
      ));
    }

    if (captionSegments.length > 0) {
      filterGraph.push(...buildCaptionBurnInFilters(
        captionSegments,
        manifest.profile,
        visualBuild.units.length > 0 ? '[vprecap]' : '[base0]',
        videoOutputLabel,
      ));
    }
  } else {
    warnings.push('No visual clips are available for FFmpeg video output.');
  }

  const audioDeliveryFilter = buildAudioDeliveryFormatFilter(manifest.profile);
  if (audioLabels.length === 1) {
    filterGraph.push(`${audioLabels[0]}${buildFinalAudioFilter(masterAudioSettings)}${audioDeliveryFilter}${audioOutputLabel}`);
  } else if (audioLabels.length > 1) {
    filterGraph.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0${buildFinalAudioFilter(masterAudioSettings, true)}${audioDeliveryFilter}${audioOutputLabel}`);
  }

  if (manifest.exportRange) {
    if (hasVideoOutput) {
      filterGraph.push(`${videoOutputLabel}trim=start=${formatSeconds(manifest.exportRange.start)}:end=${formatSeconds(manifest.exportRange.end)},setpts=PTS-STARTPTS[vout]`);
    }

    if (audioLabels.length > 0) {
      filterGraph.push(`${audioOutputLabel}atrim=start=${formatSeconds(manifest.exportRange.start)}:end=${formatSeconds(manifest.exportRange.end)},asetpts=PTS-STARTPTS[aout]`);
    }
  }

  if (project.tracks.filter((track) => track.kind === 'video').length > 1) {
    warnings.push('Multi-track video is composited by project track order; normal, screen, multiply, overlay, and add blend modes are supported.');
  }

  if (hasGaps(videoClips.map(({ clip }) => clip), project.duration, manifest.exportRange)) {
    warnings.push('Timeline gaps are rendered as black frames.');
  }

  if (hasUnsupportedTransitions(videoClips.map(({ clip }) => clip))) {
    warnings.push('Only cut, crossfade, dip, push, and wipe transitions are rendered by FFmpeg; match-cut and ai-morph require generated media.');
  }

  if (audioClips.some(({ clip }) => hasSpeedRamp(clip))) {
    warnings.push('Speed ramp video timing is rendered with variable setpts; ramped audio uses the average clip speed for FFmpeg atempo.');
  }

  if (videoEncoder.preference === 'auto' && !videoEncoder.hardware && videoEncoder.codec !== 'prores') {
    warnings.push(videoEncoder.reason);
  } else if (videoEncoder.preference !== 'software' && videoEncoder.reason.includes('falling back')) {
    warnings.push(videoEncoder.reason);
  }

  const maps = [
    ...(hasVideoOutput ? ['-map', '[vout]'] : []),
    ...(audioLabels.length > 0 ? ['-map', '[aout]'] : ['-an']),
  ];
  const chapterMetadataDocument = buildFfmpegChapterMetadata(project, {
    ...(manifest.exportRange ? { exportRange: manifest.exportRange } : {}),
  });
  const chapterMetadata = chapterMetadataDocument
    ? {
      inputIndex: inputs.length,
      path: buildChapterMetadataPath(resolvedOutputPath),
      content: chapterMetadataDocument.content,
      chapterCount: chapterMetadataDocument.chapters.length,
    }
    : undefined;
  if (chapterMetadataDocument) {
    warnings.push(...chapterMetadataDocument.warnings);
  }

  const command = [
    ffmpegPath,
    '-y',
    ...inputs.flatMap((input) => buildInputArgs(input)),
    ...(chapterMetadata ? ['-f', 'ffmetadata', '-i', chapterMetadata.path] : []),
    ...(filterGraph.length > 0 ? ['-filter_complex', filterGraph.join(';')] : []),
    ...maps,
    ...(chapterMetadata ? ['-map_metadata', String(chapterMetadata.inputIndex), '-map_chapters', String(chapterMetadata.inputIndex)] : []),
    '-r',
    String(manifest.profile.fps),
    '-c:v',
    videoEncoder.encoder,
    '-pix_fmt',
    pixelFormatForProfile(manifest.profile),
    ...buildVideoEncodingArgs(manifest.profile, videoEncoder),
    ...buildAudioEncodingArgs(manifest.profile),
    ...(manifest.profile.faststart ? ['-movflags', '+faststart'] : []),
    resolvedOutputPath,
  ];

  return {
    projectId: project.id,
    outputPath: resolvedOutputPath,
    profile: manifest.profile,
    ...(manifest.exportRange ? { exportRange: manifest.exportRange } : {}),
    ffmpegPath,
    videoEncoder,
    inputs,
    ...(chapterMetadata ? { chapterMetadata } : {}),
    filterGraph,
    command,
    commandText: command.map(quoteArg).join(' '),
    warnings: dedupe(warnings),
  };
}

export function isClipEffectRenderedByFfmpeg(
  clip: TimelineClip,
  asset: EditorAsset | undefined,
  effect: ClipEffect,
): boolean {
  if (!effect.enabled) {
    return true;
  }

  if (effect.type === 'motion') {
    return (isTextClip(clip, asset) && isTextMotionEffect(effect)) ||
      (isVisualMediaClip(clip, asset) && isMotionTransformEffect(effect));
  }

  if (effect.type === 'caption') {
    return isTextClip(clip, asset) && isTitleStyleEffect(effect);
  }

  if (effect.type === 'audio') {
    return isAudioClip(clip, asset) && hasSupportedAudioEffect(effect);
  }

  if (effect.type === 'color') {
    return (isVisualMediaClip(clip, asset) || isAdjustmentLayerClip(clip, asset)) && hasSupportedColorEffect(effect);
  }

  if (effect.type === 'mask') {
    return isVisualMediaClip(clip, asset) && hasSupportedMaskEffect(effect);
  }

  if (effect.type === 'reframe') {
    return isVisualMediaClip(clip, asset) && hasSupportedReframeEffect(effect);
  }

  if (effect.type === 'layout') {
    return isVisualMediaClip(clip, asset) && isCanvasLayoutEffect(effect);
  }

  if (effect.type === 'stabilize') {
    return isVisualMediaClip(clip, asset) && hasSupportedStabilizeEffect(effect);
  }

  if (effect.type === 'filter') {
    return (isVisualMediaClip(clip, asset) || isAdjustmentLayerClip(clip, asset)) && hasSupportedVisualFilterEffect(effect);
  }

  if (effect.type === 'ai') {
    return (isVisualMediaClip(clip, asset) || isAdjustmentLayerClip(clip, asset)) && hasSupportedAiEnhancementEffect(effect);
  }

  return false;
}

function buildAudioClipFilters(
  inputIndex: number,
  track: TimelineTrack,
  clip: TimelineClip,
  projectDuration: number,
  duckingIntervals: AudioDuckingInterval[] = [],
  transition: ResolvedAudioTransition = {},
): { filters: string[]; audioLabel: string } {
  const audioLabel = `[a${inputIndex}]`;
  const delayMs = Math.round(clip.start * 1000);
  const sourceDuration = getClipSourceDuration(clip);
  const volumeExpression = buildKeyframeExpression(clip, 'volume', clip.volume, 0, 2, 't');
  const renderedVolumeExpression = buildRenderedAudioVolumeExpression(clip, volumeExpression, duckingIntervals, transition);
  const trackVolumeExpression = buildTrackVolumeExpression(renderedVolumeExpression, track);
  const trackPanFilter = buildTrackPanFilter(track);
  const audioCleanupFilters = buildFfmpegAudioCleanupFilters(clip);
  const audioCleanupFilterText = audioCleanupFilters.length > 0 ? `,${audioCleanupFilters.join(',')}` : '';

  return {
    filters: [
      `[${inputIndex}:a]atrim=0:${formatSeconds(sourceDuration)}${buildAudioReverseFilter(clip)},asetpts=PTS-STARTPTS${buildAudioTempoFilters(clip)}${audioCleanupFilterText},volume='${trackVolumeExpression}':eval=frame${trackPanFilter},adelay=${delayMs}:all=1,apad,atrim=0:${formatSeconds(projectDuration)}${audioLabel}`,
    ],
    audioLabel,
  };
}

function buildVisualUnits(
  project: EditorProject,
  videoClips: VisualClipContext[],
  textClips: TextClipContext[],
  profile: ExportProfile,
): VisualBuildResult {
  const filters: string[] = [];
  const units: VisualUnit[] = [];
  const warnings: string[] = [];
  let unitIndex = 0;

  for (const track of project.tracks.filter((item) => (
    (item.kind === 'video' || item.kind === 'text') &&
    isTrackPlayableForDomain(item, project.tracks, 'visual')
  ))) {
    if (track.kind === 'text') {
      const contexts = textClips
        .filter((item) => item.track.id === track.id)
        .sort((a, b) => a.clip.start - b.clip.start);

      for (const context of contexts) {
        const unitId = `vunit${unitIndex}`;
        const unit = buildTextVisualUnit(unitId, context, profile);
        filters.push(...unit.filters);
        units.push(unit.unit);
        unitIndex += 1;
      }

      continue;
    }

    const trackContexts = videoClips
      .filter((item) => item.track.id === track.id)
      .sort((a, b) => a.clip.start - b.clip.start);
    for (const context of trackContexts) {
      warnings.push(...buildAdjustmentLayerRenderWarnings(project, context.clip, context.asset));
    }

    const contexts = trackContexts
      .map((item) => ({
        ...item,
        clip: buildClipWithAdjustmentEffects(project, item.clip, item.asset, 'overlap'),
      }))
      .sort((a, b) => a.clip.start - b.clip.start);

    let index = 0;
    while (index < contexts.length) {
      const group = [contexts[index]];

      while (index + 1 < contexts.length) {
        const current = group[group.length - 1];
        const next = contexts[index + 1];
        const spec = getXfadeSpec(current.clip, next.clip, group[0].clip.start);

        if (!spec) {
          if (current.clip.transitionOut && isXfadeTransition(current.clip.transitionOut)) {
            warnings.push(`${current.clip.name} -> ${next.clip.name} needs an overlap equal to the transition duration for xfade; alpha or cut fallback is used.`);
          }
          break;
        }

        if (!canShareCompositor(group[0].clip, next.clip)) {
          warnings.push(`${current.clip.name} -> ${next.clip.name} has different opacity or blend mode; alpha fallback is used instead of xfade.`);
          break;
        }

        group.push(next);
        index += 1;
      }

      const unitId = `vunit${unitIndex}`;
      const unit = group.length > 1
        ? buildXfadeVisualUnit(unitId, group, profile)
        : buildStandaloneVisualUnit(unitId, group[0], contexts, profile);

      filters.push(...unit.filters);
      units.push(unit.unit);
      unitIndex += 1;
      index += 1;
    }
  }

  return { filters, units, warnings };
}

function buildStandaloneVisualUnit(
  unitId: string,
  context: VisualClipContext,
  trackContexts: VisualClipContext[],
  profile: ExportProfile,
): { filters: string[]; unit: VisualUnit } {
  const label = `[${unitId}]`;
  const transition = resolveClipTransition(context.clip, trackContexts.map((item) => item.clip));

  return {
    filters: buildGlobalVisualClipFilters(context.inputIndex, context.clip, context.asset, profile, transition, label),
    unit: {
      id: unitId,
      track: context.track,
      clips: [context.clip],
      label,
      start: context.clip.start,
      end: context.clip.start + context.clip.duration,
      blendMode: context.clip.blendMode,
      opacity: clampRatio(context.clip.opacity),
    },
  };
}

function buildXfadeVisualUnit(
  unitId: string,
  contexts: VisualClipContext[],
  profile: ExportProfile,
): { filters: string[]; unit: VisualUnit } {
  const filters: string[] = [];
  const start = contexts[0].clip.start;
  const labels = contexts.map((context, index) => {
    const label = `[${unitId}c${index}]`;
    filters.push(buildNormalizedVisualClipFilter(context.inputIndex, context.clip, context.asset, profile, label));
    return label;
  });

  let currentLabel = labels[0];
  for (let index = 1; index < contexts.length; index += 1) {
    const previousClip = contexts[index - 1].clip;
    const nextClip = contexts[index].clip;
    const transition = previousClip.transitionOut as TimelineTransition;
    const spec = getXfadeSpec(previousClip, nextClip, start);
    const outputLabel = index === contexts.length - 1 ? `[${unitId}xf]` : `[${unitId}x${index}]`;

    if (!spec) {
      throw new Error(`Missing xfade spec for ${previousClip.id} -> ${nextClip.id}.`);
    }

    filters.push(`${currentLabel}${labels[index]}xfade=transition=${xfadeTransitionName(transition)}:duration=${formatSeconds(spec.duration)}:offset=${formatSeconds(spec.offset)}${outputLabel}`);
    currentLabel = outputLabel;
  }

  const finalLabel = `[${unitId}]`;
  filters.push(`${currentLabel}format=yuva420p,setpts=PTS-STARTPTS+${formatSeconds(start)}/TB${buildOpacityFilterForClip(contexts[0].clip, `(T-${formatSeconds(start)})`)}${finalLabel}`);

  return {
    filters,
    unit: {
      id: unitId,
      track: contexts[0].track,
      clips: contexts.map((context) => context.clip),
      label: finalLabel,
      start,
      end: Math.max(...contexts.map((context) => context.clip.start + context.clip.duration)),
      blendMode: contexts[0].clip.blendMode,
      opacity: clampRatio(contexts[0].clip.opacity),
    },
  };
}

function buildTextVisualUnit(
  unitId: string,
  context: TextClipContext,
  profile: ExportProfile,
): { filters: string[]; unit: VisualUnit } {
  const label = `[${unitId}]`;
  const text = resolveTextClipValue(context.clip, context.asset);
  const opacity = buildKeyframeExpression(context.clip, 'opacity', context.clip.opacity, 0, 1, 't');
  const style = readTitleStyle(context.clip, Math.max(18, Math.round(profile.height * 0.065)));
  const textPosition = buildTextPositionExpression(context.clip, 't', style);
  const drawTextOptions = [
    `text='${escapeDrawtextText(text)}'`,
    ...buildDrawtextFontOptions(),
    `fontcolor=${captionColorToFfmpeg(style.fontColor)}`,
    `fontsize=${Math.round(style.fontSize)}`,
    `box=${style.boxEnabled ? 1 : 0}`,
    ...buildDrawtextShadowOptions(style),
    `x='${textPosition.x}'`,
    `y='${textPosition.y}'`,
    `alpha='${opacity}'`,
  ];

  if (style.boxEnabled) {
    drawTextOptions.splice(4, 0,
      `boxcolor=${captionColorToFfmpeg(style.boxColor)}@${formatExpressionNumber(style.boxOpacity)}`,
      `boxborderw=${Math.round(style.fontSize * 0.32)}`,
    );
  }

  return {
    filters: [
      `color=c=black@0:s=${profile.width}x${profile.height}:r=${profile.fps}:d=${formatSeconds(context.clip.duration)},format=yuva420p,drawtext=${drawTextOptions.join(':')},setpts=PTS-STARTPTS+${formatSeconds(context.clip.start)}/TB${label}`,
    ],
    unit: {
      id: unitId,
      track: context.track,
      clips: [context.clip],
      label,
      start: context.clip.start,
      end: context.clip.start + context.clip.duration,
      blendMode: context.clip.blendMode,
      opacity: clampRatio(context.clip.opacity),
    },
  };
}

function buildAdjustmentLayerRenderWarnings(
  project: EditorProject,
  clip: TimelineClip,
  asset: EditorAsset,
): string[] {
  return resolveAdjustmentEffectsForClip(project, clip, asset, 'overlap')
    .filter((item) => {
      const presetId = readVisualFilterPresetId(item.effect);
      return presetId === 'pixelate-blocks' || presetId === 'optical-flow-blur';
    })
    .filter((item) => !adjustmentLayerFullyCoversClip(item.layerStart, item.layerEnd, clip))
    .map((item) => {
      const presetId = readVisualFilterPresetId(item.effect);
      const label = presetId === 'optical-flow-blur' ? 'Optical flow blur' : 'Pixelate';
      const reason = presetId === 'optical-flow-blur'
        ? 'FFmpeg minterpolate filters cannot be time-enabled'
        : 'FFmpeg scale filters cannot be time-enabled';
      return `${item.layerName} uses partial ${label} adjustment on ${clip.name}; ${reason}, so split the clip or extend the adjustment layer to cover the full clip before export.`;
    });
}

function buildGlobalVisualClipFilters(
  inputIndex: number,
  clip: TimelineClip,
  asset: EditorAsset,
  profile: ExportProfile,
  transition: ResolvedClipTransition,
  outputLabel: string,
): string[] {
  if (hasVisualTransforms(clip)) {
    return buildTransformedVisualClipFilters(inputIndex, clip, asset, profile, transition, outputLabel);
  }

  const fades = buildVideoFadeFilters(transition);

  return buildVisualModelPassChain({
    baseFilter: `[${inputIndex}:v]${buildVisualTimingFilter(asset, clip, profile, clip.start)},${buildCanvasScaleFilter(clip, profile)}${buildVisualEffectFilters(clip, profile, `(t-${formatSeconds(clip.start)})`)}`,
    clip,
    profile,
    outputLabel,
    labelPrefix: outputLabel.replace(/[[\]]/g, ''),
    timelineStart: clip.start,
    postFilters: `,format=yuva420p${fades}${buildOpacityFilterForClip(clip, `(T-${formatSeconds(clip.start)})`)}`,
  });
}

function buildTransformedVisualClipFilters(
  inputIndex: number,
  clip: TimelineClip,
  asset: EditorAsset,
  profile: ExportProfile,
  transition: ResolvedClipTransition,
  outputLabel: string,
): string[] {
  const prefix = outputLabel.replace(/[[\]]/g, '');
  const sourceLabel = `[${prefix}src]`;
  const transformedLabel = `[${prefix}xfm]`;
  const canvasLabel = `[${prefix}canvas]`;
  const localTime = `(t-${formatSeconds(clip.start)})`;
  const motion = readClipMotionTransform(clip);
  const positionX = buildKeyframeExpression(clip, 'positionX', motion.positionX, -200, 200, localTime);
  const positionY = buildKeyframeExpression(clip, 'positionY', motion.positionY, -200, 200, localTime);
  const scale = buildKeyframeExpression(clip, 'scale', motion.scale, 0.05, 8, localTime);
  const rotation = buildKeyframeExpression(clip, 'rotation', motion.rotation, -360, 360, localTime);
  const fades = buildVideoFadeFilters(transition);
  const delayExpression = buildSetptsExpression(asset, clip, clip.start);

  return [
    ...buildVisualModelPassChain({
      baseFilter: `[${inputIndex}:v]${buildVisualTimingFilter(asset, clip, profile, clip.start)},${buildCanvasScaleFilter(clip, profile)}${buildVisualEffectFilters(clip, profile, `(t-${formatSeconds(clip.start)})`)}`,
      clip,
      profile,
      outputLabel: sourceLabel,
      labelPrefix: `${prefix}model`,
      timelineStart: clip.start,
      postFilters: ',format=yuva420p',
    }),
    `${sourceLabel}scale=w='${profile.width}*(${scale})':h='${profile.height}*(${scale})':eval=frame,rotate='(${rotation})*0.017453292519943295':c=black@0:ow=rotw(iw):oh=roth(ih),format=yuva420p${transformedLabel}`,
    `color=c=black@0:s=${profile.width}x${profile.height}:r=${profile.fps}:d=${formatSeconds(clip.duration)},format=yuva420p,setpts=${delayExpression}${canvasLabel}`,
    `${canvasLabel}${transformedLabel}overlay=x='(W-w)/2+(${positionX})':y='(H-h)/2+(${positionY})':eval=frame:eof_action=pass,format=yuva420p${fades}${buildOpacityFilterForClip(clip, `(T-${formatSeconds(clip.start)})`)}${outputLabel}`,
  ];
}

function buildNormalizedVisualClipFilter(
  inputIndex: number,
  clip: TimelineClip,
  asset: EditorAsset,
  profile: ExportProfile,
  outputLabel: string,
): string {
  return buildVisualModelPassChain({
    baseFilter: `[${inputIndex}:v]${buildVisualTimingFilter(asset, clip, profile)},${buildCanvasScaleFilter(clip, profile)}${buildVisualEffectFilters(clip, profile, 't')}`,
    clip,
    profile,
    outputLabel,
    labelPrefix: outputLabel.replace(/[[\]]/g, ''),
    timelineStart: 0,
    postFilters: ',format=yuv420p',
  }).join(';');
}

function buildVisualModelPassChain(options: {
  baseFilter: string;
  clip: TimelineClip;
  profile: ExportProfile;
  outputLabel: string;
  labelPrefix: string;
  timelineStart: number;
  postFilters: string;
}): string[] {
  const passes = options.clip.effects
    .filter((effect) => effect.enabled && effect.type === 'ai')
    .map(readAiModelEffectPass)
    .filter((pass): pass is AiModelEffectPass => Boolean(pass));

  if (passes.length === 0) {
    return [`${options.baseFilter}${options.postFilters}${options.outputLabel}`];
  }

  const filters: string[] = [];
  let currentLabel = `[${options.labelPrefix}ai0]`;
  filters.push(`${options.baseFilter},format=yuva420p${currentLabel}`);

  passes.forEach((pass, index) => {
    const passLabel = `[${options.labelPrefix}aipass${index}]`;
    const nextLabel = `[${options.labelPrefix}ai${index + 1}]`;
    filters.push(buildAiModelPassMovieFilter(pass, options.clip, options.profile, options.timelineStart, passLabel));
    filters.push(`${currentLabel}${passLabel}${buildAiModelPassBlendFilter(pass)}${nextLabel}`);
    currentLabel = nextLabel;
  });

  filters.push(`${currentLabel}${options.postFilters}${options.outputLabel}`);
  return filters;
}

function buildAiModelPassMovieFilter(
  pass: AiModelEffectPass,
  clip: TimelineClip,
  profile: ExportProfile,
  timelineStart: number,
  outputLabel: string,
): string {
  const source = formatFfmpegFilterFilePath(pass.path);
  const duration = Math.max(0.001, Math.min(clip.duration, pass.duration ?? clip.duration));
  const timelineOffset = timelineStart > 0.001 ? `+${formatSeconds(timelineStart)}/TB` : '';
  const timing = pass.kind === 'image'
    ? `loop=loop=-1:size=1:start=0,trim=0:${formatSeconds(clip.duration)},setpts=PTS-STARTPTS${timelineOffset}`
    : `trim=0:${formatSeconds(duration)},setpts=PTS-STARTPTS${timelineOffset}`;
  const purposeFilters = buildAiModelPassPurposeFilters(pass);

  return [
    `movie='${source}'`,
    timing,
    `scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease`,
    `pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2:color=black@0`,
    'format=yuva420p',
    ...purposeFilters,
  ].join(',') + outputLabel;
}

function buildAiModelPassBlendFilter(pass: AiModelEffectPass): string {
  const opacity = formatExpressionNumber(clamp(pass.opacity * pass.strength, 0, 1));
  const mode = pass.blendMode === 'add' ? 'addition' : pass.blendMode;
  return `blend=all_mode=${mode}:all_opacity=${opacity}`;
}

function buildAiModelPassPurposeFilters(pass: AiModelEffectPass): string[] {
  if (pass.purpose === 'segmentation-matte') {
    const feather = clamp(pass.segmentationEdgeFeather ?? 0, 0, 32);
    return feather > 0.001 ? [`gblur=sigma=${formatExpressionNumber(feather)}`] : [];
  }

  if (pass.purpose === 'restoration' || pass.purpose === 'beauty-retouch') {
    const detail = clamp(pass.restorationDetail ?? 0, 0, 1);
    if (detail <= 0.001) {
      return [];
    }

    const guardedAmount = detail * (1 - clamp((pass.restorationTextureGuard ?? 0) * 0.45, 0, 0.45));
    return [buildUnsharpFilter(Math.min(0.75, guardedAmount * 0.45), 3)];
  }

  return [];
}

function buildVisualTimingFilter(
  asset: EditorAsset,
  clip: TimelineClip,
  profile: ExportProfile,
  timelineStart?: number,
): string {
  const renderKind = resolveFfmpegRenderableAssetKind(asset);
  const sourceDuration = getVisualSourceDuration(asset, clip);
  if (renderKind === 'video' && typeof clip.freezeFrameTime === 'number' && Number.isFinite(clip.freezeFrameTime)) {
    const speed = getClipPlaybackSpeed(clip);
    const frameDuration = roundSeconds(1 / profile.fps);
    const maxOffset = Math.max(0, sourceDuration - frameDuration);
    const freezeOffset = roundSeconds(clamp(clip.freezeFrameTime * speed, 0, maxOffset));
    const freezeEnd = roundSeconds(Math.min(sourceDuration, freezeOffset + frameDuration));
    const setpts = timelineStart === undefined
      ? 'PTS-STARTPTS'
      : `PTS-STARTPTS+${formatSeconds(timelineStart)}/TB`;

    return `trim=0:${formatSeconds(sourceDuration)}${buildVideoReverseFilter(asset, clip)},trim=start=${formatSeconds(freezeOffset)}:end=${formatSeconds(freezeEnd)},setpts=PTS-STARTPTS,loop=loop=-1:size=1:start=0,trim=0:${formatSeconds(clip.duration)},setpts=${setpts}`;
  }

  return `trim=0:${formatSeconds(sourceDuration)}${buildVideoReverseFilter(asset, clip)},setpts=${buildSetptsExpression(asset, clip, timelineStart)}`;
}

function buildVideoReverseFilter(asset: EditorAsset, clip: TimelineClip): string {
  return resolveFfmpegRenderableAssetKind(asset) === 'video' && clip.reversed ? ',reverse' : '';
}

function buildAudioReverseFilter(clip: TimelineClip): string {
  return clip.reversed ? ',areverse' : '';
}

function buildCanvasScaleFilter(clip: TimelineClip, profile: ExportProfile): string {
  const mode = readClipCanvasLayoutMode(clip);
  if (mode === 'fill') {
    return [
      buildSquarePixelCanvasScaleFilter(profile, 'fill'),
      `crop=${profile.width}:${profile.height}:(iw-${profile.width})/2:(ih-${profile.height})/2`,
      `fps=${profile.fps}`,
      'settb=AVTB',
    ].join(',');
  }

  if (mode === 'stretch') {
    return `scale=${profile.width}:${profile.height},setsar=1,fps=${profile.fps},settb=AVTB`;
  }

  return buildScaleFilter(profile);
}

function buildScaleFilter(profile: ExportProfile): string {
  return `${buildSquarePixelCanvasScaleFilter(profile, 'fit')},pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2:color=black@0,fps=${profile.fps},settb=AVTB`;
}

function buildSquarePixelCanvasScaleFilter(profile: ExportProfile, mode: 'fit' | 'fill'): string {
  const comparison = mode === 'fill' ? 'max' : 'min';
  const displayAspect = '(iw*sar/ih)';
  const width = `max(2\\,trunc(${comparison}(${profile.width}\\,${profile.height}*${displayAspect})/2)*2)`;
  const height = `max(2\\,trunc(${comparison}(${profile.height}\\,${profile.width}/${displayAspect})/2)*2)`;
  return `scale=w='${width}':h='${height}',setsar=1`;
}

function getInputDurationSeconds(asset: EditorAsset, clip: TimelineClip, renderKind = resolveFfmpegRenderableAssetKind(asset)): number {
  return renderKind === 'video' || renderKind === 'audio'
    ? getClipSourceDuration(clip)
    : clip.duration;
}

function getVisualSourceDuration(asset: EditorAsset, clip: TimelineClip): number {
  return resolveFfmpegRenderableAssetKind(asset) === 'video' ? getClipSourceDuration(clip) : clip.duration;
}

function buildSetptsExpression(
  asset: EditorAsset,
  clip: TimelineClip,
  timelineStart?: number,
): string {
  const renderKind = resolveFfmpegRenderableAssetKind(asset);
  if (renderKind === 'video' && hasSpeedRamp(clip)) {
    return buildSpeedRampSetptsExpression(clip, timelineStart);
  }

  const speed = renderKind === 'video' ? getClipPlaybackSpeed(clip) : 1;
  const base = Math.abs(speed - 1) < 0.001
    ? 'PTS-STARTPTS'
    : `(PTS-STARTPTS)/${formatExpressionNumber(speed)}`;

  return timelineStart === undefined ? base : `${base}+${formatSeconds(timelineStart)}/TB`;
}

function buildSpeedRampSetptsExpression(clip: TimelineClip, timelineStart?: number): string {
  const points = normalizeSpeedRampPoints(clip.speedRamp, clip.duration);
  if (points.length < 2) {
    const speed = getClipPlaybackSpeed(clip);
    return Math.abs(speed - 1) < 0.001
      ? 'PTS-STARTPTS'
      : `(PTS-STARTPTS)/${formatExpressionNumber(speed)}`;
  }

  const sourceTimeExpression = '((PTS-STARTPTS)*TB)';
  let sourceCursor = 0;
  const segments = points.slice(0, -1).map((point, index) => {
    const nextPoint = points[index + 1];
    const duration = Math.max(0.001, nextPoint.time - point.time);
    const acceleration = (nextPoint.speed - point.speed) / duration;
    const sourceStart = sourceCursor;
    const sourceEnd = sourceStart + point.speed * duration + 0.5 * acceleration * duration * duration;
    sourceCursor = sourceEnd;
    return {
      outputStart: point.time,
      speedStart: point.speed,
      acceleration,
      sourceStart,
      sourceEnd,
    };
  });

  const offset = timelineStart ?? 0;
  const buildLocalOutputExpression = (segment: typeof segments[number]) => {
    const sourceDelta = `((${sourceTimeExpression})-${formatExpressionNumber(segment.sourceStart)})`;
    if (Math.abs(segment.acceleration) < 0.001) {
      return `${formatExpressionNumber(offset + segment.outputStart)}+(${sourceDelta})/${formatExpressionNumber(segment.speedStart)}`;
    }

    const accelerationTerm = `${formatExpressionNumber(2 * segment.acceleration)}*(${sourceDelta})`;
    const radicand = segment.acceleration >= 0
      ? `${formatExpressionNumber(segment.speedStart * segment.speedStart)}+${accelerationTerm}`
      : `${formatExpressionNumber(segment.speedStart * segment.speedStart)}${accelerationTerm}`;
    return `${formatExpressionNumber(offset + segment.outputStart)}+((-${formatExpressionNumber(segment.speedStart)}+sqrt(${radicand}))/${formatExpressionNumber(segment.acceleration)})`;
  };

  let expression = buildLocalOutputExpression(segments[segments.length - 1]);
  for (let index = segments.length - 2; index >= 0; index -= 1) {
    const segment = segments[index];
    expression = `if(lte(${sourceTimeExpression},${formatExpressionNumber(segment.sourceEnd)}),${buildLocalOutputExpression(segment)},${expression})`;
  }

  return `'(${expression})/TB'`;
}

function buildAudioTempoFilters(clip: TimelineClip): string {
  let remaining = getClipPlaybackSpeed(clip);
  if (Math.abs(remaining - 1) < 0.001) {
    return '';
  }

  const factors: number[] = [];
  while (remaining < 0.5) {
    factors.push(0.5);
    remaining /= 0.5;
  }

  while (remaining > 2) {
    factors.push(2);
    remaining /= 2;
  }

  if (Math.abs(remaining - 1) >= 0.001) {
    factors.push(remaining);
  }

  return factors.length > 0
    ? `,${factors.map((factor) => `atempo=${formatExpressionNumber(factor)}`).join(',')}`
    : '';
}

/**
 * Delivery-format clamp for the mixed audio bus.
 *
 * Without it libavfilter negotiates amix down to the *narrowest* input format
 * (24 kHz mono TTS), which silently destroys the 44.1 kHz stereo BGM and the
 * 48 kHz stereo A2V dialogue before they ever reach the encoder. Constraining
 * the graph output propagates the format backwards, so the mix itself happens
 * at delivery spec. Emitted only for profiles that opt in.
 */
function buildAudioDeliveryFormatFilter(profile: ExportProfile): string {
  const constraints: string[] = ['sample_fmts=fltp'];
  if (profile.audioSampleRate !== undefined) {
    constraints.push(`sample_rates=${Math.round(profile.audioSampleRate)}`);
  }
  if (profile.audioChannels !== undefined) {
    constraints.push(`channel_layouts=${profile.audioChannels >= 2 ? 'stereo' : 'mono'}`);
  }
  if (constraints.length === 1) {
    return '';
  }
  return `,aformat=${constraints.join(':')}`;
}

function buildFinalAudioFilter(settings: MasterAudioSettings, appended = false): string {
  const filters = [
    settings.loudnessLufs === undefined
      ? undefined
      : `loudnorm=I=${formatExpressionNumber(settings.loudnessLufs)}:TP=${formatExpressionNumber(settings.truePeakDb ?? -1.5)}:LRA=11`,
    // `level` 은 alimiter의 **auto level** 옵션이고 기본값이 true다. 켜져 있으면 리미팅 뒤에
    // 출력을 1/limit 배로 되올려 0 dBFS 기준으로 재정규화하므로 `limit`이 사실상 무효가 된다
    // (실측: limit=0.841 지정에도 산출 최대치가 0.0 dBFS · 0dB 샘플 17,787개 · 트루피크 +0.38 dBTP).
    // 마스터 단의 리미터는 천장을 지키는 것이 목적이므로 auto level을 반드시 끈다.
    settings.truePeakDb === undefined
      ? undefined
      : `alimiter=limit=${formatExpressionNumber(truePeakDbToLinearLimit(settings.truePeakDb))}:level=disabled`,
  ].filter((filter): filter is string => Boolean(filter));

  if (filters.length === 0) {
    return appended ? '' : 'anull';
  }

  const filter = filters.join(',');
  return appended ? `,${filter}` : filter;
}

function buildRenderedAudioVolumeExpression(
  clip: TimelineClip,
  volumeExpression: string,
  duckingIntervals: AudioDuckingInterval[],
  transition: ResolvedAudioTransition,
): string {
  const multipliers = [
    formatExpressionNumber(buildStaticAudioEffectGain(clip)),
    // 클립 단위 게인(dB) — 선형 volume(0~2)이 담지 못하는 넓은 편차를 그래프에 반영한다.
    formatExpressionNumber(clipVolumeDbToGain(clip.volumeDb)),
    buildDuckingVolumeExpression(clip, duckingIntervals),
    buildAudioTransitionMultiplierExpression(transition),
  ].filter((expression): expression is string => Boolean(expression) && expression !== '1');

  return multipliers.reduce((expression, multiplier) => `(${expression})*(${multiplier})`, volumeExpression);
}

function buildAudioTransitionMultiplierExpression(transition: ResolvedAudioTransition): string | undefined {
  const expressions = [
    transition.fadeIn ? buildAudioFadeExpression(transition.fadeIn.start, transition.fadeIn.duration, 'in') : undefined,
    transition.fadeOut ? buildAudioFadeExpression(transition.fadeOut.start, transition.fadeOut.duration, 'out') : undefined,
  ].filter((expression): expression is string => Boolean(expression));

  if (expressions.length === 0) {
    return undefined;
  }

  return expressions.reduce((expression, multiplier) => `(${expression})*(${multiplier})`);
}

function buildAudioFadeExpression(start: number, duration: number, direction: 'in' | 'out'): string {
  const safeStart = formatExpressionNumber(Math.max(0, start));
  const safeDuration = formatExpressionNumber(Math.max(0.001, duration));
  const end = formatExpressionNumber(Math.max(0, start) + Math.max(0.001, duration));

  if (direction === 'in') {
    return `if(lt(t,${safeStart}),0,if(gt(t,${end}),1,(t-${safeStart})/${safeDuration}))`;
  }

  return `if(lt(t,${safeStart}),1,if(gt(t,${end}),0,1-((t-${safeStart})/${safeDuration})))`;
}

function buildTrackVolumeExpression(volumeExpression: string, track: TimelineTrack): string {
  const gain = trackVolumeDbToGain(track.volumeDb);
  if (Math.abs(gain - 1) < 0.001) {
    return volumeExpression;
  }

  return `(${volumeExpression})*${formatExpressionNumber(gain)}`;
}

function buildTrackPanFilter(track: TimelineTrack): string {
  const pan = normalizeTrackPan(track.pan);
  if (Math.abs(pan) < 0.01) {
    return '';
  }

  return `,aformat=channel_layouts=stereo,stereotools=balance_in=${formatExpressionNumber(pan)}`;
}

function buildDuckingVolumeExpression(
  clip: TimelineClip,
  intervals: AudioDuckingInterval[],
): string {
  const settings = resolveAudioDuckingSettings(clip);
  if (!settings || intervals.length === 0) {
    return '1';
  }

  const factor = formatExpressionNumber(settings.factor);

  return intervals
    .slice()
    .reverse()
    .reduce((fallback, interval) => buildDuckingIntervalExpression(interval, factor, settings.attackSeconds, settings.releaseSeconds, fallback), '1');
}

function buildDuckingIntervalExpression(
  interval: AudioDuckingInterval,
  factor: string,
  attackSeconds: number,
  releaseSeconds: number,
  fallback: string,
): string {
  const start = formatExpressionNumber(interval.start);
  const end = formatExpressionNumber(interval.end);
  let expression = fallback;

  if (releaseSeconds > 0.001) {
    const releaseEnd = formatExpressionNumber(interval.end + releaseSeconds);
    const release = `${factor}+(1-${factor})*((t-${end})/${formatExpressionNumber(releaseSeconds)})`;
    expression = `if(between(t,${end},${releaseEnd}),${release},${expression})`;
  }

  expression = `if(between(t,${start},${end}),${factor},${expression})`;

  if (attackSeconds > 0.001 && interval.start > 0.001) {
    const attackStart = formatExpressionNumber(Math.max(0, interval.start - attackSeconds));
    const attackDuration = formatExpressionNumber(interval.start - Number(attackStart));
    const attack = `1+(${factor}-1)*((t-${attackStart})/${attackDuration})`;
    expression = `if(between(t,${attackStart},${start}),${attack},${expression})`;
  }

  return expression;
}

function buildVisualEffectFilters(clip: TimelineClip, profile: ExportProfile, localTimeExpression: string): string {
  const stabilizeFilters = clip.effects
    .filter((effect) => effect.enabled && effect.type === 'stabilize' && hasSupportedStabilizeEffect(effect))
    .map(buildStabilizeFilter);

  const reframeFilters = clip.effects
    .filter((effect) => effect.enabled && effect.type === 'reframe' && hasSupportedReframeEffect(effect))
    .map((effect) => buildSmartReframeFilter(effect, profile, clip, localTimeExpression));

  const maskFilters = clip.effects
    .filter((effect) => effect.enabled && effect.type === 'mask' && hasSupportedMaskEffect(effect))
    .map((effect) => buildMaskFilter(effect, profile, clip, localTimeExpression))
    .filter(Boolean);

  const visualFilterFilters = clip.effects
    .filter((effect) => effect.enabled && effect.type === 'filter' && hasSupportedVisualFilterEffect(effect))
    .map((effect) => buildVisualFilterEffectFilter(effect, profile, clip, localTimeExpression))
    .filter(Boolean);

  const aiFilters = clip.effects
    .filter((effect) => effect.enabled && effect.type === 'ai' && hasSupportedAiEnhancementEffect(effect))
    .map((effect) => buildAiEnhancementFilter(effect, clip, localTimeExpression))
    .filter(Boolean);

  const colorFilters = clip.effects
    .filter((effect) => effect.enabled && effect.type === 'color' && hasSupportedColorEffect(effect))
    .map((effect) => buildColorEffectFilter(effect, clip, localTimeExpression))
    .filter(Boolean);
  const filters = [...stabilizeFilters, ...reframeFilters, ...maskFilters, ...visualFilterFilters, ...aiFilters, ...colorFilters];

  return filters.length > 0 ? `,${filters.join(',')}` : '';
}

function buildAdjustmentEnableOption(effect: ClipEffect, clip: TimelineClip, localTimeExpression: string): string {
  const timing = readAdjustmentTiming(effect, clip);
  if (!timing) {
    return '';
  }

  return `:enable='between(${localTimeExpression},${formatExpressionNumber(timing.startLocal)},${formatExpressionNumber(timing.endLocal)})'`;
}

function hasPartialAdjustmentTiming(effect: ClipEffect, clip: TimelineClip): boolean {
  const timing = readAdjustmentTiming(effect, clip);
  return Boolean(timing && !timing.fullClip);
}

function readAdjustmentTiming(
  effect: ClipEffect,
  clip: TimelineClip,
): { startLocal: number; endLocal: number; fullClip: boolean } | undefined {
  const layerStart = getNumericParameter(effect, 'adjustmentLayerStart');
  const layerEnd = getNumericParameter(effect, 'adjustmentLayerEnd');
  if (layerStart === undefined || layerEnd === undefined || layerEnd <= layerStart) {
    return undefined;
  }

  const startLocal = clamp(layerStart - clip.start, 0, clip.duration);
  const endLocal = clamp(layerEnd - clip.start, 0, clip.duration);
  if (endLocal <= startLocal + 0.001) {
    return undefined;
  }

  return {
    startLocal,
    endLocal,
    fullClip: adjustmentLayerFullyCoversClip(layerStart, layerEnd, clip),
  };
}

function adjustmentLayerFullyCoversClip(layerStart: number, layerEnd: number, clip: TimelineClip): boolean {
  return layerStart <= clip.start + 0.001 &&
    layerEnd >= clip.start + clip.duration - 0.001;
}

function buildVisualFilterEffectFilter(effect: ClipEffect, profile: ExportProfile, clip: TimelineClip, localTimeExpression: string): string {
  const presetId = readVisualFilterPresetId(effect);
  const enable = buildAdjustmentEnableOption(effect, clip, localTimeExpression);

  switch (presetId) {
    case 'blur-soft': {
      const radius = readNumericParameter(effect, 'blurRadius', 4, 0, 32);
      if (radius <= 0.001) {
        return '';
      }

      const chromaRadius = Math.max(1, radius * 0.5);
      return `boxblur=luma_radius=${formatExpressionNumber(radius)}:luma_power=1:chroma_radius=${formatExpressionNumber(chromaRadius)}:chroma_power=1${enable}`;
    }
    case 'sharpen-crisp': {
      const sharpenAmount = readNumericParameter(effect, 'sharpenAmount', 0.65, 0, 1.5);
      const sharpenRadius = readNumericParameter(effect, 'sharpenRadius', 5, 3, 9);
      return buildUnsharpFilter(sharpenAmount, sharpenRadius, enable);
    }
    case 'vignette-focus': {
      const vignetteStrength = readNumericParameter(effect, 'vignetteStrength', 0.35, 0, 1);
      return buildVignetteFilter(vignetteStrength, enable);
    }
    case 'soft-glow': {
      const glowRadius = readNumericParameter(effect, 'glowRadius', 2.5, 0, 16);
      const glowIntensity = readNumericParameter(effect, 'glowIntensity', 0.22, 0, 1);
      const glowSaturation = readNumericParameter(effect, 'glowSaturation', 1.08, 0, 4);
      const glowFilters = [
        glowRadius > 0.001
          ? `gblur=sigma=${formatExpressionNumber(glowRadius)}:steps=2${enable}`
          : '',
        glowIntensity > 0.001 || Math.abs(glowSaturation - 1) > 0.001
          ? `eq=brightness=${formatExpressionNumber(glowIntensity * 0.08)}:contrast=${formatExpressionNumber(1 + (glowIntensity * 0.12))}:saturation=${formatExpressionNumber(glowSaturation)}${enable}`
          : '',
      ].filter(Boolean);

      return glowFilters.join(',');
    }
    case 'advanced-bloom': {
      const bloomRadius = readNumericParameter(effect, 'bloomRadius', 6, 0, 32);
      const bloomIntensity = readNumericParameter(effect, 'bloomIntensity', 0.34, 0, 1);
      const bloomThreshold = readNumericParameter(effect, 'bloomThreshold', 0.72, 0.1, 0.98);
      const bloomSaturation = readNumericParameter(effect, 'bloomSaturation', 1.18, 0, 4);
      if (bloomIntensity <= 0.001 && Math.abs(bloomSaturation - 1) <= 0.001) {
        return '';
      }

      const shadowHold = Math.max(0.05, bloomThreshold - 0.18);
      const highlightLift = clamp(bloomThreshold + (bloomIntensity * 0.16), 0.1, 1);
      const detailAmount = bloomIntensity * 0.22;
      return [
        `curves=master='0/0 ${formatExpressionNumber(shadowHold)}/${formatExpressionNumber(shadowHold)} ${formatExpressionNumber(bloomThreshold)}/${formatExpressionNumber(highlightLift)} 1/1':interp=pchip${enable}`,
        bloomRadius > 0.001
          ? `gblur=sigma=${formatExpressionNumber(bloomRadius)}:steps=2${enable}`
          : '',
        `eq=brightness=${formatExpressionNumber(bloomIntensity * 0.035)}:contrast=${formatExpressionNumber(1 + (bloomIntensity * 0.18))}:saturation=${formatExpressionNumber(bloomSaturation)}${enable}`,
        detailAmount > 0.001
          ? buildUnsharpFilter(detailAmount, 5, enable)
          : '',
      ].filter(Boolean).join(',');
    }
    case 'motion-trails': {
      const trailFrames = Math.round(readNumericParameter(effect, 'trailFrames', 5, 2, 12));
      const trailDecay = readNumericParameter(effect, 'trailDecay', 0.65, 0.1, 1);
      const weights = buildMotionTrailWeights(trailFrames, trailDecay);
      const scale = weights.reduce((total, weight) => total + weight, 0);
      return `tmix=frames=${trailFrames}:weights='${weights.map(formatExpressionNumber).join(' ')}':scale=${formatExpressionNumber(scale)}${enable}`;
    }
    case 'optical-flow-blur': {
      if (hasPartialAdjustmentTiming(effect, clip)) {
        return '';
      }

      const flowFrames = Math.round(readNumericParameter(effect, 'flowBlurFrames', 3, 2, 6));
      const flowStrength = readNumericParameter(effect, 'flowBlurStrength', 0.58, 0.05, 1);
      const flowSearchParam = Math.round(readNumericParameter(effect, 'flowSearchParam', 24, 4, 128));
      const interpolationFps = formatExpressionNumber(clamp(profile.fps * 2, profile.fps, 120));
      const weights = buildMotionTrailWeights(flowFrames, flowStrength);
      const scale = weights.reduce((total, weight) => total + weight, 0);
      return `minterpolate=fps=${interpolationFps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:me=epzs:search_param=${flowSearchParam}:vsbmc=1,tmix=frames=${flowFrames}:weights='${weights.map(formatExpressionNumber).join(' ')}':scale=${formatExpressionNumber(scale)},fps=${formatExpressionNumber(profile.fps)}`;
    }
    case 'pixelate-blocks': {
      if (hasPartialAdjustmentTiming(effect, clip)) {
        return '';
      }

      const pixelSize = Math.round(readNumericParameter(effect, 'pixelSize', 12, 4, 80));
      return `scale=iw/${pixelSize}:ih/${pixelSize}:flags=neighbor,scale=${profile.width}:${profile.height}:flags=neighbor`;
    }
    case 'film-grain': {
      const grainStrength = Math.round(readNumericParameter(effect, 'grainStrength', 12, 0, 100));
      if (grainStrength <= 0) {
        return '';
      }

      const grainSeed = Math.round(readNumericParameter(effect, 'grainSeed', 19, 0, 2147483647));
      return `noise=alls=${grainStrength}:allf=t+u:all_seed=${grainSeed}${enable}`;
    }
    case 'green-screen-key': {
      const keyColor = formatChromaKeyColor(readStringParameter(effect, 'keyColor'));
      const similarity = readNumericParameter(effect, 'keySimilarity', 0.18, 0.01, 1);
      const blend = readNumericParameter(effect, 'keyBlend', 0.08, 0, 1);
      return `format=rgba,chromakey=color=${keyColor}:similarity=${formatExpressionNumber(similarity)}:blend=${formatExpressionNumber(blend)}${enable},format=yuva420p`;
    }
    case 'privacy-blur': {
      const region = buildPrivacyBlurRegionExpressions(effect, profile, clip, localTimeExpression);
      return `delogo=x='${region.x}':y='${region.y}':w=${region.width}:h=${region.height}:show=0${enable}`;
    }
    default:
      return '';
  }
}

function buildMotionTrailWeights(frameCount: number, decay: number): number[] {
  const normalizedFrameCount = Math.round(clamp(frameCount, 2, 12));
  const normalizedDecay = clamp(decay, 0.1, 1);
  const weights: number[] = [];

  for (let index = 0; index < normalizedFrameCount; index += 1) {
    weights.push(Math.pow(normalizedDecay, index));
  }

  return weights;
}

function buildPrivacyBlurRegionExpressions(
  effect: ClipEffect,
  profile: ExportProfile,
  clip: TimelineClip,
  localTimeExpression: string,
): { x: string; y: string; width: number; height: number } {
  const staticRegion = readPrivacyBlurRegionAtTime(effect, 0, clip.duration);
  const width = Math.max(8, Math.min(profile.width, Math.round(staticRegion.width * profile.width)));
  const height = Math.max(8, Math.min(profile.height, Math.round(staticRegion.height * profile.height)));
  const centerX = buildTrackedPrivacyBlurExpression(effect, 'X', staticRegion.centerX, clip.duration, localTimeExpression);
  const centerY = buildTrackedPrivacyBlurExpression(effect, 'Y', staticRegion.centerY, clip.duration, localTimeExpression);
  const halfWidth = formatExpressionNumber(width / 2);
  const halfHeight = formatExpressionNumber(height / 2);
  const maxX = formatExpressionNumber(Math.max(0, profile.width - width));
  const maxY = formatExpressionNumber(Math.max(0, profile.height - height));

  return {
    x: `min(max(0,(${centerX})*${profile.width}-${halfWidth}),${maxX})`,
    y: `min(max(0,(${centerY})*${profile.height}-${halfHeight}),${maxY})`,
    width,
    height,
  };
}

function buildTrackedPrivacyBlurExpression(
  effect: ClipEffect,
  axis: 'X' | 'Y',
  fallback: number,
  clipDuration: number,
  localTimeExpression: string,
): string {
  const start = readNumericParameter(effect, `regionStart${axis}`, fallback, 0, 1);
  const mid = readNumericParameter(effect, `regionMid${axis}`, fallback, 0, 1);
  const end = readNumericParameter(effect, `regionEnd${axis}`, fallback, 0, 1);
  const midTime = readNumericParameter(effect, 'regionMidTime', clipDuration / 2, 0, Math.max(0.001, clipDuration));
  const duration = readNumericParameter(effect, 'regionEndTime', clipDuration, Math.max(0.001, midTime), Math.max(0.001, clipDuration));
  const startText = formatExpressionNumber(start);
  const midText = formatExpressionNumber(mid);
  const endText = formatExpressionNumber(end);
  const midTimeText = formatExpressionNumber(midTime);
  const durationText = formatExpressionNumber(duration);
  const safeMidTimeText = formatExpressionNumber(Math.max(0.001, midTime));
  const secondDurationText = formatExpressionNumber(Math.max(0.001, duration - midTime));
  const firstRatio = `min(1,max(0,(${localTimeExpression})/${safeMidTimeText}))`;
  const secondRatio = `min(1,max(0,((${localTimeExpression})-${midTimeText})/${secondDurationText}))`;
  const first = `(${startText}+(${formatExpressionNumber(mid - start)})*${firstRatio})`;
  const second = `(${midText}+(${formatExpressionNumber(end - mid)})*${secondRatio})`;

  return `if(lte(${localTimeExpression},${midTimeText}),${first},if(gte(${localTimeExpression},${durationText}),${endText},${second}))`;
}

function formatChromaKeyColor(value: string | undefined): string {
  if (!value) {
    return '0x00ff00';
  }

  const trimmed = value.trim().toLowerCase();
  if (/^0x[0-9a-f]{6}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^#[0-9a-f]{6}$/.test(trimmed)) {
    return `0x${trimmed.slice(1)}`;
  }

  return '0x00ff00';
}

function buildAiEnhancementFilter(effect: ClipEffect, clip: TimelineClip, localTimeExpression: string): string {
  const presetId = readAiEnhancementPresetId(effect);
  const enable = buildAdjustmentEnableOption(effect, clip, localTimeExpression);

  switch (presetId) {
    case 'denoise-sharpen': {
      const denoiseStrength = readNumericParameter(effect, 'denoiseStrength', 3, 0, 12);
      const sharpenAmount = readNumericParameter(effect, 'sharpenAmount', 0.75, 0, 1.5);
      const sharpenRadius = readNumericParameter(effect, 'sharpenRadius', 5, 3, 9);
      return [
        buildHqdn3dFilter(denoiseStrength, enable),
        buildUnsharpFilter(sharpenAmount, sharpenRadius, enable),
      ].filter(Boolean).join(',');
    }
    case 'cinematic-pop': {
      const brightness = readNumericParameter(effect, 'brightness', 0.01, -1, 1);
      const contrast = readNumericParameter(effect, 'contrast', 1.12, 0, 4);
      const saturation = readNumericParameter(effect, 'saturation', 1.08, 0, 4);
      const gamma = readNumericParameter(effect, 'gamma', 0.98, 0.1, 10);
      const sharpenAmount = readNumericParameter(effect, 'sharpenAmount', 0.25, 0, 1.5);
      const vignetteStrength = readNumericParameter(effect, 'vignetteStrength', 0.22, 0, 1);
      return [
        `eq=brightness=${formatExpressionNumber(brightness)}:contrast=${formatExpressionNumber(contrast)}:saturation=${formatExpressionNumber(saturation)}:gamma=${formatExpressionNumber(gamma)}${enable}`,
        buildUnsharpFilter(sharpenAmount, 3, enable),
        buildVignetteFilter(vignetteStrength, enable),
      ].filter(Boolean).join(',');
    }
    case 'portrait-focus': {
      const focusStrength = readNumericParameter(effect, 'focusStrength', 0.32, 0, 1);
      const contrast = readNumericParameter(effect, 'contrast', 1.05, 0, 4);
      const saturation = readNumericParameter(effect, 'saturation', 1.03, 0, 4);
      const sharpenAmount = readNumericParameter(effect, 'sharpenAmount', 0.35, 0, 1.5);
      const vignetteStrength = readNumericParameter(effect, 'vignetteStrength', 0.18, 0, 1);
      return [
        `eq=brightness=0:contrast=${formatExpressionNumber(contrast + (focusStrength * 0.04))}:saturation=${formatExpressionNumber(saturation)}:gamma=1${enable}`,
        buildUnsharpFilter(Math.min(1.5, sharpenAmount + (focusStrength * 0.35)), 5, enable),
        buildVignetteFilter(vignetteStrength + (focusStrength * 0.12), enable),
      ].filter(Boolean).join(',');
    }
    case 'deband-clean': {
      const debandStrength = readNumericParameter(effect, 'debandStrength', 0.018, 0.001, 0.1);
      const debandRange = Math.round(readNumericParameter(effect, 'debandRange', 16, 1, 64));
      const denoiseStrength = readNumericParameter(effect, 'denoiseStrength', 1.5, 0, 12);
      const sharpenAmount = readNumericParameter(effect, 'sharpenAmount', 0.2, 0, 1.5);
      return [
        `deband=1thr=${formatExpressionNumber(debandStrength)}:2thr=${formatExpressionNumber(debandStrength)}:3thr=${formatExpressionNumber(debandStrength)}:4thr=${formatExpressionNumber(debandStrength)}:range=${debandRange}:blur=1${enable}`,
        buildHqdn3dFilter(denoiseStrength, enable),
        buildUnsharpFilter(sharpenAmount, 3, enable),
      ].filter(Boolean).join(',');
    }
    default:
      return '';
  }
}

function buildHqdn3dFilter(strength: number, enable = ''): string {
  if (strength <= 0.001) {
    return '';
  }

  return [
    'hqdn3d=',
    formatExpressionNumber(strength),
    ':',
    formatExpressionNumber(strength * 0.75),
    ':',
    formatExpressionNumber(strength * 1.5),
    ':',
    formatExpressionNumber(strength * 1.1),
    enable,
  ].join('');
}

function buildUnsharpFilter(amount: number, radius: number, enable = ''): string {
  if (amount <= 0.001) {
    return '';
  }

  const kernelSize = normalizeOddKernelSize(radius);
  const chromaAmount = formatExpressionNumber(Math.min(1.5, amount * 0.45));
  return `unsharp=${kernelSize}:${kernelSize}:${formatExpressionNumber(amount)}:3:3:${chromaAmount}${enable}`;
}

function buildVignetteFilter(strength: number, enable = ''): string {
  if (strength <= 0.001) {
    return '';
  }

  const angle = formatExpressionNumber(clamp(strength * 2.2, 0.05, 1.2));
  return `vignette=angle=${angle}:eval=init${enable}`;
}

function normalizeOddKernelSize(value: number): number {
  const rounded = Math.round(clamp(value, 3, 9));
  const odd = rounded % 2 === 1 ? rounded : rounded + 1;
  return Math.min(9, Math.max(3, odd));
}

function buildStabilizeFilter(effect: ClipEffect): string {
  const radius = Math.round(readNumericParameter(effect, 'radius', 16, 0, 64));
  const blockSize = Math.round(readNumericParameter(effect, 'blockSize', 16, 4, 128));
  const contrast = Math.round(readNumericParameter(effect, 'stabilizeContrast', 125, 1, 255));

  return `deshake=rx=${radius}:ry=${radius}:edge=mirror:blocksize=${blockSize}:contrast=${contrast}`;
}

function buildMaskFilter(effect: ClipEffect, profile: ExportProfile, clip: TimelineClip, localTimeExpression: string): string {
  if (isObjectMaskEffect(effect)) {
    return buildObjectMaskFilter(effect, clip, localTimeExpression);
  }

  return buildMaskCropFilter(effect, profile);
}

function buildMaskCropFilter(effect: ClipEffect, profile: ExportProfile): string {
  const { left, right, top, bottom } = readCropMaskParameters(effect);

  if (left + right + top + bottom <= 0.001) {
    return '';
  }

  const widthRatio = formatExpressionNumber(Math.max(0.05, 1 - left - right));
  const heightRatio = formatExpressionNumber(Math.max(0.05, 1 - top - bottom));

  return `crop=w='iw*${widthRatio}':h='ih*${heightRatio}':x='iw*${formatExpressionNumber(left)}':y='ih*${formatExpressionNumber(top)}',${buildScaleFilter(profile)}`;
}

function buildObjectMaskFilter(effect: ClipEffect, clip: TimelineClip, localTimeExpression: string): string {
  const parameters = readObjectMaskParameters(effect);
  const centerX = parameters.trackingEnabled
    ? buildTrackedObjectMaskExpression(effect, 'X', parameters.centerX, clip.duration, localTimeExpression)
    : formatExpressionNumber(parameters.centerX);
  const centerY = parameters.trackingEnabled
    ? buildTrackedObjectMaskExpression(effect, 'Y', parameters.centerY, clip.duration, localTimeExpression)
    : formatExpressionNumber(parameters.centerY);
  const halfWidth = formatExpressionNumber(Math.max(0.025, parameters.width / 2));
  const halfHeight = formatExpressionNumber(Math.max(0.025, parameters.height / 2));
  const maskExpression = parameters.shape === 'rectangle'
    ? buildRectangleObjectMaskExpression(centerX, centerY, halfWidth, halfHeight)
    : buildEllipseObjectMaskExpression(centerX, centerY, halfWidth, halfHeight, parameters.feather);
  const alphaExpression = parameters.invert
    ? `alpha(X,Y)*(1-(${maskExpression}))`
    : `alpha(X,Y)*(${maskExpression})`;

  return `format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alphaExpression}',format=yuva420p`;
}

function buildEllipseObjectMaskExpression(centerX: string, centerY: string, halfWidth: string, halfHeight: string, feather: number): string {
  const distance = `sqrt(pow((X-W*(${centerX}))/(max(1,W*${halfWidth})),2)+pow((Y-H*(${centerY}))/(max(1,H*${halfHeight})),2))`;
  if (feather <= 0.001) {
    return `if(lte(${distance},1),1,0)`;
  }

  const featherText = formatExpressionNumber(feather);
  const inner = formatExpressionNumber(Math.max(0, 1 - feather));
  return `if(lte(${distance},${inner}),1,if(lte(${distance},1),max(0,min(1,(1-${distance})/${featherText})),0))`;
}

function buildRectangleObjectMaskExpression(centerX: string, centerY: string, halfWidth: string, halfHeight: string): string {
  const left = `W*((${centerX})-${halfWidth})`;
  const right = `W*((${centerX})+${halfWidth})`;
  const top = `H*((${centerY})-${halfHeight})`;
  const bottom = `H*((${centerY})+${halfHeight})`;

  return `(gte(X,${left})*lte(X,${right})*gte(Y,${top})*lte(Y,${bottom}))`;
}

function buildSmartReframeFilter(effect: ClipEffect, profile: ExportProfile, clip: TimelineClip, localTimeExpression: string): string {
  const targetAspect = readNumericParameter(effect, 'targetAspect', profile.width / profile.height, 0.1, 10);
  const focalX = readNumericParameter(effect, 'focalX', 0.5, 0, 1);
  const focalY = readNumericParameter(effect, 'focalY', 0.5, 0, 1);
  const zoom = readNumericParameter(effect, 'zoom', 1, 1, 4);
  const xExpression = effect.parameters.trackingEnabled === true
    ? buildTrackedFocalExpression(effect, 'X', focalX, clip.duration, localTimeExpression)
    : formatExpressionNumber(focalX);
  const yExpression = effect.parameters.trackingEnabled === true
    ? buildTrackedFocalExpression(effect, 'Y', focalY, clip.duration, localTimeExpression)
    : formatExpressionNumber(focalY);
  const aspect = formatExpressionNumber(targetAspect);
  const zoomText = formatExpressionNumber(zoom);
  const baseWidth = `if(gt(iw/ih,${aspect}),ih*${aspect},iw)`;
  const baseHeight = `if(gt(iw/ih,${aspect}),ih,iw/${aspect})`;
  const cropWidth = `(${baseWidth})/${zoomText}`;
  const cropHeight = `(${baseHeight})/${zoomText}`;

  return `crop=w='${cropWidth}':h='${cropHeight}':x='(iw-${cropWidth})*(${xExpression})':y='(ih-${cropHeight})*(${yExpression})',${buildScaleFilter(profile)}`;
}

function buildTrackedFocalExpression(
  effect: ClipEffect,
  axis: 'X' | 'Y',
  fallback: number,
  clipDuration: number,
  localTimeExpression: string,
): string {
  const start = readNumericParameter(effect, `focal${axis}Start`, fallback, 0, 1);
  const mid = readNumericParameter(effect, `focal${axis}Mid`, fallback, 0, 1);
  const end = readNumericParameter(effect, `focal${axis}End`, fallback, 0, 1);
  const midTime = readNumericParameter(effect, 'trackingMidTime', clipDuration / 2, 0, Math.max(0.001, clipDuration));
  const duration = readNumericParameter(effect, 'trackingDuration', clipDuration, Math.max(0.001, midTime), Math.max(0.001, clipDuration));
  const startText = formatExpressionNumber(start);
  const midText = formatExpressionNumber(mid);
  const endText = formatExpressionNumber(end);
  const midTimeText = formatExpressionNumber(midTime);
  const durationText = formatExpressionNumber(duration);
  const firstRatio = `min(1,max(0,(${localTimeExpression})/${midTimeText}))`;
  const secondRatio = `min(1,max(0,((${localTimeExpression})-${midTimeText})/${formatExpressionNumber(Math.max(0.001, duration - midTime))}))`;
  const first = `(${startText}+(${formatExpressionNumber(mid - start)})*${firstRatio})`;
  const second = `(${midText}+(${formatExpressionNumber(end - mid)})*${secondRatio})`;

  return `if(lte(${localTimeExpression},${midTimeText}),${first},if(gte(${localTimeExpression},${durationText}),${endText},${second}))`;
}

function buildTrackedObjectMaskExpression(
  effect: ClipEffect,
  axis: 'X' | 'Y',
  fallback: number,
  clipDuration: number,
  localTimeExpression: string,
): string {
  const start = readNumericParameter(effect, `center${axis}Start`, fallback, 0, 1);
  const mid = readNumericParameter(effect, `center${axis}Mid`, fallback, 0, 1);
  const end = readNumericParameter(effect, `center${axis}End`, fallback, 0, 1);
  const midTime = readNumericParameter(effect, 'trackingMidTime', clipDuration / 2, 0, Math.max(0.001, clipDuration));
  const duration = readNumericParameter(effect, 'trackingDuration', clipDuration, Math.max(0.001, midTime), Math.max(0.001, clipDuration));
  const startText = formatExpressionNumber(start);
  const midText = formatExpressionNumber(mid);
  const endText = formatExpressionNumber(end);
  const midTimeText = formatExpressionNumber(midTime);
  const durationText = formatExpressionNumber(duration);
  const firstRatio = `min(1,max(0,(${localTimeExpression})/${midTimeText}))`;
  const secondRatio = `min(1,max(0,((${localTimeExpression})-${midTimeText})/${formatExpressionNumber(Math.max(0.001, duration - midTime))}))`;
  const first = `(${startText}+(${formatExpressionNumber(mid - start)})*${firstRatio})`;
  const second = `(${midText}+(${formatExpressionNumber(end - mid)})*${secondRatio})`;

  return `if(lte(${localTimeExpression},${midTimeText}),${first},if(gte(${localTimeExpression},${durationText}),${endText},${second}))`;
}

function buildColorBalanceFilter(temperature: number, tint: number, enable = ''): string {
  if (Math.abs(temperature) < 0.001 && Math.abs(tint) < 0.001) {
    return '';
  }

  const redShift = formatExpressionNumber(temperature * 0.08);
  const blueShift = formatExpressionNumber(-temperature * 0.08);
  const greenShift = formatExpressionNumber(tint * 0.06);

  return [
    `colorbalance=rs=${redShift}`,
    `gs=${greenShift}`,
    `bs=${blueShift}`,
    `rm=${redShift}`,
    `gm=${greenShift}`,
    `bm=${blueShift}`,
    `rh=${redShift}`,
    `gh=${greenShift}`,
    `bh=${blueShift}`,
    ...(enable ? [enable.startsWith(':') ? enable.slice(1) : enable] : []),
  ].join(':');
}

function buildColorEffectFilter(effect: ClipEffect, clip: TimelineClip, localTimeExpression: string): string {
  const hasBaseGrade = getNumericParameter(effect, 'brightness') !== undefined ||
    getNumericParameter(effect, 'contrast') !== undefined ||
    getNumericParameter(effect, 'saturation') !== undefined ||
    getNumericParameter(effect, 'gamma') !== undefined;
  const brightness = readNumericParameter(effect, 'brightness', 0, -1, 1);
  const contrast = readNumericParameter(effect, 'contrast', 1, 0, 4);
  const saturation = readNumericParameter(effect, 'saturation', 1, 0, 4);
  const gamma = readNumericParameter(effect, 'gamma', 1, 0.1, 10);
  const temperature = readNumericParameter(effect, 'temperature', 0, -1, 1);
  const tint = readNumericParameter(effect, 'tint', 0, -1, 1);
  const enable = buildAdjustmentEnableOption(effect, clip, localTimeExpression);

  return [
    hasBaseGrade
      ? `eq=brightness=${formatExpressionNumber(brightness)}:contrast=${formatExpressionNumber(contrast)}:saturation=${formatExpressionNumber(saturation)}:gamma=${formatExpressionNumber(gamma)}${enable}`
      : '',
    buildColorBalanceFilter(temperature, tint, enable),
    buildColorCurveFilter(effect, enable),
    buildColorLutFilter(effect, enable),
  ].filter(Boolean).join(',');
}

function buildColorCurveFilter(effect: ClipEffect, enable = ''): string {
  const hasCurve = getNumericParameter(effect, 'curveShadow') !== undefined ||
    getNumericParameter(effect, 'curveMid') !== undefined ||
    getNumericParameter(effect, 'curveHighlight') !== undefined;

  if (!hasCurve) {
    return '';
  }

  const shadow = readNumericParameter(effect, 'curveShadow', 0.25, 0, 0.98);
  const mid = readNumericParameter(effect, 'curveMid', 0.5, shadow + 0.01, 0.99);
  const highlight = readNumericParameter(effect, 'curveHighlight', 0.75, mid + 0.01, 1);

  return [
    'curves=',
    `master='0/0 0.25/${formatExpressionNumber(shadow)} 0.5/${formatExpressionNumber(mid)} 0.75/${formatExpressionNumber(highlight)} 1/1'`,
    ':interp=pchip',
    enable,
  ].join('');
}

function buildColorLutFilter(effect: ClipEffect, enable = ''): string {
  if (!hasSupportedColorLutEffect(effect)) {
    return '';
  }

  const lutPath = readStringParameter(effect, 'lutPath');
  if (!lutPath) {
    return '';
  }

  const interpolation = normalizeLutInterpolation(readStringParameter(effect, 'lutInterpolation'));
  return `lut3d=file='${formatFfmpegFilterFilePath(lutPath)}':interp=${interpolation}${enable}`;
}

function normalizeLutInterpolation(value: string | undefined): string {
  return value === 'nearest' ||
    value === 'trilinear' ||
    value === 'pyramid' ||
    value === 'prism' ||
    value === 'tetrahedral'
    ? value
    : 'tetrahedral';
}

function formatFfmpegFilterFilePath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
}

function buildTextPositionExpression(
  clip: TimelineClip,
  localTimeExpression: string,
  style: Required<CaptionStyle>,
): { x: string; y: string } {
  const baseX = buildCaptionXExpression(style.align);
  const baseY = buildCaptionYExpression(style.position);
  const effect = clip.effects.find((item) => item.enabled && item.type === 'motion' && isTextMotionEffect(item));

  if (!effect) {
    return { x: baseX, y: baseY };
  }

  const distance = readNumericParameter(effect, 'distance', 32, 0, 800);
  const duration = readNumericParameter(effect, 'duration', Math.min(0.7, Math.max(0.05, clip.duration)), 0.05, Math.max(0.05, clip.duration));
  const remaining = buildMotionRemainingExpression(localTimeExpression, duration, readStringParameter(effect, 'easing'));
  const offset = `${formatExpressionNumber(distance)}*${remaining}`;

  switch (readStringParameter(effect, 'direction')) {
    case 'right':
      return { x: `${baseX}+${offset}`, y: baseY };
    case 'up':
      return { x: baseX, y: `${baseY}-${offset}` };
    case 'down':
      return { x: baseX, y: `${baseY}+${offset}` };
    default:
      return { x: `${baseX}-${offset}`, y: baseY };
  }
}

function buildMotionRemainingExpression(
  localTimeExpression: string,
  duration: number,
  easing?: string,
): string {
  const progress = `min(1,max(0,(${localTimeExpression})/${formatExpressionNumber(duration)}))`;

  if (easing === 'easeOut') {
    return `pow(1-${progress},3)`;
  }

  if (easing === 'easeIn') {
    return `(1-pow(${progress},3))`;
  }

  if (easing === 'easeInOut' || easing === 'smooth') {
    return `(1-(3*pow(${progress},2)-2*pow(${progress},3)))`;
  }

  return `(1-${progress})`;
}

function isTextClip(clip: TimelineClip, asset?: EditorAsset): boolean {
  return clip.kind === 'text' || asset?.kind === 'text';
}

function isAudioClip(clip: TimelineClip, asset?: EditorAsset): boolean {
  return clipHasRenderableTimelineAudio(clip, asset);
}

function isVisualMediaClip(clip: TimelineClip, asset?: EditorAsset): boolean {
  const renderKind = resolveFfmpegRenderableAssetKind(asset);
  return clip.kind === 'video' || clip.kind === 'image' || renderKind === 'video' || renderKind === 'image';
}

function clipHasRenderableTimelineAudio(
  clip: TimelineClip,
  asset?: EditorAsset,
  renderKind = resolveFfmpegRenderableAssetKind(asset),
): boolean {
  if (!asset) {
    return false;
  }

  if (renderKind === 'audio') {
    return true;
  }

  if (!hasRenderableEmbeddedAudio(asset, renderKind)) {
    return false;
  }

  return clip.kind === 'audio' || !clip.automationTags.includes('embedded-audio:disabled');
}

function hasRenderableEmbeddedAudio(
  asset?: EditorAsset,
  renderKind = resolveFfmpegRenderableAssetKind(asset),
): boolean {
  return renderKind === 'video' && asset?.metadata?.hasAudio === true;
}

function isTextMotionEffect(effect: ClipEffect): boolean {
  const label = effect.label.toLowerCase();
  return effect.id.toLowerCase().includes('slide') ||
    label.includes('slide') ||
    effect.parameters.distance !== undefined ||
    effect.parameters.direction !== undefined ||
    effect.parameters.duration !== undefined ||
    effect.parameters.easing !== undefined;
}

function hasSupportedColorEffect(effect: ClipEffect): boolean {
  if (isColorLutEffect(effect)) {
    return hasSupportedColorLutEffect(effect);
  }

  return getNumericParameter(effect, 'brightness') !== undefined ||
    getNumericParameter(effect, 'contrast') !== undefined ||
    getNumericParameter(effect, 'saturation') !== undefined ||
    getNumericParameter(effect, 'gamma') !== undefined ||
    getNumericParameter(effect, 'temperature') !== undefined ||
    getNumericParameter(effect, 'tint') !== undefined ||
    getNumericParameter(effect, 'curveShadow') !== undefined ||
    getNumericParameter(effect, 'curveMid') !== undefined ||
    getNumericParameter(effect, 'curveHighlight') !== undefined;
}

function hasSupportedMaskEffect(effect: ClipEffect): boolean {
  return hasSupportedCropMaskEffect(effect) || hasSupportedObjectMaskEffect(effect);
}

function hasSupportedReframeEffect(effect: ClipEffect): boolean {
  return getNumericParameter(effect, 'targetAspect') !== undefined ||
    getNumericParameter(effect, 'focalX') !== undefined ||
    getNumericParameter(effect, 'focalY') !== undefined ||
    getNumericParameter(effect, 'zoom') !== undefined;
}

function hasSupportedStabilizeEffect(effect: ClipEffect): boolean {
  return getNumericParameter(effect, 'radius') !== undefined ||
    getNumericParameter(effect, 'blockSize') !== undefined ||
    getNumericParameter(effect, 'stabilizeContrast') !== undefined;
}

function readNumericParameter(
  effect: ClipEffect,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  return clamp(getNumericParameter(effect, key) ?? fallback, min, max);
}

function getNumericParameter(effect: ClipEffect, key: string): number | undefined {
  const value = effect.parameters[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringParameter(effect: ClipEffect, key: string): string | undefined {
  const value = effect.parameters[key];
  return typeof value === 'string' ? value : undefined;
}

function buildCompositeFilters(
  units: VisualUnit[],
  profile: ExportProfile,
  projectDuration: number,
  finalOutputLabel = '[vout]',
): string[] {
  const filters: string[] = [];
  let baseLabel = '[base0]';

  units.forEach((unit, index) => {
    const outputLabel = index === units.length - 1 ? finalOutputLabel : `[base${index + 1}]`;
    filters.push(...buildCompositeFilter(baseLabel, unit, outputLabel, profile, projectDuration, index));
    baseLabel = outputLabel;
  });

  return filters;
}

function buildCaptionBurnInFilters(
  captions: CaptionSegment[],
  profile: ExportProfile,
  inputLabel: string,
  outputLabel: string,
): string[] {
  let currentLabel = inputLabel;

  return captions.map((caption, index) => {
    const nextLabel = index === captions.length - 1 ? outputLabel : `[caption${index}]`;
    const style = normalizeCaptionRenderStyle(caption, profile);
    const text = escapeDrawtextText(formatCaptionText(caption));
    const options = [
      `text='${text}'`,
      ...buildDrawtextFontOptions(),
      `fontcolor=${captionColorToFfmpeg(style.fontColor)}`,
      `fontsize=${Math.round(style.fontSize)}`,
      `box=${style.boxEnabled ? 1 : 0}`,
      ...buildDrawtextShadowOptions(style),
      `x=${buildCaptionXExpression(style.align)}`,
      `y=${buildCaptionYExpression(style.position)}`,
      `enable='between(t,${formatSeconds(caption.start)},${formatSeconds(caption.end)})'`,
    ];

    if (style.boxEnabled) {
      options.splice(4, 0,
        `boxcolor=${captionColorToFfmpeg(style.boxColor)}@${formatExpressionNumber(style.boxOpacity)}`,
        `boxborderw=${Math.round(style.fontSize * 0.35)}`,
      );
    }

    const filter = `${currentLabel}drawtext=${options.join(':')}${nextLabel}`;
    currentLabel = nextLabel;
    return filter;
  });
}

let cachedDefaultDrawtextFontFile: string | null | undefined;

/**
 * drawtext는 fontfile 미지정 시 fontconfig 기본 폰트로 폴백하는데, Windows FFmpeg 빌드의
 * 기본 폰트는 한글 글리프가 없어 CJK 텍스트가 tofu(□)로 렌더된다. 캡션/타이틀 스타일
 * 스키마에는 폰트 필드가 없으므로, Node 렌더 컨텍스트에서만 CJK 커버리지가 있는 시스템
 * 폰트(맑은 고딕)를 기본 폴백으로 지정한다. DANBI_CAPTION_FONT_FILE 환경 변수가 있으면
 * 그것이 우선한다. 브라우저 번들에서는 항상 no-op(기존 동작 유지).
 */
function resolveDefaultDrawtextFontFile(): string | undefined {
  if (cachedDefaultDrawtextFontFile !== undefined) {
    return cachedDefaultDrawtextFontFile ?? undefined;
  }

  cachedDefaultDrawtextFontFile = null;
  if (typeof process !== 'undefined' && process.versions?.node) {
    const override = process.env?.DANBI_CAPTION_FONT_FILE?.trim();
    if (override) {
      cachedDefaultDrawtextFontFile = override;
    } else if (process.platform === 'win32') {
      cachedDefaultDrawtextFontFile = `${process.env?.WINDIR ?? 'C:\\Windows'}\\Fonts\\malgun.ttf`;
    }
  }

  return cachedDefaultDrawtextFontFile ?? undefined;
}

function buildDrawtextFontOptions(): string[] {
  const fontFile = resolveDefaultDrawtextFontFile();
  if (!fontFile) {
    return [];
  }

  return [`fontfile='${escapeDrawtextText(fontFile.replace(/\\/g, '/'))}'`];
}

function buildDrawtextShadowOptions(style: Required<CaptionStyle>): string[] {
  if (!style.shadowEnabled || style.shadowOpacity <= 0 || style.shadowOffset <= 0) {
    return [];
  }

  const offset = Math.round(style.shadowOffset);
  return [
    `shadowcolor=${captionColorToFfmpeg(style.shadowColor)}@${formatExpressionNumber(style.shadowOpacity)}`,
    `shadowx=${offset}`,
    `shadowy=${offset}`,
  ];
}

function buildCaptionXExpression(align: 'left' | 'center' | 'right'): string {
  switch (align) {
    case 'left':
      return 'w*0.08';
    case 'right':
      return 'w-text_w-(w*0.08)';
    default:
      return '(w-text_w)/2';
  }
}

function buildCaptionYExpression(position: 'top' | 'middle' | 'bottom'): string {
  switch (position) {
    case 'top':
      return 'h*0.12';
    case 'middle':
      return '(h-text_h)/2';
    default:
      return 'h-(text_h*2.4)';
  }
}

function buildCompositeFilter(
  baseLabel: string,
  unit: VisualUnit,
  outputLabel: string,
  profile: ExportProfile,
  projectDuration: number,
  index: number,
): string[] {
  const enabled = `between(t,${formatSeconds(unit.start)},${formatSeconds(unit.end)})`;

  if (unit.blendMode === 'normal') {
    return [
      `${baseLabel}${unit.label}overlay=0:0:eof_action=pass:enable='${enabled}'${outputLabel}`,
    ];
  }

  const neutralLabel = `[blendneutral${index}]`;
  const stagedLabel = `[blendstage${index}]`;

  return [
    `color=c=${blendNeutralColor(unit.blendMode)}:s=${profile.width}x${profile.height}:r=${profile.fps}:d=${formatSeconds(projectDuration)}${neutralLabel}`,
    `${neutralLabel}${unit.label}overlay=0:0:eof_action=pass:enable='${enabled}'${stagedLabel}`,
    `${baseLabel}${stagedLabel}blend=all_mode=${ffmpegBlendMode(unit.blendMode)}${outputLabel}`,
  ];
}

function buildInputArgs(input: FfmpegRenderInput): string[] {
  if (input.kind === 'image') {
    return [
      '-loop',
      '1',
      '-t',
      formatSeconds(input.durationSeconds),
      '-i',
      input.source,
    ];
  }

  return [
    '-ss',
    formatSeconds(input.seekSeconds),
    '-t',
    formatSeconds(input.durationSeconds),
    '-i',
    input.source,
  ];
}

function buildVideoEncodingArgs(profile: ExportProfile, videoEncoder: FfmpegVideoEncoderSelection): string[] {
  if (profile.codec === 'prores') {
    return [
      '-profile:v',
      '3',
      '-vendor',
      'apl0',
    ];
  }

  const bitrate = `${profile.videoBitrateMbps}M`;
  const canUseSoftwarePreset = !videoEncoder.hardware && (videoEncoder.encoder === 'libx264' || videoEncoder.encoder === 'libx265');
  const args: string[] = [];

  if (profile.h264Profile && profile.codec === 'h264') {
    args.push('-profile:v', profile.h264Profile);
  }

  if (profile.gopSize !== undefined) {
    args.push('-g', String(Math.round(profile.gopSize)), '-keyint_min', String(Math.round(profile.gopSize)));
  }

  if (canUseSoftwarePreset && profile.ffmpegPreset) {
    args.push('-preset', profile.ffmpegPreset);
  }

  if (canUseSoftwarePreset && profile.crf !== undefined) {
    args.push(
      '-crf',
      String(clamp(profile.crf, 0, 51)),
      '-maxrate',
      bitrate,
      '-bufsize',
      `${Math.max(1, profile.videoBitrateMbps * 2)}M`,
    );
    return args;
  }

  return [
    ...args,
    '-b:v',
    bitrate,
  ];
}

function pixelFormatForProfile(profile: ExportProfile): string {
  return profile.codec === 'prores' ? 'yuv422p10le' : 'yuv420p';
}

function buildAudioEncodingArgs(profile: ExportProfile): string[] {
  if (profile.codec === 'prores' && profile.container === 'mov') {
    return [
      '-c:a',
      'pcm_s16le',
    ];
  }

  if (profile.container === 'webm') {
    return [
      '-c:a',
      'libopus',
      '-b:a',
      `${profile.audioBitrateKbps}k`,
    ];
  }

  return [
    '-c:a',
    'aac',
    '-b:a',
    `${profile.audioBitrateKbps}k`,
    ...(profile.audioSampleRate === undefined ? [] : ['-ar', String(Math.round(profile.audioSampleRate))]),
    ...(profile.audioChannels === undefined ? [] : ['-ac', String(Math.round(profile.audioChannels))]),
  ];
}

function getRenderSource(asset: EditorAsset): string {
  return asset.renderPath || asset.source;
}

function resolveFfmpegRenderableAssetKind(asset?: EditorAsset): FfmpegRenderableAssetKind | undefined {
  return resolveRenderableAssetMediaKind(asset);
}

function buildChapterMetadataPath(outputPath: string): string {
  return `${outputPath}.ffmetadata`;
}

function resolveTextClipValue(clip: TimelineClip, asset?: EditorAsset): string {
  const text = asset?.source || clip.name;
  return normalizeMultilineText(text) || clip.name || 'Title';
}

function formatCaptionText(caption: CaptionSegment): string {
  const text = normalizeMultilineText(caption.text);
  const speaker = caption.speaker?.trim();
  if (!speaker) {
    return text || 'Caption';
  }

  return `${speaker}: ${text || 'Caption'}`;
}

function escapeDrawtextText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/%/g, '\\%')
    .replace(/\r?\n/g, '\\n');
}

function normalizeMultilineText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/[ \t]+/g, ' '))
    .filter(Boolean)
    .join('\n');
}

function isRenderableSource(source: string): boolean {
  return !source.startsWith('blob:') && !source.startsWith('local://') && source.length > 0;
}

function formatSeconds(value: number): string {
  return Math.max(0, Math.round(value * 1000) / 1000).toString();
}

function formatRatio(value: number): string {
  return clampRatio(value).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function quoteArg(value: string): string {
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

function clipOverlapsExportRange(
  clip: TimelineClip,
  range?: FfmpegRenderPlan['exportRange'],
): boolean {
  if (!range) {
    return true;
  }

  return clip.start < range.end && clip.start + clip.duration > range.start;
}

function captionOverlapsExportRange(
  caption: CaptionSegment,
  range?: FfmpegRenderPlan['exportRange'],
): boolean {
  if (!range) {
    return true;
  }

  return caption.start < range.end && caption.end > range.start;
}

function hasGaps(
  clips: TimelineClip[],
  duration: number,
  range?: FfmpegRenderPlan['exportRange'],
): boolean {
  const start = range?.start ?? 0;
  const end = range?.end ?? duration;
  const sorted = clips
    .filter((clip) => clip.start < end && clip.start + clip.duration > start)
    .sort((a, b) => a.start - b.start);
  let cursor = start;

  for (const clip of sorted) {
    const clipStart = Math.max(start, clip.start);
    const clipEnd = Math.min(end, clip.start + clip.duration);
    if (clipStart > cursor + 0.001) {
      return true;
    }

    cursor = Math.max(cursor, clipEnd);
  }

  return cursor < end - 0.001;
}

interface ResolvedClipTransition {
  fadeIn?: { start: number; duration: number };
  fadeOut?: { start: number; duration: number };
}

function resolveClipTransition(clip: TimelineClip, clips: TimelineClip[]): ResolvedClipTransition {
  const sorted = [...clips].sort((a, b) => a.start - b.start);
  const index = sorted.findIndex((item) => item.id === clip.id);
  const previousClip = index > 0 ? sorted[index - 1] : undefined;
  const transition: ResolvedClipTransition = {};

  if (previousClip?.transitionOut && canAlphaFadeTransition(previousClip.transitionOut)) {
    const duration = clampTransitionDuration(previousClip.transitionOut.duration, previousClip, clip);
    const fadeStart = Math.max(clip.start, previousClip.start + previousClip.duration - duration);
    transition.fadeIn = {
      start: fadeStart,
      duration,
    };
  }

  if (clip.transitionOut && canAlphaFadeTransition(clip.transitionOut)) {
    const nextClip = index >= 0 ? sorted[index + 1] : undefined;
    const duration = nextClip
      ? clampTransitionDuration(clip.transitionOut.duration, clip, nextClip)
      : Math.min(clip.transitionOut.duration, clip.duration);

    transition.fadeOut = {
      start: Math.max(clip.start, clip.start + clip.duration - duration),
      duration,
    };
  }

  return transition;
}

function clampTransitionDuration(duration: number, fromClip: TimelineClip, toClip: TimelineClip): number {
  const maxDuration = Math.max(0.05, Math.min(duration, fromClip.duration, toClip.duration));
  return Math.round(maxDuration * 1000) / 1000;
}

function buildVideoFadeFilters(transition: ResolvedClipTransition): string {
  const filters: string[] = [];

  if (transition.fadeIn) {
    filters.push(`fade=t=in:st=${formatSeconds(transition.fadeIn.start)}:d=${formatSeconds(transition.fadeIn.duration)}:alpha=1`);
  }

  if (transition.fadeOut) {
    filters.push(`fade=t=out:st=${formatSeconds(transition.fadeOut.start)}:d=${formatSeconds(transition.fadeOut.duration)}:alpha=1`);
  }

  return filters.length > 0 ? `,${filters.join(',')}` : '';
}

function hasVisualTransforms(clip: TimelineClip): boolean {
  return Boolean(findEnabledMotionTransformEffect(clip)) || clip.keyframes.some((keyframe) => (
    keyframe.property === 'positionX' ||
    keyframe.property === 'positionY' ||
    keyframe.property === 'scale' ||
    keyframe.property === 'rotation'
  ));
}

function buildKeyframeExpression(
  clip: TimelineClip,
  property: TimelineClip['keyframes'][number]['property'],
  fallback: number,
  min: number,
  max: number,
  timeExpression: string,
): string {
  const frames = clip.keyframes
    .filter((keyframe) => keyframe.property === property && typeof keyframe.value === 'number' && Number.isFinite(keyframe.value))
    .map((keyframe) => ({
      time: roundSeconds(Math.max(0, keyframe.time)),
      value: clamp(Number(keyframe.value), min, max),
      easing: keyframe.easing,
    }))
    .sort((a, b) => a.time - b.time);

  if (frames.length === 0) {
    return formatExpressionNumber(clamp(fallback, min, max));
  }

  if (frames.length === 1) {
    return formatExpressionNumber(frames[0].value);
  }

  let expression = formatExpressionNumber(frames[frames.length - 1].value);
  for (let index = frames.length - 1; index > 0; index -= 1) {
    const previous = frames[index - 1];
    const next = frames[index];
    const segment = buildSegmentExpression(previous, next, timeExpression);
    expression = `if(lte(${timeExpression},${formatExpressionNumber(next.time)}),${segment},${expression})`;
  }

  return `if(lte(${timeExpression},${formatExpressionNumber(frames[0].time)}),${formatExpressionNumber(frames[0].value)},${expression})`;
}

function buildSegmentExpression(
  previous: { time: number; value: number; easing: TimelineClip['keyframes'][number]['easing'] },
  next: { time: number; value: number },
  timeExpression: string,
): string {
  if (previous.easing === 'hold' || Math.abs(next.time - previous.time) < 0.001) {
    return formatExpressionNumber(previous.value);
  }

  const ratio = `((${timeExpression})-${formatExpressionNumber(previous.time)})/${formatExpressionNumber(next.time - previous.time)}`;
  const easedRatio = buildKeyframeEasingExpression(ratio, previous.easing);

  return `(${formatExpressionNumber(previous.value)}+(${formatExpressionNumber(next.value - previous.value)})*${easedRatio})`;
}

function buildKeyframeEasingExpression(ratio: string, easing: TimelineClip['keyframes'][number]['easing']): string {
  switch (easing) {
    case 'easeIn':
      return `pow(${ratio},2)`;
    case 'easeOut':
      return `(1-pow(1-(${ratio}),2))`;
    case 'easeInOut':
    case 'smooth':
      return `(3*pow(${ratio},2)-2*pow(${ratio},3))`;
    case 'hold':
    case 'linear':
    default:
      return ratio;
  }
}

function buildOpacityFilterForClip(clip: TimelineClip, localTimeExpression: string): string {
  if (hasOpacityKeyframes(clip)) {
    const opacityExpression = buildKeyframeExpression(clip, 'opacity', clip.opacity, 0, 1, localTimeExpression);
    return `,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${opacityExpression})',format=yuva420p`;
  }

  return buildStaticOpacityFilter(clip.opacity);
}

function hasOpacityKeyframes(clip: TimelineClip): boolean {
  return clip.keyframes.some((keyframe) => keyframe.property === 'opacity');
}

function buildStaticOpacityFilter(opacity: number): string {
  const value = clampRatio(opacity);
  return value < 0.999 ? `,colorchannelmixer=aa=${formatRatio(value)}` : '';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function clampRatio(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1));
}

function formatExpressionNumber(value: number): string {
  return roundSeconds(value).toString();
}

function canShareCompositor(first: TimelineClip, next: TimelineClip): boolean {
  return first.blendMode === next.blendMode && Math.abs(clampRatio(first.opacity) - clampRatio(next.opacity)) < 0.001;
}

function getXfadeSpec(
  fromClip: TimelineClip,
  toClip: TimelineClip,
  groupStart: number,
): { duration: number; offset: number } | undefined {
  const transition = fromClip.transitionOut;
  if (!transition || !isXfadeTransition(transition)) {
    return undefined;
  }

  const overlap = roundSeconds(fromClip.start + fromClip.duration - toClip.start);
  const requestedDuration = clampTransitionDuration(transition.duration, fromClip, toClip);
  if (overlap <= 0 || Math.abs(overlap - requestedDuration) > 0.05) {
    return undefined;
  }

  return {
    duration: requestedDuration,
    offset: roundSeconds(toClip.start - groupStart),
  };
}

function isXfadeTransition(transition: TimelineTransition): boolean {
  return transition.type === 'crossfade' || transition.type === 'dip' || transition.type === 'push' || transition.type === 'wipe';
}

function canAlphaFadeTransition(transition: TimelineTransition): boolean {
  return transition.type === 'crossfade' || transition.type === 'dip';
}

function xfadeTransitionName(transition: TimelineTransition): string {
  const direction = readTransitionDirection(transition);

  switch (transition.type) {
    case 'dip':
      return 'fadeblack';
    case 'push':
      return `slide${direction}`;
    case 'wipe':
      return `wipe${direction}`;
    default:
      return 'fade';
  }
}

function readTransitionDirection(transition: TimelineTransition): 'left' | 'right' | 'up' | 'down' {
  const value = transition.parameters.direction;
  return value === 'right' || value === 'up' || value === 'down' ? value : 'left';
}

function blendNeutralColor(blendMode: TimelineClip['blendMode']): string {
  switch (blendMode) {
    case 'multiply':
      return 'white';
    case 'overlay':
      return 'gray';
    default:
      return 'black';
  }
}

function ffmpegBlendMode(blendMode: TimelineClip['blendMode']): string {
  switch (blendMode) {
    case 'add':
      return 'addition';
    case 'multiply':
    case 'overlay':
    case 'screen':
      return blendMode;
    default:
      return 'normal';
  }
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function readEnv(key: string): string | undefined {
  return typeof process !== 'undefined' ? process.env[key] : undefined;
}

function hasUnsupportedTransitions(clips: TimelineClip[]): boolean {
  return clips.some((clip) => (
    (clip.transitionOut && clip.transitionOut.type !== 'cut' && !isXfadeTransition(clip.transitionOut)) ||
    (clip.transitionIn && clip.transitionIn.type !== 'cut' && !isXfadeTransition(clip.transitionIn))
  ));
}
