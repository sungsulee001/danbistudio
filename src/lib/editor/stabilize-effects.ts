import { expandClipIdsWithLinkedAndGroupedClips, findClip } from './timeline';
import { isRenderableVideoMediaAsset } from './renderable-media-kind';
import type { ClipBatchEditResult, ClipBatchEditSkippedClip } from './timeline';
import type { ClipEffect, EditorAsset, EditorProject, TimelineClip } from './types';

export type StabilizePresetId = 'light-hold' | 'standard-deshake' | 'strong-deshake' | 'action-lock';

export interface StabilizePreset {
  id: StabilizePresetId;
  label: string;
  parameters: {
    radius: number;
    blockSize: number;
    stabilizeContrast: number;
  };
}

export const STABILIZE_EFFECT_LABEL = 'Stabilize';

export const STABILIZE_PRESETS: StabilizePreset[] = [
  {
    id: 'light-hold',
    label: 'Light hold',
    parameters: { radius: 8, blockSize: 16, stabilizeContrast: 105 },
  },
  {
    id: 'standard-deshake',
    label: 'Standard',
    parameters: { radius: 16, blockSize: 16, stabilizeContrast: 125 },
  },
  {
    id: 'strong-deshake',
    label: 'Strong',
    parameters: { radius: 28, blockSize: 32, stabilizeContrast: 145 },
  },
  {
    id: 'action-lock',
    label: 'Action lock',
    parameters: { radius: 40, blockSize: 32, stabilizeContrast: 170 },
  },
];

export function findStabilizePreset(presetId: StabilizePresetId): StabilizePreset | undefined {
  return STABILIZE_PRESETS.find((preset) => preset.id === presetId);
}

export function readStabilizePresetId(effect: ClipEffect): StabilizePresetId | undefined {
  const value = effect.parameters.stabilizePreset;
  return typeof value === 'string' && isStabilizePresetId(value) ? value : undefined;
}

export function isStabilizeEffect(effect: ClipEffect): boolean {
  return effect.type === 'stabilize';
}

export function findStabilizeEffect(clip: TimelineClip): ClipEffect | undefined {
  return clip.effects.find(isStabilizeEffect);
}

export function applyStabilizePreset(
  project: EditorProject,
  clipId: string,
  presetId: StabilizePresetId,
): EditorProject {
  const preset = findStabilizePreset(presetId);
  if (!preset) {
    throw new Error('Stabilize preset not found.');
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
      if (!isVideoMediaClip(clip, asset)) {
        throw new Error('Stabilize presets are available for video clips.');
      }

      const existingEffect = findStabilizeEffect(clip);
      const nextEffect: ClipEffect = {
        id: existingEffect?.id ?? `effect-stabilize-${preset.id}-${Date.now()}-${clip.id}`,
        type: 'stabilize',
        label: `${STABILIZE_EFFECT_LABEL}: ${preset.label}`,
        enabled: true,
        parameters: {
          stabilizePreset: preset.id,
          ...preset.parameters,
        },
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

export function applyStabilizePresetToClips(
  project: EditorProject,
  clipIds: string[],
  presetId: StabilizePresetId,
): ClipBatchEditResult {
  const preset = findStabilizePreset(presetId);
  if (!preset) {
    throw new Error('Stabilize preset not found.');
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
      nextProject = applyStabilizePreset(nextProject, clip.id, preset.id);
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
    throw new Error(reason ? `No selected clips could receive stabilize preset: ${reason}` : 'No selected clips could receive stabilize preset.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

function isStabilizePresetId(value: string): value is StabilizePresetId {
  return STABILIZE_PRESETS.some((preset) => preset.id === value);
}

function isVideoMediaClip(clip: TimelineClip, asset?: EditorAsset): boolean {
  return clip.kind === 'video' || isRenderableVideoMediaAsset(asset);
}
