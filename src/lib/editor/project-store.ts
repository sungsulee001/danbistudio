import { createDefaultEditorProject } from './project';
import { normalizeClipVolumeDb, normalizeTrackPan, normalizeTrackVolumeDb } from './audio-mixer';
import { DEFAULT_MASTER_TRUE_PEAK_DB } from './master-audio';
import { buildProjectPackageMediaManifest, buildProjectPackageMediaWarnings, isVolatilePackageMediaPath, rewriteProjectMediaPathsForPackageImport, validateProjectPackageMediaEntry, type ProjectPackageMediaEntry, type ProjectPackageMediaManifest, type ProjectPackageMediaStatus } from './project-media-package';
import { resolvePreviewSourcePath } from './preview-source';
import { resolveRenderableAssetMediaKind, type RenderableAssetMediaKind } from './renderable-media-kind';
import { normalizeSpeedRampPoints } from './speed-ramp';
import type { AutomationRule, EditorPluginManifest, EditorProject, ExportProfile } from './types';

export const CURRENT_EDITOR_PROJECT_SCHEMA_VERSION = 2;

export interface ProjectSummary {
  id: string;
  name: string;
  schemaVersion: number;
  duration: number;
  clipCount: number;
  updatedAt: string;
  createdAt: string;
}

export interface ProjectPackageAsset {
  id: string;
  name: string;
  kind: string;
  source: string;
  renderPath?: string;
  proxySource?: string;
  thumbnailSource?: string;
  waveformSource?: string;
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  renderableMediaKind?: RenderableAssetMediaKind;
  hasPersistentPreviewSource: boolean;
  hasRenderPath: boolean;
}

export interface EditorProjectPackage {
  app: 'Danbi Studio';
  packageVersion: 1;
  exportedAt: string;
  project: EditorProject;
  assets: ProjectPackageAsset[];
  mediaManifest?: ProjectPackageMediaManifest;
  warnings: string[];
}

export interface ProjectPackageImport {
  project: EditorProject;
  packageVersion?: number;
  exportedAt?: string;
  mediaManifest?: ProjectPackageMediaManifest;
  warnings: string[];
}

export interface ProjectPackageDeserializeOptions {
  packageRoot?: string;
  rewriteBundledMedia?: boolean;
}

export function serializeProject(project: EditorProject): string {
  return JSON.stringify(migrateEditorProject(project));
}

export function deserializeProject(data: string): EditorProject {
  const project = JSON.parse(data) as Partial<EditorProject>;
  if (!project.id || !project.name || !Array.isArray(project.tracks)) {
    throw new Error('Invalid editor project data.');
  }

  return migrateEditorProject(project);
}

export function migrateEditorProject(project: Partial<EditorProject>): EditorProject {
  const defaults = createDefaultEditorProject();

  return {
    ...defaults,
    ...project,
    id: typeof project.id === 'string' && project.id ? project.id : defaults.id,
    name: typeof project.name === 'string' && project.name ? project.name : defaults.name,
    schemaVersion: normalizeSchemaVersion(project.schemaVersion),
    fps: finiteNumber(project.fps, defaults.fps),
    width: finiteNumber(project.width, defaults.width),
    height: finiteNumber(project.height, defaults.height),
    duration: finiteNumber(project.duration, defaults.duration),
    updatedAt: typeof project.updatedAt === 'string' ? project.updatedAt : defaults.updatedAt,
    assets: arrayOrEmpty(project.assets),
    tracks: normalizeTracks(project.tracks),
    markers: arrayOrEmpty(project.markers),
    captions: arrayOrEmpty(project.captions),
    automation: normalizeAutomation(project.automation, defaults.automation),
    plugins: mergeMissingById(arrayOrEmpty<EditorPluginManifest>(project.plugins), defaults.plugins),
    exportProfiles: mergeExportProfiles(project.exportProfiles, defaults.exportProfiles),
  };
}

export function buildProjectPackage(project: EditorProject, exportedAt = new Date().toISOString()): EditorProjectPackage {
  const migratedProject = migrateEditorProject(project);
  const mediaManifest = buildProjectPackageMediaManifest(migratedProject, { generatedAt: exportedAt });
  const assets = migratedProject.assets.map((asset) => {
    const renderableMediaKind = resolveRenderableAssetMediaKind(asset);
    return {
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      source: asset.source,
      renderPath: asset.renderPath,
      proxySource: asset.mediaCache?.proxySource,
      thumbnailSource: asset.mediaCache?.thumbnailSource,
      waveformSource: asset.mediaCache?.waveformSource,
      duration: asset.duration,
      width: asset.width,
      height: asset.height,
      fps: asset.fps,
      renderableMediaKind,
      hasPersistentPreviewSource: hasPersistentPreviewSource(asset.source, asset.renderPath),
      hasRenderPath: typeof asset.renderPath === 'string' && asset.renderPath.trim().length > 0,
    };
  });

  return {
    app: 'Danbi Studio',
    packageVersion: 1,
    exportedAt,
    project: migratedProject,
    assets,
    mediaManifest,
    warnings: uniqueStrings([
      ...buildProjectPackageWarnings(assets),
      ...mediaManifest.warnings,
    ]),
  };
}

export function serializeProjectPackage(project: EditorProject, exportedAt?: string): string {
  return JSON.stringify(buildProjectPackage(project, exportedAt), null, 2);
}

export function deserializeProjectPackage(
  data: string,
  options: ProjectPackageDeserializeOptions = {},
): ProjectPackageImport {
  const parsed = JSON.parse(data) as Partial<EditorProjectPackage> | Partial<EditorProject>;

  if (isProjectPackage(parsed)) {
    const mediaManifest = isProjectPackageMediaManifest(parsed.mediaManifest)
      ? normalizeProjectPackageMediaManifest(parsed.mediaManifest)
      : undefined;
    const packageWarnings = arrayOrEmpty<string>(parsed.warnings);
    const migratedProject = migrateEditorProject(parsed.project);
    const mediaRewrite = options.rewriteBundledMedia && mediaManifest
      ? rewriteProjectMediaPathsForPackageImport(migratedProject, mediaManifest, {
        packageRoot: options.packageRoot,
      })
      : undefined;

    const exportedAt = typeof parsed.exportedAt === 'string' && Number.isFinite(Date.parse(parsed.exportedAt))
      ? parsed.exportedAt
      : undefined;

    return {
      project: mediaRewrite?.project ?? migratedProject,
      packageVersion: parsed.packageVersion,
      exportedAt,
      mediaManifest,
      warnings: uniqueStrings([
        ...packageWarnings,
        ...(mediaManifest?.warnings ?? []),
        ...(mediaRewrite?.warnings ?? []),
      ]),
    };
  }

  const project = parsed as Partial<EditorProject>;
  if (!project.id || !project.name || !Array.isArray(project.tracks)) {
    throw new Error('Invalid editor project package.');
  }

  return {
    project: migrateEditorProject(project),
    warnings: ['Imported a raw project JSON file without Danbi package metadata.'],
  };
}

export function summarizeProject(project: EditorProject, createdAt: Date | string, updatedAt: Date | string): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    schemaVersion: project.schemaVersion,
    duration: project.duration,
    clipCount: project.tracks.reduce((total, track) => total + track.clips.length, 0),
    createdAt: toIsoString(createdAt),
    updatedAt: toIsoString(updatedAt),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeSchemaVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return CURRENT_EDITOR_PROJECT_SCHEMA_VERSION;
  }

  return Math.max(value, CURRENT_EDITOR_PROJECT_SCHEMA_VERSION);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeTracks(value: unknown): EditorProject['tracks'] {
  return arrayOrEmpty<EditorProject['tracks'][number]>(value).map((track) => ({
    ...track,
    solo: Boolean(track.solo),
    syncLocked: Boolean(track.syncLocked),
    volumeDb: normalizeTrackVolumeDb(track.volumeDb),
    pan: normalizeTrackPan(track.pan),
    clips: Array.isArray(track.clips)
      ? track.clips.map((clip) => ({
        ...clip,
        reversed: Boolean(clip.reversed),
        freezeFrameTime: typeof clip.freezeFrameTime === 'number' && Number.isFinite(clip.freezeFrameTime)
          ? Math.max(0, clip.freezeFrameTime)
          : undefined,
        speedRamp: normalizeSpeedRampPoints(clip.speedRamp, clip.duration),
        // 미지정 클립에는 필드를 만들지 않는다(기존 프로젝트 직렬화 결과 불변).
        ...(clip.volumeDb === undefined ? {} : { volumeDb: normalizeClipVolumeDb(clip.volumeDb) }),
      }))
      : [],
  }));
}

function mergeExportProfiles(value: unknown, defaults: ExportProfile[]): ExportProfile[] {
  const profiles = arrayOrEmpty<ExportProfile>(value).map((profile) => {
    const defaultProfile = defaults.find((item) => item.id === profile.id);
    return defaultProfile ? { ...defaultProfile, ...profile } : profile;
  });

  return mergeMissingById(profiles, defaults);
}

function normalizeAutomation(value: unknown, defaults: AutomationRule[]): AutomationRule[] {
  const rules = mergeMissingById(arrayOrEmpty<AutomationRule>(value), defaults);
  return rules.map((rule) => {
    if (rule.provider !== 'local' || rule.trigger !== 'before-export' || typeof rule.parameters.loudnessLufs !== 'number') {
      return rule;
    }

    return {
      ...rule,
      parameters: {
        ...rule.parameters,
        truePeakDb: typeof rule.parameters.truePeakDb === 'number'
          ? rule.parameters.truePeakDb
          : DEFAULT_MASTER_TRUE_PEAK_DB,
      },
    };
  });
}

function mergeMissingById<T extends { id: string }>(current: T[], defaults: T[]): T[] {
  const merged = [...current];
  const ids = new Set(merged.map((item) => item.id));

  for (const defaultItem of defaults) {
    if (!ids.has(defaultItem.id)) {
      merged.push(defaultItem);
      ids.add(defaultItem.id);
    }
  }

  return merged;
}

function isProjectPackage(value: Partial<EditorProjectPackage> | Partial<EditorProject>): value is Partial<EditorProjectPackage> & Pick<EditorProjectPackage, 'project'> {
  return (value as Partial<EditorProjectPackage>).app === 'Danbi Studio'
    && Boolean((value as Partial<EditorProjectPackage>).project);
}

type ProjectPackageMediaManifestLike = Partial<ProjectPackageMediaManifest>
  & Pick<ProjectPackageMediaManifest, 'projectId'>
  & { entries: ProjectPackageMediaEntry[] };

function isProjectPackageMediaManifest(value: unknown): value is ProjectPackageMediaManifestLike {
  return Boolean(value)
    && typeof value === 'object'
    && Array.isArray((value as Partial<ProjectPackageMediaManifestLike>).entries)
    && typeof (value as Partial<ProjectPackageMediaManifest>).projectId === 'string';
}

function normalizeProjectPackageMediaManifest(manifest: ProjectPackageMediaManifestLike): ProjectPackageMediaManifest {
  const rawEntries = arrayOrEmpty<unknown>(manifest.entries);
  const invalidWarnings = rawEntries
    .map((entry) => validateProjectPackageMediaEntry(entry))
    .filter((reason) => reason)
    .map((reason) => `Skipped invalid package media manifest entry: ${reason}`);
  const entries = rawEntries.filter((entry): entry is ProjectPackageMediaEntry => !validateProjectPackageMediaEntry(entry));

  return {
    projectId: manifest.projectId,
    generatedAt: typeof manifest.generatedAt === 'string' ? manifest.generatedAt : '',
    entries,
    warnings: uniqueStrings([
      ...arrayOrEmpty<string>(manifest.warnings),
      ...buildProjectPackageMediaWarnings(entries),
      ...invalidWarnings,
    ]),
    bundleReadyCount: countMediaManifestStatus(entries, 'bundle-ready'),
    missingCount: countMediaManifestStatus(entries, 'missing'),
    volatileCount: countMediaManifestStatus(entries, 'volatile-source'),
    externalCount: countMediaManifestStatus(entries, 'external-reference'),
    copyFailedCount: countMediaManifestStatus(entries, 'copy-failed'),
  };
}

function countMediaManifestStatus(entries: ProjectPackageMediaEntry[], status: ProjectPackageMediaStatus): number {
  return entries.filter((entry) => entry.status === status).length;
}

function hasPersistentPreviewSource(source: string, renderPath?: string): boolean {
  const previewPath = resolvePreviewSourcePath(source, renderPath);
  if (previewPath.mode === 'none') {
    return false;
  }

  return !isVolatilePackageMediaPath(previewPath.source);
}

function buildProjectPackageWarnings(assets: ProjectPackageAsset[]): string[] {
  const warnings: string[] = [];

  for (const asset of assets) {
    if (isRenderMediaPackageAsset(asset) && !asset.hasPersistentPreviewSource) {
      warnings.push(`${asset.name} uses a browser-only preview source and should be reimported after loading the package.`);
    }

    if (isRenderMediaPackageAsset(asset) && !asset.hasRenderPath) {
      warnings.push(`${asset.name} has no renderPath, so FFmpeg export may require reimporting the source media.`);
    }
  }

  return warnings;
}

function isRenderMediaPackageAsset(asset: ProjectPackageAsset): boolean {
  return Boolean(asset.renderableMediaKind);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
