import { expandClipIdsWithLinkedAndGroupedClips } from '../../lib/editor/timeline';
import type { EditorProject, TimelineClip } from '../../lib/editor/types';

export type ClipEditCommandPlan =
  | {
    canCommit: false;
    status: string;
  }
  | {
    canCommit: true;
    commitLabel: string;
    targetClipIds: string[];
    status?: string;
    nextSelectedClipIds?: string[];
    nextSelectedClipId?: string;
    gapSeconds?: number;
    nextPrimarySelection?: string;
  };

export interface DuplicatedClipSelectionState {
  duplicatedClipIds: string[];
  nextPrimaryClipId: string;
  nextTrackId: string;
  nextPlayhead: number;
  status: string;
}

export function resolveDeleteSelectedClipsPlan({
  project,
  selectedClips,
  ripple,
}: {
  project: EditorProject;
  selectedClips: TimelineClip[];
  ripple: boolean;
}): ClipEditCommandPlan {
  if (selectedClips.length === 0) {
    return { canCommit: false, status: 'Select a clip first' };
  }

  return {
    canCommit: true,
    commitLabel: ripple ? 'Ripple deleted clips' : 'Deleted clips',
    targetClipIds: expandSelectedClipIds(project, selectedClips),
    nextPrimarySelection: '',
  };
}

export function resolveGroupSelectedClipsPlan({
  project,
  selectedClips,
}: {
  project: EditorProject;
  selectedClips: TimelineClip[];
}): ClipEditCommandPlan {
  if (selectedClips.length < 2) {
    return { canCommit: false, status: 'Select at least two clips to group' };
  }

  const nextSelection = expandSelectedClipIds(project, selectedClips);
  return {
    canCommit: true,
    commitLabel: 'Clips grouped',
    targetClipIds: selectedClips.map((clip) => clip.id),
    nextSelectedClipIds: nextSelection,
    nextSelectedClipId: nextSelection[0] ?? '',
  };
}

export function resolveUngroupSelectedClipsPlan({
  project,
  selectedClips,
}: {
  project: EditorProject;
  selectedClips: TimelineClip[];
}): ClipEditCommandPlan {
  if (selectedClips.length === 0) {
    return { canCommit: false, status: 'Select a grouped clip first' };
  }

  const nextSelection = expandSelectedClipIds(project, selectedClips);
  return {
    canCommit: true,
    commitLabel: 'Clips ungrouped',
    targetClipIds: selectedClips.map((clip) => clip.id),
    nextSelectedClipIds: nextSelection,
    nextSelectedClipId: nextSelection[0] ?? '',
  };
}

export function resolveArrangeSelectedClipsPlan({
  selectedClips,
  gapSeconds,
}: {
  selectedClips: TimelineClip[];
  gapSeconds: number;
}): ClipEditCommandPlan {
  if (selectedClips.length < 2) {
    return { canCommit: false, status: 'Select at least two clips to arrange' };
  }

  const normalizedGap = roundTime(clampNumber(gapSeconds, 0, 60));
  return {
    canCommit: true,
    commitLabel: normalizedGap === 0 ? 'Packed selected clips' : 'Arranged selected clips',
    targetClipIds: selectedClips.map((clip) => clip.id),
    gapSeconds: normalizedGap,
    status: `Arranged ${selectedClips.length} clips with ${normalizedGap.toFixed(2)}s gap`,
  };
}

export function resolveDuplicateSelectedClipsPlan(
  selectedClips: TimelineClip[],
): ClipEditCommandPlan {
  if (selectedClips.length === 0) {
    return { canCommit: false, status: 'Select a clip first' };
  }

  return {
    canCommit: true,
    commitLabel: selectedClips.length > 1 ? 'Clips duplicated' : 'Clip duplicated',
    targetClipIds: selectedClips.map((clip) => clip.id),
  };
}

export function resolveSelectedClipEditPlan({
  selectedClip,
  label,
}: {
  selectedClip?: TimelineClip | null;
  label: string;
}): ClipEditCommandPlan {
  if (!selectedClip) {
    return { canCommit: false, status: 'Select a clip first' };
  }

  return {
    canCommit: true,
    commitLabel: label,
    targetClipIds: [selectedClip.id],
  };
}

export function resolveSelectedClipsPatchPlan({
  selectedClips,
  label,
}: {
  selectedClips: TimelineClip[];
  label: string;
}): ClipEditCommandPlan {
  if (selectedClips.length === 0) {
    return { canCommit: false, status: 'Select a clip first' };
  }

  return {
    canCommit: true,
    commitLabel: selectedClips.length > 1 ? label.replace('Clip ', 'Clips ') : label,
    targetClipIds: selectedClips.map((clip) => clip.id),
  };
}

export function resolveDuplicatedClipSelectionState({
  previousProject,
  nextProject,
  fallbackPrimaryClipId,
  fallbackTrackId,
  fallbackPlayhead,
}: {
  previousProject: EditorProject;
  nextProject: EditorProject;
  fallbackPrimaryClipId: string;
  fallbackTrackId: string;
  fallbackPlayhead: number;
}): DuplicatedClipSelectionState {
  const previousClipIds = new Set(previousProject.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const duplicatedClips = nextProject.tracks
    .flatMap((track) => track.clips)
    .filter((clip) => !previousClipIds.has(clip.id))
    .sort((a, b) => a.start - b.start);
  const duplicatedClipIds = duplicatedClips.map((clip) => clip.id);

  return {
    duplicatedClipIds,
    nextPrimaryClipId: duplicatedClips[0]?.id ?? fallbackPrimaryClipId,
    nextTrackId: duplicatedClips[0]?.trackId ?? fallbackTrackId,
    nextPlayhead: duplicatedClips[0]?.start ?? fallbackPlayhead,
    status: `Duplicated ${duplicatedClipIds.length} clip${duplicatedClipIds.length === 1 ? '' : 's'}`,
  };
}

function expandSelectedClipIds(project: EditorProject, selectedClips: TimelineClip[]): string[] {
  return expandClipIdsWithLinkedAndGroupedClips(project, selectedClips.map((clip) => clip.id));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
