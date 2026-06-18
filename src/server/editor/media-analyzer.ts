import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import type { EventEmitter } from 'node:events';
import { applyImageOrientationMetadata, isJpegMimeType, parseFfprobeOutput, type MediaAnalysis } from '../../lib/editor/media-analyzer';
import { inferSupportedMediaFileKind } from '../../lib/editor/media-file-support';

const DEFAULT_FFPROBE_TIMEOUT_MS = 15000;
const MAX_FFPROBE_TIMEOUT_MS = 120000;

interface FfprobeChildProcess {
  stdout: EventEmitter;
  stderr: EventEmitter;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'close', listener: (code: number | null) => void): unknown;
  kill(signal?: NodeJS.Signals | number): boolean;
}

type FfprobeSpawn = (
  command: string,
  args: string[],
  options: { windowsHide: true },
) => FfprobeChildProcess;

export interface MediaFileAnalysisOptions {
  ffprobePath?: string;
  ffprobeTimeoutMs?: number;
  spawnImpl?: FfprobeSpawn;
}

export async function analyzeMediaFile(
  filePath: string,
  mimeType: string,
  options: MediaFileAnalysisOptions = {},
): Promise<MediaAnalysis> {
  try {
    const output = await runFfprobe(filePath, options);
    const analysis = parseFfprobeOutput(output, mimeType);
    if (isJpegMimeType(mimeType)) {
      return applyImageOrientationMetadata(analysis, mimeType, await readFile(filePath));
    }

    return analysis;
  } catch (error) {
    const mediaKind = inferSupportedMediaFileKind({ name: filePath, mimeType });
    return {
      hasVideo: mediaKind === 'video' || mediaKind === 'image',
      hasAudio: mediaKind === 'audio',
      warnings: [`ffprobe analysis failed: ${(error as Error).message}`],
    };
  }
}

export async function runFfprobe(
  filePath: string,
  options: MediaFileAnalysisOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeoutMs = normalizeFfprobeTimeout(options.ffprobeTimeoutMs);
    const spawnImpl = options.spawnImpl ?? spawn as FfprobeSpawn;
    const child = spawnImpl(options.ffprobePath ?? process.env.FFPROBE_PATH ?? 'ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ], {
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      finish(() => {
        child.kill('SIGTERM');
        reject(new Error(`ffprobe timed out after ${timeoutMs}ms.`));
      });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => finish(() => reject(error)));
    child.on('close', (code) => {
      finish(() => {
        if (code === 0 && stdout.trim()) {
          resolve(stdout);
          return;
        }

        reject(new Error(stderr.trim() || `ffprobe exited with code ${code}`));
      });
    });
  });
}

function normalizeFfprobeTimeout(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_FFPROBE_TIMEOUT_MS;
  }

  return Math.round(Math.min(MAX_FFPROBE_TIMEOUT_MS, Math.max(1000, value)));
}
