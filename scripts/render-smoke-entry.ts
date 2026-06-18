import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runFfmpegEngineRender } from '../src/electron/main/ffmpeg-render-engine';
import { importNativeMediaFilePaths } from '../src/electron/main/native-media-import-engine';
import { exportProjectPackageFolder, importProjectPackageFolder } from '../src/electron/main/project-package-engine';
import { createClip } from '../src/lib/editor/project';
import { analyzeMediaFile } from '../src/server/editor/media-analyzer';
import { createMediaCache } from '../src/lib/editor/media-cache';
import { buildMediaHealthReport } from '../src/lib/editor/media-health';
import { detectFfmpegCapabilities } from '../src/lib/editor/ffmpeg-capabilities';
import type {
  EditorNativeImportedMediaFile,
  EditorProjectPackageExportResponse,
  EditorProjectPackageImportResponse,
} from '../src/electron/shared/ipc-contract';
import type { EditorProject, MediaCacheManifest } from '../src/lib/editor/types';

const profileId = 'profile-render-smoke-h264';
const rootDir = join(process.cwd(), '.danbi', 'render-smoke');
const sourceMediaDir = join(rootDir, 'source-media');
const importSourceRoot = join(rootDir, 'import-root');
const cacheRoot = join(rootDir, 'cache');
const packageDirectory = join(rootDir, 'portable-package');
const outputDir = join(rootDir, 'output');
const videoSourcePath = join(sourceMediaDir, 'sample-video.mp4');
const rotatedVideoSourcePath = join(sourceMediaDir, 'rotated-sample-video.mp4');
const anamorphicVideoSourcePath = join(sourceMediaDir, 'anamorphic-sample-video.mp4');
const imageSourcePath = join(sourceMediaDir, 'sample-still-image.png');
const exifImageSourcePath = join(sourceMediaDir, 'exif-oriented-still-image.jpg');
const alphaOverlayImageSourcePath = join(sourceMediaDir, 'alpha-overlay-image.png');
const audioSourcePath = join(sourceMediaDir, 'sample-audio.wav');
const outputPath = join(outputDir, 'render-smoke.mp4');
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
const smokeTitleText = 'DANBI\nSTUDIO';
const smokeCaptionText = 'CAPTION\nCHECK';

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  await rm(sourceMediaDir, { recursive: true, force: true });
  await rm(importSourceRoot, { recursive: true, force: true });
  await rm(cacheRoot, { recursive: true, force: true });
  await rm(packageDirectory, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await rm(outputPath, { force: true });
  await mkdir(sourceMediaDir, { recursive: true });

  await generateSampleVideo();
  await generateRotatedSampleVideo();
  await generateAnamorphicSampleVideo();
  await generateSampleImage();
  await generateExifOrientedSampleImage();
  await generateAlphaOverlayImage();
  await generateSampleAudio();

  const capabilities = await detectFfmpegCapabilities(ffmpegPath);
  if (!capabilities.encoders.includes('libx264')) {
    throw new Error('FFmpeg render smoke requires the libx264 encoder.');
  }

  const importedMedia = await importNativeMediaFilePaths([videoSourcePath, rotatedVideoSourcePath, anamorphicVideoSourcePath, imageSourcePath, exifImageSourcePath, alphaOverlayImageSourcePath, audioSourcePath], {
    sourceRoot: importSourceRoot,
    queueCache: false,
  });
  assertImportedMedia(importedMedia.files);

  const mediaCaches = await buildImportedMediaCaches(importedMedia.files);
  assertMediaCaches(mediaCaches);
  await assertRotatedMediaOrientation(importedMedia.files, mediaCaches);
  await assertAnamorphicMediaDisplay(importedMedia.files, mediaCaches);
  await assertStillImageMediaDisplay(importedMedia.files, mediaCaches);
  await assertExifImageMediaDisplay(importedMedia.files, mediaCaches);
  await assertAlphaOverlayImageMediaDisplay(importedMedia.files, mediaCaches);

  const project = createRenderSmokeProject(importedMedia.files, mediaCaches);
  assertMediaHealthReady(project);
  const exportedPackage = await exportProjectPackageFolder({
    project,
    packageDirectory,
    sourceRoot: importSourceRoot,
    exportedAt: '2026-06-14T00:00:00.000Z',
  });
  assertExportedPackage(exportedPackage);
  const importedPackage = await importProjectPackageFolder({ packageDirectory });
  assertImportedPackage(importedPackage, packageDirectory);

  const response = await runFfmpegEngineRender({
    project: importedPackage.project,
    profileId,
    outputPath,
    encoderPreference: 'software',
    capabilities,
    sampleTimes: [0, 1, 2, 3, 4, 5, 5.999],
  });

  if (response.status !== 'completed') {
    throw new Error(`Unexpected render status: ${response.status}`);
  }
  if (response.preflight.blockedCount > 0 || response.preflight.warningCount > 0) {
    throw new Error(`Expected clean render preflight, got blocked=${response.preflight.blockedCount}, warnings=${response.preflight.warningCount}`);
  }

  const outputStats = await stat(outputPath);
  if (outputStats.size <= 0) {
    throw new Error(`Render output is empty: ${outputPath}`);
  }

  const probe = await ffprobeJson(outputPath);
  assertProbe(probe);
  assertRenderPlanContainsEditableLayers(response.plan.filterGraph);
  assertRenderPlanUsesPortablePackage(response.plan.inputs, packageDirectory);
  await assertRotatedFramePixelOrientation(outputPath, 'rotated render segment', 320, 180, 1.2);
  await assertAnamorphicRenderSegment(outputPath);
  await assertStillImageRenderSegment(outputPath);
  await assertExifImageRenderSegment(outputPath);
  await assertAlphaOverlayRenderSegment(outputPath);
  const overlayStats = await sampleFrameBrightness(outputPath, 1);
  if (overlayStats.brightPixelRatio < 0.005) {
    throw new Error(`Render output did not contain enough bright title/caption pixels: ${overlayStats.brightPixelRatio}`);
  }

  console.log(`Render smoke passed: ${outputPath}`);
  console.log(`Native import check: ${importedMedia.files.length} files copied and analyzed`);
  console.log('Media cache check: video/image thumbnails, video proxies, rotated orientation, anamorphic display pixels, and audio waveform generated');
  console.log(`Portable package check: ${exportedPackage.copiedMedia.length} media references copied and re-rendered`);
  console.log(`Output: ${probe.format.duration}s, ${outputStats.size} bytes, encoder ${response.plan.videoEncoder.encoder}`);
  console.log(`Multi-line title/caption pixel check: ${(overlayStats.brightPixelRatio * 100).toFixed(2)}% bright pixels`);
  console.log('Rotated media check: 96x160 coded MP4 imported, cached, packaged, and rendered with oriented pixels as 160x96 display media');
  console.log('Anamorphic media check: 160x180 SAR 2:1 MP4 imported, cached, packaged, and rendered as 320x180 square-pixel display media');
  console.log('Still image check: PNG image imported, thumbnailed, packaged, looped, and rendered as a timeline visual layer');
  console.log('EXIF image check: JPEG orientation metadata imported, thumbnailed, packaged, and rendered upright as a timeline visual layer');
  console.log('Alpha PNG check: transparent PNG overlay preserved padded alpha over a still-image base in final render');
  console.log('Preflight check: ready with no blocked issues or warnings');
}

async function generateSampleVideo(): Promise<void> {
  await run(ffmpegPath, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x101820:size=320x180:rate=24:duration=2',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '30',
    '-pix_fmt',
    'yuv420p',
    videoSourcePath,
  ]);
}

async function generateSampleAudio(): Promise<void> {
  await run(ffmpegPath, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=6',
    '-c:a',
    'pcm_s16le',
    audioSourcePath,
  ]);
}

async function generateRotatedSampleVideo(): Promise<void> {
  const basePath = join(sourceMediaDir, 'rotated-sample-video-base.mp4');
  await run(ffmpegPath, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x18202a:size=96x160:rate=24:duration=2',
    '-vf',
    'drawbox=x=0:y=0:w=96:h=36:color=0xff3366:t=fill,drawbox=x=0:y=124:w=96:h=36:color=0x33ff99:t=fill',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '30',
    '-pix_fmt',
    'yuv420p',
    basePath,
  ]);

  await run(ffmpegPath, [
    '-y',
    '-display_rotation',
    '90',
    '-i',
    basePath,
    '-c',
    'copy',
    '-movflags',
    'faststart',
    rotatedVideoSourcePath,
  ]);
}

async function generateAnamorphicSampleVideo(): Promise<void> {
  await run(ffmpegPath, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x203040:size=160x180:rate=24:duration=3',
    '-vf',
    'drawbox=x=0:y=0:w=40:h=180:color=0xff3366:t=fill,drawbox=x=120:y=0:w=40:h=180:color=0x33ff99:t=fill,setsar=2/1',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '30',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    'faststart',
    anamorphicVideoSourcePath,
  ]);
}

async function generateSampleImage(): Promise<void> {
  await run(ffmpegPath, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x203040:size=320x180',
    '-vf',
    'drawbox=x=0:y=0:w=80:h=180:color=0xff3366:t=fill,drawbox=x=240:y=0:w=80:h=180:color=0x33ff99:t=fill',
    '-frames:v',
    '1',
    imageSourcePath,
  ]);
}

async function generateExifOrientedSampleImage(): Promise<void> {
  const basePath = join(sourceMediaDir, 'exif-oriented-still-image-base.jpg');
  await run(ffmpegPath, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x203040:size=96x160',
    '-vf',
    'drawbox=x=0:y=0:w=96:h=36:color=0xff3366:t=fill,drawbox=x=0:y=124:w=96:h=36:color=0x33ff99:t=fill',
    '-frames:v',
    '1',
    basePath,
  ]);

  await writeFile(exifImageSourcePath, injectJpegExifOrientation(await readFile(basePath), 6));
}

async function generateAlphaOverlayImage(): Promise<void> {
  await run(ffmpegPath, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=black@0.0:size=100x100',
    '-vf',
    'format=rgba,drawbox=x=35:y=0:w=30:h=100:color=0x3366ff@1:t=fill',
    '-frames:v',
    '1',
    '-pix_fmt',
    'rgba',
    alphaOverlayImageSourcePath,
  ]);
}

function createRenderSmokeProject(
  importedFiles: EditorNativeImportedMediaFile[],
  mediaCaches: Record<string, MediaCacheManifest>,
): EditorProject {
  const now = new Date().toISOString();
  const importedVideo = findImportedFile(importedFiles, 'sample-video.mp4');
  const importedRotatedVideo = findImportedFile(importedFiles, 'rotated-sample-video.mp4');
  const importedAnamorphicVideo = findImportedFile(importedFiles, 'anamorphic-sample-video.mp4');
  const importedImage = findImportedFile(importedFiles, 'sample-still-image.png');
  const importedExifImage = findImportedFile(importedFiles, 'exif-oriented-still-image.jpg');
  const importedAlphaOverlayImage = findImportedFile(importedFiles, 'alpha-overlay-image.png');
  const importedAudio = findImportedFile(importedFiles, 'sample-audio.wav');

  return {
    id: 'danbi-render-smoke',
    schemaVersion: 2,
    name: 'Danbi Render Smoke',
    fps: 24,
    width: 320,
    height: 180,
    duration: 6,
    updatedAt: now,
    assets: [
      {
        id: 'asset-smoke-video',
        name: 'Generated test video',
        kind: 'video',
        source: importedVideo.source,
        renderPath: importedVideo.renderPath,
        mediaCache: mediaCaches[importedVideo.originalName],
        duration: importedVideo.duration ?? 2,
        width: importedVideo.width ?? 320,
        height: importedVideo.height ?? 180,
        fps: importedVideo.fps ?? 24,
        metadata: {
          ...stripUndefinedMetadata(importedVideo.metadata),
          hasAudio: false,
        },
      },
      {
        id: 'asset-smoke-rotated-video',
        name: 'Generated rotated test video',
        kind: 'video',
        source: importedRotatedVideo.source,
        renderPath: importedRotatedVideo.renderPath,
        mediaCache: mediaCaches[importedRotatedVideo.originalName],
        duration: importedRotatedVideo.duration ?? 2,
        width: importedRotatedVideo.width ?? 160,
        height: importedRotatedVideo.height ?? 96,
        fps: importedRotatedVideo.fps ?? 24,
        metadata: {
          ...stripUndefinedMetadata(importedRotatedVideo.metadata),
          hasAudio: false,
        },
      },
      {
        id: 'asset-smoke-anamorphic-video',
        name: 'Generated anamorphic test video',
        kind: 'video',
        source: importedAnamorphicVideo.source,
        renderPath: importedAnamorphicVideo.renderPath,
        mediaCache: mediaCaches[importedAnamorphicVideo.originalName],
        duration: importedAnamorphicVideo.duration ?? 3,
        width: importedAnamorphicVideo.width ?? 320,
        height: importedAnamorphicVideo.height ?? 180,
        fps: importedAnamorphicVideo.fps ?? 24,
        metadata: {
          ...stripUndefinedMetadata(importedAnamorphicVideo.metadata),
          hasAudio: false,
        },
      },
      {
        id: 'asset-smoke-image',
        name: 'Generated still test image',
        kind: 'image',
        source: importedImage.source,
        renderPath: importedImage.renderPath,
        mediaCache: mediaCaches[importedImage.originalName],
        duration: 1,
        width: importedImage.width ?? 320,
        height: importedImage.height ?? 180,
        metadata: {
          ...stripUndefinedMetadata(importedImage.metadata),
          hasAudio: false,
        },
      },
      {
        id: 'asset-smoke-exif-image',
        name: 'Generated EXIF oriented test image',
        kind: 'image',
        source: importedExifImage.source,
        renderPath: importedExifImage.renderPath,
        mediaCache: mediaCaches[importedExifImage.originalName],
        duration: 1,
        width: importedExifImage.width ?? 160,
        height: importedExifImage.height ?? 96,
        metadata: {
          ...stripUndefinedMetadata(importedExifImage.metadata),
          hasAudio: false,
        },
      },
      {
        id: 'asset-smoke-alpha-overlay-image',
        name: 'Generated alpha overlay test image',
        kind: 'image',
        source: importedAlphaOverlayImage.source,
        renderPath: importedAlphaOverlayImage.renderPath,
        mediaCache: mediaCaches[importedAlphaOverlayImage.originalName],
        duration: 1,
        width: importedAlphaOverlayImage.width ?? 100,
        height: importedAlphaOverlayImage.height ?? 100,
        metadata: {
          ...stripUndefinedMetadata(importedAlphaOverlayImage.metadata),
          hasAudio: false,
        },
      },
      {
        id: 'asset-smoke-audio',
        name: 'Generated test tone',
        kind: 'audio',
        source: importedAudio.source,
        renderPath: importedAudio.renderPath,
        mediaCache: mediaCaches[importedAudio.originalName],
        duration: importedAudio.duration ?? 2,
        metadata: stripUndefinedMetadata(importedAudio.metadata),
      },
      {
        id: 'asset-smoke-title',
        name: 'Smoke title text',
        kind: 'text',
        source: smokeTitleText,
        duration: 3,
      },
    ],
    tracks: [
      {
        id: 'track-smoke-video',
        name: 'Smoke Video',
        kind: 'video',
        muted: false,
        solo: false,
        syncLocked: false,
        volumeDb: 0,
        pan: 0,
        locked: false,
        clips: [
          createClip({
            id: 'clip-smoke-video',
            assetId: 'asset-smoke-video',
            trackId: 'track-smoke-video',
            name: 'Generated test video',
            kind: 'video',
            start: 0,
            duration: 1,
            color: '#38bdf8',
          }),
          createClip({
            id: 'clip-smoke-rotated-video',
            assetId: 'asset-smoke-rotated-video',
            trackId: 'track-smoke-video',
            name: 'Generated rotated test video',
            kind: 'video',
            start: 1,
            duration: 1,
            color: '#fb7185',
          }),
          createClip({
            id: 'clip-smoke-anamorphic-video',
            assetId: 'asset-smoke-anamorphic-video',
            trackId: 'track-smoke-video',
            name: 'Generated anamorphic test video',
            kind: 'video',
            start: 2,
            duration: 1,
            color: '#f59e0b',
          }),
          createClip({
            id: 'clip-smoke-image',
            assetId: 'asset-smoke-image',
            trackId: 'track-smoke-video',
            name: 'Generated still test image',
            kind: 'image',
            start: 3,
            duration: 1,
            color: '#a78bfa',
          }),
          createClip({
            id: 'clip-smoke-exif-image',
            assetId: 'asset-smoke-exif-image',
            trackId: 'track-smoke-video',
            name: 'Generated EXIF oriented test image',
            kind: 'image',
            start: 4,
            duration: 1,
            color: '#c084fc',
          }),
          createClip({
            id: 'clip-smoke-image-alpha-base',
            assetId: 'asset-smoke-image',
            trackId: 'track-smoke-video',
            name: 'Generated still image alpha base',
            kind: 'image',
            start: 5,
            duration: 1,
            color: '#a78bfa',
          }),
        ],
      },
      {
        id: 'track-smoke-alpha-overlay',
        name: 'Smoke Alpha Overlay',
        kind: 'video',
        muted: false,
        solo: false,
        syncLocked: false,
        volumeDb: 0,
        pan: 0,
        locked: false,
        clips: [
          createClip({
            id: 'clip-smoke-alpha-overlay',
            assetId: 'asset-smoke-alpha-overlay-image',
            trackId: 'track-smoke-alpha-overlay',
            name: 'Generated alpha overlay image',
            kind: 'image',
            start: 5,
            duration: 1,
            color: '#60a5fa',
          }),
        ],
      },
      {
        id: 'track-smoke-title',
        name: 'Smoke Title',
        kind: 'text',
        muted: false,
        solo: false,
        syncLocked: false,
        volumeDb: 0,
        pan: 0,
        locked: false,
        clips: [
          createClip({
            id: 'clip-smoke-title',
            assetId: 'asset-smoke-title',
            trackId: 'track-smoke-title',
            name: 'Smoke title text',
            kind: 'text',
            start: 0,
            duration: 3,
            color: '#f8fafc',
            effects: [
              {
                id: 'effect-smoke-title-style',
                type: 'caption',
                label: 'Title style',
                enabled: true,
                parameters: {
                  titleStyle: true,
                  fontSize: 34,
                  fontColor: '#ffffff',
                  boxEnabled: true,
                  boxColor: '#000000',
                  boxOpacity: 0.85,
                  position: 'middle',
                  align: 'center',
                },
              },
            ],
          }),
        ],
      },
      {
        id: 'track-smoke-audio',
        name: 'Smoke Audio',
        kind: 'audio',
        muted: false,
        solo: false,
        syncLocked: false,
        volumeDb: 0,
        pan: 0,
        locked: false,
        clips: [
          createClip({
            id: 'clip-smoke-audio',
            assetId: 'asset-smoke-audio',
            trackId: 'track-smoke-audio',
            name: 'Generated test tone',
            kind: 'audio',
            start: 0,
            duration: 6,
            color: '#22c55e',
          }),
        ],
      },
    ],
    markers: [],
    captions: [
      {
        id: 'caption-smoke-bottom',
        start: 0.55,
        end: 2.8,
        text: smokeCaptionText,
        speaker: 'Danbi',
        confidence: 1,
        style: {
          fontSize: 20,
          fontColor: '#ffffff',
          boxEnabled: true,
          boxColor: '#000000',
          boxOpacity: 0.85,
          position: 'bottom',
          align: 'center',
        },
      },
    ],
    automation: [],
    plugins: [],
    exportProfiles: [
      {
        id: profileId,
        label: 'Render Smoke H.264',
        purpose: 'proxy',
        container: 'mp4',
        codec: 'h264',
        width: 320,
        height: 180,
        fps: 24,
        videoBitrateMbps: 1,
        audioBitrateKbps: 96,
        ffmpegPreset: 'ultrafast',
        crf: 30,
      },
    ],
  };
}

function findImportedFile(importedFiles: EditorNativeImportedMediaFile[], originalName: string): EditorNativeImportedMediaFile {
  const importedFile = importedFiles.find((file) => file.originalName === originalName);
  if (!importedFile) {
    throw new Error(`Imported media not found: ${originalName}`);
  }

  return importedFile;
}

async function ffprobeJson(filePath: string): Promise<ProbeResult> {
  const stdout = await runCapture(ffprobePath, [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);

  return JSON.parse(stdout) as ProbeResult;
}

function assertImportedMedia(files: EditorNativeImportedMediaFile[]): void {
  const importedVideo = findImportedFile(files, 'sample-video.mp4');
  const importedRotatedVideo = findImportedFile(files, 'rotated-sample-video.mp4');
  const importedAnamorphicVideo = findImportedFile(files, 'anamorphic-sample-video.mp4');
  const importedImage = findImportedFile(files, 'sample-still-image.png');
  const importedExifImage = findImportedFile(files, 'exif-oriented-still-image.jpg');
  const importedAlphaOverlayImage = findImportedFile(files, 'alpha-overlay-image.png');
  const importedAudio = findImportedFile(files, 'sample-audio.wav');

  if (files.length !== 7) {
    throw new Error(`Expected 7 imported media files, received ${files.length}.`);
  }

  for (const imported of [importedVideo, importedRotatedVideo, importedAnamorphicVideo, importedImage, importedExifImage, importedAlphaOverlayImage]) {
    if (!imported.source.startsWith('/imports/') || !imported.renderPath.includes('.danbi')) {
      throw new Error(`Imported video did not receive durable preview/render paths: ${imported.source}, ${imported.renderPath}`);
    }
  }

  if (!importedVideo.metadata?.hasVideo || importedVideo.metadata?.hasAudio !== false || importedVideo.width !== 320 || importedVideo.height !== 180) {
    throw new Error(`Imported video analysis was incomplete: ${JSON.stringify(importedVideo.metadata)}`);
  }

  if (
    !importedRotatedVideo.metadata?.hasVideo ||
    importedRotatedVideo.metadata?.hasAudio !== false ||
    importedRotatedVideo.width !== 160 ||
    importedRotatedVideo.height !== 96 ||
    importedRotatedVideo.metadata.rotation !== 90 ||
    importedRotatedVideo.metadata.codedWidth !== 96 ||
    importedRotatedVideo.metadata.codedHeight !== 160
  ) {
    throw new Error(`Imported rotated video analysis was incomplete: ${JSON.stringify(importedRotatedVideo.metadata)}`);
  }

  if (
    !importedAnamorphicVideo.metadata?.hasVideo ||
    importedAnamorphicVideo.metadata?.hasAudio !== false ||
    importedAnamorphicVideo.width !== 320 ||
    importedAnamorphicVideo.height !== 180 ||
    importedAnamorphicVideo.metadata.codedWidth !== 160 ||
    importedAnamorphicVideo.metadata.codedHeight !== 180 ||
    importedAnamorphicVideo.metadata.sampleAspectRatio !== '2:1' ||
    importedAnamorphicVideo.metadata.displayAspectRatio !== '16:9' ||
    importedAnamorphicVideo.metadata.pixelAspectRatio !== 2
  ) {
    throw new Error(`Imported anamorphic video analysis was incomplete: ${JSON.stringify(importedAnamorphicVideo.metadata)}`);
  }

  if (!importedImage.metadata?.hasVideo || importedImage.metadata?.hasAudio !== false || importedImage.width !== 320 || importedImage.height !== 180) {
    throw new Error(`Imported still image analysis was incomplete: ${JSON.stringify(importedImage.metadata)}`);
  }

  if (
    !importedExifImage.metadata?.hasVideo ||
    importedExifImage.metadata?.hasAudio !== false ||
    importedExifImage.width !== 160 ||
    importedExifImage.height !== 96 ||
    importedExifImage.metadata.codedWidth !== 96 ||
    importedExifImage.metadata.codedHeight !== 160 ||
    importedExifImage.metadata.exifOrientation !== 6 ||
    importedExifImage.metadata.rotation !== 90
  ) {
    throw new Error(`Imported EXIF oriented image analysis was incomplete: ${JSON.stringify(importedExifImage.metadata)}`);
  }

  if (!importedAlphaOverlayImage.metadata?.hasVideo || importedAlphaOverlayImage.metadata?.hasAudio !== false || importedAlphaOverlayImage.width !== 100 || importedAlphaOverlayImage.height !== 100) {
    throw new Error(`Imported alpha overlay image analysis was incomplete: ${JSON.stringify(importedAlphaOverlayImage.metadata)}`);
  }

  if (!importedAudio.metadata?.hasAudio || importedAudio.duration === undefined || importedAudio.duration < 5.8) {
    throw new Error(`Imported audio analysis was incomplete: ${JSON.stringify(importedAudio.metadata)}`);
  }
}

async function buildImportedMediaCaches(
  files: EditorNativeImportedMediaFile[],
): Promise<Record<string, MediaCacheManifest>> {
  const entries = await Promise.all(files.map(async (file) => {
    const analysis = await analyzeMediaFile(file.renderPath, file.mimeType);
    const manifest = await createMediaCache({
      filePath: file.renderPath,
      mimeType: file.mimeType,
      analysis,
      cacheRoot,
      publicRoot: '/render-smoke/cache',
      waveformSampleCount: 32,
    });

    return [file.originalName, manifest] as const;
  }));

  return Object.fromEntries(entries);
}

function assertMediaCaches(mediaCaches: Record<string, MediaCacheManifest>): void {
  const videoCache = mediaCaches['sample-video.mp4'];
  const rotatedVideoCache = mediaCaches['rotated-sample-video.mp4'];
  const anamorphicVideoCache = mediaCaches['anamorphic-sample-video.mp4'];
  const imageCache = mediaCaches['sample-still-image.png'];
  const exifImageCache = mediaCaches['exif-oriented-still-image.jpg'];
  const alphaOverlayImageCache = mediaCaches['alpha-overlay-image.png'];
  const audioCache = mediaCaches['sample-audio.wav'];

  if (!videoCache?.thumbnailPath || !videoCache.proxyPath) {
    throw new Error(`Video media cache is incomplete: ${JSON.stringify(videoCache)}`);
  }

  if (!rotatedVideoCache?.thumbnailPath || !rotatedVideoCache.proxyPath) {
    throw new Error(`Rotated video media cache is incomplete: ${JSON.stringify(rotatedVideoCache)}`);
  }

  if (!anamorphicVideoCache?.thumbnailPath || !anamorphicVideoCache.proxyPath) {
    throw new Error(`Anamorphic video media cache is incomplete: ${JSON.stringify(anamorphicVideoCache)}`);
  }

  if (!imageCache?.thumbnailPath || imageCache.proxyPath) {
    throw new Error(`Still image media cache should include a thumbnail and no proxy: ${JSON.stringify(imageCache)}`);
  }

  if (!exifImageCache?.thumbnailPath || exifImageCache.proxyPath) {
    throw new Error(`EXIF oriented image media cache should include a thumbnail and no proxy: ${JSON.stringify(exifImageCache)}`);
  }

  if (!alphaOverlayImageCache?.thumbnailPath || alphaOverlayImageCache.proxyPath) {
    throw new Error(`Alpha overlay image media cache should include a thumbnail and no proxy: ${JSON.stringify(alphaOverlayImageCache)}`);
  }

  if (!audioCache?.waveformPath || !audioCache.waveformPeaks || audioCache.waveformPeaks.length < 8) {
    throw new Error(`Audio media cache is incomplete: ${JSON.stringify(audioCache)}`);
  }

  const warnings = [...videoCache.warnings, ...rotatedVideoCache.warnings, ...anamorphicVideoCache.warnings, ...imageCache.warnings, ...exifImageCache.warnings, ...alphaOverlayImageCache.warnings, ...audioCache.warnings];
  if (warnings.length > 0) {
    throw new Error(`Media cache warnings were not expected: ${warnings.join('; ')}`);
  }
}

async function assertRotatedMediaOrientation(
  files: EditorNativeImportedMediaFile[],
  mediaCaches: Record<string, MediaCacheManifest>,
): Promise<void> {
  const importedRotatedVideo = findImportedFile(files, 'rotated-sample-video.mp4');
  const rotatedVideoCache = mediaCaches[importedRotatedVideo.originalName];

  if (!rotatedVideoCache?.proxyPath || !rotatedVideoCache.thumbnailPath) {
    throw new Error(`Rotated video cache paths were not generated: ${JSON.stringify(rotatedVideoCache)}`);
  }

  assertProbeVideoDimensions(await ffprobeJson(rotatedVideoCache.proxyPath), 'rotated proxy', 160, 96);
  assertProbeVideoDimensions(await ffprobeJson(rotatedVideoCache.thumbnailPath), 'rotated thumbnail', 160, 96);
  await assertRotatedFramePixelOrientation(rotatedVideoCache.proxyPath, 'rotated proxy', 160, 96);
  await assertRotatedFramePixelOrientation(rotatedVideoCache.thumbnailPath, 'rotated thumbnail', 160, 96);
}

async function assertAnamorphicMediaDisplay(
  files: EditorNativeImportedMediaFile[],
  mediaCaches: Record<string, MediaCacheManifest>,
): Promise<void> {
  const importedAnamorphicVideo = findImportedFile(files, 'anamorphic-sample-video.mp4');
  const anamorphicVideoCache = mediaCaches[importedAnamorphicVideo.originalName];

  if (!anamorphicVideoCache?.proxyPath || !anamorphicVideoCache.thumbnailPath) {
    throw new Error(`Anamorphic video cache paths were not generated: ${JSON.stringify(anamorphicVideoCache)}`);
  }

  assertProbeVideoDimensions(await ffprobeJson(anamorphicVideoCache.proxyPath), 'anamorphic proxy', 320, 180);
  assertProbeVideoDimensions(await ffprobeJson(anamorphicVideoCache.thumbnailPath), 'anamorphic thumbnail', 320, 180);
  await assertRedNeutralGreenFramePixelCoverage(anamorphicVideoCache.proxyPath, 'anamorphic proxy', 320, 180);
  await assertRedNeutralGreenFramePixelCoverage(anamorphicVideoCache.thumbnailPath, 'anamorphic thumbnail', 320, 180);
}

async function assertStillImageMediaDisplay(
  files: EditorNativeImportedMediaFile[],
  mediaCaches: Record<string, MediaCacheManifest>,
): Promise<void> {
  const importedImage = findImportedFile(files, 'sample-still-image.png');
  const imageCache = mediaCaches[importedImage.originalName];

  if (!imageCache?.thumbnailPath || imageCache.proxyPath) {
    throw new Error(`Still image cache should have a thumbnail and no proxy: ${JSON.stringify(imageCache)}`);
  }

  assertProbeVideoDimensions(await ffprobeJson(imageCache.thumbnailPath), 'still image thumbnail', 320, 180);
  await assertRedNeutralGreenFramePixelCoverage(imageCache.thumbnailPath, 'still image thumbnail', 320, 180);
}

async function assertExifImageMediaDisplay(
  files: EditorNativeImportedMediaFile[],
  mediaCaches: Record<string, MediaCacheManifest>,
): Promise<void> {
  const importedImage = findImportedFile(files, 'exif-oriented-still-image.jpg');
  const imageCache = mediaCaches[importedImage.originalName];

  if (!imageCache?.thumbnailPath || imageCache.proxyPath) {
    throw new Error(`EXIF oriented image cache should have a thumbnail and no proxy: ${JSON.stringify(imageCache)}`);
  }

  assertProbeVideoDimensions(await ffprobeJson(imageCache.thumbnailPath), 'EXIF oriented image thumbnail', 160, 96);
  await assertGreenNeutralRedFramePixelCoverage(imageCache.thumbnailPath, 'EXIF oriented image thumbnail', 160, 96);
}

async function assertAlphaOverlayImageMediaDisplay(
  files: EditorNativeImportedMediaFile[],
  mediaCaches: Record<string, MediaCacheManifest>,
): Promise<void> {
  const importedImage = findImportedFile(files, 'alpha-overlay-image.png');
  const imageCache = mediaCaches[importedImage.originalName];

  if (!imageCache?.thumbnailPath || imageCache.proxyPath) {
    throw new Error(`Alpha overlay image cache should have a thumbnail and no proxy: ${JSON.stringify(imageCache)}`);
  }

  assertProbeVideoDimensions(await ffprobeJson(imageCache.thumbnailPath), 'alpha overlay image thumbnail', 100, 100);
}

function assertMediaHealthReady(project: EditorProject): void {
  const report = buildMediaHealthReport(project);
  const blockingIssues = report.issues.filter((issue) => issue.severity === 'blocked');
  const cacheWarnings = report.issues.filter((issue) => issue.action === 'cache');

  if (blockingIssues.length > 0 || cacheWarnings.length > 0) {
    throw new Error(`Media health is not ready: ${report.issues.map((issue) => issue.message).join('; ')}`);
  }
}

function assertExportedPackage(exportedPackage: EditorProjectPackageExportResponse): void {
  if (exportedPackage.copiedMedia.length !== 24) {
    throw new Error(`Expected 24 media package copies, received ${exportedPackage.copiedMedia.length}.`);
  }

  const failedCopy = exportedPackage.copiedMedia.find((item) => item.status !== 'copied');
  if (failedCopy) {
    throw new Error(`Portable package media copy failed: ${failedCopy.originalPath} -> ${failedCopy.status}`);
  }

  if (exportedPackage.mediaManifest?.bundleReadyCount !== 24 || exportedPackage.mediaManifest.missingCount !== 0) {
    throw new Error(`Portable package manifest is not fully bundle-ready: ${JSON.stringify(exportedPackage.mediaManifest)}`);
  }
}

function assertImportedPackage(importedPackage: EditorProjectPackageImportResponse, expectedPackageDirectory: string): void {
  const normalizedPackageDirectory = normalizePath(expectedPackageDirectory);
  const videoAsset = importedPackage.project.assets.find((asset) => asset.id === 'asset-smoke-video');
  const rotatedVideoAsset = importedPackage.project.assets.find((asset) => asset.id === 'asset-smoke-rotated-video');
  const anamorphicVideoAsset = importedPackage.project.assets.find((asset) => asset.id === 'asset-smoke-anamorphic-video');
  const imageAsset = importedPackage.project.assets.find((asset) => asset.id === 'asset-smoke-image');
  const exifImageAsset = importedPackage.project.assets.find((asset) => asset.id === 'asset-smoke-exif-image');
  const alphaOverlayImageAsset = importedPackage.project.assets.find((asset) => asset.id === 'asset-smoke-alpha-overlay-image');
  const audioAsset = importedPackage.project.assets.find((asset) => asset.id === 'asset-smoke-audio');

  if (!videoAsset?.renderPath || !rotatedVideoAsset?.renderPath || !anamorphicVideoAsset?.renderPath || !imageAsset?.renderPath || !exifImageAsset?.renderPath || !alphaOverlayImageAsset?.renderPath || !audioAsset?.renderPath) {
    throw new Error('Portable package import did not preserve render paths.');
  }

  for (const asset of [videoAsset, rotatedVideoAsset, anamorphicVideoAsset, imageAsset, exifImageAsset, alphaOverlayImageAsset, audioAsset]) {
    if (!normalizePath(asset.source).startsWith(normalizedPackageDirectory) || !normalizePath(asset.renderPath ?? '').startsWith(normalizedPackageDirectory)) {
      throw new Error(`Portable package import did not rewrite ${asset.id} into the package directory.`);
    }
  }

  if (
    !normalizePath(videoAsset.mediaCache?.proxyPath ?? '').startsWith(normalizedPackageDirectory) ||
    !normalizePath(videoAsset.mediaCache?.thumbnailPath ?? '').startsWith(normalizedPackageDirectory) ||
    !normalizePath(rotatedVideoAsset.mediaCache?.proxyPath ?? '').startsWith(normalizedPackageDirectory) ||
    !normalizePath(rotatedVideoAsset.mediaCache?.thumbnailPath ?? '').startsWith(normalizedPackageDirectory) ||
    !normalizePath(anamorphicVideoAsset.mediaCache?.proxyPath ?? '').startsWith(normalizedPackageDirectory) ||
    !normalizePath(anamorphicVideoAsset.mediaCache?.thumbnailPath ?? '').startsWith(normalizedPackageDirectory) ||
    !normalizePath(imageAsset.mediaCache?.thumbnailPath ?? '').startsWith(normalizedPackageDirectory) ||
    !normalizePath(exifImageAsset.mediaCache?.thumbnailPath ?? '').startsWith(normalizedPackageDirectory) ||
    !normalizePath(alphaOverlayImageAsset.mediaCache?.thumbnailPath ?? '').startsWith(normalizedPackageDirectory) ||
    !normalizePath(audioAsset.mediaCache?.waveformPath ?? '').startsWith(normalizedPackageDirectory)
  ) {
    throw new Error('Portable package import did not rewrite cache media into the package directory.');
  }
}

function assertProbe(probe: ProbeResult): void {
  const videoStream = probe.streams.find((stream) => stream.codec_type === 'video');
  const audioStream = probe.streams.find((stream) => stream.codec_type === 'audio');
  const duration = Number(probe.format.duration);

  if (!videoStream) {
    throw new Error('Render output has no video stream.');
  }

  if (!audioStream) {
    throw new Error('Render output has no audio stream.');
  }

  if (videoStream.width !== 320 || videoStream.height !== 180) {
    throw new Error(`Unexpected output size: ${videoStream.width}x${videoStream.height}`);
  }

  if (!Number.isFinite(duration) || duration < 5.8) {
    throw new Error(`Unexpected output duration: ${probe.format.duration}`);
  }
}

async function assertAnamorphicRenderSegment(filePath: string): Promise<void> {
  await assertRedNeutralGreenFramePixelCoverage(filePath, 'anamorphic render segment', 320, 180, 2.2);
}

async function assertStillImageRenderSegment(filePath: string): Promise<void> {
  await assertRedNeutralGreenFramePixelCoverage(filePath, 'still image render segment', 320, 180, 3.2);
}

async function assertExifImageRenderSegment(filePath: string): Promise<void> {
  await assertGreenNeutralRedFramePixelCoverage(filePath, 'EXIF oriented image render segment', 320, 180, 4.2);
}

async function assertAlphaOverlayRenderSegment(filePath: string): Promise<void> {
  const frame = await sampleRgbFrame(filePath, 5.2, 320, 180);
  const left = averageFrameRegion(frame, 320, 180, {
    left: 0,
    top: 0,
    right: 0.18,
    bottom: 1,
  });
  const center = averageFrameRegion(frame, 320, 180, {
    left: 0.45,
    top: 0,
    right: 0.55,
    bottom: 1,
  });
  const right = averageFrameRegion(frame, 320, 180, {
    left: 0.82,
    top: 0,
    right: 1,
    bottom: 1,
  });

  if (!isRedDominant(left) || !isBlueDominant(center) || !isGreenDominant(right)) {
    throw new Error(
      `Unexpected alpha overlay render pixels: left=${formatRgb(left)}, center=${formatRgb(center)}, right=${formatRgb(right)}; expected transparent side padding over red/green base and a blue center stripe.`,
    );
  }
}

function assertProbeVideoDimensions(probe: ProbeResult, label: string, expectedWidth: number, expectedHeight: number): void {
  const videoStream = probe.streams.find((stream) => stream.codec_type === 'video');
  if (!videoStream) {
    throw new Error(`${label} has no video stream.`);
  }

  if (videoStream.width !== expectedWidth || videoStream.height !== expectedHeight) {
    throw new Error(`Unexpected ${label} size: ${videoStream.width}x${videoStream.height}, expected ${expectedWidth}x${expectedHeight}.`);
  }
}

async function assertRotatedFramePixelOrientation(
  filePath: string,
  label: string,
  width: number,
  height: number,
  seconds = 0,
): Promise<void> {
  const frame = await sampleRgbFrame(filePath, seconds, width, height);
  const left = averageFrameRegion(frame, width, height, {
    left: 0,
    top: 0,
    right: 0.2,
    bottom: 1,
  });
  const right = averageFrameRegion(frame, width, height, {
    left: 0.8,
    top: 0,
    right: 1,
    bottom: 1,
  });

  if (!isRedDominant(left) || !isGreenDominant(right)) {
    throw new Error(
      `Unexpected ${label} pixel orientation: left=${formatRgb(left)}, right=${formatRgb(right)}; expected red band on left and green band on right.`,
    );
  }
}

async function assertRedNeutralGreenFramePixelCoverage(
  filePath: string,
  label: string,
  width: number,
  height: number,
  seconds = 0,
): Promise<void> {
  const frame = await sampleRgbFrame(filePath, seconds, width, height);
  const left = averageFrameRegion(frame, width, height, {
    left: 0,
    top: 0,
    right: 0.2,
    bottom: 1,
  });
  const center = averageFrameRegion(frame, width, height, {
    left: 0.4,
    top: 0,
    right: 0.6,
    bottom: 1,
  });
  const right = averageFrameRegion(frame, width, height, {
    left: 0.8,
    top: 0,
    right: 1,
    bottom: 1,
  });

  if (!isRedDominant(left) || !isGreenDominant(right) || isRedDominant(center) || isGreenDominant(center)) {
    throw new Error(
      `Unexpected ${label} display pixels: left=${formatRgb(left)}, center=${formatRgb(center)}, right=${formatRgb(right)}; expected red left edge, neutral center, and green right edge.`,
    );
  }
}

async function assertGreenNeutralRedFramePixelCoverage(
  filePath: string,
  label: string,
  width: number,
  height: number,
  seconds = 0,
): Promise<void> {
  const frame = await sampleRgbFrame(filePath, seconds, width, height);
  const left = averageFrameRegion(frame, width, height, {
    left: 0,
    top: 0,
    right: 0.2,
    bottom: 1,
  });
  const center = averageFrameRegion(frame, width, height, {
    left: 0.4,
    top: 0,
    right: 0.6,
    bottom: 1,
  });
  const right = averageFrameRegion(frame, width, height, {
    left: 0.8,
    top: 0,
    right: 1,
    bottom: 1,
  });

  if (!isGreenDominant(left) || !isRedDominant(right) || isRedDominant(center) || isGreenDominant(center)) {
    throw new Error(
      `Unexpected ${label} display pixels: left=${formatRgb(left)}, center=${formatRgb(center)}, right=${formatRgb(right)}; expected green left edge, neutral center, and red right edge.`,
    );
  }
}

async function sampleRgbFrame(filePath: string, seconds: number, width: number, height: number): Promise<Buffer> {
  const seekArgs = seconds > 0 ? ['-ss', String(seconds)] : [];
  const frame = await runCaptureBuffer(ffmpegPath, [
    '-v',
    'error',
    ...seekArgs,
    '-i',
    filePath,
    '-frames:v',
    '1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ]);
  const expectedBytes = width * height * 3;
  if (frame.length !== expectedBytes) {
    throw new Error(`Could not read ${width}x${height} RGB frame from ${filePath}; bytes=${frame.length}, expected=${expectedBytes}`);
  }

  return frame;
}

function averageFrameRegion(
  frame: Buffer,
  width: number,
  height: number,
  region: { left: number; top: number; right: number; bottom: number },
): RgbAverage {
  const left = Math.max(0, Math.min(width - 1, Math.floor(width * region.left)));
  const top = Math.max(0, Math.min(height - 1, Math.floor(height * region.top)));
  const right = Math.max(left + 1, Math.min(width, Math.ceil(width * region.right)));
  const bottom = Math.max(top + 1, Math.min(height, Math.ceil(height * region.bottom)));
  let red = 0;
  let green = 0;
  let blue = 0;
  let samples = 0;

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const index = (y * width + x) * 3;
      red += frame[index];
      green += frame[index + 1];
      blue += frame[index + 2];
      samples += 1;
    }
  }

  return {
    red: red / samples,
    green: green / samples,
    blue: blue / samples,
  };
}

function isRedDominant(color: RgbAverage): boolean {
  return color.red >= 120 && color.red > color.green + 60 && color.red > color.blue + 40;
}

function isGreenDominant(color: RgbAverage): boolean {
  return color.green >= 120 && color.green > color.red + 60 && color.green > color.blue + 40;
}

function isBlueDominant(color: RgbAverage): boolean {
  return color.blue >= 120 && color.blue > color.red + 60 && color.blue > color.green + 40;
}

function formatRgb(color: RgbAverage): string {
  return `rgb(${Math.round(color.red)}, ${Math.round(color.green)}, ${Math.round(color.blue)})`;
}

function injectJpegExifOrientation(jpeg: Buffer, orientation: number): Buffer {
  if (jpeg.length < 2 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
    throw new Error('Cannot inject EXIF orientation into a non-JPEG image.');
  }

  const payload = Buffer.from([
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), length, payload]);

  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

function assertRenderPlanUsesPortablePackage(
  inputs: Array<{ source: string }>,
  expectedPackageDirectory: string,
): void {
  const normalizedPackageDirectory = normalizePath(expectedPackageDirectory);
  const packageInputs = inputs.filter((input) => normalizePath(input.source).startsWith(normalizedPackageDirectory));
  if (packageInputs.length < 7) {
    throw new Error(`Expected render plan to use portable package media, got ${inputs.map((input) => input.source).join(', ')}`);
  }
  if (!packageInputs.some((input) => normalizePath(input.source).includes('rotated-sample-video.mp4'))) {
    throw new Error(`Expected render plan to use the packaged rotated video, got ${inputs.map((input) => input.source).join(', ')}`);
  }
  if (!packageInputs.some((input) => normalizePath(input.source).includes('anamorphic-sample-video.mp4'))) {
    throw new Error(`Expected render plan to use the packaged anamorphic video, got ${inputs.map((input) => input.source).join(', ')}`);
  }
  if (!packageInputs.some((input) => normalizePath(input.source).includes('sample-still-image.png'))) {
    throw new Error(`Expected render plan to use the packaged still image, got ${inputs.map((input) => input.source).join(', ')}`);
  }
  if (!packageInputs.some((input) => normalizePath(input.source).includes('exif-oriented-still-image.jpg'))) {
    throw new Error(`Expected render plan to use the packaged EXIF oriented image, got ${inputs.map((input) => input.source).join(', ')}`);
  }
  if (!packageInputs.some((input) => normalizePath(input.source).includes('alpha-overlay-image.png'))) {
    throw new Error(`Expected render plan to use the packaged alpha overlay image, got ${inputs.map((input) => input.source).join(', ')}`);
  }
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

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function assertRenderPlanContainsEditableLayers(filterGraph: string[]): void {
  const drawTextFilters = filterGraph.filter((filter) => filter.includes('drawtext'));
  const drawTextFilterCount = drawTextFilters.length;
  if (drawTextFilterCount < 2) {
    throw new Error(`Expected title and caption drawtext filters in render plan, found ${drawTextFilterCount}.`);
  }

  const expectedTitle = smokeTitleText.replace(/\n/g, '\\n');
  const expectedCaption = smokeCaptionText.replace(/\n/g, '\\n');
  if (!drawTextFilters.some((filter) => filter.includes(expectedTitle))) {
    throw new Error(`Expected multi-line title text in render plan: ${expectedTitle}`);
  }
  if (!drawTextFilters.some((filter) => filter.includes(expectedCaption))) {
    throw new Error(`Expected multi-line caption text in render plan: ${expectedCaption}`);
  }
}

async function sampleFrameBrightness(filePath: string, seconds: number): Promise<{ brightPixelRatio: number }> {
  const frame = await runCaptureBuffer(ffmpegPath, [
    '-v',
    'error',
    '-ss',
    String(seconds),
    '-i',
    filePath,
    '-frames:v',
    '1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ]);
  if (frame.length === 0 || frame.length % 3 !== 0) {
    throw new Error(`Could not read an RGB frame from render output; bytes=${frame.length}`);
  }

  let brightPixels = 0;
  const totalPixels = frame.length / 3;
  for (let index = 0; index < frame.length; index += 3) {
    const luma = (0.2126 * frame[index]) + (0.7152 * frame[index + 1]) + (0.0722 * frame[index + 2]);
    if (luma >= 180) {
      brightPixels += 1;
    }
  }

  return {
    brightPixelRatio: brightPixels / totalPixels,
  };
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
    });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

function runCapture(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

function runCaptureBuffer(command: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

interface ProbeResult {
  streams: Array<{
    codec_type?: string;
    width?: number;
    height?: number;
  }>;
  format: {
    duration?: string;
  };
}

interface RgbAverage {
  red: number;
  green: number;
  blue: number;
}
