import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { delimiter, isAbsolute, join } from 'node:path';
import { detectFfmpegCapabilities } from '../../lib/editor/ffmpeg-capabilities';
import type {
  FfmpegDiscoverySource,
  FfmpegExecutableCandidateSnapshot,
  FfmpegExecutableKind,
  FfmpegSetupSnapshot,
} from '../shared/runtime-diagnostics';

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface FfmpegDiscoveryOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  resourcesPath?: string;
  appPath?: string;
  cwd?: string;
  timeoutMs?: number;
  includeCapabilities?: boolean;
  checkAccess?: (filePath: string) => Promise<boolean>;
  runCommand?: (command: string, args: string[], timeoutMs: number) => Promise<CommandResult>;
}

interface FfmpegCandidate {
  kind: FfmpegExecutableKind;
  source: FfmpegDiscoverySource;
  label: string;
  path: string;
}

const DEFAULT_TIMEOUT_MS = 5_000;

let cachedSetup: Promise<FfmpegSetupSnapshot> | undefined;

export function clearFfmpegDiscoveryCache(): void {
  cachedSetup = undefined;
}

export async function discoverFfmpegSetup(options: FfmpegDiscoveryOptions = {}): Promise<FfmpegSetupSnapshot> {
  if (isCacheableDiscovery(options)) {
    cachedSetup ??= discoverFfmpegSetupUncached(options);
    return cachedSetup;
  }

  return discoverFfmpegSetupUncached(options);
}

export async function detectConfiguredFfmpegCapabilities() {
  const setup = await discoverFfmpegSetup({ includeCapabilities: true });
  return setup.capabilities ?? detectFfmpegCapabilities(setup.ffmpegPath);
}

export function applyFfmpegSetupToProcessEnv(setup: FfmpegSetupSnapshot, env: NodeJS.ProcessEnv = process.env): void {
  if (setup.ffmpegPath) {
    env.FFMPEG_PATH = setup.ffmpegPath;
  }
  if (setup.ffprobePath) {
    env.FFPROBE_PATH = setup.ffprobePath;
  }
}

export function buildFfmpegExecutableCandidates(
  kind: FfmpegExecutableKind,
  options: Pick<FfmpegDiscoveryOptions, 'env' | 'platform' | 'resourcesPath' | 'appPath' | 'cwd'> = {},
): FfmpegCandidate[] {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const resourcesPath = options.resourcesPath ?? env.DANBI_ELECTRON_RESOURCES_PATH;
  const appPath = options.appPath ?? env.DANBI_ELECTRON_APP_PATH;
  const executable = platform === 'win32' ? `${kind}.exe` : kind;
  const candidates: FfmpegCandidate[] = [];
  const envKey = kind === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH';

  addCandidate(candidates, kind, 'env', envKey, env[envKey]);

  for (const root of [resourcesPath, appPath, options.cwd ?? process.cwd()]) {
    if (!root) {
      continue;
    }

    const source = root === resourcesPath ? 'resources' : root === appPath ? 'app' : 'cwd';
    addCandidate(candidates, kind, source, `${source}/ffmpeg`, join(root, 'ffmpeg', executable));
    addCandidate(candidates, kind, source, `${source}/bin`, join(root, 'bin', executable));
    addCandidate(candidates, kind, source, `${source}/bin/ffmpeg`, join(root, 'bin', 'ffmpeg', executable));
  }

  addCandidate(candidates, kind, 'path', 'PATH', executable);
  addCandidate(candidates, kind, 'path', 'PATH bare', kind);

  return dedupeCandidates(candidates);
}

async function discoverFfmpegSetupUncached(options: FfmpegDiscoveryOptions): Promise<FfmpegSetupSnapshot> {
  const checkedAt = new Date().toISOString();
  const ffmpegCandidates = await checkExecutableCandidates(buildFfmpegExecutableCandidates('ffmpeg', options), options);
  const ffprobeCandidates = await checkExecutableCandidates(buildFfmpegExecutableCandidates('ffprobe', options), options);
  const selectedFfmpeg = ffmpegCandidates.find((candidate) => candidate.available);
  const selectedFfprobe = ffprobeCandidates.find((candidate) => candidate.available);
  const warnings: string[] = [];

  if (!selectedFfmpeg) {
    warnings.push('FFmpeg executable was not found. Set FFMPEG_PATH or package ffmpeg under resources/ffmpeg.');
  }
  if (!selectedFfprobe) {
    warnings.push('FFprobe executable was not found. Media import analysis will be degraded until FFPROBE_PATH or bundled ffprobe is available.');
  }

  const capabilities = selectedFfmpeg && options.includeCapabilities
    ? await detectFfmpegCapabilities(selectedFfmpeg.path)
    : undefined;

  return {
    checkedAt,
    ready: Boolean(selectedFfmpeg && selectedFfprobe),
    ffmpegPath: selectedFfmpeg?.path,
    ffprobePath: selectedFfprobe?.path,
    candidates: [...ffmpegCandidates, ...ffprobeCandidates],
    capabilities,
    warnings: [
      ...warnings,
      ...(capabilities?.warnings ?? []),
    ],
  };
}

async function checkExecutableCandidates(
  candidates: FfmpegCandidate[],
  options: FfmpegDiscoveryOptions,
): Promise<FfmpegExecutableCandidateSnapshot[]> {
  const results: FfmpegExecutableCandidateSnapshot[] = [];

  for (const candidate of candidates) {
    const checked = await checkExecutableCandidate(candidate, options);
    results.push(checked);
    if (checked.available) {
      break;
    }
  }

  return results;
}

async function checkExecutableCandidate(
  candidate: FfmpegCandidate,
  options: FfmpegDiscoveryOptions,
): Promise<FfmpegExecutableCandidateSnapshot> {
  const checkAccess = options.checkAccess ?? pathExists;
  const executableHasPath = hasPathSeparator(candidate.path) || isAbsolute(candidate.path);
  const exists = executableHasPath ? await checkAccess(candidate.path) : undefined;

  if (executableHasPath && !exists) {
    return {
      ...candidate,
      exists,
      available: false,
      error: 'File does not exist.',
    };
  }

  try {
    const result = await (options.runCommand ?? runCommand)(candidate.path, ['-version'], options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    if (result.code === 0) {
      return {
        ...candidate,
        exists,
        available: true,
        version: parseVersionLine(result.stdout || result.stderr),
      };
    }

    return {
      ...candidate,
      exists,
      available: false,
      error: (result.stderr || result.stdout || `${candidate.kind} -version exited with code ${result.code}`).trim(),
    };
  } catch (error) {
    return {
      ...candidate,
      exists,
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function runCommand(command: string, args: string[], timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${command} ${args.join(' ')} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function addCandidate(
  candidates: FfmpegCandidate[],
  kind: FfmpegExecutableKind,
  source: FfmpegDiscoverySource,
  label: string,
  candidatePath: string | undefined,
): void {
  if (!candidatePath) {
    return;
  }

  candidates.push({
    kind,
    source,
    label,
    path: candidatePath,
  });
}

function dedupeCandidates(candidates: FfmpegCandidate[]): FfmpegCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.kind}:${normalizePathForKey(candidate.path)}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function hasPathSeparator(value: string): boolean {
  return value.includes('/') || value.includes('\\') || value.includes(delimiter);
}

function normalizePathForKey(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function parseVersionLine(output: string): string | undefined {
  return output.split(/\r?\n/).find((line) => /\bff(?:mpeg|probe)\s+version\b/i.test(line))?.trim();
}

function isCacheableDiscovery(options: FfmpegDiscoveryOptions): boolean {
  return !options.env &&
    !options.platform &&
    !options.resourcesPath &&
    !options.appPath &&
    !options.cwd &&
    !options.checkAccess &&
    !options.runCommand &&
    options.includeCapabilities !== true;
}
