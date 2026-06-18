import { spawn } from 'node:child_process';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createMediaCache } from '../../lib/editor/media-cache';
import type { MediaCacheManifest, EditorProject } from '../../lib/editor/types';
import { createClip } from '../../lib/editor/project';
import { defaultCaptionStyle } from '../../lib/editor/caption-style';
import { buildMediaHealthReport } from '../../lib/editor/media-health';
import { analyzeMediaFile } from '../../server/editor/media-analyzer';
import type {
  EditorNativeImportedMediaFile,
  EditorProjectPackageExportResponse,
} from '../shared/ipc-contract';
import { applyFfmpegSetupToProcessEnv, discoverFfmpegSetup } from './ffmpeg-discovery';
import { runFfmpegEngineRender } from './ffmpeg-render-engine';
import { importNativeMediaFilePaths } from './native-media-import-engine';
import { exportProjectPackageFolder, importProjectPackageFolder } from './project-package-engine';

export const SAMPLE_PROJECT_ID = 'danbi-sample-getting-started';
export const SAMPLE_EXPORT_PROFILE_ID = 'profile-sample-h264';
export const SAMPLE_PROJECT_TITLE = 'Danbi Getting Started';

export interface DanbiSampleProjectPackOptions {
  packageDirectory?: string;
  workDir?: string;
  generatedAt?: string;
}

export interface DanbiSampleProjectPackResult {
  packageDirectory: string;
  projectFilePath: string;
  tutorialPath: string;
  copiedMediaCount: number;
  mediaWarningCount: number;
}

export interface DanbiSampleProjectPackVerificationOptions {
  packageDirectory?: string;
  renderOutputPath?: string;
  generatedAt?: string;
}

export interface DanbiSampleProjectPackVerificationResult {
  packageDirectory: string;
  renderOutputPath: string;
  outputBytes: number;
  renderInputCount: number;
  editedTitle: string;
}

interface SampleMediaSources {
  introVideoPath: string;
  brollVideoPath: string;
  musicPath: string;
}

const DEFAULT_GENERATED_AT = '2026-06-15T00:00:00.000Z';
const SAMPLE_TITLE_TEXT = 'DANBI\nSAMPLE';
const SAMPLE_VERIFIED_TITLE_TEXT = 'DANBI\nSAMPLE VERIFIED';
const SAMPLE_CAPTION_TEXT = 'Import, edit, and export locally.';
const DEFAULT_SAMPLE_MEDIA_COMMAND_TIMEOUT_MS = 5 * 60 * 1000;
const MIN_SAMPLE_MEDIA_COMMAND_TIMEOUT_MS = 1000;
const MAX_SAMPLE_MEDIA_COMMAND_TIMEOUT_MS = 30 * 60 * 1000;

export async function createDanbiSampleProjectPack(
  options: DanbiSampleProjectPackOptions = {},
): Promise<DanbiSampleProjectPackResult> {
  const packageDirectory = resolve(options.packageDirectory ?? join(process.cwd(), '.danbi', 'sample-project-pack', 'getting-started'));
  const workDir = resolve(options.workDir ?? join(process.cwd(), '.danbi', 'sample-project-pack', 'work'));
  const sourceMediaDir = join(workDir, 'source-media');
  const importSourceRoot = join(workDir, 'import-root');
  const cacheRoot = join(workDir, 'cache', 'media');
  const generatedAt = options.generatedAt ?? DEFAULT_GENERATED_AT;
  const ffmpegSetup = await discoverFfmpegSetup({ includeCapabilities: true });

  applyFfmpegSetupToProcessEnv(ffmpegSetup);
  assertSampleFfmpegReady(ffmpegSetup.ffmpegPath, ffmpegSetup.capabilities?.encoders ?? []);

  await rm(workDir, { recursive: true, force: true });
  await rm(packageDirectory, { recursive: true, force: true });
  await mkdir(sourceMediaDir, { recursive: true });

  const sources = await generateSampleMediaSources(sourceMediaDir, ffmpegSetup.ffmpegPath ?? 'ffmpeg');
  const imported = await importNativeMediaFilePaths([
    sources.introVideoPath,
    sources.brollVideoPath,
    sources.musicPath,
  ], {
    sourceRoot: importSourceRoot,
    queueCache: false,
  });

  if (imported.warnings.length > 0 || imported.files.length !== 3) {
    throw new Error(`Sample media import failed: ${imported.warnings.join('; ') || `${imported.files.length} files imported`}`);
  }

  const mediaCaches = await buildSampleMediaCaches(imported.files, cacheRoot);
  const project = buildDanbiSampleProjectFromImportedMedia(imported.files, mediaCaches, generatedAt);
  assertSampleMediaReady(project);

  const exported = await exportProjectPackageFolder({
    project,
    packageDirectory,
    sourceRoot: importSourceRoot,
    exportedAt: generatedAt,
  });
  assertSamplePackageExport(exported);

  const tutorialPath = join(packageDirectory, 'tutorial.md');
  await writeFile(tutorialPath, buildTutorialMarkdown(), 'utf8');

  return {
    packageDirectory,
    projectFilePath: exported.projectFilePath,
    tutorialPath,
    copiedMediaCount: exported.copiedMedia.length,
    mediaWarningCount: exported.warnings.length,
  };
}

export async function verifyDanbiSampleProjectPack(
  options: DanbiSampleProjectPackVerificationOptions = {},
): Promise<DanbiSampleProjectPackVerificationResult> {
  const packageDirectory = resolve(options.packageDirectory ?? join(process.cwd(), '.danbi', 'sample-project-pack', 'getting-started'));
  const renderOutputPath = resolve(options.renderOutputPath ?? join(process.cwd(), '.danbi', 'sample-project-pack', 'verification', 'getting-started.mp4'));
  const ffmpegSetup = await discoverFfmpegSetup({ includeCapabilities: true });

  applyFfmpegSetupToProcessEnv(ffmpegSetup);
  assertSampleFfmpegReady(ffmpegSetup.ffmpegPath, ffmpegSetup.capabilities?.encoders ?? []);
  await mkdir(dirname(renderOutputPath), { recursive: true });
  await rm(renderOutputPath, { force: true });

  const imported = await importProjectPackageFolder({ packageDirectory });
  const editedProject = applySampleProjectVerificationEdit(imported.project, options.generatedAt ?? DEFAULT_GENERATED_AT);
  const renderResponse = await runFfmpegEngineRender({
    project: editedProject,
    profileId: SAMPLE_EXPORT_PROFILE_ID,
    outputPath: renderOutputPath,
    encoderPreference: 'software',
    capabilities: ffmpegSetup.capabilities,
    sampleTimes: [0.5, 2.75, 5.5],
  });
  const outputStats = await stat(renderOutputPath);

  if (renderResponse.preflight.blockedCount > 0) {
    throw new Error(`Sample project render preflight blocked: ${renderResponse.preflight.issues.map((issue) => issue.message).join('; ')}`);
  }
  if (outputStats.size <= 0) {
    throw new Error(`Sample project render output is empty: ${renderOutputPath}`);
  }
  if (!renderResponse.plan.filterGraph.some((filter) => filter.includes('SAMPLE VERIFIED'))) {
    throw new Error('Sample project verification edit was not reflected in the FFmpeg drawtext plan.');
  }
  if (!renderResponse.plan.inputs.every((input) => normalizePath(input.source).startsWith(normalizePath(packageDirectory)))) {
    throw new Error(`Sample project render did not use packaged media inputs: ${renderResponse.plan.inputs.map((input) => input.source).join(', ')}`);
  }

  return {
    packageDirectory,
    renderOutputPath,
    outputBytes: outputStats.size,
    renderInputCount: renderResponse.plan.inputs.length,
    editedTitle: SAMPLE_VERIFIED_TITLE_TEXT,
  };
}

export function applySampleProjectVerificationEdit(project: EditorProject, updatedAt = DEFAULT_GENERATED_AT): EditorProject {
  return {
    ...project,
    name: `${project.name} - Verified Export`,
    updatedAt,
    assets: project.assets.map((asset) => (
      asset.id === 'asset-sample-title'
        ? { ...asset, source: SAMPLE_VERIFIED_TITLE_TEXT }
        : asset
    )),
    markers: [
      ...project.markers,
      {
        id: 'marker-sample-verification',
        time: 5.25,
        label: 'Verified export',
        color: '#22c55e',
        kind: 'chapter',
        duration: 0.5,
        note: 'Added by the sample pack smoke test before export.',
      },
    ],
  };
}

async function generateSampleMediaSources(sourceMediaDir: string, ffmpegPath: string): Promise<SampleMediaSources> {
  const introVideoPath = join(sourceMediaDir, 'danbi-sample-intro.mp4');
  const brollVideoPath = join(sourceMediaDir, 'danbi-sample-broll.mp4');
  const musicPath = join(sourceMediaDir, 'danbi-sample-tone.wav');

  await runSampleMediaCommand(ffmpegPath, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=640x360:rate=24:duration=3',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '30',
    '-pix_fmt',
    'yuv420p',
    introVideoPath,
  ]);
  await runSampleMediaCommand(ffmpegPath, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x12343b:size=640x360:rate=24:duration=3.5',
    '-vf',
    'geq=r=40+80*X/W:g=120+80*Y/H:b=160+60*(1-X/W)',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '30',
    '-pix_fmt',
    'yuv420p',
    brollVideoPath,
  ]);
  await runSampleMediaCommand(ffmpegPath, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=330:duration=6',
    '-af',
    'volume=0.18',
    '-c:a',
    'pcm_s16le',
    musicPath,
  ]);

  return {
    introVideoPath,
    brollVideoPath,
    musicPath,
  };
}

async function buildSampleMediaCaches(
  files: EditorNativeImportedMediaFile[],
  cacheRoot: string,
): Promise<Record<string, MediaCacheManifest>> {
  const entries = await Promise.all(files.map(async (file) => {
    const analysis = await analyzeMediaFile(file.renderPath, file.mimeType);
    const cache = await createMediaCache({
      filePath: file.renderPath,
      mimeType: file.mimeType,
      analysis,
      cacheRoot,
      publicRoot: '/sample-pack/cache/media',
      waveformSampleCount: 48,
    });

    return [file.originalName, cache] as const;
  }));

  return Object.fromEntries(entries);
}

export function buildDanbiSampleProjectFromImportedMedia(
  importedFiles: EditorNativeImportedMediaFile[],
  mediaCaches: Record<string, MediaCacheManifest>,
  updatedAt: string,
): EditorProject {
  const intro = findImportedFile(importedFiles, 'danbi-sample-intro.mp4');
  const broll = findImportedFile(importedFiles, 'danbi-sample-broll.mp4');
  const music = findImportedFile(importedFiles, 'danbi-sample-tone.wav');

  return {
    id: SAMPLE_PROJECT_ID,
    schemaVersion: 2,
    name: SAMPLE_PROJECT_TITLE,
    fps: 24,
    width: 640,
    height: 360,
    duration: 6,
    updatedAt,
    assets: [
      {
        id: 'asset-sample-intro',
        name: 'Generated intro pattern',
        kind: 'video',
        source: intro.source,
        renderPath: intro.renderPath,
        mediaCache: mediaCaches[intro.originalName],
        duration: intro.duration ?? 3,
        width: intro.width ?? 640,
        height: intro.height ?? 360,
        fps: intro.fps ?? 24,
        metadata: stripUndefinedMetadata(intro.metadata),
      },
      {
        id: 'asset-sample-broll',
        name: 'Generated color pass',
        kind: 'video',
        source: broll.source,
        renderPath: broll.renderPath,
        mediaCache: mediaCaches[broll.originalName],
        duration: broll.duration ?? 3.5,
        width: broll.width ?? 640,
        height: broll.height ?? 360,
        fps: broll.fps ?? 24,
        metadata: stripUndefinedMetadata(broll.metadata),
      },
      {
        id: 'asset-sample-music',
        name: 'Generated guide tone',
        kind: 'audio',
        source: music.source,
        renderPath: music.renderPath,
        mediaCache: mediaCaches[music.originalName],
        duration: music.duration ?? 6,
        metadata: stripUndefinedMetadata(music.metadata),
      },
      {
        id: 'asset-sample-title',
        name: 'Sample title',
        kind: 'text',
        source: SAMPLE_TITLE_TEXT,
        duration: 2.25,
      },
    ],
    tracks: [
      {
        id: 'track-sample-video',
        name: 'V1 Story',
        kind: 'video',
        muted: false,
        solo: false,
        syncLocked: false,
        volumeDb: 0,
        pan: 0,
        locked: false,
        clips: [
          createClip({
            id: 'clip-sample-intro',
            assetId: 'asset-sample-intro',
            trackId: 'track-sample-video',
            name: 'Generated intro',
            kind: 'video',
            start: 0,
            duration: 3,
            color: '#38bdf8',
            transitionOut: {
              id: 'transition-sample-crossfade',
              type: 'crossfade',
              duration: 0.5,
              easing: 'easeInOut',
              parameters: { preserveAudio: true },
            },
            keyframes: [
              { id: 'kf-sample-scale-0', property: 'scale', time: 0, value: 1, easing: 'smooth' },
              { id: 'kf-sample-scale-1', property: 'scale', time: 3, value: 1.04, easing: 'smooth' },
            ],
          }),
          createClip({
            id: 'clip-sample-broll',
            assetId: 'asset-sample-broll',
            trackId: 'track-sample-video',
            name: 'Color pass b-roll',
            kind: 'video',
            start: 2.5,
            duration: 3.5,
            color: '#22c55e',
            effects: [
              {
                id: 'effect-sample-color',
                type: 'color',
                label: 'Clean contrast',
                enabled: true,
                parameters: {
                  brightness: 0.02,
                  contrast: 1.08,
                  saturation: 1.12,
                },
              },
            ],
          }),
        ],
      },
      {
        id: 'track-sample-title',
        name: 'T1 Titles',
        kind: 'text',
        muted: false,
        solo: false,
        syncLocked: false,
        volumeDb: 0,
        pan: 0,
        locked: false,
        clips: [
          createClip({
            id: 'clip-sample-title',
            assetId: 'asset-sample-title',
            trackId: 'track-sample-title',
            name: 'Opening title',
            kind: 'text',
            start: 0.25,
            duration: 2.25,
            color: '#f8fafc',
            effects: [
              {
                id: 'effect-sample-title-style',
                type: 'caption',
                label: 'Readable title',
                enabled: true,
                parameters: {
                  titleStyle: true,
                  fontSize: 42,
                  fontColor: '#ffffff',
                  boxEnabled: true,
                  boxColor: '#000000',
                  boxOpacity: 0.78,
                  position: 'middle',
                  align: 'center',
                },
              },
            ],
          }),
        ],
      },
      {
        id: 'track-sample-audio',
        name: 'A1 Guide tone',
        kind: 'audio',
        muted: false,
        solo: false,
        syncLocked: false,
        volumeDb: -8,
        pan: 0,
        locked: false,
        clips: [
          createClip({
            id: 'clip-sample-music',
            assetId: 'asset-sample-music',
            trackId: 'track-sample-audio',
            name: 'Guide tone bed',
            kind: 'audio',
            start: 0,
            duration: 6,
            color: '#a3e635',
            effects: [
              {
                id: 'effect-sample-audio-gain',
                type: 'audio',
                label: 'Export-safe gain',
                enabled: true,
                parameters: { gainDb: -6 },
              },
            ],
          }),
        ],
      },
    ],
    markers: [
      {
        id: 'marker-sample-open',
        time: 0,
        label: 'Open sample',
        color: '#22c55e',
        kind: 'chapter',
        duration: 1,
        note: 'Check media bin, source monitor, and first clip.',
      },
      {
        id: 'marker-sample-transition',
        time: 2.5,
        label: 'Crossfade',
        color: '#f59e0b',
        kind: 'todo',
        duration: 0.5,
        note: 'Inspect the overlap transition and render preflight.',
      },
    ],
    captions: [
      {
        id: 'caption-sample-intro',
        start: 0.75,
        end: 2.3,
        text: SAMPLE_CAPTION_TEXT,
        speaker: 'Danbi',
        confidence: 1,
        style: {
          ...defaultCaptionStyle(),
          fontSize: 20,
          boxEnabled: true,
          position: 'bottom',
          align: 'center',
        },
      },
      {
        id: 'caption-sample-export',
        start: 3.1,
        end: 5.3,
        text: 'This sample verifies package import and FFmpeg export.',
        speaker: 'Danbi',
        confidence: 1,
        style: {
          ...defaultCaptionStyle(),
          fontSize: 18,
          boxEnabled: true,
          position: 'bottom',
          align: 'center',
        },
      },
    ],
    automation: [
      {
        id: 'rule-sample-before-export',
        name: 'Before export check',
        provider: 'local',
        trigger: 'before-export',
        targetTrackIds: ['track-sample-video', 'track-sample-audio'],
        parameters: {
          captions: true,
          loudnessLufs: -14,
          colorMatch: true,
        },
      },
    ],
    plugins: [
      {
        id: 'plugin-ffmpeg-renderer',
        name: 'FFmpeg Renderer',
        version: '0.1.0',
        entry: 'plugins/ffmpeg-renderer/index.ts',
        permissions: ['filesystem', 'render', 'project'],
        contributes: ['exporter', 'transition'],
      },
    ],
    exportProfiles: [
      {
        id: SAMPLE_EXPORT_PROFILE_ID,
        label: 'Sample H.264 360p',
        purpose: 'proxy',
        container: 'mp4',
        codec: 'h264',
        width: 640,
        height: 360,
        fps: 24,
        videoBitrateMbps: 2,
        audioBitrateKbps: 96,
        ffmpegPreset: 'ultrafast',
        crf: 28,
      },
    ],
  };
}

function assertSampleFfmpegReady(ffmpegPath: string | undefined, encoders: string[]): void {
  if (!ffmpegPath) {
    throw new Error('Sample project pack requires FFmpeg. Set FFMPEG_PATH or package resources/ffmpeg/ffmpeg.');
  }
  if (!encoders.includes('libx264')) {
    throw new Error('Sample project pack requires FFmpeg libx264 encoder.');
  }
}

function assertSampleMediaReady(project: EditorProject): void {
  const report = buildMediaHealthReport(project);
  const blocking = report.issues.filter((issue) => issue.severity === 'blocked');
  const cacheWarnings = report.issues.filter((issue) => issue.action === 'cache');

  if (blocking.length > 0 || cacheWarnings.length > 0) {
    throw new Error(`Sample media health is not ready: ${report.issues.map((issue) => issue.message).join('; ')}`);
  }
}

function assertSamplePackageExport(exported: EditorProjectPackageExportResponse): void {
  const failed = exported.copiedMedia.find((entry) => entry.status !== 'copied');
  if (failed) {
    throw new Error(`Sample package media copy failed: ${failed.originalPath} -> ${failed.status}`);
  }
  if (
    !exported.mediaManifest
    || exported.mediaManifest.missingCount > 0
    || exported.mediaManifest.volatileCount > 0
    || exported.mediaManifest.externalCount > 0
    || exported.mediaManifest.copyFailedCount > 0
  ) {
    throw new Error(`Sample package manifest is not bundle-ready: ${JSON.stringify(exported.mediaManifest)}`);
  }
  if (exported.copiedMedia.length < 10) {
    throw new Error(`Sample package copied too few media references: ${exported.copiedMedia.length}`);
  }
}

function buildTutorialMarkdown(): string {
  return [
    '# Danbi Studio Getting Started Sample',
    '',
    'This sample pack is generated locally from synthetic FFmpeg media, so it has no third-party content license dependency.',
    '',
    'Suggested verification flow:',
    '',
    '1. Import `project.danbi-project.json` from this folder.',
    '2. Check the Media Bin for two video assets, one guide tone, thumbnails, proxy, and waveform cache.',
    '3. Open the timeline and inspect the title track, caption burn-in, chapter markers, and crossfade overlap.',
    '4. Change the title text or move the second clip by a few frames.',
    '5. Export with the `Sample H.264 360p` profile.',
    '',
    'Automated release smoke performs the same import-edit-export path and verifies the rendered MP4 is non-empty.',
    '',
  ].join('\n');
}

function findImportedFile(files: EditorNativeImportedMediaFile[], originalName: string): EditorNativeImportedMediaFile {
  const file = files.find((candidate) => candidate.originalName === originalName);
  if (!file) {
    throw new Error(`Sample imported media is missing: ${originalName}`);
  }

  return file;
}

function stripUndefinedMetadata(
  metadata: EditorNativeImportedMediaFile['metadata'],
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(metadata ?? {}).filter((entry): entry is [string, string | number | boolean] => (
      typeof entry[1] === 'string' ||
      typeof entry[1] === 'number' ||
      typeof entry[1] === 'boolean'
    )),
  );
}

export function runSampleMediaCommand(
  command: string,
  args: string[],
  timeoutMs = readSampleMediaCommandTimeoutMs(),
): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
    });
    let stderr = '';
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      callback();
    };
    timeout = setTimeout(() => {
      finish(() => {
        child.kill('SIGTERM');
        reject(new Error(`${command} ${args.join(' ')} timed out after ${timeoutMs}ms.`));
      });
    }, timeoutMs);

    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4000);
    });
    child.on('error', (error) => finish(() => reject(error)));
    child.on('close', (code) => {
      finish(() => {
        if (code === 0) {
          resolveRun();
          return;
        }

        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}: ${stderr.slice(-2000)}`));
      });
    });
  });
}

function readSampleMediaCommandTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.DANBI_SAMPLE_MEDIA_COMMAND_TIMEOUT_MS ?? '', 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SAMPLE_MEDIA_COMMAND_TIMEOUT_MS;
  }

  return Math.round(Math.min(MAX_SAMPLE_MEDIA_COMMAND_TIMEOUT_MS, Math.max(MIN_SAMPLE_MEDIA_COMMAND_TIMEOUT_MS, parsed)));
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}
