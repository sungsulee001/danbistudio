import { expect, test, type Locator, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('imports media through the visible media panel import button into the grid', async ({ page }) => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-import-grid-'));
  const mediaName = `grid-import-${Date.now()}.wav`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    await writeSilentWav(mediaPath);
    await openEditor(page);
    await page.getByPlaceholder('Search media').fill('hidden-before-import');
    await page.locator('select[title="Asset type"]').selectOption('text');
    const { assetId } = await importMediaIntoEditor(page, mediaPath, mediaName);

    await expect(page.getByPlaceholder('Search media')).toHaveValue('');
    await expect(page.locator('select[title="Asset type"]')).toHaveValue('all');
    await expect(page.getByText(mediaName).first()).toBeVisible();
    await expect(page.getByTestId('media-bin-panel')).toHaveAttribute('data-selected-asset-id', assetId);
    await expect(page.getByTestId('media-bin-panel')).toHaveAttribute('data-visible-asset-count', /[1-9][0-9]*/);
    await expect(page.getByTestId('media-bin-count-summary')).toBeVisible();
    await expect(page.getByTestId('media-bin-quick-status')).toHaveAttribute('data-visible-assets', /[1-9][0-9]*/);
    const importedCard = getMediaAssetCardByName(page, mediaName);
    await expect(importedCard).toHaveAttribute('data-asset-name', mediaName);
    await expect(importedCard).toHaveAttribute('data-asset-kind', 'audio');
    await expect(importedCard).toHaveAttribute('data-asset-status', /unused|review|blocked|source|added|cache-/);
    await expect(importedCard).toHaveAttribute('data-asset-usage-state', 'unused');
    await expect(importedCard).toHaveAttribute('data-asset-reference-count', '0');
    await expect(importedCard).toHaveAttribute('data-asset-cache-state', /idle|queued|running|completed|failed|cancelled/);
    await expect(page.getByTestId(`media-asset-thumbnail-${assetId}`)).toHaveAttribute('data-preview-kind', 'audio');
    await expect(page.getByTestId(`media-asset-duration-badge-${assetId}`)).toBeVisible();
    await expect(page.getByTestId(`media-asset-status-badge-${assetId}`)).toHaveCount(0);
    await expect(page.getByTestId(`media-asset-selected-badge-${assetId}`)).toHaveCount(0);
    await expect(page.getByTestId(`media-asset-drag-handle-${assetId}`)).toContainText(/Source|Drag/);
    await expect(page.getByTestId(`media-asset-usage-badge-${assetId}`)).toBeHidden();
    await expect(page.getByTestId(`media-asset-timeline-state-${assetId}`)).toBeHidden();
    await expect(page.getByTestId(`media-asset-kind-badge-${assetId}`)).toBeHidden();
    await expect(page.getByTestId(`media-asset-metadata-summary-${assetId}`)).toBeHidden();
    await expect(page.getByRole('button', { name: `Insert ${mediaName}` })).toBeVisible();
    await expect(page.getByRole('button', { name: `Overwrite ${mediaName}` })).toBeVisible();
    await expect(page.getByRole('button', { name: `Open ${mediaName} in Source Monitor` })).toBeVisible();

    const thumbnail = page.getByTestId(`media-asset-thumbnail-${assetId}`);
    await thumbnail.hover();
    await expect(importedCard).toHaveAttribute('data-scrub-active', 'true');
    await expect(thumbnail).toHaveAttribute('data-scrub-active', 'true');
    await expect(page.getByTestId(`media-asset-scrub-line-${assetId}`)).toBeVisible();
    await expect(page.getByTestId(`media-asset-scrub-time-${assetId}`)).toBeVisible();

    await expect(page.getByTestId('media-bin-asset-list')).toHaveAttribute('data-view-mode', 'grid');
    await expect(importedCard).toHaveAttribute('data-view-mode', 'grid');
    await page.getByTestId('media-bin-view-list').click();
    await expect(page.getByTestId('media-bin-view-list')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('media-bin-asset-list')).toHaveAttribute('data-view-mode', 'list');
    await expect(importedCard).toHaveAttribute('data-view-mode', 'list');
    await expect(page.getByTestId(`media-asset-usage-badge-${assetId}`)).toContainText(/Unused|use/);
    await expect(page.getByTestId(`media-asset-timeline-state-${assetId}`)).toHaveAttribute('data-usage-state', 'unused');
    await expect(page.getByTestId(`media-asset-timeline-state-${assetId}`)).toContainText('Ready');
    await expect(page.getByTestId(`media-asset-kind-badge-${assetId}`)).toContainText(/audio/i);
    await expect(page.getByTestId(`media-asset-metadata-summary-${assetId}`)).toContainText(/audio|waveform/i);
    await expect(page.getByRole('button', { name: `Insert ${mediaName}` })).toBeVisible();
    await expect(page.getByRole('button', { name: `Overwrite ${mediaName}` })).toBeVisible();
    await expect(page.getByRole('button', { name: `Open ${mediaName} in Source Monitor` })).toBeVisible();
    await page.getByTestId('media-bin-view-grid').click();
    await expect(page.getByTestId('media-bin-asset-list')).toHaveAttribute('data-view-mode', 'grid');
  } finally {
    await page.close({ runBeforeUnload: false }).catch(() => undefined);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('imports media then routes it through source monitor insert onto the timeline', async ({ page }) => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-import-source-timeline-'));
  const mediaName = `source-timeline-${Date.now()}.wav`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    await writeSilentWav(mediaPath);
    await openEditor(page);
    const { assetCard, assetId } = await importMediaIntoEditor(page, mediaPath, mediaName);

    await assetCard.click();

    const sourceMonitor = page.getByTestId('source-monitor');
    await expect(sourceMonitor).toHaveAttribute('data-source-asset-id', assetId);
    await expect(sourceMonitor.getByTestId('source-monitor-asset-name')).toHaveText(mediaName);
    await expect(page.getByTestId('media-bin-selected-source')).toContainText(mediaName);
    await expect(page.getByTestId(`media-asset-drag-handle-${assetId}`)).toContainText('Source');
    await expect(page.getByTestId('media-bin-source-controls')).not.toHaveAttribute('open', '');
    const sourceAudio = sourceMonitor.getByTestId(`source-monitor-audio-${assetId}`);
    await expect(sourceAudio).toBeAttached();
    await expect(sourceAudio).not.toHaveAttribute('muted', '');

    await assetCard.hover();
    await page.getByRole('button', { name: `Insert ${mediaName}` }).click();

    const insertedClip = page.locator(`[data-testid^="timeline-clip-"][data-asset-id="${assetId}"]`);
    await expect(insertedClip).toHaveCount(1);
    await expect(insertedClip.first()).toHaveAttribute('data-track-id', /track-a/);
    await expect(insertedClip.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(assetCard).toHaveAttribute('data-asset-usage-state', 'used');
    await page.getByTestId('media-bin-view-list').click();
    await expect(page.getByTestId(`media-asset-timeline-state-${assetId}`)).toHaveAttribute('data-usage-state', 'used');
    await expect(page.getByTestId(`media-asset-timeline-state-${assetId}`)).toContainText('Timeline 1');
  } finally {
    await page.close({ runBeforeUnload: false }).catch(() => undefined);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('imports media then drags the media card directly onto an audio timeline lane', async ({ page }) => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-import-drag-timeline-'));
  const mediaName = `drag-timeline-${Date.now()}.wav`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    await writeSilentWav(mediaPath);
    await openEditor(page);
    const { assetId } = await importMediaIntoEditor(page, mediaPath, mediaName);

    const dragHandle = page.getByTestId(`media-asset-drag-handle-${assetId}`);
    const audioLane = page.getByTestId('timeline-lane-track-a1');
    await dragHandle.scrollIntoViewIfNeeded();
    await audioLane.scrollIntoViewIfNeeded();
    await expect(dragHandle).toBeVisible();
    await expect(audioLane).toBeVisible();

    await dragAssetHandleToLane(page, dragHandle, audioLane, 8, async () => {
      await expect(page.getByTestId('media-bin-panel')).toHaveAttribute('data-asset-dragging', 'true');
      await expect(page.getByTestId('media-bin-panel')).toHaveAttribute('data-dragging-asset-id', assetId);
      await expect(page.getByTestId(`media-asset-card-${assetId}`)).toHaveAttribute('data-dragging', 'true');
      await expect(dragHandle).toHaveAttribute('data-drag-active', 'true');
      await expect(page.getByTestId('media-bin-dragging-asset')).toContainText(mediaName);

      const preview = page.getByTestId('timeline-drop-preview-asset-track-a1');
      await expect(preview).toBeVisible();
      await expect(preview).toHaveAttribute('data-drop-valid', 'true');
      await expect(preview).toHaveAttribute('data-drop-tone', 'asset');
      await expect(preview).toHaveAttribute('data-drop-mode', 'insert');
      await expect(preview).toHaveAttribute('data-drop-operation', 'asset-drop');
      await expect(preview).toHaveAttribute('data-drop-ripple', 'true');
      await expect(preview).toHaveAttribute('data-drop-label', mediaName);

      const guideLine = page.getByTestId('timeline-edit-guide-line-track-a1');
      await expect(guideLine).toHaveAttribute('data-guide-operation', 'asset-drop');
      await expect(guideLine).toHaveAttribute('data-guide-duration', /[0-9.]+/);
      await expect(guideLine).toHaveAttribute('data-guide-ripple', 'true');
    });

    await expect(page.getByTestId('media-bin-panel')).toHaveAttribute('data-asset-dragging', 'false');
    const droppedClip = page.locator(`[data-testid^="timeline-clip-"][data-asset-id="${assetId}"]`);
    await expect(droppedClip).toHaveCount(1);
    await expect(droppedClip.first()).toHaveAttribute('data-track-id', 'track-a1');
    await expect(droppedClip.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('program-monitor')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('editor-status')).toContainText(`${mediaName} dropped on`);
  } finally {
    await page.close({ runBeforeUnload: false }).catch(() => undefined);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('imports image media then drags it onto a video lane and shows it in the program monitor', async ({ page }) => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-import-image-preview-'));
  const mediaName = `image-preview-${Date.now()}.png`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    await writeTestPng(mediaPath);
    await openEditor(page);
    const { assetId } = await importMediaIntoEditor(page, mediaPath, mediaName);

    const dragHandle = page.getByTestId(`media-asset-drag-handle-${assetId}`);
    const videoLane = page.getByTestId('timeline-lane-track-v2');
    await dragHandle.scrollIntoViewIfNeeded();
    await videoLane.scrollIntoViewIfNeeded();
    await expect(dragHandle).toBeVisible();
    await expect(videoLane).toBeVisible();

    await dragAssetHandleToLane(page, dragHandle, videoLane, 6, async () => {
      const preview = page.getByTestId('timeline-drop-preview-asset-track-v2');
      await expect(preview).toBeVisible();
      await expect(preview).toHaveAttribute('data-drop-valid', 'true');
      await expect(preview).toHaveAttribute('data-drop-tone', 'asset');
      await expect(preview).toHaveAttribute('data-drop-label', mediaName);
    });

    const droppedClip = page.locator(`[data-testid^="timeline-clip-"][data-asset-id="${assetId}"]`);
    await expect(droppedClip).toHaveCount(1);
    await expect(droppedClip.first()).toHaveAttribute('data-track-id', 'track-v2');
    await expect(droppedClip.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('program-monitor')).toHaveAttribute('data-active', 'true');
    await setRangeInputValue(page.getByTestId('timeline-playhead-slider'), 6.1);

    const programMonitor = page.getByTestId('program-monitor');
    await expect(programMonitor.getByAltText(mediaName)).toBeVisible();
    await expect(page.getByTestId('editor-status')).toContainText(`${mediaName} dropped on`);
  } finally {
    await page.close({ runBeforeUnload: false }).catch(() => undefined);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('imports MP4 media then drags it onto a video lane and plays it in the program monitor', async ({ page }) => {
  test.setTimeout(60_000);
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-import-mp4-preview-'));
  const mediaName = `mp4-preview-${Date.now()}.mp4`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    writeTestMp4WithAudio(mediaPath);
    await openEditor(page);
    const { assetId } = await importMediaIntoEditor(page, mediaPath, mediaName);

    const videoClip = await dragImportedAssetToVideoLane(page, assetId, mediaName, 6);
    const clipId = await readRequiredAttribute(videoClip, 'data-clip-id');
    await expect(videoClip).toHaveAttribute('data-clip-kind', 'video');
    const audioClip = page.locator(`[data-testid^="timeline-clip-"][data-asset-id="${assetId}"][data-clip-kind="audio"]`).first();
    await expect(audioClip).toBeVisible();
    await expect(audioClip).toHaveAttribute('data-track-id', /^track-a/);

    const programMonitor = page.getByTestId('program-monitor');
    const controls = page.getByTestId('program-monitor-controls');
    await setRangeInputValue(controls.getByTestId('program-monitor-playhead-slider'), 6);
    await expect.poll(async () => Number((await controls.getByTestId('program-monitor-playhead-slider').getAttribute('data-playhead-value')) ?? '0')).toBeCloseTo(6, 1);

    const workerFrame = programMonitor.getByTestId(`program-worker-frame-${clipId}`).first();
    await expect(workerFrame).toBeVisible({ timeout: 20_000 });
    await expect(workerFrame).toHaveAttribute('data-worker-frame-reason', /Worker decoded|cached thumbnail|frame/i);

    const programVideo = programMonitor.getByTestId(`program-media-video-${clipId}`);

    const programAudioLayer = page.locator(`[data-testid^="program-audio-layer-"][data-audio-asset-id="${assetId}"]`).first();
    await expect(programAudioLayer).toBeAttached();
    await expect(programAudioLayer).not.toHaveAttribute('muted', '');

    await controls.getByRole('button', { name: 'Play' }).click();
    await expect(programVideo).toBeVisible({ timeout: 10_000 });
    await expect(programVideo).toHaveAttribute('data-program-asset-id', assetId);
    await expect.poll(async () => Number((await programAudioLayer.getAttribute('data-audio-playback-rate')) ?? '0')).toBeGreaterThan(0);
    await expect(programAudioLayer).toHaveAttribute('data-audio-can-play', 'true');
    await expect(programAudioLayer).toHaveAttribute('data-audio-output-mode', /native|web-audio/);
    await expect(programAudioLayer).toHaveAttribute('data-audio-play-error', '');
    await expect.poll(async () => Number(await programAudioLayer.evaluate((element) => (element as HTMLAudioElement).volume))).toBeGreaterThan(0);
    await expect.poll(async () => await programAudioLayer.evaluate((element) => (element as HTMLAudioElement).paused)).toBe(false);
    await expect.poll(async () => Number(await programAudioLayer.evaluate((element) => (element as HTMLAudioElement).currentTime))).toBeGreaterThan(0);
    await expect.poll(async () => Number(await programVideo.evaluate((element) => (element as HTMLVideoElement).currentTime))).toBeGreaterThan(0);
    await controls.getByRole('button', { name: /Pause/ }).click();
  } finally {
    await page.close({ runBeforeUnload: false }).catch(() => undefined);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('imports MP4 media then quick add inserts linked video and audio clips', async ({ page }) => {
  test.setTimeout(60_000);
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-import-mp4-quick-add-'));
  const mediaName = `mp4-quick-add-${Date.now()}.mp4`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    writeTestMp4WithAudio(mediaPath);
    await openEditor(page);
    const { assetCard, assetId } = await importMediaIntoEditor(page, mediaPath, mediaName);

    await assetCard.hover();
    await page.getByRole('button', { name: `+ Add ${mediaName}` }).click();

    const videoClip = page.locator(`[data-testid^="timeline-clip-"][data-asset-id="${assetId}"][data-clip-kind="video"]`).first();
    const audioClip = page.locator(`[data-testid^="timeline-clip-"][data-asset-id="${assetId}"][data-clip-kind="audio"]`).first();
    await expect(videoClip).toBeVisible();
    await expect(audioClip).toBeVisible();
    await expect(audioClip).toHaveAttribute('data-track-id', /^track-a/);
    await expect(videoClip).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await page.close({ runBeforeUnload: false }).catch(() => undefined);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('imports MP4 media then supports direct move and edge trim on the imported timeline clip', async ({ page }) => {
  test.setTimeout(60_000);
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-e2e-import-mp4-edit-'));
  const mediaName = `mp4-edit-${Date.now()}.mp4`;
  const mediaPath = join(tempRoot, mediaName);

  try {
    writeTestMp4VideoOnly(mediaPath);
    await openEditor(page);
    const { assetId } = await importMediaIntoEditor(page, mediaPath, mediaName);

    const videoClip = await dragImportedAssetToVideoLane(page, assetId, mediaName, 6);
    const clipId = await readRequiredAttribute(videoClip, 'data-clip-id');
    const beforeStart = Number((await videoClip.getAttribute('data-preview-start')) ?? '0');

    await dragLocatorCenterDuring(page, videoClip, -18, 0, async () => {
      await expect(videoClip).toHaveAttribute('aria-grabbed', 'true');
      await expect.poll(async () => Number((await videoClip.getAttribute('data-preview-start')) ?? '0')).toBeLessThan(beforeStart - 0.5);
    });
    await expect.poll(async () => Number((await videoClip.getAttribute('data-preview-start')) ?? '0')).toBeLessThan(beforeStart - 0.5);

    const beforeDuration = Number((await videoClip.getAttribute('data-preview-duration')) ?? '0');
    const trimTail = page.getByTestId(`timeline-trim-end-${clipId}`);
    await expect(trimTail).toBeVisible();
    await dragLocatorCenterDuring(page, trimTail, -12, 0, async () => {
      await expect.poll(async () => Number((await videoClip.getAttribute('data-preview-duration')) ?? '0')).toBeLessThan(beforeDuration);
    });
    await expect.poll(async () => Number((await videoClip.getAttribute('data-preview-duration')) ?? '0')).toBeLessThan(beforeDuration);
  } finally {
    await page.close({ runBeforeUnload: false }).catch(() => undefined);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('editor-shell')).toHaveAttribute('data-hydrated', 'true', { timeout: 30_000 });
}

async function importMediaIntoEditor(
  page: Page,
  mediaPath: string,
  mediaName: string,
): Promise<{ assetCard: Locator; assetId: string }> {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '+ Import' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(mediaPath);

  const assetCard = getMediaAssetCardByName(page, mediaName);
  await expect(assetCard).toBeVisible();
  const assetId = await assetCard.getAttribute('data-asset-id');
  expect(assetId).toBeTruthy();

  return { assetCard, assetId: assetId! };
}

function getMediaAssetCardByName(page: Page, mediaName: string): Locator {
  return page.locator(`[data-testid^="media-asset-card-"][data-asset-name="${mediaName}"]`).first();
}

async function dragImportedAssetToVideoLane(
  page: Page,
  assetId: string,
  mediaName: string,
  targetSeconds: number,
): Promise<Locator> {
  const dragHandle = page.getByTestId(`media-asset-drag-handle-${assetId}`);
  const videoLane = page.getByTestId('timeline-lane-track-v2');
  await dragHandle.scrollIntoViewIfNeeded();
  await videoLane.scrollIntoViewIfNeeded();
  await expect(dragHandle).toBeVisible();
  await expect(videoLane).toBeVisible();

  await dragAssetHandleToLane(page, dragHandle, videoLane, targetSeconds, async () => {
    const preview = page.getByTestId('timeline-drop-preview-asset-track-v2');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('data-drop-valid', 'true');
    await expect(preview).toHaveAttribute('data-drop-tone', 'asset');
    await expect(preview).toHaveAttribute('data-drop-label', mediaName);
  });

  const videoClip = page.locator(`[data-testid^="timeline-clip-"][data-asset-id="${assetId}"][data-track-id="track-v2"]`).first();
  await expect(videoClip).toBeVisible();
  await expect(videoClip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('program-monitor')).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('editor-status')).toContainText(`${mediaName} dropped on`);
  return videoClip;
}

async function readRequiredAttribute(locator: Locator, attributeName: string): Promise<string> {
  const value = await locator.getAttribute(attributeName);
  expect(value, `${attributeName} should be present`).toBeTruthy();
  return value!;
}

async function dragAssetHandleToLane(
  page: Page,
  source: Locator,
  lane: Locator,
  targetSeconds: number,
  duringDrag: () => Promise<void>,
): Promise<void> {
  const sourceBox = await source.boundingBox();
  const laneBox = await lane.boundingBox();
  expect(sourceBox, 'asset drag handle should be measurable').not.toBeNull();
  expect(laneBox, 'timeline lane should be measurable').not.toBeNull();

  const pixelsPerSecond = await lane.evaluate((element) => {
    const scrollContainer = element.closest('[data-testid="timeline-scroll-container"]');
    return Number(scrollContainer?.getAttribute('data-pixels-per-second') ?? '12');
  });
  const startX = sourceBox!.x + sourceBox!.width / 2;
  const startY = sourceBox!.y + sourceBox!.height / 2;
  const targetX = laneBox!.x + targetSeconds * pixelsPerSecond;
  const targetY = laneBox!.y + laneBox!.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 12 });
  await duringDrag();
  await page.mouse.up();
}

async function dragLocatorCenterDuring(
  page: Page,
  locator: Locator,
  deltaX: number,
  deltaY: number,
  duringDrag: () => Promise<void>,
): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, 'drag target should be measurable').not.toBeNull();

  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 6 });
  await duringDrag();
  await page.mouse.up();
}

async function setRangeInputValue(locator: Locator, value: number): Promise<void> {
  await locator.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    input.value = String(nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function writeSilentWav(path: string): Promise<void> {
  const sampleRate = 8000;
  const seconds = 1;
  const channels = 1;
  const bitsPerSample = 16;
  const dataSize = sampleRate * seconds * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  await writeFile(path, buffer);
}

async function writeTestPng(path: string): Promise<void> {
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAYAAABIdFAMAAAAAXNSR0IArs4c6QAAAJRJREFUaEPt1sENgCAMBNEU9w7dOETj0KKNCfmVA2tNfD5Nt0Ni1rbW2+zrgBiO0d8AMDAwMDAwMDAwMDAwMDAwMDAwMDCA+5u0uSxtrCwWUXdd11PSNA2mabp8xiEIAgDYxBgjWZZtDILA8xAEgQFg0zT9WJZlWZZlWZZlWZb/Z8YYAPuA5wHQaZq+f58xxmEYBmDb9hwMDAwMDAwMDAwMDAwMDAwMDAwMDCz8BfU6GHy2SFwAAAAASUVORK5CYII=';
  await writeFile(path, Buffer.from(pngBase64, 'base64'));
}

function writeTestMp4WithAudio(path: string): void {
  runFfmpegFixture([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=160x90:rate=12:duration=2',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=660:duration=2',
    '-shortest',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '32',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '64k',
    '-movflags',
    '+faststart',
    path,
  ], 'ffmpeg failed to generate Playwright MP4 import media');
}

function writeTestMp4VideoOnly(path: string): void {
  runFfmpegFixture([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=160x90:rate=12:duration=2',
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
    '+faststart',
    path,
  ], 'ffmpeg failed to generate Playwright video-only MP4 import media');
}

function runFfmpegFixture(args: string[], failureMessage: string): void {
  const result = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', args, {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || failureMessage);
  }
}
