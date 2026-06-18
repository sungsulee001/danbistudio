import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RENDER_WORKER_HANDOFF_KIND,
  RENDER_WORKER_HANDOFF_SCHEMA_VERSION,
  writeRenderWorkerHandoffManifest,
  type RenderWorkerHandoffManifest,
} from '../../src/electron/main/render-worker-handoff';
import {
  parseRenderWorkerHandoffManifest,
  writeRenderWorkerRunReport,
  type RenderWorkerRunReport,
} from '../../src/electron/main/render-worker-runner';
import { RENDER_WORKER_RUN_REPORT_KIND } from '../../src/electron/shared/render-worker-contract';

describe('render worker storage', () => {
  it('writes handoff manifests and run reports atomically without leaving temp files', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-render-worker-storage-'));

    try {
      const handoffPath = join(tempRoot, 'handoff', 'daily-handoff.json');
      const reportPath = join(tempRoot, 'reports', 'daily-report.json');
      const manifest = buildHandoffManifest();
      const report = buildRunReport();

      await writeRenderWorkerHandoffManifest(manifest, handoffPath);
      await writeRenderWorkerRunReport(report, reportPath);

      const parsedManifest = parseRenderWorkerHandoffManifest(await readFile(handoffPath, 'utf8'));
      const parsedReport = JSON.parse(await readFile(reportPath, 'utf8')) as RenderWorkerRunReport;
      const handoffFiles = await readdir(join(tempRoot, 'handoff'));
      const reportFiles = await readdir(join(tempRoot, 'reports'));

      expect(parsedManifest).toMatchObject({
        kind: RENDER_WORKER_HANDOFF_KIND,
        batchId: 'daily',
      });
      expect(parsedReport).toMatchObject({
        kind: RENDER_WORKER_RUN_REPORT_KIND,
        sourceBatchId: 'daily',
      });
      expect([...handoffFiles, ...reportFiles].some((filename) => filename.endsWith('.tmp'))).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

function buildHandoffManifest(): RenderWorkerHandoffManifest {
  return {
    schemaVersion: RENDER_WORKER_HANDOFF_SCHEMA_VERSION,
    kind: RENDER_WORKER_HANDOFF_KIND,
    createdAt: '2026-06-18T00:00:00.000Z',
    batchId: 'daily',
    controller: {
      protocol: 'headless-render-v1',
      mode: 'local-network-handoff',
    },
    project: {
      id: 'project-render-worker',
      name: 'Render Worker Project',
      schemaVersion: 1,
      duration: 4,
      fps: 30,
      width: 1920,
      height: 1080,
    },
    summary: {
      totalJobs: 1,
      blockedJobs: 0,
      warningJobs: 0,
      readyJobs: 1,
    },
    jobs: [{
      id: 'daily-profile',
      profileId: 'profile',
      profileLabel: 'Profile',
      outputFilename: 'daily-profile.mp4',
      outputPath: 'E:/renders/daily-profile.mp4',
      encoderPreference: 'auto',
      preflightStatus: 'ready',
      blocked: false,
      warningCount: 0,
      blockedCount: 0,
      issues: [],
      commandText: 'ffmpeg -i input output.mp4',
      ffmpegCommand: ['ffmpeg', '-i', 'input', 'output.mp4'],
    }],
  };
}

function buildRunReport(): RenderWorkerRunReport {
  return {
    schemaVersion: 1,
    kind: RENDER_WORKER_RUN_REPORT_KIND,
    workerId: 'worker-a',
    sourceManifestKind: RENDER_WORKER_HANDOFF_KIND,
    sourceBatchId: 'daily',
    dryRun: true,
    startedAt: '2026-06-18T00:00:00.000Z',
    finishedAt: '2026-06-18T00:00:01.000Z',
    summary: {
      totalJobs: 1,
      plannedJobs: 1,
      completedJobs: 0,
      blockedJobs: 0,
      skippedJobs: 0,
      failedJobs: 0,
    },
    jobs: [{
      jobId: 'daily-profile',
      profileId: 'profile',
      profileLabel: 'Profile',
      outputPath: 'E:/renders/daily-profile.mp4',
      status: 'planned',
      commandText: 'ffmpeg -i input output.mp4',
    }],
  };
}
