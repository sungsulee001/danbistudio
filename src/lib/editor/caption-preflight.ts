import type { CaptionSegment, EditorProject, ExportManifest } from './types';

export type CaptionPreflightSeverity = 'blocked' | 'warning';

export interface CaptionPreflightIssue {
  id: string;
  severity: CaptionPreflightSeverity;
  captionId?: string;
  time?: number;
  message: string;
  action: string;
}

export interface CaptionPreflightReport {
  checkedCaptionCount: number;
  issues: CaptionPreflightIssue[];
}

interface RenderableCaption {
  caption: CaptionSegment;
  index: number;
  start: number;
  end: number;
}

export function buildCaptionPreflightReport(
  project: EditorProject,
  exportRange?: ExportManifest['exportRange'],
): CaptionPreflightReport {
  const range = exportRange ?? { start: 0, end: Math.max(0, project.duration), duration: Math.max(0, project.duration) };
  const issues: CaptionPreflightIssue[] = [];
  const renderableCaptions: RenderableCaption[] = [];

  project.captions.forEach((caption, index) => {
    const captionId = readCaptionId(caption, index);
    const start = Number(caption.start);
    const end = Number(caption.end);

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      issues.push(captionIssue({
        severity: 'blocked',
        captionId,
        index,
        message: `${captionId} has invalid caption timing.`,
        action: 'Fix the caption start and end time before rendering.',
      }));
      return;
    }

    if (start < 0 || end <= start) {
      issues.push(captionIssue({
        severity: 'blocked',
        captionId,
        index,
        time: Math.max(0, start),
        message: `${captionId} has a caption end time that is not after its start time.`,
        action: 'Adjust or delete the caption before rendering.',
      }));
      return;
    }

    if (!captionOverlapsRange(start, end, range)) {
      return;
    }

    if (caption.text.trim().length === 0) {
      issues.push(captionIssue({
        severity: 'warning',
        captionId,
        index,
        time: start,
        message: `${captionId} is empty and will not appear in the export.`,
        action: 'Add caption text or delete the empty caption.',
      }));
      return;
    }

    if (end > project.duration) {
      issues.push(captionIssue({
        severity: 'warning',
        captionId,
        index,
        time: start,
        message: `${captionId} extends beyond the project duration and will be clipped.`,
        action: 'Shorten the caption or extend the project duration.',
      }));
    }

    renderableCaptions.push({ caption, index, start, end });
  });

  for (const [left, right] of findOverlappingCaptions(renderableCaptions)) {
    const leftId = readCaptionId(left.caption, left.index);
    const rightId = readCaptionId(right.caption, right.index);
    issues.push(captionIssue({
      severity: 'warning',
      captionId: rightId,
      index: right.index,
      time: right.start,
      message: `${leftId} overlaps ${rightId}; both captions may collide in the export.`,
      action: 'Adjust caption timing or merge the overlapping captions before rendering.',
    }));
  }

  return {
    checkedCaptionCount: renderableCaptions.length,
    issues,
  };
}

function findOverlappingCaptions(captions: RenderableCaption[]): Array<[RenderableCaption, RenderableCaption]> {
  const sorted = [...captions].sort((left, right) => left.start - right.start || left.end - right.end);
  const overlaps: Array<[RenderableCaption, RenderableCaption]> = [];

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous.end > current.start + 0.001) {
      overlaps.push([previous, current]);
    }
  }

  return overlaps;
}

function captionOverlapsRange(
  start: number,
  end: number,
  range: NonNullable<ExportManifest['exportRange']>,
): boolean {
  return start < range.end && end > range.start;
}

function captionIssue({
  severity,
  captionId,
  index,
  time,
  message,
  action,
}: {
  severity: CaptionPreflightSeverity;
  captionId: string;
  index: number;
  time?: number;
  message: string;
  action: string;
}): CaptionPreflightIssue {
  return {
    id: `caption-${index}-${hashText(message)}`,
    severity,
    captionId,
    ...(time === undefined ? {} : { time: roundTime(time) }),
    message,
    action,
  };
}

function readCaptionId(caption: CaptionSegment, index: number): string {
  return typeof caption.id === 'string' && caption.id.trim().length > 0
    ? caption.id.trim()
    : `caption-${index + 1}`;
}

function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
