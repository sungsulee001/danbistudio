import { readFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { deserializeProjectPackage } from '../../lib/editor/project-store';
import type { EditorProjectPackageImportResponse } from '../../electron/shared/ipc-contract';
import { assertValidProjectJson } from '../../electron/shared/project-schema';

export const SAMPLE_PROJECT_PACKAGE_FILE_NAME = 'project.danbi-project.json';
export const SAMPLE_PROJECT_TUTORIAL_FILE_NAME = 'tutorial.md';

export interface SampleProjectPackageLookupOptions {
  env?: Record<string, string | undefined>;
  resourcesPath?: string;
  appPath?: string;
  cwd?: string;
}

export interface SampleProjectPackageMetadata {
  available: boolean;
  packageDirectory?: string;
  projectFilePath?: string;
  candidates: string[];
}

export function resolveSampleProjectPackageCandidates(
  options: SampleProjectPackageLookupOptions = {},
): string[] {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();

  return uniquePaths([
    normalizeSampleProjectPackageCandidate(env.DANBI_SAMPLE_PROJECT_PACKAGE),
    options.resourcesPath ? join(options.resourcesPath, 'samples', 'getting-started') : undefined,
    options.resourcesPath ? join(options.resourcesPath, '..', 'samples', 'getting-started') : undefined,
    options.appPath ? join(options.appPath, 'samples', 'getting-started') : undefined,
    options.appPath ? join(options.appPath, '..', 'samples', 'getting-started') : undefined,
    join(cwd, '.danbi', 'electron-release', 'samples', 'getting-started'),
    join(cwd, '.danbi', 'sample-project-pack', 'getting-started'),
    join(cwd, 'release', 'electron', 'win-unpacked', 'resources', 'samples', 'getting-started'),
  ]);
}

export function findSampleProjectPackageDirectory(
  options: SampleProjectPackageLookupOptions = {},
): string | undefined {
  return resolveSampleProjectPackageCandidates(options).find(isSampleProjectPackageDirectory);
}

export function getSampleProjectPackageMetadata(
  options: SampleProjectPackageLookupOptions = {},
): SampleProjectPackageMetadata {
  const candidates = resolveSampleProjectPackageCandidates(options);
  const packageDirectory = candidates.find(isSampleProjectPackageDirectory);

  return {
    available: Boolean(packageDirectory),
    candidates,
    ...(packageDirectory ? {
      packageDirectory,
      projectFilePath: join(packageDirectory, SAMPLE_PROJECT_PACKAGE_FILE_NAME),
    } : {}),
  };
}

export async function readSampleProjectPackage(
  options: SampleProjectPackageLookupOptions = {},
): Promise<EditorProjectPackageImportResponse | null> {
  const metadata = getSampleProjectPackageMetadata(options);
  if (!metadata.packageDirectory || !metadata.projectFilePath) {
    return null;
  }

  const packageText = await readFile(metadata.projectFilePath, 'utf8');
  const imported = deserializeProjectPackage(packageText, {
    rewriteBundledMedia: true,
    packageRoot: metadata.packageDirectory,
  });

  return {
    ...imported,
    project: assertValidProjectJson(imported.project, 'Cannot import sample project package because its JSON is invalid'),
    packageDirectory: metadata.packageDirectory,
    projectFilePath: metadata.projectFilePath,
  };
}

function isSampleProjectPackageDirectory(directory: string): boolean {
  try {
    return Boolean(
      statSync(join(directory, SAMPLE_PROJECT_PACKAGE_FILE_NAME), { throwIfNoEntry: false })?.isFile() &&
        statSync(join(directory, SAMPLE_PROJECT_TUTORIAL_FILE_NAME), { throwIfNoEntry: false })?.isFile(),
    );
  } catch {
    return false;
  }
}

function normalizeSampleProjectPackageCandidate(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const resolved = resolve(trimmed);
  return basename(resolved).toLowerCase() === SAMPLE_PROJECT_PACKAGE_FILE_NAME.toLowerCase()
    ? dirname(resolved)
    : resolved;
}

function uniquePaths(paths: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const item of paths) {
    if (!item) {
      continue;
    }

    const normalized = resolve(item);
    const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(normalized);
  }

  return unique;
}
