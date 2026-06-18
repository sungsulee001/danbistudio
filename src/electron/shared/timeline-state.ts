import { migrateProjectJson } from './project-schema';
import type { CaptionSegment, EditorProject, TimelineClip, TimelineMarker, TimelineTrack } from '../../lib/editor/types';

export interface TimelineClipState {
  id: string;
  trackId: string;
  assetId?: string;
  kind: TimelineClip['kind'];
  name: string;
  start: number;
  end: number;
  duration: number;
  sourceIn: number;
  speed: number;
  muted: boolean;
  locked: boolean;
  effectCount: number;
  keyframeCount: number;
}

export interface TimelineTrackState {
  id: string;
  name: string;
  kind: TimelineTrack['kind'];
  muted: boolean;
  solo: boolean;
  locked: boolean;
  syncLocked: boolean;
  clipIds: string[];
}

export interface TimelineStateSnapshot {
  projectId: string;
  schemaVersion: number;
  fps: number;
  width: number;
  height: number;
  duration: number;
  updatedAt: string;
  tracks: TimelineTrackState[];
  clips: TimelineClipState[];
  markers: TimelineMarker[];
  captions: CaptionSegment[];
  assetUsage: Array<{
    assetId: string;
    clipIds: string[];
  }>;
}

export type TimelineProjectUpdater = (project: EditorProject) => Partial<EditorProject> | EditorProject;

export function buildTimelineStateSnapshot(project: EditorProject): TimelineStateSnapshot {
  const migrated = migrateProjectJson(project);
  const clips = migrated.tracks.flatMap((track) => track.clips.map((clip) => toClipState(track, clip)));

  return {
    projectId: migrated.id,
    schemaVersion: migrated.schemaVersion,
    fps: migrated.fps,
    width: migrated.width,
    height: migrated.height,
    duration: migrated.duration,
    updatedAt: migrated.updatedAt,
    tracks: migrated.tracks.map(toTrackState),
    clips,
    markers: migrated.markers,
    captions: migrated.captions,
    assetUsage: buildAssetUsage(clips),
  };
}

export function applyTimelineProjectUpdate(project: EditorProject, update: TimelineProjectUpdater): EditorProject {
  return migrateProjectJson(update(migrateProjectJson(project)));
}

export function findTimelineClipState(snapshot: TimelineStateSnapshot, clipId: string): TimelineClipState | undefined {
  return snapshot.clips.find((clip) => clip.id === clipId);
}

function toTrackState(track: TimelineTrack): TimelineTrackState {
  return {
    id: track.id,
    name: track.name,
    kind: track.kind,
    muted: track.muted,
    solo: Boolean(track.solo),
    locked: track.locked,
    syncLocked: Boolean(track.syncLocked),
    clipIds: track.clips.map((clip) => clip.id),
  };
}

function toClipState(track: TimelineTrack, clip: TimelineClip): TimelineClipState {
  return {
    id: clip.id,
    trackId: track.id,
    assetId: clip.assetId,
    kind: clip.kind,
    name: clip.name,
    start: clip.start,
    end: clip.start + clip.duration,
    duration: clip.duration,
    sourceIn: clip.sourceIn,
    speed: clip.speed,
    muted: Boolean(clip.muted),
    locked: track.locked || Boolean(clip.locked),
    effectCount: clip.effects.length,
    keyframeCount: clip.keyframes.length,
  };
}

function buildAssetUsage(clips: TimelineClipState[]): TimelineStateSnapshot['assetUsage'] {
  const usage = new Map<string, string[]>();

  for (const clip of clips) {
    if (!clip.assetId) {
      continue;
    }

    usage.set(clip.assetId, [...(usage.get(clip.assetId) ?? []), clip.id]);
  }

  return Array.from(usage.entries()).map(([assetId, clipIds]) => ({ assetId, clipIds }));
}
