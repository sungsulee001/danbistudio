import { findAdjacentMarker, type EditableMarkerPatch } from '../../lib/editor/timeline';
import { timelineMarkerTimeFromDrag, timelinePointerDeltaSeconds } from '../../lib/editor/timeline-view';
import type { EditorProject, TimelineMarker } from '../../lib/editor/types';
import type { TimelineEditGuide } from './editor-view-model';
import { formatTimecode } from './editor-time-helpers';

export interface MarkerDragSessionState {
  markerId: string;
  pointerX: number;
  scrollLeft: number;
  startTime: number;
  nextTime: number;
  moved: boolean;
  label: string;
}

export interface MarkerTimePreviewState {
  id: string;
  time: number;
}

export interface MarkerMutationPlan {
  commitLabel: string;
  markerId?: string;
  time?: number;
  label?: string;
  patch?: EditableMarkerPatch;
  nextPlayhead?: number;
}

export type MarkerJumpPlan =
  | {
    canJump: false;
    status: string;
  }
  | {
    canJump: true;
    markerId: string;
    time: number;
    status: string;
  };

export type MarkerDragCommitPlan =
  | {
    canCommit: false;
  }
  | {
    canCommit: true;
    commitLabel: string;
    markerId: string;
    patch: EditableMarkerPatch;
    nextPlayhead: number;
  };

export interface MarkerDragStartPlan {
  activeMonitor: 'program';
  dragState: MarkerDragSessionState;
  markerTimePreview: MarkerTimePreviewState;
  editGuide: TimelineEditGuide;
}

export interface MarkerDragMovePlan {
  dragState: MarkerDragSessionState;
  markerTimePreview: MarkerTimePreviewState;
  editGuide: TimelineEditGuide;
}

export function resolveAddTimelineMarkerPlan({
  time,
  label,
}: {
  time: number;
  label: string;
}): MarkerMutationPlan {
  return {
    commitLabel: 'Marker added',
    time,
    label,
  };
}

export function resolveUpdateTimelineMarkerPlan({
  markerId,
  patch,
}: {
  markerId: string;
  patch: EditableMarkerPatch;
}): MarkerMutationPlan {
  return {
    commitLabel: 'Marker updated',
    markerId,
    patch,
  };
}

export function resolveMoveTimelineMarkerToPlayheadPlan({
  markerId,
  playhead,
}: {
  markerId: string;
  playhead: number;
}): MarkerMutationPlan {
  return resolveUpdateTimelineMarkerPlan({
    markerId,
    patch: { time: playhead },
  });
}

export function resolveDeleteTimelineMarkerPlan(markerId: string): MarkerMutationPlan {
  return {
    commitLabel: 'Marker deleted',
    markerId,
  };
}

export function resolveTimelineMarkerDragStartPlan({
  marker,
  pointerX,
  scrollLeft,
}: {
  marker: TimelineMarker;
  pointerX: number;
  scrollLeft: number;
}): MarkerDragStartPlan {
  return {
    activeMonitor: 'program',
    dragState: {
      markerId: marker.id,
      pointerX,
      scrollLeft,
      startTime: marker.time,
      nextTime: marker.time,
      moved: false,
      label: marker.label,
    },
    markerTimePreview: { id: marker.id, time: marker.time },
    editGuide: {
      time: marker.time,
      label: `Marker ${marker.label}`,
      tone: 'move',
    },
  };
}

export function resolveTimelineMarkerDragMovePlan({
  dragState,
  currentClientX,
  currentScrollLeft,
  pixelsPerSecond,
  duration,
  fps,
}: {
  dragState: MarkerDragSessionState;
  currentClientX: number;
  currentScrollLeft: number;
  pixelsPerSecond: number;
  duration: number;
  fps: number;
}): MarkerDragMovePlan {
  const deltaSeconds = timelinePointerDeltaSeconds({
    originClientXPixels: dragState.pointerX,
    currentClientXPixels: currentClientX,
    originScrollLeftPixels: dragState.scrollLeft,
    currentScrollLeftPixels: currentScrollLeft,
    pixelsPerSecond,
  });
  const nextTime = timelineMarkerTimeFromDrag({
    startTimeSeconds: dragState.startTime,
    deltaSeconds,
    durationSeconds: duration,
    frameRate: fps,
  });

  return {
    dragState: {
      ...dragState,
      nextTime,
      moved: Math.abs(nextTime - dragState.startTime) > 0.001,
    },
    markerTimePreview: { id: dragState.markerId, time: nextTime },
    editGuide: {
      time: nextTime,
      label: `${dragState.label} ${formatTimecode(nextTime, fps)}`,
      tone: Math.abs(nextTime - (dragState.startTime + deltaSeconds)) > 0.001 ? 'limit' : 'move',
    },
  };
}

export function resolveDraggedTimelineMarkerCommitPlan({
  markerId,
  moved,
  nextTime,
  duration,
}: {
  markerId: string;
  moved: boolean;
  nextTime: number;
  duration: number;
}): MarkerDragCommitPlan {
  if (!moved) {
    return { canCommit: false };
  }

  return {
    canCommit: true,
    commitLabel: 'Marker moved',
    markerId,
    patch: { time: nextTime },
    nextPlayhead: clampTime(nextTime, duration),
  };
}

export function resolveJumpToTimelineMarkerPlan({
  markers,
  markerId,
}: {
  markers: TimelineMarker[];
  markerId: string;
}): MarkerJumpPlan {
  const marker = markers.find((item) => item.id === markerId);
  if (!marker) {
    return { canJump: false, status: 'Marker not found' };
  }

  return {
    canJump: true,
    markerId: marker.id,
    time: marker.time,
    status: formatJumpedToMarkerStatus(marker),
  };
}

export function resolveJumpAdjacentTimelineMarkerPlan({
  project,
  playhead,
  direction,
}: {
  project: EditorProject;
  playhead: number;
  direction: 'previous' | 'next';
}): MarkerJumpPlan {
  const marker = findAdjacentMarker(project, playhead, direction);
  if (!marker) {
    return {
      canJump: false,
      status: direction === 'previous' ? 'No previous marker' : 'No next marker',
    };
  }

  return {
    canJump: true,
    markerId: marker.id,
    time: marker.time,
    status: formatJumpedToMarkerStatus(marker),
  };
}

function formatJumpedToMarkerStatus(marker: Pick<TimelineMarker, 'label'>): string {
  return `Jumped to marker ${marker.label}`;
}

function clampTime(time: number, duration: number): number {
  return Math.min(Math.max(time, 0), duration);
}
