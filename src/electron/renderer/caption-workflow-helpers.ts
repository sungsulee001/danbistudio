import { findCaptionAtTime } from '../../lib/editor/timeline';
import type { ParsedCaptionSidecar } from '../../lib/editor/caption-sidecar';
import type { CaptionSegment, EditorProject } from '../../lib/editor/types';
import { formatTimecode, roundTime } from './editor-time-helpers';

export interface CaptionCommandPlan {
  canApply: boolean;
  status?: string;
  commitLabel?: string;
  captionIds?: string[];
  selectedCaptionIds?: string[];
}

export interface CaptionMovePlan extends CaptionCommandPlan {
  playhead?: number;
}

export interface CaptionNudgePlan extends CaptionCommandPlan {
  deltaSeconds?: number;
}

export interface CaptionTightenPlan extends CaptionCommandPlan {
  gapSeconds?: number;
}

export interface CaptionStylePatchPlan {
  commitLabel: string;
  targetCaptionIds: string[];
}

export interface CaptionJumpPlan {
  canJump: boolean;
  status: string;
  playhead?: number;
  selectedCaptionIds?: string[];
}

export interface CaptionSplitPlan {
  canSplit: boolean;
  status?: string;
  commitLabel?: string;
  captionId?: string;
  splitTime?: number;
  playhead?: number;
  selectedCaptionIds?: string[];
}

export type CaptionSidecarImportPlan =
  | {
    canImport: false;
    status: string;
  }
  | {
    canImport: true;
    commitLabel: string;
    captions: CaptionSegment[];
    selectedCaptionIds: string[];
    status: string;
  };

export function resolveValidCaptionSelection({
  captions,
  currentSelectedCaptionIds,
}: {
  captions: CaptionSegment[];
  currentSelectedCaptionIds: string[];
}): string[] {
  const availableCaptionIds = new Set(captions.map((caption) => caption.id));
  const nextSelectedCaptionIds = currentSelectedCaptionIds.filter((captionId) => availableCaptionIds.has(captionId));
  return nextSelectedCaptionIds.length === currentSelectedCaptionIds.length
    ? currentSelectedCaptionIds
    : nextSelectedCaptionIds;
}

export function resolveCaptionSpeakerDraft(selectedCaptions: CaptionSegment[]): string {
  if (selectedCaptions.length === 0) {
    return '';
  }

  const speakers = Array.from(new Set(selectedCaptions.map((caption) => caption.speaker?.trim() ?? '')));
  return speakers.length === 1 ? speakers[0] : '';
}

export function resolveApplyCaptionSpeakerPlan(selectedCaptionIds: string[]): CaptionCommandPlan {
  if (selectedCaptionIds.length === 0) {
    return { canApply: false, status: 'Select at least one caption first' };
  }

  return {
    canApply: true,
    commitLabel: 'Caption speaker updated',
    captionIds: selectedCaptionIds,
    status: `Updated speaker on ${selectedCaptionIds.length} caption${selectedCaptionIds.length === 1 ? '' : 's'}`,
  };
}

export function resolveMoveCaptionsToPlayheadPlan({
  captionIds,
  playhead,
}: {
  captionIds: string[];
  playhead: number;
}): CaptionMovePlan {
  if (captionIds.length === 0) {
    return { canApply: false, status: 'Select at least one caption first' };
  }

  return {
    canApply: true,
    commitLabel: captionIds.length > 1 ? 'Captions moved to playhead' : 'Caption moved to playhead',
    captionIds,
    selectedCaptionIds: captionIds,
    playhead,
  };
}

export function resolveNudgeSelectedCaptionsPlan({
  selectedCaptionIds,
  deltaSeconds,
}: {
  selectedCaptionIds: string[];
  deltaSeconds: number;
}): CaptionNudgePlan {
  if (selectedCaptionIds.length === 0) {
    return { canApply: false, status: 'Select at least one caption first' };
  }

  return {
    canApply: true,
    commitLabel: deltaSeconds < 0 ? 'Captions nudged left' : 'Captions nudged right',
    captionIds: selectedCaptionIds,
    deltaSeconds,
    status: `Nudged ${selectedCaptionIds.length} caption${selectedCaptionIds.length > 1 ? 's' : ''} ${deltaSeconds < 0 ? 'left' : 'right'} by ${Math.abs(deltaSeconds).toFixed(3)}s`,
  };
}

export function resolveTightenSelectedCaptionsPlan({
  selectedCaptionIds,
  gapSeconds,
}: {
  selectedCaptionIds: string[];
  gapSeconds: number;
}): CaptionTightenPlan {
  if (selectedCaptionIds.length < 2) {
    return { canApply: false, status: 'Select at least two captions to tighten spacing' };
  }

  return {
    canApply: true,
    commitLabel: 'Caption spacing tightened',
    captionIds: selectedCaptionIds,
    gapSeconds,
    status: `Tightened ${selectedCaptionIds.length} captions with ${gapSeconds.toFixed(2)}s gap`,
  };
}

export function resolveCaptionStylePatchPlan({
  caption,
  selectedCaptionIds,
}: {
  caption: CaptionSegment;
  selectedCaptionIds: string[];
}): CaptionStylePatchPlan {
  const targetCaptionIds = selectedCaptionIds.includes(caption.id)
    ? selectedCaptionIds
    : [caption.id];

  return {
    targetCaptionIds,
    commitLabel: targetCaptionIds.length > 1 ? 'Caption styles updated' : 'Caption style updated',
  };
}

export function resolveCaptionSelection({
  currentCaptionIds,
  captionId,
  append,
}: {
  currentCaptionIds: string[];
  captionId: string;
  append: boolean;
}): string[] {
  if (!append) {
    return [captionId];
  }

  if (currentCaptionIds.includes(captionId)) {
    return currentCaptionIds.filter((id) => id !== captionId);
  }

  return [...currentCaptionIds, captionId];
}

export function resolveJumpToCaptionPlan({
  project,
  captionId,
}: {
  project: EditorProject;
  captionId: string;
}): CaptionJumpPlan {
  const caption = project.captions.find((item) => item.id === captionId);
  if (!caption) {
    return { canJump: false, status: 'Caption not found' };
  }

  return {
    canJump: true,
    playhead: caption.start,
    selectedCaptionIds: [caption.id],
    status: `Jumped to caption ${formatTimecode(caption.start, project.fps)}`,
  };
}

export function resolveSplitActiveCaptionPlan({
  project,
  playhead,
  selectedCaptionIds,
}: {
  project: EditorProject;
  playhead: number;
  selectedCaptionIds: string[];
}): CaptionSplitPlan {
  const captionAtPlayhead = findCaptionAtTime(project, playhead);
  const selectedCaption = selectedCaptionIds.length === 1
    ? project.captions.find((caption) => caption.id === selectedCaptionIds[0])
    : undefined;
  const targetCaption = captionAtPlayhead ?? selectedCaption;

  if (!targetCaption) {
    return { canSplit: false, status: 'Select a caption or move playhead inside one' };
  }

  const splitTime = playhead > targetCaption.start && playhead < targetCaption.end
    ? playhead
    : roundTime(targetCaption.start + ((targetCaption.end - targetCaption.start) / 2));

  return {
    canSplit: true,
    commitLabel: 'Caption split',
    captionId: targetCaption.id,
    splitTime,
    playhead: splitTime,
    selectedCaptionIds: [targetCaption.id],
  };
}

export function resolveMergeSelectedCaptionsPlan(selectedCaptionIds: string[]): CaptionCommandPlan {
  if (selectedCaptionIds.length < 2) {
    return { canApply: false, status: 'Select at least two captions to merge' };
  }

  return {
    canApply: true,
    commitLabel: 'Captions merged',
    captionIds: selectedCaptionIds,
    selectedCaptionIds: [],
  };
}

export function resolveDeleteCaptionPlan({
  captionId,
  currentSelectedCaptionIds,
}: {
  captionId: string;
  currentSelectedCaptionIds: string[];
}): CaptionCommandPlan {
  return {
    canApply: true,
    commitLabel: 'Caption deleted',
    captionIds: [captionId],
    selectedCaptionIds: currentSelectedCaptionIds.filter((id) => id !== captionId),
  };
}

export function resolveDeleteSelectedCaptionsPlan(selectedCaptionIds: string[]): CaptionCommandPlan {
  if (selectedCaptionIds.length === 0) {
    return { canApply: false, status: 'Select at least one caption first' };
  }

  return {
    canApply: true,
    commitLabel: selectedCaptionIds.length > 1 ? 'Captions deleted' : 'Caption deleted',
    captionIds: selectedCaptionIds,
    selectedCaptionIds: [],
    status: `Deleted ${selectedCaptionIds.length} caption${selectedCaptionIds.length === 1 ? '' : 's'}`,
  };
}

export function resolveCaptionSidecarImportPlan({
  parsed,
  filename,
}: {
  parsed: ParsedCaptionSidecar;
  filename: string;
}): CaptionSidecarImportPlan {
  if (parsed.captions.length === 0) {
    return {
      canImport: false,
      status: `No captions found in ${filename}`,
    };
  }

  return {
    canImport: true,
    commitLabel: 'Caption sidecar imported',
    captions: parsed.captions,
    selectedCaptionIds: [parsed.captions[0].id],
    status: `Imported ${parsed.captions.length} ${parsed.format.toUpperCase()} captions${parsed.warnings.length ? ` (${parsed.warnings.length} warnings)` : ''}`,
  };
}

export function formatCaptionImportFailureStatus(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Caption import failed: ${message}`;
}
