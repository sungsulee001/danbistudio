import { expandClipIdsWithLinkedAndGroupedClips, findClip } from './timeline';
import type { ClipBatchEditResult, ClipBatchEditSkippedClip } from './timeline';
import { isAdjustmentLayerClip } from './adjustment-layer';
import { isRenderableVisualMediaAsset } from './renderable-media-kind';
import type { ClipEffect, EditorAsset, EditorProject, TimelineClip } from './types';

export type VisualFilterPresetId =
  'blur-soft' |
  'sharpen-crisp' |
  'vignette-focus' |
  'soft-glow' |
  'advanced-bloom' |
  'motion-trails' |
  'optical-flow-blur' |
  'pixelate-blocks' |
  'film-grain' |
  'green-screen-key' |
  'privacy-blur';

export interface VisualFilterPreset {
  id: VisualFilterPresetId;
  label: string;
  parameters: Record<string, string | number | boolean>;
}

export interface PrivacyBlurRegion {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export const VISUAL_FILTER_EFFECT_LABEL = 'Visual FX';

export const VISUAL_FILTER_PRESETS: VisualFilterPreset[] = [
  {
    id: 'blur-soft',
    label: 'Soft blur',
    parameters: {
      visualEffect: 'blur-soft',
      blurRadius: 4,
    },
  },
  {
    id: 'sharpen-crisp',
    label: 'Crisp sharp',
    parameters: {
      visualEffect: 'sharpen-crisp',
      sharpenAmount: 0.65,
      sharpenRadius: 5,
    },
  },
  {
    id: 'vignette-focus',
    label: 'Vignette',
    parameters: {
      visualEffect: 'vignette-focus',
      vignetteStrength: 0.35,
    },
  },
  {
    id: 'soft-glow',
    label: 'Soft glow',
    parameters: {
      visualEffect: 'soft-glow',
      glowRadius: 2.5,
      glowIntensity: 0.22,
      glowSaturation: 1.08,
    },
  },
  {
    id: 'advanced-bloom',
    label: 'Advanced bloom',
    parameters: {
      visualEffect: 'advanced-bloom',
      bloomRadius: 6,
      bloomIntensity: 0.34,
      bloomThreshold: 0.72,
      bloomSaturation: 1.18,
    },
  },
  {
    id: 'motion-trails',
    label: 'Motion trails',
    parameters: {
      visualEffect: 'motion-trails',
      trailFrames: 5,
      trailDecay: 0.65,
    },
  },
  {
    id: 'optical-flow-blur',
    label: 'Optical flow blur',
    parameters: {
      visualEffect: 'optical-flow-blur',
      flowBlurFrames: 3,
      flowBlurStrength: 0.58,
      flowSearchParam: 24,
    },
  },
  {
    id: 'pixelate-blocks',
    label: 'Pixelate',
    parameters: {
      visualEffect: 'pixelate-blocks',
      pixelSize: 12,
    },
  },
  {
    id: 'film-grain',
    label: 'Film grain',
    parameters: {
      visualEffect: 'film-grain',
      grainStrength: 12,
      grainSeed: 19,
    },
  },
  {
    id: 'green-screen-key',
    label: 'Green screen',
    parameters: {
      visualEffect: 'green-screen-key',
      keyColor: '0x00ff00',
      keySimilarity: 0.18,
      keyBlend: 0.08,
    },
  },
  {
    id: 'privacy-blur',
    label: 'Privacy blur',
    parameters: {
      visualEffect: 'privacy-blur',
      regionCenterX: 0.5,
      regionCenterY: 0.35,
      regionWidth: 0.28,
      regionHeight: 0.18,
    },
  },
];

export function findVisualFilterPreset(presetId: VisualFilterPresetId): VisualFilterPreset | undefined {
  return VISUAL_FILTER_PRESETS.find((preset) => preset.id === presetId);
}

export function readVisualFilterPresetId(effect: ClipEffect): VisualFilterPresetId | undefined {
  const value = effect.parameters.visualEffect;
  return typeof value === 'string' && isVisualFilterPresetId(value) ? value : undefined;
}

export function isVisualFilterEffect(effect: ClipEffect): boolean {
  return effect.type === 'filter' && readVisualFilterPresetId(effect) !== undefined;
}

export function hasSupportedVisualFilterEffect(effect: ClipEffect): boolean {
  return isVisualFilterEffect(effect);
}

export function findVisualFilterEffect(clip: TimelineClip, presetId?: VisualFilterPresetId): ClipEffect | undefined {
  return clip.effects.find((effect) => (
    isVisualFilterEffect(effect) &&
    (presetId === undefined || readVisualFilterPresetId(effect) === presetId)
  ));
}

export function applyVisualFilterPreset(
  project: EditorProject,
  clipId: string,
  presetId: VisualFilterPresetId,
): EditorProject {
  const preset = findVisualFilterPreset(presetId);
  if (!preset) {
    throw new Error('Visual FX preset not found.');
  }

  let updated = false;
  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }

      if (track.locked || clip.locked) {
        throw new Error('Cannot edit an effect on a locked track or clip.');
      }

      const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
      if (!isVisualMediaClip(clip, asset)) {
        throw new Error('Visual FX presets are available for video and image clips.');
      }

      const existingEffect = findVisualFilterEffect(clip, preset.id);
      const nextEffect: ClipEffect = {
        id: existingEffect?.id ?? `effect-visual-fx-${preset.id}-${Date.now()}-${clip.id}`,
        type: 'filter',
        label: `${VISUAL_FILTER_EFFECT_LABEL}: ${preset.label}`,
        enabled: true,
        parameters: buildVisualFilterParameters(preset, clip),
      };

      updated = true;
      return {
        ...clip,
        effects: existingEffect
          ? clip.effects.map((effect) => (effect.id === existingEffect.id ? nextEffect : effect))
          : [...clip.effects, nextEffect],
      };
    }),
  }));

  if (!updated) {
    throw new Error('Clip not found.');
  }

  return {
    ...project,
    tracks,
    updatedAt: new Date().toISOString(),
  };
}

export function applyVisualFilterPresetToClips(
  project: EditorProject,
  clipIds: string[],
  presetId: VisualFilterPresetId,
): ClipBatchEditResult {
  const preset = findVisualFilterPreset(presetId);
  if (!preset) {
    throw new Error('Visual FX preset not found.');
  }

  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const targetIds = expandClipIdsWithLinkedAndGroupedClips(project, requestedIds);
  if (targetIds.length === 0) {
    throw new Error('Target clip not found.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];
  const skipped: ClipBatchEditSkippedClip[] = [];

  for (const clipId of targetIds) {
    const clip = findClip(nextProject, clipId);
    if (!clip) {
      skipped.push({ clipId, reason: 'Clip not found.' });
      continue;
    }

    try {
      nextProject = applyVisualFilterPreset(nextProject, clip.id, preset.id);
      updatedClipIds.push(clip.id);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('locked track') || message.includes('locked clip') || message.includes('locked track or clip')) {
        throw error;
      }

      skipped.push({ clipId: clip.id, reason: message });
    }
  }

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips could receive Visual FX preset: ${reason}` : 'No selected clips could receive Visual FX preset.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

export function readPrivacyBlurRegionAtTime(effect: ClipEffect, clipTime = 0, clipDuration = 0): PrivacyBlurRegion {
  const base = readPrivacyBlurBaseRegion(effect);
  const start = {
    time: 0,
    centerX: readNumber(effect.parameters.regionStartX, base.centerX),
    centerY: readNumber(effect.parameters.regionStartY, base.centerY),
  };
  const mid = {
    time: readNumber(effect.parameters.regionMidTime, clipDuration / 2),
    centerX: readNumber(effect.parameters.regionMidX, start.centerX),
    centerY: readNumber(effect.parameters.regionMidY, start.centerY),
  };
  const end = {
    time: readNumber(effect.parameters.regionEndTime, Math.max(mid.time, clipDuration)),
    centerX: readNumber(effect.parameters.regionEndX, mid.centerX),
    centerY: readNumber(effect.parameters.regionEndY, mid.centerY),
  };
  const points = normalizePrivacyBlurPoints([start, mid, end], Math.max(0, clipDuration || end.time));
  const time = clampNumber(clipTime, 0, Math.max(0, clipDuration || end.time));
  const nextIndex = points.findIndex((point) => point.time >= time);

  if (nextIndex <= 0) {
    return { ...base, centerX: points[0].centerX, centerY: points[0].centerY };
  }

  if (nextIndex === -1) {
    const last = points[points.length - 1];
    return { ...base, centerX: last.centerX, centerY: last.centerY };
  }

  const previous = points[nextIndex - 1];
  const next = points[nextIndex];
  const ratio = (time - previous.time) / Math.max(0.001, next.time - previous.time);

  return {
    ...base,
    centerX: clampRatio(previous.centerX + ((next.centerX - previous.centerX) * ratio)),
    centerY: clampRatio(previous.centerY + ((next.centerY - previous.centerY) * ratio)),
  };
}

function isVisualFilterPresetId(value: string): value is VisualFilterPresetId {
  return VISUAL_FILTER_PRESETS.some((preset) => preset.id === value);
}

function isVisualMediaClip(clip: TimelineClip, asset?: EditorAsset): boolean {
  return clip.kind === 'video' ||
    clip.kind === 'image' ||
    isRenderableVisualMediaAsset(asset) ||
    isAdjustmentLayerClip(clip, asset);
}

function buildVisualFilterParameters(preset: VisualFilterPreset, clip: TimelineClip): Record<string, string | number | boolean> {
  if (preset.id !== 'privacy-blur') {
    return { ...preset.parameters };
  }

  const centerX = readNumber(preset.parameters.regionCenterX, 0.5);
  const centerY = readNumber(preset.parameters.regionCenterY, 0.35);
  const duration = Math.max(0.001, clip.duration);
  const midTime = roundNumber(duration / 2);
  const endTime = roundNumber(duration);

  return {
    ...preset.parameters,
    regionStartX: centerX,
    regionStartY: centerY,
    regionMidX: centerX,
    regionMidY: centerY,
    regionEndX: centerX,
    regionEndY: centerY,
    regionMidTime: midTime,
    regionEndTime: endTime,
  };
}

function readPrivacyBlurBaseRegion(effect: ClipEffect): PrivacyBlurRegion {
  return {
    centerX: clampRatio(readNumber(effect.parameters.regionCenterX, 0.5)),
    centerY: clampRatio(readNumber(effect.parameters.regionCenterY, 0.35)),
    width: clampNumber(readNumber(effect.parameters.regionWidth, 0.28), 0.02, 1),
    height: clampNumber(readNumber(effect.parameters.regionHeight, 0.18), 0.02, 1),
  };
}

function normalizePrivacyBlurPoints(
  points: Array<{ time: number; centerX: number; centerY: number }>,
  duration: number,
): Array<{ time: number; centerX: number; centerY: number }> {
  return points
    .map((point) => ({
      time: roundNumber(clampNumber(point.time, 0, Math.max(0, duration))),
      centerX: roundNumber(clampRatio(point.centerX)),
      centerY: roundNumber(clampRatio(point.centerY)),
    }))
    .sort((a, b) => a.time - b.time);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampRatio(value: number): number {
  return clampNumber(value, 0, 1);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}
