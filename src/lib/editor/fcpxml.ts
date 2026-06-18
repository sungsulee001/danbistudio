import { createClip, createDefaultEditorProject } from './project';
import { inferSupportedMediaFileKind, inferSupportedMediaMimeType } from './media-file-support';
import { resolveRenderableAssetMediaKind } from './renderable-media-kind';
import { readTitleStyle } from './title-style';
import type { CaptionStyle, ClipEffect, ClipKeyframe, ClipKind, EditorAsset, EditorProject, TimelineClip, TimelineMarker, TimelineTrack, TimelineTransition } from './types';

export interface FcpxmlBuildOptions {
  title?: string;
  version?: string;
  exportRange?: {
    start: number;
    end: number;
  };
  includeMuted?: boolean;
  includeLockedTracks?: boolean;
}

export interface FcpxmlClipEvent {
  clipId: string;
  trackId: string;
  assetId: string;
  name: string;
  kind: ClipKind;
  offset: number;
  sourceIn: number;
  duration: number;
  lane: number;
  titleText?: string;
  titleStyle?: CaptionStyle;
  effects?: ClipEffect[];
  keyframes?: ClipKeyframe[];
  transitionIn?: TimelineTransition;
  transitionOut?: TimelineTransition;
}

export interface FcpxmlDocument {
  title: string;
  version: string;
  clipCount: number;
  markerCount: number;
  warnings: string[];
  content: string;
}

export interface ParsedFcpxmlDocument {
  title: string;
  fps: number;
  width: number;
  height: number;
  duration: number;
  assets: EditorAsset[];
  clips: Array<FcpxmlClipEvent & {
    trackName: string;
    trackKind: TimelineTrack['kind'];
  }>;
  markers: TimelineMarker[];
  warnings: string[];
}

export interface FcpxmlImportOptions {
  id?: string;
  name?: string;
  updatedAt?: string;
}

export interface FcpxmlProjectImport {
  project: EditorProject;
  clips: FcpxmlClipEvent[];
  markers: TimelineMarker[];
  warnings: string[];
}

type XmlAttributes = Record<string, string>;
type FcpxmlSupportedTransitionType = Extract<TimelineTransition['type'], 'crossfade' | 'dip' | 'push' | 'wipe'>;

const DEFAULT_FCPXML_VERSION = '1.10';
const DEFAULT_FCPXML_FPS = 30;
const MIN_EVENT_SECONDS = 0.001;

export function buildFcpxml(
  project: EditorProject,
  options: FcpxmlBuildOptions = {},
): FcpxmlDocument {
  const title = sanitizeTitle(options.title ?? project.name);
  const version = sanitizeFcpxmlVersion(options.version);
  const range = normalizeFcpxmlExportRange(project, options.exportRange);
  const warnings: string[] = [];
  const assetResourceIds = new Map<string, string>();
  const clipEvents: FcpxmlClipEvent[] = [];

  project.assets.forEach((asset) => {
    assetResourceIds.set(asset.id, safeXmlId('asset', asset.id));
  });

  project.tracks.forEach((track, trackIndex) => {
    if (track.locked && !options.includeLockedTracks) {
      warnings.push(`Skipped locked track ${track.name}.`);
      return;
    }

    if (track.muted && !options.includeMuted) {
      warnings.push(`Skipped muted track ${track.name}.`);
      return;
    }

    track.clips
      .slice()
      .sort((a, b) => a.start - b.start)
      .forEach((clip) => {
        const event = buildFcpxmlClipEvent({
          project,
          track,
          trackIndex,
          clip,
          range,
          warnings,
          includeMuted: Boolean(options.includeMuted),
        });
        if (event) {
          clipEvents.push(event);
        }
      });
  });

  const markerEvents = selectFcpxmlMarkers(project, range);
  const content = formatFcpxml({
    project,
    title,
    version,
    range,
    clipEvents,
    markerEvents,
    warnings,
    assetResourceIds,
  });

  return {
    title,
    version,
    clipCount: clipEvents.length,
    markerCount: markerEvents.length,
    warnings,
    content,
  };
}

export function parseFcpxml(content: string): ParsedFcpxmlDocument {
  const text = content.trim();
  if (!text) {
    throw new Error('FCPXML content is required.');
  }

  if (!/<fcpxml\b/i.test(text)) {
    throw new Error('FCPXML document root was not found.');
  }

  const warnings: string[] = [];
  const formats = parseFcpxmlFormats(text);
  const resourceAssets = parseFcpxmlAssets(text, formats, warnings);
  const projectAttrs = parseFirstTagAttributes(text, 'project');
  const sequenceAttrs = parseFirstTagAttributes(text, 'sequence');
  const primaryFormat = sequenceAttrs.format ? formats.get(sequenceAttrs.format) : undefined;
  const title = sanitizeTitle(xmlDecode(projectAttrs.name ?? 'Imported FCPXML'));
  const width = readPositiveNumber(primaryFormat?.width, createDefaultEditorProject().width);
  const height = readPositiveNumber(primaryFormat?.height, createDefaultEditorProject().height);
  const fps = readFpsFromFrameDuration(primaryFormat?.frameDuration, DEFAULT_FCPXML_FPS);
  const sequenceDuration = parseFcpxmlTime(sequenceAttrs.duration);
  const usedAssetIds = new Set(Array.from(resourceAssets.values()).map((item) => item.asset.id));
  const titleParse = parseFcpxmlTitleEvents(text, usedAssetIds, warnings);
  const assets = [
    ...Array.from(resourceAssets.values()).map((item) => item.asset),
    ...titleParse.assets,
  ];
  const clips = [
    ...parseFcpxmlClipEvents(text, resourceAssets, warnings),
    ...titleParse.clips,
  ].sort((a, b) => a.offset - b.offset || a.lane - b.lane || a.name.localeCompare(b.name));
  const markers = parseFcpxmlMarkers(text, sequenceDuration, warnings);
  const duration = Math.max(
    sequenceDuration,
    ...clips.map((clip) => clip.offset + clip.duration),
    ...markers.map((marker) => marker.time),
    0,
  );

  return {
    title,
    fps,
    width,
    height,
    duration: roundSeconds(duration),
    assets,
    clips,
    markers,
    warnings,
  };
}

export function importFcpxmlProject(
  content: string,
  options: FcpxmlImportOptions = {},
): FcpxmlProjectImport {
  const parsed = parseFcpxml(content);
  const defaults = createDefaultEditorProject();
  const clipsByTrack = new Map<string, TimelineClip[]>();
  const trackMeta = new Map<string, Pick<TimelineTrack, 'id' | 'name' | 'kind'>>();
  const usedClipIds = new Set<string>();
  const warnings = [...parsed.warnings];

  parsed.clips.forEach((event, index) => {
    if (event.duration <= MIN_EVENT_SECONDS) {
      warnings.push(`Skipped FCPXML clip ${event.name}: clip is too short.`);
      return;
    }

    const trackId = safeImportedTrackId(event.trackId || `${event.trackKind}-${event.lane}`);
    const clipId = uniqueId(safeImportedId(event.clipId || `clip-fcpxml-${index + 1}`), usedClipIds);
    const clip = createClip({
      id: clipId,
      assetId: event.assetId,
      trackId,
      name: event.name || `FCPXML Clip ${index + 1}`,
      kind: event.kind,
      start: roundSeconds(event.offset),
      duration: roundSeconds(event.duration),
      sourceIn: roundSeconds(event.sourceIn),
      color: colorForClipKind(event.kind),
      effects: event.effects?.length ? event.effects : event.titleStyle ? [buildImportedTitleStyleEffect(event.titleStyle, clipId)] : [],
      keyframes: event.keyframes ?? [],
      transitionIn: event.transitionIn,
      transitionOut: event.transitionOut,
    });

    if (!clipsByTrack.has(trackId)) {
      clipsByTrack.set(trackId, []);
      trackMeta.set(trackId, {
        id: trackId,
        name: event.trackName || importedTrackName(event.trackKind, event.lane),
        kind: event.trackKind,
      });
    }
    clipsByTrack.get(trackId)!.push(clip);
  });

  const tracks = Array.from(clipsByTrack.entries())
    .map(([trackId, clips]) => {
      const meta = trackMeta.get(trackId)!;
      return buildImportedFcpxmlTrack(meta.id, meta.name, meta.kind, clips);
    })
    .sort(compareImportedTracks);

  if (tracks.length === 0) {
    warnings.push('No supported FCPXML asset-clip entries were imported.');
  }

  return {
    project: {
      ...defaults,
      id: options.id ?? `fcpxml-${safeId(parsed.title)}`,
      name: options.name ?? parsed.title,
      fps: parsed.fps,
      width: parsed.width,
      height: parsed.height,
      duration: parsed.duration || defaults.duration,
      updatedAt: options.updatedAt ?? new Date().toISOString(),
      assets: parsed.assets,
      tracks,
      markers: parsed.markers,
      captions: [],
    },
    clips: parsed.clips,
    markers: parsed.markers,
    warnings: uniqueStrings(warnings),
  };
}

function buildFcpxmlClipEvent({
  project,
  track,
  trackIndex,
  clip,
  range,
  warnings,
  includeMuted,
}: {
  project: EditorProject;
  track: TimelineTrack;
  trackIndex: number;
  clip: TimelineClip;
  range: { start: number; end: number };
  warnings: string[];
  includeMuted: boolean;
}): FcpxmlClipEvent | undefined {
  if (clip.muted && !includeMuted) {
    warnings.push(`Skipped muted clip ${clip.name}.`);
    return undefined;
  }

  if (clip.kind === 'effect') {
    warnings.push(`Skipped ${clip.name}: effect clips are not represented in the current FCPXML interchange subset.`);
    return undefined;
  }

  const overlapStart = Math.max(clip.start, range.start);
  const overlapEnd = Math.min(clip.start + clip.duration, range.end);
  const duration = roundSeconds(overlapEnd - overlapStart);
  if (duration <= MIN_EVENT_SECONDS) {
    return undefined;
  }

  const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
  if (!asset) {
    warnings.push(`Skipped ${clip.name}: FCPXML export requires a linked media asset.`);
    return undefined;
  }

  if (clip.kind === 'text' || asset.kind === 'text') {
    return {
      clipId: clip.id,
      trackId: track.id,
      assetId: asset.id,
      name: clip.name,
      kind: 'text',
      offset: roundSeconds(overlapStart - range.start),
      sourceIn: 0,
      duration,
      lane: laneForTrack(track, trackIndex),
      titleText: String(asset.source || clip.name),
      titleStyle: readTitleStyle(clip),
      transitionOut: buildFcpxmlTransitionForExport(clip, warnings),
    };
  }

  if (clip.reversed) {
    warnings.push(`${clip.name}: reverse playback is not represented in the current FCPXML interchange subset.`);
  }

  if (clip.speed !== 1 || clip.speedRamp?.length) {
    warnings.push(`${clip.name}: speed changes are flattened to source timing in the current FCPXML interchange subset.`);
  }

  if (clip.effects.length > 0 || clip.keyframes.length > 0 || clip.transitionIn) {
    warnings.push(`${clip.name}: effects, keyframes, and incoming transitions are preserved as Danbi FCPXML metadata; external NLEs may ignore them.`);
  }

  const localRangeStart = roundSeconds(Math.max(0, overlapStart - clip.start));

  return {
    clipId: clip.id,
    trackId: track.id,
    assetId: asset.id,
    name: clip.name,
    kind: resolveFcpxmlClipEventKind(clip, asset),
    offset: roundSeconds(overlapStart - range.start),
    sourceIn: roundSeconds(clip.sourceIn + ((overlapStart - clip.start) * clip.speed)),
    duration,
    lane: laneForTrack(track, trackIndex),
    effects: sanitizeClipEffectsForFcpxml(clip.effects),
    keyframes: sanitizeClipKeyframesForFcpxml(clip.keyframes, localRangeStart, duration),
    transitionIn: localRangeStart <= 0.001 ? sanitizeTimelineTransitionForFcpxml(clip.transitionIn) : undefined,
    transitionOut: buildFcpxmlTransitionForExport(clip, warnings),
  };
}

function formatFcpxml({
  project,
  title,
  version,
  range,
  clipEvents,
  markerEvents,
  warnings,
  assetResourceIds,
}: {
  project: EditorProject;
  title: string;
  version: string;
  range: { start: number; end: number };
  clipEvents: FcpxmlClipEvent[];
  markerEvents: TimelineMarker[];
  warnings: string[];
  assetResourceIds: Map<string, string>;
}): string {
  const usedAssetIds = new Set(clipEvents.filter((event) => event.kind !== 'text').map((event) => event.assetId));
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE fcpxml>',
    `<fcpxml version="${xmlEscape(version)}">`,
    '  <resources>',
    `    <format id="fmt_danbi" name="Danbi ${project.width}x${project.height} ${project.fps}p" frameDuration="${formatFrameDuration(project.fps)}" width="${Math.round(project.width)}" height="${Math.round(project.height)}"/>`,
  ];

  project.assets
    .filter((asset) => usedAssetIds.has(asset.id))
    .forEach((asset) => {
      lines.push(`    ${formatFcpxmlAsset(asset, assetResourceIds.get(asset.id) ?? safeXmlId('asset', asset.id))}`);
    });

  lines.push(
    '  </resources>',
    '  <library>',
    `    <event name="${xmlEscape(title)}">`,
    `      <project name="${xmlEscape(title)}">`,
    `        <sequence format="fmt_danbi" duration="${formatFcpxmlTime(range.end - range.start)}" tcStart="0s" tcFormat="NDF">`,
    '          <spine>',
  );

  for (const warning of warnings) {
    lines.push(`            <!-- DANBI WARNING: ${xmlEscapeComment(warning)} -->`);
  }

  clipEvents
    .slice()
    .sort((a, b) => a.offset - b.offset || a.lane - b.lane)
    .forEach((event) => {
      if (event.kind === 'text') {
        lines.push(...formatFcpxmlTitleClip(event));
        return;
      }
      lines.push(`            ${formatFcpxmlAssetClip(event, assetResourceIds.get(event.assetId) ?? safeXmlId('asset', event.assetId))}`);
    });

  markerEvents.forEach((marker) => {
    lines.push(`            ${formatFcpxmlMarker(marker)}`);
  });

  lines.push(
    '          </spine>',
    '        </sequence>',
    '      </project>',
    '    </event>',
    '  </library>',
    '</fcpxml>',
    '',
  );

  return lines.join('\n');
}

function formatFcpxmlAsset(asset: EditorAsset, resourceId: string): string {
  const mediaKind = resolveRenderableAssetMediaKind(asset);
  const hasVideo = mediaKind === 'video' || mediaKind === 'image';
  const hasAudio = mediaKind === 'audio' || (mediaKind === 'video' && asset.metadata?.hasAudio === true);
  const source = resolveFcpxmlAssetSource(asset);
  const attrs: XmlAttributes = {
    id: resourceId,
    name: asset.name,
    src: source,
    duration: formatFcpxmlTime(asset.duration),
    start: '0s',
    format: 'fmt_danbi',
    'data-danbi-asset-id': asset.id,
    'data-danbi-kind': asset.kind,
    'data-danbi-source': asset.source.trim(),
  };

  if (hasVideo) {
    attrs.hasVideo = '1';
  }
  if (hasAudio) {
    attrs.hasAudio = '1';
  }
  if (asset.width) {
    attrs.width = String(Math.round(asset.width));
  }
  if (asset.height) {
    attrs.height = String(Math.round(asset.height));
  }
  if (asset.fps) {
    attrs.frameRate = String(asset.fps);
  }

  return `<asset ${formatXmlAttributes(attrs)}/>`;
}

function resolveFcpxmlAssetSource(asset: EditorAsset): string {
  return asset.renderPath?.trim() || asset.source.trim();
}

function formatFcpxmlAssetClip(event: FcpxmlClipEvent, resourceId: string): string {
  return `<asset-clip ${formatXmlAttributes({
    ...formatFcpxmlTransitionAttributes(event.transitionOut),
    ref: resourceId,
    name: event.name,
    offset: formatFcpxmlTime(event.offset),
    start: formatFcpxmlTime(event.sourceIn),
    duration: formatFcpxmlTime(event.duration),
    lane: String(event.lane),
    'data-danbi-clip-id': event.clipId,
    'data-danbi-track-id': event.trackId,
    'data-danbi-kind': event.kind,
    ...formatFcpxmlDanbiClipMetadataAttributes(event),
})}/>`;
}

function formatFcpxmlTitleClip(event: FcpxmlClipEvent): string[] {
  const style = normalizeTitleStyleForXml(event.titleStyle);
  const textStyleId = safeXmlId('ts', event.clipId);
  const titleText = event.titleText || event.name;

  return [
    `            <title ${formatXmlAttributes({
      ...formatFcpxmlTransitionAttributes(event.transitionOut),
      name: event.name,
      offset: formatFcpxmlTime(event.offset),
      start: '0s',
      duration: formatFcpxmlTime(event.duration),
      lane: String(event.lane),
      'data-danbi-clip-id': event.clipId,
      'data-danbi-track-id': event.trackId,
      'data-danbi-asset-id': event.assetId,
      'data-danbi-kind': 'text',
      'data-danbi-text': titleText,
      'data-danbi-font-size': String(style.fontSize),
      'data-danbi-font-color': style.fontColor,
      'data-danbi-box-enabled': String(style.boxEnabled),
      'data-danbi-box-color': style.boxColor,
      'data-danbi-box-opacity': String(style.boxOpacity),
      'data-danbi-shadow-enabled': String(style.shadowEnabled),
      'data-danbi-shadow-color': style.shadowColor,
      'data-danbi-shadow-opacity': String(style.shadowOpacity),
      'data-danbi-shadow-offset': String(style.shadowOffset),
      'data-danbi-position': style.position,
      'data-danbi-align': style.align,
      ...formatFcpxmlDanbiClipMetadataAttributes(event),
    })}>`,
    `              <text><text-style ref="${xmlEscape(textStyleId)}">${xmlEscape(titleText)}</text-style></text>`,
    '            </title>',
  ];
}

function formatFcpxmlMarker(marker: TimelineMarker): string {
  return `<marker ${formatXmlAttributes({
    start: formatFcpxmlTime(marker.time),
    ...(marker.duration && marker.duration > 0 ? {
      duration: formatFcpxmlTime(marker.duration),
      'data-danbi-marker-duration': formatFcpxmlTime(marker.duration),
    } : {}),
    value: marker.label,
    'data-danbi-marker-id': marker.id,
    'data-danbi-kind': marker.kind,
    'data-danbi-color': marker.color,
    ...(marker.note ? { 'data-danbi-marker-note': marker.note } : {}),
  })}/>`;
}

function parseFcpxmlFormats(text: string): Map<string, XmlAttributes> {
  const formats = new Map<string, XmlAttributes>();
  for (const attrs of parseTagAttributes(text, 'format')) {
    if (attrs.id) {
      formats.set(attrs.id, attrs);
    }
  }
  return formats;
}

function parseFcpxmlAssets(
  text: string,
  formats: Map<string, XmlAttributes>,
  warnings: string[],
): Map<string, { asset: EditorAsset; resourceId: string }> {
  const assets = new Map<string, { asset: EditorAsset; resourceId: string }>();
  const usedAssetIds = new Set<string>();

  parseTagAttributes(text, 'asset').forEach((attrs, index) => {
    const resourceId = attrs.id || `asset-${index + 1}`;
    const format = attrs.format ? formats.get(attrs.format) : undefined;
    const rawAssetId = attrs['data-danbi-asset-id'] || resourceId;
    const assetId = uniqueId(safeImportedId(rawAssetId), usedAssetIds);
    const kind = normalizeAssetKind(attrs['data-danbi-kind']) ?? inferAssetKind(attrs);
    const sourceInfo = resolveImportedFcpxmlAssetSource(attrs, resourceId);
    const duration = parseFcpxmlTime(attrs.duration) || 0;
    const fps = readFpsFromFrameDuration(format?.frameDuration, readPositiveNumber(attrs.frameRate, DEFAULT_FCPXML_FPS));
    const width = readPositiveNumber(attrs.width, readPositiveNumber(format?.width, undefined));
    const height = readPositiveNumber(attrs.height, readPositiveNumber(format?.height, undefined));

    if (!attrs.src && !attrs['data-danbi-source']) {
      warnings.push(`FCPXML asset ${xmlDecode(attrs.name || resourceId)} has no source path; it was imported as offline media.`);
    }

    const asset: EditorAsset = {
      id: assetId,
      name: xmlDecode(attrs.name || resourceId),
      kind,
      source: sourceInfo.source,
      renderPath: sourceInfo.renderPath,
      duration,
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
      ...(fps ? { fps } : {}),
      metadata: {
        importedFromFcpxml: true,
        fcpxmlResourceId: resourceId,
        fcpxmlRelinkHint: sourceInfo.relinkHint,
        fcpxmlAutoRelinked: Boolean(sourceInfo.renderPath),
        ...(sourceInfo.sourceFile ? { fcpxmlSourceFile: sourceInfo.sourceFile } : {}),
        ...buildFcpxmlAssetMediaMetadata(attrs, sourceInfo),
      },
    };
    assets.set(resourceId, { asset, resourceId });
  });

  return assets;
}

function parseFcpxmlClipEvents(
  text: string,
  resourceAssets: Map<string, { asset: EditorAsset; resourceId: string }>,
  warnings: string[],
): ParsedFcpxmlDocument['clips'] {
  const clips: ParsedFcpxmlDocument['clips'] = [];
  const regex = /<asset-clip\b([^>]*)(?:\/>|>([\s\S]*?)<\/asset-clip>)/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    const attrs = parseXmlAttributes(match[1]);
    const ref = attrs.ref;
    const resource = ref ? resourceAssets.get(ref) : undefined;
    if (!resource) {
      warnings.push(`Skipped FCPXML asset-clip ${xmlDecode(attrs.name || ref || 'unnamed')}: referenced asset was not found.`);
      continue;
    }

    const clipKind = resolveParsedFcpxmlClipKind(normalizeClipKind(attrs['data-danbi-kind']) ?? resource.asset.kind, resource.asset);
    if (clipKind === 'text' || clipKind === 'effect') {
      warnings.push(`Skipped FCPXML asset-clip ${xmlDecode(attrs.name || resource.asset.name)}: unsupported clip kind ${clipKind}.`);
      continue;
    }

    const lane = readInteger(attrs.lane, clipKind === 'audio' ? -1 : 1);
    const trackKind = clipKind === 'audio' ? 'audio' : 'video';
    const trackId = attrs['data-danbi-track-id'] || `${trackKind}-${lane}`;
    const offset = parseFcpxmlTime(attrs.offset || attrs.start);
    const sourceIn = parseFcpxmlTime(attrs.start);
    const duration = parseFcpxmlTime(attrs.duration) || resource.asset.duration;
    const clipName = attrs.name || resource.asset.name;
    const danbiMetadata = parseFcpxmlDanbiClipMetadata(attrs, clipName, duration, warnings);
    const transitionOut = danbiMetadata.transitionOut ?? parseFcpxmlTransition(attrs, clipName, warnings);

    clips.push({
      clipId: attrs['data-danbi-clip-id'] || `clip-fcpxml-${clips.length + 1}`,
      trackId,
      trackName: attrs['data-danbi-track-name'] || importedTrackName(trackKind, lane),
      trackKind,
      assetId: resource.asset.id,
      name: xmlDecode(clipName),
      kind: clipKind,
      offset: roundSeconds(offset),
      sourceIn: roundSeconds(sourceIn),
      duration: roundSeconds(duration),
      lane,
      ...danbiMetadata,
      transitionOut,
    });
  }

  return clips;
}

function parseFcpxmlTitleEvents(
  text: string,
  usedAssetIds: Set<string>,
  warnings: string[],
): {
  assets: EditorAsset[];
  clips: ParsedFcpxmlDocument['clips'];
} {
  const assets: EditorAsset[] = [];
  const clips: ParsedFcpxmlDocument['clips'] = [];
  const regex = /<title\b([^>]*)(?:\/>|>([\s\S]*?)<\/title>)/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    const attrs = parseXmlAttributes(match[1]);
    const body = match[2] ?? '';
    const titleText = normalizeParsedTitleText(attrs['data-danbi-text'] || extractFcpxmlTitleText(body) || attrs.name || `Title ${clips.length + 1}`);
    if (!titleText) {
      warnings.push(`Skipped FCPXML title ${clips.length + 1}: empty title text.`);
      continue;
    }

    const duration = parseFcpxmlTime(attrs.duration) || 5;
    if (duration <= MIN_EVENT_SECONDS) {
      warnings.push(`Skipped FCPXML title ${titleText}: title is too short.`);
      continue;
    }

    const clipId = attrs['data-danbi-clip-id'] || `clip-fcpxml-title-${clips.length + 1}`;
    const assetId = uniqueId(safeImportedId(attrs['data-danbi-asset-id'] || `asset-${clipId}`), usedAssetIds);
    const lane = readInteger(attrs.lane, 1);
    const offset = parseFcpxmlTime(attrs.offset || attrs.start);
    const titleStyle = parseTitleStyleAttributes(attrs);
    const danbiMetadata = parseFcpxmlDanbiClipMetadata(attrs, titleText, duration, warnings);
    const transitionOut = danbiMetadata.transitionOut ?? parseFcpxmlTransition(attrs, titleText, warnings);

    assets.push({
      id: assetId,
      name: attrs.name ? xmlDecode(attrs.name) : titleClipName(titleText),
      kind: 'text',
      source: titleText,
      duration: roundSeconds(duration),
      metadata: {
        importedFromFcpxml: true,
        fcpxmlTitle: true,
      },
    });

    clips.push({
      clipId,
      trackId: attrs['data-danbi-track-id'] || `text-${lane}`,
      trackName: attrs['data-danbi-track-name'] || importedTrackName('text', lane),
      trackKind: 'text',
      assetId,
      name: attrs.name ? xmlDecode(attrs.name) : titleClipName(titleText),
      kind: 'text',
      offset: roundSeconds(offset),
      sourceIn: 0,
      duration: roundSeconds(duration),
      lane,
      titleText,
      titleStyle,
      ...danbiMetadata,
      transitionOut,
    });
  }

  return { assets, clips };
}

function parseFcpxmlMarkers(text: string, sequenceDuration: number, warnings: string[]): TimelineMarker[] {
  const markers: TimelineMarker[] = [];
  const usedIds = new Set<string>();

  parseTagAttributes(text, 'marker').forEach((attrs, index) => {
    const time = parseFcpxmlTime(attrs.start || attrs.offset);
    if (!Number.isFinite(time) || time < 0) {
      warnings.push(`Skipped FCPXML marker ${index + 1}: invalid marker time.`);
      return;
    }
    if (sequenceDuration > 0 && time > sequenceDuration + 0.001) {
      warnings.push(`FCPXML marker ${xmlDecode(attrs.value || `Marker ${index + 1}`)} is beyond the sequence duration.`);
    }

    const kind = normalizeMarkerKind(attrs['data-danbi-kind']);
    const baseId = safeImportedId(attrs['data-danbi-marker-id'] || `marker-fcpxml-${index + 1}`);
    const duration = parseFcpxmlTime(attrs['data-danbi-marker-duration'] || attrs.duration);
    const note = normalizeOptionalMarkerNote(attrs['data-danbi-marker-note'] || attrs.note);
    markers.push({
      id: uniqueId(baseId, usedIds),
      time: roundSeconds(time),
      label: xmlDecode(attrs.value || attrs.name || `Marker ${index + 1}`),
      kind,
      color: normalizeMarkerColor(attrs['data-danbi-color'], kind),
      ...(duration > 0 ? { duration: roundSeconds(duration) } : {}),
      ...(note ? { note } : {}),
    });
  });

  return markers.sort((a, b) => a.time - b.time || a.label.localeCompare(b.label));
}

function selectFcpxmlMarkers(project: EditorProject, range: { start: number; end: number }): TimelineMarker[] {
  return project.markers
    .filter((marker) => marker.time >= range.start - 0.001 && marker.time <= range.end + 0.001)
    .map((marker) => ({
      ...marker,
      time: roundSeconds(marker.time - range.start),
      duration: normalizeFcpxmlMarkerDurationForRange(marker, range),
    }))
    .sort((a, b) => a.time - b.time || a.label.localeCompare(b.label));
}

function normalizeFcpxmlMarkerDurationForRange(marker: TimelineMarker, range: { start: number; end: number }): number | undefined {
  if (!marker.duration || marker.duration <= 0) {
    return undefined;
  }

  const markerEnd = Math.min(marker.time + marker.duration, range.end);
  const duration = roundSeconds(markerEnd - Math.max(marker.time, range.start));
  return duration > 0 ? duration : undefined;
}

function buildImportedFcpxmlTrack(
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

function compareImportedTracks(a: TimelineTrack, b: TimelineTrack): number {
  const kindOrder = (track: TimelineTrack): number => {
    if (track.kind === 'video') {
      return 0;
    }
    if (track.kind === 'text') {
      return 1;
    }
    if (track.kind === 'effect') {
      return 2;
    }
    return 3;
  };

  return kindOrder(a) - kindOrder(b) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

function parseTagAttributes(text: string, tagName: string): XmlAttributes[] {
  const regex = new RegExp(`<${tagName}(?=\\s|/|>)([^>]*)>`, 'gi');
  const attrs: XmlAttributes[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    attrs.push(parseXmlAttributes(match[1]));
  }
  return attrs;
}

function parseFirstTagAttributes(text: string, tagName: string): XmlAttributes {
  return parseTagAttributes(text, tagName)[0] ?? {};
}

function parseXmlAttributes(raw: string): XmlAttributes {
  const attrs: XmlAttributes = {};
  const regex = /([:\w.-]+)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw))) {
    attrs[match[1]] = xmlDecode(match[2]);
  }
  return attrs;
}

function formatXmlAttributes(attrs: XmlAttributes): string {
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
    .map(([key, value]) => `${key}="${xmlEscape(String(value))}"`)
    .join(' ');
}

export function formatFcpxmlTime(seconds: number): string {
  const rounded = roundSeconds(Math.max(0, seconds));
  return `${Number(rounded.toFixed(3)).toString()}s`;
}

export function parseFcpxmlTime(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const text = value.trim();
  const rational = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)s$/.exec(text);
  if (rational) {
    const numerator = Number(rational[1]);
    const denominator = Number(rational[2]);
    return denominator > 0 ? roundSeconds(numerator / denominator) : 0;
  }

  const seconds = /^(-?\d+(?:\.\d+)?)s$/.exec(text);
  if (seconds) {
    return roundSeconds(Number(seconds[1]));
  }

  const numeric = Number(text);
  return Number.isFinite(numeric) ? roundSeconds(numeric) : 0;
}

function formatFrameDuration(fps: number): string {
  const normalized = normalizeFps(fps);
  return `1/${normalized}s`;
}

function readFpsFromFrameDuration(value: string | undefined, fallback: number): number {
  if (!value) {
    return normalizeFps(fallback);
  }

  const frameSeconds = parseFcpxmlTime(value);
  if (!frameSeconds) {
    return normalizeFps(fallback);
  }

  return normalizeFps(1 / frameSeconds);
}

function normalizeFcpxmlExportRange(
  project: EditorProject,
  range?: FcpxmlBuildOptions['exportRange'],
): { start: number; end: number } {
  if (!range) {
    return { start: 0, end: project.duration };
  }

  const start = clampNumber(Math.min(range.start, range.end), 0, project.duration);
  const end = clampNumber(Math.max(range.start, range.end), 0, project.duration);
  if (end - start <= MIN_EVENT_SECONDS) {
    throw new Error('FCPXML export range must be longer than 0 seconds.');
  }

  return {
    start: roundSeconds(start),
    end: roundSeconds(end),
  };
}

function laneForTrack(track: TimelineTrack, index: number): number {
  if (track.kind === 'audio') {
    return -(index + 1);
  }
  return index + 1;
}

function resolveFcpxmlClipEventKind(clip: TimelineClip, asset: EditorAsset): ClipKind {
  const mediaKind = resolveRenderableAssetMediaKind(asset);
  if (clip.kind === 'audio' || mediaKind === 'audio') {
    return 'audio';
  }

  if (clip.kind !== 'ai' && mediaKind === 'image') {
    return 'image';
  }

  return clip.kind;
}

function resolveParsedFcpxmlClipKind(kind: ClipKind, asset: EditorAsset): ClipKind {
  const mediaKind = resolveRenderableAssetMediaKind(asset);
  if (kind === 'audio' || mediaKind === 'audio') {
    return 'audio';
  }

  if (kind !== 'ai' && mediaKind === 'image') {
    return 'image';
  }

  return kind;
}

function buildFcpxmlAssetMediaMetadata(
  attrs: XmlAttributes,
  sourceInfo: { source: string; renderPath?: string },
): Record<string, string | boolean> {
  const mimeType = inferMimeTypeFromPathCandidates([
    sourceInfo.source,
    sourceInfo.renderPath,
    xmlDecode(attrs['data-danbi-source'] ?? ''),
    xmlDecode(attrs.src ?? ''),
  ]);
  const imageLike = mimeType?.startsWith('image/') === true;

  return {
    ...(mimeType ? { mimeType } : {}),
    ...(attrs.hasAudio === '1' ? { hasAudio: true } : {}),
    ...(attrs.hasVideo === '1' && !imageLike ? { hasVideo: true } : {}),
  };
}

function inferMimeTypeFromPathCandidates(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const candidate = value?.trim();
    if (candidate && inferSupportedMediaFileKind({ name: candidate })) {
      return inferSupportedMediaMimeType(candidate);
    }
  }

  return undefined;
}

function inferAssetKind(attrs: XmlAttributes): ClipKind {
  if (attrs.hasAudio === '1' && attrs.hasVideo !== '1') {
    return 'audio';
  }
  return 'video';
}

function normalizeAssetKind(value: unknown): ClipKind | undefined {
  return normalizeClipKind(value);
}

function buildImportedTitleStyleEffect(style: CaptionStyle, clipId: string): ClipEffect {
  return {
    id: `effect-title-style-${clipId}`,
    type: 'caption',
    label: 'Title style',
    enabled: true,
    parameters: {
      ...normalizeTitleStyleForXml(style),
      titleStyle: true,
    },
  };
}

function buildFcpxmlTransitionForExport(
  clip: TimelineClip,
  warnings: string[],
): TimelineTransition | undefined {
  const transition = clip.transitionOut;
  if (!transition) {
    return undefined;
  }

  const sanitized = sanitizeTimelineTransitionForFcpxml(transition);
  if (!sanitized) {
    return undefined;
  }

  if (!isFcpxmlSupportedTransitionType(transition.type)) {
    warnings.push(`${clip.name}: ${transition.type} transition is preserved as Danbi FCPXML metadata only; external NLEs may ignore it until generated media is available.`);
  }

  return sanitized.duration > 0
    ? sanitized
    : { ...sanitized, duration: MIN_EVENT_SECONDS };
}

function formatFcpxmlTransitionAttributes(transition: TimelineTransition | undefined): XmlAttributes {
  if (!transition || !isFcpxmlSupportedTransitionType(transition.type)) {
    return {};
  }

  return {
    'data-danbi-transition-out-id': transition.id,
    'data-danbi-transition-out-type': transition.type,
    'data-danbi-transition-out-duration': formatFcpxmlTime(transition.duration),
    'data-danbi-transition-out-easing': transition.easing,
    'data-danbi-transition-out-parameters': JSON.stringify(transition.parameters ?? {}),
  };
}

function formatFcpxmlDanbiClipMetadataAttributes(event: FcpxmlClipEvent): XmlAttributes {
  return {
    ...(event.effects?.length ? { 'data-danbi-effects': JSON.stringify(event.effects) } : {}),
    ...(event.keyframes?.length ? { 'data-danbi-keyframes': JSON.stringify(event.keyframes) } : {}),
    ...(event.transitionIn ? { 'data-danbi-transition-in': JSON.stringify(event.transitionIn) } : {}),
    ...(event.transitionOut && !isFcpxmlSupportedTransitionType(event.transitionOut.type) ? { 'data-danbi-transition-out': JSON.stringify(event.transitionOut) } : {}),
  };
}

function parseFcpxmlDanbiClipMetadata(
  attrs: XmlAttributes,
  clipName: string,
  duration: number,
  warnings: string[],
): Pick<FcpxmlClipEvent, 'effects' | 'keyframes' | 'transitionIn' | 'transitionOut'> {
  const effects = parseDanbiClipEffects(attrs['data-danbi-effects'], clipName, warnings);
  const keyframes = parseDanbiClipKeyframes(attrs['data-danbi-keyframes'], clipName, duration, warnings);
  const transitionIn = parseDanbiTimelineTransition(attrs['data-danbi-transition-in'], clipName, 'incoming transition', warnings);
  const transitionOut = parseDanbiTimelineTransition(attrs['data-danbi-transition-out'], clipName, 'outgoing transition', warnings);

  return {
    ...(effects.length ? { effects } : {}),
    ...(keyframes.length ? { keyframes } : {}),
    ...(transitionIn ? { transitionIn } : {}),
    ...(transitionOut ? { transitionOut } : {}),
  };
}

function sanitizeClipEffectsForFcpxml(effects: ClipEffect[]): ClipEffect[] | undefined {
  const sanitized = effects.flatMap((effect): ClipEffect[] => {
    const type = normalizeClipEffectType(effect.type);
    const id = normalizeRequiredMetadataText(effect.id);
    const label = normalizeRequiredMetadataText(effect.label);
    if (!type || !id || !label) {
      return [];
    }

    return [{
      id,
      type,
      label,
      enabled: effect.enabled !== false,
      parameters: sanitizeParameterRecord(effect.parameters),
    }];
  });

  return sanitized.length ? sanitized : undefined;
}

function sanitizeClipKeyframesForFcpxml(
  keyframes: ClipKeyframe[],
  localRangeStart: number,
  duration: number,
): ClipKeyframe[] | undefined {
  const localRangeEnd = localRangeStart + duration;
  const sanitized = keyframes.flatMap((keyframe): ClipKeyframe[] => {
    const property = normalizeClipKeyframeProperty(keyframe.property);
    const easing = normalizeClipKeyframeEasing(keyframe.easing);
    const id = normalizeRequiredMetadataText(keyframe.id);
    const time = Number(keyframe.time);
    if (!property || !easing || !id || !Number.isFinite(time) || time < localRangeStart - 0.001 || time > localRangeEnd + 0.001 || !isMetadataPrimitive(keyframe.value)) {
      return [];
    }

    return [{
      id,
      property,
      easing,
      time: roundSeconds(clampNumber(time - localRangeStart, 0, duration)),
      value: keyframe.value,
    }];
  });

  return sanitized.length ? sanitized.sort((a, b) => a.time - b.time || a.property.localeCompare(b.property)) : undefined;
}

function sanitizeTimelineTransitionForFcpxml(transition: TimelineTransition | undefined): TimelineTransition | undefined {
  if (!transition || !isTimelineTransitionType(transition.type)) {
    return undefined;
  }

  const id = normalizeRequiredMetadataText(transition.id);
  const easing = normalizeTransitionEasing(transition.easing);
  const duration = Number(transition.duration);
  if (!id || !Number.isFinite(duration) || duration < 0) {
    return undefined;
  }

  return {
    id,
    type: transition.type,
    duration: roundSeconds(Math.max(0, duration)),
    easing,
    parameters: sanitizeParameterRecord(transition.parameters),
  };
}

function parseDanbiClipEffects(value: string | undefined, clipName: string, warnings: string[]): ClipEffect[] {
  const parsed = parseDanbiMetadataJson(value, clipName, 'effects', warnings);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((entry, index): ClipEffect[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      warnings.push(`Skipped FCPXML Danbi effect ${index + 1} on ${xmlDecode(clipName)}: invalid effect object.`);
      return [];
    }

    const record = entry as Record<string, unknown>;
    const type = normalizeClipEffectType(record.type);
    const id = normalizeRequiredMetadataText(record.id);
    const label = normalizeRequiredMetadataText(record.label);
    if (!type || !id || !label) {
      warnings.push(`Skipped FCPXML Danbi effect ${index + 1} on ${xmlDecode(clipName)}: missing id, type, or label.`);
      return [];
    }

    return [{
      id,
      type,
      label,
      enabled: record.enabled !== false,
      parameters: readParameterRecord(record.parameters),
    }];
  });
}

function parseDanbiClipKeyframes(
  value: string | undefined,
  clipName: string,
  duration: number,
  warnings: string[],
): ClipKeyframe[] {
  const parsed = parseDanbiMetadataJson(value, clipName, 'keyframes', warnings);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((entry, index): ClipKeyframe[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      warnings.push(`Skipped FCPXML Danbi keyframe ${index + 1} on ${xmlDecode(clipName)}: invalid keyframe object.`);
      return [];
    }

    const record = entry as Record<string, unknown>;
    const id = normalizeRequiredMetadataText(record.id);
    const property = normalizeClipKeyframeProperty(record.property);
    const easing = normalizeClipKeyframeEasing(record.easing);
    const time = Number(record.time);
    if (!id || !property || !easing || !Number.isFinite(time) || time < -0.001 || time > duration + 0.001 || !isMetadataPrimitive(record.value)) {
      warnings.push(`Skipped FCPXML Danbi keyframe ${index + 1} on ${xmlDecode(clipName)}: invalid property, time, easing, or value.`);
      return [];
    }

    return [{
      id,
      property,
      time: roundSeconds(clampNumber(time, 0, duration)),
      value: record.value,
      easing,
    }];
  }).sort((a, b) => a.time - b.time || a.property.localeCompare(b.property));
}

function parseDanbiTimelineTransition(
  value: string | undefined,
  clipName: string,
  label: string,
  warnings: string[],
): TimelineTransition | undefined {
  const parsed = parseDanbiMetadataJson(value, clipName, label, warnings);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined;
  }

  const record = parsed as Record<string, unknown>;
  const id = normalizeRequiredMetadataText(record.id);
  const type = isTimelineTransitionType(record.type) ? record.type : undefined;
  const easing = normalizeTransitionEasing(record.easing);
  const duration = Number(record.duration);
  if (!id || !type || !Number.isFinite(duration) || duration < 0) {
    warnings.push(`Skipped FCPXML Danbi ${label} on ${xmlDecode(clipName)}: invalid id, type, or duration.`);
    return undefined;
  }

  return {
    id,
    type,
    duration: roundSeconds(duration),
    easing,
    parameters: readParameterRecord(record.parameters),
  };
}

function parseDanbiMetadataJson(
  value: string | undefined,
  clipName: string,
  label: string,
  warnings: string[],
): unknown {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    warnings.push(`Skipped malformed FCPXML Danbi ${label} metadata on ${xmlDecode(clipName)}: ${(error as Error).message}`);
    return undefined;
  }
}

function parseFcpxmlTransition(
  attrs: XmlAttributes,
  clipName: string,
  warnings: string[],
): TimelineTransition | undefined {
  const type = attrs['data-danbi-transition-out-type'];
  if (!type) {
    return undefined;
  }

  if (!isFcpxmlSupportedTransitionType(type)) {
    warnings.push(`Skipped FCPXML transition on ${xmlDecode(clipName)}: unsupported transition type ${type}.`);
    return undefined;
  }

  const duration = parseFcpxmlTime(attrs['data-danbi-transition-out-duration']);
  const easing = normalizeTransitionEasing(attrs['data-danbi-transition-out-easing']);
  const parameters = parseTransitionParameters(attrs['data-danbi-transition-out-parameters'], clipName, warnings);

  return {
    id: attrs['data-danbi-transition-out-id'] || `transition-fcpxml-${safeId(clipName)}-${type}`,
    type,
    duration: duration > 0 ? duration : 0.5,
    easing,
    parameters,
  };
}

function isFcpxmlSupportedTransitionType(value: unknown): value is FcpxmlSupportedTransitionType {
  return value === 'crossfade' || value === 'dip' || value === 'push' || value === 'wipe';
}

function isTimelineTransitionType(value: unknown): value is TimelineTransition['type'] {
  return value === 'cut' ||
    value === 'crossfade' ||
    value === 'dip' ||
    value === 'push' ||
    value === 'wipe' ||
    value === 'match-cut' ||
    value === 'ai-morph';
}

function normalizeTransitionEasing(value: unknown): TimelineTransition['easing'] {
  return value === 'linear' || value === 'easeIn' || value === 'easeOut' || value === 'easeInOut'
    ? value
    : 'easeInOut';
}

function normalizeClipEffectType(value: unknown): ClipEffect['type'] | undefined {
  return value === 'color' ||
    value === 'audio' ||
    value === 'motion' ||
    value === 'caption' ||
    value === 'mask' ||
    value === 'stabilize' ||
    value === 'reframe' ||
    value === 'layout' ||
    value === 'filter' ||
    value === 'ai'
    ? value
    : undefined;
}

function normalizeClipKeyframeProperty(value: unknown): ClipKeyframe['property'] | undefined {
  return value === 'positionX' ||
    value === 'positionY' ||
    value === 'scale' ||
    value === 'rotation' ||
    value === 'opacity' ||
    value === 'volume'
    ? value
    : undefined;
}

function normalizeClipKeyframeEasing(value: unknown): ClipKeyframe['easing'] | undefined {
  return value === 'hold' ||
    value === 'linear' ||
    value === 'smooth' ||
    value === 'easeIn' ||
    value === 'easeOut' ||
    value === 'easeInOut'
    ? value
    : undefined;
}

function normalizeRequiredMetadataText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function sanitizeParameterRecord(value: Record<string, string | number | boolean> | undefined): Record<string, string | number | boolean> {
  return readParameterRecord(value);
}

function readParameterRecord(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const parameters: Record<string, string | number | boolean> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
    if (isMetadataPrimitive(entry)) {
      parameters[key] = entry;
    }
  });
  return parameters;
}

function isMetadataPrimitive(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}

function parseTransitionParameters(
  value: string | undefined,
  clipName: string,
  warnings: string[],
): TimelineTransition['parameters'] {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const parameters: TimelineTransition['parameters'] = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([key, entry]) => {
      if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
        parameters[key] = entry;
      }
    });
    return parameters;
  } catch (error) {
    warnings.push(`Skipped malformed FCPXML transition parameters on ${xmlDecode(clipName)}: ${(error as Error).message}`);
    return {};
  }
}

function parseTitleStyleAttributes(attrs: XmlAttributes): CaptionStyle {
  const style: CaptionStyle = {};
  const fontSize = Number(attrs['data-danbi-font-size']);
  const boxOpacity = Number(attrs['data-danbi-box-opacity']);
  const shadowOpacity = Number(attrs['data-danbi-shadow-opacity']);
  const shadowOffset = Number(attrs['data-danbi-shadow-offset']);

  if (Number.isFinite(fontSize) && fontSize > 0) {
    style.fontSize = fontSize;
  }
  if (isHexColor(attrs['data-danbi-font-color'])) {
    style.fontColor = attrs['data-danbi-font-color'];
  }
  if (attrs['data-danbi-box-enabled'] === 'true' || attrs['data-danbi-box-enabled'] === 'false') {
    style.boxEnabled = attrs['data-danbi-box-enabled'] === 'true';
  }
  if (isHexColor(attrs['data-danbi-box-color'])) {
    style.boxColor = attrs['data-danbi-box-color'];
  }
  if (Number.isFinite(boxOpacity)) {
    style.boxOpacity = clampNumber(boxOpacity, 0, 1);
  }
  if (attrs['data-danbi-shadow-enabled'] === 'true' || attrs['data-danbi-shadow-enabled'] === 'false') {
    style.shadowEnabled = attrs['data-danbi-shadow-enabled'] === 'true';
  }
  if (isHexColor(attrs['data-danbi-shadow-color'])) {
    style.shadowColor = attrs['data-danbi-shadow-color'];
  }
  if (Number.isFinite(shadowOpacity)) {
    style.shadowOpacity = clampNumber(shadowOpacity, 0, 1);
  }
  if (Number.isFinite(shadowOffset)) {
    style.shadowOffset = clampNumber(shadowOffset, 0, 32);
  }
  if (attrs['data-danbi-position'] === 'top' || attrs['data-danbi-position'] === 'middle' || attrs['data-danbi-position'] === 'bottom') {
    style.position = attrs['data-danbi-position'];
  }
  if (attrs['data-danbi-align'] === 'left' || attrs['data-danbi-align'] === 'center' || attrs['data-danbi-align'] === 'right') {
    style.align = attrs['data-danbi-align'];
  }

  return style;
}

function normalizeTitleStyleForXml(style: CaptionStyle | undefined): Required<CaptionStyle> {
  return {
    fontSize: Number.isFinite(style?.fontSize) && style!.fontSize! > 0 ? style!.fontSize! : 72,
    fontColor: isHexColor(style?.fontColor) ? style!.fontColor! : '#ffffff',
    boxEnabled: style?.boxEnabled === true,
    boxColor: isHexColor(style?.boxColor) ? style!.boxColor! : '#000000',
    boxOpacity: typeof style?.boxOpacity === 'number' ? clampNumber(style.boxOpacity, 0, 1) : 0.55,
    shadowEnabled: style?.shadowEnabled ?? true,
    shadowColor: isHexColor(style?.shadowColor) ? style!.shadowColor! : '#000000',
    shadowOpacity: typeof style?.shadowOpacity === 'number' ? clampNumber(style.shadowOpacity, 0, 1) : 0.72,
    shadowOffset: typeof style?.shadowOffset === 'number' ? clampNumber(style.shadowOffset, 0, 32) : 3,
    position: style?.position === 'top' || style?.position === 'middle' || style?.position === 'bottom' ? style.position : 'middle',
    align: style?.align === 'left' || style?.align === 'center' || style?.align === 'right' ? style.align : 'center',
  };
}

function extractFcpxmlTitleText(body: string): string {
  const styleText = /<text-style\b[^>]*>([\s\S]*?)<\/text-style>/i.exec(body)?.[1];
  if (styleText !== undefined) {
    return xmlDecode(stripXmlTags(styleText));
  }

  const text = /<text\b[^>]*>([\s\S]*?)<\/text>/i.exec(body)?.[1];
  return text !== undefined ? xmlDecode(stripXmlTags(text)) : '';
}

function stripXmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, '');
}

function normalizeParsedTitleText(value: string): string {
  return normalizeMultilineText(value);
}

function titleClipName(text: string): string {
  const flattened = text.replace(/\s+/g, ' ').trim();
  const title = flattened.length > 36 ? `${flattened.slice(0, 33)}...` : flattened;
  return `Title: ${title}`;
}

function normalizeMultilineText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/[ \t]+/g, ' '))
    .filter(Boolean)
    .join('\n');
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function normalizeClipKind(value: unknown): ClipKind | undefined {
  return value === 'video' || value === 'audio' || value === 'image' || value === 'ai' || value === 'text' || value === 'effect'
    ? value
    : undefined;
}

function normalizeMarkerKind(value: unknown): TimelineMarker['kind'] {
  return value === 'chapter' || value === 'beat' || value === 'warning' || value === 'todo'
    ? value
    : 'todo';
}

function normalizeMarkerColor(value: unknown, kind: TimelineMarker['kind']): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value
    : {
      chapter: '#22c55e',
      beat: '#f59e0b',
      warning: '#ef4444',
      todo: '#38bdf8',
    }[kind];
}

function normalizeOptionalMarkerNote(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function colorForClipKind(kind: ClipKind): string {
  if (kind === 'audio') {
    return '#a3e635';
  }
  if (kind === 'image') {
    return '#f59e0b';
  }
  if (kind === 'ai') {
    return '#c084fc';
  }
  return '#38bdf8';
}

function importedTrackName(kind: TimelineTrack['kind'], lane: number): string {
  if (kind === 'audio') {
    return `FCPXML Audio ${Math.abs(lane) || 1}`;
  }
  if (kind === 'text') {
    return `FCPXML Text ${Math.abs(lane) || 1}`;
  }
  if (kind === 'effect') {
    return `FCPXML Effect ${Math.abs(lane) || 1}`;
  }
  return `FCPXML Video ${Math.abs(lane) || 1}`;
}

function safeImportedTrackId(value: string): string {
  return `track-${safeId(value) || 'fcpxml'}`;
}

function safeImportedId(value: string): string {
  return safeId(value) || 'fcpxml-item';
}

function resolveImportedFcpxmlAssetSource(
  attrs: XmlAttributes,
  resourceId: string,
): { source: string; renderPath?: string; relinkHint: string; sourceFile?: string } {
  const rawBrowserSource = xmlDecode(attrs['data-danbi-source'] || attrs.src || `offline://fcpxml/${resourceId}`);
  const rawRenderSource = xmlDecode(attrs.src || attrs['data-danbi-source'] || '');
  const renderPath = resolveLocalFcpxmlRenderPath(rawRenderSource);
  const source = renderPath
    ? resolveBrowserFcpxmlSource(rawBrowserSource) ?? `offline://fcpxml/${resourceId}`
    : rawBrowserSource;

  return {
    source,
    renderPath,
    relinkHint: filenameFromPath(renderPath ?? rawRenderSource ?? rawBrowserSource) || xmlDecode(attrs.name || resourceId),
    sourceFile: renderPath,
  };
}

function resolveBrowserFcpxmlSource(source: string | undefined): string | undefined {
  if (!source) {
    return undefined;
  }

  if (/^\/(?:imports|outputs|cache|media|luts)\//.test(source) || /^https?:\/\//i.test(source) || source.startsWith('data:') || source.startsWith('blob:')) {
    return source;
  }

  return undefined;
}

function resolveLocalFcpxmlRenderPath(source: string | undefined): string | undefined {
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

function filenameFromPath(value: string): string {
  const normalized = value.trim().split(/[?#]/)[0].replace(/\\/g, '/').replace(/\/+$/g, '');
  if (!normalized || normalized.startsWith('offline://')) {
    return '';
  }

  return normalized.split('/').filter(Boolean).at(-1) ?? '';
}

function safeXmlId(prefix: string, value: string): string {
  return `${prefix}_${safeId(value).replace(/-/g, '_') || 'item'}`;
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function uniqueId(baseId: string, usedIds: Set<string>): string {
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function sanitizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ') || 'Danbi Studio FCPXML';
}

function sanitizeFcpxmlVersion(value: string | undefined): string {
  return value && /^\d+\.\d+$/.test(value) ? value : DEFAULT_FCPXML_VERSION;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function xmlEscapeComment(value: string): string {
  return value.replace(/--/g, '- -').replace(/[<>]/g, '');
}

function xmlDecode(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function readPositiveNumber(value: string | number | undefined, fallback: number): number;
function readPositiveNumber(value: string | number | undefined, fallback: number | undefined): number | undefined;
function readPositiveNumber(value: string | number | undefined, fallback: number | undefined): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function readInteger(value: string | undefined, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function normalizeFps(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_FCPXML_FPS;
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
