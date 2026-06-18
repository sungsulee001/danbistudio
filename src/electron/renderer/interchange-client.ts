import type { Cmx3600EdlProjectImport } from '../../lib/editor/edl';
import type { FcpxmlProjectImport } from '../../lib/editor/fcpxml';
import type { MarkerInterchangeDocument, MarkerInterchangeFormat, ParsedMarkerInterchange } from '../../lib/editor/marker-interchange';
import type { EditorProject, TimelineMarker } from '../../lib/editor/types';
import { assertValidProjectJson } from '../shared/project-schema';
import { editorApiFetch } from './editor-api-client';

type ExportRangeRequest = { start: number; end: number } | undefined;
const INTERCHANGE_API_ACTION_TIMEOUT_MS = 10000;

export interface Cmx3600EdlImportClientOptions {
  id?: string;
  name?: string;
  fps?: number;
  width?: number;
  height?: number;
  updatedAt?: string;
}

export interface FcpxmlImportClientOptions {
  id?: string;
  name?: string;
  updatedAt?: string;
}

export interface TimelineMarkerImportClientResult {
  format: MarkerInterchangeFormat;
  markerCount: number;
  markers: TimelineMarker[];
  warnings: string[];
}

export async function downloadCmx3600Edl({
  project,
  title,
  exportRange,
}: {
  project: EditorProject;
  title?: string;
  exportRange?: ExportRangeRequest;
}): Promise<{ eventCount: number; warningCount: number }> {
  const response = await editorApiFetch('/api/editor/edl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: INTERCHANGE_API_ACTION_TIMEOUT_MS,
    body: JSON.stringify({
      mode: 'export',
      project,
      options: {
        title: title ?? project.name,
        fps: project.fps,
      },
      exportRange,
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  const edl = data.edl as {
    filename: string;
    mimeType: string;
    content: string;
    eventCount: number;
    warnings: string[];
  };
  const blob = new Blob([edl.content], { type: edl.mimeType });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  try {
    anchor.href = href;
    anchor.download = edl.filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(href);
  }

  return {
    eventCount: edl.eventCount,
    warningCount: edl.warnings.length,
  };
}

export async function importCmx3600EdlFile(
  file: File,
  options: Cmx3600EdlImportClientOptions = {},
): Promise<Cmx3600EdlProjectImport> {
  return importCmx3600EdlText({
    content: await file.text(),
    options,
  });
}

export async function importCmx3600EdlText({
  content,
  options,
}: {
  content: string;
  options?: Cmx3600EdlImportClientOptions;
}): Promise<Cmx3600EdlProjectImport> {
  const response = await editorApiFetch('/api/editor/edl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: INTERCHANGE_API_ACTION_TIMEOUT_MS,
    body: JSON.stringify({
      mode: 'import',
      content,
      options,
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  const imported = data.imported as Cmx3600EdlProjectImport | undefined;
  if (!imported || !Array.isArray(imported.events) || !Array.isArray(imported.warnings)) {
    throw new Error('EDL import response is invalid.');
  }

  return {
    ...imported,
    project: assertValidProjectJson(imported.project, 'Cannot import EDL because the project JSON is invalid'),
  };
}

export async function downloadFcpxml({
  project,
  title,
  exportRange,
}: {
  project: EditorProject;
  title?: string;
  exportRange?: ExportRangeRequest;
}): Promise<{ clipCount: number; markerCount: number; warningCount: number }> {
  const response = await editorApiFetch('/api/editor/fcpxml', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: INTERCHANGE_API_ACTION_TIMEOUT_MS,
    body: JSON.stringify({
      mode: 'export',
      project,
      options: {
        title: title ?? project.name,
      },
      exportRange,
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  const fcpxml = data.fcpxml as {
    filename: string;
    mimeType: string;
    content: string;
    clipCount: number;
    markerCount: number;
    warnings: string[];
  };
  const blob = new Blob([fcpxml.content], { type: fcpxml.mimeType });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  try {
    anchor.href = href;
    anchor.download = fcpxml.filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(href);
  }

  return {
    clipCount: fcpxml.clipCount,
    markerCount: fcpxml.markerCount,
    warningCount: fcpxml.warnings.length,
  };
}

export async function importFcpxmlFile(
  file: File,
  options: FcpxmlImportClientOptions = {},
): Promise<FcpxmlProjectImport> {
  return importFcpxmlText({
    content: await file.text(),
    options,
  });
}

export async function importFcpxmlText({
  content,
  options,
}: {
  content: string;
  options?: FcpxmlImportClientOptions;
}): Promise<FcpxmlProjectImport> {
  const response = await editorApiFetch('/api/editor/fcpxml', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: INTERCHANGE_API_ACTION_TIMEOUT_MS,
    body: JSON.stringify({
      mode: 'import',
      content,
      options,
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  const imported = data.imported as FcpxmlProjectImport | undefined;
  if (!imported || !Array.isArray(imported.clips) || !Array.isArray(imported.markers) || !Array.isArray(imported.warnings)) {
    throw new Error('FCPXML import response is invalid.');
  }

  return {
    ...imported,
    project: assertValidProjectJson(imported.project, 'Cannot import FCPXML because the project JSON is invalid'),
  };
}

export async function downloadTimelineMarkers({
  project,
  format,
  exportRange,
}: {
  project: EditorProject;
  format: MarkerInterchangeFormat;
  exportRange?: ExportRangeRequest;
}): Promise<{ markerCount: number; warningCount: number }> {
  const response = await editorApiFetch('/api/editor/markers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: INTERCHANGE_API_ACTION_TIMEOUT_MS,
    body: JSON.stringify({
      mode: 'export',
      project,
      format,
      exportRange,
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  const markers = data.markers as MarkerInterchangeDocument;
  const blob = new Blob([markers.content], { type: markers.mimeType });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  try {
    anchor.href = href;
    anchor.download = markers.filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(href);
  }

  return {
    markerCount: markers.markerCount,
    warningCount: markers.warnings.length,
  };
}

export async function importTimelineMarkersFile(file: File): Promise<TimelineMarkerImportClientResult> {
  return importTimelineMarkersText({
    content: await file.text(),
    format: markerFormatFromFileName(file.name),
  });
}

export async function importTimelineMarkersText({
  content,
  format = 'auto',
}: {
  content: string;
  format?: MarkerInterchangeFormat | 'auto';
}): Promise<TimelineMarkerImportClientResult> {
  const response = await editorApiFetch('/api/editor/markers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: INTERCHANGE_API_ACTION_TIMEOUT_MS,
    body: JSON.stringify({
      mode: 'import',
      content,
      format,
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  const imported = data.imported as ParsedMarkerInterchange & { markerCount?: number } | undefined;
  if (!imported || !Array.isArray(imported.markers) || !Array.isArray(imported.warnings)) {
    throw new Error('Marker import response is invalid.');
  }

  return {
    format: imported.format,
    markerCount: imported.markerCount ?? imported.markers.length,
    markers: imported.markers,
    warnings: imported.warnings,
  };
}

function markerFormatFromFileName(fileName: string): MarkerInterchangeFormat | 'auto' {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.csv')) {
    return 'csv';
  }

  if (lowerName.endsWith('.txt') || lowerName.endsWith('.chapters')) {
    return 'youtube-chapters';
  }

  return 'auto';
}
