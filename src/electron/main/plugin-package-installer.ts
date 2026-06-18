import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  verifyPluginManifestSignature,
  type PluginManifestSignatureVerification,
} from '../../lib/editor/plugin-signature';
import { createDefaultEditorProject } from '../../lib/editor/project';
import type { EditorPluginManifest, EditorProject } from '../../lib/editor/types';
import { assertValidProjectJson } from '../shared/project-schema';
import type {
  EditorPluginPackageFileCopyResult,
  EditorPluginPackageInstallRequest,
  EditorPluginPackageInstallResponse,
} from '../shared/ipc-contract';

export const DEFAULT_PLUGIN_PACKAGE_MANIFEST_FILE_NAME = 'danbi-plugin-package.json';
export const PLUGIN_PACKAGE_KIND = 'danbi.plugin-package';
export const PLUGIN_PACKAGE_VERSION = 1;

const SHA256_PATTERN = /^sha256-[a-f0-9]{64}$/;
const SAFE_PLUGIN_PACKAGE_PATH_SEGMENT = /^[a-zA-Z0-9._-]+$/;

interface EditorPluginPackageManifest {
  kind: typeof PLUGIN_PACKAGE_KIND;
  packageVersion: typeof PLUGIN_PACKAGE_VERSION;
  plugin: EditorPluginManifest;
  files: EditorPluginPackageManifestFile[];
  createdAt?: string;
}

interface EditorPluginPackageManifestFile {
  path: string;
  sha256?: string;
  bytes?: number;
}

interface VerifiedPluginPackageFile {
  path: string;
  sourcePath: string;
  targetPath: string;
  bytes: number;
  sha256: string;
}

export async function installEditorPluginPackageFolder(
  request: EditorPluginPackageInstallRequest,
): Promise<EditorPluginPackageInstallResponse> {
  const packageDirectory = path.resolve(request.packageDirectory);
  const installRootDirectory = path.resolve(request.installRootDirectory ?? process.cwd());
  const manifestFileName = normalizePluginPackageManifestFileName(
    request.manifestFileName ?? DEFAULT_PLUGIN_PACKAGE_MANIFEST_FILE_NAME,
  );
  const manifestPath = path.resolve(packageDirectory, manifestFileName);
  assertPathInsideDirectory(manifestPath, packageDirectory, 'Plugin package manifest');

  const manifest = readPluginPackageManifest(
    JSON.parse(await readFile(manifestPath, 'utf8')),
    manifestPath,
  );
  const signature = verifyPluginManifestSignature(manifest.plugin);
  const warnings = buildPluginPackageSignatureWarnings(signature);

  assertInstallablePluginSignature(signature);
  assertPluginPackageManifestCoversPlugin(manifest);

  const existingPlugin = request.project.plugins.find((plugin) => plugin.id === manifest.plugin.id);
  const mode = request.mode ?? 'install';
  if (mode === 'install' && existingPlugin) {
    throw new Error(`Plugin package ${manifest.plugin.id} is already installed; use update or replace mode.`);
  }
  if (mode === 'update' && !existingPlugin) {
    throw new Error(`Plugin package ${manifest.plugin.id} is not installed; use install or replace mode.`);
  }

  const verifiedFiles = await verifyPluginPackageFiles({
    manifest,
    packageDirectory,
    installRootDirectory,
  });
  const nextProject = assertValidProjectJson({
    ...request.project,
    plugins: existingPlugin
      ? request.project.plugins.map((plugin) => (
        plugin.id === manifest.plugin.id ? manifest.plugin : plugin
      ))
      : [...request.project.plugins, manifest.plugin],
    updatedAt: request.installedAt ?? new Date().toISOString(),
  }, 'Cannot install plugin package because the resulting project JSON is invalid');

  const copiedFiles = await installVerifiedPluginPackageFiles({
    files: verifiedFiles,
    installRootDirectory,
    mode,
  });

  return {
    kind: 'danbi.plugin-package.install-result',
    status: existingPlugin ? 'updated' : 'installed',
    packageDirectory,
    manifestPath,
    installRootDirectory,
    installedAt: nextProject.updatedAt,
    pluginId: manifest.plugin.id,
    pluginName: manifest.plugin.name,
    pluginVersion: manifest.plugin.version,
    signature,
    copiedFiles,
    warnings,
    project: nextProject,
  };
}

function readPluginPackageManifest(value: unknown, manifestPath: string): EditorPluginPackageManifest {
  if (!isRecord(value)) {
    throw new Error(`Plugin package manifest must be a JSON object: ${manifestPath}`);
  }
  if (value.kind !== PLUGIN_PACKAGE_KIND) {
    throw new Error(`Plugin package manifest kind must be ${PLUGIN_PACKAGE_KIND}.`);
  }
  if (value.packageVersion !== PLUGIN_PACKAGE_VERSION) {
    throw new Error(`Plugin package manifest packageVersion must be ${PLUGIN_PACKAGE_VERSION}.`);
  }
  if (!isRecord(value.plugin)) {
    throw new Error('Plugin package manifest plugin must be an object.');
  }
  if (!Array.isArray(value.files) || value.files.length === 0) {
    throw new Error('Plugin package manifest files must be a non-empty array.');
  }

  const files = value.files.map((file, index) => readPluginPackageManifestFile(file, `files[${index}]`));
  const plugin = value.plugin as unknown as EditorPluginManifest;
  const projectForValidation: EditorProject = {
    ...createDefaultEditorProject(),
    id: 'plugin-package-validation',
    name: 'Plugin Package Validation',
    plugins: [plugin],
  };
  assertValidProjectJson(projectForValidation, 'Cannot install plugin package because its plugin manifest is invalid');

  return {
    kind: PLUGIN_PACKAGE_KIND,
    packageVersion: PLUGIN_PACKAGE_VERSION,
    plugin,
    files,
    ...(typeof value.createdAt === 'string' && value.createdAt.trim() ? { createdAt: value.createdAt.trim() } : {}),
  };
}

function readPluginPackageManifestFile(value: unknown, pathLabel: string): EditorPluginPackageManifestFile {
  if (!isRecord(value)) {
    throw new Error(`Plugin package manifest ${pathLabel} must be an object.`);
  }

  const normalizedPath = readSafePackageInstallPath(value.path, `Plugin package manifest ${pathLabel}.path`);
  if (
    value.sha256 !== undefined &&
    (typeof value.sha256 !== 'string' || value.sha256.includes('\0') || !SHA256_PATTERN.test(value.sha256))
  ) {
    throw new Error(`Plugin package manifest ${pathLabel}.sha256 must be a sha256 hex digest string.`);
  }
  if (
    value.bytes !== undefined &&
    (typeof value.bytes !== 'number' || !Number.isInteger(value.bytes) || value.bytes < 0)
  ) {
    throw new Error(`Plugin package manifest ${pathLabel}.bytes must be a non-negative integer.`);
  }

  return {
    path: normalizedPath,
    ...(typeof value.sha256 === 'string' ? { sha256: value.sha256 } : {}),
    ...(typeof value.bytes === 'number' ? { bytes: value.bytes } : {}),
  };
}

function assertInstallablePluginSignature(signature: PluginManifestSignatureVerification): void {
  if (signature.status !== 'verified') {
    throw new Error(`Plugin package signature is not installable: ${signature.reason}`);
  }
}

function buildPluginPackageSignatureWarnings(signature: PluginManifestSignatureVerification): string[] {
  if (signature.trustLevel === 'fingerprint-only') {
    return ['Plugin package manifest has only a fingerprint signature; trusted-signer provenance is not available.'];
  }
  return [];
}

function assertPluginPackageManifestCoversPlugin(manifest: EditorPluginPackageManifest): void {
  const packageFilesByPath = new Map(manifest.files.map((file) => [file.path, file]));
  const packagePaths = new Set(packageFilesByPath.keys());
  const entryPath = normalizeSafePackageInstallPath(manifest.plugin.entry);
  if (!entryPath || !packagePaths.has(entryPath)) {
    throw new Error(`Plugin package must include the plugin entry file ${manifest.plugin.entry}.`);
  }

  for (const writer of manifest.plugin.exporterWriters ?? []) {
    if (!writer.runtimePackage) {
      continue;
    }
    const root = normalizeSafePackageInstallPath(writer.runtimePackage.root);
    const entry = normalizeSafePackageRelativePath(writer.runtimePackage.entry);
    if (!root || !entry || !packagePaths.has(`${root}/${entry}`)) {
      throw new Error(`Plugin package must include exporter writer runtime entry ${writer.runtimePackage.root}/${writer.runtimePackage.entry}.`);
    }
    for (const file of writer.runtimePackage.files) {
      const filePath = normalizeSafePackageRelativePath(file.path);
      const packageFile = filePath ? packageFilesByPath.get(`${root}/${filePath}`) : undefined;
      if (!filePath || !packageFile) {
        throw new Error(`Plugin package must include exporter writer runtime file ${writer.runtimePackage.root}/${file.path}.`);
      }
      if (file.sha256 && packageFile.sha256 && file.sha256 !== packageFile.sha256) {
        throw new Error(`Plugin package file ${writer.runtimePackage.root}/${file.path} sha256 does not match the plugin runtimePackage declaration.`);
      }
      if (typeof file.bytes === 'number' && typeof packageFile.bytes === 'number' && file.bytes !== packageFile.bytes) {
        throw new Error(`Plugin package file ${writer.runtimePackage.root}/${file.path} byte count does not match the plugin runtimePackage declaration.`);
      }
    }
  }
}

async function verifyPluginPackageFiles({
  manifest,
  packageDirectory,
  installRootDirectory,
}: {
  manifest: EditorPluginPackageManifest;
  packageDirectory: string;
  installRootDirectory: string;
}): Promise<VerifiedPluginPackageFile[]> {
  const paths = new Map<string, string>();
  const verifiedFiles: VerifiedPluginPackageFile[] = [];

  for (const file of manifest.files) {
    const packagePathKey = file.path.toLowerCase();
    const existingPath = paths.get(packagePathKey);
    if (existingPath) {
      throw new Error(`Plugin package file path "${file.path}" duplicates or case-collides with "${existingPath}".`);
    }
    paths.set(packagePathKey, file.path);

    const sourcePath = path.resolve(packageDirectory, ...file.path.split('/'));
    const targetPath = path.resolve(installRootDirectory, ...file.path.split('/'));
    assertPathInsideDirectory(sourcePath, packageDirectory, 'Plugin package source file');
    assertPathInsideDirectory(targetPath, installRootDirectory, 'Plugin package install target');

    const fileStat = await stat(sourcePath);
    if (!fileStat.isFile()) {
      throw new Error(`Plugin package source is not a regular file: ${file.path}`);
    }
    if (typeof file.bytes === 'number' && fileStat.size !== file.bytes) {
      throw new Error(`Plugin package file size mismatch for ${file.path}.`);
    }

    const sha256 = `sha256-${createHash('sha256').update(await readFile(sourcePath)).digest('hex')}`;
    if (file.sha256 && file.sha256 !== sha256) {
      throw new Error(`Plugin package file sha256 mismatch for ${file.path}.`);
    }

    verifiedFiles.push({
      path: file.path,
      sourcePath,
      targetPath,
      bytes: fileStat.size,
      sha256,
    });
  }

  return verifiedFiles;
}

async function installVerifiedPluginPackageFiles({
  files,
  installRootDirectory,
  mode,
}: {
  files: VerifiedPluginPackageFile[];
  installRootDirectory: string;
  mode: EditorPluginPackageInstallRequest['mode'];
}): Promise<EditorPluginPackageFileCopyResult[]> {
  await mkdir(installRootDirectory, { recursive: true });

  const stagingDirectory = await mkdtemp(path.join(installRootDirectory, '.danbi-plugin-package-stage-'));
  try {
    for (const file of files) {
      const stagedPath = stagedPluginPackageFilePath(stagingDirectory, file.path);

      await mkdir(path.dirname(stagedPath), { recursive: true });
      await copyFile(file.sourcePath, stagedPath, constants.COPYFILE_EXCL);
    }

    await preparePluginPackageInstallTargets(files, mode);

    const copiedFiles: EditorPluginPackageFileCopyResult[] = [];
    for (const file of files) {
      const stagedPath = stagedPluginPackageFilePath(stagingDirectory, file.path);

      await rename(stagedPath, file.targetPath);
      copiedFiles.push({
        path: file.path,
        sourcePath: file.sourcePath,
        targetPath: file.targetPath,
        bytes: file.bytes,
        sha256: file.sha256,
        status: 'copied',
      });
    }

    return copiedFiles;
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function preparePluginPackageInstallTargets(
  files: VerifiedPluginPackageFile[],
  mode: EditorPluginPackageInstallRequest['mode'],
): Promise<void> {
  for (const file of files) {
    const existingTarget = await stat(file.targetPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    });

    if (existingTarget) {
      if (mode === 'install') {
        throw new Error(`Plugin package install target already exists: ${file.path}`);
      }
      if (!existingTarget.isFile()) {
        throw new Error(`Plugin package install target is not a regular file: ${file.path}`);
      }
    }
  }

  for (const file of files) {
    await mkdir(path.dirname(file.targetPath), { recursive: true });
  }
}

function stagedPluginPackageFilePath(stagingDirectory: string, packagePath: string): string {
  const stagedPath = path.resolve(stagingDirectory, ...packagePath.split('/'));

  assertPathInsideDirectory(stagedPath, stagingDirectory, 'Plugin package staged file');

  return stagedPath;
}

function readSafePackageInstallPath(value: unknown, label: string): string {
  const normalized = normalizeSafePackageInstallPath(value);
  if (!normalized) {
    throw new Error(`${label} must be a safe relative path under plugins/ or tools/.`);
  }
  return normalized;
}

function normalizeSafePackageInstallPath(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().replace(/\\/g, '/');
  if (!isSafeRelativePath(normalized)) {
    return undefined;
  }
  if (!normalized.startsWith('plugins/') && !normalized.startsWith('tools/')) {
    return undefined;
  }
  return normalized;
}

function normalizeSafePackageRelativePath(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().replace(/\\/g, '/');
  return isSafeRelativePath(normalized) ? normalized : undefined;
}

function isSafeRelativePath(value: string): boolean {
  return Boolean(value) &&
    !value.includes('\0') &&
    !/^[a-z][a-z0-9+.-]*:/i.test(value) &&
    !value.startsWith('/') &&
    !value.startsWith('//') &&
    !/^[a-zA-Z]:\//.test(value) &&
    !value.split('/').includes('..') &&
    value.split('/').every((segment) => Boolean(segment) && segment !== '.' && SAFE_PLUGIN_PACKAGE_PATH_SEGMENT.test(segment));
}

function normalizePluginPackageManifestFileName(value: string): string {
  const fileName = value.trim();
  if (!fileName) {
    throw new Error('Plugin package manifest file name is required.');
  }
  if (fileName.includes('\0')) {
    throw new Error('Plugin package manifest file name cannot contain null bytes.');
  }
  if (path.isAbsolute(fileName) || path.win32.isAbsolute(fileName) || path.posix.isAbsolute(fileName)) {
    throw new Error(`Plugin package manifest file name must be relative to the package directory: ${fileName}`);
  }
  if (fileName.includes('/') || fileName.includes('\\') || fileName === '.' || fileName === '..') {
    throw new Error(`Plugin package manifest file name cannot include path separators: ${fileName}`);
  }
  return fileName;
}

function assertPathInsideDirectory(targetPath: string, directory: string, label: string): void {
  const resolvedDirectory = path.resolve(directory);
  const relativePath = path.relative(resolvedDirectory, path.resolve(targetPath));

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`${label} escapes directory: ${targetPath}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
