import { getClipPlaybackSpeed } from './clip-timing';
import { clipHasTimelineAudio } from './media-metadata';
import { findClip, splitLinkedClipAtTime } from './timeline';
import type { EditorAsset, EditorProject, TimelineMarker } from './types';

export interface BeatDetectionOptions {
  threshold?: number;
  minSpacing?: number;
  maxBeats?: number;
}

export interface BeatMarker {
  time: number;
  sourceTime: number;
  strength: number;
}

export interface BeatDetectionPlan {
  clipId: string;
  trackId: string;
  beats: BeatMarker[];
  warnings: string[];
}

interface RequiredBeatDetectionOptions {
  threshold: number;
  minSpacing: number;
  maxBeats: number;
}

export function buildBeatDetectionPlan(
  project: EditorProject,
  clipId: string,
  options: BeatDetectionOptions = {},
): BeatDetectionPlan {
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
    throw new Error('Waveform peaks are required before beat detection.');
  }

  const normalizedOptions = normalizeOptions(options);
  const beats = detectBeats(peaks, asset, clip, normalizedOptions);

  return {
    clipId: clip.id,
    trackId: clip.trackId,
    beats,
    warnings: beats.length === 0
      ? ['No beats matched the threshold and spacing settings.']
      : [],
  };
}

export function addBeatMarkers(
  project: EditorProject,
  plan: BeatDetectionPlan,
  options: { replaceGenerated?: boolean } = {},
): EditorProject {
  const replaceGenerated = options.replaceGenerated ?? true;
  const existingMarkers = replaceGenerated
    ? project.markers.filter((marker) => !marker.id.startsWith(`marker-beat-${plan.clipId}-`))
    : project.markers;
  const existingIds = new Set(existingMarkers.map((marker) => marker.id));
  const beatMarkers = plan.beats.map((beat, index): TimelineMarker => {
    const id = uniqueMarkerId(`marker-beat-${plan.clipId}-${index + 1}`, existingIds);
    existingIds.add(id);
    return {
      id,
      time: beat.time,
      label: `Beat ${index + 1}`,
      color: '#f59e0b',
      kind: 'beat',
    };
  });

  return {
    ...project,
    markers: [...existingMarkers, ...beatMarkers].sort((a, b) => a.time - b.time),
    updatedAt: new Date().toISOString(),
  };
}

export function splitClipAtDetectedBeats(
  project: EditorProject,
  plan: BeatDetectionPlan,
): EditorProject {
  if (plan.beats.length === 0) {
    throw new Error('No beat points were detected.');
  }

  return plan.beats
    .slice()
    .sort((a, b) => a.time - b.time)
    .reduce((currentProject, beat) => {
      const clip = findSplitTargetClip(currentProject, plan.trackId, plan.clipId, beat.time);
      if (!clip) {
        return currentProject;
      }

      return splitLinkedClipAtTime(currentProject, clip.id, beat.time);
    }, project);
}

function detectBeats(
  peaks: number[],
  asset: EditorAsset,
  clip: NonNullable<ReturnType<typeof findClip>>,
  options: RequiredBeatDetectionOptions,
): BeatMarker[] {
  const segmentDuration = asset.duration / peaks.length;
  const speed = getClipPlaybackSpeed(clip);
  const sourceStart = clip.sourceIn;
  const sourceEnd = clip.sourceIn + (clip.duration * speed);
  const candidates = peaks
    .map((peak, index) => ({
      sourceTime: roundTime((index + 0.5) * segmentDuration),
      strength: Math.abs(peak),
      previous: Math.abs(peaks[Math.max(0, index - 1)] ?? 0),
      next: Math.abs(peaks[Math.min(peaks.length - 1, index + 1)] ?? 0),
    }))
    .filter((candidate) => (
      candidate.sourceTime >= sourceStart &&
      candidate.sourceTime <= sourceEnd &&
      candidate.strength >= options.threshold &&
      candidate.strength >= candidate.previous &&
      candidate.strength >= candidate.next
    ))
    .sort((a, b) => b.strength - a.strength);

  const selected = candidates.reduce<BeatMarker[]>((beats, candidate) => {
    const time = roundTime(clip.start + ((candidate.sourceTime - sourceStart) / speed));
    const tooClose = beats.some((beat) => Math.abs(beat.time - time) < options.minSpacing);
    if (tooClose) {
      return beats;
    }

    return [
      ...beats,
      {
        time,
        sourceTime: candidate.sourceTime,
        strength: roundTime(candidate.strength),
      },
    ];
  }, []);

  return selected
    .slice(0, options.maxBeats)
    .sort((a, b) => a.time - b.time);
}

function findSplitTargetClip(project: EditorProject, trackId: string, rootClipId: string, time: number) {
  const track = project.tracks.find((item) => item.id === trackId);
  return track?.clips.find((clip) => (
    isGeneratedSplitFromClip(clip.id, rootClipId) &&
    time > clip.start + 0.001 &&
    time < clip.start + clip.duration - 0.001
  ));
}

function isGeneratedSplitFromClip(clipId: string, rootClipId: string): boolean {
  return clipId === rootClipId || clipId.startsWith(`${rootClipId}-split-`);
}

function normalizeOptions(options: BeatDetectionOptions): RequiredBeatDetectionOptions {
  return {
    threshold: clampNumber(options.threshold ?? 0.65, 0, 1),
    minSpacing: clampNumber(options.minSpacing ?? 0.35, 0.05, 30),
    maxBeats: clampInteger(options.maxBeats ?? 64, 1, 512),
  };
}

function uniqueMarkerId(baseId: string, existingIds: Set<string>): string {
  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
