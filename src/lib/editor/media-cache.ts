import { spawn } from 'child_process';
import { mkdir, rename, rm, writeFile } from 'fs/promises';
import { basename, extname, join, parse } from 'path';
import { getCacheStorageRoot, toCacheSourcePath } from '../../server/cache-storage';
import type { MediaAnalysis } from './media-analyzer';
import { inferSupportedMediaFileKind } from './media-file-support';
import type { MediaCacheManifest } from './types';
import { normalizeWaveformPeaks } from './waveform-cache';

export interface MediaCacheOptions {
  filePath: string;
  mimeType: string;
  analysis: MediaAnalysis;
  cacheRoot?: string;
  publicRoot?: string;
  waveformSampleCount?: number;
  signal?: AbortSignal;
}

const MAX_MEDIA_CACHE_KEY_LENGTH = 96;

export async function createMediaCache(options: MediaCacheOptions): Promise<MediaCacheManifest> {
  const cacheRoot = options.cacheRoot ?? join(getCacheStorageRoot(), 'media');
  const publicRoot = options.publicRoot ?? '/cache/media';
  const key = safeCacheKey(options.filePath);
  const warnings: string[] = [];
  const mediaKind = inferSupportedMediaFileKind({
    name: options.filePath,
    mimeType: options.mimeType,
  });
  const manifest: MediaCacheManifest = {
    generatedAt: new Date().toISOString(),
    warnings,
  };

  await Promise.all([
    mkdir(join(cacheRoot, 'thumbnails'), { recursive: true }),
    mkdir(join(cacheRoot, 'proxies'), { recursive: true }),
    mkdir(join(cacheRoot, 'waveforms'), { recursive: true }),
  ]);

  if ((mediaKind === 'video' && options.analysis.hasVideo) || mediaKind === 'image') {
    const thumbnailPath = join(cacheRoot, 'thumbnails', `${key}.jpg`);
    const thumbnailResult = await generateThumbnail(options.filePath, thumbnailPath, options.analysis.duration, options.signal).catch((error) => {
      warnings.push(`thumbnail failed: ${(error as Error).message}`);
      return false;
    });

    if (thumbnailResult) {
      manifest.thumbnailPath = thumbnailPath;
      manifest.thumbnailSource = toCacheSource(options, `${publicRoot}/thumbnails/${key}.jpg`, `media/thumbnails/${key}.jpg`);
    }
  }

  if (mediaKind === 'video' && options.analysis.hasVideo) {
    const proxyPath = join(cacheRoot, 'proxies', `${key}.mp4`);
    const proxyResult = await generateProxy(options.filePath, proxyPath, options.signal).catch((error) => {
      warnings.push(`proxy failed: ${(error as Error).message}`);
      return false;
    });

    if (proxyResult) {
      manifest.proxyPath = proxyPath;
      manifest.proxySource = toCacheSource(options, `${publicRoot}/proxies/${key}.mp4`, `media/proxies/${key}.mp4`);
    }
  }

  if ((mediaKind === 'audio' || mediaKind === 'video') && options.analysis.hasAudio) {
    const waveformPath = join(cacheRoot, 'waveforms', `${key}.json`);
    const waveformResult = await generateWaveform(options.filePath, waveformPath, options.waveformSampleCount ?? 128, options.signal).catch((error) => {
      warnings.push(`waveform failed: ${(error as Error).message}`);
      return undefined;
    });

    if (waveformResult) {
      manifest.waveformPath = waveformPath;
      manifest.waveformSource = toCacheSource(options, `${publicRoot}/waveforms/${key}.json`, `media/waveforms/${key}.json`);
      manifest.waveformPeaks = waveformResult.peaks;
    }
  }

  return manifest;
}

function toCacheSource(options: MediaCacheOptions, fallback: string, relativePath: string): string {
  return options.publicRoot === undefined && options.cacheRoot === undefined
    ? toCacheSourcePath(relativePath)
    : fallback;
}

export function buildAudioPeaksFromPcm(buffer: Buffer, sampleCount: number): number[] {
  if (buffer.length < 2 || sampleCount <= 0) {
    return [];
  }

  const sampleTotal = Math.floor(buffer.length / 2);
  const bucketSize = Math.max(1, Math.floor(sampleTotal / sampleCount));
  const peaks = Array.from({ length: sampleCount }).map((_, bucketIndex) => {
    const start = bucketIndex * bucketSize;
    const end = Math.min(sampleTotal, start + bucketSize);
    let peak = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      const value = Math.abs(buffer.readInt16LE(sampleIndex * 2)) / 32768;
      peak = Math.max(peak, value);
    }

    return peak;
  });
  const maxPeak = Math.max(...peaks, 0.001);

  return normalizeWaveformPeaks(peaks.map((peak) => peak / maxPeak));
}

async function generateThumbnail(filePath: string, outputPath: string, duration?: number, signal?: AbortSignal): Promise<boolean> {
  const seekTime = duration && duration > 3 ? Math.min(2, duration * 0.1) : 0;
  await runFfmpegToFile(outputPath, (temporaryOutputPath) => [
      '-y',
      '-ss',
      String(seekTime),
      '-i',
      filePath,
      '-frames:v',
      '1',
      '-vf',
      buildSquarePixelDisplayScaleFilter(480),
      '-q:v',
      '3',
      temporaryOutputPath,
    ], signal);

  return true;
}

async function generateProxy(filePath: string, outputPath: string, signal?: AbortSignal): Promise<boolean> {
  await runFfmpegToFile(outputPath, (temporaryOutputPath) => [
      '-y',
      '-i',
      filePath,
      '-map',
      '0:v:0',
      '-map',
      '0:a?',
      '-vf',
      buildSquarePixelDisplayScaleFilter(960),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '28',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      '-movflags',
      '+faststart',
      temporaryOutputPath,
    ], signal);

  return true;
}

async function generateWaveform(filePath: string, outputPath: string, sampleCount: number, signal?: AbortSignal): Promise<{ peaks: number[] }> {
  const pcm = await runFfmpegForBuffer([
    '-v',
    'error',
    '-i',
    filePath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '8000',
    '-f',
    's16le',
    'pipe:1',
  ], signal);
  const peaks = buildAudioPeaksFromPcm(pcm, sampleCount);

  await writeFileAtomically(outputPath, JSON.stringify({ peaks }));
  return { peaks };
}

async function runFfmpegToFile(
  outputPath: string,
  buildArgs: (temporaryOutputPath: string) => string[],
  signal?: AbortSignal,
): Promise<void> {
  const temporaryOutputPath = buildTemporaryOutputPath(outputPath);

  try {
    await runFfmpeg(buildArgs(temporaryOutputPath), signal);
    await rename(temporaryOutputPath, outputPath);
  } catch (error) {
    await rm(temporaryOutputPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function writeFileAtomically(outputPath: string, contents: string): Promise<void> {
  const temporaryOutputPath = buildTemporaryOutputPath(outputPath);

  try {
    await writeFile(temporaryOutputPath, contents, 'utf8');
    await rename(temporaryOutputPath, outputPath);
  } catch (error) {
    await rm(temporaryOutputPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function buildTemporaryOutputPath(outputPath: string): string {
  const extension = extname(outputPath);
  const stem = extension ? outputPath.slice(0, -extension.length) : outputPath;
  return `${stem}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp${extension}`;
}

function runFfmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('media cache job cancelled'));
      return;
    }

    const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, {
      windowsHide: true,
    });
    let stderr = '';
    const abort = () => {
      child.kill('SIGTERM');
      reject(new Error('media cache job cancelled'));
    };

    signal?.addEventListener('abort', abort, { once: true });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

function runFfmpegForBuffer(args: string[], signal?: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('media cache job cancelled'));
      return;
    }

    const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, {
      windowsHide: true,
    });
    const stdoutChunks: Buffer[] = [];
    let stderr = '';
    const abort = () => {
      child.kill('SIGTERM');
      reject(new Error('media cache job cancelled'));
    };

    signal?.addEventListener('abort', abort, { once: true });

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(Buffer.from(chunk));
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks));
        return;
      }

      reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

function buildSquarePixelDisplayScaleFilter(maxDisplayWidth: number): string {
  const width = `max(2\\,trunc(min(${maxDisplayWidth}\\,iw*sar)/2)*2)`;
  const height = `max(2\\,trunc((min(${maxDisplayWidth}\\,iw*sar)/(iw*sar/ih))/2)*2)`;
  return `scale=w='${width}':h='${height}',setsar=1`;
}

function safeCacheKey(filePath: string): string {
  const parsed = parse(filePath);
  const extension = extname(filePath);
  const name = basename(filePath, extension) || parsed.name || 'media';
  const sanitized = name
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '') || 'media';
  const baseName = isWindowsReservedPathName(sanitized) ? `media-${sanitized}` : sanitized;
  const bounded = boundCacheKey(`${baseName}-${shortStableHash(normalizeCacheIdentity(filePath))}`);

  return isWindowsReservedPathName(bounded) ? `media-${bounded}` : bounded;
}

function normalizeCacheIdentity(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase();
}

function boundCacheKey(value: string): string {
  if (value.length <= MAX_MEDIA_CACHE_KEY_LENGTH) {
    return value;
  }

  const hash = shortStableHash(value);
  const prefix = value
    .slice(0, MAX_MEDIA_CACHE_KEY_LENGTH - hash.length - 1)
    .replace(/[._-]+$/g, '');
  return `${prefix || 'media'}-${hash}`;
}

function shortStableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
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
