import type { EditorProject } from './types';

export interface FfmpegChapterMetadataOptions {
  exportRange?: {
    start: number;
    end: number;
    duration: number;
  };
}

export interface FfmpegChapterMetadataChapter {
  title: string;
  startMs: number;
  endMs: number;
  markerId: string;
}

export interface FfmpegChapterMetadataDocument {
  chapters: FfmpegChapterMetadataChapter[];
  content: string;
  warnings: string[];
}

export function buildFfmpegChapterMetadata(
  project: EditorProject,
  options: FfmpegChapterMetadataOptions = {},
): FfmpegChapterMetadataDocument | undefined {
  const rangeStart = options.exportRange?.start ?? 0;
  const rangeEnd = options.exportRange?.end ?? project.duration;
  const exportDuration = options.exportRange?.duration ?? Math.max(0, rangeEnd - rangeStart);
  const warnings: string[] = [];
  const markers = project.markers
    .filter((marker) => marker.kind === 'chapter')
    .filter((marker) => marker.time >= rangeStart - 0.001 && marker.time < rangeEnd - 0.001)
    .sort((a, b) => a.time - b.time || a.label.localeCompare(b.label));

  if (markers.length === 0 || exportDuration <= 0) {
    return undefined;
  }

  const chapters = markers.flatMap((marker, index): FfmpegChapterMetadataChapter[] => {
    const startSeconds = roundSeconds(Math.max(0, marker.time - rangeStart));
    const nextMarker = markers[index + 1];
    const explicitEndSeconds = marker.duration && marker.duration > 0
      ? roundSeconds(Math.max(startSeconds, marker.time + marker.duration - rangeStart))
      : undefined;
    const nextMarkerEndSeconds = nextMarker ? roundSeconds(Math.max(startSeconds, nextMarker.time - rangeStart)) : undefined;
    const endSeconds = roundSeconds(Math.min(
      exportDuration,
      explicitEndSeconds ?? nextMarkerEndSeconds ?? exportDuration,
      nextMarkerEndSeconds ?? exportDuration,
    ));

    if (endSeconds <= startSeconds + 0.001) {
      warnings.push(`Skipped chapter marker ${marker.label}: chapter duration is zero.`);
      return [];
    }

    return [{
      title: marker.label.trim() || 'Chapter',
      startMs: secondsToMilliseconds(startSeconds),
      endMs: secondsToMilliseconds(endSeconds),
      markerId: marker.id,
    }];
  });

  if (chapters.length === 0) {
    return undefined;
  }

  return {
    chapters,
    content: formatFfmpegMetadata(project.name, chapters),
    warnings,
  };
}

function formatFfmpegMetadata(projectName: string, chapters: FfmpegChapterMetadataChapter[]): string {
  return `${[
    ';FFMETADATA1',
    `title=${escapeFfmpegMetadata(projectName || 'Danbi Studio Export')}`,
    ...chapters.flatMap((chapter) => [
      '',
      '[CHAPTER]',
      'TIMEBASE=1/1000',
      `START=${chapter.startMs}`,
      `END=${chapter.endMs}`,
      `title=${escapeFfmpegMetadata(chapter.title)}`,
    ]),
  ].join('\n')}\n`;
}

function escapeFfmpegMetadata(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
    .replace(/([=;#])/g, '\\$1');
}

function secondsToMilliseconds(seconds: number): number {
  return Math.max(0, Math.round(seconds * 1000));
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}
