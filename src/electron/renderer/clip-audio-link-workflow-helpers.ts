import type { WaveformSyncOptions, WaveformSyncPlan } from '../../lib/editor/audio-sync';
import { getLinkedVideoClipId } from '../../lib/editor/media-metadata';
import type { TimelineClip } from '../../lib/editor/types';
import { formatSignedEditDelta } from './editor-time-helpers';
import type { SelectedAudioVideoPair } from './selected-clip-capabilities';

export type ClipAudioLinkCommandPlan =
  | {
    canCommit: false;
    status: string;
  }
  | {
    canCommit: true;
    commitLabel: string;
    clipId?: string;
    videoClipId?: string;
    audioClipId?: string;
    nextSelectedClipId: string;
    nextSelectedClipIds?: string[];
  };

export type WaveformSyncCommandPlan =
  | {
    canCommit: false;
    status: string;
  }
  | {
    canCommit: true;
    commitLabel: string;
    videoClipId: string;
    audioClipId: string;
    nextSelectedClipId: string;
    nextSelectedClipIds: string[];
    options: WaveformSyncOptions;
  };

export function resolveDetachSelectedAudioPlan({
  selectedClip,
}: {
  selectedClip?: TimelineClip | null;
}): ClipAudioLinkCommandPlan {
  if (!selectedClip) {
    return { canCommit: false, status: 'Select a clip first' };
  }

  return {
    canCommit: true,
    commitLabel: 'Embedded audio detached',
    clipId: selectedClip.id,
    nextSelectedClipId: selectedClip.id,
  };
}

export function resolveRelinkSelectedAudioPlan({
  selectedClip,
}: {
  selectedClip?: TimelineClip | null;
}): ClipAudioLinkCommandPlan {
  if (!selectedClip) {
    return { canCommit: false, status: 'Select a clip first' };
  }

  return {
    canCommit: true,
    commitLabel: 'Detached audio relinked',
    clipId: selectedClip.id,
    nextSelectedClipId: getLinkedVideoClipId(selectedClip) ?? selectedClip.id,
  };
}

export function resolveUnlinkSelectedAudioPlan({
  selectedClip,
}: {
  selectedClip?: TimelineClip | null;
}): ClipAudioLinkCommandPlan {
  if (!selectedClip) {
    return { canCommit: false, status: 'Select a linked clip first' };
  }

  return {
    canCommit: true,
    commitLabel: 'Linked V/A clips unlinked',
    clipId: selectedClip.id,
    nextSelectedClipId: selectedClip.id,
  };
}

export function resolveLinkSelectedAudioPlan({
  selectedLinkPair,
}: {
  selectedLinkPair?: SelectedAudioVideoPair | null;
}): ClipAudioLinkCommandPlan {
  if (!selectedLinkPair) {
    return { canCommit: false, status: 'Select one visual clip and one audio clip first' };
  }

  return {
    canCommit: true,
    commitLabel: 'Selected V/A clips linked',
    videoClipId: selectedLinkPair.videoClip.id,
    audioClipId: selectedLinkPair.audioClip.id,
    nextSelectedClipId: selectedLinkPair.videoClip.id,
    nextSelectedClipIds: [selectedLinkPair.videoClip.id, selectedLinkPair.audioClip.id],
  };
}

export function resolveWaveformSyncSelectedAudioPlan({
  selectedAudioSyncPair,
  linkAfterSync = false,
}: {
  selectedAudioSyncPair?: SelectedAudioVideoPair | null;
  linkAfterSync?: boolean;
}): WaveformSyncCommandPlan {
  if (!selectedAudioSyncPair) {
    return { canCommit: false, status: 'Select one video clip with audio and one audio clip first' };
  }

  return {
    canCommit: true,
    commitLabel: linkAfterSync ? 'Audio synced and linked' : 'Audio synced by waveform',
    videoClipId: selectedAudioSyncPair.videoClip.id,
    audioClipId: selectedAudioSyncPair.audioClip.id,
    nextSelectedClipId: selectedAudioSyncPair.audioClip.id,
    nextSelectedClipIds: [selectedAudioSyncPair.videoClip.id, selectedAudioSyncPair.audioClip.id],
    options: { maxOffsetSeconds: 60, preventOverlap: true },
  };
}

export function formatWaveformSyncStatus({
  plan,
  linkAfterSync = false,
}: {
  plan: WaveformSyncPlan;
  linkAfterSync?: boolean;
}): string {
  return `Audio sync${linkAfterSync ? '+link' : ''} ${formatSignedEditDelta(plan.appliedDelta)} / confidence ${plan.confidence.toFixed(2)}${
    plan.warnings[0] ? ` / ${plan.warnings[0]}` : ''
  }`;
}

export function formatWaveformSyncFailureStatus(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Audio sync failed: ${message}`;
}
