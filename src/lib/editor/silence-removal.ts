import { getClipPlaybackSpeed } from './clip-timing';
import { clipHasTimelineAudio } from './media-metadata';
import { deleteClips, expandClipIdsWithLinkedClips, findClip, splitClipAtTime, splitLinkedClipAtTime } from './timeline';
import type { EditorProject, TimelineClip } from './types';

export interface SilenceRemovalOptions {
  threshold?: number;
  minSilenceDuration?: number;
  padding?: number;
  ripple?: boolean;
}

export interface SilenceRemovalRange {
  start: number;
  end: number;
  duration: number;
  sourceStart: number;
  sourceEnd: number;
}

export interface SilenceRemovalPlan {
  clipId: string;
  trackId: string;
  ranges: SilenceRemovalRange[];
  removedDuration: number;
  warnings: string[];
}

interface RequiredSilenceRemovalOptions {
  threshold: number;
  minSilenceDuration: number;
  padding: number;
  ripple: boolean;
}

export function buildSilenceRemovalPlan(
  project: EditorProject,
  clipId: string,
  options: SilenceRemovalOptions = {},
): SilenceRemovalPlan {
  const clip = findClip(project, clipId);
  if (!clip) {
    throw new Error('Clip not found.');
  }

  const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
  if (!asset || !clipHasTimelineAudio(clip, asset)) {
    throw new Error('Select an audio clip or a video clip with audio.');
  }

  const peaks = asset.mediaCache?.waveformPeaks;
  if (!peaks?.length) {
    throw new Error('Waveform peaks are required before silence removal.');
  }

  const normalizedOptions = normalizeOptions(options);
  const sourceRanges = detectSilentSourceRanges(peaks, asset.duration, normalizedOptions);
  const timelineRanges = mapSourceSilenceToTimeline(clip, sourceRanges, normalizedOptions);

  return {
    clipId: clip.id,
    trackId: clip.trackId,
    ranges: timelineRanges,
    removedDuration: roundTime(timelineRanges.reduce((duration, range) => duration + range.duration, 0)),
    warnings: timelineRanges.length === 0
      ? ['No silence ranges matched the threshold and minimum duration.']
      : [],
  };
}

export function removeDetectedSilence(
  project: EditorProject,
  clipId: string,
  options: SilenceRemovalOptions = {},
): { project: EditorProject; plan: SilenceRemovalPlan } {
  const plan = buildSilenceRemovalPlan(project, clipId, options);
  if (plan.ranges.length === 0) {
    throw new Error('No removable silence was detected.');
  }

  const normalizedOptions = normalizeOptions(options);
  const editedProject = plan.ranges
    .slice()
    .sort((a, b) => b.start - a.start)
    .reduce((currentProject, range) => deleteDetectedSilenceRange(currentProject, plan, range, normalizedOptions), project);

  return { project: editedProject, plan };
}

function deleteDetectedSilenceRange(
  project: EditorProject,
  plan: SilenceRemovalPlan,
  range: SilenceRemovalRange,
  options: RequiredSilenceRemovalOptions,
): EditorProject {
  let editedProject = project;
  const endTarget = findSilenceTargetClip(editedProject, plan.trackId, plan.clipId, range.end);
  if (endTarget && isTimeInsideClip(endTarget, range.end)) {
    editedProject = splitSilenceTargetAtTime(editedProject, endTarget.id, range.end);
  }

  const startTarget = findSilenceTargetClip(editedProject, plan.trackId, plan.clipId, range.start);
  if (!startTarget) {
    throw new Error('Selected clip no longer overlaps a detected silence range.');
  }

  if (isTimeInsideClip(startTarget, range.start)) {
    editedProject = splitSilenceTargetAtTime(editedProject, startTarget.id, range.start);
  }

  const removalTarget = findSilenceRemovalClip(editedProject, plan.trackId, plan.clipId, range.start);
  if (!removalTarget) {
    throw new Error('Detected silence range could not be isolated.');
  }

  const removalIds = expandClipIdsWithLinkedClips(editedProject, [removalTarget.id]).filter((clipId) => {
    const clip = findClip(editedProject, clipId);
    return Boolean(
      clip &&
      Math.abs(clip.start - removalTarget.start) <= 0.002 &&
      Math.abs(clip.duration - removalTarget.duration) <= 0.002,
    );
  });
  return deleteClips(editedProject, removalIds, options.ripple);
}

function splitSilenceTargetAtTime(project: EditorProject, clipId: string, time: number): EditorProject {
  try {
    return splitLinkedClipAtTime(project, clipId, time);
  } catch (error) {
    if ((error as Error).message !== 'Linked clips must overlap the split time.') {
      throw error;
    }

    return splitClipAtTime(project, clipId, time);
  }
}

function findSilenceTargetClip(project: EditorProject, trackId: string, rootClipId: string, time: number): TimelineClip | undefined {
  const track = project.tracks.find((item) => item.id === trackId);
  return track?.clips.find((clip) => (
    isGeneratedSplitFromClip(clip.id, rootClipId) &&
    time >= clip.start - 0.001 &&
    time <= clip.start + clip.duration + 0.001
  ));
}

function isGeneratedSplitFromClip(clipId: string, rootClipId: string): boolean {
  return clipId === rootClipId || clipId.startsWith(`${rootClipId}-split-`);
}

function findSilenceRemovalClip(project: EditorProject, trackId: string, rootClipId: string, start: number): TimelineClip | undefined {
  const probeTime = roundTime(start + 0.001);
  const track = project.tracks.find((item) => item.id === trackId);
  return track?.clips.find((clip) => (
    isGeneratedSplitFromClip(clip.id, rootClipId) &&
    probeTime >= clip.start + 0.001 &&
    probeTime < clip.start + clip.duration - 0.001
  ));
}

function isTimeInsideClip(clip: TimelineClip, time: number): boolean {
  return time > clip.start + 0.001 && time < clip.start + clip.duration - 0.001;
}

function detectSilentSourceRanges(
  peaks: number[],
  assetDuration: number,
  options: RequiredSilenceRemovalOptions,
): Array<{ start: number; end: number }> {
  if (peaks.length === 0 || assetDuration <= 0) {
    return [];
  }

  const segmentDuration = assetDuration / peaks.length;
  const ranges: Array<{ start: number; end: number }> = [];
  let runStartIndex: number | null = null;

  peaks.forEach((peak, index) => {
    if (Math.abs(peak) <= options.threshold) {
      runStartIndex ??= index;
      return;
    }

    if (runStartIndex !== null) {
      ranges.push({ start: runStartIndex * segmentDuration, end: index * segmentDuration });
      runStartIndex = null;
    }
  });

  if (runStartIndex !== null) {
    ranges.push({ start: runStartIndex * segmentDuration, end: assetDuration });
  }

  return ranges
    .map((range) => ({
      start: roundTime(Math.min(assetDuration, range.start + options.padding)),
      end: roundTime(Math.max(0, range.end - options.padding)),
    }))
    .filter((range) => range.end - range.start >= options.minSilenceDuration);
}

function mapSourceSilenceToTimeline(
  clip: TimelineClip,
  sourceRanges: Array<{ start: number; end: number }>,
  options: RequiredSilenceRemovalOptions,
): SilenceRemovalRange[] {
  const speed = getClipPlaybackSpeed(clip);
  const clipSourceStart = clip.sourceIn;
  const clipSourceEnd = clip.sourceIn + (clip.duration * speed);

  return sourceRanges
    .map((range) => {
      const sourceStart = Math.max(clipSourceStart, range.start);
      const sourceEnd = Math.min(clipSourceEnd, range.end);
      const start = roundTime(clip.start + ((sourceStart - clipSourceStart) / speed));
      const end = roundTime(clip.start + ((sourceEnd - clipSourceStart) / speed));

      return {
        start,
        end,
        duration: roundTime(end - start),
        sourceStart: roundTime(sourceStart),
        sourceEnd: roundTime(sourceEnd),
      };
    })
    .filter((range) => range.duration >= options.minSilenceDuration);
}

function normalizeOptions(options: SilenceRemovalOptions): RequiredSilenceRemovalOptions {
  return {
    threshold: clampNumber(options.threshold ?? 0.04, 0, 1),
    minSilenceDuration: clampNumber(options.minSilenceDuration ?? 0.45, 0.1, 30),
    padding: clampNumber(options.padding ?? 0.08, 0, 5),
    ripple: options.ripple ?? true,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
