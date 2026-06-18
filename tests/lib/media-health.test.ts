import { describe, expect, it } from 'vitest';

import { buildMediaHealthReport } from '../../src/lib/editor/media-health';
import { createClip } from '../../src/lib/editor/project';
import { buildRenderPreflightReport } from '../../src/lib/editor/render-preflight';
import type { EditorAsset, EditorProject, ExportProfile, TimelineTrack } from '../../src/lib/editor/types';

describe('media health media kind inference', () => {
  it('uses supported generated media inference and blocks explicit unsupported MIME assets', () => {
    const project = buildProject([
      buildAsset({
        id: 'asset-voice-webm',
        name: 'Voice WebM',
        source: '/outputs/voice.webm',
        renderPath: 'E:/renders/voice.webm',
        metadata: {
          mimeType: 'audio/webm;codecs=opus',
          generated: true,
        },
        mediaCache: {
          generatedAt: '2026-06-18T00:00:00.000Z',
          waveformPeaks: [0, 0.25, 0.5],
          warnings: [],
        },
      }),
      buildAsset({
        id: 'asset-still-tiff',
        name: 'Still TIFF',
        source: '/outputs/still.tiff',
        renderPath: 'E:/renders/still.tiff',
        metadata: {
          mimeType: 'application/octet-stream',
          generated: true,
        },
        mediaCache: {
          generatedAt: '2026-06-18T00:00:00.000Z',
          thumbnailSource: '/cache/media/thumbnails/still.jpg',
          warnings: [],
        },
      }),
      buildAsset({
        id: 'asset-spoofed-svg',
        name: 'Spoofed PNG',
        source: '/outputs/spoofed.png',
        renderPath: 'E:/renders/spoofed.png',
        metadata: {
          mimeType: 'image/svg+xml',
          generated: true,
          hasVideo: true,
        },
      }),
    ]);

    const report = buildMediaHealthReport(project);
    const voiceHealth = report.assets.find((asset) => asset.assetId === 'asset-voice-webm');
    const tiffHealth = report.assets.find((asset) => asset.assetId === 'asset-still-tiff');
    const spoofedHealth = report.assets.find((asset) => asset.assetId === 'asset-spoofed-svg');

    expect(voiceHealth).toMatchObject({
      severity: 'ok',
      renderReady: true,
      previewReady: true,
      cacheReady: true,
      hasWaveform: true,
    });
    expect(tiffHealth).toMatchObject({
      severity: 'ok',
      renderReady: true,
      previewReady: true,
      cacheReady: true,
      hasThumbnail: true,
    });
    expect(spoofedHealth).toMatchObject({
      severity: 'blocked',
      renderReady: false,
      previewReady: true,
      cacheReady: false,
    });
    expect(spoofedHealth?.issues).toEqual([
      expect.objectContaining({
        id: 'asset-spoofed-svg-unsupported-media-type',
        severity: 'blocked',
        action: 'relink',
        message: expect.stringContaining('unsupported media type image/svg+xml'),
      }),
    ]);
    expect(report.blockedCount).toBe(1);
    expect(report.warningCount).toBe(0);
  });

  it('surfaces explicit unsupported MIME assets in export preflight media health issues', () => {
    const project = buildProject([
      buildAsset({
        id: 'asset-spoofed-svg',
        name: 'Spoofed PNG',
        source: '/outputs/spoofed.png',
        renderPath: 'E:/renders/spoofed.png',
        metadata: {
          mimeType: 'image/svg+xml',
          generated: true,
          hasVideo: true,
        },
      }),
    ]);

    const report = buildRenderPreflightReport(project, 'profile-test-mp4', {
      sampleTimes: [0.5],
      outputPath: 'E:/renders/final.mp4',
    });

    expect(report.status).toBe('blocked');
    expect(report.issues).toContainEqual(expect.objectContaining({
      id: 'media-asset-spoofed-svg-unsupported-media-type',
      severity: 'blocked',
      source: 'media-health',
      actionKind: 'relink',
      assetId: 'asset-spoofed-svg',
      message: expect.stringContaining('unsupported media type image/svg+xml'),
    }));
  });
});

function buildProject(assets: EditorAsset[]): EditorProject {
  return {
    id: 'media-health-project',
    schemaVersion: 2,
    name: 'Media Health Project',
    fps: 30,
    width: 1920,
    height: 1080,
    duration: 10,
    updatedAt: '2026-06-18T00:00:00.000Z',
    assets,
    tracks: [
      buildTrack('track-media', assets),
    ],
    markers: [],
    captions: [],
    automation: [],
    plugins: [],
    exportProfiles: [buildExportProfile()],
  };
}

function buildTrack(id: string, assets: EditorAsset[]): TimelineTrack {
  return {
    id,
    name: 'Media',
    kind: 'video',
    muted: false,
    locked: false,
    clips: assets.map((asset, index) => createClip({
      id: `clip-${asset.id}`,
      assetId: asset.id,
      trackId: id,
      name: asset.name,
      kind: 'ai',
      start: index * 2,
      duration: 2,
      color: '#38bdf8',
    })),
  };
}

function buildAsset(overrides: Partial<EditorAsset>): EditorAsset {
  return {
    id: 'asset',
    name: 'asset',
    kind: 'ai',
    source: '',
    duration: 2,
    ...overrides,
  };
}

function buildExportProfile(): ExportProfile {
  return {
    id: 'profile-test-mp4',
    label: 'Test MP4',
    container: 'mp4',
    codec: 'h264',
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrateMbps: 8,
    audioBitrateKbps: 192,
  };
}
