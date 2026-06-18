import { resolveRenderableAssetMediaKind } from './renderable-media-kind';
import type { EditorProject } from './types';

export type ProjectPackageMediaRole = 'source' | 'render' | 'proxy' | 'thumbnail' | 'waveform';

export type ProjectPackageMediaStatus =
  | 'bundle-ready'
  | 'external-reference'
  | 'volatile-source'
  | 'missing'
  | 'copy-failed';

export interface ProjectPackageMediaEntry {
  assetId: string;
  assetName: string;
  role: ProjectPackageMediaRole;
  originalPath: string;
  packagePath: string;
  status: ProjectPackageMediaStatus;
  requiredForRender: boolean;
}

export interface ProjectPackageMediaManifest {
  projectId: string;
  generatedAt: string;
  entries: ProjectPackageMediaEntry[];
  warnings: string[];
  bundleReadyCount: number;
  missingCount: number;
  volatileCount: number;
  externalCount: number;
  copyFailedCount: number;
}

export interface ProjectPackageMediaManifestOptions {
  generatedAt?: string;
}

export interface ProjectPackageMediaRewriteOptions {
  packageRoot?: string;
}

export interface ProjectPackageMediaRewriteResult {
  project: EditorProject;
  warnings: string[];
  rewrittenCount: number;
}

interface MediaReferenceCandidate {
  role: ProjectPackageMediaRole;
  originalPath: string;
  requiredForRender: boolean;
}

const PROJECT_PACKAGE_MEDIA_ROLES = new Set<ProjectPackageMediaRole>(['source', 'render', 'proxy', 'thumbnail', 'waveform']);
const PROJECT_PACKAGE_MEDIA_STATUSES = new Set<ProjectPackageMediaStatus>([
  'bundle-ready',
  'external-reference',
  'volatile-source',
  'missing',
  'copy-failed',
]);
export function buildProjectPackageMediaManifest(
  project: EditorProject,
  options: ProjectPackageMediaManifestOptions = {},
): ProjectPackageMediaManifest {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const entries: ProjectPackageMediaEntry[] = [];
  const usedPackagePaths = new Set<string>();

  for (const asset of project.assets) {
    for (const candidate of collectAssetMediaReferences(asset)) {
      const status = classifyPackageMediaPath(candidate.originalPath);
      const packagePath = makeUniquePackageMediaPath(
        buildPackageMediaPath(asset.id, candidate.role, candidate.originalPath, asset.name),
        usedPackagePaths,
      );
      const entry: ProjectPackageMediaEntry = {
        assetId: asset.id,
        assetName: asset.name,
        role: candidate.role,
        originalPath: candidate.originalPath,
        packagePath,
        status,
        requiredForRender: candidate.requiredForRender,
      };

      entries.push(entry);
    }
  }

  return {
    projectId: project.id,
    generatedAt,
    entries,
    warnings: buildProjectPackageMediaWarnings(entries),
    bundleReadyCount: entries.filter((entry) => entry.status === 'bundle-ready').length,
    missingCount: entries.filter((entry) => entry.status === 'missing').length,
    volatileCount: entries.filter((entry) => entry.status === 'volatile-source').length,
    externalCount: entries.filter((entry) => entry.status === 'external-reference').length,
    copyFailedCount: entries.filter((entry) => entry.status === 'copy-failed').length,
  };
}

export function classifyPackageMediaPath(pathValue: string): ProjectPackageMediaStatus {
  const normalized = pathValue.trim();

  if (!normalized) {
    return 'missing';
  }

  if (normalized.includes('\0')) {
    return 'copy-failed';
  }

  if (isVolatilePackageMediaPath(normalized)) {
    return 'volatile-source';
  }

  const lower = normalized.toLowerCase();
  if (normalized.startsWith('//')) {
    return 'external-reference';
  }

  if (lower.startsWith('file://')) {
    return 'bundle-ready';
  }

  if (
    lower.startsWith('http://')
    || lower.startsWith('https://')
    || lower.startsWith('data:')
    || lower.startsWith('ipfs://')
    || hasNonFileUriScheme(normalized)
  ) {
    return 'external-reference';
  }

  return 'bundle-ready';
}

export function isVolatilePackageMediaPath(pathValue: string): boolean {
  const lower = pathValue.trim().toLowerCase();
  return lower.startsWith('blob:')
    || lower.startsWith('local://')
    || lower.startsWith('offline://');
}

function hasNonFileUriScheme(pathValue: string): boolean {
  if (/^[a-zA-Z]:[\\/]/.test(pathValue)) {
    return false;
  }

  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(pathValue);
}

export function rewriteProjectMediaPathsForPackageImport(
  project: EditorProject,
  manifest: ProjectPackageMediaManifest,
  options: ProjectPackageMediaRewriteOptions = {},
): ProjectPackageMediaRewriteResult {
  const packageRoot = options.packageRoot ?? '';
  const entriesByAssetId = new Map<string, ProjectPackageMediaEntry[]>();
  const bundledEntryByPackagePath = new Map<string, ProjectPackageMediaEntry>();
  const warnings: string[] = [];

  if (manifest.projectId !== project.id) {
    warnings.push(`Media package manifest belongs to ${manifest.projectId}, but project ${project.id} was imported.`);
  }

  for (const entry of manifest.entries) {
    const invalidReason = validateProjectPackageMediaEntry(entry);
    if (invalidReason) {
      warnings.push(`Skipped invalid package media manifest entry: ${invalidReason}`);
      continue;
    }

    if (entry.status === 'bundle-ready') {
      const packagePathKey = normalizePackageImportPath(entry.packagePath).toLowerCase();
      const existingEntry = bundledEntryByPackagePath.get(packagePathKey);
      if (existingEntry) {
        warnings.push(`${entry.assetName} ${entry.role} media reuses package path ${entry.packagePath}; skipped to avoid rewriting multiple assets to the same packaged file.`);
        continue;
      }
      bundledEntryByPackagePath.set(packagePathKey, entry);
    }

    const assetEntries = entriesByAssetId.get(entry.assetId) ?? [];
    assetEntries.push(entry);
    entriesByAssetId.set(entry.assetId, assetEntries);

    if (entry.status !== 'bundle-ready' && entry.requiredForRender) {
      warnings.push(formatUnrewrittenRequiredMediaWarning(entry));
    }
  }

  let rewrittenCount = 0;
  const assets = project.assets.map((asset) => {
    const entries = entriesByAssetId.get(asset.id)?.filter((entry) => entry.status === 'bundle-ready') ?? [];
    if (entries.length === 0) {
      return asset;
    }

    let nextAsset = { ...asset, mediaCache: asset.mediaCache ? { ...asset.mediaCache } : undefined };

    for (const entry of entries) {
      const nextPath = joinPackageImportPath(packageRoot, entry.packagePath);
      if (!nextPath) {
        warnings.push(`${entry.assetName} package ${entry.role} media path is unsafe and was not rewritten: ${entry.packagePath}`);
        continue;
      }

      switch (entry.role) {
        case 'source':
          nextAsset = { ...nextAsset, source: nextPath };
          rewrittenCount += 1;
          break;
        case 'render':
          nextAsset = { ...nextAsset, renderPath: nextPath };
          rewrittenCount += 1;
          break;
        case 'proxy':
          nextAsset = {
            ...nextAsset,
            mediaCache: {
              ...ensureMediaCache(nextAsset),
              proxyPath: nextPath,
              proxySource: nextPath,
            },
          };
          rewrittenCount += 1;
          break;
        case 'thumbnail':
          nextAsset = {
            ...nextAsset,
            mediaCache: {
              ...ensureMediaCache(nextAsset),
              thumbnailPath: nextPath,
              thumbnailSource: nextPath,
            },
          };
          rewrittenCount += 1;
          break;
        case 'waveform':
          nextAsset = {
            ...nextAsset,
            mediaCache: {
              ...ensureMediaCache(nextAsset),
              waveformPath: nextPath,
              waveformSource: nextPath,
            },
          };
          rewrittenCount += 1;
          break;
      }
    }

    return nextAsset;
  });

  return {
    project: { ...project, assets },
    warnings: uniqueStrings(warnings),
    rewrittenCount,
  };
}

export function summarizeProjectPackageMediaReadiness(manifest: ProjectPackageMediaManifest): string {
  const validEntries = manifest.entries.filter((entry) => !validateProjectPackageMediaEntry(entry));
  const invalidCount = manifest.entries.length - validEntries.length;
  const blockingCount = invalidCount + validEntries.filter((entry) => (
    entry.requiredForRender && entry.status !== 'bundle-ready'
  )).length;

  if (blockingCount > 0) {
    return `${blockingCount} media manifest entr${blockingCount > 1 ? 'ies' : 'y'} need review, relink, or reimport before a portable package is complete.`;
  }

  const readyCount = validEntries.filter((entry) => entry.status === 'bundle-ready').length;
  return `${readyCount} media reference${readyCount > 1 ? 's' : ''} ready for package copy.`;
}

export function buildProjectPackageMediaWarnings(entries: ProjectPackageMediaEntry[]): string[] {
  const assetIdsWithBundledRender = new Set(entries
    .filter((entry) => entry.role === 'render' && entry.status === 'bundle-ready')
    .map((entry) => entry.assetId));

  return uniqueStrings(entries.flatMap((entry) => buildMediaEntryWarnings(entry, assetIdsWithBundledRender)));
}

export function validateProjectPackageMediaEntry(entry: unknown): string {
  if (!entry || typeof entry !== 'object') {
    return 'entry is not an object';
  }

  const candidate = entry as Partial<ProjectPackageMediaEntry>;
  if (typeof candidate.assetId !== 'string' || !candidate.assetId.trim()) {
    return 'assetId is missing';
  }

  if (typeof candidate.assetName !== 'string' || !candidate.assetName.trim()) {
    return `asset ${candidate.assetId} has no assetName`;
  }

  if (!isProjectPackageMediaRole(candidate.role)) {
    return `${candidate.assetName} has unsupported role ${String(candidate.role)}`;
  }

  if (!isProjectPackageMediaStatus(candidate.status)) {
    return `${candidate.assetName} ${candidate.role} has unsupported status ${String(candidate.status)}`;
  }

  if (typeof candidate.originalPath !== 'string') {
    return `${candidate.assetName} ${candidate.role} has no originalPath`;
  }

  if (typeof candidate.packagePath !== 'string') {
    return `${candidate.assetName} ${candidate.role} has no packagePath`;
  }

  if (!normalizePackageImportPath(candidate.packagePath)) {
    return `${candidate.assetName} ${candidate.role} has unsafe packagePath ${candidate.packagePath}`;
  }

  return '';
}

function isProjectPackageMediaRole(value: unknown): value is ProjectPackageMediaRole {
  return typeof value === 'string' && PROJECT_PACKAGE_MEDIA_ROLES.has(value as ProjectPackageMediaRole);
}

function isProjectPackageMediaStatus(value: unknown): value is ProjectPackageMediaStatus {
  return typeof value === 'string' && PROJECT_PACKAGE_MEDIA_STATUSES.has(value as ProjectPackageMediaStatus);
}

function collectAssetMediaReferences(asset: EditorProject['assets'][number]): MediaReferenceCandidate[] {
  const isRenderMedia = Boolean(resolveRenderableAssetMediaKind(asset));
  const mediaCache = asset.mediaCache;
  const references: MediaReferenceCandidate[] = [];

  if (isRenderMedia) {
    references.push({
      role: 'source',
      originalPath: asset.source,
      requiredForRender: !asset.renderPath,
    });
    references.push({
      role: 'render',
      originalPath: asset.renderPath ?? '',
      requiredForRender: true,
    });
  }

  if (mediaCache?.proxyPath || mediaCache?.proxySource) {
    references.push({
      role: 'proxy',
      originalPath: mediaCache.proxyPath ?? mediaCache.proxySource ?? '',
      requiredForRender: false,
    });
  }

  if (mediaCache?.thumbnailPath || mediaCache?.thumbnailSource) {
    references.push({
      role: 'thumbnail',
      originalPath: mediaCache.thumbnailPath ?? mediaCache.thumbnailSource ?? '',
      requiredForRender: false,
    });
  }

  if (mediaCache?.waveformPath || mediaCache?.waveformSource) {
    references.push({
      role: 'waveform',
      originalPath: mediaCache.waveformPath ?? mediaCache.waveformSource ?? '',
      requiredForRender: false,
    });
  }

  return references;
}

function buildMediaEntryWarnings(entry: ProjectPackageMediaEntry, assetIdsWithBundledRender: ReadonlySet<string>): string[] {
  if (entry.status === 'bundle-ready') {
    return [];
  }

  const roleLabel = entry.role === 'render' ? 'render path' : `${entry.role} media`;
  const optionalSourceCoveredByRender = entry.role === 'source' && !entry.requiredForRender && assetIdsWithBundledRender.has(entry.assetId);

  if (entry.status === 'missing') {
    return entry.requiredForRender
      ? [`${entry.assetName} is missing required ${roleLabel}; relink or reimport before portable export.`]
      : [];
  }

  if (entry.status === 'volatile-source') {
    if (optionalSourceCoveredByRender) {
      return [];
    }

    return entry.requiredForRender
      ? [`${entry.assetName} uses volatile ${roleLabel} (${entry.originalPath}) and must be reimported before portable export.`]
      : [`${entry.assetName} uses volatile ${roleLabel} (${entry.originalPath}) that will not be bundled; rebuild preview cache or relink after package import.`];
  }

  if (entry.status === 'copy-failed') {
    return entry.requiredForRender
      ? [`${entry.assetName} required ${roleLabel} could not be copied into the portable package; relink or re-export before package import.`]
      : [`${entry.assetName} optional ${roleLabel} could not be copied into the portable package; rebuild cache or re-export if needed.`];
  }

  return optionalSourceCoveredByRender
    ? []
    : [`${entry.assetName} uses external ${roleLabel} (${entry.originalPath}) that will remain an external reference.`];
}

function formatUnrewrittenRequiredMediaWarning(entry: ProjectPackageMediaEntry): string {
  if (entry.status === 'missing') {
    return `${entry.assetName} required ${entry.role} media is missing after package import.`;
  }

  if (entry.status === 'volatile-source') {
    return `${entry.assetName} required ${entry.role} media is volatile and was not rewritten during package import.`;
  }

  if (entry.status === 'copy-failed') {
    return `${entry.assetName} required ${entry.role} media failed to copy into the package and was not rewritten during package import.`;
  }

  return `${entry.assetName} required ${entry.role} media is external and was not rewritten during package import.`;
}

function buildPackageMediaPath(
  assetId: string,
  role: ProjectPackageMediaRole,
  originalPath: string,
  assetName: string,
): string {
  const fileName = safeFileName(readFileName(originalPath) || `${assetName}-${role}`);
  return `media/${safePathSegment(assetId)}/${role}-${fileName}`;
}

function makeUniquePackageMediaPath(packagePath: string, usedPackagePaths: Set<string>): string {
  let candidate = packagePath;
  let suffix = 2;
  while (usedPackagePaths.has(candidate.toLowerCase())) {
    candidate = appendPackagePathSuffix(packagePath, suffix);
    suffix += 1;
  }

  usedPackagePaths.add(candidate.toLowerCase());
  return candidate;
}

function appendPackagePathSuffix(packagePath: string, suffix: number): string {
  const slashIndex = packagePath.lastIndexOf('/');
  const directory = slashIndex >= 0 ? `${packagePath.slice(0, slashIndex + 1)}` : '';
  const fileName = slashIndex >= 0 ? packagePath.slice(slashIndex + 1) : packagePath;
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex > 0) {
    return `${directory}${fileName.slice(0, dotIndex)}-${suffix}${fileName.slice(dotIndex)}`;
  }

  return `${directory}${fileName}-${suffix}`;
}

function readFileName(pathValue: string): string {
  const withoutQuery = pathValue.split(/[?#]/)[0] ?? '';
  const normalized = withoutQuery.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts.at(-1) ?? '';
}

function safePathSegment(value: string): string {
  const segment = safeFileName(value, 'asset');
  return isWindowsReservedPathName(segment) ? `asset-${segment}` : segment;
}

function safeFileName(value: string, fallback = 'media'): string {
  const sanitized = value
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 96);

  return sanitized || fallback;
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

function joinPackageImportPath(root: string, packagePath: string): string {
  const normalizedPath = normalizePackageImportPath(packagePath);
  if (!normalizedPath) {
    return '';
  }

  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/+$/g, '');
  return normalizedRoot ? `${normalizedRoot}/${normalizedPath}` : normalizedPath;
}

function normalizePackageImportPath(packagePath: string): string {
  const normalized = packagePath.trim().replace(/\\/g, '/');
  if (
    !normalized
    || normalized.includes('\0')
    || normalized.startsWith('/')
    || normalized.startsWith('//')
    || /^[a-zA-Z]:\//.test(normalized)
  ) {
    return '';
  }

  const parts = normalized.split('/');
  if (
    parts.length !== 3
    || parts[0] !== 'media'
    || parts.some((part) => !part || part === '.' || part === '..')
  ) {
    return '';
  }

  return parts.join('/');
}

function ensureMediaCache(asset: EditorProject['assets'][number]): NonNullable<EditorProject['assets'][number]['mediaCache']> {
  return asset.mediaCache ?? {
    generatedAt: new Date().toISOString(),
    warnings: [],
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
