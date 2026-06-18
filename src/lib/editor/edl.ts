import { createClip, createDefaultEditorProject } from './project';
import { resolveRenderableAssetMediaKind } from './renderable-media-kind';
import type { ClipKind, EditorAsset, EditorProject, TimelineClip, TimelineTrack } from './types';

export type Cmx3600EdlTrackType = 'V' | 'A' | 'AA';

export interface Cmx3600EdlBuildOptions {
  title?: string;
  fps?: number;
  exportRange?: {
    start: number;
    end: number;
  };
  trackIds?: string[];
  includeMuted?: boolean;
  includeLockedTracks?: boolean;
}

export interface Cmx3600EdlEvent {
  eventNumber: number;
  reelName: string;
  trackType: Cmx3600EdlTrackType;
  editType: 'C';
  sourceIn: number;
  sourceOut: number;
  recordIn: number;
  recordOut: number;
  sourceInTimecode: string;
  sourceOutTimecode: string;
  recordInTimecode: string;
  recordOutTimecode: string;
  clipId?: string;
  trackId?: string;
  clipName?: string;
  assetId?: string;
  assetName?: string;
  source?: string;
}

export interface Cmx3600EdlDocument {
  title: string;
  fps: number;
  events: Cmx3600EdlEvent[];
  warnings: string[];
  content: string;
}

export interface ParsedCmx3600EdlDocument {
  title: string;
  fps: number;
  events: Cmx3600EdlEvent[];
  warnings: string[];
}

export interface Cmx3600EdlImportOptions {
  id?: string;
  name?: string;
  fps?: number;
  width?: number;
  height?: number;
  updatedAt?: string;
  autoRelinkLocalSources?: boolean;
}

export interface Cmx3600EdlProjectImport {
  project: EditorProject;
  events: Cmx3600EdlEvent[];
  warnings: string[];
}

const DEFAULT_EDL_FPS = 30;
const MIN_EVENT_SECONDS = 0.001;

export function buildCmx3600Edl(
  project: EditorProject,
  options: Cmx3600EdlBuildOptions = {},
): Cmx3600EdlDocument {
  const fps = normalizeFps(options.fps ?? project.fps);
  const title = sanitizeTitle(options.title ?? project.name);
  const range = normalizeEdlExportRange(project, options.exportRange);
  const selectedTrackIds = options.trackIds ? new Set(options.trackIds) : undefined;
  const warnings: string[] = [];
  const events: Cmx3600EdlEvent[] = [];

  for (const track of project.tracks) {
    if (selectedTrackIds && !selectedTrackIds.has(track.id)) {
      continue;
    }

    if (track.locked && !options.includeLockedTracks) {
      warnings.push(`Skipped locked track ${track.name}.`);
      continue;
    }

    if (track.muted && !options.includeMuted) {
      warnings.push(`Skipped muted track ${track.name}.`);
      continue;
    }

    for (const clip of [...track.clips].sort((a, b) => a.start - b.start)) {
      const event = buildCmx3600EdlEvent({
        project,
        track,
        clip,
        range,
        fps,
        eventNumber: events.length + 1,
        includeMuted: Boolean(options.includeMuted),
        warnings,
      });

      if (event) {
        events.push(event);
      }
    }
  }

  return {
    title,
    fps,
    events,
    warnings,
    content: formatCmx3600Edl({ title, fps, events, warnings }),
  };
}

export function parseCmx3600Edl(content: string, fps = DEFAULT_EDL_FPS): ParsedCmx3600EdlDocument {
  const warnings: string[] = [];
  const events: Cmx3600EdlEvent[] = [];
  const lines = content.split(/\r?\n/);
  let title = 'Imported EDL';
  let resolvedFps = normalizeFps(fps);
  let currentEvent: Cmx3600EdlEvent | undefined;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      return;
    }

    if (line.startsWith('TITLE:')) {
      title = sanitizeTitle(line.slice('TITLE:'.length).trim() || title);
      return;
    }

    if (line.startsWith('* DANBI FPS:')) {
      const fpsValue = Number(line.slice('* DANBI FPS:'.length).trim());
      if (Number.isFinite(fpsValue) && fpsValue > 0) {
        resolvedFps = normalizeFps(fpsValue);
      }
      return;
    }

    if (line.startsWith('*')) {
      applyCmx3600Comment(currentEvent, line);
      return;
    }

    if (line.startsWith('FCM:')) {
      return;
    }

    const parts = line.split(/\s+/);
    if (parts.length < 8 || !/^\d+$/.test(parts[0])) {
      warnings.push(`Skipped EDL line ${index + 1}: unsupported syntax.`);
      return;
    }

    const trackType = normalizeEdlTrackType(parts[2]);
    if (!trackType) {
      warnings.push(`Skipped EDL line ${index + 1}: unsupported track type ${parts[2]}.`);
      return;
    }

    if (parts[3] !== 'C') {
      warnings.push(`Skipped EDL line ${index + 1}: only cut edits are supported.`);
      return;
    }

    const parsedEvent: Cmx3600EdlEvent = {
      eventNumber: Number(parts[0]),
      reelName: parts[1],
      trackType,
      editType: 'C',
      sourceIn: parseCmxTimecode(parts[4], resolvedFps),
      sourceOut: parseCmxTimecode(parts[5], resolvedFps),
      recordIn: parseCmxTimecode(parts[6], resolvedFps),
      recordOut: parseCmxTimecode(parts[7], resolvedFps),
      sourceInTimecode: parts[4],
      sourceOutTimecode: parts[5],
      recordInTimecode: parts[6],
      recordOutTimecode: parts[7],
    };

    if (parsedEvent.recordOut <= parsedEvent.recordIn || parsedEvent.sourceOut <= parsedEvent.sourceIn) {
      warnings.push(`Skipped EDL event ${parsedEvent.eventNumber}: invalid duration.`);
      return;
    }

    events.push(parsedEvent);
    currentEvent = parsedEvent;
  });

  return {
    title,
    fps: resolvedFps,
    events,
    warnings,
  };
}

export function importCmx3600EdlProject(
  content: string,
  options: Cmx3600EdlImportOptions = {},
): Cmx3600EdlProjectImport {
  const parsed = parseCmx3600Edl(content, options.fps ?? DEFAULT_EDL_FPS);
  const defaults = createDefaultEditorProject();
  const fps = normalizeFps(options.fps ?? parsed.fps);
  const assetsByKey = new Map<string, EditorAsset>();
  const videoClips: TimelineClip[] = [];
  const audioClips: TimelineClip[] = [];
  const warnings = [...parsed.warnings];

  for (const event of parsed.events) {
    const duration = roundSeconds(event.recordOut - event.recordIn);
    if (duration <= MIN_EVENT_SECONDS) {
      warnings.push(`Skipped EDL event ${event.eventNumber}: event is too short.`);
      continue;
    }

    const kind: ClipKind = event.trackType === 'V' ? 'video' : 'audio';
    const trackId = kind === 'audio' ? 'track-edl-a1' : 'track-edl-v1';
    const asset = ensureImportedEdlAsset(assetsByKey, event, kind, options);
    const clip = createClip({
      id: `clip-edl-${String(event.eventNumber).padStart(3, '0')}-${kind}`,
      assetId: asset.id,
      trackId,
      name: event.clipName ?? `${event.reelName} ${String(event.eventNumber).padStart(3, '0')}`,
      kind,
      start: roundSeconds(event.recordIn),
      duration,
      sourceIn: roundSeconds(event.sourceIn),
      color: kind === 'audio' ? '#a3e635' : '#38bdf8',
    });

    if (kind === 'audio') {
      audioClips.push(clip);
    } else {
      videoClips.push(clip);
    }
  }

  const tracks: TimelineTrack[] = [];
  if (videoClips.length > 0) {
    tracks.push(buildImportedEdlTrack('track-edl-v1', 'EDL Video', 'video', videoClips));
  }

  if (audioClips.length > 0) {
    tracks.push(buildImportedEdlTrack('track-edl-a1', 'EDL Audio', 'audio', audioClips));
  }

  if (Array.from(assetsByKey.values()).some((asset) => !asset.renderPath)) {
    warnings.push('Imported EDL media is offline placeholder media; relink source files before final render.');
  }

  const duration = Math.max(0, ...parsed.events.map((event) => event.recordOut));
  return {
    project: {
      ...defaults,
      id: options.id ?? `edl-${safeId(parsed.title)}`,
      name: options.name ?? parsed.title,
      fps,
      width: options.width ?? defaults.width,
      height: options.height ?? defaults.height,
      duration: roundSeconds(duration),
      updatedAt: options.updatedAt ?? new Date().toISOString(),
      assets: Array.from(assetsByKey.values()),
      tracks,
      markers: [],
      captions: [],
    },
    events: parsed.events,
    warnings: uniqueStrings(warnings),
  };
}

export function formatCmxTimecode(seconds: number, fps = DEFAULT_EDL_FPS): string {
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

export function parseCmxTimecode(timecode: string, fps = DEFAULT_EDL_FPS): number {
  const normalizedFps = normalizeFps(fps);
  const match = timecode.trim().match(/^(\d{2}):(\d{2}):(\d{2})[:;](\d{2})$/);
  if (!match) {
    throw new Error(`Invalid CMX timecode: ${timecode}`);
  }

  const [, hours, minutes, seconds, frames] = match.map(Number);
  return roundSeconds(
    (hours * 60 * 60) +
    (minutes * 60) +
    seconds +
    (frames / normalizedFps),
  );
}

function buildCmx3600EdlEvent({
  project,
  track,
  clip,
  range,
  fps,
  eventNumber,
  includeMuted,
  warnings,
}: {
  project: EditorProject;
  track: TimelineTrack;
  clip: TimelineClip;
  range: { start: number; end: number };
  fps: number;
  eventNumber: number;
  includeMuted: boolean;
  warnings: string[];
}): Cmx3600EdlEvent | undefined {
  if (clip.muted && !includeMuted) {
    warnings.push(`Skipped muted clip ${clip.name}.`);
    return undefined;
  }

  const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
  const trackType = trackTypeForEdlClip(clip, track, asset);
  if (!trackType) {
    warnings.push(`Skipped ${clip.name}: ${clip.kind} clips are not supported by CMX 3600 EDL.`);
    return undefined;
  }

  const overlapStart = Math.max(clip.start, range.start);
  const overlapEnd = Math.min(clip.start + clip.duration, range.end);
  const duration = roundSeconds(overlapEnd - overlapStart);
  if (duration <= MIN_EVENT_SECONDS) {
    return undefined;
  }

  if (!asset) {
    warnings.push(`Skipped ${clip.name}: CMX 3600 EDL export requires a linked media asset.`);
    return undefined;
  }

  if (clip.reversed) {
    warnings.push(`${clip.name}: reverse playback is not represented in CMX 3600 EDL and was exported as a forward cut.`);
  }

  if (clip.speed !== 1 || clip.speedRamp?.length) {
    warnings.push(`${clip.name}: speed changes are flattened to source timecode in CMX 3600 EDL.`);
  }

  if (clip.effects.some((effect) => effect.enabled) || clip.keyframes.length > 0 || clip.transitionIn || clip.transitionOut) {
    warnings.push(`${clip.name}: effects, keyframes, and transitions are not represented in CMX 3600 EDL.`);
  }

  const sourceIn = roundSeconds(clip.sourceIn + ((overlapStart - clip.start) * clip.speed));
  const sourceOut = roundSeconds(sourceIn + (duration * clip.speed));
  const recordIn = roundSeconds(overlapStart - range.start);
  const recordOut = roundSeconds(recordIn + duration);

  return {
    eventNumber,
    reelName: reelNameForAsset(asset),
    trackType,
    editType: 'C',
    sourceIn,
    sourceOut,
    recordIn,
    recordOut,
    sourceInTimecode: formatCmxTimecode(sourceIn, fps),
    sourceOutTimecode: formatCmxTimecode(sourceOut, fps),
    recordInTimecode: formatCmxTimecode(recordIn, fps),
    recordOutTimecode: formatCmxTimecode(recordOut, fps),
    clipId: clip.id,
    trackId: track.id,
    clipName: clip.name,
    assetId: asset.id,
    assetName: asset.name,
    source: resolveEdlAssetSource(asset),
  };
}

function resolveEdlAssetSource(asset: EditorAsset): string {
  return asset.renderPath?.trim() || asset.source.trim();
}

function formatCmx3600Edl({
  title,
  fps,
  events,
  warnings,
}: {
  title: string;
  fps: number;
  events: Cmx3600EdlEvent[];
  warnings: string[];
}): string {
  const lines = [
    `TITLE: ${title}`,
    'FCM: NON-DROP FRAME',
    `* DANBI FPS: ${fps}`,
  ];

  for (const warning of warnings) {
    lines.push(`* DANBI WARNING: ${warning}`);
  }

  for (const event of events) {
    lines.push('');
    lines.push([
      String(event.eventNumber).padStart(3, '0'),
      event.reelName.padEnd(8, ' '),
      event.trackType.padEnd(2, ' '),
      event.editType.padEnd(1, ' '),
      event.sourceInTimecode,
      event.sourceOutTimecode,
      event.recordInTimecode,
      event.recordOutTimecode,
    ].join('  '));
    if (event.clipName) {
      lines.push(`* FROM CLIP NAME: ${event.clipName}`);
    }
    if (event.assetName) {
      lines.push(`* DANBI ASSET NAME: ${event.assetName}`);
    }
    if (event.source) {
      lines.push(`* SOURCE FILE: ${event.source}`);
    }
    if (event.clipId) {
      lines.push(`* DANBI CLIP ID: ${event.clipId}`);
    }
    if (event.trackId) {
      lines.push(`* DANBI TRACK ID: ${event.trackId}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function applyCmx3600Comment(event: Cmx3600EdlEvent | undefined, line: string): void {
  if (!event) {
    return;
  }

  if (line.startsWith('* FROM CLIP NAME:')) {
    event.clipName = line.slice('* FROM CLIP NAME:'.length).trim();
    return;
  }

  if (line.startsWith('* DANBI ASSET NAME:')) {
    event.assetName = line.slice('* DANBI ASSET NAME:'.length).trim();
    return;
  }

  if (line.startsWith('* SOURCE FILE:')) {
    event.source = line.slice('* SOURCE FILE:'.length).trim();
    return;
  }

  if (line.startsWith('* DANBI CLIP ID:')) {
    event.clipId = line.slice('* DANBI CLIP ID:'.length).trim();
    return;
  }

  if (line.startsWith('* DANBI TRACK ID:')) {
    event.trackId = line.slice('* DANBI TRACK ID:'.length).trim();
  }
}

function ensureImportedEdlAsset(
  assetsByKey: Map<string, EditorAsset>,
  event: Cmx3600EdlEvent,
  kind: ClipKind,
  options: Cmx3600EdlImportOptions,
): EditorAsset {
  const key = `${event.reelName}:${kind}`;
  const existing = assetsByKey.get(key);
  const duration = roundSeconds(Math.max(event.sourceOut, existing?.duration ?? 0));
  const sourceInfo = resolveImportedEdlAssetSource(event, options);
  if (existing) {
    existing.duration = duration;
    if (!existing.renderPath && sourceInfo.renderPath) {
      existing.renderPath = sourceInfo.renderPath;
      existing.metadata = {
        ...existing.metadata,
        offlinePlaceholder: false,
        edlAutoRelinked: true,
        edlRelinkHint: sourceInfo.relinkHint,
        ...(event.source ? { edlSourceFile: event.source } : {}),
      };
    }
    return existing;
  }

  const asset: EditorAsset = {
    id: `asset-edl-${safeId(key)}`,
    name: event.assetName ?? event.clipName ?? sourceInfo.relinkHint ?? event.reelName,
    kind,
    source: sourceInfo.source,
    renderPath: sourceInfo.renderPath,
    duration,
    metadata: {
      reelName: event.reelName,
      importedFromEdl: true,
      offlinePlaceholder: !sourceInfo.renderPath,
      edlRelinkHint: sourceInfo.relinkHint,
      edlAutoRelinked: Boolean(sourceInfo.renderPath),
      ...(event.source ? { edlSourceFile: event.source } : {}),
    },
  };
  assetsByKey.set(key, asset);
  return asset;
}

function resolveImportedEdlAssetSource(
  event: Cmx3600EdlEvent,
  options: Cmx3600EdlImportOptions,
): { source: string; renderPath?: string; relinkHint: string } {
  const rawSource = event.source?.trim();
  const renderPath = options.autoRelinkLocalSources === false
    ? undefined
    : resolveLocalEdlRenderPath(rawSource);
  const source = renderPath
    ? resolveBrowserEdlSource(rawSource) ?? `offline://edl/${event.reelName}`
    : rawSource || `offline://edl/${event.reelName}`;

  return {
    source,
    renderPath,
    relinkHint: filenameFromEdlSource(renderPath ?? rawSource) || event.assetName || event.reelName,
  };
}

function resolveBrowserEdlSource(source: string | undefined): string | undefined {
  if (!source) {
    return undefined;
  }

  if (/^\/(?:imports|outputs|cache|media|luts)\//.test(source) || /^https?:\/\//i.test(source) || source.startsWith('data:') || source.startsWith('blob:')) {
    return source;
  }

  return undefined;
}

function resolveLocalEdlRenderPath(source: string | undefined): string | undefined {
  if (!source) {
    return undefined;
  }

  if (/^[a-zA-Z]:[\\/]/.test(source) || /^\\\\[^\\]+\\[^\\]+/.test(source)) {
    return source;
  }

  if (!/^file:\/\//i.test(source)) {
    return undefined;
  }

  try {
    const url = new URL(source);
    if (url.protocol !== 'file:') {
      return undefined;
    }

    const decodedPath = decodeURIComponent(url.pathname);
    if (url.hostname && url.hostname !== 'localhost') {
      return `\\\\${url.hostname}${decodedPath.replace(/\//g, '\\')}`;
    }

    const uncPath = normalizeFileUrlUncPath(decodedPath);
    if (uncPath) {
      return uncPath;
    }

    if (/^\/[a-zA-Z]:\//.test(decodedPath)) {
      return decodedPath.slice(1);
    }

    return decodedPath || undefined;
  } catch {
    return undefined;
  }
}

function normalizeFileUrlUncPath(decodedPath: string): string | undefined {
  const normalized = decodedPath.replace(/\//g, '\\');
  return /^\\\\[^\\]+\\[^\\]+/.test(normalized) ? normalized : undefined;
}

function filenameFromEdlSource(source: string | undefined): string {
  if (!source) {
    return '';
  }

  const withoutQuery = source.split(/[?#]/)[0];
  const normalized = withoutQuery.replace(/\\/g, '/').replace(/\/+$/g, '');
  return normalized.split('/').pop() ?? '';
}

function buildImportedEdlTrack(
  id: string,
  name: string,
  kind: TimelineTrack['kind'],
  clips: TimelineClip[],
): TimelineTrack {
  return {
    id,
    name,
    kind,
    muted: false,
    solo: false,
    syncLocked: false,
    volumeDb: 0,
    pan: 0,
    locked: false,
    clips: clips.sort((a, b) => a.start - b.start),
  };
}

function trackTypeForEdlClip(clip: TimelineClip, track: TimelineTrack, asset?: EditorAsset): Cmx3600EdlTrackType | undefined {
  const mediaKind = resolveRenderableAssetMediaKind(asset);
  if (mediaKind === 'audio') {
    return 'A';
  }

  if (mediaKind === 'video' || mediaKind === 'image') {
    return track.kind === 'audio' && clip.kind === 'ai' ? 'A' : 'V';
  }

  if (clip.kind === 'audio') {
    return 'A';
  }

  if (clip.kind === 'ai') {
    if (track.kind === 'audio') {
      return 'A';
    }

    return 'V';
  }

  if (clip.kind === 'video' || clip.kind === 'image') {
    return 'V';
  }

  return undefined;
}

function normalizeEdlTrackType(value: string): Cmx3600EdlTrackType | undefined {
  if (value === 'V' || value === 'A' || value === 'AA') {
    return value;
  }

  return undefined;
}

function normalizeEdlExportRange(
  project: EditorProject,
  range?: Cmx3600EdlBuildOptions['exportRange'],
): { start: number; end: number } {
  if (!range) {
    return { start: 0, end: project.duration };
  }

  const start = clampNumber(Math.min(range.start, range.end), 0, project.duration);
  const end = clampNumber(Math.max(range.start, range.end), 0, project.duration);
  if (end - start <= MIN_EVENT_SECONDS) {
    throw new Error('EDL export range must be longer than 0 seconds.');
  }

  return {
    start: roundSeconds(start),
    end: roundSeconds(end),
  };
}

function reelNameForAsset(asset: EditorAsset): string {
  const raw = (asset.metadata?.reelName ?? asset.name ?? asset.id).toString();
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 8)
    .padEnd(1, 'R') || 'REEL';
}

function sanitizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ') || 'Danbi Studio EDL';
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

function normalizeFps(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_EDL_FPS;
  }

  return Math.max(1, Math.round(value));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
