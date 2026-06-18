import { randomUUID } from 'crypto';
import { mkdir, open, rm, stat, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import {
  appendRenderPreflightIssues,
  buildRenderPreflightReport,
  type RenderPreflightIssue,
  type RenderPreflightOptions,
  type RenderPreflightReport,
} from '../../lib/editor/render-preflight';
import { validateRenderOutputPathSafety } from '../../lib/editor/render-output';
import type { FfmpegRenderPlan, FfmpegRenderInput } from '../../lib/editor/ffmpeg-renderer';
import type { EditorProject } from '../../lib/editor/types';

export async function buildRenderPreflightReportWithOutputAccess(
  project: EditorProject,
  profileId: string,
  options: RenderPreflightOptions = {},
): Promise<RenderPreflightReport> {
  const report = buildRenderPreflightReport(project, profileId, options);
  const extraIssues: RenderPreflightIssue[] = [];

  const outputPath = options.outputPath ?? options.plan?.outputPath;
  if (outputPath && !report.issues.some((issue) => issue.source === 'output' && issue.severity === 'blocked')) {
    extraIssues.push(...await buildRenderOutputAccessPreflightIssues(outputPath));
  }

  if (options.plan) {
    extraIssues.push(...await buildRenderInputAccessPreflightIssues(project, options.plan));
  }

  return appendRenderPreflightIssues(report, extraIssues);
}

export async function buildRenderOutputAccessPreflightIssues(outputPath: string): Promise<RenderPreflightIssue[]> {
  const targetPath = outputPath.trim();
  if (!targetPath) {
    return [];
  }

  const safetyIssue = validateRenderOutputPathSafety(targetPath);
  if (safetyIssue) {
    return [outputAccessIssue(safetyIssue.code, safetyIssue.message, safetyIssue.action)];
  }

  try {
    const targetStats = await statOptional(targetPath);
    if (targetStats?.isDirectory()) {
      return [outputAccessIssue(
        'target-is-directory',
        'Render output path points to an existing directory.',
        'Choose a writable output file path, not a folder.',
      )];
    }

    if (targetStats) {
      const handle = await open(targetPath, 'r+');
      await handle.close();
      return [];
    }

    const outputDir = dirname(targetPath);
    const outputDirStats = await statOptional(outputDir);
    if (outputDirStats && !outputDirStats.isDirectory()) {
      return [outputAccessIssue(
        'parent-not-directory',
        'Render output parent path is not a directory.',
        'Choose a normal writable folder before rendering.',
      )];
    }

    if (outputDirStats) {
      await probeWritableDirectory(outputDir);
    } else {
      await probeCreatableDirectory(outputDir);
    }

    return [];
  } catch (error) {
    return [classifyOutputAccessError(error)];
  }
}

export async function buildRenderInputAccessPreflightIssues(
  project: EditorProject,
  plan: FfmpegRenderPlan,
): Promise<RenderPreflightIssue[]> {
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const clipById = new Map(project.tracks.flatMap((track) => track.clips).map((clip) => [clip.id, clip]));
  const seenSources = new Set<string>();
  const issues: RenderPreflightIssue[] = [];

  for (const input of plan.inputs) {
    const asset = assetById.get(input.assetId);
    const renderPath = asset?.renderPath?.trim();

    if (!renderPath) {
      continue;
    }

    const source = input.source.trim();
    const sourceKey = normalizeInputSourceKey(source);
    if (!sourceKey || seenSources.has(sourceKey)) {
      continue;
    }
    seenSources.add(sourceKey);

    const label = asset?.name || clipById.get(input.clipId)?.name || input.assetId || 'Source media';
    const safetyIssue = validateRenderInputSourceSafety(input, source, label);
    if (safetyIssue) {
      issues.push(safetyIssue);
      continue;
    }

    try {
      const sourceStats = await statOptional(source);
      if (!sourceStats) {
        issues.push(inputAccessIssue({
          input,
          code: 'missing-source-file',
          message: `${label} source media is missing: ${source}`,
          action: `Relink ${label} or restore the file before rendering.`,
        }));
        continue;
      }

      if (sourceStats.isDirectory()) {
        issues.push(inputAccessIssue({
          input,
          code: 'source-is-directory',
          message: `${label} render source points to a directory: ${source}`,
          action: `Relink ${label} to a media file before rendering.`,
        }));
        continue;
      }

      if (!sourceStats.isFile()) {
        issues.push(inputAccessIssue({
          input,
          code: 'source-is-not-file',
          message: `${label} render source is not a normal file: ${source}`,
          action: `Relink ${label} to a local media file before rendering.`,
        }));
        continue;
      }

      const handle = await open(source, 'r');
      await handle.close();
    } catch (error) {
      issues.push(classifyInputAccessError(error, input, label, source));
    }
  }

  return issues;
}

async function probeWritableDirectory(outputDir: string): Promise<void> {
  const probePath = join(outputDir, `.danbi-render-write-test-${process.pid}-${randomUUID()}.tmp`);
  try {
    await writeFile(probePath, '', { flag: 'wx' });
  } finally {
    await rm(probePath, { force: true }).catch(() => undefined);
  }
}

async function probeCreatableDirectory(outputDir: string): Promise<void> {
  const ancestor = await findExistingDirectoryAncestor(outputDir);
  const probePath = join(ancestor, `.danbi-render-dir-test-${process.pid}-${randomUUID()}`);
  try {
    await mkdir(probePath);
  } finally {
    await rm(probePath, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function findExistingDirectoryAncestor(outputDir: string): Promise<string> {
  let current = outputDir;

  while (true) {
    const stats = await statOptional(current);
    if (stats) {
      if (!stats.isDirectory()) {
        throw Object.assign(new Error('Render output parent path is not a directory.'), { code: 'ENOTDIR' });
      }

      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      throw Object.assign(new Error('Render output folder does not exist.'), { code: 'ENOENT' });
    }

    current = parent;
  }
}

async function statOptional(path: string): Promise<Awaited<ReturnType<typeof stat>> | undefined> {
  try {
    return await stat(path);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}

function classifyOutputAccessError(error: unknown): RenderPreflightIssue {
  if (isNodeError(error)) {
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      return outputAccessIssue(
        'not-writable',
        'Render output file or folder is not writable.',
        'Close any app using the target file or choose a writable local folder.',
      );
    }

    if (error.code === 'ENOENT') {
      return outputAccessIssue(
        'folder-missing',
        'Render output folder does not exist.',
        'Choose an existing writable folder before rendering.',
      );
    }

    if (error.code === 'ENOTDIR') {
      return outputAccessIssue(
        'parent-not-directory',
        'Render output parent path is not a directory.',
        'Choose a normal writable folder before rendering.',
      );
    }

    if (error.code === 'EISDIR') {
      return outputAccessIssue(
        'target-is-directory',
        'Render output path points to a directory.',
        'Choose a writable output file path, not a folder.',
      );
    }
  }

  return outputAccessIssue(
    'filesystem-check-failed',
    'Render output path failed the filesystem write check.',
    `Choose a writable local output folder.${error instanceof Error ? ` ${error.message}` : ''}`,
  );
}

function outputAccessIssue(id: string, message: string, action: string): RenderPreflightIssue {
  return {
    id: `output-access-${id}`,
    severity: 'blocked',
    source: 'output',
    message,
    action,
    actionKind: 'output',
  };
}

function validateRenderInputSourceSafety(
  input: FfmpegRenderInput,
  source: string,
  label: string,
): RenderPreflightIssue | undefined {
  if (!source) {
    return inputAccessIssue({
      input,
      code: 'missing-source',
      message: `${label} has no FFmpeg input source.`,
      action: `Relink ${label} to a local media file before rendering.`,
    });
  }

  if (source.includes('\0')) {
    return inputAccessIssue({
      input,
      code: 'null-byte-source',
      message: `${label} render source contains a null byte.`,
      action: `Relink ${label} to a valid local media file before rendering.`,
    });
  }

  if (hasBlockedRenderInputProtocol(source)) {
    return inputAccessIssue({
      input,
      code: 'unsupported-source-protocol',
      message: `${label} render source uses a URL or shell protocol instead of a local filesystem path.`,
      action: `Relink ${label} to a local media file before rendering.`,
    });
  }

  if (hasBlockedWindowsDevicePath(source)) {
    return inputAccessIssue({
      input,
      code: 'windows-device-source',
      message: `${label} render source uses a Windows device namespace path.`,
      action: `Relink ${label} to a normal local media file before rendering.`,
    });
  }

  return undefined;
}

function classifyInputAccessError(
  error: unknown,
  input: FfmpegRenderInput,
  label: string,
  source: string,
): RenderPreflightIssue {
  if (isNodeError(error)) {
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      return inputAccessIssue({
        input,
        code: 'source-not-readable',
        message: `${label} source media is not readable: ${source}`,
        action: `Grant read access, close apps locking the file, or relink ${label} before rendering.`,
      });
    }

    if (error.code === 'ENOENT') {
      return inputAccessIssue({
        input,
        code: 'missing-source-file',
        message: `${label} source media is missing: ${source}`,
        action: `Relink ${label} or restore the file before rendering.`,
      });
    }

    if (error.code === 'ENOTDIR') {
      return inputAccessIssue({
        input,
        code: 'source-parent-not-directory',
        message: `${label} source media parent path is not a directory: ${source}`,
        action: `Relink ${label} to a valid local media file before rendering.`,
      });
    }

    if (error.code === 'EISDIR') {
      return inputAccessIssue({
        input,
        code: 'source-is-directory',
        message: `${label} render source points to a directory: ${source}`,
        action: `Relink ${label} to a media file before rendering.`,
      });
    }
  }

  return inputAccessIssue({
    input,
    code: 'source-check-failed',
    message: `${label} source media failed the filesystem read check: ${source}`,
    action: `Relink ${label} to a readable local media file before rendering.${error instanceof Error ? ` ${error.message}` : ''}`,
  });
}

function inputAccessIssue({
  input,
  code,
  message,
  action,
}: {
  input: FfmpegRenderInput;
  code: string;
  message: string;
  action: string;
}): RenderPreflightIssue {
  return {
    id: `input-access-${sanitizeIssueId(input.assetId)}-${code}`,
    severity: 'blocked',
    source: 'media-health',
    message,
    action,
    actionKind: 'relink',
    assetId: input.assetId,
    clipId: input.clipId,
  };
}

function normalizeInputSourceKey(source: string): string {
  return source.trim().replace(/\\/g, '/').toLowerCase();
}

function sanitizeIssueId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'source';
}

function hasBlockedRenderInputProtocol(value: string): boolean {
  if (/^[a-zA-Z]:[\\/]/.test(value)) {
    return false;
  }

  return /^(?:file|https?|data|javascript|mailto|shell|cmd|powershell|pipe|crypto|concat|subfile|tcp|udp):/i.test(value)
    || /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value);
}

function hasBlockedWindowsDevicePath(value: string): boolean {
  const normalized = value.replace(/\//g, '\\').toLowerCase();
  return normalized.startsWith('\\\\.\\') ||
    normalized.startsWith('\\\\?\\') ||
    normalized.startsWith('\\??\\') ||
    normalized.startsWith('\\device\\');
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
