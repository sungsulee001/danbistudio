import type { ClipAttributeClipboard } from '../../lib/editor/timeline';
import type { TimelineClip, TimelineTrack } from '../../lib/editor/types';

export type ClipboardEditMode = 'insert' | 'overwrite';

export type CopySelectedClipsPlan =
  | {
    canCopy: false;
    status: string;
  }
  | {
    canCopy: true;
    clips: TimelineClip[];
    status: string;
  };

export type CopyClipAttributesPlan =
  | {
    canCopy: false;
    status: string;
  }
  | {
    canCopy: true;
    clipId: string;
  };

export type PasteClipAttributesPlan =
  | {
    canPaste: false;
    status: string;
  }
  | {
    canPaste: true;
    targetClipIds: string[];
    commitLabel: string;
  };

export type PasteClipboardPlan =
  | {
    canPaste: false;
    status: string;
  }
  | {
    canPaste: true;
    clips: TimelineClip[];
    targetTime: number;
    selectedTrackId: string;
    commitLabel: string;
    nextPlayhead?: number;
  };

export function resolveCopySelectedClipsPlan(selectedClips: TimelineClip[]): CopySelectedClipsPlan {
  if (selectedClips.length === 0) {
    return { canCopy: false, status: 'Select a clip first' };
  }

  return {
    canCopy: true,
    clips: selectedClips,
    status: `Copied ${formatClipCount(selectedClips.length)}`,
  };
}

export function resolveCopyClipAttributesPlan(
  selectedClip?: TimelineClip | null,
): CopyClipAttributesPlan {
  if (!selectedClip) {
    return { canCopy: false, status: 'Select a source clip first' };
  }

  return { canCopy: true, clipId: selectedClip.id };
}

export function formatCopiedClipAttributesStatus(
  attributes: Pick<ClipAttributeClipboard, 'sourceClipName'>,
): string {
  return `Copied attributes from ${attributes.sourceClipName}`;
}

export function resolvePasteClipAttributesPlan({
  attributeClipboard,
  selectedClips,
}: {
  attributeClipboard: ClipAttributeClipboard | null;
  selectedClips: TimelineClip[];
}): PasteClipAttributesPlan {
  if (!attributeClipboard) {
    return { canPaste: false, status: 'Copy clip attributes first' };
  }

  if (selectedClips.length === 0) {
    return { canPaste: false, status: 'Select target clips first' };
  }

  return {
    canPaste: true,
    targetClipIds: selectedClips.map((clip) => clip.id),
    commitLabel: `Pasted attributes to ${formatClipCount(selectedClips.length)}`,
  };
}

export function resolveCutSelectedClipsPlan(selectedClips: TimelineClip[]): CopySelectedClipsPlan {
  if (selectedClips.length === 0) {
    return { canCopy: false, status: 'Select a clip first' };
  }

  return {
    canCopy: true,
    clips: selectedClips,
    status: `Cut ${formatClipCount(selectedClips.length)}`,
  };
}

export function resolvePasteClipboardPlan({
  clipboardClips,
  targetTime,
  label,
  selectedTrackId,
  editMode,
}: {
  clipboardClips: TimelineClip[];
  targetTime: number;
  label: string;
  selectedTrackId: string;
  editMode: ClipboardEditMode;
}): PasteClipboardPlan {
  if (clipboardClips.length === 0) {
    return { canPaste: false, status: 'Clipboard is empty' };
  }

  return {
    canPaste: true,
    clips: clipboardClips,
    targetTime,
    selectedTrackId,
    commitLabel: `${editMode === 'overwrite' ? 'Overwrote' : 'Pasted'} ${formatClipCount(clipboardClips.length)} at ${label}`,
  };
}

export function resolvePasteClipboardAtInPlan({
  clipboardClips,
  markIn,
  selectedTrackId,
  editMode,
}: {
  clipboardClips: TimelineClip[];
  markIn: number | null;
  selectedTrackId: string;
  editMode: ClipboardEditMode;
}): PasteClipboardPlan {
  if (markIn === null) {
    return { canPaste: false, status: 'Set an In point first' };
  }

  const plan = resolvePasteClipboardPlan({
    clipboardClips,
    targetTime: markIn,
    label: 'In point',
    selectedTrackId,
    editMode,
  });

  return plan.canPaste ? { ...plan, nextPlayhead: markIn } : plan;
}

export function resolveAppendClipboardPlan({
  clipboardClips,
  tracks,
  selectedTrackId,
}: {
  clipboardClips: TimelineClip[];
  tracks: TimelineTrack[];
  selectedTrackId: string;
}): PasteClipboardPlan {
  if (clipboardClips.length === 0) {
    return { canPaste: false, status: 'Clipboard is empty' };
  }

  const targetTrack = tracks.find((track) => track.id === selectedTrackId);
  const targetTime = targetTrack && targetTrack.clips.length > 0
    ? Math.max(...targetTrack.clips.map((clip) => clip.start + clip.duration))
    : 0;

  return {
    canPaste: true,
    clips: clipboardClips,
    targetTime,
    selectedTrackId,
    commitLabel: 'Appended clipboard to track',
    nextPlayhead: targetTime,
  };
}

function formatClipCount(count: number): string {
  return `${count} clip${count === 1 ? '' : 's'}`;
}
