import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildLongFormEditorProject } from '../fixtures/long-form-editor-project';
import { buildFfmpegRenderPlan, type FfmpegRenderPlan } from '../../src/lib/editor/ffmpeg-renderer';
import { createClip, createDefaultEditorProject, DEFAULT_EXPORT_PROFILE_ID } from '../../src/lib/editor/project';
import type { EditorProject } from '../../src/lib/editor/types';
import type { RenderJobView } from '../../src/electron/renderer/editor-view-model';

test('opens the real editor from the app root', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('link', { name: 'Open Editor' }).first().click();
  await expect(page).toHaveURL(/\/editor$/);
  await waitForEditorHydrated(page);
  await expect(page.getByRole('link', { name: 'Editor' })).toBeVisible();
  await openSourceMonitor(page);
  await expect(page.getByTestId('program-monitor')).toBeVisible();
  await expectProgramMonitorCompositeReady(page);
  await expect(page.getByRole('button', { name: 'Commands' })).toBeVisible();
  await expect(page.getByTestId('editor-media-file-input')).toHaveAttribute('accept', /\.qt/);

  await page.getByRole('button', { name: 'Timeline clip Music bed' }).click();
  await expect(page.getByText('SOURCE MEDIA')).toBeVisible();
  await expect(page.getByText('Soft pulse bed').last()).toBeVisible();
  await expect(page.getByTestId('timeline-waveform-clip-music-1')).toHaveCount(1);
  await expect(page.getByTestId('timeline-volume-envelope-clip-music-1')).toHaveCount(1);

  await page.getByRole('button', { name: 'Timeline clip Founder intro' }).click();
  await page.getByRole('button', { name: /^V\s+Video$/i }).click();
  const visualPanel = page.getByRole('heading', { name: 'Visual' }).locator('xpath=ancestor::div[contains(@class, "rounded-md")][1]');
  await expect(visualPanel).toBeVisible();
  await visualPanel.getByRole('button', { name: 'Both' }).click();
  await expect(page.getByText('Visual fade applied to 1 clip')).toBeVisible();
  await expect(page.getByTestId('timeline-opacity-envelope-clip-interview-1')).toHaveCount(1);
});

test('keeps the Program Monitor composite reachable on desktop and mobile viewports', async ({ page }) => {
  const viewports: EditorViewportSpec[] = [
    { label: 'desktop', width: 1280, height: 720 },
    { label: 'mobile', width: 390, height: 844 },
  ];

  for (const viewport of viewports) {
    await test.step(viewport.label, async () => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openEditor(page);

      if (viewport.width >= 640) {
        await expect(page.getByRole('link', { name: 'Editor' })).toBeVisible();
      } else {
        await expect(page.getByRole('link', { name: 'Danbi Studio' })).toBeVisible();
      }
      await expect(page.getByRole('button', { name: 'Commands' })).toBeVisible();
      const headerLayoutAudit = await expectTopLevelEditorControlsLayoutStable(page, viewport);
      await openSourceMonitor(page);
      const sourceLayoutAudit = await expectSourceMonitorViewportLayoutStable(page, viewport);

      if (viewport.width >= 640) {
        await expectProgramMonitorCompositeReady(page);
        await expect(page.getByTestId('program-audio-meter')).toBeVisible();
        await expect(page.getByTestId('program-audio-meter-status')).toContainText(/meter pending|Hot|CLIP|dB/);
      } else {
        const programMonitor = page.getByTestId('program-monitor');
        await programMonitor.scrollIntoViewIfNeeded();
        await expect(programMonitor.getByTestId('program-monitor-frame')).toBeVisible();
        await expect(programMonitor.getByRole('button', { name: 'Info', exact: true })).toBeVisible();
      }
      const programLayoutAudit = await expectProgramMonitorViewportLayoutStable(page, viewport);

      const screenshot = await page.screenshot();
      expect(screenshot.byteLength).toBeGreaterThan(10_000);
      await test.info().attach(`editor-${viewport.label}-layout-audit`, {
        body: JSON.stringify({
          viewport,
          header: headerLayoutAudit,
          source: sourceLayoutAudit,
          program: programLayoutAudit,
        }, null, 2),
        contentType: 'application/json',
      });
      await test.info().attach(`editor-${viewport.label}-viewport`, {
        body: screenshot,
        contentType: 'image/png',
      });
    });
  }
});

test('updates Program Monitor layers when the timeline playhead reaches title and caption content', async ({ page }) => {
  await openEditor(page);

  const programMonitor = page.getByTestId('program-monitor');
  await expectProgramMonitorCompositeReady(page);

  const timelinePlayhead = page.locator('input[type="range"][max="92"]').first();
  await setRangeInputValue(timelinePlayhead, 1.4);

  await expect(programMonitor.getByText('Danbi Studio').first()).toBeVisible();
  await expect(programMonitor.getByText('Danbi Studio turns local AI generation into an editing workflow.')).toBeVisible();

  const activeLayerSummary = await programMonitor.getByText(/\d+ media \/ \d+ text \/ \d+ caption \/ \d+ audio/).first().textContent();
  expect(activeLayerSummary).toMatch(/[1-9]\d* media/);
  expect(activeLayerSummary).toMatch(/[1-9]\d* text/);
  expect(activeLayerSummary).toMatch(/[1-9]\d* caption/);
  expect(activeLayerSummary).toMatch(/[1-9]\d* audio/);
});

test('preserves transparent PNG padding in Program Monitor image overlays', async ({ page }) => {
  const stamp = Date.now();
  const project = buildAlphaOverlayPreviewProject(`danbi-alpha-preview-e2e-${stamp}`);

  try {
    const saveResponse = await page.request.post('/api/editor/projects', {
      data: { project },
    });
    const saveBody = await saveResponse.json().catch(() => ({}));
    expect(saveResponse.ok(), JSON.stringify(saveBody)).toBeTruthy();

    await page.setViewportSize({ width: 1280, height: 720 });
    await openEditor(page);
    await openProjectPanel(page);
    await page.getByRole('button', { name: 'Refresh' }).click();

    const savedProject = page.getByRole('button', { name: new RegExp(project.name) });
    await expect(savedProject).toBeVisible();
    await savedProject.click();
    await expect(page.getByText('Project loaded from database')).toBeVisible();

    const timelinePlayhead = page.getByRole('slider', { name: 'Timeline playhead' });
    await setRangeInputValue(timelinePlayhead, 1);

    const programMonitor = page.getByTestId('program-monitor');
    const previewFrame = programMonitor.getByTestId('program-monitor-frame');
    await previewFrame.scrollIntoViewIfNeeded();
    await expect(previewFrame).toBeVisible();
    await showProgramDiagnostics(programMonitor);
    await expect(programMonitor.getByTestId('program-stack-summary')).toHaveText('2 media / 0 text / 0 caption / 0 audio');
    await expect(programMonitor.getByAltText('Alpha preview base')).toBeVisible();
    await expect(programMonitor.getByAltText('Alpha preview overlay')).toBeVisible();

    await waitForPreviewImages(programMonitor);
    await hideProgramDiagnosticOverlays(page);
    await expect(programMonitor).toBeVisible();
    const analysis = await analyzeAlphaCompositeScreenshot(page, programMonitor);

    expect(analysis.red.count, JSON.stringify(analysis)).toBeGreaterThan(6_000);
    expect(analysis.blue.count, JSON.stringify(analysis)).toBeGreaterThan(6_000);
    expect(analysis.green.count, JSON.stringify(analysis)).toBeGreaterThan(6_000);
    expect(analysis.red.averageX, JSON.stringify(analysis)).toBeLessThan(analysis.blue.averageX - 20);
    expect(analysis.blue.averageX, JSON.stringify(analysis)).toBeLessThan(analysis.green.averageX - 20);
  } finally {
    await page.request.delete(`/api/editor/projects/${project.id}`).catch(() => undefined);
  }
});

test('turns local sample media into an export-ready tutorial cut from a free template', async ({ page }) => {
  const stamp = Date.now();
  const mediaName = `template-quickstart-${stamp}.mp4`;
  const importsDir = join(process.cwd(), '.danbi', 'imports');
  const mediaPath = join(importsDir, mediaName);
  const project = buildRenderableRenderRecoveryProject(
    `danbi-template-quickstart-e2e-${stamp}`,
    `/imports/${mediaName}`,
    mediaPath,
  );
  const workflowStartedAt = Date.now();

  try {
    await mkdir(importsDir, { recursive: true });
    generateTestVideo(mediaPath);
    const saveResponse = await page.request.post('/api/editor/projects', {
      data: { project },
    });
    const saveBody = await saveResponse.json().catch(() => ({}));
    expect(saveResponse.ok(), JSON.stringify(saveBody)).toBeTruthy();

    await openEditor(page);
    await openProjectPanel(page);
    await page.getByRole('button', { name: 'Refresh' }).click();
    const savedProject = page.getByRole('button', { name: new RegExp(project.name) });
    await expect(savedProject).toBeVisible();
    await savedProject.click();
    await expect(page.getByText('Project loaded from database')).toBeVisible();

    await openTemplatesPanel(page);
    const tutorialTemplate = page.getByRole('button', { name: /Tutorial Steps/ });
    await tutorialTemplate.scrollIntoViewIfNeeded();
    await expect(tutorialTemplate).toBeVisible();
    await tutorialTemplate.click();

    await expect(page.getByText('Applied Tutorial Steps template: 4 clips, 4 captions, 4 markers')).toBeVisible();

    const introTitleClip = page.getByRole('button', { name: 'Timeline clip Title: What you will build' });
    await introTitleClip.scrollIntoViewIfNeeded();
    await expect(introTitleClip).toBeVisible();
    await expect(page.getByRole('button', { name: 'Timeline clip Title: Step 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Timeline clip Title: Step 2' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Move marker Intro at 00:00:00:00/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Move marker Recap at 00:00:38:00/ })).toBeVisible();

    const timelinePlayhead = page.getByRole('slider', { name: 'Timeline playhead' });
    await setRangeInputValue(timelinePlayhead, 1.2);
    const programMonitor = page.getByTestId('program-monitor');
    await programMonitor.scrollIntoViewIfNeeded();
    await expect(programMonitor).toBeVisible();
    await expect(programMonitor.getByTestId('program-monitor-frame')).toBeVisible();
    await expect(programMonitor.getByText('What you will build').first()).toBeVisible();
    await expect(programMonitor.getByText('Start with the outcome viewers will have.').first()).toBeVisible();
    await showProgramDiagnostics(programMonitor);
    await expect(programMonitor.getByTestId('program-stack-summary')).toContainText('text');
    await expect(programMonitor.getByTestId('program-stack-summary')).toContainText('caption');

    const exportButton = page.locator('header').getByRole('button', { name: 'Export', exact: true });
    await exportButton.scrollIntoViewIfNeeded();
    await exportButton.click();
    await expect(page.getByText(/FFmpeg inputs prepared for .*preflight ready/)).toBeVisible();
    await expect(page.getByTestId('render-command-preview')).toContainText('ffmpeg');
    await expect(page.getByText('Tutorial Steps Titles').first()).toBeVisible();

    expect(Date.now() - workflowStartedAt).toBeLessThan(5 * 60 * 1000);
  } finally {
    await page.request.delete(`/api/editor/projects/${project.id}`).catch(() => undefined);
    rmSync(mediaPath, { force: true });
  }
});

test('shows recovery candidates and restores fallback and autosave projects', async ({ page }) => {
  const stamp = Date.now();
  const savedAt = new Date(Date.now() + 30_000).toISOString();
  const autosavedAt = new Date(Date.now() + 45_000).toISOString();
  const fallbackUpdatedAt = new Date(Date.now() + 60_000).toISOString();
  const packageUpdatedAt = new Date(Date.now() + 75_000).toISOString();
  const packagePath = join(tmpdir(), `danbi-recovery-package-${stamp}.json`);
  const savedProject = buildRecoveryCandidateProject(
    `danbi-recovery-saved-e2e-${stamp}`,
    `Recovery Saved E2E ${stamp}`,
    savedAt,
  );
  const autosaveProject = buildRecoveryCandidateProject(
    `danbi-recovery-autosave-e2e-${stamp}`,
    `Recovery Autosave E2E ${stamp}`,
    autosavedAt,
  );
  const fallbackProject = buildRecoveryCandidateProject(
    `danbi-recovery-fallback-e2e-${stamp}`,
    `Recovery Fallback E2E ${stamp}`,
    fallbackUpdatedAt,
  );
  const packageProject = buildRecoveryCandidateProject(
    `danbi-recovery-package-e2e-${stamp}`,
    `Recovery Package E2E ${stamp}`,
    packageUpdatedAt,
  );

  try {
    writeFileSync(packagePath, JSON.stringify(packageProject), 'utf8');

    await page.route('**/api/editor/projects', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }

      await route.fulfill({
        json: {
          projects: [buildRecoveryProjectSummary(savedProject, savedAt)],
        },
      });
    });

    await page.route(`**/api/editor/projects/${savedProject.id}`, async (route) => {
      await route.fulfill({
        json: {
          project: savedProject,
          summary: buildRecoveryProjectSummary(savedProject, savedAt),
        },
      });
    });

    await page.route('**/api/editor/autosave', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }

      await route.fulfill({
        json: {
          autosaves: [buildRecoveryAutosaveSummary(autosaveProject, autosavedAt)],
        },
      });
    });

    await page.route(`**/api/editor/autosave/${autosaveProject.id}`, async (route) => {
      await route.fulfill({
        json: {
          projectId: autosaveProject.id,
          reason: 'recovery-e2e',
          savedAt: autosavedAt,
          summary: buildRecoveryAutosaveSummary(autosaveProject, autosavedAt),
          project: autosaveProject,
        },
      });
    });

    await page.addInitScript((project) => {
      window.localStorage.setItem('danbi-editor-project', JSON.stringify(project));
    }, fallbackProject);

    await openEditor(page);
    await openProjectPanel(page);

    const recoveryPanel = page.getByTestId('project-recovery-panel');
    await recoveryPanel.scrollIntoViewIfNeeded();
    await expect(recoveryPanel).toBeVisible();
    await expect(recoveryPanel).toContainText('Recovery');

    await page.locator('input[accept=".json,application/json"]').setInputFiles(packagePath);
    await expect(page.getByRole('heading', { name: packageProject.name })).toBeVisible();
    await expect(page.getByText('Project package imported')).toBeVisible();

    const savedRow = page.getByTestId(`project-recovery-candidate-database-${savedProject.id}`);
    await expect(savedRow).toContainText(savedProject.name);
    await expect(savedRow).toContainText('Saved');

    const autosaveRow = page.getByTestId(`project-recovery-candidate-autosave-${autosaveProject.id}`);
    await expect(autosaveRow).toContainText(autosaveProject.name);
    await expect(autosaveRow).toContainText('Autosave');

    const fallbackRow = page.getByTestId(`project-recovery-candidate-local-fallback-${fallbackProject.id}`);
    await expect(fallbackRow).toContainText(fallbackProject.name);
    await expect(fallbackRow).toContainText('Fallback');

    const packageRow = page.getByTestId(`project-recovery-candidate-package-import-${packageProject.id}`);
    await expect(packageRow).toContainText(packageProject.name);
    await expect(packageRow).toContainText('Package');

    await fallbackRow.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('heading', { name: fallbackProject.name })).toBeVisible();
    await expect(page.getByText('Project loaded from local fallback')).toBeVisible();

    await autosaveRow.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('heading', { name: autosaveProject.name })).toBeVisible();
    await expect(page.getByText('Autosave restored')).toBeVisible();

    await packageRow.getByRole('button', { name: 'Reopen' }).click();
    await expect(page.getByRole('heading', { name: packageProject.name })).toBeVisible();
    await expect(page.getByText('Project package imported')).toBeVisible();
  } finally {
    await page.evaluate(() => window.localStorage.removeItem('danbi-editor-project')).catch(() => undefined);
    rmSync(packagePath, { force: true });
  }
});

test('queues the current export from a failed saved render plan', async ({ page }) => {
  const stamp = Date.now();
  const mediaName = `render-recovery-${stamp}.mp4`;
  const importsDir = join(process.cwd(), '.danbi', 'imports');
  const mediaPath = join(importsDir, mediaName);
  const project = buildRenderableRenderRecoveryProject(
    `danbi-render-recovery-e2e-${stamp}`,
    `/imports/${mediaName}`,
    mediaPath,
  );
  const queueRequests: Array<{
    project: EditorProject;
    profileId: string;
    priority?: number;
    encoderPreference?: string;
    exportRange?: { start: number; end: number };
  }> = [];
  let latestRenderJob: RenderJobView | null = null;

  try {
    await mkdir(importsDir, { recursive: true });
    generateTestVideo(mediaPath);
    const saveResponse = await page.request.post('/api/editor/projects', {
      data: { project },
    });
    const saveBody = await saveResponse.json().catch(() => ({}));
    expect(saveResponse.ok(), JSON.stringify(saveBody)).toBeTruthy();

    await page.route('**/api/editor/render-jobs**', async (route) => {
      const request = route.request();

      const pathname = new URL(request.url()).pathname;
      if (request.method() === 'GET' && pathname === '/api/editor/render-jobs') {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ jobs: [] }),
        });
        return;
      }

      if (request.method() === 'GET' && pathname.startsWith('/api/editor/render-jobs/')) {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ job: latestRenderJob }),
        });
        return;
      }

      if (request.method() !== 'POST') {
        await route.fulfill({
          status: 405,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Method not allowed' }),
        });
        return;
      }

      const body = request.postDataJSON() as {
        project: EditorProject;
        profileId: string;
        priority?: number;
        encoderPreference?: string;
        exportRange?: { start: number; end: number };
      };
      queueRequests.push(body);
      const plan = buildFfmpegRenderPlan(body.project, body.profileId, undefined, {
        encoderPreference: 'software',
        exportRange: body.exportRange,
      });
      const isRecoveryRequest = queueRequests.length > 1;
      const job = buildMockRenderJob({
        id: isRecoveryRequest ? 'render-e2e-recovered' : 'render-e2e-failed',
        status: isRecoveryRequest ? 'queued' : 'failed',
        priority: body.priority ?? 5,
        plan,
      });
      latestRenderJob = job;

      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ job }),
      });
    });

    await openEditor(page);
    await expect(page.getByRole('link', { name: 'Editor' })).toBeVisible();
    await openProjectPanel(page);
    await page.getByRole('button', { name: 'Refresh' }).click();

    const savedProject = page.getByRole('button', { name: new RegExp(project.name) });
    await expect(savedProject).toBeVisible();
    await savedProject.click();
    await expect(page.getByText('Project loaded from database')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Render', exact: true })).toBeEnabled();

    await page.getByRole('button', { name: 'Render', exact: true }).click();
    await expect(page.getByTestId('render-job-status')).toHaveText('failed');
    await page.getByRole('button', { name: /^E\s+Export$/i }).click();
    const retryCurrentExport = page.getByRole('button', { name: 'Retry current export' });
    await expect(retryCurrentExport).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Queue current export' })).toBeHidden();

    await retryCurrentExport.click();
    await expect(page.getByTestId('render-job-status')).toHaveText('queued');
    await expect(page.getByRole('button', { name: 'Queue current export' })).toBeHidden();
    await expect(page.getByTestId('render-command-preview')).toContainText('ffmpeg');

    expect(queueRequests).toHaveLength(2);
    expect(queueRequests[0].profileId).toBe(DEFAULT_EXPORT_PROFILE_ID);
    expect(queueRequests[1].profileId).toBe(DEFAULT_EXPORT_PROFILE_ID);
    expect(queueRequests[1].project.id).toBe(queueRequests[0].project.id);
    expect(queueRequests[1].encoderPreference).toBe('auto');
  } finally {
    await page.request.delete(`/api/editor/projects/${project.id}`).catch(() => undefined);
    await rm(mediaPath, { force: true }).catch(() => undefined);
  }
});

test('renders decoded preview worker frames in the Program Monitor while scrubbed', async ({ page }) => {
  await installPreviewWorkerFrameMock(page);
  await openEditor(page);

  const programMonitor = page.getByTestId('program-monitor');
  await expectProgramMonitorCompositeReady(page);

  const workerFrame = programMonitor.getByTestId('program-worker-frame-clip-interview-1');
  await expect(workerFrame).toBeVisible({ timeout: 15_000 });
  await expect(workerFrame).toHaveAttribute('src', /^blob:/);
  await expect(programMonitor.getByText(/decoded \/ 0 failed \/ 0 unsupported/)).toBeVisible();
});

test('renders a real WebCodecs preview worker frame for imported progressive MP4 when supported', async ({ page }) => {
  test.setTimeout(60_000);
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-real-worker-'));
  const mediaName = `playwright-real-worker-${Date.now()}.mp4`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    generateTestVideo(mediaPath);
    await expectRealWebCodecsPreviewWorkerFrame(page, mediaName, mediaPath);
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('renders a real WebCodecs preview worker frame for imported QuickTime QT when supported', async ({ page }) => {
  test.setTimeout(60_000);
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-real-worker-qt-'));
  const mediaName = `playwright-real-worker-qt-${Date.now()}.qt`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    generateQuickTimeCompatibleTestVideo(mediaPath);
    await expectRealWebCodecsPreviewWorkerFrame(page, mediaName, mediaPath, 'avc1.42E01E', 0.1, /Worker decoded video through WebCodecs/);
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('renders a real WebCodecs preview worker frame for imported fragmented MP4 when supported', async ({ page }) => {
  test.setTimeout(60_000);
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-real-worker-fragmented-'));
  const mediaName = `playwright-real-worker-fragmented-${Date.now()}.mp4`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    generateFragmentedTestVideo(mediaPath);
    await expectRealWebCodecsPreviewWorkerFrame(page, mediaName, mediaPath);
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('renders a real WebCodecs preview worker frame for imported MP4 with edit-list timing when supported', async ({ page }) => {
  test.setTimeout(60_000);
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-real-worker-edit-list-'));
  const mediaName = `playwright-real-worker-edit-list-${Date.now()}.mp4`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    generateEditListTestVideo(mediaPath);
    await expectRealWebCodecsPreviewWorkerFrame(page, mediaName, mediaPath);
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('renders a real WebCodecs preview worker frame for imported rotated MP4 when supported', async ({ page }) => {
  test.setTimeout(60_000);
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-real-worker-rotated-'));
  const mediaName = `playwright-real-worker-rotated-${Date.now()}.mp4`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    generateRotatedMp4TestVideo(mediaPath);
    await expectRealWebCodecsPreviewWorkerFrame(page, mediaName, mediaPath, 'avc1.42C00B', 0.1, /MP4 90deg orientation metadata/);
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('renders a real WebCodecs preview worker frame for imported MP4 H.265 when supported', async ({ page }) => {
  test.setTimeout(90_000);
  await openEditor(page);
  const hevcCodec = 'hvc1.1.6.L93.B0';
  const supportsPreviewWorkerDecode = await supportsWorkerWebCodecsCodec(page, hevcCodec);
  test.skip(!supportsPreviewWorkerDecode, `This browser build does not expose worker WebCodecs ${hevcCodec} decode support.`);

  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-real-worker-hevc-'));
  const mediaName = `playwright-real-worker-hevc-${Date.now()}.mp4`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    const generated = tryGenerateH265TestVideo(mediaPath);
    test.skip(!generated.ok, generated.error ?? 'ffmpeg failed to generate Playwright MP4 H.265 import media');
    await expectRealWebCodecsPreviewWorkerFrame(page, mediaName, mediaPath, hevcCodec, 0.1, /Worker decoded video through WebCodecs/);
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('renders a real WebCodecs preview worker frame for imported MP4 AV1 when supported', async ({ page }) => {
  test.setTimeout(90_000);
  await openEditor(page);
  const av1Codec = 'av01.0.04M.08';
  const supportsPreviewWorkerDecode = await supportsWorkerWebCodecsCodec(page, av1Codec);
  test.skip(!supportsPreviewWorkerDecode, `This browser build does not expose worker WebCodecs ${av1Codec} decode support.`);

  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-real-worker-mp4-av1-'));
  const mediaName = `playwright-real-worker-mp4-av1-${Date.now()}.mp4`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    const generated = tryGenerateMp4Av1TestVideo(mediaPath);
    test.skip(!generated.ok, generated.error ?? 'ffmpeg failed to generate Playwright MP4 AV1 import media');
    await expectRealWebCodecsPreviewWorkerFrame(page, mediaName, mediaPath, av1Codec, 0.1, /Worker decoded video through WebCodecs/);
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('renders a real WebCodecs preview worker frame for imported MP4 VP9 when supported', async ({ page }) => {
  test.setTimeout(60_000);
  await openEditor(page);
  const vp9Codec = 'vp09.00.10.08';
  const supportsPreviewWorkerDecode = await supportsWorkerWebCodecsCodec(page, vp9Codec);
  test.skip(!supportsPreviewWorkerDecode, `This browser build does not expose worker WebCodecs ${vp9Codec} decode support.`);

  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-real-worker-mp4-vp9-'));
  const mediaName = `playwright-real-worker-mp4-vp9-${Date.now()}.mp4`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    const generated = tryGenerateMp4Vp9TestVideo(mediaPath);
    test.skip(!generated.ok, generated.error ?? 'ffmpeg failed to generate Playwright MP4 VP9 import media');
    await expectRealWebCodecsPreviewWorkerFrame(page, mediaName, mediaPath, vp9Codec, 0.1, /Worker decoded video through WebCodecs/);
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('renders a real WebCodecs preview worker frame for imported MP4 VP8 when supported', async ({ page }) => {
  test.setTimeout(60_000);
  await openEditor(page);
  const vp8Codec = 'vp8';
  const supportsPreviewWorkerDecode = await supportsWorkerWebCodecsCodec(page, vp8Codec);
  test.skip(!supportsPreviewWorkerDecode, `This browser build does not expose worker WebCodecs ${vp8Codec} decode support.`);

  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-real-worker-mp4-vp8-'));
  const mediaName = `playwright-real-worker-mp4-vp8-${Date.now()}.mp4`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    const generated = tryGenerateMp4Vp8TestVideo(mediaPath);
    test.skip(!generated.ok, generated.error ?? 'ffmpeg failed to generate Playwright MP4 VP8 import media');
    await expectRealWebCodecsPreviewWorkerFrame(page, mediaName, mediaPath, vp8Codec, 0.1, /Worker decoded video through WebCodecs/);
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('renders a real WebCodecs preview worker frame for imported Matroska H.264 when supported', async ({ page }) => {
  test.setTimeout(60_000);
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-real-worker-matroska-h264-'));
  const mediaName = `playwright-real-worker-matroska-h264-${Date.now()}.mkv`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    generateMatroskaH264TestVideo(mediaPath);
    await expectRealWebCodecsPreviewWorkerFrame(page, mediaName, mediaPath, 'avc1.42C01E', 0.1, /Matroska H\.264 video through WebCodecs/);
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('renders a real WebCodecs preview worker frame for imported Matroska H.265 when supported', async ({ page }) => {
  test.setTimeout(90_000);
  await openEditor(page);
  const hevcCodec = 'hvc1.1.6.L93.B0';
  const supportsPreviewWorkerDecode = await supportsWorkerWebCodecsCodec(page, hevcCodec);
  test.skip(!supportsPreviewWorkerDecode, `This browser build does not expose worker WebCodecs ${hevcCodec} decode support.`);

  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-real-worker-matroska-h265-'));
  const mediaName = `playwright-real-worker-matroska-h265-${Date.now()}.mkv`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    const generated = tryGenerateMatroskaH265TestVideo(mediaPath);
    test.skip(!generated.ok, generated.error ?? 'ffmpeg failed to generate Playwright Matroska H.265 import media');
    await expectRealWebCodecsPreviewWorkerFrame(page, mediaName, mediaPath, hevcCodec, 0.1, /Matroska H\.265 video through WebCodecs/);
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('renders a real WebCodecs preview worker frame for imported WebM VP8 when supported', async ({ page }) => {
  test.setTimeout(60_000);
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-real-worker-webm-'));
  const mediaName = `playwright-real-worker-webm-${Date.now()}.webm`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    generateWebmVp8TestVideo(mediaPath);
    await expectRealWebCodecsPreviewWorkerFrame(page, mediaName, mediaPath, 'vp8');
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('renders a real WebCodecs preview worker frame for imported WebM VP9 when supported', async ({ page }) => {
  test.setTimeout(60_000);
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-real-worker-webm-vp9-'));
  const mediaName = `playwright-real-worker-webm-vp9-${Date.now()}.webm`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    generateWebmVp9TestVideo(mediaPath);
    await expectRealWebCodecsPreviewWorkerFrame(page, mediaName, mediaPath, 'vp09.00.10.08');
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('renders a real WebCodecs preview worker frame for imported WebM AV1 when supported', async ({ page }) => {
  test.setTimeout(90_000);
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-real-worker-webm-av1-'));
  const mediaName = `playwright-real-worker-webm-av1-${Date.now()}.webm`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    generateWebmAv1TestVideo(mediaPath);
    await expectRealWebCodecsPreviewWorkerFrame(page, mediaName, mediaPath, 'av01.0.04M.08');
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('renders a real WebCodecs preview worker frame for imported Xiph-laced WebM VP8 when supported', async ({ page }) => {
  test.setTimeout(60_000);
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-real-worker-webm-xiph-laced-'));
  const mediaName = `playwright-real-worker-webm-xiph-laced-${Date.now()}.webm`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    generateWebmVp8LacedTestVideo(mediaPath, 'xiph');
    await expectRealWebCodecsPreviewWorkerFrame(page, mediaName, mediaPath, 'vp8', 0.1, /Worker decoded WebM video through WebCodecs/);
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('renders a real WebCodecs preview worker frame for imported fixed-laced WebM VP8 when supported', async ({ page }) => {
  test.setTimeout(60_000);
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-real-worker-webm-fixed-laced-'));
  const mediaName = `playwright-real-worker-webm-fixed-laced-${Date.now()}.webm`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    generateWebmVp8LacedTestVideo(mediaPath, 'fixed');
    await expectRealWebCodecsPreviewWorkerFrame(page, mediaName, mediaPath, 'vp8', 0.3, /Worker decoded WebM video through WebCodecs/);
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('renders a real WebCodecs preview worker frame for imported EBML-laced WebM VP8 when supported', async ({ page }) => {
  test.setTimeout(60_000);
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-real-worker-webm-ebml-laced-'));
  const mediaName = `playwright-real-worker-webm-ebml-laced-${Date.now()}.webm`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    generateWebmVp8LacedTestVideo(mediaPath, 'ebml');
    await expectRealWebCodecsPreviewWorkerFrame(page, mediaName, mediaPath, 'vp8', 0.1, /Worker decoded WebM video through WebCodecs/);
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('loads and edits a 30 minute project through the editor UI', async ({ page }) => {
  test.setTimeout(90_000);
  const stamp = Date.now();
  const project = {
    ...buildLongFormEditorProject(),
    id: `danbi-long-form-e2e-${stamp}`,
    name: `Danbi Long Form E2E ${stamp}`,
    updatedAt: new Date().toISOString(),
  };

  try {
    const saveResponse = await page.request.post('/api/editor/projects', {
      data: { project },
    });
    expect(saveResponse.ok()).toBeTruthy();

    await openEditor(page);
    await expect(page.getByRole('link', { name: 'Editor' })).toBeVisible();
    await openProjectPanel(page);
    await page.getByRole('button', { name: 'Refresh' }).click();

    const savedProject = page.getByRole('button', { name: new RegExp(project.name) });
    await expect(savedProject).toBeVisible();
    await expect(savedProject).toContainText('78 clips / 1800s');
    await savedProject.click();

    await expect(page.getByText('Project loaded from database')).toBeVisible();
    await expect(page.getByRole('heading', { name: project.name })).toBeVisible();

    const timelinePlayhead = page.getByRole('slider', { name: 'Timeline playhead' });
    await expect(timelinePlayhead).toHaveAttribute('max', '1800');
    await setRangeInputValue(timelinePlayhead, 301);

    const programMonitor = page.getByTestId('program-monitor');
    await expectProgramMonitorCompositeReady(page);
    await expect(programMonitor.getByTestId('program-stack-summary')).toHaveText('1 media / 1 text / 1 caption / 2 audio');
    await expect(programMonitor.getByTestId('program-visual-layer-track-long-v1-clip-long-v1-010')).toBeVisible();
    await expect(programMonitor.getByTestId('program-audio-layer-track-long-a1-clip-long-a1-002')).toBeVisible();
    await expect(programMonitor.getByText('Range export caption')).toBeVisible();

    const longFormLane = page.getByTestId('timeline-lane-track-long-v1');
    await longFormLane.click({ position: { x: 12, y: 12 } });
    await page.getByRole('spinbutton', { name: 'Gap s' }).fill('5');
    await page.getByRole('button', { name: 'Insert Gap' }).last().click();

    await expect(page.getByText('Inserted 5s gap')).toBeVisible();
    await expect(timelinePlayhead).toHaveAttribute('max', '1805');

    await page.keyboard.press('Control+Z');
    await expect(timelinePlayhead).toHaveAttribute('max', '1800');
  } finally {
    await page.request.delete(`/api/editor/projects/${project.id}`);
  }
});

test('updates Program Monitor composite when track mute and solo states change', async ({ page }) => {
  await openEditor(page);

  const programMonitor = page.getByTestId('program-monitor');
  await expectProgramMonitorCompositeReady(page);

  const timelinePlayhead = page.locator('input[type="range"][max="92"]').first();
  await setRangeInputValue(timelinePlayhead, 20);

  const stackSummary = programMonitor.getByTestId('program-stack-summary');
  const aRollVisualLayer = programMonitor.getByTestId('program-visual-layer-track-v1-clip-interview-1');
  const aRollAudioLayer = programMonitor.getByTestId('program-audio-layer-track-v1-clip-interview-1');
  const musicAudioLayer = programMonitor.getByTestId('program-audio-layer-track-a1-clip-music-1');

  await expect(stackSummary).toHaveText('1 media / 0 text / 1 caption / 2 audio');
  await expect(aRollVisualLayer).toBeVisible();
  await expect(aRollAudioLayer).toBeVisible();
  await expect(musicAudioLayer).toBeVisible();

  const aRollMute = page.getByRole('button', { name: 'A-roll mute', exact: true });
  await expect(aRollMute).toHaveAttribute('aria-pressed', 'false');
  await aRollMute.click();

  await expect(page.getByText('Track muted toggled')).toBeVisible();
  await expect(aRollMute).toHaveAttribute('aria-pressed', 'true');
  await expect(stackSummary).toHaveText('0 media / 0 text / 1 caption / 1 audio');
  await expect(aRollVisualLayer).toBeHidden();
  await expect(aRollAudioLayer).toBeHidden();
  await expect(musicAudioLayer).toBeVisible();

  await aRollMute.click();
  await expect(aRollMute).toHaveAttribute('aria-pressed', 'false');
  await expect(stackSummary).toHaveText('1 media / 0 text / 1 caption / 2 audio');
  await expect(aRollVisualLayer).toBeVisible();
  await expect(aRollAudioLayer).toBeVisible();

  const musicSolo = page.getByRole('button', { name: 'Music solo', exact: true });
  await expect(musicSolo).toHaveAttribute('aria-pressed', 'false');
  await musicSolo.click();

  await expect(page.getByText('Track solo toggled')).toBeVisible();
  await expect(musicSolo).toHaveAttribute('aria-pressed', 'true');
  await expect(stackSummary).toHaveText('1 media / 0 text / 1 caption / 1 audio');
  await expect(aRollVisualLayer).toBeVisible();
  await expect(aRollAudioLayer).toBeHidden();
  await expect(musicAudioLayer).toBeVisible();

  await musicSolo.click();
  await expect(musicSolo).toHaveAttribute('aria-pressed', 'false');
  await expect(stackSummary).toHaveText('1 media / 0 text / 1 caption / 2 audio');
  await expect(aRollAudioLayer).toBeVisible();

  const aRollLock = page.getByRole('button', { name: 'A-roll lock', exact: true });
  await expect(aRollLock).toHaveAttribute('aria-pressed', 'false');
  await aRollLock.click();

  await expect(page.getByText('Track locked toggled')).toBeVisible();
  await expect(aRollLock).toHaveAttribute('aria-pressed', 'true');
  await expect(stackSummary).toHaveText('1 media / 0 text / 1 caption / 2 audio');
  await expect(aRollVisualLayer).toBeVisible();
  await expect(aRollAudioLayer).toBeVisible();
  await expect(musicAudioLayer).toBeVisible();
});

test('edits selected clip gain in dB and updates Program Monitor audio layer', async ({ page }) => {
  await openEditor(page);

  const musicClip = page.getByRole('button', { name: 'Timeline clip Music bed' });
  await musicClip.click();
  await expect(musicClip).toHaveAttribute('aria-pressed', 'true');

  const gainInput = page.getByRole('spinbutton', { name: 'Gain dB' });
  await expect(gainInput).toBeVisible();
  await expect(gainInput).toHaveValue('0');

  await gainInput.fill('-6');

  await expect(page.getByText('Clip gain updated')).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Volume' })).toHaveValue('0.501');
  await showProgramDiagnostics(page.getByTestId('program-monitor'));
  await expect(page.getByTestId('program-audio-layer-track-a1-clip-music-1')).toContainText('16% Center');
});

test('runs a real timeline edit through the command palette', async ({ page }) => {
  await openEditor(page);

  await expect(page.getByRole('link', { name: 'Editor' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Commands' })).toBeVisible();
  await openSourceMonitor(page);
  await expect(page.getByText(/H 0 \/ R 0/)).toBeVisible();

  await page.getByRole('button', { name: 'Commands' }).click();
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();

  await page.getByPlaceholder('Search commands').fill('insert gap');
  await expect(page.getByRole('button', { name: /Insert timeline gap/i })).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden();
  await expect(page.getByText('Inserted 1s gap')).toBeVisible();
  await expect(page.getByText(/H 1 \/ R 0/)).toBeVisible();

  await page.keyboard.press('Control+Z');
  await expect(page.getByText(/H 0 \/ R 1/)).toBeVisible();
});

test('runs media cache commands through the command palette', async ({ page }) => {
  await openEditor(page);

  await page.getByRole('button', { name: 'Timeline clip Music bed' }).click();
  await runPaletteCommand(page, 'cache selected media', /Cache selected clip media/i);
  await expect(page.getByText('No cacheable selected media; 1 skipped')).toBeVisible();

  await runPaletteCommand(page, 'cache active preview', /Cache active preview media/i);
  await expect(page.getByText('No cacheable preview assets; 1 skipped')).toBeVisible();
});

test('imports a real browser media file into the editor', async ({ page }) => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-media-'));
  const mediaName = `playwright-tone-${Date.now()}.wav`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    generateTestAudio(mediaPath);
    await openEditor(page);

    await page.getByTestId('editor-media-file-input').setInputFiles(mediaPath);

    await expectBrowserMediaImported(page, mediaName);
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});
test('imports browser media from Korean, spaced, and long local paths', async ({ page }) => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-\uD55C\uAE00 \uACBD\uB85C-'));
  const nestedDir = join(
    tempRoot,
    '\uD55C\uAE00 \uD3F4\uB354',
    '\uACF5\uBC31 \uD3EC\uD568 \uD504\uB85C\uC81D\uD2B8',
    'long-local-path-segment-for-editor-import-coverage',
  );
  const mediaName = `\uD55C\uAE00 \uACF5\uBC31 \uAE34 \uB85C\uCEEC \uACBD\uB85C \uD14C\uC2A4\uD2B8 ${Date.now()}.wav`;
  const mediaPath = join(nestedDir, mediaName);

  try {
    await mkdir(nestedDir, { recursive: true });
    generateTestAudio(mediaPath);
    expect(mediaPath.length).toBeGreaterThan(120);

    await openEditor(page);
    await page.getByTestId('editor-media-file-input').setInputFiles(mediaPath);

    await expectBrowserMediaImported(page, mediaName);
    await page.getByRole('button', { name: `Insert ${mediaName}` }).click();

    await expect(page.getByText('Asset inserted at playhead')).toBeVisible();
    const insertedClip = page.getByRole('button', { name: `Timeline clip ${mediaName}` });
    await expect(insertedClip).toBeVisible();

    await page.keyboard.press('Control+Z');
    await expect(insertedClip).toBeHidden();
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('imports ten mixed browser media files without freezing the media bin', async ({ page }) => {
  test.setTimeout(90000);
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-mixed-media-'));
  const timestamp = Date.now();
  const mediaFiles = [
    ...Array.from({ length: 4 }, (_, index) => ({
      name: `playwright-mixed-audio-${timestamp}-${index + 1}.wav`,
      kind: 'audio' as const,
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      name: `playwright-mixed-video-${timestamp}-${index + 1}.mp4`,
      kind: 'video' as const,
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      name: `playwright-mixed-image-${timestamp}-${index + 1}.png`,
      kind: 'image' as const,
    })),
  ];

  try {
    for (const file of mediaFiles) {
      const mediaPath = join(tempRoot, file.name);
      if (file.kind === 'audio') {
        generateTestAudio(mediaPath);
      } else if (file.kind === 'video') {
        generateTestVideo(mediaPath);
      } else {
        generateTestImage(mediaPath);
      }
    }

    await openEditor(page);

    await page.getByTestId('editor-media-file-input').setInputFiles(mediaFiles.map((file) => join(tempRoot, file.name)));

    for (const file of mediaFiles) {
      await expect(page.getByRole('button', { name: `Insert ${file.name}` })).toBeVisible({ timeout: 30000 });
      await expect(page.getByRole('button', { name: `Overwrite ${file.name}` })).toBeVisible();
    }

    const sourceScopeImage = mediaFiles.find((file) => file.kind === 'image')!;
    await page.getByRole('button', { name: `Open ${sourceScopeImage.name} in Source Monitor` }).click();
    const sourceMonitor = page.getByRole('button', { name: /^Source Monitor/ });
    await showSourceDiagnostics(sourceMonitor);
    await expect(sourceMonitor.getByTestId('source-video-scopes')).toBeVisible();
    await expect(sourceMonitor.getByTestId('source-video-scope-status')).not.toHaveText('');

    await expect(page.getByRole('button', { name: 'Commands' })).toBeEnabled();
    await page.getByRole('button', { name: 'Commands' }).click();
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
    await page.getByPlaceholder('Search commands').fill('insert gap');
    await expect(page.getByRole('button', { name: /Insert timeline gap/i })).toBeVisible();
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('inserts an imported browser media file onto the timeline', async ({ page }) => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-insert-'));
  const mediaName = `playwright-insert-tone-${Date.now()}.wav`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    generateTestAudio(mediaPath);
    await openEditor(page);

    await page.getByTestId('editor-media-file-input').setInputFiles(mediaPath);

    await expectBrowserMediaImported(page, mediaName);
    await page.getByRole('button', { name: `Insert ${mediaName}` }).click();

    await expect(page.getByText('Asset inserted at playhead')).toBeVisible();
    const insertedClip = page.getByRole('button', { name: `Timeline clip ${mediaName}` });
    await expect(insertedClip).toBeVisible();
    await expect(insertedClip).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('1 selected / 0 clips / no attrs')).toBeVisible();

    await page.keyboard.press('Control+Z');
    await expect(insertedClip).toBeHidden();
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('overwrites an imported browser media file onto the timeline', async ({ page }) => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-overwrite-'));
  const mediaName = `playwright-overwrite-tone-${Date.now()}.wav`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    generateTestAudio(mediaPath);
    await openEditor(page);

    await page.getByTestId('editor-media-file-input').setInputFiles(mediaPath);

    await expectBrowserMediaImported(page, mediaName);
    await page.getByRole('button', { name: `Overwrite ${mediaName}` }).click();

    await expect(page.getByText('Asset overwritten at playhead')).toBeVisible();
    const overwrittenClip = page.getByRole('button', { name: `Timeline clip ${mediaName}` });
    await expect(overwrittenClip).toBeVisible();
    await expect(overwrittenClip).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('1 selected / 0 clips / no attrs')).toBeVisible();

    await page.keyboard.press('Control+Z');
    await expect(overwrittenClip).toBeHidden();
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('runs 3-point overwrite from the command palette', async ({ page }) => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-palette-overwrite-'));
  const mediaName = `playwright-palette-overwrite-tone-${Date.now()}.wav`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    generateTestAudio(mediaPath);
    await openEditor(page);

    await page.getByTestId('editor-media-file-input').setInputFiles(mediaPath);

    await expectBrowserMediaImported(page, mediaName);
    await page.getByRole('button', { name: `Open ${mediaName} in Source Monitor` }).click();

    await page.getByRole('button', { name: 'Commands' }).click();
    await page.getByPlaceholder('Search commands').fill('3p overwrite');
    await expect(page.getByRole('button', { name: /3-point overwrite edit/i })).toBeVisible();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden();
    await expect(page.getByText('3-point overwrite edit').first()).toBeVisible();
    const overwrittenClip = page.getByRole('button', { name: `Timeline clip ${mediaName}` });
    await expect(overwrittenClip).toBeVisible();
    await expect(overwrittenClip).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Control+Z');
    await expect(overwrittenClip).toBeHidden();
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('lifts and extracts a marked timeline range from editor commands', async ({ page }) => {
  await openEditor(page);

  const cityClip = page.getByRole('button', { name: 'Timeline clip Generated city cutaway' });
  await expect(cityClip).toBeVisible();
  await cityClip.click();
  await expect(cityClip).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('x');
  await expect(page.getByText('Marked selection 00:00:18:00 - 00:00:26:00')).toBeVisible();

  await page.getByRole('button', { name: 'Commands' }).click();
  await page.getByPlaceholder('Search commands').fill('lift marked');
  await expect(page.getByRole('button', { name: /Lift marked range/i })).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden();
  await expect(page.getByText('Lifted marked range')).toBeVisible();
  await expect(cityClip).toBeHidden();

  await page.keyboard.press('Control+Z');
  await expect(cityClip).toBeVisible();
  await cityClip.click();
  await page.keyboard.press('x');
  await expect(page.getByText('Marked selection 00:00:18:00 - 00:00:26:00')).toBeVisible();

  await page.keyboard.press('Quote');
  await expect(page.getByText('Extracted marked range')).toBeVisible();
  await expect(cityClip).toBeHidden();

  await page.keyboard.press('Control+Z');
  await expect(cityClip).toBeVisible();
});

test('switches insert and overwrite edit modes from commands', async ({ page }) => {
  await openEditor(page);

  const editModeSelect = page.getByRole('combobox', { name: 'Paste mode' });
  await expect(editModeSelect).toHaveValue('insert');

  await page.keyboard.press('e');
  await expect(editModeSelect).toHaveValue('overwrite');
  await expect(page.getByText('Edit mode: Overwrite')).toBeVisible();

  await page.getByRole('button', { name: 'Commands' }).click();
  await page.getByPlaceholder('Search commands').fill('insert mode');
  await expect(page.getByRole('button', { name: /Set insert edit mode/i })).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden();
  await expect(editModeSelect).toHaveValue('insert');
  await expect(page.getByText('Edit mode: Insert')).toBeVisible();
});

test('sets and jumps source monitor marks with active monitor shortcuts', async ({ page }) => {
  await openEditor(page);
  await openSourceMonitor(page);

  const sourceMonitor = page.getByRole('button', { name: /^Source Monitor/ });
  await expect(sourceMonitor).toBeVisible();
  await showSourceDiagnostics(sourceMonitor);
  await expect(sourceMonitor.getByTestId('source-audio-meter')).toBeVisible();
  await expect(sourceMonitor.getByTestId('source-audio-meter-status')).toContainText(/meter pending|Hot|CLIP|dB/);
  await sourceMonitor.click({ position: { x: 12, y: 12 } });

  const sourceSlider = sourceMonitor.getByRole('slider').first();
  await setRangeInputValue(sourceSlider, 4);
  await expect(sourceMonitor.getByText(/00:00:04:00 \/ 00:01:18:00/)).toBeVisible();
  await sourceMonitor.click({ position: { x: 12, y: 12 } });
  await page.keyboard.press('i');
  await expect(page.getByText('Source in set at 00:00:04:00')).toBeVisible();

  await setRangeInputValue(sourceSlider, 9);
  await expect(sourceMonitor.getByText(/00:00:09:00 \/ 00:01:18:00/)).toBeVisible();
  await sourceMonitor.click({ position: { x: 12, y: 12 } });
  await page.keyboard.press('o');
  await expect(page.getByText('Source out set at 00:00:09:00')).toBeVisible();

  await setRangeInputValue(sourceSlider, 1);
  await expect(sourceMonitor.getByText(/00:00:01:00 \/ 00:01:18:00/)).toBeVisible();
  await sourceMonitor.click({ position: { x: 12, y: 12 } });
  await page.keyboard.press('Shift+I');
  await expect(page.getByText('Source in 00:00:04:00')).toBeVisible();

  await page.keyboard.press('Shift+O');
  await expect(page.getByText('Source out 00:00:09:00')).toBeVisible();

  await page.keyboard.press('Shift+X');
  await expect(page.getByText('Source range reset')).toBeVisible();
  await expect(sourceMonitor.getByText(/I 00:00:00:00 \/ O 00:01:18:00/)).toBeVisible();
});

test('trims source monitor range with draggable I/O handles', async ({ page }) => {
  await openEditor(page);
  await openSourceMonitor(page);

  const sourceMonitor = page.getByRole('button', { name: /^Source Monitor/ });
  await expect(sourceMonitor).toBeVisible();
  await sourceMonitor.click({ position: { x: 12, y: 12 } });

  const rail = sourceMonitor.getByTestId('source-range-rail');
  const railBox = await rail.boundingBox();
  expect(railBox).not.toBeNull();
  if (!railBox) {
    throw new Error('Expected source range rail to be measurable.');
  }

  const sourceInHandle = sourceMonitor.getByRole('button', { name: 'Drag source In point' });
  const sourceOutHandle = sourceMonitor.getByRole('button', { name: 'Drag source Out point' });
  const sourceInBox = await sourceInHandle.boundingBox();
  const sourceOutBox = await sourceOutHandle.boundingBox();
  expect(sourceInBox).not.toBeNull();
  expect(sourceOutBox).not.toBeNull();
  if (!sourceInBox || !sourceOutBox) {
    throw new Error('Expected source range handles to be measurable.');
  }

  const dragY = railBox.y + railBox.height / 2;
  await page.mouse.move(sourceInBox.x + sourceInBox.width / 2, sourceInBox.y + sourceInBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(railBox.x + railBox.width * (4 / 78), dragY, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText('Source in trimmed to 00:00:04:00')).toBeVisible();
  await expect(sourceMonitor.getByText(/I 00:00:04:00 \/ O 00:01:18:00/)).toBeVisible();

  const updatedRailBox = await rail.boundingBox();
  const updatedSourceOutBox = await sourceOutHandle.boundingBox();
  expect(updatedRailBox).not.toBeNull();
  expect(updatedSourceOutBox).not.toBeNull();
  if (!updatedRailBox || !updatedSourceOutBox) {
    throw new Error('Expected source range rail and out handle to remain measurable after trimming source in.');
  }

  const updatedDragY = updatedRailBox.y + updatedRailBox.height / 2;
  await page.mouse.move(updatedSourceOutBox.x + updatedSourceOutBox.width / 2, updatedSourceOutBox.y + updatedSourceOutBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(updatedRailBox.x + updatedRailBox.width * (10 / 78), updatedDragY, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText('Source out trimmed to 00:00:10:00')).toBeVisible();
  await expect(sourceMonitor.getByText(/I 00:00:04:00 \/ O 00:00:10:00/)).toBeVisible();
});

test('nudges the active source monitor playhead with arrow shortcuts', async ({ page }) => {
  await openEditor(page);
  await openSourceMonitor(page);

  const sourceMonitor = page.getByRole('button', { name: /^Source Monitor/ });
  await expect(sourceMonitor).toBeVisible();
  await sourceMonitor.click({ position: { x: 12, y: 12 } });

  await page.keyboard.press('ArrowRight');
  await expect(sourceMonitor.getByText(/00:00:00:01 \/ 00:01:18:00/)).toBeVisible();

  await page.keyboard.press('Shift+ArrowRight');
  await expect(sourceMonitor.getByText(/00:00:01:01 \/ 00:01:18:00/)).toBeVisible();

  await page.keyboard.press('ArrowLeft');
  await expect(sourceMonitor.getByText(/00:00:01:00 \/ 00:01:18:00/)).toBeVisible();

  await page.keyboard.press('End');
  await expect(sourceMonitor.getByText(/00:01:18:00 \/ 00:01:18:00/)).toBeVisible();
  await expect(page.getByText('Source end 00:01:18:00')).toBeVisible();

  await page.keyboard.press('Home');
  await expect(sourceMonitor.getByText(/00:00:00:00 \/ 00:01:18:00/)).toBeVisible();
  await expect(page.getByText('Source start 00:00:00:00')).toBeVisible();
});

test('toggles source monitor playback with Space when source is active', async ({ page }) => {
  await openEditor(page);
  await openSourceMonitor(page);

  const sourceMonitor = page.getByRole('button', { name: /^Source Monitor/ });
  await expect(sourceMonitor).toBeVisible();
  await expect(sourceMonitor.getByText('stopped').first()).toBeVisible();

  await sourceMonitor.click({ position: { x: 12, y: 12 } });
  await page.keyboard.press('Space');
  await expect(sourceMonitor.getByText('x1').first()).toBeVisible();
  await expect(page.getByText('source +1x')).toBeVisible();

  await page.keyboard.press('Space');
  await expect(sourceMonitor.getByText('stopped').first()).toBeVisible();
  await expect(page.getByText('source paused')).toBeVisible();
});

test('loops the active source monitor range from shortcuts and commands', async ({ page }) => {
  await openEditor(page);
  await openSourceMonitor(page);

  const sourceMonitor = page.getByRole('button', { name: /^Source Monitor/ });
  await expect(sourceMonitor).toBeVisible();
  await sourceMonitor.click({ position: { x: 12, y: 12 } });

  const sourceSlider = sourceMonitor.getByRole('slider').first();
  await setRangeInputValue(sourceSlider, 4);
  await page.keyboard.press('i');
  await expect(page.getByText('Source in set at 00:00:04:00')).toBeVisible();

  await setRangeInputValue(sourceSlider, 9);
  await page.keyboard.press('o');
  await expect(page.getByText('Source out set at 00:00:09:00')).toBeVisible();

  await setRangeInputValue(sourceSlider, 1);
  await expect(sourceMonitor.getByText(/00:00:01:00 \/ 00:01:18:00/)).toBeVisible();
  await page.keyboard.press('Shift+L');
  await expect(page.getByText('Source loop on')).toBeVisible();
  await expect(sourceMonitor.getByText(/00:00:04:00 \/ 00:01:18:00/)).toBeVisible();

  await page.keyboard.press('Shift+L');
  await expect(page.getByText('Source loop off')).toBeVisible();

  await runPaletteCommand(page, 'loop source range', /Loop source range/i);
  await expect(page.getByText('Source loop on')).toBeVisible();
  await expect(sourceMonitor.getByRole('button', { name: 'Loop' })).toHaveClass(/border-emerald-500/);
});

test('sets and jumps source monitor marks from the command palette', async ({ page }) => {
  await openEditor(page);
  await openSourceMonitor(page);

  const sourceMonitor = page.getByRole('button', { name: /^Source Monitor/ });
  await expect(sourceMonitor).toBeVisible();

  const sourceSlider = sourceMonitor.getByRole('slider').first();
  await setRangeInputValue(sourceSlider, 6);
  await expect(sourceMonitor.getByText(/00:00:06:00 \/ 00:01:18:00/)).toBeVisible();
  await runPaletteCommand(page, 'set source in', /Set source In point/i);
  await expect(page.getByText('Source in set at 00:00:06:00')).toBeVisible();

  await setRangeInputValue(sourceSlider, 11);
  await expect(sourceMonitor.getByText(/00:00:11:00 \/ 00:01:18:00/)).toBeVisible();
  await runPaletteCommand(page, 'set source out', /Set source Out point/i);
  await expect(page.getByText('Source out set at 00:00:11:00')).toBeVisible();

  await setRangeInputValue(sourceSlider, 2);
  await expect(sourceMonitor.getByText(/00:00:02:00 \/ 00:01:18:00/)).toBeVisible();
  await runPaletteCommand(page, 'go source in', /Go to source In point/i);
  await expect(page.getByText('Source in 00:00:06:00')).toBeVisible();
  await expect(sourceMonitor.getByText(/00:00:06:00 \/ 00:01:18:00/)).toBeVisible();

  await runPaletteCommand(page, 'go source out', /Go to source Out point/i);
  await expect(page.getByText('Source out 00:00:11:00')).toBeVisible();
  await expect(sourceMonitor.getByText(/00:00:11:00 \/ 00:01:18:00/)).toBeVisible();

  await runPaletteCommand(page, 'go source start', /Go to source start/i);
  await expect(page.getByText('Source start 00:00:00:00')).toBeVisible();
  await expect(sourceMonitor.getByText(/00:00:00:00 \/ 00:01:18:00/)).toBeVisible();

  await runPaletteCommand(page, 'go source end', /Go to source end/i);
  await expect(page.getByText('Source end 00:01:18:00')).toBeVisible();
  await expect(sourceMonitor.getByText(/00:01:18:00 \/ 00:01:18:00/)).toBeVisible();

  await runPaletteCommand(page, 'clear source in out', /Clear source In\/Out/i);
  await expect(page.getByText('Source range reset')).toBeVisible();
  await expect(sourceMonitor.getByText(/I 00:00:00:00 \/ O 00:01:18:00/)).toBeVisible();
});

test('runs match frame and replace edit from the command palette', async ({ page }) => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-replace-'));
  const mediaName = `playwright-replacement-${Date.now()}.mp4`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    generateTestVideo(mediaPath);
    await openEditor(page);

    const workflowClip = page.getByRole('button', { name: 'Timeline clip Workflow demo' });
    await expect(workflowClip).toBeVisible();
    await workflowClip.click();
    await setRangeInputValue(page.locator('input[type="range"][max="92"]').first(), 40);

    await runPaletteCommand(page, 'match frame source', /Match frame to Source Monitor/i);
    const sourceMonitor = page.getByRole('button', { name: /^Source Monitor/ });
    await expect(page.getByText('Matched Workflow demo at 00:00:36:00')).toBeVisible();
    await expect(sourceMonitor.getByText(/00:00:36:00 \/ 00:01:18:00/)).toBeVisible();

    await page.getByTestId('editor-media-file-input').setInputFiles(mediaPath);
    await page.getByRole('button', { name: `Open ${mediaName} in Source Monitor` }).click();

    await workflowClip.click();
    await runPaletteCommand(page, 'replace selected source', /Replace selected clip from Source Monitor/i);

    await expect(page.getByText('Replace edit applied')).toBeVisible();
    await expect(page.getByRole('button', { name: `Timeline clip ${mediaName}` })).toBeVisible();
    await page.keyboard.press('Control+Z');
    await expect(page.getByRole('button', { name: 'Timeline clip Workflow demo' })).toBeVisible();
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('slides a selected timeline clip with precision keyboard editing and undo', async ({ page }) => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-slide-'));
  const mediaName = `playwright-slide-neighbor-${Date.now()}.mp4`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    generateTestVideo(mediaPath);
    await openEditor(page);

    const timelinePlayhead = page.locator('input[type="range"][max="92"]').first();

    await page.getByTestId('editor-media-file-input').setInputFiles(mediaPath);
    await expect(page.getByRole('button', { name: `Insert ${mediaName}` })).toBeVisible();
    await setRangeInputValue(timelinePlayhead, 66);
    await page.getByRole('button', { name: `Insert ${mediaName}` }).click();
    await expect(page.getByRole('button', { name: `Timeline clip ${mediaName}` })).toBeVisible();

    const workflowClip = page.getByRole('button', { name: 'Timeline clip Workflow demo' });
    await workflowClip.click();
    await expect(workflowClip).toHaveAttribute('aria-pressed', 'true');
    await expect(workflowClip.getByText('32s / 34s')).toBeVisible();

    await page.keyboard.press('Shift+Alt+ArrowRight');
    await expect(workflowClip.getByText('32.03s / 34s')).toBeVisible();

    await page.keyboard.press('Control+Z');
    await expect(workflowClip.getByText('32s / 34s')).toBeVisible();
    await expect(workflowClip.getByText('32.03s / 34s')).toBeHidden();
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('applies inspector slip and roll trim precision edits with undo', async ({ page }) => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-precision-trim-'));
  const mediaName = `playwright-roll-neighbor-${Date.now()}.mp4`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    generateTestVideo(mediaPath);
    await openEditor(page);

    const timelinePlayhead = page.locator('input[type="range"][max="92"]').first();

    await page.getByTestId('editor-media-file-input').setInputFiles(mediaPath);
    await expect(page.getByRole('button', { name: `Insert ${mediaName}` })).toBeVisible();
    await setRangeInputValue(timelinePlayhead, 66);
    await page.getByRole('button', { name: `Insert ${mediaName}` }).click();
    await expect(page.getByRole('button', { name: `Timeline clip ${mediaName}` })).toBeVisible();

    const workflowClip = page.getByRole('button', { name: 'Timeline clip Workflow demo' });
    await workflowClip.click();
    await expect(workflowClip).toHaveAttribute('aria-pressed', 'true');

    const inspector = page.locator('aside').filter({ hasText: 'Workflow demo' });
    await expect(inspector).toBeVisible();
    const startInput = inspector.getByRole('spinbutton', { name: 'Start' }).first();
    const durationInput = inspector.getByRole('spinbutton', { name: 'Duration' }).first();
    const sourceInInput = inspector.getByRole('spinbutton', { name: 'Source In' }).first();

    await expect(startInput).toHaveValue('32');
    await expect(durationInput).toHaveValue('34');
    await expect(sourceInInput).toHaveValue('28');

    await page.getByRole('button', { name: 'Slip +1f' }).click();
    await expect(page.getByText('Linked slip edit applied')).toBeVisible();
    await expect(startInput).toHaveValue('32');
    await expect(durationInput).toHaveValue('34');
    await expect(sourceInInput).toHaveValue('28.033');
    await page.keyboard.press('Control+Z');
    await expect(sourceInInput).toHaveValue('28');

    const stepFramesInput = inspector.getByRole('spinbutton', { name: 'Step frames' }).first();
    await setRangeInputValue(stepFramesInput, 3);
    await expect(page.getByRole('button', { name: 'Slip +3f' })).toBeVisible();
    await page.getByRole('button', { name: 'Slip +3f' }).click();
    await expect(page.getByText('Linked slip edit applied')).toBeVisible();
    await expect(sourceInInput).toHaveValue('28.1');
    await page.keyboard.press('Control+Z');
    await expect(sourceInInput).toHaveValue('28');
    await setRangeInputValue(stepFramesInput, 1);

    await page.getByRole('button', { name: 'Roll head +1f' }).click();
    await expect(page.getByText('Head roll trim applied')).toBeVisible();
    await expect(startInput).toHaveValue('32.033');
    await expect(durationInput).toHaveValue('33.967');
    await expect(sourceInInput).toHaveValue('28.033');
    await page.keyboard.press('Control+Z');
    await expect(startInput).toHaveValue('32');
    await expect(durationInput).toHaveValue('34');
    await expect(sourceInInput).toHaveValue('28');

    await page.getByRole('button', { name: 'Roll tail +1f' }).click();
    await expect(page.getByText('Tail roll trim applied')).toBeVisible();
    await expect(startInput).toHaveValue('32');
    await expect(durationInput).toHaveValue('34.033');
    await expect(sourceInInput).toHaveValue('28');
    await page.keyboard.press('Control+Z');
    await expect(startInput).toHaveValue('32');
    await expect(durationInput).toHaveValue('34');
    await expect(sourceInInput).toHaveValue('28');
  } finally {
    await cleanupE2eTempRoot(page, tempRoot);
  }
});

test('blocks timeline edits on locked clips and resumes after unlock', async ({ page }) => {
  await openEditor(page);

  const workflowClip = page.getByRole('button', { name: 'Timeline clip Workflow demo' });
  await workflowClip.click();
  await expect(workflowClip).toHaveAttribute('aria-pressed', 'true');

  const inspector = page.locator('aside').filter({ hasText: 'Workflow demo' });
  await expect(inspector).toBeVisible();
  const startInput = inspector.getByRole('spinbutton', { name: 'Start' }).first();
  await expect(startInput).toHaveValue('32');

  await inspector.getByRole('button', { name: 'Clip lock' }).click();
  await expect(page.getByText('Clip lock toggled')).toBeVisible();

  await setRangeInputValue(startInput, 33);
  await expect(page.getByText('Cannot move a locked track or clip.')).toBeVisible();
  await expect(startInput).toHaveValue('32');

  await inspector.getByRole('button', { name: 'Clip lock' }).click();
  await expect(page.getByText('Clip lock toggled')).toBeVisible();

  await setRangeInputValue(startInput, 33);
  await expect(page.getByText('Clip start updated')).toBeVisible();
  await expect(startInput).toHaveValue('33');

  await page.keyboard.press('Control+Z');
  await expect(startInput).toHaveValue('32');
});

test('opens the command palette with Ctrl+K and handles empty results', async ({ page }) => {
  await openEditor(page);

  await page.keyboard.press('Control+K');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();

  await page.getByPlaceholder('Search commands').fill('relink missing');
  await expect(page.getByRole('button', { name: /Relink missing media/i })).toBeVisible();

  await page.getByPlaceholder('Search commands').fill('definitely missing command');
  await expect(page.getByText('No matching command')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden();
});

function generateTestAudio(outputPath: string): void {
  runFfmpegFixture([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=880:duration=1',
    '-c:a',
    'pcm_s16le',
    outputPath,
  ], 'ffmpeg failed to generate Playwright audio import media');
}

function generateTestVideo(outputPath: string): void {
  runFfmpegFixture([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x203040:size=160x90:rate=12:duration=0.5',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '32',
    '-pix_fmt',
    'yuv420p',
    outputPath,
  ], 'ffmpeg failed to generate Playwright video import media');
}

function generateQuickTimeCompatibleTestVideo(outputPath: string): void {
  runFfmpegFixture([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x203040:size=160x90:rate=12:duration=0.5',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '32',
    '-pix_fmt',
    'yuv420p',
    '-f',
    'mov',
    outputPath,
  ], 'ffmpeg failed to generate Playwright QuickTime-compatible import media');
}

function generateFragmentedTestVideo(outputPath: string): void {
  runFfmpegFixture([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x203040:size=160x90:rate=12:duration=0.5',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '32',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    'frag_keyframe+empty_moov+default_base_moof',
    outputPath,
  ], 'ffmpeg failed to generate Playwright fragmented video import media');
}

function generateEditListTestVideo(outputPath: string): void {
  runFfmpegFixture([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=160x90:rate=24:duration=1',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '32',
    '-pix_fmt',
    'yuv420p',
    '-bf',
    '2',
    '-g',
    '24',
    '-use_editlist',
    '1',
    '-movflags',
    'faststart',
    outputPath,
  ], 'ffmpeg failed to generate Playwright MP4 edit-list import media');

  if (!readFileSync(outputPath).includes(Buffer.from('elst'))) {
    throw new Error('Generated Playwright MP4 edit-list fixture is missing an elst box.');
  }
}

function generateRotatedMp4TestVideo(outputPath: string): void {
  const basePath = `${outputPath}.base.mp4`;
  try {
    runFfmpegFixture([
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=160x90:rate=12:duration=0.5',
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '32',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      'faststart',
      basePath,
    ], 'ffmpeg failed to generate Playwright MP4 rotation base media');

    runFfmpegFixture([
      '-y',
      '-display_rotation',
      '90',
      '-i',
      basePath,
      '-c',
      'copy',
      '-movflags',
      'faststart',
      outputPath,
    ], 'ffmpeg failed to generate Playwright MP4 rotation import media');

    const probe = spawnSync(process.env.FFPROBE_PATH || 'ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'stream_side_data=rotation',
      '-of',
      'default=nw=1:nk=1',
      outputPath,
    ], { encoding: 'utf8' });
    if (probe.status !== 0 || !probe.stdout.includes('90')) {
      throw new Error('Generated Playwright MP4 rotation fixture is missing 90 degree display metadata.');
    }
  } finally {
    rmSync(basePath, { force: true });
  }
}

function tryGenerateH265TestVideo(outputPath: string): { ok: boolean; error?: string } {
  const result = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x203040:size=160x90:rate=12:duration=0.5',
    '-an',
    '-c:v',
    'libx265',
    '-preset',
    'ultrafast',
    '-x265-params',
    'level-idc=3.1:log-level=error',
    '-crf',
    '38',
    '-pix_fmt',
    'yuv420p',
    '-tag:v',
    'hvc1',
    outputPath,
  ], {
    encoding: 'utf8',
  });

  return result.status === 0
    ? { ok: true }
    : { ok: false, error: result.stderr || 'ffmpeg failed to generate Playwright MP4 H.265 import media' };
}

function tryGenerateMp4Av1TestVideo(outputPath: string): { ok: boolean; error?: string } {
  const result = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x203040:size=160x90:rate=12:duration=0.5',
    '-an',
    '-c:v',
    'libaom-av1',
    '-cpu-used',
    '8',
    '-row-mt',
    '1',
    '-crf',
    '42',
    '-b:v',
    '0',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath,
  ], {
    encoding: 'utf8',
  });

  return result.status === 0
    ? { ok: true }
    : { ok: false, error: result.stderr || 'ffmpeg failed to generate Playwright MP4 AV1 import media' };
}

function tryGenerateMp4Vp9TestVideo(outputPath: string): { ok: boolean; error?: string } {
  const result = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x203040:size=160x90:rate=12:duration=0.5',
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-deadline',
    'realtime',
    '-cpu-used',
    '8',
    '-b:v',
    '256k',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath,
  ], {
    encoding: 'utf8',
  });

  return result.status === 0
    ? { ok: true }
    : { ok: false, error: result.stderr || 'ffmpeg failed to generate Playwright MP4 VP9 import media' };
}

function tryGenerateMp4Vp8TestVideo(outputPath: string): { ok: boolean; error?: string } {
  const result = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x203040:size=160x90:rate=12:duration=0.5',
    '-an',
    '-c:v',
    'libvpx',
    '-deadline',
    'realtime',
    '-cpu-used',
    '8',
    '-b:v',
    '256k',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath,
  ], {
    encoding: 'utf8',
  });

  return result.status === 0
    ? { ok: true }
    : { ok: false, error: result.stderr || 'ffmpeg failed to generate Playwright MP4 VP8 import media' };
}

function generateMatroskaH264TestVideo(outputPath: string): void {
  runFfmpegFixture([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x203040:size=160x90:rate=12:duration=0.5',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '32',
    '-pix_fmt',
    'yuv420p',
    '-profile:v',
    'baseline',
    '-level:v',
    '3.0',
    outputPath,
  ], 'ffmpeg failed to generate Playwright Matroska H.264 import media');
}

function tryGenerateMatroskaH265TestVideo(outputPath: string): { ok: boolean; error?: string } {
  const result = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x203040:size=160x90:rate=12:duration=0.5',
    '-an',
    '-c:v',
    'libx265',
    '-preset',
    'ultrafast',
    '-x265-params',
    'level-idc=3.1:log-level=error',
    '-crf',
    '38',
    '-pix_fmt',
    'yuv420p',
    outputPath,
  ], {
    encoding: 'utf8',
  });

  return result.status === 0
    ? { ok: true }
    : { ok: false, error: result.stderr || 'ffmpeg failed to generate Playwright Matroska H.265 import media' };
}

function generateWebmVp8TestVideo(outputPath: string): void {
  runFfmpegFixture([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x203040:size=160x90:rate=12:duration=0.5',
    '-an',
    '-c:v',
    'libvpx',
    '-deadline',
    'realtime',
    '-cpu-used',
    '8',
    '-b:v',
    '256k',
    '-pix_fmt',
    'yuv420p',
    outputPath,
  ], 'ffmpeg failed to generate Playwright WebM VP8 import media');
}

type WebmLacingMode = 'xiph' | 'fixed' | 'ebml';

interface EbmlElement {
  id: number;
  start: number;
  dataStart: number;
  end: number;
}

interface WebmSimpleBlock {
  element: EbmlElement;
  trackNumber: number;
  trackNumberLength: number;
  timecodeOffset: number;
  flags: number;
  payloadStart: number;
  payloadEnd: number;
  payloadSize: number;
}

function generateWebmVp8LacedTestVideo(outputPath: string, mode: WebmLacingMode): void {
  const basePath = `${outputPath}.base.webm`;
  try {
    generateWebmVp8TestVideo(basePath);
    rewriteWebmVideoBlockAsLaced(basePath, outputPath, mode);
  } finally {
    rmSync(basePath, { force: true });
  }
}

function rewriteWebmVideoBlockAsLaced(inputPath: string, outputPath: string, mode: WebmLacingMode): void {
  const bytes = readFileSync(inputPath);
  const segment = findEbmlElement(parseEbmlElementsFromBuffer(bytes, 0, bytes.length), 0x18538067);
  if (!segment) {
    throw new Error('Generated WebM fixture is missing a Segment element.');
  }

  const clusters = findEbmlElements(parseEbmlElementsFromBuffer(bytes, segment.dataStart, segment.end), 0x1F43B675);
  for (const cluster of clusters) {
    const simpleBlocks = findEbmlElements(parseEbmlElementsFromBuffer(bytes, cluster.dataStart, cluster.end), 0xA3)
      .map((element) => readWebmSimpleBlock(bytes, element))
      .filter((block): block is WebmSimpleBlock => Boolean(block));

    for (let index = 0; index < simpleBlocks.length - 1; index += 1) {
      const first = simpleBlocks[index];
      const second = simpleBlocks[index + 1];
      if (first.trackNumber !== second.trackNumber || (first.flags & 0x06) !== 0 || (second.flags & 0x06) !== 0) {
        continue;
      }
      if (mode === 'fixed' && first.payloadSize !== second.payloadSize) {
        continue;
      }

      const lacedBody = buildLacedWebmSimpleBlockBody(bytes, first, second, mode);
      const replacement = buildLacedWebmSimpleBlockReplacement(lacedBody, second.element.end - first.element.start);
      if (!replacement) {
        continue;
      }

      const patched = Buffer.from(bytes);
      replacement.copy(patched, first.element.start);
      writeFileSync(outputPath, patched);
      return;
    }
  }

  throw new Error(`Could not find a WebM block pair suitable for ${mode} lacing.`);
}

function readWebmSimpleBlock(bytes: Buffer, element: EbmlElement): WebmSimpleBlock | null {
  const trackNumber = readEbmlVintFromBuffer(bytes, element.dataStart, false);
  const timecodeOffset = element.dataStart + trackNumber.length;
  if (!trackNumber.length || timecodeOffset + 3 > element.end) {
    return null;
  }

  const payloadStart = timecodeOffset + 3;
  return {
    element,
    trackNumber: trackNumber.value,
    trackNumberLength: trackNumber.length,
    timecodeOffset,
    flags: bytes[timecodeOffset + 2] ?? 0,
    payloadStart,
    payloadEnd: element.end,
    payloadSize: element.end - payloadStart,
  };
}

function buildLacedWebmSimpleBlockBody(bytes: Buffer, first: WebmSimpleBlock, second: WebmSimpleBlock, mode: WebmLacingMode): Buffer {
  const firstPayload = bytes.subarray(first.payloadStart, first.payloadEnd);
  const secondPayload = bytes.subarray(second.payloadStart, second.payloadEnd);
  const lacingFlag = mode === 'xiph' ? 0x02 : mode === 'fixed' ? 0x04 : 0x06;
  const blockHeader = Buffer.concat([
    bytes.subarray(first.element.dataStart, first.element.dataStart + first.trackNumberLength),
    bytes.subarray(first.timecodeOffset, first.timecodeOffset + 2),
    Buffer.from([(first.flags & ~0x06) | lacingFlag]),
  ]);
  const laceHeader = mode === 'xiph'
    ? Buffer.concat([Buffer.from([1]), encodeXiphLaceSize(firstPayload.length)])
    : mode === 'fixed'
      ? Buffer.from([1])
      : Buffer.concat([Buffer.from([1]), encodeEbmlUnsignedVint(firstPayload.length)]);

  return Buffer.concat([blockHeader, laceHeader, firstPayload, secondPayload]);
}

function buildLacedWebmSimpleBlockReplacement(body: Buffer, spanLength: number): Buffer | null {
  for (let sizeLength = 1; sizeLength <= 8; sizeLength += 1) {
    if (!canEncodeEbmlVintValue(body.length, sizeLength)) {
      continue;
    }

    const lacedElement = Buffer.concat([
      Buffer.from([0xA3]),
      encodeEbmlVintValue(body.length, sizeLength),
      body,
    ]);
    const leftover = spanLength - lacedElement.length;
    if (leftover < 0) {
      continue;
    }

    const voidElement = buildEbmlVoidElement(leftover);
    if (!voidElement) {
      continue;
    }

    return Buffer.concat([lacedElement, voidElement]);
  }

  return null;
}

function buildEbmlVoidElement(totalLength: number): Buffer | null {
  if (totalLength === 0) {
    return Buffer.alloc(0);
  }

  for (let sizeLength = 1; sizeLength <= 8; sizeLength += 1) {
    const dataLength = totalLength - 1 - sizeLength;
    if (dataLength <= 0 || !canEncodeEbmlVintValue(dataLength, sizeLength)) {
      continue;
    }

    return Buffer.concat([
      Buffer.from([0xEC]),
      encodeEbmlVintValue(dataLength, sizeLength),
      Buffer.alloc(dataLength),
    ]);
  }

  return null;
}

function encodeXiphLaceSize(size: number): Buffer {
  const parts: number[] = [];
  let remaining = size;
  while (remaining >= 255) {
    parts.push(255);
    remaining -= 255;
  }
  parts.push(remaining);
  return Buffer.from(parts);
}

function encodeEbmlUnsignedVint(value: number): Buffer {
  for (let length = 1; length <= 8; length += 1) {
    if (canEncodeEbmlVintValue(value, length)) {
      return encodeEbmlVintValue(value, length);
    }
  }

  throw new Error(`Value ${value} is too large for an EBML vint.`);
}

function encodeEbmlVintValue(value: number, length: number): Buffer {
  if (!canEncodeEbmlVintValue(value, length)) {
    throw new Error(`Value ${value} does not fit in an EBML vint of length ${length}.`);
  }

  let encoded = Math.pow(2, 7 * length) + value;
  const output = Buffer.alloc(length);
  for (let index = length - 1; index >= 0; index -= 1) {
    output[index] = encoded & 0xff;
    encoded = Math.floor(encoded / 256);
  }
  return output;
}

function canEncodeEbmlVintValue(value: number, length: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= Math.pow(2, 7 * length) - 2;
}

function parseEbmlElementsFromBuffer(bytes: Buffer, start: number, end: number): EbmlElement[] {
  const elements: EbmlElement[] = [];
  let offset = start;
  while (offset < end) {
    const id = readEbmlVintFromBuffer(bytes, offset, true);
    const size = readEbmlVintFromBuffer(bytes, offset + id.length, false);
    if (!id.length || !size.length) {
      break;
    }

    const dataStart = offset + id.length + size.length;
    const elementEnd = dataStart + size.value;
    if (elementEnd > end || elementEnd < dataStart) {
      break;
    }

    elements.push({
      id: id.value,
      start: offset,
      dataStart,
      end: elementEnd,
    });
    offset = elementEnd;
  }

  return elements;
}

function findEbmlElement(elements: EbmlElement[], id: number): EbmlElement | null {
  return elements.find((element) => element.id === id) ?? null;
}

function findEbmlElements(elements: EbmlElement[], id: number): EbmlElement[] {
  return elements.filter((element) => element.id === id);
}

function readEbmlVintFromBuffer(bytes: Buffer, offset: number, keepMarker: boolean): { value: number; length: number } {
  const first = bytes[offset];
  if (first === undefined) {
    return { value: 0, length: 0 };
  }

  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }

  if (length > 8 || offset + length > bytes.length) {
    return { value: 0, length: 0 };
  }

  let value = keepMarker ? first : first & ~mask;
  for (let index = 1; index < length; index += 1) {
    value = value * 256 + (bytes[offset + index] ?? 0);
  }

  return { value, length };
}

function generateWebmVp9TestVideo(outputPath: string): void {
  runFfmpegFixture([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x203040:size=160x90:rate=12:duration=0.5',
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-deadline',
    'realtime',
    '-cpu-used',
    '8',
    '-b:v',
    '256k',
    '-pix_fmt',
    'yuv420p',
    outputPath,
  ], 'ffmpeg failed to generate Playwright WebM VP9 import media');
}

function generateWebmAv1TestVideo(outputPath: string): void {
  runFfmpegFixture([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x203040:size=160x90:rate=12:duration=0.5',
    '-an',
    '-c:v',
    'libaom-av1',
    '-cpu-used',
    '8',
    '-row-mt',
    '1',
    '-crf',
    '42',
    '-b:v',
    '0',
    '-pix_fmt',
    'yuv420p',
    outputPath,
  ], 'ffmpeg failed to generate Playwright WebM AV1 import media');
}

function generateTestImage(outputPath: string): void {
  runFfmpegFixture([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x304020:size=160x90',
    '-frames:v',
    '1',
    outputPath,
  ], 'ffmpeg failed to generate Playwright image import media');
}

function buildAlphaOverlayPreviewProject(id: string): EditorProject {
  const now = new Date().toISOString();
  const baseSource = svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
      <rect width="320" height="180" fill="#203040"/>
      <rect x="0" y="0" width="80" height="180" fill="#ff3366"/>
      <rect x="240" y="0" width="80" height="180" fill="#33ff99"/>
    </svg>
  `);
  const overlaySource = svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
      <rect width="100" height="100" fill="transparent"/>
      <rect x="35" y="0" width="30" height="100" fill="#3366ff"/>
    </svg>
  `);

  return {
    id,
    schemaVersion: 2,
    name: `Alpha Preview Parity ${id}`,
    fps: 30,
    width: 320,
    height: 180,
    duration: 6,
    updatedAt: now,
    assets: [
      {
        id: 'asset-alpha-preview-base',
        name: 'Alpha preview base',
        kind: 'image',
        source: baseSource,
        duration: 6,
        width: 320,
        height: 180,
        metadata: {
          hasVideo: true,
          hasAudio: false,
        },
      },
      {
        id: 'asset-alpha-preview-overlay',
        name: 'Alpha preview overlay',
        kind: 'image',
        source: overlaySource,
        duration: 6,
        width: 100,
        height: 100,
        metadata: {
          hasVideo: true,
          hasAudio: false,
        },
      },
    ],
    tracks: [
      {
        id: 'track-alpha-preview-base',
        name: 'Alpha Preview Base',
        kind: 'video',
        muted: false,
        solo: false,
        syncLocked: false,
        volumeDb: 0,
        pan: 0,
        locked: false,
        clips: [
          createClip({
            id: 'clip-alpha-preview-base',
            assetId: 'asset-alpha-preview-base',
            trackId: 'track-alpha-preview-base',
            name: 'Alpha preview base',
            kind: 'image',
            start: 0,
            duration: 6,
            color: '#ff3366',
          }),
        ],
      },
      {
        id: 'track-alpha-preview-overlay',
        name: 'Alpha Preview Overlay',
        kind: 'video',
        muted: false,
        solo: false,
        syncLocked: false,
        volumeDb: 0,
        pan: 0,
        locked: false,
        clips: [
          createClip({
            id: 'clip-alpha-preview-overlay',
            assetId: 'asset-alpha-preview-overlay',
            trackId: 'track-alpha-preview-overlay',
            name: 'Alpha preview overlay',
            kind: 'image',
            start: 0,
            duration: 6,
            color: '#3366ff',
          }),
        ],
      },
    ],
    markers: [],
    captions: [],
    automation: [],
    plugins: [],
    exportProfiles: [
      {
        id: 'profile-alpha-preview-h264',
        label: 'Alpha Preview H.264',
        purpose: 'proxy',
        container: 'mp4',
        codec: 'h264',
        width: 320,
        height: 180,
        fps: 30,
        videoBitrateMbps: 1,
        audioBitrateKbps: 96,
        ffmpegPreset: 'ultrafast',
        crf: 30,
      },
    ],
  };
}

function buildRenderableRenderRecoveryProject(id: string, source: string, renderPath: string): EditorProject {
  const now = new Date().toISOString();

  return {
    id,
    schemaVersion: 2,
    name: `Render Recovery E2E ${id}`,
    fps: 30,
    width: 320,
    height: 180,
    duration: 1,
    updatedAt: now,
    assets: [
      {
        id: 'asset-render-recovery-video',
        name: 'Render recovery video',
        kind: 'video',
        source,
        renderPath,
        mediaCache: {
          generatedAt: now,
          thumbnailSource: source,
          proxySource: source,
          warnings: [],
        },
        duration: 0.5,
        width: 160,
        height: 90,
        fps: 12,
        metadata: {
          hasVideo: true,
          hasAudio: false,
          codec: 'h264',
        },
      },
    ],
    tracks: [
      {
        id: 'track-render-recovery-video',
        name: 'Recovery Video',
        kind: 'video',
        muted: false,
        solo: false,
        syncLocked: false,
        volumeDb: 0,
        pan: 0,
        locked: false,
        clips: [
          createClip({
            id: 'clip-render-recovery-video',
            assetId: 'asset-render-recovery-video',
            trackId: 'track-render-recovery-video',
            name: 'Render recovery video',
            kind: 'video',
            start: 0,
            duration: 0.5,
            color: '#22c55e',
          }),
        ],
      },
    ],
    markers: [],
    captions: [],
    automation: [],
    plugins: [],
    exportProfiles: [
      {
        id: DEFAULT_EXPORT_PROFILE_ID,
        label: 'Recovery H.264',
        purpose: 'proxy',
        container: 'mp4',
        codec: 'h264',
        width: 320,
        height: 180,
        fps: 30,
        videoBitrateMbps: 1,
        audioBitrateKbps: 96,
        ffmpegPreset: 'ultrafast',
        crf: 32,
      },
    ],
  };
}

function buildRecoveryCandidateProject(id: string, name: string, updatedAt = new Date().toISOString()): EditorProject {
  return {
    ...createDefaultEditorProject(),
    id,
    name,
    updatedAt,
  };
}

function buildRecoveryProjectSummary(project: EditorProject, updatedAt: string) {
  return {
    id: project.id,
    name: project.name,
    schemaVersion: project.schemaVersion,
    duration: project.duration,
    clipCount: countProjectClips(project),
    createdAt: updatedAt,
    updatedAt,
  };
}

function buildRecoveryAutosaveSummary(project: EditorProject, savedAt: string) {
  return {
    ...buildRecoveryProjectSummary(project, savedAt),
    projectId: project.id,
    savedAt,
    reason: 'recovery-e2e',
  };
}

function countProjectClips(project: EditorProject): number {
  return project.tracks.reduce((count, track) => count + track.clips.length, 0);
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}

function buildMockRenderJob({
  id,
  status,
  priority,
  plan,
}: {
  id: string;
  status: RenderJobView['status'];
  priority: number;
  plan: FfmpegRenderPlan;
}): RenderJobView {
  return {
    id,
    status,
    progress: status === 'failed' ? 100 : 0,
    priority,
    outputPath: plan.outputPath,
    publicOutputPath: '/outputs/e2e-render-recovery.mp4',
    error: status === 'failed' ? 'Encoder failed' : undefined,
    stderrTail: status === 'failed' ? 'Unknown encoder prores_ks' : '',
    diagnostic: status === 'failed'
      ? {
        category: 'codec',
        summary: 'The selected export codec is not supported by the installed FFmpeg build.',
        retryable: false,
        actions: [
          'Switch to the H.264 export profile.',
          'Install an FFmpeg build that includes the requested encoder.',
        ],
        evidence: ['Unknown encoder prores_ks'],
      }
      : undefined,
    plan,
  };
}

function runFfmpegFixture(args: string[], failureMessage: string): void {
  const result = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', args, {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || failureMessage);
  }
}

async function expectBrowserMediaImported(page: Page, mediaName: string): Promise<void> {
  await expect(page.getByRole('button', { name: `Insert ${mediaName}` })).toBeVisible();
  await expect(page.getByRole('button', { name: `Overwrite ${mediaName}` })).toBeVisible();
  await expect(page.getByText(mediaName).first()).toBeVisible();
  await expect(page.getByText(/PCM_S16LE audio/i)).toBeVisible();
  await expect(page.getByText(/1 ch/i)).toBeVisible();
}

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor', { waitUntil: 'domcontentloaded' });
  await waitForEditorHydrated(page);
}

async function openSourceMonitor(page: Page): Promise<void> {
  const toggle = page.getByTestId('editor-source-monitor-toggle');
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute('aria-pressed') !== 'true') {
    await toggle.click();
  }
  await expect(page.getByRole('button', { name: /^Source Monitor/ })).toBeVisible();
}

async function openProjectPanel(page: Page): Promise<void> {
  const projectPanelButton = page.getByRole('button', { name: /^P\s+Project$/i });
  await expect(projectPanelButton).toBeVisible();
  if (await projectPanelButton.getAttribute('aria-pressed') !== 'true') {
    await projectPanelButton.click();
  }
}

async function openTemplatesPanel(page: Page): Promise<void> {
  const templatesPanelButton = page.getByRole('button', { name: /^T\s+Templates$/i });
  await expect(templatesPanelButton).toBeVisible();
  if (await templatesPanelButton.getAttribute('aria-pressed') !== 'true') {
    await templatesPanelButton.click();
  }
}

async function showSourceDiagnostics(sourceMonitor: Locator): Promise<void> {
  const infoToggle = sourceMonitor.getByRole('button', { name: 'Info', exact: true });
  if (await infoToggle.isVisible()) {
    await infoToggle.click();
  }
}

async function waitForEditorHydrated(page: Page): Promise<void> {
  await expect(page.getByTestId('editor-shell')).toHaveAttribute('data-hydrated', 'true', { timeout: 30_000 });
}

async function cleanupE2eTempRoot(page: Page, tempRoot: string): Promise<void> {
  await page.close({ runBeforeUnload: false }).catch(() => undefined);
  await removePathWithRetries(tempRoot);
}

async function removePathWithRetries(targetPath: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableRemoveError(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }

  throw lastError;
}

function isRetryableRemoveError(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  return code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY';
}

type EditorViewportSpec = {
  label: string;
  width: number;
  height: number;
};

type LayoutBox = {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type LayoutAudit = {
  document: {
    viewportWidth: number;
    documentWidth: number;
    bodyWidth: number;
  };
  boxes: LayoutBox[];
  overlaps: string[];
  clippedText: string[];
};

const LAYOUT_TOLERANCE_PX = 2;
const CRITICAL_OVERLAP_RATIO = 0.03;

async function expectTopLevelEditorControlsLayoutStable(page: Page, viewport: EditorViewportSpec): Promise<LayoutAudit> {
  const documentMetrics = await expectNoHorizontalDocumentOverflow(page, viewport);
  const header = page.locator('header').first();
  await header.scrollIntoViewIfNeeded();
  await expect(header).toBeVisible();

  const targets: Array<{ label: string; locator: Locator }> = [
    { label: 'commands button', locator: page.getByRole('button', { name: 'Commands' }) },
  ];
  const editorNavLink = page.getByRole('link', { name: 'Editor' });
  if (await editorNavLink.isVisible()) {
    targets.unshift({ label: 'editor nav link', locator: editorNavLink });
  }

  const boxes = await measureLayoutBoxes(targets);

  for (const box of boxes) {
    expectBoxInsideViewport(box, viewport);
  }

  const clippedText = await findClippedTextInLocator(header, 'header');
  expect(clippedText, `${viewport.label} header controls should not clip text`).toEqual([]);

  const overlaps = await findCriticalOverlapsInLocator(header, 'header a, header button', CRITICAL_OVERLAP_RATIO);
  expect(overlaps, `${viewport.label} header controls should not overlap`).toEqual([]);

  return {
    document: documentMetrics,
    boxes,
    overlaps,
    clippedText,
  };
}

async function expectSourceMonitorViewportLayoutStable(page: Page, viewport: EditorViewportSpec): Promise<LayoutAudit> {
  const sourceMonitor = page.getByRole('button', { name: /^Source Monitor/ });
  await sourceMonitor.scrollIntoViewIfNeeded();
  const documentMetrics = await expectNoHorizontalDocumentOverflow(page, viewport);

  const boxes = await measureLayoutBoxes([
    { label: 'source monitor panel', locator: sourceMonitor },
    { label: 'source range rail', locator: sourceMonitor.getByTestId('source-range-rail') },
  ]);

  for (const box of boxes) {
    expectBoxInsideViewport(box, viewport);
  }

  const sourceBox = boxes.find((box) => box.label === 'source monitor panel');
  expect(sourceBox, `${viewport.label} source monitor should be measurable`).toBeDefined();
  for (const box of boxes.filter((candidate) => candidate.label !== 'source monitor panel')) {
    expectBoxContainedWithin(box, sourceBox as LayoutBox, viewport.label);
  }

  const clippedText = await findClippedTextInLocator(sourceMonitor, 'source monitor');
  expect(clippedText, `${viewport.label} Source Monitor should not clip text`).toEqual([]);

  return {
    document: documentMetrics,
    boxes,
    overlaps: [],
    clippedText,
  };
}

async function expectProgramMonitorViewportLayoutStable(page: Page, viewport: EditorViewportSpec): Promise<LayoutAudit> {
  const documentMetrics = await expectNoHorizontalDocumentOverflow(page, viewport);
  const programMonitor = page.getByTestId('program-monitor');
  await programMonitor.scrollIntoViewIfNeeded();
  await expect(programMonitor.getByTestId('program-monitor-frame')).toBeVisible();

  const targets: Array<{ label: string; locator: Locator }> = [
    { label: 'program monitor', locator: programMonitor },
    { label: 'program monitor controls', locator: programMonitor.getByTestId('program-monitor-controls') },
  ];
  if (viewport.width >= 640) {
    await showProgramDiagnostics(programMonitor);
    targets.push(
      { label: 'program stack summary', locator: programMonitor.getByTestId('program-stack-summary') },
      { label: 'program audio meter', locator: programMonitor.getByTestId('program-audio-meter') },
      { label: 'program audio meter status', locator: programMonitor.getByTestId('program-audio-meter-status') },
    );
  }

  const boxes = await measureLayoutBoxes(targets);

  for (const box of boxes) {
    expectBoxInsideViewport(box, viewport);
  }

  const monitorBox = boxes.find((box) => box.label === 'program monitor');
  expect(monitorBox, `${viewport.label} program monitor should be measurable`).toBeDefined();
  for (const box of boxes.filter((candidate) => candidate.label !== 'program monitor')) {
    expectBoxContainedWithin(box, monitorBox as LayoutBox, viewport.label);
  }

  const overlayBoxes = boxes.filter((box) => box.label === 'program stack summary' || box.label === 'program audio meter');
  const overlaps = findCriticalOverlaps(overlayBoxes, CRITICAL_OVERLAP_RATIO);
  expect(overlaps, `${viewport.label} Program Monitor overlays should not collide`).toEqual([]);

  const clippedText = [
    ...(viewport.width >= 640 ? await findClippedTextInLocator(programMonitor.getByTestId('program-stack-summary'), 'program stack summary') : []),
    ...(viewport.width >= 640 ? await findClippedTextInLocator(programMonitor.getByTestId('program-audio-meter'), 'program audio meter') : []),
  ];
  expect(clippedText, `${viewport.label} Program Monitor overlays should not clip text`).toEqual([]);

  return {
    document: documentMetrics,
    boxes,
    overlaps,
    clippedText,
  };
}

async function expectNoHorizontalDocumentOverflow(
  page: Page,
  viewport: EditorViewportSpec,
): Promise<LayoutAudit['document']> {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));

  expect(metrics.viewportWidth, `${viewport.label} viewport width should match Playwright setting`).toBe(viewport.width);
  expect(metrics.documentWidth, `${viewport.label} document should not overflow horizontally`).toBeLessThanOrEqual(viewport.width + LAYOUT_TOLERANCE_PX);
  expect(metrics.bodyWidth, `${viewport.label} body should not overflow horizontally`).toBeLessThanOrEqual(viewport.width + LAYOUT_TOLERANCE_PX);

  return metrics;
}

async function measureLayoutBoxes(
  targets: Array<{ label: string; locator: Locator }>,
): Promise<LayoutBox[]> {
  const boxes: LayoutBox[] = [];

  for (const target of targets) {
    await expect(target.locator, `${target.label} should be visible`).toBeVisible();
    const box = await target.locator.boundingBox();
    expect(box, `${target.label} should have a layout box`).not.toBeNull();
    expect(box?.width ?? 0, `${target.label} should have visible width`).toBeGreaterThan(8);
    expect(box?.height ?? 0, `${target.label} should have visible height`).toBeGreaterThan(8);
    boxes.push({
      label: target.label,
      x: box?.x ?? 0,
      y: box?.y ?? 0,
      width: box?.width ?? 0,
      height: box?.height ?? 0,
    });
  }

  return boxes;
}

function expectBoxInsideViewport(box: LayoutBox, viewport: EditorViewportSpec): void {
  expect(box.x, `${viewport.label} ${box.label} should not be left-clipped`).toBeGreaterThanOrEqual(-LAYOUT_TOLERANCE_PX);
  expect(box.y, `${viewport.label} ${box.label} should not be top-clipped`).toBeGreaterThanOrEqual(-LAYOUT_TOLERANCE_PX);
  expect(box.x + box.width, `${viewport.label} ${box.label} should not be right-clipped`).toBeLessThanOrEqual(viewport.width + LAYOUT_TOLERANCE_PX);
  expect(box.y + box.height, `${viewport.label} ${box.label} should not be bottom-clipped`).toBeLessThanOrEqual(viewport.height + LAYOUT_TOLERANCE_PX);
}

function expectBoxContainedWithin(box: LayoutBox, container: LayoutBox, viewportLabel: string): void {
  expect(box.x, `${viewportLabel} ${box.label} should stay inside ${container.label} left edge`).toBeGreaterThanOrEqual(container.x - LAYOUT_TOLERANCE_PX);
  expect(box.y, `${viewportLabel} ${box.label} should stay inside ${container.label} top edge`).toBeGreaterThanOrEqual(container.y - LAYOUT_TOLERANCE_PX);
  expect(box.x + box.width, `${viewportLabel} ${box.label} should stay inside ${container.label} right edge`).toBeLessThanOrEqual(container.x + container.width + LAYOUT_TOLERANCE_PX);
  expect(box.y + box.height, `${viewportLabel} ${box.label} should stay inside ${container.label} bottom edge`).toBeLessThanOrEqual(container.y + container.height + LAYOUT_TOLERANCE_PX);
}

async function findClippedTextInLocator(locator: Locator, labelPrefix: string): Promise<string[]> {
  return locator.evaluateAll((elements, prefix) => {
    const clipped: string[] = [];

    for (const element of elements) {
      const candidates = element.matches('a, button, [data-testid], span, div')
        ? [element, ...Array.from(element.querySelectorAll('a, button, [data-testid], span'))]
        : Array.from(element.querySelectorAll('a, button, [data-testid], span'));

      for (const candidate of candidates) {
        const rect = candidate.getBoundingClientRect();
        const style = window.getComputedStyle(candidate);
        const text = candidate.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        const tagName = candidate.tagName.toUpperCase();
        const isInteractiveOrLeafText = tagName === 'A' || tagName === 'BUTTON' || tagName === 'SPAN' || candidate.children.length === 0;
        if (
          !isInteractiveOrLeafText ||
          !text ||
          rect.width <= 0 ||
          rect.height <= 0 ||
          style.display === 'none' ||
          style.visibility === 'hidden'
        ) {
          continue;
        }

        const horizontalOverflow = candidate.scrollWidth > candidate.clientWidth + 2;
        const verticalOverflow = candidate.scrollHeight > candidate.clientHeight + 2;
        if (horizontalOverflow || verticalOverflow) {
          clipped.push(`${prefix}: ${candidate.getAttribute('data-testid') ?? candidate.getAttribute('title') ?? text}`);
        }
      }
    }

    return Array.from(new Set(clipped));
  }, labelPrefix);
}

async function findCriticalOverlapsInLocator(
  locator: Locator,
  selector: string,
  maxRatio: number,
): Promise<string[]> {
  const boxes = await locator.locator(selector).evaluateAll((elements) => elements
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const label = element.getAttribute('aria-label')
        ?? element.getAttribute('title')
        ?? element.textContent?.replace(/\s+/g, ' ').trim()
        ?? element.tagName.toLowerCase();

      return {
        label,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
      };
    })
    .filter((box) => box.visible)
    .map((box) => ({
      label: box.label,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    })));

  return findCriticalOverlaps(boxes, maxRatio);
}

function findCriticalOverlaps(boxes: LayoutBox[], maxRatio: number): string[] {
  const overlaps: string[] = [];

  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
      const left = boxes[leftIndex];
      const right = boxes[rightIndex];
      const ratio = getIntersectionArea(left, right) / Math.min(getArea(left), getArea(right));
      if (ratio > maxRatio) {
        overlaps.push(`${left.label} overlaps ${right.label} (${ratio.toFixed(2)})`);
      }
    }
  }

  return overlaps;
}

function getArea(box: LayoutBox): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

function getIntersectionArea(left: LayoutBox, right: LayoutBox): number {
  const xOverlap = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const yOverlap = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return xOverlap * yOverlap;
}

async function expectProgramMonitorCompositeReady(page: Page): Promise<void> {
  const programMonitor = page.getByTestId('program-monitor');
  await programMonitor.scrollIntoViewIfNeeded();
  await expect(programMonitor).toBeVisible();
  await expect(programMonitor.getByTestId('program-monitor-frame')).toBeVisible();
  await showProgramDiagnostics(programMonitor);
  await expect(programMonitor.getByText('Composite stack')).toBeVisible();

  const layerSummary = await programMonitor.getByText(/\d+ media \/ \d+ text \/ \d+ caption \/ \d+ audio/).first().textContent();
  expect(layerSummary).toMatch(/[1-9]\d* media/);
  expect(layerSummary).toMatch(/[1-9]\d* audio/);

  const bounds = await programMonitor.boundingBox();
  expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(300);
  expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(320);
}

async function showProgramDiagnostics(programMonitor: Locator): Promise<void> {
  const stackSummary = programMonitor.getByTestId('program-stack-summary');
  if (!await stackSummary.isVisible()) {
    const infoToggle = programMonitor.getByRole('button', { name: 'Info', exact: true });
    await expect(infoToggle).toBeVisible();
    await infoToggle.click();
  }
  await expect(stackSummary).toBeVisible();
}

async function waitForPreviewImages(programMonitor: Locator): Promise<void> {
  await programMonitor.locator('img[alt="Alpha preview base"], img[alt="Alpha preview overlay"]').evaluateAll((images) => (
    Promise.all(images.map((image) => {
      const element = image as HTMLImageElement;
      if (element.complete && element.naturalWidth > 0 && element.naturalHeight > 0) {
        return true;
      }

      return new Promise<boolean>((resolve, reject) => {
        const cleanup = () => {
          element.removeEventListener('load', handleLoad);
          element.removeEventListener('error', handleError);
        };
        const handleLoad = () => {
          cleanup();
          resolve(true);
        };
        const handleError = () => {
          cleanup();
          reject(new Error(`Preview image failed to load: ${element.alt}`));
        };

        element.addEventListener('load', handleLoad, { once: true });
        element.addEventListener('error', handleError, { once: true });
      });
    }))
  ));
}

async function hideProgramDiagnosticOverlays(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      [data-testid="program-video-scopes"],
      [data-testid="program-preview-performance"],
      [data-testid="program-stack-overlay"],
      [data-testid="program-audio-meter"],
      [data-testid="program-audio-analyzer"],
      [aria-label^="Select Alpha preview"],
      [aria-label="Selected visual transform"] {
        display: none !important;
      }
    `,
  });
}

interface ColorCluster {
  count: number;
  averageX: number;
  averageY: number;
}

interface AlphaCompositeScreenshotAnalysis {
  width: number;
  height: number;
  red: ColorCluster;
  blue: ColorCluster;
  green: ColorCluster;
}

async function analyzeAlphaCompositeScreenshot(
  page: Page,
  locator: Locator,
): Promise<AlphaCompositeScreenshotAnalysis> {
  const screenshot = await locator.screenshot({ animations: 'disabled' });
  return page.evaluate(async (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Cannot create screenshot analysis canvas.');
    }

    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const red = createCluster();
    const blue = createCluster();
    const green = createCluster();

    for (let y = 0; y < bitmap.height; y += 1) {
      for (let x = 0; x < bitmap.width; x += 1) {
        const index = (y * bitmap.width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];

        if (r >= 180 && g <= 120 && b <= 150) {
          addToCluster(red, x, y);
        } else if (b >= 180 && r <= 120 && g <= 160) {
          addToCluster(blue, x, y);
        } else if (g >= 180 && r <= 120 && b <= 180) {
          addToCluster(green, x, y);
        }
      }
    }

    return {
      width: bitmap.width,
      height: bitmap.height,
      red: finalizeCluster(red),
      blue: finalizeCluster(blue),
      green: finalizeCluster(green),
    } satisfies AlphaCompositeScreenshotAnalysis;

    function createCluster() {
      return { count: 0, x: 0, y: 0 };
    }

    function addToCluster(cluster: { count: number; x: number; y: number }, x: number, y: number): void {
      cluster.count += 1;
      cluster.x += x;
      cluster.y += y;
    }

    function finalizeCluster(cluster: { count: number; x: number; y: number }): ColorCluster {
      return {
        count: cluster.count,
        averageX: cluster.count > 0 ? cluster.x / cluster.count : -1,
        averageY: cluster.count > 0 ? cluster.y / cluster.count : -1,
      };
    }
  }, screenshot.toString('base64'));
}

async function installPreviewWorkerFrameMock(page: Page): Promise<void> {
  await page.route('**/editor-preview-worker.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `
        self.onmessage = async function (event) {
          const message = event.data || {};
          const id = message.id || 'preview-worker';
          if (message.type === 'detect') {
            self.postMessage({
              type: 'capabilities',
              id,
              capabilities: {
                workerSupported: true,
                webCodecsSupported: true,
                videoDecoderSupported: true,
                videoFrameSupported: true,
                encodedVideoChunkSupported: true,
                offscreenCanvasSupported: true,
                imageBitmapSupported: true,
                requestVideoFrameCallbackSupported: false,
              },
            });
            return;
          }

          if (message.type === 'benchmark') {
            self.postMessage({
              type: 'benchmark',
              id,
              benchmark: {
                averageFrameMs: 1,
                width: Number(message.width) || 320,
                height: Number(message.height) || 180,
                samples: Number(message.samples) || 1,
              },
            });
            return;
          }

          if (message.type !== 'frame') {
            return;
          }

          const request = message.request || {};
          const width = Math.max(16, Math.min(640, Math.round(Number(request.targetWidth) || 320)));
          const height = Math.max(16, Math.min(360, Math.round(Number(request.targetHeight) || 180)));
          const canvas = new OffscreenCanvas(width, height);
          const context = canvas.getContext('2d', { alpha: false });
          context.fillStyle = '#123456';
          context.fillRect(0, 0, width, height);
          context.fillStyle = '#34d399';
          context.fillRect(Math.round(width * 0.2), Math.round(height * 0.2), Math.round(width * 0.6), Math.round(height * 0.6));
          const bitmap = canvas.transferToImageBitmap();
          self.postMessage({
            type: 'frame',
            id,
            result: {
              requestId: request.requestId || id + '-frame',
              mediaId: request.mediaId || 'asset-interview',
              kind: request.kind || 'video',
              status: 'decoded',
              timestamp: Math.max(0, Number(request.time) || 0),
              duration: 0.04,
              width,
              height,
              decodeMs: 1,
              reason: 'Playwright preview worker frame mock.',
            },
            bitmap,
          }, [bitmap]);
        };
      `,
    });
  });
}

async function expectRealWebCodecsPreviewWorkerFrame(
  page: Page,
  mediaName: string,
  mediaPath: string,
  codec = 'avc1.42E01E',
  timelineScrubTime = 0.1,
  expectedWorkerReason: RegExp = /Worker decoded video through WebCodecs|Worker decoded WebM video through WebCodecs/,
): Promise<void> {
  await openEditor(page);

  const supportsPreviewWorkerDecode = await supportsWorkerWebCodecsCodec(page, codec);
  test.skip(!supportsPreviewWorkerDecode, `This browser build does not expose worker WebCodecs ${codec} decode support.`);

  const timelinePlayhead = page.getByRole('slider', { name: 'Timeline playhead' });
  await setRangeInputValue(timelinePlayhead, 0);

  await page.getByTestId('editor-media-file-input').setInputFiles(mediaPath);
  await expect(page.getByRole('button', { name: `Insert ${mediaName}` })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: `Insert ${mediaName}` }).click();
  await expect(page.getByRole('button', { name: `Timeline clip ${mediaName}` })).toBeVisible({ timeout: 30_000 });

  await setRangeInputValue(timelinePlayhead, timelineScrubTime);

  const programMonitor = page.getByTestId('program-monitor');
  await expectProgramMonitorCompositeReady(page);
  await expect(programMonitor.getByText(mediaName)).toBeVisible();
  const workerFrame = programMonitor.getByAltText(`${mediaName} worker decoded frame`);
  await expect(workerFrame).toBeVisible({ timeout: 20_000 });
  await expect(workerFrame).toHaveAttribute('src', /^blob:/);
  await expect(workerFrame).toHaveAttribute('data-worker-frame-reason', expectedWorkerReason);
  await expect(programMonitor.getByText(/decoded \/ 0 failed \/ 0 unsupported/)).toBeVisible({ timeout: 20_000 });
}

async function supportsWorkerWebCodecsCodec(page: Page, codec: string): Promise<boolean> {
  return page.evaluate(async (codecName) => {
    const globalScope = globalThis as typeof globalThis & {
      Worker?: typeof Worker;
      URL?: typeof URL;
    };

    if (typeof globalScope.Worker !== 'function' || typeof Blob !== 'function') {
      return false;
    }

    const codecLiteral = JSON.stringify(codecName);
    const workerScript = `
      self.onmessage = async function () {
        try {
          const scope = self;
          const hasRequiredApis =
            typeof scope.VideoDecoder === 'function' &&
            typeof scope.VideoFrame === 'function' &&
            typeof scope.EncodedVideoChunk === 'function' &&
            typeof scope.OffscreenCanvas === 'function';

          if (!hasRequiredApis) {
            self.postMessage(false);
            return;
          }

          if (typeof scope.VideoDecoder.isConfigSupported === 'function') {
            const support = await scope.VideoDecoder.isConfigSupported({ codec: ${codecLiteral} }).catch(function () {
              return { supported: false };
            });
            self.postMessage(support.supported !== false);
            return;
          }

          self.postMessage(true);
        } catch (error) {
          self.postMessage(false);
        }
      };
    `;
    const workerUrl = URL.createObjectURL(new Blob([workerScript], { type: 'application/javascript' }));

    return new Promise<boolean>((resolve) => {
      const worker = new Worker(workerUrl);
      const finish = (supported: boolean) => {
        URL.revokeObjectURL(workerUrl);
        worker.terminate();
        resolve(supported);
      };

      const timeout = window.setTimeout(() => finish(false), 5_000);
      worker.onmessage = (event) => {
        window.clearTimeout(timeout);
        finish(event.data === true);
      };
      worker.onerror = () => {
        window.clearTimeout(timeout);
        finish(false);
      };
      worker.postMessage(null);
    });
  }, codec);
}

async function setRangeInputValue(locator: Locator, value: number): Promise<void> {
  await locator.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, String(nextValue));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function runPaletteCommand(page: Page, query: string, commandName: RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Commands' }).click();
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await page.getByPlaceholder('Search commands').fill(query);
  await expect(page.getByRole('button', { name: commandName })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden();
}
