import { clampNumber, roundTime } from './editor-time-helpers';

export interface InsertTimelineGapCommitPlan {
  commitLabel: string;
  playhead: number;
  duration: number;
  trackIds: string[];
  nextPlayhead: number;
}

export interface CloseTimelineGapCommitPlan {
  commitLabel: string;
  trackId: string;
  playhead: number;
}

export interface CloseAllTimelineGapsCommitPlan {
  commitLabel: string;
  trackId: string;
}

export function resolveInsertTimelineGapAtPlayheadPlan({
  projectDuration,
  gapInsertDuration,
  playhead,
  selectedTrackId,
}: {
  projectDuration: number;
  gapInsertDuration: number;
  playhead: number;
  selectedTrackId: string;
}): InsertTimelineGapCommitPlan {
  const duration = roundTime(clampNumber(gapInsertDuration, 0.1, Math.max(0.1, projectDuration)));

  return {
    commitLabel: `Inserted ${duration}s gap`,
    playhead,
    duration,
    trackIds: [selectedTrackId],
    nextPlayhead: roundTime(playhead + duration),
  };
}

export function resolveCloseTimelineGapAtPlayheadPlan({
  selectedTrackId,
  playhead,
}: {
  selectedTrackId: string;
  playhead: number;
}): CloseTimelineGapCommitPlan {
  return {
    commitLabel: 'Closed timeline gap',
    trackId: selectedTrackId,
    playhead,
  };
}

export function resolveCloseAllTimelineGapsOnTrackPlan({
  selectedTrackId,
}: {
  selectedTrackId: string;
}): CloseAllTimelineGapsCommitPlan {
  return {
    commitLabel: 'Closed all timeline gaps',
    trackId: selectedTrackId,
  };
}
