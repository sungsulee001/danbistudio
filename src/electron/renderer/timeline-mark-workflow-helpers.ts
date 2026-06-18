import {
  copyClipsInRange,
  cutClipsInRange,
  expandClipIdsWithLinkedAndGroupedClips,
  findClipSelectionRange,
  type TimelineRange,
} from '../../lib/editor/timeline';
import type { EditorProject, TimelineClip } from '../../lib/editor/types';
import { formatTimecode, roundTime } from './editor-time-helpers';

export type TimelineMarkType = 'in' | 'out';

export interface SetTimelineMarkPlan {
  type: TimelineMarkType;
  time: number;
  status: string;
}

export interface GoToTimelineMarkPlan {
  canSeek: boolean;
  status: string;
  playhead?: number;
}

export interface ClearTimelineMarksPlan {
  markIn: null;
  markOut: null;
  loopPlaybackEnabled: false;
  exportRangeMode: 'timeline';
  status: string;
}

export interface MarkSelectedTimelineClipsPlan {
  canMark: boolean;
  status: string;
  markIn?: number;
  markOut?: number;
}

export interface CopyMarkedTimelineRangePlan {
  canCopy: boolean;
  status: string;
  clips: TimelineClip[];
}

export interface CutMarkedTimelineRangePlan {
  canCut: boolean;
  status: string;
  clips: TimelineClip[];
  project?: EditorProject;
  commitLabel?: string;
  nextPlayhead?: number;
  selectedClipId?: string;
  selectedClipIds?: string[];
}

export interface DeleteMarkedTimelineRangePlan {
  canDelete: boolean;
  status?: string;
  commitLabel?: string;
  trackIds?: string[];
  nextPlayhead?: number;
  selectedClipId?: string;
  selectedClipIds?: string[];
}

export function resolveSetTimelineMark({
  type,
  playhead,
  fps,
}: {
  type: TimelineMarkType;
  playhead: number;
  fps: number;
}): SetTimelineMarkPlan {
  const time = roundTime(playhead);
  return {
    type,
    time,
    status: `${type === 'in' ? 'In' : 'Out'} point set at ${formatTimecode(time, fps)}`,
  };
}

export function resolveGoToTimelineMark({
  type,
  markIn,
  markOut,
  fps,
}: {
  type: TimelineMarkType;
  markIn: number | null;
  markOut: number | null;
  fps: number;
}): GoToTimelineMarkPlan {
  const target = type === 'in' ? markIn : markOut;
  if (target === null) {
    return {
      canSeek: false,
      status: `${type === 'in' ? 'In' : 'Out'} point is not set`,
    };
  }

  return {
    canSeek: true,
    playhead: target,
    status: `Moved to ${type === 'in' ? 'In' : 'Out'} point ${formatTimecode(target, fps)}`,
  };
}

export function resolveClearTimelineMarks(): ClearTimelineMarksPlan {
  return {
    markIn: null,
    markOut: null,
    loopPlaybackEnabled: false,
    exportRangeMode: 'timeline',
    status: 'In/out points cleared',
  };
}

export function resolveMarkSelectedTimelineClips({
  project,
  selectedClipIds,
}: {
  project: EditorProject;
  selectedClipIds: string[];
}): MarkSelectedTimelineClipsPlan {
  const range = findClipSelectionRange(project, selectedClipIds);
  if (!range) {
    return { canMark: false, status: 'Select a clip first' };
  }

  return {
    canMark: true,
    markIn: range.start,
    markOut: range.end,
    status: `Marked selection ${formatTimecode(range.start, project.fps)} - ${formatTimecode(range.end, project.fps)}`,
  };
}

export function resolveCopyMarkedTimelineRangePlan({
  project,
  markedRange,
  selectedTrackId,
  allTracks,
}: {
  project: EditorProject;
  markedRange: TimelineRange | null;
  selectedTrackId: string;
  allTracks: boolean;
}): CopyMarkedTimelineRangePlan {
  if (!markedRange) {
    return {
      canCopy: false,
      clips: [],
      status: 'Set both in and out points first',
    };
  }

  const clips = copyClipsInRange(project, markedRange, {
    trackIds: allTracks ? undefined : [selectedTrackId],
  });
  if (clips.length === 0) {
    return {
      canCopy: false,
      clips,
      status: `No selectable clips in marked range${allTracks ? ' on all tracks' : ''}`,
    };
  }

  return {
    canCopy: true,
    clips,
    status: `Copied ${clips.length} ranged clip${clips.length > 1 ? 's' : ''}${allTracks ? ' from all tracks' : ''}`,
  };
}

export function resolveCutMarkedTimelineRangePlan({
  project,
  markedRange,
  selectedTrackId,
  allTracks,
  ripple,
}: {
  project: EditorProject;
  markedRange: TimelineRange | null;
  selectedTrackId: string;
  allTracks: boolean;
  ripple: boolean;
}): CutMarkedTimelineRangePlan {
  if (!markedRange) {
    return {
      canCut: false,
      clips: [],
      status: 'Set both in and out points first',
    };
  }

  const result = cutClipsInRange(project, markedRange, {
    trackIds: allTracks ? undefined : [selectedTrackId],
    ripple,
  });
  if (result.clips.length === 0) {
    return {
      canCut: false,
      clips: [],
      status: `No selectable clips in marked range${allTracks ? ' on all tracks' : ''}`,
    };
  }

  return {
    canCut: true,
    project: result.project,
    clips: result.clips,
    commitLabel: ripple ? 'Extract cut marked range' : 'Lift cut marked range',
    nextPlayhead: markedRange.start,
    selectedClipId: '',
    selectedClipIds: [],
    status: `${ripple ? 'Extract cut' : 'Lift cut'} ${result.clips.length} ranged clip${result.clips.length > 1 ? 's' : ''}${allTracks ? ' from all tracks' : ''}`,
  };
}

export function resolveDeleteMarkedTimelineRangePlan({
  project,
  markedRange,
  selectedClips,
  selectedTrackId,
  ripple,
}: {
  project: EditorProject;
  markedRange: TimelineRange | null;
  selectedClips: TimelineClip[];
  selectedTrackId: string;
  ripple: boolean;
}): DeleteMarkedTimelineRangePlan {
  if (!markedRange) {
    return { canDelete: false, status: 'Set both in and out points first' };
  }

  const selectedRangeClipIds = selectedClips.length > 0
    ? expandClipIdsWithLinkedAndGroupedClips(project, selectedClips.map((clip) => clip.id))
    : [];
  const trackIds = selectedRangeClipIds.length > 0
    ? Array.from(new Set(project.tracks.flatMap((track) => (
      track.clips.some((clip) => selectedRangeClipIds.includes(clip.id)) ? [track.id] : []
    ))))
    : [selectedTrackId];

  return {
    canDelete: true,
    commitLabel: ripple ? 'Extracted marked range' : 'Lifted marked range',
    trackIds,
    nextPlayhead: markedRange.start,
    selectedClipId: '',
    selectedClipIds: [],
  };
}
