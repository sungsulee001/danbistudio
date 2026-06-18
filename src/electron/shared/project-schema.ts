import {
  CURRENT_EDITOR_PROJECT_SCHEMA_VERSION,
  deserializeProject,
  migrateEditorProject,
  serializeProject,
  summarizeProject,
  type ProjectSummary,
} from '../../lib/editor/project-store';
import {
  EXPORT_PROFILE_MAX_DIMENSION,
  EXPORT_PROFILE_MIN_DIMENSION,
  isExportProfileCodecContainerCompatible,
} from '../../lib/editor/export-profiles';
import {
  PLUGIN_MANIFEST_SIGNATURE_ALGORITHM,
  PLUGIN_MANIFEST_SIGNATURE_FINGERPRINT_PATTERN,
  PLUGIN_MANIFEST_RSA_SIGNATURE_ALGORITHM,
  PLUGIN_MANIFEST_RSA_SIGNATURE_VALUE_PATTERN,
  verifyPluginManifestSignature,
} from '../../lib/editor/plugin-signature';
import { resolveRenderableAssetMediaKind } from '../../lib/editor/renderable-media-kind';
import type { ClipKind, EditorProject, TrackKind } from '../../lib/editor/types';

export const EDITOR_PROJECT_JSON_SCHEMA_ID = 'danbi-studio.editor-project';
export const EDITOR_PROJECT_SCHEMA_VERSION = CURRENT_EDITOR_PROJECT_SCHEMA_VERSION;

export type ProjectJsonValidationSeverity = 'error' | 'warning';

export interface ProjectJsonValidationIssue {
  path: string;
  message: string;
  severity: ProjectJsonValidationSeverity;
}

export interface ProjectJsonValidationResult {
  ok: boolean;
  project?: EditorProject;
  schemaVersion?: number;
  errors: string[];
  warnings: string[];
  issues: ProjectJsonValidationIssue[];
}

interface ProjectAssetValidationIndex {
  ids: Set<string>;
  byId: Map<string, Record<string, unknown>>;
}

const CLIP_KINDS = new Set<ClipKind>(['video', 'audio', 'image', 'text', 'effect', 'ai']);
const RENDER_PATH_BACKED_ASSET_KINDS = new Set<ClipKind>(['video', 'audio', 'image', 'ai']);
const TRACK_KINDS = new Set<TrackKind>(['video', 'audio', 'text', 'effect']);
const MARKER_KINDS = new Set(['chapter', 'beat', 'warning', 'todo']);
const TRANSITION_TYPES = new Set(['cut', 'crossfade', 'dip', 'push', 'wipe', 'match-cut', 'ai-morph']);
const TRANSITION_EASINGS = new Set(['linear', 'easeIn', 'easeOut', 'easeInOut']);
const CLIP_KEYFRAME_PROPERTIES = new Set(['positionX', 'positionY', 'scale', 'rotation', 'opacity', 'volume']);
const CLIP_KEYFRAME_EASINGS = new Set(['hold', 'linear', 'smooth', 'easeIn', 'easeOut', 'easeInOut']);
const BLEND_MODES = new Set(['normal', 'screen', 'multiply', 'overlay', 'add']);
const CLIP_EFFECT_TYPES = new Set(['color', 'audio', 'motion', 'caption', 'mask', 'stabilize', 'reframe', 'layout', 'filter', 'ai']);
const CAPTION_POSITIONS = new Set(['top', 'middle', 'bottom']);
const CAPTION_ALIGNS = new Set(['left', 'center', 'right']);
const AUTOMATION_PROVIDERS = new Set(['comfyui', 'local', 'webhook']);
const AUTOMATION_TRIGGERS = new Set(['manual', 'on-import', 'before-export', 'on-gap']);
const PLUGIN_PERMISSIONS = new Set(['filesystem', 'network', 'comfyui', 'render', 'project']);
const PLUGIN_CONTRIBUTES = new Set(['effect', 'transition', 'exporter', 'automation', 'analyzer', 'workflow']);
const PLUGIN_PARAMETER_SCHEMA_TYPES = new Set(['number', 'string', 'boolean', 'enum']);
const PLUGIN_CUSTOM_COMMAND_CONTRIBUTIONS = new Set(['automation', 'analyzer', 'exporter']);
const PLUGIN_CUSTOM_COMMAND_KINDS = new Set(['project-summary', 'timeline-report', 'export-report']);
const PLUGIN_EXPORTER_WRITER_TRUST = new Set(['trusted', 'prompt', 'blocked']);
const PLUGIN_EXPORTER_WRITER_TRUST_AUDIT_ACTIONS = new Set(['approved', 'review-required', 'blocked']);
const PLUGIN_EXPORTER_WRITER_RUNTIMES = new Set(['native', 'node']);
const PLUGIN_MANIFEST_SIGNATURE_ALGORITHMS = new Set([
  PLUGIN_MANIFEST_SIGNATURE_ALGORITHM,
  PLUGIN_MANIFEST_RSA_SIGNATURE_ALGORITHM,
]);
const EXPORT_PROFILE_PURPOSES = new Set(['master', 'social', 'proxy']);
const EXPORT_PROFILE_CONTAINERS = new Set(['mp4', 'mov', 'webm']);
const EXPORT_PROFILE_CODECS = new Set(['h264', 'h265', 'prores', 'av1']);
const EXPORT_PROFILE_PRESETS = new Set(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow']);
const CAPTION_WORD_RANGE_TOLERANCE_SECONDS = 0.02;
const TITLE_STYLE_EFFECT_LABEL = 'Title style';
const MAX_PLUGIN_PLAN_PARAMETER_SCHEMA_COUNT = 128;
const MAX_PLUGIN_CUSTOM_COMMAND_COUNT = 64;
const MAX_PLUGIN_PARAMETER_SCHEMA_COUNT = 64;
const MAX_PLUGIN_PARAMETER_ENUM_VALUE_COUNT = 128;
const MAX_PLUGIN_PARAMETER_STRING_LENGTH = 500;
const MAX_PLUGIN_EXPORTER_WRITER_COUNT = 16;
const MAX_PLUGIN_EXPORTER_WRITER_ARG_COUNT = 64;
const MAX_PLUGIN_EXPORTER_WRITER_PACKAGE_FILE_COUNT = 64;
const MAX_PLUGIN_EXPORTER_WRITER_TRUST_HISTORY_COUNT = 32;
const MAX_PLUGIN_EXPORTER_WRITER_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_PLUGIN_COMFYUI_WORKFLOW_COUNT = 128;
const MAX_PLUGIN_COMFYUI_NODE_TYPE_COUNT = 128;

export function parseProjectJson(data: string): EditorProject {
  return deserializeProject(data);
}

export function stringifyProjectJson(project: EditorProject, pretty = false): string {
  const migrated = migrateProjectJson(project);
  return pretty ? JSON.stringify(migrated, null, 2) : serializeProject(migrated);
}

export function migrateProjectJson(project: Partial<EditorProject>): EditorProject {
  return migrateEditorProject(project);
}

export function validateProjectJson(value: unknown): ProjectJsonValidationResult {
  const issues: ProjectJsonValidationIssue[] = [];
  const parsed = parseProjectJsonForValidation(value, issues);

  if (!parsed) {
    return buildValidationResult(issues);
  }

  validateProjectShape(parsed, issues);

  if (hasValidationErrors(issues)) {
    return buildValidationResult(issues, undefined, readSchemaVersion(parsed));
  }

  try {
    const project = migrateProjectJson(parsed as Partial<EditorProject>);

    return buildValidationResult(issues, project, project.schemaVersion);
  } catch (error) {
    addIssue(issues, 'error', '$', (error as Error).message);
    return buildValidationResult(issues, undefined, readSchemaVersion(parsed));
  }
}

export function formatProjectJsonValidationFailure(
  result: ProjectJsonValidationResult,
  heading = 'Project JSON validation failed',
): string {
  if (result.ok) {
    return '';
  }

  return [
    heading,
    ...result.errors,
  ].join('\n');
}

export function assertValidProjectJson(value: unknown, heading?: string): EditorProject {
  const validation = validateProjectJson(value);
  if (!validation.ok || !validation.project) {
    throw new Error(formatProjectJsonValidationFailure(validation, heading));
  }

  return validation.project;
}

export function summarizeProjectJson(
  project: EditorProject,
  createdAt: Date | string,
  updatedAt: Date | string,
): ProjectSummary {
  return summarizeProject(migrateProjectJson(project), createdAt, updatedAt);
}

export function cloneProjectJson(project: EditorProject): EditorProject {
  return parseProjectJson(stringifyProjectJson(project));
}

export type { ProjectSummary };

function parseProjectJsonForValidation(
  value: unknown,
  issues: ProjectJsonValidationIssue[],
): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!isRecord(parsed)) {
        addIssue(issues, 'error', '$', 'Project JSON must be an object.');
        return undefined;
      }

      return parsed;
    } catch (error) {
      addIssue(issues, 'error', '$', `Project JSON is not valid JSON: ${(error as Error).message}`);
      return undefined;
    }
  }

  if (!isRecord(value)) {
    addIssue(issues, 'error', '$', 'Project JSON must be an object.');
    return undefined;
  }

  return value;
}

function validateProjectShape(project: Record<string, unknown>, issues: ProjectJsonValidationIssue[]): void {
  requireNonEmptyString(project.id, '$.id', issues);
  requireNonEmptyString(project.name, '$.name', issues);
  validateSchemaVersion(project.schemaVersion, issues);
  validatePositiveNumber(project.fps, '$.fps', issues, { optional: true });
  validatePositiveInteger(project.width, '$.width', issues, { optional: true });
  validatePositiveInteger(project.height, '$.height', issues, { optional: true });
  validateNonNegativeNumber(project.duration, '$.duration', issues, { optional: true });
  validateOptionalString(project.updatedAt, '$.updatedAt', issues);

  const assets = validateArray(project.assets, '$.assets', issues, { optional: true });
  const tracks = validateArray(project.tracks, '$.tracks', issues);
  const markers = validateArray(project.markers, '$.markers', issues, { optional: true });
  const captions = validateArray(project.captions, '$.captions', issues, { optional: true });
  const automation = validateArray(project.automation, '$.automation', issues, { optional: true });
  const plugins = validateArray(project.plugins, '$.plugins', issues, { optional: true });
  const exportProfiles = validateArray(project.exportProfiles, '$.exportProfiles', issues, { optional: true });

  const assetIndex = validateAssets(assets, issues);
  validateTracks(tracks, assetIndex, issues);
  validateMarkers(markers, issues);
  validateCaptions(captions, issues);
  validateAutomationRules(automation, issues);
  validatePluginManifests(plugins, issues);
  validateExportProfiles(exportProfiles, issues);
}

function validateSchemaVersion(value: unknown, issues: ProjectJsonValidationIssue[]): void {
  if (value === undefined) {
    addIssue(issues, 'warning', '$.schemaVersion', `Missing project schemaVersion will be set to ${EDITOR_PROJECT_SCHEMA_VERSION}.`);
    return;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    addIssue(issues, 'error', '$.schemaVersion', 'Project schemaVersion must be a positive integer.');
    return;
  }

  if (value < EDITOR_PROJECT_SCHEMA_VERSION) {
    addIssue(issues, 'warning', '$.schemaVersion', `Project schemaVersion ${value} will be migrated to ${EDITOR_PROJECT_SCHEMA_VERSION}.`);
    return;
  }

  if (value > EDITOR_PROJECT_SCHEMA_VERSION) {
    addIssue(issues, 'error', '$.schemaVersion', `Project schemaVersion ${value} is newer than supported schema version ${EDITOR_PROJECT_SCHEMA_VERSION}.`);
  }
}

function validateAssets(values: unknown[], issues: ProjectJsonValidationIssue[]): ProjectAssetValidationIndex {
  const ids = new Set<string>();
  const byId = new Map<string, Record<string, unknown>>();

  values.forEach((asset, index) => {
    const path = `$.assets[${index}]`;
    if (!isRecord(asset)) {
      addIssue(issues, 'error', path, 'Asset must be an object.');
      return;
    }

    const id = readNonEmptyString(asset.id);
    if (!id) {
      addIssue(issues, 'error', `${path}.id`, 'Asset id must be a non-empty string.');
    } else if (ids.has(id)) {
      addIssue(issues, 'error', `${path}.id`, `Asset id "${id}" is duplicated.`);
    } else {
      ids.add(id);
      byId.set(id, asset);
    }

    validateClipKind(asset.kind, `${path}.kind`, issues);
    requireNonEmptyString(asset.name, `${path}.name`, issues);
    validateAssetSource(asset, path, issues);
    validateNonNegativeNumber(asset.duration, `${path}.duration`, issues);
    validatePositiveInteger(asset.width, `${path}.width`, issues, { optional: true });
    validatePositiveInteger(asset.height, `${path}.height`, issues, { optional: true });
    validatePositiveNumber(asset.fps, `${path}.fps`, issues, { optional: true });
    validateOptionalString(asset.renderPath, `${path}.renderPath`, issues);
  });

  return { ids, byId };
}

function validateAssetSource(
  asset: Record<string, unknown>,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  if (readNonEmptyString(asset.source)) {
    return;
  }

  const hasEmptyStringSource = typeof asset.source === 'string' && asset.source.trim().length === 0;
  if (
    hasEmptyStringSource &&
    isRenderPathBackedAssetKind(asset.kind) &&
    readNonEmptyString(asset.renderPath)
  ) {
    return;
  }

  requireNonEmptyString(asset.source, `${path}.source`, issues);
}

function validateTracks(
  values: unknown[],
  assetIndex: ProjectAssetValidationIndex,
  issues: ProjectJsonValidationIssue[],
): void {
  const ids = new Set<string>();
  const clipIds = new Set<string>();

  values.forEach((track, index) => {
    const path = `$.tracks[${index}]`;
    if (!isRecord(track)) {
      addIssue(issues, 'error', path, 'Track must be an object.');
      return;
    }

    const id = readNonEmptyString(track.id);
    if (!id) {
      addIssue(issues, 'error', `${path}.id`, 'Track id must be a non-empty string.');
    } else if (ids.has(id)) {
      addIssue(issues, 'error', `${path}.id`, `Track id "${id}" is duplicated.`);
    } else {
      ids.add(id);
    }

    requireNonEmptyString(track.name, `${path}.name`, issues);
    validateTrackKind(track.kind, `${path}.kind`, issues);
    validateOptionalBoolean(track.muted, `${path}.muted`, issues);
    validateOptionalBoolean(track.solo, `${path}.solo`, issues);
    validateOptionalBoolean(track.syncLocked, `${path}.syncLocked`, issues);
    validateOptionalBoolean(track.locked, `${path}.locked`, issues);
    validateNumberInRange(track.volumeDb, `${path}.volumeDb`, issues, -96, 24, { optional: true });
    validateNumberInRange(track.pan, `${path}.pan`, issues, -1, 1, { optional: true });

    const clips = validateArray(track.clips, `${path}.clips`, issues);
    validateTrackClips(clips, path, track.kind, id, assetIndex, clipIds, issues);
  });
}

function validateTrackClips(
  clips: unknown[],
  trackPath: string,
  trackKind: unknown,
  trackId: string | undefined,
  assetIndex: ProjectAssetValidationIndex,
  clipIds: Set<string>,
  issues: ProjectJsonValidationIssue[],
): void {
  clips.forEach((clip, index) => {
    const path = `${trackPath}.clips[${index}]`;
    if (!isRecord(clip)) {
      addIssue(issues, 'error', path, 'Clip must be an object.');
      return;
    }

    const id = readNonEmptyString(clip.id);
    if (!id) {
      addIssue(issues, 'error', `${path}.id`, 'Clip id must be a non-empty string.');
    } else if (clipIds.has(id)) {
      addIssue(issues, 'error', `${path}.id`, `Clip id "${id}" is duplicated.`);
    } else {
      clipIds.add(id);
    }

    const clipTrackId = readNonEmptyString(clip.trackId);
    if (!clipTrackId) {
      addIssue(issues, 'error', `${path}.trackId`, 'Clip trackId must be a non-empty string.');
    } else if (trackId && clipTrackId !== trackId) {
      addIssue(issues, 'error', `${path}.trackId`, `Clip trackId "${clipTrackId}" does not match parent track "${trackId}".`);
    }

    requireNonEmptyString(clip.name, `${path}.name`, issues);
    validateClipKind(clip.kind, `${path}.kind`, issues);
    validateNonNegativeNumber(clip.start, `${path}.start`, issues);
    validatePositiveNumber(clip.duration, `${path}.duration`, issues);
    validateNonNegativeNumber(clip.sourceIn, `${path}.sourceIn`, issues, { optional: true });
    validatePositiveNumber(clip.speed, `${path}.speed`, issues, { optional: true });
    validateNumberInRange(clip.volume, `${path}.volume`, issues, 0, 4, { optional: true });
    validateNumberInRange(clip.opacity, `${path}.opacity`, issues, 0, 1, { optional: true });
    validateOptionalString(clip.color, `${path}.color`, issues);
    validateOptionalBoolean(clip.reversed, `${path}.reversed`, issues);
    validateOptionalBoolean(clip.muted, `${path}.muted`, issues);
    validateOptionalBoolean(clip.locked, `${path}.locked`, issues);
    validateEnumValue(clip.blendMode, BLEND_MODES, `${path}.blendMode`, issues, { optional: true });
    validateArray(clip.automationTags, `${path}.automationTags`, issues, { optional: true });
    validateClipEffects(validateArray(clip.effects, `${path}.effects`, issues, { optional: true }), `${path}.effects`, clip.kind, issues);
    validateClipKeyframes(validateArray(clip.keyframes, `${path}.keyframes`, issues, { optional: true }), `${path}.keyframes`, issues);
    validateTransition(clip.transitionIn, `${path}.transitionIn`, issues);
    validateTransition(clip.transitionOut, `${path}.transitionOut`, issues);

    const assetId = readNonEmptyString(clip.assetId);
    if (assetId && !assetIndex.ids.has(assetId)) {
      addIssue(issues, 'error', `${path}.assetId`, `Clip assetId "${assetId}" does not exist in assets.`);
    }

    const asset = assetId ? assetIndex.byId.get(assetId) : undefined;
    if (isClipKind(clip.kind) && isTrackKind(trackKind) && trackKindForProjectClip(clip.kind, asset) !== trackKind) {
      addIssue(issues, 'error', `${path}.kind`, `Clip kind "${clip.kind}" cannot be placed on "${trackKind}" track.`);
    }
  });
}

function validateClipEffects(
  effects: unknown[],
  effectsPath: string,
  clipKind: unknown,
  issues: ProjectJsonValidationIssue[],
): void {
  const ids = new Set<string>();

  effects.forEach((effect, index) => {
    const path = `${effectsPath}[${index}]`;
    if (!isRecord(effect)) {
      addIssue(issues, 'error', path, 'Clip effect must be an object.');
      return;
    }

    validateUniqueId(effect.id, ids, `${path}.id`, 'Clip effect', issues);
    validateEnumValue(effect.type, CLIP_EFFECT_TYPES, `${path}.type`, issues);
    requireNonEmptyString(effect.label, `${path}.label`, issues);
    validateBoolean(effect.enabled, `${path}.enabled`, issues);

    const parametersPath = `${path}.parameters`;
    if (!isRecord(effect.parameters)) {
      addIssue(issues, 'error', parametersPath, 'Clip effect parameters must be an object.');
      return;
    }

    validateEffectParameterValues(effect.parameters, parametersPath, issues);
    if (isTitleStyleEffect(effect)) {
      if (clipKind !== 'text') {
        addIssue(issues, 'error', path, 'Title style effect can only be used on text clips.');
      }
      validateOptionalBoolean(effect.parameters.titleStyle, `${parametersPath}.titleStyle`, issues);
      validateCaptionStyle(effect.parameters, parametersPath, issues);
    }
  });
}

function validateEffectParameterValues(
  parameters: Record<string, unknown>,
  parametersPath: string,
  issues: ProjectJsonValidationIssue[],
): void {
  validateParameterValues(parameters, parametersPath, issues, 'Clip effect parameter');
}

function validateParameterRecord(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
  label: string,
): void {
  if (!isRecord(value)) {
    addIssue(issues, 'error', path, `${label} record must be an object.`);
    return;
  }

  validateParameterValues(value, path, issues, label);
}

function validateParameterValues(
  parameters: Record<string, unknown>,
  parametersPath: string,
  issues: ProjectJsonValidationIssue[],
  label: string,
): void {
  Object.entries(parameters).forEach(([key, value]) => {
    const path = `${parametersPath}.${key}`;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        addIssue(issues, 'error', path, `${label} number must be finite.`);
      }
      return;
    }

    if (typeof value === 'string' || typeof value === 'boolean') {
      return;
    }

    addIssue(issues, 'error', path, `${label} must be a string, finite number, or boolean.`);
  });
}

function isTitleStyleEffect(effect: Record<string, unknown>): boolean {
  return effect.type === 'caption' && (
    effect.label === TITLE_STYLE_EFFECT_LABEL ||
    (isRecord(effect.parameters) && effect.parameters.titleStyle === true)
  );
}

function validateClipKeyframes(
  keyframes: unknown[],
  keyframesPath: string,
  issues: ProjectJsonValidationIssue[],
): void {
  const ids = new Set<string>();

  keyframes.forEach((keyframe, index) => {
    const path = `${keyframesPath}[${index}]`;
    if (!isRecord(keyframe)) {
      addIssue(issues, 'error', path, 'Keyframe must be an object.');
      return;
    }

    validateUniqueId(keyframe.id, ids, `${path}.id`, 'Keyframe', issues);
    validateEnumValue(keyframe.property, CLIP_KEYFRAME_PROPERTIES, `${path}.property`, issues);
    validateNonNegativeNumber(keyframe.time, `${path}.time`, issues);
    if (typeof keyframe.value !== 'number' || !Number.isFinite(keyframe.value)) {
      addIssue(issues, 'error', `${path}.value`, 'Keyframe value must be a finite number.');
    }
    validateEnumValue(keyframe.easing, CLIP_KEYFRAME_EASINGS, `${path}.easing`, issues);
  });
}

function validateMarkers(values: unknown[], issues: ProjectJsonValidationIssue[]): void {
  const ids = new Set<string>();

  values.forEach((marker, index) => {
    const path = `$.markers[${index}]`;
    if (!isRecord(marker)) {
      addIssue(issues, 'error', path, 'Marker must be an object.');
      return;
    }

    validateUniqueId(marker.id, ids, `${path}.id`, 'Marker', issues);
    validateNonNegativeNumber(marker.time, `${path}.time`, issues);
    requireNonEmptyString(marker.label, `${path}.label`, issues);
    validateOptionalString(marker.color, `${path}.color`, issues);
    validateEnumValue(marker.kind, MARKER_KINDS, `${path}.kind`, issues);
    validatePositiveNumber(marker.duration, `${path}.duration`, issues, { optional: true });
    validateOptionalString(marker.note, `${path}.note`, issues);
  });
}

function validateCaptions(values: unknown[], issues: ProjectJsonValidationIssue[]): void {
  const ids = new Set<string>();

  values.forEach((caption, index) => {
    const path = `$.captions[${index}]`;
    if (!isRecord(caption)) {
      addIssue(issues, 'error', path, 'Caption must be an object.');
      return;
    }

    validateUniqueId(caption.id, ids, `${path}.id`, 'Caption', issues);
    validateNonNegativeNumber(caption.start, `${path}.start`, issues);
    validatePositiveNumber(caption.end, `${path}.end`, issues);
    if (typeof caption.start === 'number' && typeof caption.end === 'number' && caption.end <= caption.start) {
      addIssue(issues, 'error', `${path}.end`, 'Caption end must be after start.');
    }
    requireNonEmptyString(caption.text, `${path}.text`, issues);
    validateOptionalString(caption.speaker, `${path}.speaker`, issues);
    validateNumberInRange(caption.confidence, `${path}.confidence`, issues, 0, 1, { optional: true });
    validateCaptionSpeakerEmbedding(caption.speakerEmbedding, `${path}.speakerEmbedding`, issues);
    const words = validateArray(caption.words, `${path}.words`, issues, { optional: true });
    validateCaptionWords(words, path, caption.start, caption.end, issues);
    validateCaptionStyle(caption.style, `${path}.style`, issues);
  });
}

function validateCaptionSpeakerEmbedding(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }

  const values = validateArray(value, path, issues);
  if (values.length < 2) {
    addIssue(issues, 'error', path, 'Caption speakerEmbedding must include at least 2 numeric dimensions.');
  }

  if (values.length > 4096) {
    addIssue(issues, 'error', path, 'Caption speakerEmbedding cannot include more than 4096 dimensions.');
  }

  values.forEach((item, index) => {
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      addIssue(issues, 'error', `${path}[${index}]`, 'Caption speakerEmbedding values must be finite numbers.');
    }
  });
}

function validateCaptionWords(
  values: unknown[],
  captionPath: string,
  captionStart: unknown,
  captionEnd: unknown,
  issues: ProjectJsonValidationIssue[],
): void {
  const captionRange =
    typeof captionStart === 'number' &&
    Number.isFinite(captionStart) &&
    typeof captionEnd === 'number' &&
    Number.isFinite(captionEnd) &&
    captionEnd > captionStart
      ? { start: captionStart, end: captionEnd }
      : undefined;

  values.forEach((word, index) => {
    const path = `${captionPath}.words[${index}]`;
    if (!isRecord(word)) {
      addIssue(issues, 'error', path, 'Caption word timing must be an object.');
      return;
    }

    validateNonNegativeNumber(word.start, `${path}.start`, issues);
    validatePositiveNumber(word.end, `${path}.end`, issues);
    if (typeof word.start === 'number' && typeof word.end === 'number' && word.end <= word.start) {
      addIssue(issues, 'error', `${path}.end`, 'Caption word end must be after start.');
    }

    if (captionRange && typeof word.start === 'number' && Number.isFinite(word.start)) {
      if (word.start < captionRange.start - CAPTION_WORD_RANGE_TOLERANCE_SECONDS) {
        addIssue(issues, 'error', `${path}.start`, 'Caption word start must be inside the caption range.');
      }
    }

    if (captionRange && typeof word.end === 'number' && Number.isFinite(word.end)) {
      if (word.end > captionRange.end + CAPTION_WORD_RANGE_TOLERANCE_SECONDS) {
        addIssue(issues, 'error', `${path}.end`, 'Caption word end must be inside the caption range.');
      }
    }

    requireNonEmptyString(word.text, `${path}.text`, issues);
    validateNumberInRange(word.confidence, `${path}.confidence`, issues, 0, 1, { optional: true });
  });

  let previousValidWord: { start: number; end: number } | undefined;
  values.forEach((word, index) => {
    if (!isRecord(word)) {
      return;
    }

    const start = typeof word.start === 'number' && Number.isFinite(word.start) ? word.start : undefined;
    const end = typeof word.end === 'number' && Number.isFinite(word.end) ? word.end : undefined;
    if (start === undefined || end === undefined || end <= start) {
      return;
    }

    const path = `${captionPath}.words[${index}]`;
    if (previousValidWord && start < previousValidWord.start - CAPTION_WORD_RANGE_TOLERANCE_SECONDS) {
      addIssue(issues, 'error', `${path}.start`, 'Caption word start must not move backward.');
    } else if (previousValidWord && start < previousValidWord.end - CAPTION_WORD_RANGE_TOLERANCE_SECONDS) {
      addIssue(issues, 'error', `${path}.start`, 'Caption word start must not overlap the previous word.');
    }

    previousValidWord = { start, end };
  });
}

function validateCaptionStyle(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    addIssue(issues, 'error', path, 'Caption style must be an object.');
    return;
  }

  validateNumberInRange(value.fontSize, `${path}.fontSize`, issues, 12, 180, { optional: true });
  validateHexColor(value.fontColor, `${path}.fontColor`, issues, { optional: true });
  validateOptionalBoolean(value.boxEnabled, `${path}.boxEnabled`, issues);
  validateHexColor(value.boxColor, `${path}.boxColor`, issues, { optional: true });
  validateNumberInRange(value.boxOpacity, `${path}.boxOpacity`, issues, 0, 1, { optional: true });
  validateOptionalBoolean(value.shadowEnabled, `${path}.shadowEnabled`, issues);
  validateHexColor(value.shadowColor, `${path}.shadowColor`, issues, { optional: true });
  validateNumberInRange(value.shadowOpacity, `${path}.shadowOpacity`, issues, 0, 1, { optional: true });
  validateNumberInRange(value.shadowOffset, `${path}.shadowOffset`, issues, 0, 32, { optional: true });
  validateEnumValue(value.position, CAPTION_POSITIONS, `${path}.position`, issues, { optional: true });
  validateEnumValue(value.align, CAPTION_ALIGNS, `${path}.align`, issues, { optional: true });
}

function validateAutomationRules(values: unknown[], issues: ProjectJsonValidationIssue[]): void {
  const ids = new Set<string>();

  values.forEach((rule, index) => {
    const path = `$.automation[${index}]`;
    if (!isRecord(rule)) {
      addIssue(issues, 'error', path, 'Automation rule must be an object.');
      return;
    }

    validateUniqueId(rule.id, ids, `${path}.id`, 'Automation rule', issues);
    requireNonEmptyString(rule.name, `${path}.name`, issues);
    validateEnumValue(rule.provider, AUTOMATION_PROVIDERS, `${path}.provider`, issues);
    validateEnumValue(rule.trigger, AUTOMATION_TRIGGERS, `${path}.trigger`, issues);
    validateOptionalString(rule.workflowName, `${path}.workflowName`, issues);
    validateStringArray(rule.targetTrackIds, `${path}.targetTrackIds`, issues, 'Automation target track id');
    validateParameterRecord(rule.parameters, `${path}.parameters`, issues, 'Automation parameter');
  });
}

function validatePluginManifests(values: unknown[], issues: ProjectJsonValidationIssue[]): void {
  const ids = new Set<string>();

  values.forEach((plugin, index) => {
    const path = `$.plugins[${index}]`;
    if (!isRecord(plugin)) {
      addIssue(issues, 'error', path, 'Plugin manifest must be an object.');
      return;
    }

    validateUniqueId(plugin.id, ids, `${path}.id`, 'Plugin', issues);
    requireNonEmptyString(plugin.name, `${path}.name`, issues);
    requireNonEmptyString(plugin.version, `${path}.version`, issues);
    validatePluginEntry(plugin.entry, `${path}.entry`, issues);
    validateEnumArray(plugin.permissions, PLUGIN_PERMISSIONS, `${path}.permissions`, issues, 'Plugin permission');
    validateEnumArray(plugin.contributes, PLUGIN_CONTRIBUTES, `${path}.contributes`, issues, 'Plugin contribution');
    validatePluginManifestSignature(plugin, `${path}.signature`, issues);
    validatePluginParameterSchemas(plugin.parameterSchemas, `${path}.parameterSchemas`, issues);
    validatePluginComfyUIWorkflows(plugin.comfyUIWorkflows, plugin.permissions, plugin.contributes, `${path}.comfyUIWorkflows`, issues);
    validatePluginCustomCommands(plugin.customCommands, plugin.contributes, `${path}.customCommands`, issues);
    validatePluginExporterWriters(plugin.exporterWriters, plugin.contributes, `${path}.exporterWriters`, issues);
  });
}

function validatePluginComfyUIWorkflows(
  value: unknown,
  permissions: unknown,
  contributes: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }

  const workflows = validateArray(value, path, issues);
  if (workflows.length > MAX_PLUGIN_COMFYUI_WORKFLOW_COUNT) {
    addIssue(issues, 'error', path, `Plugin comfyUIWorkflows cannot include more than ${MAX_PLUGIN_COMFYUI_WORKFLOW_COUNT} presets.`);
  }
  if (!Array.isArray(contributes) || !contributes.includes('workflow')) {
    addIssue(issues, 'error', path, 'Plugin comfyUIWorkflows require the workflow contribution.');
  }
  if (!Array.isArray(permissions) || !permissions.includes('comfyui')) {
    addIssue(issues, 'error', path, 'Plugin comfyUIWorkflows require the comfyui permission.');
  }

  const ids = new Set<string>();
  workflows.forEach((workflow, index) => {
    const workflowPath = `${path}[${index}]`;
    if (!isRecord(workflow)) {
      addIssue(issues, 'error', workflowPath, 'Plugin ComfyUI workflow preset must be an object.');
      return;
    }

    validateUniqueId(workflow.id, ids, `${workflowPath}.id`, 'Plugin ComfyUI workflow preset', issues);
    requireNonEmptyString(workflow.label, `${workflowPath}.label`, issues);
    requireNonEmptyString(workflow.workflowName, `${workflowPath}.workflowName`, issues);
    validateOptionalString(workflow.description, `${workflowPath}.description`, issues);
    validateOptionalString(workflow.promptSuffix, `${workflowPath}.promptSuffix`, issues);
    validateOptionalString(workflow.negativePrompt, `${workflowPath}.negativePrompt`, issues);
    validatePluginComfyUIRequiredNodeTypes(workflow.requiredNodeTypes, `${workflowPath}.requiredNodeTypes`, issues);
    if (workflow.parameters !== undefined) {
      validateParameterRecord(workflow.parameters, `${workflowPath}.parameters`, issues, 'Plugin ComfyUI workflow parameter');
    }
  });
}

function validatePluginComfyUIRequiredNodeTypes(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  const nodeTypes = validateArray(value, path, issues, { optional: true });
  if (nodeTypes.length > MAX_PLUGIN_COMFYUI_NODE_TYPE_COUNT) {
    addIssue(issues, 'error', path, `Plugin ComfyUI workflow requiredNodeTypes cannot include more than ${MAX_PLUGIN_COMFYUI_NODE_TYPE_COUNT} entries.`);
  }

  const names = new Set<string>();
  nodeTypes.forEach((nodeType, index) => {
    const name = readNonEmptyString(nodeType);
    if (!name) {
      addIssue(issues, 'error', `${path}[${index}]`, 'Plugin ComfyUI workflow required node type must be a non-empty string.');
      return;
    }
    if (name.length > MAX_PLUGIN_PARAMETER_STRING_LENGTH) {
      addIssue(issues, 'error', `${path}[${index}]`, `Plugin ComfyUI workflow required node type exceeds the ${MAX_PLUGIN_PARAMETER_STRING_LENGTH} character limit.`);
    }
    if (names.has(name)) {
      addIssue(issues, 'error', `${path}[${index}]`, `Plugin ComfyUI workflow required node type "${name}" is duplicated.`);
      return;
    }
    names.add(name);
  });
}

function validatePluginCustomCommands(
  value: unknown,
  contributes: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }

  const commands = validateArray(value, path, issues);
  if (commands.length > MAX_PLUGIN_CUSTOM_COMMAND_COUNT) {
    addIssue(issues, 'error', path, `Plugin customCommands cannot include more than ${MAX_PLUGIN_CUSTOM_COMMAND_COUNT} commands.`);
  }

  const manifestContributes = Array.isArray(contributes) ? contributes : [];
  const ids = new Set<string>();
  commands.forEach((command, index) => {
    const commandPath = `${path}[${index}]`;
    if (!isRecord(command)) {
      addIssue(issues, 'error', commandPath, 'Plugin custom command declaration must be an object.');
      return;
    }

    validateUniqueId(command.id, ids, `${commandPath}.id`, 'Plugin custom command', issues);
    requireNonEmptyString(command.label, `${commandPath}.label`, issues);
    validateOptionalString(command.description, `${commandPath}.description`, issues);
    validateEnumValue(command.contribution, PLUGIN_CUSTOM_COMMAND_CONTRIBUTIONS, `${commandPath}.contribution`, issues);
    validateEnumValue(command.kind, PLUGIN_CUSTOM_COMMAND_KINDS, `${commandPath}.kind`, issues);
    if (typeof command.contribution === 'string' && !manifestContributes.includes(command.contribution)) {
      addIssue(issues, 'error', `${commandPath}.contribution`, `Plugin custom command contribution ${command.contribution} must be listed in plugin contributes.`);
    }

    const parameters = validateArray(command.parameters, `${commandPath}.parameters`, issues, { optional: true });
    if (parameters.length > MAX_PLUGIN_PARAMETER_SCHEMA_COUNT) {
      addIssue(issues, 'error', `${commandPath}.parameters`, `Plugin custom command cannot include more than ${MAX_PLUGIN_PARAMETER_SCHEMA_COUNT} parameters.`);
    }
    const parameterKeys = new Set<string>();
    parameters.forEach((parameter, parameterIndex) => {
      validatePluginParameterSchema(parameter, `${commandPath}.parameters[${parameterIndex}]`, parameterKeys, issues);
    });
  });
}

function validatePluginManifestSignature(
  plugin: Record<string, unknown>,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  const value = plugin.signature;
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    addIssue(issues, 'error', path, 'Plugin signature must be an object.');
    return;
  }

  validateEnumValue(value.algorithm, PLUGIN_MANIFEST_SIGNATURE_ALGORITHMS, `${path}.algorithm`, issues);
  requireNonEmptyString(value.keyId, `${path}.keyId`, issues);
  validatePluginManifestSignatureFingerprint(value.manifestFingerprint, `${path}.manifestFingerprint`, issues);
  validatePluginManifestSignatureValue(value.signatureValue, value.algorithm, `${path}.signatureValue`, issues);
  validateOptionalString(value.signedAt, `${path}.signedAt`, issues);

  const verification = verifyPluginManifestSignature(plugin);
  if (verification.status === 'mismatch') {
    addIssue(
      issues,
      'error',
      `${path}.manifestFingerprint`,
      `Plugin manifest signature fingerprint does not match current manifest contents; expected ${verification.computedFingerprint}.`,
    );
  }
  if (verification.status === 'untrusted-key' || verification.status === 'bad-signature') {
    addIssue(issues, 'error', path, verification.reason);
  }
}

function validatePluginManifestSignatureFingerprint(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  if (
    typeof value !== 'string' ||
    value.includes('\0') ||
    !PLUGIN_MANIFEST_SIGNATURE_FINGERPRINT_PATTERN.test(value)
  ) {
    addIssue(issues, 'error', path, 'Plugin signature manifestFingerprint must be a manifest-v1 SHA-256 fingerprint string.');
  }
}

function validatePluginManifestSignatureValue(
  value: unknown,
  algorithm: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  if (algorithm === PLUGIN_MANIFEST_RSA_SIGNATURE_ALGORITHM) {
    if (typeof value !== 'string' || value.includes('\0') || !PLUGIN_MANIFEST_RSA_SIGNATURE_VALUE_PATTERN.test(value)) {
      addIssue(issues, 'error', path, 'Plugin signatureValue must be a rsa-sha256-v1 signature string.');
    }
    return;
  }

  if (value !== undefined) {
    addIssue(issues, 'error', path, `Plugin signatureValue requires ${PLUGIN_MANIFEST_RSA_SIGNATURE_ALGORITHM}.`);
  }
}

function validatePluginExporterWriters(
  value: unknown,
  contributes: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }

  const writers = validateArray(value, path, issues);
  if (writers.length > MAX_PLUGIN_EXPORTER_WRITER_COUNT) {
    addIssue(issues, 'error', path, `Plugin exporterWriters cannot include more than ${MAX_PLUGIN_EXPORTER_WRITER_COUNT} writers.`);
  }
  if (!Array.isArray(contributes) || !contributes.includes('exporter')) {
    addIssue(issues, 'error', path, 'Plugin exporterWriters require the exporter contribution.');
  }

  const ids = new Set<string>();
  writers.forEach((writer, index) => {
    const writerPath = `${path}[${index}]`;
    if (!isRecord(writer)) {
      addIssue(issues, 'error', writerPath, 'Plugin exporter writer declaration must be an object.');
      return;
    }

    validateUniqueId(writer.id, ids, `${writerPath}.id`, 'Plugin exporter writer', issues);
    requireNonEmptyString(writer.label, `${writerPath}.label`, issues);
    validatePluginExporterWriterExecutable(writer.executable, `${writerPath}.executable`, issues);
    validatePluginExporterWriterArgs(writer.args, `${writerPath}.args`, issues);
    validatePluginExporterWriterCwd(writer.cwd, `${writerPath}.cwd`, issues);
    validateEnumValue(writer.trust, PLUGIN_EXPORTER_WRITER_TRUST, `${writerPath}.trust`, issues, { optional: true });
    validatePluginExporterWriterTrustFingerprint(writer.trustFingerprint, `${writerPath}.trustFingerprint`, issues);
    validateOptionalString(writer.trustedAt, `${writerPath}.trustedAt`, issues);
    validatePluginExporterWriterTrustHistory(writer.trustHistory, `${writerPath}.trustHistory`, issues);
    validatePluginExporterWriterRuntimePackage(writer.runtimePackage, writer.executable, `${writerPath}.runtimePackage`, issues);
    validatePluginExporterWriterTimeout(writer.timeoutMs, `${writerPath}.timeoutMs`, issues);
  });
}

function validatePluginExporterWriterExecutable(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  const executable = readNonEmptyString(value);
  if (!executable) {
    addIssue(issues, 'error', path, 'Plugin exporter writer executable must be a non-empty string.');
    return;
  }
  if (!isSafePluginExporterWriterPath(executable, { allowBareCommand: true })) {
    addIssue(issues, 'error', path, 'Plugin exporter writer executable must be a bare command or safe relative path under plugins/ or tools/.');
  }
}

function validatePluginExporterWriterArgs(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  const args = validateArray(value, path, issues);
  if (args.length > MAX_PLUGIN_EXPORTER_WRITER_ARG_COUNT) {
    addIssue(issues, 'error', path, `Plugin exporter writer args cannot include more than ${MAX_PLUGIN_EXPORTER_WRITER_ARG_COUNT} entries.`);
  }
  args.forEach((arg, index) => {
    if (typeof arg !== 'string' || arg.includes('\0')) {
      addIssue(issues, 'error', `${path}[${index}]`, 'Plugin exporter writer arg must be a string without null bytes.');
      return;
    }
    if (arg.length > MAX_PLUGIN_PARAMETER_STRING_LENGTH) {
      addIssue(issues, 'error', `${path}[${index}]`, `Plugin exporter writer arg exceeds the ${MAX_PLUGIN_PARAMETER_STRING_LENGTH} character limit.`);
    }
  });
}

function validatePluginExporterWriterCwd(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  const cwd = readNonEmptyString(value);
  if (!cwd || !isSafePluginExporterWriterPath(cwd, { allowBareCommand: false })) {
    addIssue(issues, 'error', path, 'Plugin exporter writer cwd must be a safe relative path under plugins/ or tools/.');
  }
}

function validatePluginExporterWriterTimeout(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1000 ||
    value > MAX_PLUGIN_EXPORTER_WRITER_TIMEOUT_MS
  ) {
    addIssue(issues, 'error', path, `Plugin exporter writer timeoutMs must be an integer between 1000 and ${MAX_PLUGIN_EXPORTER_WRITER_TIMEOUT_MS}.`);
  }
}

function validatePluginExporterWriterRuntimePackage(
  value: unknown,
  executable: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    addIssue(issues, 'error', path, 'Plugin exporter writer runtimePackage must be an object.');
    return;
  }

  requireNonEmptyString(value.packageId, `${path}.packageId`, issues);
  validateEnumValue(value.runtime, PLUGIN_EXPORTER_WRITER_RUNTIMES, `${path}.runtime`, issues);
  validatePluginExporterWriterPackageRoot(value.root, `${path}.root`, issues);
  validatePluginExporterWriterPackageRelativePath(value.entry, `${path}.entry`, issues, 'entry');
  validateOptionalString(value.packagedAt, `${path}.packagedAt`, issues);
  validatePluginExporterWriterPackageFiles(value.files, `${path}.files`, issues);

  const root = readNonEmptyString(value.root)?.replace(/\\/g, '/');
  const entry = readNonEmptyString(value.entry)?.replace(/\\/g, '/');
  const normalizedExecutable = readNonEmptyString(executable)?.replace(/\\/g, '/');
  if (root && entry && normalizedExecutable && value.runtime === 'native' && `${root}/${entry}` !== normalizedExecutable) {
    addIssue(issues, 'error', path, 'Native runtimePackage entry must match the exporter writer executable path.');
  }
}

function validatePluginExporterWriterPackageRoot(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  const root = readNonEmptyString(value);
  if (!root || !isSafePluginExporterWriterPath(root, { allowBareCommand: false })) {
    addIssue(issues, 'error', path, 'Plugin exporter writer runtimePackage root must be a safe relative path under plugins/ or tools/.');
  }
}

function validatePluginExporterWriterPackageFiles(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  const files = validateArray(value, path, issues);
  if (files.length > MAX_PLUGIN_EXPORTER_WRITER_PACKAGE_FILE_COUNT) {
    addIssue(issues, 'error', path, `Plugin exporter writer runtimePackage files cannot include more than ${MAX_PLUGIN_EXPORTER_WRITER_PACKAGE_FILE_COUNT} entries.`);
  }

  const paths = new Set<string>();
  files.forEach((file, index) => {
    const filePath = `${path}[${index}]`;
    if (!isRecord(file)) {
      addIssue(issues, 'error', filePath, 'Plugin exporter writer runtimePackage file must be an object.');
      return;
    }
    const normalizedPath = validatePluginExporterWriterPackageRelativePath(file.path, `${filePath}.path`, issues, 'file path');
    if (normalizedPath) {
      if (paths.has(normalizedPath)) {
        addIssue(issues, 'error', `${filePath}.path`, `Plugin exporter writer runtimePackage file path "${normalizedPath}" is duplicated.`);
      }
      paths.add(normalizedPath);
    }
    if (
      file.sha256 !== undefined &&
      (typeof file.sha256 !== 'string' || file.sha256.includes('\0') || !/^sha256-[a-f0-9]{64}$/.test(file.sha256))
    ) {
      addIssue(issues, 'error', `${filePath}.sha256`, 'Plugin exporter writer runtimePackage file sha256 must be a sha256 hex digest string.');
    }
    if (
      file.bytes !== undefined &&
      (typeof file.bytes !== 'number' || !Number.isInteger(file.bytes) || file.bytes < 0)
    ) {
      addIssue(issues, 'error', `${filePath}.bytes`, 'Plugin exporter writer runtimePackage file bytes must be a non-negative integer.');
    }
  });
}

function validatePluginExporterWriterPackageRelativePath(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
  label: string,
): string | undefined {
  const raw = readNonEmptyString(value);
  const normalized = raw?.replace(/\\/g, '/');
  if (
    !normalized ||
    normalized.includes('\0') ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized) ||
    normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.split('/').includes('..') ||
    normalized.split('/').some((segment) => !segment || segment === '.' || !/^[a-zA-Z0-9._-]+$/.test(segment))
  ) {
    addIssue(issues, 'error', path, `Plugin exporter writer runtimePackage ${label} must be a safe package-relative path.`);
    return undefined;
  }

  return normalized;
}

function validatePluginExporterWriterTrustFingerprint(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'string' || value.includes('\0') || !/^writer-v1-[a-z0-9]{7,16}$/.test(value)) {
    addIssue(issues, 'error', path, 'Plugin exporter writer trustFingerprint must be a writer-v1 fingerprint string.');
  }
}

function validatePluginExporterWriterTrustHistory(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  const entries = validateArray(value, path, issues, { optional: true });
  if (entries.length > MAX_PLUGIN_EXPORTER_WRITER_TRUST_HISTORY_COUNT) {
    addIssue(issues, 'error', path, `Plugin exporter writer trustHistory cannot include more than ${MAX_PLUGIN_EXPORTER_WRITER_TRUST_HISTORY_COUNT} entries.`);
  }

  entries.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, 'error', entryPath, 'Plugin exporter writer trustHistory entry must be an object.');
      return;
    }
    requireNonEmptyString(entry.at, `${entryPath}.at`, issues);
    validateEnumValue(entry.action, PLUGIN_EXPORTER_WRITER_TRUST_AUDIT_ACTIONS, `${entryPath}.action`, issues);
    validateEnumValue(entry.previousTrust, PLUGIN_EXPORTER_WRITER_TRUST, `${entryPath}.previousTrust`, issues);
    validateEnumValue(entry.nextTrust, PLUGIN_EXPORTER_WRITER_TRUST, `${entryPath}.nextTrust`, issues);
    validatePluginExporterWriterTrustFingerprint(entry.fingerprint, `${entryPath}.fingerprint`, issues);
    requireNonEmptyString(entry.commandPreview, `${entryPath}.commandPreview`, issues);
    if (typeof entry.commandPreview === 'string' && entry.commandPreview.length > MAX_PLUGIN_PARAMETER_STRING_LENGTH) {
      addIssue(issues, 'error', `${entryPath}.commandPreview`, `Plugin exporter writer trustHistory commandPreview exceeds the ${MAX_PLUGIN_PARAMETER_STRING_LENGTH} character limit.`);
    }
    validateOptionalString(entry.source, `${entryPath}.source`, issues);
  });
}

function isSafePluginExporterWriterPath(
  value: string,
  options: { allowBareCommand: boolean },
): boolean {
  const normalized = value.trim().replace(/\\/g, '/');
  if (
    !normalized ||
    normalized.includes('\0') ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized) ||
    normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.split('/').includes('..')
  ) {
    return false;
  }

  if (!normalized.includes('/')) {
    return options.allowBareCommand && /^[a-zA-Z0-9._-]+$/.test(normalized);
  }

  return (normalized.startsWith('plugins/') || normalized.startsWith('tools/')) &&
    normalized.split('/').every((segment) => /^[a-zA-Z0-9._-]+$/.test(segment));
}

function validatePluginParameterSchemas(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    addIssue(issues, 'error', path, 'Plugin parameterSchemas must be an object.');
    return;
  }

  validatePluginPlanParameterSchemaArray(value.effects, `${path}.effects`, issues, 'effect');
  validatePluginPlanParameterSchemaArray(value.transitions, `${path}.transitions`, issues, 'transition');
}

function validatePluginPlanParameterSchemaArray(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
  label: string,
): void {
  const schemas = validateArray(value, path, issues, { optional: true });
  if (schemas.length > MAX_PLUGIN_PLAN_PARAMETER_SCHEMA_COUNT) {
    addIssue(issues, 'error', path, `Plugin ${label} parameterSchemas cannot include more than ${MAX_PLUGIN_PLAN_PARAMETER_SCHEMA_COUNT} presets.`);
  }

  const presetIds = new Set<string>();
  schemas.forEach((schema, index) => {
    const schemaPath = `${path}[${index}]`;
    if (!isRecord(schema)) {
      addIssue(issues, 'error', schemaPath, `Plugin ${label} parameter schema must be an object.`);
      return;
    }

    validateUniqueId(schema.presetId, presetIds, `${schemaPath}.presetId`, `Plugin ${label} parameter schema preset`, issues);
    const parameters = validateArray(schema.parameters, `${schemaPath}.parameters`, issues);
    if (parameters.length > MAX_PLUGIN_PARAMETER_SCHEMA_COUNT) {
      addIssue(issues, 'error', `${schemaPath}.parameters`, `Plugin ${label} parameter schema cannot include more than ${MAX_PLUGIN_PARAMETER_SCHEMA_COUNT} parameters.`);
    }

    const keys = new Set<string>();
    parameters.forEach((parameter, parameterIndex) => {
      validatePluginParameterSchema(parameter, `${schemaPath}.parameters[${parameterIndex}]`, keys, issues);
    });
  });
}

function validatePluginParameterSchema(
  value: unknown,
  path: string,
  keys: Set<string>,
  issues: ProjectJsonValidationIssue[],
): void {
  if (!isRecord(value)) {
    addIssue(issues, 'error', path, 'Plugin parameter schema must be an object.');
    return;
  }

  validateUniqueId(value.key, keys, `${path}.key`, 'Plugin parameter schema key', issues);
  validateEnumValue(value.type, PLUGIN_PARAMETER_SCHEMA_TYPES, `${path}.type`, issues);
  validateOptionalString(value.label, `${path}.label`, issues);
  validateOptionalBoolean(value.required, `${path}.required`, issues);

  validatePluginParameterNumberBoundary(value.min, `${path}.min`, issues);
  validatePluginParameterNumberBoundary(value.max, `${path}.max`, issues);

  const parameterType = typeof value.type === 'string' ? value.type : undefined;
  if (value.min !== undefined && parameterType !== 'number') {
    addIssue(issues, 'error', `${path}.min`, 'Plugin parameter schema min is only valid for number parameters.');
  }
  if (value.max !== undefined && parameterType !== 'number') {
    addIssue(issues, 'error', `${path}.max`, 'Plugin parameter schema max is only valid for number parameters.');
  }
  if (
    typeof value.min === 'number' &&
    Number.isFinite(value.min) &&
    typeof value.max === 'number' &&
    Number.isFinite(value.max) &&
    value.min > value.max
  ) {
    addIssue(issues, 'error', `${path}.max`, 'Plugin parameter schema max must be greater than or equal to min.');
  }

  const enumValues = validatePluginParameterEnumValues(value.values, `${path}.values`, parameterType, issues);
  validatePluginParameterDefaultValue(value.defaultValue, `${path}.defaultValue`, value, enumValues, issues);
}

function validatePluginParameterNumberBoundary(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
    addIssue(issues, 'error', path, 'Plugin parameter schema boundary must be a finite number.');
  }
}

function validatePluginParameterEnumValues(
  value: unknown,
  path: string,
  parameterType: string | undefined,
  issues: ProjectJsonValidationIssue[],
): string[] {
  if (parameterType !== 'enum') {
    if (value !== undefined) {
      addIssue(issues, 'error', path, 'Plugin parameter schema values are only valid for enum parameters.');
    }
    return [];
  }

  const values = validateArray(value, path, issues);
  if (values.length === 0) {
    addIssue(issues, 'error', path, 'Plugin enum parameter schema must include at least one value.');
  }
  if (values.length > MAX_PLUGIN_PARAMETER_ENUM_VALUE_COUNT) {
    addIssue(issues, 'error', path, `Plugin enum parameter schema cannot include more than ${MAX_PLUGIN_PARAMETER_ENUM_VALUE_COUNT} values.`);
  }

  const enumValues = new Set<string>();
  values.forEach((item, index) => {
    const enumValue = readNonEmptyString(item);
    if (!enumValue) {
      addIssue(issues, 'error', `${path}[${index}]`, 'Plugin enum parameter value must be a non-empty string.');
      return;
    }
    if (enumValue.length > MAX_PLUGIN_PARAMETER_STRING_LENGTH) {
      addIssue(issues, 'error', `${path}[${index}]`, `Plugin enum parameter value exceeds the ${MAX_PLUGIN_PARAMETER_STRING_LENGTH} character limit.`);
    }
    if (enumValues.has(enumValue)) {
      addIssue(issues, 'error', `${path}[${index}]`, `Plugin enum parameter value "${enumValue}" is duplicated.`);
      return;
    }
    enumValues.add(enumValue);
  });

  return Array.from(enumValues);
}

function validatePluginParameterDefaultValue(
  value: unknown,
  path: string,
  schema: Record<string, unknown>,
  enumValues: string[],
  issues: ProjectJsonValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }

  const parameterType = schema.type;
  if (parameterType === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      addIssue(issues, 'error', path, 'Plugin number parameter defaultValue must be a finite number.');
      return;
    }
    if (typeof schema.min === 'number' && Number.isFinite(schema.min) && value < schema.min) {
      addIssue(issues, 'error', path, 'Plugin number parameter defaultValue must be greater than or equal to min.');
    }
    if (typeof schema.max === 'number' && Number.isFinite(schema.max) && value > schema.max) {
      addIssue(issues, 'error', path, 'Plugin number parameter defaultValue must be less than or equal to max.');
    }
    return;
  }

  if (parameterType === 'string') {
    if (typeof value !== 'string') {
      addIssue(issues, 'error', path, 'Plugin string parameter defaultValue must be a string.');
      return;
    }
    if (value.length > MAX_PLUGIN_PARAMETER_STRING_LENGTH) {
      addIssue(issues, 'error', path, `Plugin string parameter defaultValue exceeds the ${MAX_PLUGIN_PARAMETER_STRING_LENGTH} character limit.`);
    }
    return;
  }

  if (parameterType === 'boolean') {
    if (typeof value !== 'boolean') {
      addIssue(issues, 'error', path, 'Plugin boolean parameter defaultValue must be a boolean.');
    }
    return;
  }

  if (parameterType === 'enum') {
    if (typeof value !== 'string' || !enumValues.includes(value)) {
      addIssue(issues, 'error', path, `Plugin enum parameter defaultValue must be one of: ${enumValues.join(', ')}.`);
    }
    return;
  }

  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    addIssue(issues, 'error', path, 'Plugin parameter defaultValue must be a string, finite number, or boolean.');
  }
}

function validatePluginEntry(value: unknown, path: string, issues: ProjectJsonValidationIssue[]): void {
  const entry = readNonEmptyString(value);
  if (!entry) {
    addIssue(issues, 'error', path, 'Expected a non-empty string.');
    return;
  }

  const normalized = entry.trim().replace(/\\/g, '/');
  if (
    normalized.includes('\0') ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized) ||
    normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.split('/').includes('..') ||
    !normalized.startsWith('plugins/')
  ) {
    addIssue(issues, 'error', path, 'Plugin entry must be a safe relative path under plugins/.');
  }
}

function validateExportProfiles(values: unknown[], issues: ProjectJsonValidationIssue[]): void {
  const ids = new Set<string>();

  values.forEach((profile, index) => {
    const path = `$.exportProfiles[${index}]`;
    if (!isRecord(profile)) {
      addIssue(issues, 'error', path, 'Export profile must be an object.');
      return;
    }

    validateUniqueId(profile.id, ids, `${path}.id`, 'Export profile', issues);
    requireNonEmptyString(profile.label, `${path}.label`, issues);
    validateEnumValue(profile.purpose, EXPORT_PROFILE_PURPOSES, `${path}.purpose`, issues, { optional: true });
    validateEnumValue(profile.container, EXPORT_PROFILE_CONTAINERS, `${path}.container`, issues);
    validateEnumValue(profile.codec, EXPORT_PROFILE_CODECS, `${path}.codec`, issues);
    if (
      typeof profile.container === 'string' &&
      EXPORT_PROFILE_CONTAINERS.has(profile.container) &&
      typeof profile.codec === 'string' &&
      EXPORT_PROFILE_CODECS.has(profile.codec)
    ) {
      const container = profile.container as EditorProject['exportProfiles'][number]['container'];
      const codec = profile.codec as EditorProject['exportProfiles'][number]['codec'];
      if (!isExportProfileCodecContainerCompatible({ container, codec })) {
        addIssue(issues, 'error', `${path}.codec`, `Codec "${codec}" is not compatible with ${container.toUpperCase()} export container.`);
      }
    }
    validateEvenIntegerInRange(profile.width, `${path}.width`, issues, EXPORT_PROFILE_MIN_DIMENSION, EXPORT_PROFILE_MAX_DIMENSION);
    validateEvenIntegerInRange(profile.height, `${path}.height`, issues, EXPORT_PROFILE_MIN_DIMENSION, EXPORT_PROFILE_MAX_DIMENSION);
    validateNumberInRange(profile.fps, `${path}.fps`, issues, 1, 240);
    validateNumberInRange(profile.videoBitrateMbps, `${path}.videoBitrateMbps`, issues, 0.5, 300);
    validateIntegerInRange(profile.audioBitrateKbps, `${path}.audioBitrateKbps`, issues, 32, 1024);
    validateEnumValue(profile.ffmpegPreset, EXPORT_PROFILE_PRESETS, `${path}.ffmpegPreset`, issues, { optional: true });
    validateIntegerInRange(profile.crf, `${path}.crf`, issues, 0, 51, { optional: true });
  });
}

function validateTransition(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    addIssue(issues, 'error', path, 'Transition must be an object.');
    return;
  }

  requireNonEmptyString(value.id, `${path}.id`, issues);
  validateEnumValue(value.type, TRANSITION_TYPES, `${path}.type`, issues);
  validatePositiveNumber(value.duration, `${path}.duration`, issues);
  validateEnumValue(value.easing, TRANSITION_EASINGS, `${path}.easing`, issues);
  if (!isRecord(value.parameters)) {
    addIssue(issues, 'error', `${path}.parameters`, 'Transition parameters must be an object.');
  }
}

function buildValidationResult(
  issues: ProjectJsonValidationIssue[],
  project?: EditorProject,
  schemaVersion?: number,
): ProjectJsonValidationResult {
  const errors = issues.filter((issue) => issue.severity === 'error').map(formatIssue);
  const warnings = issues.filter((issue) => issue.severity === 'warning').map(formatIssue);

  return {
    ok: errors.length === 0,
    project,
    schemaVersion,
    errors,
    warnings,
    issues,
  };
}

function validateArray(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
  options: { optional?: boolean } = {},
): unknown[] {
  if (value === undefined) {
    if (!options.optional) {
      addIssue(issues, 'error', path, 'Expected an array.');
    }
    return [];
  }

  if (!Array.isArray(value)) {
    addIssue(issues, 'error', path, 'Expected an array.');
    return [];
  }

  return value;
}

function validateStringArray(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
  label: string,
): void {
  const values = validateArray(value, path, issues);
  values.forEach((item, index) => {
    if (!readNonEmptyString(item)) {
      addIssue(issues, 'error', `${path}[${index}]`, `${label} must be a non-empty string.`);
    }
  });
}

function validateEnumArray(
  value: unknown,
  allowed: Set<string>,
  path: string,
  issues: ProjectJsonValidationIssue[],
  label: string,
): void {
  const values = validateArray(value, path, issues);
  values.forEach((item, index) => {
    if (typeof item !== 'string' || !allowed.has(item)) {
      addIssue(issues, 'error', `${path}[${index}]`, `${label} must be one of: ${Array.from(allowed).join(', ')}.`);
    }
  });
}

function validateUniqueId(
  value: unknown,
  ids: Set<string>,
  path: string,
  label: string,
  issues: ProjectJsonValidationIssue[],
): void {
  const id = readNonEmptyString(value);
  if (!id) {
    addIssue(issues, 'error', path, `${label} id must be a non-empty string.`);
    return;
  }

  if (ids.has(id)) {
    addIssue(issues, 'error', path, `${label} id "${id}" is duplicated.`);
    return;
  }

  ids.add(id);
}

function requireNonEmptyString(value: unknown, path: string, issues: ProjectJsonValidationIssue[]): void {
  if (!readNonEmptyString(value)) {
    addIssue(issues, 'error', path, 'Expected a non-empty string.');
  }
}

function validateOptionalString(value: unknown, path: string, issues: ProjectJsonValidationIssue[]): void {
  if (value !== undefined && typeof value !== 'string') {
    addIssue(issues, 'error', path, 'Expected a string.');
  }
}

function validateOptionalBoolean(value: unknown, path: string, issues: ProjectJsonValidationIssue[]): void {
  if (value !== undefined && typeof value !== 'boolean') {
    addIssue(issues, 'error', path, 'Expected a boolean.');
  }
}

function validateBoolean(value: unknown, path: string, issues: ProjectJsonValidationIssue[]): void {
  if (typeof value !== 'boolean') {
    addIssue(issues, 'error', path, 'Expected a boolean.');
  }
}

function validatePositiveInteger(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
  options: { optional?: boolean } = {},
): void {
  if (value === undefined && options.optional) {
    return;
  }

  if (!Number.isInteger(value) || (value as number) <= 0) {
    addIssue(issues, 'error', path, 'Expected a positive integer.');
  }
}

function validatePositiveNumber(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
  options: { optional?: boolean } = {},
): void {
  if (value === undefined && options.optional) {
    return;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    addIssue(issues, 'error', path, 'Expected a finite number greater than 0.');
  }
}

function validateNonNegativeNumber(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
  options: { optional?: boolean } = {},
): void {
  if (value === undefined && options.optional) {
    return;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    addIssue(issues, 'error', path, 'Expected a finite number greater than or equal to 0.');
  }
}

function validateNumberInRange(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
  min: number,
  max: number,
  options: { optional?: boolean } = {},
): void {
  if (value === undefined && options.optional) {
    return;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    addIssue(issues, 'error', path, `Expected a finite number between ${min} and ${max}.`);
  }
}

function validateIntegerInRange(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
  min: number,
  max: number,
  options: { optional?: boolean } = {},
): void {
  if (value === undefined && options.optional) {
    return;
  }

  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    addIssue(issues, 'error', path, `Expected an integer between ${min} and ${max}.`);
  }
}

function validateEvenIntegerInRange(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
  min: number,
  max: number,
  options: { optional?: boolean } = {},
): void {
  if (value === undefined && options.optional) {
    return;
  }

  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max || (value as number) % 2 !== 0) {
    addIssue(issues, 'error', path, `Expected an even integer between ${min} and ${max}.`);
  }
}

function validateHexColor(
  value: unknown,
  path: string,
  issues: ProjectJsonValidationIssue[],
  options: { optional?: boolean } = {},
): void {
  if (value === undefined && options.optional) {
    return;
  }

  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.trim())) {
    addIssue(issues, 'error', path, 'Expected a #rrggbb hex color.');
  }
}

function validateClipKind(value: unknown, path: string, issues: ProjectJsonValidationIssue[]): void {
  if (!isClipKind(value)) {
    addIssue(issues, 'error', path, `Expected one of: ${Array.from(CLIP_KINDS).join(', ')}.`);
  }
}

function validateTrackKind(value: unknown, path: string, issues: ProjectJsonValidationIssue[]): void {
  if (!isTrackKind(value)) {
    addIssue(issues, 'error', path, `Expected one of: ${Array.from(TRACK_KINDS).join(', ')}.`);
  }
}

function validateEnumValue(
  value: unknown,
  allowed: Set<string>,
  path: string,
  issues: ProjectJsonValidationIssue[],
  options: { optional?: boolean } = {},
): void {
  if (value === undefined && options.optional) {
    return;
  }

  if (typeof value !== 'string' || !allowed.has(value)) {
    addIssue(issues, 'error', path, `Expected one of: ${Array.from(allowed).join(', ')}.`);
  }
}

function addIssue(
  issues: ProjectJsonValidationIssue[],
  severity: ProjectJsonValidationSeverity,
  path: string,
  message: string,
): void {
  issues.push({ path, message, severity });
}

function formatIssue(issue: ProjectJsonValidationIssue): string {
  return `${issue.path}: ${issue.message}`;
}

function hasValidationErrors(issues: ProjectJsonValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

function readSchemaVersion(value: Record<string, unknown>): number | undefined {
  return Number.isInteger(value.schemaVersion) ? value.schemaVersion as number : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isClipKind(value: unknown): value is ClipKind {
  return typeof value === 'string' && CLIP_KINDS.has(value as ClipKind);
}

function isRenderPathBackedAssetKind(value: unknown): value is ClipKind {
  return typeof value === 'string' && RENDER_PATH_BACKED_ASSET_KINDS.has(value as ClipKind);
}

function isTrackKind(value: unknown): value is TrackKind {
  return typeof value === 'string' && TRACK_KINDS.has(value as TrackKind);
}

function trackKindForProjectClip(clipKind: ClipKind, asset?: Record<string, unknown>): TrackKind {
  const mediaKind = resolveRenderableAssetMediaKind(asset as Parameters<typeof resolveRenderableAssetMediaKind>[0]);
  if (clipKind === 'ai' && mediaKind === 'audio') {
    return 'audio';
  }

  return trackKindForClipKind(clipKind);
}

function trackKindForClipKind(clipKind: ClipKind): TrackKind {
  if (clipKind === 'audio') {
    return 'audio';
  }

  if (clipKind === 'text') {
    return 'text';
  }

  if (clipKind === 'effect') {
    return 'effect';
  }

  return 'video';
}
