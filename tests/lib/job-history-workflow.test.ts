import { describe, expect, it } from 'vitest';
import type { EditorAsset } from '../../src/lib/editor/types';
import type { ProgramPreviewLayer } from '../../src/lib/editor/preview';
import type { ComfyUIQueueJobView, MediaCacheJobView, RenderJobView, SttJobView } from '../../src/electron/renderer/editor-view-model';
import { resolveReviewMediaPreviewState } from '../../src/electron/renderer/comfyui-result-review-panel';
import { buildComfyUIBatchResultStatus } from '../../src/electron/renderer/export-job-status-panels';
import { buildJobHistorySummary, mergeRenderJobHistory } from '../../src/electron/renderer/job-history-workflow-helpers';
import { resolveMediaCacheJobSource } from '../../src/electron/renderer/media-cache-client';
import { hasProgramPreviewVisualMediaLayer } from '../../src/electron/renderer/program-preview-stage';
import { resolveSourceMonitorPreviewState } from '../../src/electron/renderer/source-monitor';

describe('job history workflow helpers', () => {
  it('merges render history by job id and keeps incoming jobs first', () => {
    const existing = [
      buildRenderJob({ id: 'render-a', status: 'queued', progress: 10 }),
      buildRenderJob({ id: 'render-b', status: 'completed', progress: 100 }),
    ];

    const merged = mergeRenderJobHistory(existing, [
      buildRenderJob({ id: 'render-a', status: 'running', progress: 40 }),
      buildRenderJob({ id: 'render-c', status: 'failed', progress: 70 }),
    ]);

    expect(merged.map((job) => `${job.id}:${job.status}:${job.progress}`)).toEqual([
      'render-a:running:40',
      'render-c:failed:70',
      'render-b:completed:100',
    ]);
  });

  it('summarizes render, media cache, ComfyUI, and STT jobs in one dashboard model', () => {
    const summary = buildJobHistorySummary({
      renderJobs: [
        buildRenderJob({ id: 'render-main', status: 'queued', progress: 10 }),
        buildRenderJob({ id: 'render-old', status: 'completed', progress: 100 }),
      ],
      renderJob: buildRenderJob({ id: 'render-main', status: 'running', progress: 55 }),
      mediaCacheJobsByAssetId: {
        'asset-voice': buildMediaCacheJob({ id: 'cache-1', status: 'queued', progress: 20 }),
      },
      comfyUIJob: buildComfyUIJob({
        id: 'comfy-1',
        status: 'completed',
        progress: 100,
        results: [{
          automationJobId: 'comfy-1',
          clipId: 'clip-ai-city',
          status: 'completed',
          renderPath: 'E:/ai_tool/Danbi_Studio/public/outputs/renderpath-only.mp4',
        }],
      }),
      sttJob: buildSttJob({ id: 'stt-1', status: 'failed', progress: 45 }),
    });

    expect(summary.totalCount).toBe(5);
    expect(summary.activeCount).toBe(2);
    expect(summary.failedCount).toBe(1);
    expect(summary.completedCount).toBe(2);
    expect(summary.items[0]).toMatchObject({
      id: 'render-main',
      kind: 'render',
      status: 'running',
      progress: 55,
    });
    expect(summary.items.map((item) => item.kind)).toEqual(expect.arrayContaining(['render', 'media-cache', 'comfyui', 'stt']));
    expect(summary.items.find((item) => item.id === 'comfy-1')?.detail).toContain('1 results');
    expect(summary.items.find((item) => item.id === 'stt-1')?.problem).toBe('transcript failed');
  });

  it('counts renderPath-only ComfyUI results as ready in status panels', () => {
    expect(buildComfyUIBatchResultStatus(buildComfyUIJob({
      id: 'comfy-renderpath-only',
      status: 'completed',
      progress: 100,
      results: [{
        automationJobId: 'comfy-renderpath-only',
        clipId: 'clip-ai-city',
        status: 'completed',
        renderPath: 'E:/ai_tool/Danbi_Studio/public/outputs/renderpath-only.mp4',
      }],
    }))).toEqual({
      completedResultCount: 1,
      hasCompletedResults: true,
      hasRenderableEffectPassResults: true,
    });
  });

  it('classifies ComfyUI review previews without rendering empty media elements', () => {
    const privateRenderAsset = buildReviewAsset({
      source: 'local://capture/private-render',
      renderPath: 'E:/media/private-render.mp4',
    });
    expect(resolveReviewMediaPreviewState(privateRenderAsset)).toMatchObject({
      status: 'missing-preview',
      source: '',
      message: 'Preview source unavailable',
      previewSource: {
        mode: 'none',
      },
    });

    const publicRenderAsset = buildReviewAsset({
      source: 'offline://comfyui/public-render',
      renderPath: 'E:/ai_tool/Danbi_Studio/public/outputs/public-render.mp4',
    });
    expect(resolveReviewMediaPreviewState(publicRenderAsset)).toMatchObject({
      status: 'ready',
      source: '/outputs/public-render.mp4',
      previewSource: {
        mode: 'source',
      },
    });
  });

  it('keeps renderPath-backed visual layers in the program monitor composite', () => {
    expect(hasProgramPreviewVisualMediaLayer(buildPreviewLayer({
      asset: buildReviewAsset({
        source: '',
        renderPath: 'E:/ai_tool/Danbi_Studio/public/outputs/renderpath-only.mp4',
      }),
    }))).toBe(true);

    expect(hasProgramPreviewVisualMediaLayer(buildPreviewLayer({
      asset: buildReviewAsset({
        kind: 'ai',
        source: '',
        renderPath: 'E:/ai_tool/Danbi_Studio/public/outputs/renderpath-only-ai.mp4',
        metadata: {
          mimeType: 'video/mp4',
          hasVideo: true,
        },
      }),
    }))).toBe(true);

    expect(hasProgramPreviewVisualMediaLayer(buildPreviewLayer({
      asset: buildReviewAsset({
        kind: 'text',
        source: 'Title',
        renderPath: undefined,
      }),
    }))).toBe(false);
  });

  it('classifies source monitor video previews before rendering media tags', () => {
    expect(resolveSourceMonitorPreviewState(buildReviewAsset({
      source: 'local://capture/private-video',
      renderPath: 'E:/media/private-video.mp4',
    }))).toMatchObject({
      status: 'missing-preview',
      source: '',
      message: 'Missing preview source',
      previewSource: {
        mode: 'none',
      },
    });

    expect(resolveSourceMonitorPreviewState(buildReviewAsset({
      source: 'offline://source-monitor/public-video',
      renderPath: 'E:/ai_tool/Danbi_Studio/public/outputs/source-monitor-video.mp4',
    }))).toMatchObject({
      status: 'ready',
      source: '/outputs/source-monitor-video.mp4',
      previewSource: {
        mode: 'source',
      },
    });
  });

  it('uses renderPath as media cache source metadata when asset source is empty', () => {
    expect(resolveMediaCacheJobSource(buildReviewAsset({
      source: '   ',
      renderPath: ' E:/media/cache-input.mp4 ',
    }))).toBe('E:/media/cache-input.mp4');
    expect(resolveMediaCacheJobSource(buildReviewAsset({
      source: '/imports/cache-input.mp4',
      renderPath: 'E:/media/cache-input.mp4',
    }))).toBe('/imports/cache-input.mp4');
  });
});

function buildRenderJob(overrides: Partial<RenderJobView>): RenderJobView {
  return {
    id: 'render-1',
    status: 'queued',
    progress: 0,
    priority: 5,
    outputPath: 'E:\\renders\\danbi-master.mp4',
    ...overrides,
  };
}

function buildMediaCacheJob(overrides: Partial<MediaCacheJobView>): MediaCacheJobView {
  return {
    id: 'cache-1',
    status: 'queued',
    progress: 0,
    priority: 3,
    warnings: [],
    ...overrides,
  };
}

function buildComfyUIJob(overrides: Partial<ComfyUIQueueJobView>): ComfyUIQueueJobView {
  return {
    id: 'comfy-1',
    status: 'queued',
    progress: 0,
    priority: 4,
    modelName: 'Flux',
    execute: true,
    totalJobs: 2,
    completedJobs: 2,
    failedJobs: 0,
    results: [],
    warnings: [],
    ...overrides,
  };
}

function buildReviewAsset(overrides: Partial<EditorAsset>): EditorAsset {
  return {
    id: 'asset-review',
    name: 'Review render',
    kind: 'video',
    source: '/outputs/review-render.mp4',
    duration: 8,
    width: 1280,
    height: 720,
    fps: 30,
    ...overrides,
  };
}

function buildPreviewLayer(overrides: Partial<ProgramPreviewLayer>): ProgramPreviewLayer {
  return {
    trackId: 'track-v1',
    trackName: 'V1',
    trackIndex: 0,
    clip: {
      id: 'clip-review',
      assetId: 'asset-review',
      trackId: 'track-v1',
      name: 'Review clip',
      kind: 'video',
      start: 0,
      duration: 8,
      sourceIn: 0,
      color: '#38bdf8',
      speed: 1,
      volume: 1,
      opacity: 1,
      blendMode: 'normal',
      automationTags: [],
      effects: [],
      keyframes: [],
    },
    asset: buildReviewAsset({}),
    enabledEffects: [],
    clipTime: 0,
    localTime: 0,
    mediaTime: 0,
    style: {
      opacity: 1,
      positionX: 0,
      positionY: 0,
      scale: 1,
      rotation: 0,
      volume: 1,
      pan: 0,
    },
    visible: true,
    ...overrides,
  };
}

function buildSttJob(overrides: Partial<SttJobView>): SttJobView {
  return {
    id: 'stt-1',
    status: 'queued',
    progress: 0,
    priority: 2,
    execute: true,
    engine: 'whisper',
    language: 'ko',
    totalClips: 1,
    completedClips: 0,
    failedClips: 1,
    captions: [],
    error: 'transcript failed',
    warnings: [],
    ...overrides,
  };
}
