import type { EditorProject, TimelineClip } from '../../lib/editor/types';
import { resolveEditableTrackId } from './timeline-source-helpers';

export type CreatedClipKind = TimelineClip['kind'];

export type CreatedClipSelectionState = {
  clipId: string;
  trackId: string;
  activeMonitor: 'program';
};

export type ClipCreateCommandPlan =
  | {
    canCommit: false;
    status: string;
  }
  | {
    canCommit: true;
    commitLabel: string;
    clipId: string;
  };

export function resolveAddTitleClipPlan({
  project,
  selectedTrackId,
  fallbackTrackId,
}: {
  project: EditorProject;
  selectedTrackId?: string;
  fallbackTrackId?: string;
}): {
  commitLabel: string;
  targetTrackId?: string;
} {
  return {
    commitLabel: 'Title clip added',
    targetTrackId: resolveEditableTrackId(project, 'text', selectedTrackId, fallbackTrackId),
  };
}

export function resolveAddAdjustmentLayerPlan({
  project,
  playhead,
}: {
  project: EditorProject;
  playhead: number;
}): {
  commitLabel: string;
  start: number;
  duration: number;
  status: string;
} {
  return {
    commitLabel: 'Adjustment layer added',
    start: playhead,
    duration: Math.max(0.25, project.duration - playhead),
    status: 'Adjustment layer added; apply Color, LUT, FX, or AI FX presets from the Inspector',
  };
}

export function resolveCreatedClipSelection({
  clip,
}: {
  clip?: TimelineClip | null;
}): CreatedClipSelectionState | null {
  return clip ? { clipId: clip.id, trackId: clip.trackId, activeMonitor: 'program' } : null;
}

export function resolveCreatedTimelineClipSelection({
  previousProject,
  nextProject,
  kind,
}: {
  previousProject: EditorProject;
  nextProject: EditorProject;
  kind: CreatedClipKind;
}): CreatedClipSelectionState | null {
  const previousClipIds = new Set(previousProject.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const createdClip = nextProject.tracks
    .flatMap((track) => track.clips)
    .find((clip) => !previousClipIds.has(clip.id) && clip.kind === kind);

  return resolveCreatedClipSelection({ clip: createdClip });
}

export function resolveTitleTextPatchPlan({
  selectedClip,
}: {
  selectedClip?: TimelineClip | null;
}): ClipCreateCommandPlan {
  if (!selectedClip) {
    return { canCommit: false, status: 'Select a title clip first' };
  }

  return {
    canCommit: true,
    commitLabel: 'Title text updated',
    clipId: selectedClip.id,
  };
}

export function resolveTitleStylePatchPlan({
  selectedClip,
  selectedIsTitleClip,
}: {
  selectedClip?: TimelineClip | null;
  selectedIsTitleClip: boolean;
}): ClipCreateCommandPlan {
  if (!selectedClip || !selectedIsTitleClip) {
    return { canCommit: false, status: 'Select a title clip first' };
  }

  return {
    canCommit: true,
    commitLabel: 'Title style updated',
    clipId: selectedClip.id,
  };
}
