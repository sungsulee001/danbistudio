import type { EditorProject, TimelineMarker } from './types';

export type MarkerInterchangeFormat = 'csv' | 'youtube-chapters';
export type MarkerImportMode = 'merge' | 'replace';

export interface MarkerInterchangeBuildOptions {
  format: MarkerInterchangeFormat;
  exportRange?: {
    start: number;
    end: number;
  };
  includeKinds?: TimelineMarker['kind'][];
}

export interface MarkerInterchangeDocument {
  format: MarkerInterchangeFormat;
  filename: string;
  mimeType: string;
  markerCount: number;
  warnings: string[];
  content: string;
}

export interface ParsedMarkerInterchange {
  format: MarkerInterchangeFormat;
  markers: TimelineMarker[];
  warnings: string[];
}

export interface MarkerImportApplyResult {
  project: EditorProject;
  importedCount: number;
  skippedDuplicateCount: number;
  warnings: string[];
}

const DEFAULT_MARKER_COLOR_BY_KIND: Record<TimelineMarker['kind'], string> = {
  chapter: '#22c55e',
  beat: '#f59e0b',
  warning: '#ef4444',
  todo: '#38bdf8',
};

export function buildMarkerInterchange(
  project: EditorProject,
  options: MarkerInterchangeBuildOptions,
): MarkerInterchangeDocument {
  const format = normalizeMarkerInterchangeFormat(options.format);
  const { markers, warnings } = selectMarkersForExport(project, {
    format,
    exportRange: options.exportRange,
    includeKinds: options.includeKinds,
  });
  const content = format === 'youtube-chapters'
    ? formatYoutubeChapterMarkers(markers, warnings)
    : formatMarkerCsv(markers, project.fps);

  return {
    format,
    filename: `${safeDownloadName(project.name)}.${format === 'youtube-chapters' ? 'chapters.txt' : 'markers.csv'}`,
    mimeType: format === 'youtube-chapters' ? 'text/plain;charset=utf-8' : 'text/csv;charset=utf-8',
    markerCount: markers.length,
    warnings,
    content,
  };
}

export function parseMarkerInterchange(
  content: string,
  options: { format?: MarkerInterchangeFormat | 'auto'; fps?: number } = {},
): ParsedMarkerInterchange {
  const text = content.trim();
  if (!text) {
    throw new Error('Marker content is required.');
  }

  const format = options.format && options.format !== 'auto'
    ? normalizeMarkerInterchangeFormat(options.format)
    : detectMarkerInterchangeFormat(text);

  return format === 'youtube-chapters'
    ? parseYoutubeChapterMarkers(text)
    : parseMarkerCsv(text, options.fps);
}

export function applyImportedTimelineMarkers(
  project: EditorProject,
  markers: TimelineMarker[],
  options: { mode?: MarkerImportMode } = {},
): MarkerImportApplyResult {
  const mode = options.mode ?? 'merge';
  const warnings: string[] = [];
  const baseMarkers = mode === 'replace' ? [] : project.markers;
  const usedIds = new Set(baseMarkers.map((marker) => marker.id));
  const markerKeys = new Set(baseMarkers.map(markerDedupKey));
  const importedMarkers: TimelineMarker[] = [];
  let skippedDuplicateCount = 0;

  markers.forEach((marker, index) => {
    const normalized = normalizeTimelineMarkerForImport(marker, index, usedIds);
    if (normalized.time > project.duration + 0.001) {
      warnings.push(`${normalized.label} is beyond the project duration.`);
    }

    const key = markerDedupKey(normalized);
    if (markerKeys.has(key)) {
      skippedDuplicateCount += 1;
      return;
    }

    markerKeys.add(key);
    importedMarkers.push(normalized);
  });

  return {
    project: {
      ...project,
      markers: [...baseMarkers, ...importedMarkers].sort((a, b) => a.time - b.time || a.label.localeCompare(b.label)),
    },
    importedCount: importedMarkers.length,
    skippedDuplicateCount,
    warnings,
  };
}

export function formatMarkerTimecode(seconds: number, fps = 30): string {
  const normalizedFps = normalizeFps(fps);
  const totalFrames = Math.max(0, Math.round(seconds * normalizedFps));
  const framesPerHour = normalizedFps * 60 * 60;
  const framesPerMinute = normalizedFps * 60;
  const hours = Math.floor(totalFrames / framesPerHour);
  const minutes = Math.floor((totalFrames % framesPerHour) / framesPerMinute);
  const secs = Math.floor((totalFrames % framesPerMinute) / normalizedFps);
  const frames = totalFrames % normalizedFps;

  return [hours, minutes, secs, frames]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

function selectMarkersForExport(
  project: EditorProject,
  options: MarkerInterchangeBuildOptions,
): { markers: TimelineMarker[]; warnings: string[] } {
  const warnings: string[] = [];
  const range = normalizeMarkerExportRange(project, options.exportRange);
  const includeKinds = options.includeKinds
    ? new Set(options.includeKinds)
    : options.format === 'youtube-chapters'
      ? new Set<TimelineMarker['kind']>(['chapter'])
      : undefined;
  const selected = project.markers
    .filter((marker) => marker.time >= range.start - 0.001 && marker.time <= range.end + 0.001)
    .filter((marker) => !includeKinds || includeKinds.has(marker.kind))
    .map((marker) => ({
      ...marker,
      time: roundSeconds(marker.time - range.start),
    }))
    .sort((a, b) => a.time - b.time || a.label.localeCompare(b.label));

  const rangeSkippedCount = project.markers.filter((marker) => marker.time < range.start - 0.001 || marker.time > range.end + 0.001).length;
  if (rangeSkippedCount > 0) {
    warnings.push(`${rangeSkippedCount} marker${rangeSkippedCount === 1 ? '' : 's'} outside the export range were skipped.`);
  }

  if (options.format === 'youtube-chapters') {
    const nonChapterCount = project.markers.filter((marker) => (
      marker.time >= range.start - 0.001 &&
      marker.time <= range.end + 0.001 &&
      marker.kind !== 'chapter'
    )).length;
    if (nonChapterCount > 0) {
      warnings.push(`${nonChapterCount} non-chapter marker${nonChapterCount === 1 ? '' : 's'} were skipped for YouTube chapters.`);
    }
    if (selected.length > 0 && selected[0].time > 0.001) {
      warnings.push('YouTube chapters should start at 0:00.');
    }
  }

  return { markers: selected, warnings };
}

function formatMarkerCsv(markers: TimelineMarker[], fps: number): string {
  const rows = [
    ['timecode', 'seconds', 'label', 'kind', 'color', 'duration', 'note'],
    ...markers.map((marker) => [
      formatMarkerTimecode(marker.time, fps),
      formatSeconds(marker.time),
      marker.label,
      marker.kind,
      marker.color,
      marker.duration && marker.duration > 0 ? formatSeconds(marker.duration) : '',
      marker.note ?? '',
    ]),
  ];

  return `${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')}\n`;
}

function formatYoutubeChapterMarkers(markers: TimelineMarker[], warnings: string[]): string {
  if (markers.length === 0) {
    warnings.push('No chapter markers were available for YouTube chapter export.');
  }

  return `${markers.map((marker) => `${formatYoutubeTimestamp(marker.time)} ${marker.label}`).join('\n')}\n`;
}

function parseMarkerCsv(content: string, fps = 30): ParsedMarkerInterchange {
  const rows = parseCsvRows(content);
  const warnings: string[] = [];
  if (rows.length === 0) {
    return { format: 'csv', markers: [], warnings: ['No CSV marker rows found.'] };
  }

  const header = rows[0].map((cell) => normalizeHeader(cell));
  const hasHeader = header.some((cell) => ['timecode', 'seconds', 'label', 'kind', 'color', 'duration', 'note'].includes(cell));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const indexes = hasHeader
    ? {
      timecode: header.indexOf('timecode'),
      seconds: header.indexOf('seconds'),
      label: firstHeaderIndex(header, ['label', 'name', 'title']),
      kind: header.indexOf('kind'),
      color: header.indexOf('color'),
      duration: firstHeaderIndex(header, ['duration', 'durationseconds']),
      note: firstHeaderIndex(header, ['note', 'notes', 'comment', 'comments', 'description']),
    }
    : { timecode: 0, seconds: 1, label: 2, kind: 3, color: 4, duration: 5, note: 6 };

  const markers = dataRows.flatMap((row, rowIndex) => {
    if (row.every((cell) => cell.trim() === '')) {
      return [];
    }

    const label = readCsvCell(row, indexes.label).trim() || `Marker ${rowIndex + 1}`;
    const secondsText = readCsvCell(row, indexes.seconds).trim();
    const timecodeText = readCsvCell(row, indexes.timecode).trim();
    const time = secondsText
      ? Number(secondsText)
      : parseMarkerClock(timecodeText, fps);
    if (!Number.isFinite(time) || time < 0) {
      warnings.push(`Skipped CSV marker row ${rowIndex + 1}: invalid time.`);
      return [];
    }

    const kind = normalizeMarkerKind(readCsvCell(row, indexes.kind));
    const duration = normalizeOptionalMarkerDuration(readCsvCell(row, indexes.duration));
    const note = normalizeOptionalMarkerNote(readCsvCell(row, indexes.note));
    return [{
      id: `marker-import-csv-${rowIndex + 1}`,
      time: roundSeconds(time),
      label,
      kind,
      color: normalizeMarkerColor(readCsvCell(row, indexes.color), kind),
      ...(duration ? { duration } : {}),
      ...(note ? { note } : {}),
    }];
  });

  return {
    format: 'csv',
    markers,
    warnings,
  };
}

function parseYoutubeChapterMarkers(content: string): ParsedMarkerInterchange {
  const warnings: string[] = [];
  const markers = content.split(/\r?\n/).flatMap((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      return [];
    }

    const match = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/.exec(line);
    if (!match) {
      warnings.push(`Skipped chapter line ${index + 1}: expected "0:00 Chapter title".`);
      return [];
    }

    const time = parseYoutubeTimestamp(match[1]);
    if (!Number.isFinite(time)) {
      warnings.push(`Skipped chapter line ${index + 1}: invalid timestamp.`);
      return [];
    }

    return [{
      id: `marker-import-chapter-${index + 1}`,
      time,
      label: match[2].trim() || `Chapter ${index + 1}`,
      kind: 'chapter' as const,
      color: DEFAULT_MARKER_COLOR_BY_KIND.chapter,
    }];
  });

  return {
    format: 'youtube-chapters',
    markers,
    warnings,
  };
}

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  return rows;
}

function normalizeTimelineMarkerForImport(
  marker: TimelineMarker,
  index: number,
  usedIds: Set<string>,
): TimelineMarker {
  const kind = normalizeMarkerKind(marker.kind);
  const baseId = safeId(marker.id || `${marker.kind}-${marker.label}-${index + 1}`) || `marker-import-${index + 1}`;
  const id = uniqueMarkerId(baseId, usedIds);

  return {
    id,
    time: roundSeconds(Math.max(0, marker.time)),
    label: marker.label.trim() || `Marker ${index + 1}`,
    kind,
    color: normalizeMarkerColor(marker.color, kind),
    ...(marker.duration && marker.duration > 0 ? { duration: roundSeconds(marker.duration) } : {}),
    ...(marker.note?.trim() ? { note: marker.note.trim() } : {}),
  };
}

function uniqueMarkerId(baseId: string, usedIds: Set<string>): string {
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function detectMarkerInterchangeFormat(content: string): MarkerInterchangeFormat {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? '';
  if (/^\d{1,2}:\d{2}(?::\d{2})?\s+/.test(firstLine)) {
    return 'youtube-chapters';
  }

  return 'csv';
}

function parseMarkerClock(value: string, fps = 30): number {
  if (!value) {
    return Number.NaN;
  }

  const parts = value.trim().split(':');
  if (parts.length === 4) {
    const [hours, minutes, seconds, frames] = parts.map(Number);
    const normalizedFps = normalizeFps(fps);
    return roundSeconds((hours * 3600) + (minutes * 60) + seconds + (frames / normalizedFps));
  }

  return parseYoutubeTimestamp(value);
}

function parseYoutubeTimestamp(value: string): number {
  const parts = value.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return Number.NaN;
  }

  if (parts.length === 2) {
    return roundSeconds((parts[0] * 60) + parts[1]);
  }

  if (parts.length === 3) {
    return roundSeconds((parts[0] * 3600) + (parts[1] * 60) + parts[2]);
  }

  return Number.NaN;
}

function formatYoutubeTimestamp(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function normalizeMarkerExportRange(
  project: EditorProject,
  range?: MarkerInterchangeBuildOptions['exportRange'],
): { start: number; end: number } {
  if (!range) {
    return { start: 0, end: project.duration };
  }

  const start = clampNumber(Math.min(range.start, range.end), 0, project.duration);
  const end = clampNumber(Math.max(range.start, range.end), 0, project.duration);
  if (end <= start) {
    throw new Error('Marker export range must be longer than 0 seconds.');
  }

  return {
    start: roundSeconds(start),
    end: roundSeconds(end),
  };
}

function markerDedupKey(marker: TimelineMarker): string {
  return `${roundSeconds(marker.time)}:${marker.kind}:${marker.label.trim().toLowerCase()}`;
}

function normalizeMarkerInterchangeFormat(format: MarkerInterchangeFormat): MarkerInterchangeFormat {
  return format === 'youtube-chapters' ? 'youtube-chapters' : 'csv';
}

function normalizeMarkerKind(value: unknown): TimelineMarker['kind'] {
  return value === 'chapter' || value === 'beat' || value === 'warning' || value === 'todo'
    ? value
    : 'todo';
}

function normalizeMarkerColor(value: unknown, kind: TimelineMarker['kind']): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value
    : DEFAULT_MARKER_COLOR_BY_KIND[kind];
}

function normalizeOptionalMarkerDuration(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? roundSeconds(value) : undefined;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? roundSeconds(parsed) : undefined;
}

function normalizeOptionalMarkerNote(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function escapeCsvCell(value: string | number | undefined): string {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function readCsvCell(row: string[], index: number): string {
  return index >= 0 ? row[index] ?? '' : '';
}

function firstHeaderIndex(header: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const index = header.indexOf(candidate);
    if (index >= 0) {
      return index;
    }
  }

  return -1;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function formatSeconds(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function normalizeFps(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value)) : 30;
}

function safeDownloadName(value: string): string {
  const name = value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '') || 'danbi-markers';

  return isWindowsReservedPathName(name) ? `markers-${name}` : name;
}

function isWindowsReservedPathName(value: string): boolean {
  const baseName = value.split('.')[0]?.toLowerCase();
  return Boolean(baseName) && WINDOWS_RESERVED_PATH_NAMES.has(baseName);
}

const WINDOWS_RESERVED_PATH_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}
