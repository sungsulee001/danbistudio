import type { EditableTrackPatch } from '../../lib/editor/timeline';
import type { TimelineTrack } from '../../lib/editor/types';

export type TrackToggleState = 'muted' | 'solo' | 'locked' | 'syncLocked';
export type TrackMoveDirection = 'up' | 'down';
export type SourcePatchTargetKind = 'primary' | 'audio';

export interface SourcePatchTrackOption {
  id: string;
  name: string;
  kind: TimelineTrack['kind'];
  disabled: boolean;
  disabledReason?: string;
}

export type TrackMutationPlan =
  | {
    canCommit: false;
    status?: string;
  }
  | {
    canCommit: true;
    commitLabel: string;
    trackId: string;
    patch?: EditableTrackPatch;
    direction?: TrackMoveDirection;
    nextSelectedTrackId?: string;
  };

export interface TrackSelectionPlan {
  selectedTrackId: string;
  sourcePrimaryPatchTrackId?: string;
  sourcePrimaryPatchEnabled?: true;
  sourceAudioPatchTrackId?: string;
  sourceAudioPatchEnabled?: true;
}

export function resolveTrackTogglePlan({
  trackId,
  state,
}: {
  trackId: string;
  state: TrackToggleState;
}): TrackMutationPlan {
  return {
    canCommit: true,
    commitLabel: `Track ${state} toggled`,
    trackId,
  };
}

export function resolveTrackSelectionPlan(track: TimelineTrack): TrackSelectionPlan {
  return resolveSourcePatchTrackSelectionPlan({
    trackId: track.id,
    targetKind: track.kind === 'audio' ? 'audio' : 'primary',
  });
}

export function resolveSourcePatchTrackSelectionPlan({
  trackId,
  targetKind,
}: {
  trackId: string;
  targetKind: SourcePatchTargetKind;
}): TrackSelectionPlan {
  if (targetKind === 'audio') {
    return {
      selectedTrackId: trackId,
      sourceAudioPatchTrackId: trackId,
      sourceAudioPatchEnabled: true,
    };
  }

  return {
    selectedTrackId: trackId,
    sourcePrimaryPatchTrackId: trackId,
    sourcePrimaryPatchEnabled: true,
  };
}

export function resolveSourcePatchTrackOptions({
  tracks,
  targetKind,
}: {
  tracks: TimelineTrack[];
  targetKind: TimelineTrack['kind'];
}): SourcePatchTrackOption[] {
  return tracks
    .filter((track) => track.kind === targetKind)
    .map((track) => ({
      id: track.id,
      name: track.name,
      kind: track.kind,
      disabled: Boolean(track.locked),
      disabledReason: track.locked ? 'Track is locked' : undefined,
    }));
}

export function resolveTrackMixerChangePlan({
  trackId,
  patch,
}: {
  trackId: string;
  patch: Pick<EditableTrackPatch, 'volumeDb' | 'pan'>;
}): TrackMutationPlan {
  return {
    canCommit: true,
    commitLabel: 'Track mix updated',
    trackId,
    patch,
  };
}

export function resolveTrackRenamePlan({
  track,
  name,
}: {
  track: TimelineTrack;
  name: string;
}): TrackMutationPlan {
  const nextName = name.trim();
  if (!nextName) {
    return {
      canCommit: false,
      status: 'Track name cannot be empty',
    };
  }

  if (nextName === track.name) {
    return { canCommit: false };
  }

  return {
    canCommit: true,
    commitLabel: 'Track renamed',
    trackId: track.id,
    patch: { name: nextName },
  };
}

export function resolveMoveTrackPlan({
  trackId,
  direction,
}: {
  trackId: string;
  direction: TrackMoveDirection;
}): TrackMutationPlan {
  return {
    canCommit: true,
    commitLabel: direction === 'up' ? 'Track moved up' : 'Track moved down',
    trackId,
    direction,
    nextSelectedTrackId: trackId,
  };
}

export function resolveRemoveTrackPlan({
  track,
  tracks,
}: {
  track: TimelineTrack;
  tracks: TimelineTrack[];
}): TrackMutationPlan {
  if (track.clips.length > 0) {
    return {
      canCommit: false,
      status: 'Remove or move clips before deleting this track',
    };
  }

  return {
    canCommit: true,
    commitLabel: 'Track removed',
    trackId: track.id,
    nextSelectedTrackId: tracks.find((item) => item.id !== track.id)?.id ?? '',
  };
}
