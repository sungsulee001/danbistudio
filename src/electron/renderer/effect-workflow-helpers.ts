import { findCropMaskEffect } from '../../lib/editor/crop-mask';
import { findMotionTransformEffect } from '../../lib/editor/motion-transform';
import { isRenderableVisualMediaAsset } from '../../lib/editor/renderable-media-kind';
import type { ClipEffect, EditorAsset, TimelineClip } from '../../lib/editor/types';

export interface ClipBatchCommandPlan {
  canApply: boolean;
  targetClipIds: string[];
  status?: string;
  commitLabel?: string;
  statusAction?: string;
  statusPreposition?: string;
}

export interface AddClipEffectPlan extends ClipBatchCommandPlan {
  stamp?: number;
}

export interface ClipBatchResultCounts {
  updatedCount: number;
  skippedCount: number;
}

export interface AudioPeakNormalizeCommandPlan {
  canApply: boolean;
  targetClipIds: string[];
  assetIds: Array<string | undefined>;
  status?: string;
}

export interface AudioPeakNormalizeResultCounts {
  clipCount: number;
  skippedCount: number;
  limitedCount: number;
}

export interface LutImportPlan extends ClipBatchCommandPlan {
  fileName?: string;
}

export interface MotionTransformPatchPlan {
  canApply: boolean;
  clipId?: string;
  trackId?: string;
  effectId?: string;
  effectEnabled?: boolean;
  commitLabel?: string;
  mode?: 'add' | 'update';
  status?: string;
}

export interface MoveClipEffectPlan {
  canApply: boolean;
  clipId?: string;
  effectId?: string;
  direction?: 'up' | 'down';
  commitLabel?: string;
  status?: string;
}

export interface ClipEffectBatchEditPlan extends ClipBatchCommandPlan {
  selectedClipId?: string;
  effectId?: string;
  targetEffect?: ClipEffect;
}

export function resolveClipBatchCommandPlan({
  selectedClipCount,
  targetClipIds,
  commitLabel,
  statusAction,
}: {
  selectedClipCount: number;
  targetClipIds: string[];
  commitLabel: string;
  statusAction: string;
}): ClipBatchCommandPlan {
  if (selectedClipCount === 0) {
    return { canApply: false, targetClipIds: [], status: 'Select a clip first' };
  }

  return {
    canApply: true,
    targetClipIds,
    commitLabel,
    statusAction,
  };
}

export function resolveAvailableClipBatchCommandPlan({
  selectedClipIds,
  canApply,
  unavailableStatus,
  commitLabel,
  statusAction,
  statusPreposition,
}: {
  selectedClipIds: string[];
  canApply: boolean;
  unavailableStatus: string;
  commitLabel: string;
  statusAction: string;
  statusPreposition?: string;
}): ClipBatchCommandPlan {
  if (selectedClipIds.length === 0) {
    return { canApply: false, targetClipIds: [], status: 'Select a clip first' };
  }

  if (!canApply) {
    return { canApply: false, targetClipIds: selectedClipIds, status: unavailableStatus };
  }

  return {
    canApply: true,
    targetClipIds: selectedClipIds,
    commitLabel,
    statusAction,
    ...(statusPreposition ? { statusPreposition } : {}),
  };
}

export function resolveClipEffectBatchEditPlan({
  selectedClip,
  selectedClips,
  effectId,
  commitLabel,
  statusAction,
}: {
  selectedClip?: TimelineClip;
  selectedClips: TimelineClip[];
  effectId: string;
  commitLabel: string;
  statusAction: string;
}): ClipEffectBatchEditPlan {
  if (!selectedClip) {
    return { canApply: false, targetClipIds: [], status: 'Select a clip first' };
  }

  const targetEffect = selectedClip.effects.find((effect) => effect.id === effectId);
  if (!targetEffect) {
    return { canApply: false, targetClipIds: [], status: 'Clip effect not found.' };
  }

  return {
    canApply: true,
    selectedClipId: selectedClip.id,
    effectId,
    targetEffect,
    targetClipIds: selectedClips.map((clip) => clip.id),
    commitLabel,
    statusAction,
  };
}

export function resolveMoveClipEffectPlan({
  selectedClip,
  effectId,
  direction,
}: {
  selectedClip?: TimelineClip | null;
  effectId: string;
  direction: 'up' | 'down';
}): MoveClipEffectPlan {
  if (!selectedClip) {
    return { canApply: false, status: 'Select a clip first' };
  }

  return {
    canApply: true,
    clipId: selectedClip.id,
    effectId,
    direction,
    commitLabel: direction === 'up' ? 'Effect moved up' : 'Effect moved down',
  };
}

export function isMatchingClipEffectBatchTarget({
  effect,
  clip,
  selectedClipId,
  effectId,
  targetEffect,
}: {
  effect: ClipEffect;
  clip: TimelineClip;
  selectedClipId: string;
  effectId: string;
  targetEffect: ClipEffect;
}): boolean {
  return clip.id === selectedClipId
    ? effect.id === effectId
    : effect.type === targetEffect.type && effect.label === targetEffect.label;
}

export function resolveAddClipEffectPlan({
  label,
  selectedClipCount,
  targetClipIds,
  stamp,
}: {
  label: string;
  selectedClipCount: number;
  targetClipIds: string[];
  stamp: number;
}): AddClipEffectPlan {
  if (selectedClipCount === 0) {
    return { canApply: false, targetClipIds: [], status: 'Select a clip first' };
  }

  if (targetClipIds.length === 0) {
    return {
      canApply: false,
      targetClipIds,
      status: `${label} is not available for the selected clips`,
    };
  }

  return {
    canApply: true,
    targetClipIds,
    stamp,
    commitLabel: `${label} added`,
    statusAction: `${label} added`,
  };
}

export function resolveNamedPresetClipBatchPlan({
  selectedClipCount,
  canApply,
  unavailableStatus,
  targetClipIds,
  presetLabel,
  commitPrefix,
  fallbackCommitLabel,
  statusAction,
}: {
  selectedClipCount: number;
  canApply: boolean;
  unavailableStatus: string;
  targetClipIds: string[];
  presetLabel?: string;
  commitPrefix: string;
  fallbackCommitLabel: string;
  statusAction: string;
}): ClipBatchCommandPlan {
  if (selectedClipCount === 0) {
    return { canApply: false, targetClipIds: [], status: 'Select a clip first' };
  }

  if (!canApply) {
    return { canApply: false, targetClipIds, status: unavailableStatus };
  }

  return {
    canApply: true,
    targetClipIds,
    commitLabel: presetLabel ? `${commitPrefix} ${presetLabel} applied` : fallbackCommitLabel,
    statusAction,
  };
}

export function resolveAudioPeakNormalizeCommandPlan({
  selectedClips,
}: {
  selectedClips: TimelineClip[];
}): AudioPeakNormalizeCommandPlan {
  if (selectedClips.length === 0) {
    return { canApply: false, targetClipIds: [], assetIds: [], status: 'Select a clip first' };
  }

  return {
    canApply: true,
    targetClipIds: selectedClips.map((clip) => clip.id),
    assetIds: selectedClips.map((clip) => clip.assetId),
  };
}

export function resolveAudioPeakNormalizeCommitLabel(clipCount: number): string {
  return clipCount > 1 ? 'Peak normalize applied to clips' : 'Peak normalize applied';
}

export function formatAudioPeakNormalizeStatus({
  clipCount,
  skippedCount,
  limitedCount,
}: AudioPeakNormalizeResultCounts): string {
  const skippedText = skippedCount > 0 ? `, skipped ${skippedCount}` : '';
  const limitedText = limitedCount > 0 ? `, ${limitedCount} limited` : '';
  return `Peak normalized ${clipCount} clip${clipCount === 1 ? '' : 's'}${skippedText}${limitedText}`;
}

export function formatAudioPeakNormalizeFailureStatus(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Peak normalize failed: ${message}`;
}

export function resolveLutImportPlan({
  selectedClipCount,
  canApply,
  targetClipIds,
  fileName,
}: {
  selectedClipCount: number;
  canApply: boolean;
  targetClipIds: string[];
  fileName: string;
}): LutImportPlan {
  if (selectedClipCount === 0) {
    return {
      canApply: false,
      targetClipIds: [],
      status: 'Select a clip before applying a LUT',
    };
  }

  if (!canApply) {
    return {
      canApply: false,
      targetClipIds,
      status: 'LUT effects are available for video and image clips',
    };
  }

  return {
    canApply: true,
    targetClipIds,
    fileName,
    commitLabel: `LUT ${fileName} applied`,
    statusAction: 'LUT applied',
  };
}

export function formatLutImportStatus(counts: ClipBatchResultCounts): string {
  return formatClipBatchStatus('LUT applied', counts);
}

export function formatLutImportFailureStatus(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `LUT import failed: ${message}`;
}

export function resolveSubjectTrackingReframePlan({
  canApply,
  targetClipIds,
}: {
  canApply: boolean;
  targetClipIds: string[];
}): ClipBatchCommandPlan {
  if (!canApply) {
    return {
      canApply: false,
      targetClipIds,
      status: 'Subject tracking is available for video and image clips',
    };
  }

  return {
    canApply: true,
    targetClipIds,
    commitLabel: 'Subject tracking reframe applied',
    statusAction: 'Subject tracking reframe applied',
  };
}

export function resolveTrackedObjectMaskPlan({
  canApply,
  targetClipIds,
}: {
  canApply: boolean;
  targetClipIds: string[];
}): ClipBatchCommandPlan {
  if (!canApply) {
    return {
      canApply: false,
      targetClipIds,
      status: 'Object mask is available for video and image clips',
    };
  }

  return {
    canApply: true,
    targetClipIds,
    commitLabel: 'Tracked object mask applied',
    statusAction: 'Object mask applied',
  };
}

export function resolveMotionTransformPatchPlan({
  selectedClip,
  canUseMotion,
  motionEffect,
}: {
  selectedClip?: TimelineClip | null;
  canUseMotion: boolean;
  motionEffect?: ClipEffect;
}): MotionTransformPatchPlan {
  if (!selectedClip) {
    return {
      canApply: false,
      status: 'Select a clip first',
    };
  }

  if (!canUseMotion) {
    return {
      canApply: false,
      clipId: selectedClip.id,
      status: 'Motion transform is available for visual clips',
    };
  }

  if (motionEffect) {
    return {
      canApply: true,
      clipId: selectedClip.id,
      effectId: motionEffect.id,
      effectEnabled: motionEffect.enabled,
      commitLabel: 'Motion transform updated',
      mode: 'update',
    };
  }

  return {
    canApply: true,
    clipId: selectedClip.id,
    commitLabel: 'Motion transform added',
    mode: 'add',
  };
}

export function resolveProgramMonitorMotionPatchPlan({
  clip,
  asset,
}: {
  clip?: TimelineClip;
  asset?: EditorAsset;
}): MotionTransformPatchPlan {
  if (!clip || !isProgramMonitorMotionClip(clip, asset)) {
    return {
      canApply: false,
      status: 'Program monitor transform is available for active visual clips',
    };
  }

  if (hasMotionTransformKeyframes(clip)) {
    return {
      canApply: false,
      clipId: clip.id,
      trackId: clip.trackId,
      status: 'Motion keyframes are active; adjust keyframes in the Inspector',
    };
  }

  const motionEffect = findMotionTransformEffect(clip);
  if (motionEffect) {
    return {
      canApply: true,
      clipId: clip.id,
      trackId: clip.trackId,
      effectId: motionEffect.id,
      effectEnabled: motionEffect.enabled,
      commitLabel: 'Program monitor motion adjusted',
      mode: 'update',
      status: 'Program monitor motion adjusted',
    };
  }

  return {
    canApply: true,
    clipId: clip.id,
    trackId: clip.trackId,
    commitLabel: 'Program monitor motion adjusted',
    mode: 'add',
    status: 'Program monitor motion adjusted',
  };
}

export function resolveProgramMonitorCropPatchPlan({
  clip,
  asset,
  trackLocked,
}: {
  clip?: TimelineClip;
  asset?: EditorAsset;
  trackLocked: boolean;
}): MotionTransformPatchPlan {
  if (!clip || !isRenderableVisualMediaAsset(asset)) {
    return {
      canApply: false,
      status: 'Program monitor crop is available for active video and image clips',
    };
  }

  if (clip.locked || trackLocked) {
    return {
      canApply: false,
      clipId: clip.id,
      trackId: clip.trackId,
      status: 'Locked clips cannot be cropped',
    };
  }

  const cropEffect = findCropMaskEffect(clip);
  if (cropEffect) {
    return {
      canApply: true,
      clipId: clip.id,
      trackId: clip.trackId,
      effectId: cropEffect.id,
      effectEnabled: cropEffect.enabled,
      commitLabel: 'Program monitor crop adjusted',
      mode: 'update',
      status: 'Program monitor crop adjusted',
    };
  }

  return {
    canApply: true,
    clipId: clip.id,
    trackId: clip.trackId,
    commitLabel: 'Program monitor crop adjusted',
    mode: 'add',
    status: 'Program monitor crop adjusted',
  };
}

export function resolveAudioFadeClipBatchPlan({
  selectedClipIds,
  canApply,
  edge,
}: {
  selectedClipIds: string[];
  canApply: boolean;
  edge: 'in' | 'out' | 'both';
}): ClipBatchCommandPlan {
  return resolveAvailableClipBatchCommandPlan({
    selectedClipIds,
    canApply,
    unavailableStatus: 'Selected clip has no timeline audio',
    commitLabel: edge === 'both' ? 'Audio fades applied' : `Audio fade ${edge} applied`,
    statusAction: 'Audio fade applied',
  });
}

export function resolveVisualFadeClipBatchPlan({
  selectedClipIds,
  canApply,
  edge,
}: {
  selectedClipIds: string[];
  canApply: boolean;
  edge: 'in' | 'out' | 'both';
}): ClipBatchCommandPlan {
  return resolveAvailableClipBatchCommandPlan({
    selectedClipIds,
    canApply,
    unavailableStatus: 'Selected clip has no visual layer',
    commitLabel: edge === 'both' ? 'Visual fades applied' : `Visual fade ${edge} applied`,
    statusAction: 'Visual fade applied',
  });
}

export function resolveCanvasLayoutClipBatchPlan({
  selectedClipIds,
  canApply,
  modeLabel,
}: {
  selectedClipIds: string[];
  canApply: boolean;
  modeLabel: string;
}): ClipBatchCommandPlan {
  return resolveAvailableClipBatchCommandPlan({
    selectedClipIds,
    canApply,
    unavailableStatus: 'Canvas layout is available for visual clips',
    commitLabel: `Canvas ${modeLabel} applied`,
    statusAction: `Canvas ${modeLabel} applied`,
  });
}

export function resolveFreezeFrameClipBatchPlan({
  selectedClipIds,
  canApply,
}: {
  selectedClipIds: string[];
  canApply: boolean;
}): ClipBatchCommandPlan {
  return resolveAvailableClipBatchCommandPlan({
    selectedClipIds,
    canApply,
    unavailableStatus: 'Freeze frame is available for video clips',
    commitLabel: 'Freeze frame applied',
    statusAction: 'Freeze frame applied',
  });
}

export function resolveClearFreezeFrameClipBatchPlan({
  selectedClipIds,
}: {
  selectedClipIds: string[];
}): ClipBatchCommandPlan {
  if (selectedClipIds.length === 0) {
    return { canApply: false, targetClipIds: [], status: 'Select a clip first' };
  }

  return {
    canApply: true,
    targetClipIds: selectedClipIds,
    commitLabel: 'Freeze frame cleared',
    statusAction: 'Freeze frame cleared',
    statusPreposition: 'on',
  };
}

export function formatClipBatchStatus(
  action: string,
  { updatedCount, skippedCount }: ClipBatchResultCounts,
  preposition = 'to',
): string {
  return `${action} ${preposition} ${updatedCount} clip${updatedCount === 1 ? '' : 's'}${formatSkippedSuffix(skippedCount)}`;
}

export function formatAddClipEffectStatus(
  label: string,
  counts: ClipBatchResultCounts,
): string {
  return formatClipBatchStatus(`${label} added`, counts);
}

export function formatSkippedSuffix(skippedCount: number): string {
  return skippedCount > 0 ? `, skipped ${skippedCount}` : '';
}

function isProgramMonitorMotionClip(clip: TimelineClip, asset?: EditorAsset): boolean {
  return isRenderableVisualMediaAsset(asset) || asset?.kind === 'text' || clip.kind === 'text';
}

function hasMotionTransformKeyframes(clip: TimelineClip): boolean {
  return clip.keyframes.some((keyframe) => (
    keyframe.property === 'positionX' ||
    keyframe.property === 'positionY' ||
    keyframe.property === 'scale' ||
    keyframe.property === 'rotation'
  ));
}
