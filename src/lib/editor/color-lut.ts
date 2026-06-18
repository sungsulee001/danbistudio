import { expandClipIdsWithLinkedAndGroupedClips, findClip } from './timeline';
import type { ClipBatchEditResult, ClipBatchEditSkippedClip } from './timeline';
import { isAdjustmentLayerClip } from './adjustment-layer';
import { isRenderableVisualMediaAsset } from './renderable-media-kind';
import type { ClipEffect, EditorAsset, EditorProject, TimelineClip } from './types';

export type ColorLutInterpolation = 'nearest' | 'trilinear' | 'tetrahedral' | 'pyramid' | 'prism';

export interface ColorLutReference {
  name: string;
  source: string;
  renderPath: string;
  interpolation?: ColorLutInterpolation;
}

export const COLOR_LUT_EFFECT_LABEL = 'Color LUT';

const DEFAULT_INTERPOLATION: ColorLutInterpolation = 'tetrahedral';

export function isColorLutEffect(effect: ClipEffect): boolean {
  return effect.type === 'color' && (
    typeof effect.parameters.lutPath === 'string' ||
    typeof effect.parameters.lutSource === 'string'
  );
}

export function hasSupportedColorLutEffect(effect: ClipEffect): boolean {
  return isColorLutEffect(effect) && typeof effect.parameters.lutPath === 'string' && effect.parameters.lutPath.trim().length > 0;
}

export function applyColorLutToClips(
  project: EditorProject,
  clipIds: string[],
  lut: ColorLutReference,
): ClipBatchEditResult {
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
      nextProject = applyColorLut(nextProject, clip.id, lut);
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
    throw new Error(reason ? `No selected clips could receive LUT: ${reason}` : 'No selected clips could receive LUT.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

export function applyColorLut(
  project: EditorProject,
  clipId: string,
  lut: ColorLutReference,
): EditorProject {
  const normalized = normalizeColorLutReference(lut);
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
        throw new Error('LUT effects are available for video and image clips.');
      }

      updated = true;
      return upsertColorLutEffect(clip, normalized);
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

function upsertColorLutEffect(clip: TimelineClip, lut: Required<ColorLutReference>): TimelineClip {
  const existing = clip.effects.find(isColorLutEffect);
  const effect: ClipEffect = {
    id: existing?.id ?? `effect-color-lut-${Date.now()}-${clip.id}`,
    type: 'color',
    label: `${COLOR_LUT_EFFECT_LABEL}: ${lut.name}`,
    enabled: true,
    parameters: {
      lutName: lut.name,
      lutSource: lut.source,
      lutPath: lut.renderPath,
      lutInterpolation: lut.interpolation,
    },
  };

  return {
    ...clip,
    effects: existing
      ? clip.effects.map((item) => (item.id === existing.id ? effect : item))
      : [...clip.effects, effect],
  };
}

function normalizeColorLutReference(lut: ColorLutReference): Required<ColorLutReference> {
  const name = lut.name.trim() || 'LUT';
  const source = lut.source.trim();
  const renderPath = lut.renderPath.trim();

  if (!source) {
    throw new Error('LUT source is required.');
  }

  if (!renderPath) {
    throw new Error('LUT render path is required.');
  }

  return {
    name,
    source,
    renderPath,
    interpolation: normalizeInterpolation(lut.interpolation),
  };
}

function normalizeInterpolation(value: unknown): ColorLutInterpolation {
  return value === 'nearest' ||
    value === 'trilinear' ||
    value === 'pyramid' ||
    value === 'prism' ||
    value === 'tetrahedral'
    ? value
    : DEFAULT_INTERPOLATION;
}

function isVisualMediaClip(clip: TimelineClip, asset?: EditorAsset): boolean {
  return clip.kind === 'video' ||
    clip.kind === 'image' ||
    isRenderableVisualMediaAsset(asset) ||
    isAdjustmentLayerClip(clip, asset);
}
