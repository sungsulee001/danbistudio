import { expect, type Locator, type Page, test } from '@playwright/test';

test('supports direct program monitor transform manipulation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const timelinePlayhead = page.locator('input[type="range"][max="92"]').first();
  await expect(timelinePlayhead).toBeVisible();
  await setRangeInputValue(timelinePlayhead, 35);

  await page.getByRole('button', { name: 'Timeline clip Workflow demo' }).click();

  const frame = page.getByTestId('program-monitor-frame');
  await frame.scrollIntoViewIfNeeded();
  const overlay = frame.getByRole('button', { name: 'Selected visual transform' });
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('data-transform-handle-size', '28');
  await expect(overlay).toHaveAttribute('data-transform-rotate-handle-size', '30');
  const readout = frame.getByTestId('program-transform-readout-clip-interview-2');
  await expect(readout).toBeVisible();
  await expect(readout).toHaveAttribute('data-readout-scale', /[0-9.]+/);
  await expect(readout).toContainText(/X .* Y .* S .* R/);

  const before = await readOverlay(overlay);
  const scaleHandle = frame.getByRole('button', { name: 'Scale from bottom right' });
  await expect(scaleHandle).toHaveAttribute('data-handle-size', '28');
  await dragLocatorCenterDuring(page, scaleHandle, 120, 70, async () => {
    await expect(overlay).toHaveAttribute('data-transform-active-operation', 'scale');
    const hud = frame.getByTestId('program-transform-operation-hud-clip-interview-2');
    await expect(hud).toBeVisible();
    await expect(hud).toHaveAttribute('data-operation', 'scale');
    await expect(hud).toHaveAttribute('data-draft-scale', /[0-9.]+/);
    await expect(hud).toContainText('%');
    await expect(frame.getByTestId('program-transform-active-crosshair-clip-interview-2')).toHaveAttribute('data-operation', 'scale');
    await expect(readout).toHaveAttribute('data-readout-scale', /[0-9.]+/);
  });

  await expect.poll(async () => Number((await overlay.getAttribute('data-motion-scale')) ?? '1')).toBeGreaterThan(1.2);
  await expect.poll(async () => Number(await page.getByTestId('inspector-primary-transform-scale-percent').inputValue())).toBeGreaterThan(120);
  const afterScale = await readOverlay(overlay);
  expect(afterScale.width).toBeGreaterThan(before.width + 80);
  expect(afterScale.height).toBeGreaterThan(before.height + 40);

  const beforeMoveX = Number((await overlay.getAttribute('data-motion-render-x')) ?? '0');
  const beforeMoveY = Number((await overlay.getAttribute('data-motion-render-y')) ?? '0');
  await dragLocatorCenterDuring(page, overlay, 30, 24, async () => {
    await expect(overlay).toHaveAttribute('data-transform-active-operation', 'move');
    const hud = frame.getByTestId('program-transform-operation-hud-clip-interview-2');
    await expect(hud).toBeVisible();
    await expect(hud).toHaveAttribute('data-operation', 'move');
    await expect(hud).toHaveAttribute('data-draft-position-x', /-?[0-9.]+/);
    await expect(hud).toContainText(/X .* Y/);
    await expect(frame.getByTestId('program-transform-active-crosshair-clip-interview-2')).toHaveAttribute('data-operation', 'move');
    await expect(readout).toHaveAttribute('data-readout-position-x', /-?[0-9.]+/);
  });
  await expect.poll(async () => Number((await overlay.getAttribute('data-motion-render-x')) ?? '0') - beforeMoveX).toBeCloseTo(30, 1);
  await expect.poll(async () => Number((await overlay.getAttribute('data-motion-render-y')) ?? '0') - beforeMoveY).toBeCloseTo(24, 1);
  await expect.poll(async () => Number(await page.getByTestId('inspector-primary-transform-position-x').inputValue()))
    .toBeCloseTo(Number((await overlay.getAttribute('data-motion-position-x')) ?? '0'), 1);
  await expect.poll(async () => Number(await page.getByTestId('inspector-primary-transform-position-y').inputValue()))
    .toBeCloseTo(Number((await overlay.getAttribute('data-motion-position-y')) ?? '0'), 1);

  const rotateHandle = frame.getByRole('button', { name: 'Rotate selected visual' });
  await expect(rotateHandle).toBeVisible();
  await expect(rotateHandle).toHaveAttribute('data-handle-size', '30');
  await expect(await readHitLabelAtCenter(rotateHandle)).toBe('Rotate selected visual');
  await dragLocatorCenterDuring(page, rotateHandle, 90, 40, async () => {
    await expect(overlay).toHaveAttribute('data-transform-active-operation', 'rotate');
    const hud = frame.getByTestId('program-transform-operation-hud-clip-interview-2');
    await expect(hud).toBeVisible();
    await expect(hud).toHaveAttribute('data-operation', 'rotate');
    await expect(hud).toHaveAttribute('data-draft-rotation', /-?[0-9.]+/);
    await expect(hud).toContainText('deg');
    await expect(frame.getByTestId('program-transform-active-crosshair-clip-interview-2')).toHaveAttribute('data-operation', 'rotate');
    await expect(readout).toHaveAttribute('data-readout-rotation', /-?[0-9.]+/);
  });

  await expect.poll(async () => Math.abs(Number((await overlay.getAttribute('data-motion-rotation')) ?? '0'))).toBeGreaterThan(5);
  await expect(overlay).toHaveAttribute('data-transform-active-operation', 'idle');
});

test('exposes stacked program monitor layer selection targets', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const timelinePlayhead = page.locator('input[type="range"][max="92"]').first();
  await expect(timelinePlayhead).toBeVisible();
  await setRangeInputValue(timelinePlayhead, 2);

  await page.getByRole('button', { name: 'Timeline clip Opening title' }).click();

  const frame = page.getByTestId('program-monitor-frame');
  await frame.scrollIntoViewIfNeeded();
  const targets = frame.getByTestId('program-layer-selection-targets');
  await expect(targets).toBeVisible();
  await expect(targets).toHaveAttribute('data-layer-count', '2');
  await expect(targets).toHaveAttribute('data-selected-clip-id', 'clip-title-1');

  const titleTarget = frame.getByTestId('program-layer-select-clip-title-1');
  const founderTarget = frame.getByTestId('program-layer-select-clip-interview-1');
  await expect(titleTarget).toHaveAttribute('data-layer-selected', 'true');
  await expect(titleTarget).toHaveAttribute('data-layer-kind', 'text');
  await expect(titleTarget).toHaveAttribute('data-layer-track-name', 'Titles');
  await expect(titleTarget).toHaveAttribute('data-layer-motion-editable', 'true');
  await expect(founderTarget).toHaveAttribute('data-layer-selected', 'false');
  await expect(founderTarget).toHaveAttribute('data-layer-kind', 'video');
  await expect(founderTarget).toHaveAttribute('data-layer-track-name', 'A-roll');
  await expect(founderTarget).toHaveAttribute('data-layer-motion-keyframed', 'true');
  await expect(founderTarget).toHaveAttribute('data-layer-motion-editable', 'false');

  const titleOverlay = frame.getByTestId('program-transform-overlay-clip-title-1');
  await expect(titleOverlay).toBeVisible();
  await expect(titleOverlay).toHaveAttribute('data-selected-clip-name', 'Opening title');
  await expect(frame.getByTestId('program-transform-selection-label-clip-title-1')).toContainText('Opening title');

  await founderTarget.click({ position: { x: 12, y: 12 } });

  await expect(targets).toHaveAttribute('data-selected-clip-id', 'clip-interview-1');
  await expect(founderTarget).toHaveAttribute('data-layer-selected', 'true');
  await expect(titleTarget).toHaveAttribute('data-layer-selected', 'false');
  await expect(frame.getByTestId('program-transform-overlay-clip-interview-1')).toBeHidden();
  await expect(page.getByTestId('editor-status')).toContainText('Selected Founder intro from Program Monitor');
});

test('exposes selected clip transform controls in the default inspector', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const initialTransformPanel = page.getByTestId('inspector-primary-transform-panel');
  await expect(initialTransformPanel).toBeVisible();
  await expect(initialTransformPanel).toHaveAttribute('data-can-use-motion', 'false');
  await expect(initialTransformPanel).toHaveAttribute('data-can-apply-motion-preset', 'false');
  await expect(page.getByTestId('inspector-primary-transform-center')).toBeDisabled();
  await expect(page.getByTestId('inspector-primary-transform-scale-100')).toBeDisabled();
  await expect(page.getByTestId('inspector-primary-transform-reset')).toBeDisabled();
  await expect(page.getByTestId('inspector-primary-transform-preset-zoom-in')).toBeDisabled();

  const timelinePlayhead = page.locator('input[type="range"][max="92"]').first();
  await expect(timelinePlayhead).toBeVisible();
  await setRangeInputValue(timelinePlayhead, 35);

  await page.getByRole('button', { name: 'Timeline clip Workflow demo' }).click();

  const dockTabs = page.getByTestId('inspector-dock-tabs');
  await expect(page.getByTestId('inspector-edit-dock-tabs').getByRole('tab', { name: /Clip/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('inspector-edit-dock-tabs').getByRole('tab', { name: /Video/ })).toBeVisible();
  await expect(page.getByTestId('inspector-edit-dock-tabs').getByRole('tab', { name: /Audio/ })).toBeVisible();
  await expect(page.getByTestId('inspector-edit-dock-tabs').getByRole('tab', { name: /Speed/ })).toBeVisible();
  await expect(page.getByTestId('inspector-edit-dock-tabs').getByRole('tab', { name: /Animation/ })).toBeVisible();
  await expect(page.getByTestId('inspector-edit-dock-tabs').getByRole('tab', { name: /Tracking/ })).toBeVisible();
  await expect(page.getByTestId('inspector-edit-dock-tabs').getByRole('tab', { name: /Adjust/ })).toBeVisible();
  await expect(page.getByTestId('inspector-workflow-dock-tabs').getByRole('tab', { name: /Jobs/ })).toBeVisible();
  await expect(page.getByTestId('inspector-workflow-dock-tabs').getByRole('tab', { name: /Export/ })).toBeVisible();
  await expect(page.getByTestId('inspector-workflow-dock-tabs').getByRole('tab', { name: /Plugins/ })).toBeVisible();
  await expect(dockTabs).toBeVisible();

  const transformPanel = page.getByTestId('inspector-primary-transform-panel');
  const frame = page.getByTestId('program-monitor-frame');
  const overlay = frame.getByRole('button', { name: 'Selected visual transform' });
  await expect(transformPanel).toBeVisible();
  await expect(transformPanel).toHaveAttribute('data-can-use-motion', 'true');
  await expect(transformPanel).toHaveAttribute('data-can-apply-motion-preset', 'true');
  await expect(transformPanel).toHaveAttribute('data-motion-effect-state', 'default');
  await expect(page.getByTestId('inspector-primary-transform-state')).toContainText('default');
  await expect(page.getByTestId('inspector-primary-transform-center')).toBeEnabled();
  await expect(page.getByTestId('inspector-primary-transform-scale-100')).toBeEnabled();
  await expect(page.getByTestId('inspector-primary-transform-reset')).toBeEnabled();
  await expect(page.getByTestId('inspector-primary-transform-preset-panel')).toHaveAttribute('data-can-apply-motion-preset', 'true');
  await expect(page.getByTestId('inspector-primary-transform-preset-zoom-in')).toBeEnabled();
  await expect(overlay).toBeVisible();

  const commandPanel = page.getByTestId('inspector-command-panel');
  await expect(commandPanel).toHaveAttribute('data-selected-clip-count', '1');
  await expect(commandPanel).toHaveAttribute('data-clipboard-count', '0');
  await expect(commandPanel).toHaveAttribute('data-density', 'clustered');
  await expect(commandPanel).toHaveAttribute('data-command-cluster-count', '4');
  await expect(page.getByTestId('inspector-command-density-summary')).toHaveAttribute('data-has-selection', 'true');
  await expect(page.getByTestId('inspector-command-cluster-primary')).toBeVisible();
  await expect(page.getByTestId('inspector-command-cluster-clipboard')).toBeVisible();
  await expect(page.getByTestId('inspector-command-cluster-range')).toBeVisible();
  await expect(page.getByTestId('inspector-command-cluster-transitions')).toBeVisible();
  await expect(page.getByTestId('inspector-command-cut-at-playhead')).toBeEnabled();
  await expect(page.getByTestId('inspector-command-copy')).toBeEnabled();
  await expect(page.getByTestId('inspector-command-delete')).toBeEnabled();
  await expect(page.getByTestId('inspector-command-group')).toBeDisabled();
  await expect(page.getByTestId('inspector-command-pack')).toBeDisabled();
  await expect(page.getByTestId('inspector-command-paste')).toBeDisabled();
  await expect(page.getByTestId('inspector-command-paste-attr')).toBeDisabled();
  await expect(page.getByTestId('inspector-command-lift-range')).toBeDisabled();
  await expect(page.getByTestId('inspector-command-extract-range')).toBeDisabled();

  await dragRangeByRatio(page, transformPanel.getByRole('slider', { name: 'Scale transform' }), 0.13, 0.22);
  await expect.poll(async () => Number((await overlay.getAttribute('data-motion-scale')) ?? '1')).toBeGreaterThan(1.5);

  await dragRangeByRatio(page, transformPanel.getByRole('slider', { name: 'Rotation transform' }), 0.5, 0.55);
  await expect.poll(async () => Number((await overlay.getAttribute('data-motion-rotation')) ?? '0')).toBeGreaterThan(20);

  await setNumberInputValue(page.getByTestId('inspector-primary-transform-position-x'), 42);
  await setNumberInputValue(page.getByTestId('inspector-primary-transform-position-y'), -18);
  await expect.poll(async () => Number((await overlay.getAttribute('data-motion-position-x')) ?? '0')).toBeCloseTo(42, 1);
  await expect.poll(async () => Number((await overlay.getAttribute('data-motion-position-y')) ?? '0')).toBeCloseTo(-18, 1);

  await page.getByTestId('inspector-dock-tab-video').click();
  await expect(page.getByTestId('inspector-dock-tab-video')).toHaveAttribute('aria-selected', 'true');
  const transitionPanel = page.getByTestId('inspector-transition-panel');
  await expect(transitionPanel).toBeVisible();
  await expect(transitionPanel).toHaveAttribute('data-transition-state', 'cut');
  await expect(transitionPanel).toHaveAttribute('data-transition-type', 'cut');
  await expect(transitionPanel).toHaveAttribute('data-can-remove-transition', 'false');
  await expect(transitionPanel).toHaveAttribute('data-can-edit-direction', 'false');
  await expect(page.getByTestId('inspector-transition-state')).toContainText('Cut');
  await expect(page.getByTestId('inspector-transition-button-push')).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Timeline clip Founder intro' }).click();
  await page.getByTestId('inspector-dock-tab-video').click();
  await expect(transitionPanel).toHaveAttribute('data-transition-state', 'active');
  await expect(transitionPanel).toHaveAttribute('data-transition-type', 'crossfade');
  await expect(transitionPanel).toHaveAttribute('data-can-remove-transition', 'true');
  await expect(transitionPanel).toHaveAttribute('data-can-edit-direction', 'false');
  await expect(page.getByTestId('inspector-transition-state')).toContainText('Crossfade');
  await expect(page.getByTestId('inspector-transition-button-crossfade')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('inspector-transition-direction')).toBeDisabled();
  await expect(page.getByTestId('inspector-transition-remove')).toBeEnabled();

  await page.getByTestId('inspector-dock-tab-audio').click();
  await expect(page.getByTestId('inspector-dock-tab-audio')).toHaveAttribute('aria-selected', 'true');
  const audioPanel = page.getByTestId('inspector-audio-panel');
  await expect(audioPanel).toBeVisible();
  await expect(audioPanel).toHaveAttribute('data-can-apply-audio-fade', 'true');
  await expect(audioPanel).toHaveAttribute('data-has-audio-sync-pair', 'false');
  await expect(audioPanel).toHaveAttribute('data-can-sync-by-waveform', 'false');
  await expect(audioPanel).toHaveAttribute('data-waveform-sync-state', 'select-video-audio');
  await expect(page.getByTestId('inspector-audio-fade-in')).toBeEnabled();
  await expect(page.getByTestId('inspector-audio-fade-out')).toBeEnabled();
  await expect(page.getByTestId('inspector-audio-sync')).toBeDisabled();
  await expect(page.getByTestId('inspector-audio-sync-link')).toBeDisabled();

  const normalizePanel = page.getByTestId('inspector-peak-normalize-panel');
  const silencePanel = page.getByTestId('inspector-silence-panel');
  const beatPanel = page.getByTestId('inspector-beat-panel');
  await expect(normalizePanel).toBeVisible();
  await expect(silencePanel).toBeVisible();
  await expect(beatPanel).toBeVisible();
  await expect(normalizePanel).toHaveAttribute('data-normalize-ready-count', /\d+/);
  await expect(normalizePanel).toHaveAttribute('data-can-normalize-audio', /true|false/);
  await expect(silencePanel).toHaveAttribute('data-can-remove-silence', /true|false/);
  await expect(beatPanel).toHaveAttribute('data-can-detect-beats', /true|false/);
  await expect(page.getByTestId('inspector-peak-normalize-apply')).toBeDisabled();
  await expect(page.getByTestId('inspector-silence-analyze')).toBeDisabled();
  await expect(page.getByTestId('inspector-silence-remove')).toBeDisabled();
  await expect(page.getByTestId('inspector-beat-analyze')).toBeDisabled();
  await expect(page.getByTestId('inspector-beat-markers')).toBeDisabled();
  await expect(page.getByTestId('inspector-beat-cut')).toBeDisabled();

  await page.getByTestId('inspector-dock-tab-speed').click();
  await expect(page.getByTestId('inspector-dock-tab-speed')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('inspector-speed-panel')).toBeVisible();
  await expect(page.getByTestId('inspector-speed-panel').getByText('Speed Ramp')).toBeVisible();

  await page.getByTestId('inspector-dock-tab-animation').click();
  await expect(page.getByTestId('inspector-dock-tab-animation')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('inspector-animation-panel')).toBeVisible();
  await expect(page.getByTestId('inspector-animation-transform-panel')).toBeVisible();

  await page.getByTestId('inspector-dock-tab-tracking').click();
  await expect(page.getByTestId('inspector-tracking-panel')).toBeVisible();
  const trackingEffectsPanel = page.getByTestId('inspector-tracking-effects-panel');
  await expect(trackingEffectsPanel).toBeVisible();
  await expect(trackingEffectsPanel).toHaveAttribute('data-can-add-smart-reframe', 'true');
  await expect(trackingEffectsPanel).toHaveAttribute('data-can-track-subject', 'true');
  await expect(trackingEffectsPanel).toHaveAttribute('data-can-apply-object-mask', 'true');
  await expect(page.getByTestId('inspector-tracking-effects-quick-reframe')).toBeEnabled();
  await expect(page.getByTestId('inspector-tracking-effects-quick-track')).toBeEnabled();
  await expect(page.getByTestId('inspector-tracking-effects-quick-object')).toBeEnabled();

  await page.getByTestId('inspector-dock-tab-adjust').click();
  await expect(page.getByTestId('inspector-adjust-panel')).toBeVisible();
  const adjustEffectsPanel = page.getByTestId('inspector-adjust-effects-panel');
  await expect(adjustEffectsPanel).toBeVisible();
  await expect(adjustEffectsPanel).toHaveAttribute('data-can-add-color-effect', 'true');
  await expect(adjustEffectsPanel).toHaveAttribute('data-can-apply-color-lut', 'true');
  await expect(adjustEffectsPanel).toHaveAttribute('data-can-apply-ai-enhancement', 'true');
  await expect(adjustEffectsPanel).toHaveAttribute('data-can-apply-visual-filter', 'true');
  await expect(adjustEffectsPanel).toHaveAttribute('data-can-apply-stabilize', 'true');
  await expect(page.getByTestId('inspector-adjust-effects-quick-color')).toBeEnabled();
  await expect(page.getByTestId('inspector-adjust-effects-quick-ai-fx')).toBeEnabled();
  await expect(page.getByTestId('inspector-adjust-effects-visual-preset-blur-soft')).toBeEnabled();
  await expect(page.getByTestId('inspector-adjust-effects-ai-preset-denoise-sharpen')).toBeEnabled();
  await expect(page.getByTestId('inspector-adjust-effects-stabilize-preset-standard-deshake')).toBeEnabled();
});

test('supports direct timeline waveform volume adjustment', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const musicClip = page.getByTestId('timeline-clip-clip-music-1');
  await musicClip.scrollIntoViewIfNeeded();
  await expect(musicClip).toBeVisible();

  const volumeControl = page.getByTestId('timeline-volume-control-clip-music-1');
  await expect(volumeControl).toBeVisible();
  await expect(await readHitLabelAtCenter(volumeControl)).toBe('Timeline volume Music bed');

  const beforeVolume = Number((await volumeControl.getAttribute('data-volume-value')) ?? '1');
  await dragLocatorCenter(page, volumeControl, 0, -16);

  await expect.poll(async () => Number((await volumeControl.getAttribute('data-volume-value')) ?? '1')).toBeGreaterThan(beforeVolume + 0.25);
  await expect(page.getByText(/Timeline clip volume/)).toBeVisible();
});

test('supports direct program monitor crop corner manipulation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const timelinePlayhead = page.locator('input[type="range"][max="92"]').first();
  await expect(timelinePlayhead).toBeVisible();
  await setRangeInputValue(timelinePlayhead, 35);

  await page.getByRole('button', { name: 'Timeline clip Workflow demo' }).click();

  const frame = page.getByTestId('program-monitor-frame');
  await frame.scrollIntoViewIfNeeded();
  const cropBox = page.getByTestId('program-crop-box-clip-interview-2');
  await expect(cropBox).toBeVisible();
  await expect(cropBox).toHaveAttribute('data-crop-handle-size', '28');

  const topLeftCorner = frame.getByRole('button', { name: 'Crop top left corner' });
  await expect(topLeftCorner).toBeVisible();
  await expect(topLeftCorner).toHaveAttribute('data-handle-size', '28');
  await expect(await readHitLabelAtCenter(topLeftCorner)).toBe('Crop top left corner');

  const beforeCropLeft = Number((await cropBox.getAttribute('data-crop-left')) ?? '0');
  const beforeCropTop = Number((await cropBox.getAttribute('data-crop-top')) ?? '0');
  await dragLocatorCenterDuring(page, topLeftCorner, 60, 40, async () => {
    await expect(cropBox).toHaveAttribute('data-crop-active-handle', 'top-left');
    const cropHud = frame.getByTestId('program-crop-operation-hud-clip-interview-2');
    await expect(cropHud).toBeVisible();
    await expect(cropHud).toHaveAttribute('data-crop-active-handle', 'top-left');
    await expect(cropHud).toHaveAttribute('data-crop-draft-left', /[0-9.]+/);
    await expect(cropHud).toHaveAttribute('data-crop-draft-top', /[0-9.]+/);
    await expect(cropHud).toContainText(/L .* T/);
  });

  await expect.poll(async () => Number((await cropBox.getAttribute('data-crop-left')) ?? '0') - beforeCropLeft).toBeGreaterThan(0.05);
  await expect.poll(async () => Number((await cropBox.getAttribute('data-crop-top')) ?? '0') - beforeCropTop).toBeGreaterThan(0.05);
  await expect(cropBox).toHaveAttribute('data-crop-active-handle', 'idle');
  await expect(page.getByText('Program monitor crop adjusted')).toBeVisible();
});

test('supports direct timeline clip edge trim feedback', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');
  await activateSourceMonitor(page);

  const workflowClip = page.getByTestId('timeline-clip-clip-interview-2');
  await workflowClip.scrollIntoViewIfNeeded();
  await expect(workflowClip).toBeVisible();

  const trimHead = page.getByTestId('timeline-trim-start-clip-interview-2');
  await expect(trimHead).toBeVisible();
  await expect(await readHitLabelAtCenter(trimHead)).toBe('Trim head Workflow demo');

  const beforeStart = Number((await workflowClip.getAttribute('data-preview-start')) ?? '0');
  const beforeDuration = Number((await workflowClip.getAttribute('data-preview-duration')) ?? '0');

  await dragLocatorCenterDuring(page, trimHead, 48, 0, async () => {
    await expect.poll(async () => (await workflowClip.getAttribute('data-preview-label')) ?? '').toContain('Trim head +');
    await expect.poll(async () => Number((await workflowClip.getAttribute('data-preview-start')) ?? '0')).toBeGreaterThan(beforeStart + 0.2);
    await expect.poll(async () => Number((await workflowClip.getAttribute('data-preview-duration')) ?? '0')).toBeLessThan(beforeDuration - 0.2);
    await expect(workflowClip).toHaveAttribute('data-preview-operation', 'trim');
    await expect(workflowClip).toHaveAttribute('data-preview-ripple', 'false');
    await expect(workflowClip).toHaveAttribute('data-preview-state', /trim|snap|limit/);
    await expect(workflowClip).toHaveAttribute('data-preview-delta-label', /^\+/);
    await expect(page.getByTestId('timeline-clip-preview-badge-clip-interview-2')).toBeVisible();
    const trimHud = page.getByTestId('timeline-clip-edit-hud-clip-interview-2');
    await expect(trimHud).toBeVisible();
    await expect(trimHud).toHaveAttribute('data-hud-operation', 'trim');
    await expect(trimHud).toHaveAttribute('data-hud-delta-label', /^\+/);
  });

  await expect(page.getByText('Linked clip edge trimmed')).toBeVisible();
  await expect(workflowClip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('timeline-clip-selected-readout-clip-interview-2')).toBeVisible();
  await expect(page.getByTestId('timeline-clip-selected-readout-clip-interview-2')).toHaveAttribute('data-readout-duration', /[0-9.]+/);
  await expect(page.getByTestId('program-monitor')).toHaveAttribute('data-active', 'true');
  await expect.poll(async () => Number((await workflowClip.getAttribute('data-preview-start')) ?? '0')).toBeGreaterThan(beforeStart + 0.2);
});

test('shows ripple trim downstream impact while dragging a clip edge', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  await page.getByTestId('editor-toolbar-menu-timeline-summary').click();
  const rippleToggle = page.getByTestId('editor-toolbar-ripple-toggle');
  await rippleToggle.click();
  await expect(rippleToggle).toHaveAttribute('aria-pressed', 'true');

  const founderClip = page.getByTestId('timeline-clip-clip-interview-1');
  const workflowClip = page.getByTestId('timeline-clip-clip-interview-2');
  await founderClip.scrollIntoViewIfNeeded();
  await expect(founderClip).toBeVisible();
  await expect(workflowClip).toBeVisible();

  const beforeWorkflowStart = Number((await workflowClip.getAttribute('data-preview-start')) ?? '0');
  const trimTail = page.getByTestId('timeline-trim-end-clip-interview-1');
  await expect(trimTail).toBeVisible();

  await dragLocatorCenterDuring(page, trimTail, -48, 0, async () => {
    await expect(founderClip).toHaveAttribute('data-preview-operation', 'trim');
    await expect(founderClip).toHaveAttribute('data-preview-ripple', 'true');

    const rippleImpact = page.getByTestId('timeline-ripple-trim-preview-track-v1');
    await expect(rippleImpact).toBeVisible();
    await expect(rippleImpact).toHaveAttribute('data-ripple-operation', 'ripple-trim');
    await expect(rippleImpact).toHaveAttribute('data-ripple-edge', 'end');
    await expect(rippleImpact).toHaveAttribute('data-ripple-delta', /^-/);
    await expect.poll(async () => Number((await rippleImpact.getAttribute('data-ripple-affected-count')) ?? '0')).toBeGreaterThan(0);

    const workflowImpact = page.getByTestId('timeline-ripple-trim-preview-clip-clip-interview-2');
    await expect(workflowImpact).toBeVisible();
    await expect(workflowImpact).toHaveAttribute('data-ripple-delta', /^-/);
    await expect.poll(async () => Number((await workflowImpact.getAttribute('data-ripple-next-start')) ?? '0')).toBeLessThan(beforeWorkflowStart);
    await expect(page.getByTestId('timeline-edit-guide-line-track-v1')).toHaveAttribute('data-guide-ripple', 'true');
  });

  await expect.poll(async () => Number((await workflowClip.getAttribute('data-preview-start')) ?? '0')).toBeLessThan(beforeWorkflowStart);
});

test('keeps timeline clip edge trim pending below the drag threshold', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const workflowClip = page.getByTestId('timeline-clip-clip-interview-2');
  await workflowClip.scrollIntoViewIfNeeded();
  await expect(workflowClip).toBeVisible();

  const trimHead = page.getByTestId('timeline-trim-start-clip-interview-2');
  await expect(trimHead).toBeVisible();

  const beforeStart = Number((await workflowClip.getAttribute('data-preview-start')) ?? '0');

  await dragLocatorCenterDuring(page, trimHead, 2, 0, async () => {
    await expect(workflowClip).toHaveAttribute('aria-grabbed', 'false');
    expect(Number((await workflowClip.getAttribute('data-preview-start')) ?? '0')).toBeCloseTo(beforeStart, 3);
    expect((await workflowClip.getAttribute('data-preview-label')) ?? '').toBe('');
  });

  await expect(page.getByTestId('editor-status')).not.toContainText('Linked clip edge trimmed');
  expect(Number((await workflowClip.getAttribute('data-preview-start')) ?? '0')).toBeCloseTo(beforeStart, 3);
});

test('supports direct timeline clip body drag move feedback', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');
  await activateSourceMonitor(page);

  const workflowClip = page.getByTestId('timeline-clip-clip-interview-2');
  await workflowClip.scrollIntoViewIfNeeded();
  await expect(workflowClip).toBeVisible();

  const beforeStart = Number((await workflowClip.getAttribute('data-preview-start')) ?? '0');

  await dragLocatorCenterDuring(page, workflowClip, 72, 0, async () => {
    await expect.poll(async () => Number((await workflowClip.getAttribute('data-preview-start')) ?? '0')).toBeGreaterThan(beforeStart + 0.2);
    await expect(workflowClip).toHaveAttribute('aria-grabbed', 'true');
    await expect(workflowClip).toHaveAttribute('data-preview-operation', 'move');
    await expect(workflowClip).toHaveAttribute('data-preview-state', /move|snap|limit/);
    await expect(workflowClip).toHaveAttribute('data-preview-delta-label', /^\+/);
    const moveHud = page.getByTestId('timeline-clip-edit-hud-clip-interview-2');
    await expect(moveHud).toBeVisible();
    await expect(moveHud).toHaveAttribute('data-hud-operation', 'move');
    await expect(moveHud).toHaveAttribute('data-hud-delta-label', /^\+/);
    await expect(page.getByTestId('timeline-clip-preview-badge-clip-interview-2')).toBeVisible();
    const guideLine = page.getByTestId('timeline-edit-guide-line-track-v1');
    await expect(guideLine).toHaveAttribute('data-guide-active-track', 'true');
    await expect(guideLine).toHaveAttribute('data-guide-tone', /move|snap|limit/);
    await expect(guideLine).toHaveAttribute('data-guide-operation', 'move');
    await expect(guideLine).toHaveAttribute('data-guide-delta', /[0-9]/);
    await expect(guideLine).toHaveAttribute('data-guide-duration', /[0-9]/);
    await expect(guideLine).toHaveAttribute('data-guide-group-count', /[0-9]/);
    await expect(page.getByTestId('timeline-edit-guide-callout-track-v1')).toBeVisible();
  });

  await expect(page.getByTestId('editor-status')).toContainText('Clip dragged');
  await expect(workflowClip).toHaveAttribute('aria-pressed', 'true');
  const selectedReadout = page.getByTestId('timeline-clip-selected-readout-clip-interview-2');
  await expect(selectedReadout).toBeVisible();
  await expect(selectedReadout).toHaveAttribute('data-readout-start', /[0-9.]+/);
  await expect(selectedReadout).toHaveAttribute('data-readout-duration', /[0-9.]+/);
  await expect(page.getByTestId('program-monitor')).toHaveAttribute('data-active', 'true');
  await expect.poll(async () => Number((await workflowClip.getAttribute('data-preview-start')) ?? '0')).toBeGreaterThan(beforeStart + 0.2);
  await page.getByTestId('editor-toolbar-undo').click();
  await expect.poll(async () => Number((await workflowClip.getAttribute('data-preview-start')) ?? '0')).toBeCloseTo(beforeStart, 1);
  await page.getByTestId('editor-toolbar-redo').click();
  await expect.poll(async () => Number((await workflowClip.getAttribute('data-preview-start')) ?? '0')).toBeGreaterThan(beforeStart + 0.2);
});

test('shows blocked collision feedback while dragging a clip into occupied time', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const workflowClip = page.getByTestId('timeline-clip-clip-interview-2');
  await workflowClip.scrollIntoViewIfNeeded();
  await expect(workflowClip).toBeVisible();

  const beforeStart = Number((await workflowClip.getAttribute('data-preview-start')) ?? '0');

  await dragLocatorCenterDuring(page, workflowClip, -120, 0, async () => {
    await expect(workflowClip).toHaveAttribute('aria-grabbed', 'true');
    await expect(workflowClip).toHaveAttribute('data-preview-operation', 'move');
    await expect(workflowClip).toHaveAttribute('data-preview-constrained', 'true');
    const impact = page.getByTestId('timeline-clip-preview-impact-clip-interview-2');
    await expect(impact).toBeVisible();
    await expect(impact).toHaveAttribute('data-impact', 'limit');
    await expect(impact).toHaveText('Blocked');
    await expect.poll(async () => Number((await workflowClip.getAttribute('data-preview-start')) ?? '0')).toBeLessThan(beforeStart);
  });

  await expect.poll(async () => Number((await workflowClip.getAttribute('data-preview-start')) ?? '0')).toBeLessThan(beforeStart);
});

test('keeps timeline clip body interaction pending below the drag threshold', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const workflowClip = page.getByTestId('timeline-clip-clip-interview-2');
  await workflowClip.scrollIntoViewIfNeeded();
  await expect(workflowClip).toBeVisible();

  const beforeStart = Number((await workflowClip.getAttribute('data-preview-start')) ?? '0');

  await dragLocatorCenterDuring(page, workflowClip, 2, 1, async () => {
    await expect(workflowClip).toHaveAttribute('aria-grabbed', 'false');
    expect(Number((await workflowClip.getAttribute('data-preview-start')) ?? '0')).toBeCloseTo(beforeStart, 3);
  });
});

test('supports direct timeline zoom scrub and playhead manipulation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const zoomSlider = page.getByTestId('timeline-zoom-slider');
  const scrollContainer = page.getByTestId('timeline-scroll-container');
  await expect(zoomSlider).toBeVisible();

  const beforeZoom = Number((await scrollContainer.getAttribute('data-pixels-per-second')) ?? '0');
  await dragRangeByRatio(page, zoomSlider, 0.1, 0.9);
  await expect.poll(async () => Number((await scrollContainer.getAttribute('data-pixels-per-second')) ?? '0')).toBeGreaterThan(beforeZoom + 20);

  await scrollContainer.evaluate((element) => {
    element.scrollLeft = 300;
    element.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  const beforeWheelZoom = Number((await scrollContainer.getAttribute('data-pixels-per-second')) ?? '0');
  const beforeWheelScroll = await scrollContainer.evaluate((element) => element.scrollLeft);
  const anchorTimeBeforeWheel = await readTimelineTimeAtLocalRatio(scrollContainer, 0.5);
  await scrollContainer.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: 180,
      clientX: rect.left + rect.width * 0.5,
      clientY: rect.top + 20,
    }));
  });
  await expect.poll(async () => Number((await scrollContainer.getAttribute('data-pixels-per-second')) ?? '0')).toBeLessThan(beforeWheelZoom);
  await expect.poll(async () => scrollContainer.evaluate((element) => element.scrollLeft)).not.toBe(beforeWheelScroll);
  await expect.poll(async () => Math.abs((await readTimelineTimeAtLocalRatio(scrollContainer, 0.5)) - anchorTimeBeforeWheel)).toBeLessThan(0.15);
  await expect(page.getByTestId('editor-status')).toContainText(/Timeline zoom/);

  const scrubber = page.getByTestId('timeline-ruler-scrubber');
  await expect(scrubber).toBeVisible();
  await dragTimelineRulerVisibleDuring(page, scrubber, 360, async () => {
    await expect.poll(async () => Number((await scrubber.getAttribute('data-playhead-value')) ?? '0')).toBeGreaterThan(1);
  });
  await expect(page.getByTestId('editor-status')).toContainText(/Timeline scrubbed/);

  const playheadSlider = page.getByTestId('timeline-playhead-slider');
  await dragRangeByRatio(page, playheadSlider, 0.05, 0.65);
  await expect.poll(async () => Number((await playheadSlider.getAttribute('data-playhead-value')) ?? '0')).toBeGreaterThan(35);
});

test('applies source-derived timeline display controls to actual clip rendering', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const musicWaveform = page.getByTestId('timeline-waveform-clip-music-1');
  const waveformToggle = page.getByTestId('timeline-toggle-waveforms');
  await expect(musicWaveform).toBeVisible();
  await expect(waveformToggle).toHaveAttribute('aria-pressed', 'true');
  await waveformToggle.click();
  await expect(waveformToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(musicWaveform).toHaveCount(0);
  await waveformToggle.click();
  await expect(page.getByTestId('timeline-waveform-clip-music-1')).toBeVisible();

  const clip = page.getByTestId('timeline-clip-clip-interview-1');
  const heightSlider = page.getByTestId('timeline-track-height-slider');
  const beforeBox = await clip.boundingBox();
  expect(beforeBox, 'clip should be measurable before track height change').not.toBeNull();
  await dragRangeByRatio(page, heightSlider, 0.2, 0.98);
  await expect.poll(async () => {
    const box = await clip.boundingBox();
    return box?.height ?? 0;
  }).toBeGreaterThan((beforeBox?.height ?? 0) + 30);
});

test('supports direct timeline box selection and context actions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const lane = page.getByTestId('timeline-lane-track-v1');
  await lane.scrollIntoViewIfNeeded();
  await expect(lane).toBeVisible();

  await dragTimelineLaneRange(page, lane, 2, 68, async () => {
    const boxSelection = page.getByTestId('timeline-box-selection-track-v1');
    await expect(boxSelection).toBeVisible();
    await expect.poll(async () => Number((await boxSelection.getAttribute('data-selection-end')) ?? '0')).toBeGreaterThan(60);
  });

  const founderClip = page.getByTestId('timeline-clip-clip-interview-1');
  const workflowClip = page.getByTestId('timeline-clip-clip-interview-2');
  await expect(founderClip).toHaveAttribute('aria-pressed', 'true');
  await expect(workflowClip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('editor-status')).toContainText(/Selected 2 clips/);

  await workflowClip.click({ button: 'right' });
  const contextMenu = page.getByTestId('timeline-context-menu');
  await expect(contextMenu).toBeVisible();
  await expect(contextMenu).toHaveAttribute('data-anchor-clip-id', 'clip-interview-2');
  await expect(contextMenu).toHaveAttribute('data-anchor-clip-name', 'Workflow demo');
  await expect(contextMenu).toHaveAttribute('data-menu-section-count', '7');
  await expect.poll(async () => Number((await contextMenu.getAttribute('data-selection-count')) ?? '0')).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('timeline-context-selection-summary')).toContainText('2 clips selected');
  await expect(page.getByTestId('timeline-context-section-edit')).toBeVisible();
  await expect(page.getByTestId('timeline-context-section-selection')).toBeVisible();
  await expect(page.getByTestId('timeline-context-section-playhead')).toBeVisible();
  await expect(page.getByTestId('timeline-context-section-marks')).toBeVisible();
  await expect(page.getByTestId('timeline-context-section-audio')).toBeVisible();
  await expect(page.getByTestId('timeline-context-section-remove-transition')).toBeVisible();
  await expect(page.getByTestId('timeline-context-action-trim-head-to-playhead')).toBeVisible();
  await expect(page.getByTestId('timeline-context-action-copy')).toBeEnabled();
  await expect(page.getByTestId('timeline-context-action-group-clips')).toBeEnabled();
  await expect(page.getByTestId('timeline-context-action-paste-at-playhead')).toBeDisabled();
  await expect(page.getByTestId('timeline-context-action-paste-attributes')).toBeDisabled();
  await expect(page.getByTestId('timeline-context-action-paste-at-in-point')).toBeDisabled();
  await expect(page.getByTestId('timeline-context-action-go-to-in-point')).toBeDisabled();
  await expect(page.getByTestId('timeline-context-action-go-to-out-point')).toBeDisabled();
  await expect(page.getByTestId('timeline-context-action-select-marked-range')).toBeDisabled();
  await expect(page.getByTestId('timeline-context-action-cut-marked-range')).toBeDisabled();

  await page.getByTestId('timeline-context-action-copy').click();
  await expect(contextMenu).toBeHidden();
  await expect(page.getByTestId('editor-status')).toContainText('Copied 2 clips');

  await workflowClip.click({ button: 'right' });
  await expect(contextMenu).toBeVisible();
  await expect(contextMenu).toHaveAttribute('data-clipboard-count', '2');
  await expect(page.getByTestId('timeline-context-action-paste-at-playhead')).toBeEnabled();
  await expect(page.getByTestId('timeline-context-action-append-to-track')).toBeEnabled();
  await expect(page.getByTestId('timeline-context-action-paste-at-in-point')).toBeDisabled();
});

test('supports direct multi-select group clip drag move', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const lane = page.getByTestId('timeline-lane-track-v1');
  await lane.scrollIntoViewIfNeeded();
  await expect(lane).toBeVisible();

  await dragTimelineLaneRange(page, lane, 2, 68, async () => {
    await expect(page.getByTestId('timeline-box-selection-track-v1')).toBeVisible();
  });

  const founderClip = page.getByTestId('timeline-clip-clip-interview-1');
  const workflowClip = page.getByTestId('timeline-clip-clip-interview-2');
  await expect(founderClip).toHaveAttribute('aria-pressed', 'true');
  await expect(workflowClip).toHaveAttribute('aria-pressed', 'true');

  const beforeFounderStart = Number((await founderClip.getAttribute('data-preview-start')) ?? '0');
  const beforeWorkflowStart = Number((await workflowClip.getAttribute('data-preview-start')) ?? '0');

  await dragLocatorCenterDuring(page, workflowClip, 72, 0, async () => {
    await expect(workflowClip).toHaveAttribute('aria-grabbed', 'true');
    await expect(workflowClip).toHaveAttribute('data-preview-group-count', /[2-9][0-9]*/);
    const groupMovePreview = page.getByTestId('timeline-group-move-preview-track-v1');
    await expect(groupMovePreview).toBeVisible();
    await expect(groupMovePreview).toHaveAttribute('data-preview-operation', 'group-move');
    await expect.poll(async () => Number((await groupMovePreview.getAttribute('data-preview-group-count')) ?? '0')).toBeGreaterThan(1);
    await expect(page.getByTestId('timeline-group-move-preview-clip-clip-interview-1')).toBeVisible();
    await expect(page.getByTestId('timeline-group-move-preview-clip-clip-interview-2')).toBeVisible();
    const moveHud = page.getByTestId('timeline-clip-edit-hud-clip-interview-2');
    await expect(moveHud).toHaveAttribute('data-hud-group-count', /[2-9][0-9]*/);
    await expect(moveHud).toContainText(/clips/);
    const guideLine = page.getByTestId('timeline-edit-guide-line-track-v1');
    await expect(guideLine).toHaveAttribute('data-guide-group-count', /[2-9][0-9]*/);
  });

  await expect.poll(async () => Number((await founderClip.getAttribute('data-preview-start')) ?? '0')).toBeGreaterThan(beforeFounderStart + 0.2);
  await expect.poll(async () => Number((await workflowClip.getAttribute('data-preview-start')) ?? '0')).toBeGreaterThan(beforeWorkflowStart + 0.2);
});

test('supports direct multi-select group clip edge trim', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const lane = page.getByTestId('timeline-lane-track-v1');
  await lane.scrollIntoViewIfNeeded();
  await expect(lane).toBeVisible();

  await dragTimelineLaneRange(page, lane, 2, 68, async () => {
    await expect(page.getByTestId('timeline-box-selection-track-v1')).toBeVisible();
  });

  const founderClip = page.getByTestId('timeline-clip-clip-interview-1');
  const workflowClip = page.getByTestId('timeline-clip-clip-interview-2');
  await expect(founderClip).toHaveAttribute('aria-pressed', 'true');
  await expect(workflowClip).toHaveAttribute('aria-pressed', 'true');

  const beforeFounderDuration = Number((await founderClip.getAttribute('data-preview-duration')) ?? '0');
  const beforeWorkflowDuration = Number((await workflowClip.getAttribute('data-preview-duration')) ?? '0');
  const trimTail = page.getByTestId('timeline-trim-end-clip-interview-2');
  await expect(trimTail).toBeVisible();

  await dragLocatorCenterDuring(page, trimTail, -48, 0, async () => {
    await expect(workflowClip).toHaveAttribute('data-preview-operation', 'trim');
    await expect(workflowClip).toHaveAttribute('data-preview-group-count', /[2-9][0-9]*/);
    const groupTrimPreview = page.getByTestId('timeline-group-trim-preview-track-v1');
    await expect(groupTrimPreview).toBeVisible();
    await expect(groupTrimPreview).toHaveAttribute('data-preview-operation', 'group-trim');
    await expect(groupTrimPreview).toHaveAttribute('data-preview-edge', 'end');
    await expect(groupTrimPreview).toHaveAttribute('data-preview-delta', /^-/);
    await expect.poll(async () => Number((await groupTrimPreview.getAttribute('data-preview-group-count')) ?? '0')).toBeGreaterThan(1);
    await expect(page.getByTestId('timeline-group-trim-preview-clip-clip-interview-1')).toBeVisible();
    await expect(page.getByTestId('timeline-group-trim-preview-clip-clip-interview-2')).toBeVisible();
    const trimHud = page.getByTestId('timeline-clip-edit-hud-clip-interview-2');
    await expect(trimHud).toHaveAttribute('data-hud-group-count', /[2-9][0-9]*/);
    await expect(trimHud).toContainText(/clips/);
    const guideLine = page.getByTestId('timeline-edit-guide-line-track-v1');
    await expect(guideLine).toHaveAttribute('data-guide-group-count', /[2-9][0-9]*/);
  });

  await expect.poll(async () => Number((await founderClip.getAttribute('data-preview-duration')) ?? '0')).toBeLessThan(beforeFounderDuration - 0.2);
  await expect.poll(async () => Number((await workflowClip.getAttribute('data-preview-duration')) ?? '0')).toBeLessThan(beforeWorkflowDuration - 0.2);
});

test('supports direct slip edit with Alt clip drag', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const workflowClip = page.getByTestId('timeline-clip-clip-interview-2');
  await workflowClip.scrollIntoViewIfNeeded();
  await expect(workflowClip).toBeVisible();

  const beforeStart = Number((await workflowClip.getAttribute('data-preview-start')) ?? '0');
  const beforeDuration = Number((await workflowClip.getAttribute('data-preview-duration')) ?? '0');
  const beforeSourceIn = Number((await workflowClip.getAttribute('data-source-in')) ?? '0');

  await dragLocatorCenterDuringWithModifiers(page, workflowClip, 48, 0, ['Alt'], async () => {
    await expect(workflowClip).toHaveAttribute('aria-grabbed', 'true');
    await expect(workflowClip).toHaveAttribute('data-preview-operation', 'slip');
    await expect(workflowClip).toHaveAttribute('data-preview-source-delta', /^[0-9]/);
    expect(Number((await workflowClip.getAttribute('data-preview-start')) ?? '0')).toBeCloseTo(beforeStart, 3);
    expect(Number((await workflowClip.getAttribute('data-preview-duration')) ?? '0')).toBeCloseTo(beforeDuration, 3);
    await expect.poll(async () => Number((await workflowClip.getAttribute('data-preview-source-in')) ?? '0')).toBeGreaterThan(beforeSourceIn + 0.2);
    const slipHud = page.getByTestId('timeline-clip-edit-hud-clip-interview-2');
    await expect(slipHud).toHaveAttribute('data-hud-operation', 'slip');
    await expect(slipHud).toHaveAttribute('data-hud-source-delta', /^[0-9]/);
  });

  await expect.poll(async () => Number((await workflowClip.getAttribute('data-source-in')) ?? '0')).toBeGreaterThan(beforeSourceIn + 0.2);
  expect(Number((await workflowClip.getAttribute('data-preview-start')) ?? '0')).toBeCloseTo(beforeStart, 3);
});

test('supports direct roll trim with Alt edge drag', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const founderClip = page.getByTestId('timeline-clip-clip-interview-1');
  const workflowClip = page.getByTestId('timeline-clip-clip-interview-2');
  await workflowClip.scrollIntoViewIfNeeded();
  await expect(founderClip).toBeVisible();
  await expect(workflowClip).toBeVisible();

  const beforeFounderDuration = Number((await founderClip.getAttribute('data-preview-duration')) ?? '0');
  const beforeWorkflowStart = Number((await workflowClip.getAttribute('data-preview-start')) ?? '0');
  const beforeWorkflowSourceIn = Number((await workflowClip.getAttribute('data-source-in')) ?? '0');
  const trimHead = page.getByTestId('timeline-trim-start-clip-interview-2');
  await expect(trimHead).toBeVisible();

  await dragLocatorCenterDuringWithModifiers(page, trimHead, 48, 0, ['Alt'], async () => {
    await expect(workflowClip).toHaveAttribute('data-preview-operation', 'roll');
    await expect(workflowClip).toHaveAttribute('data-preview-source-delta', /^[0-9]/);
    await expect.poll(async () => Number((await workflowClip.getAttribute('data-preview-start')) ?? '0')).toBeGreaterThan(beforeWorkflowStart + 0.2);
    await expect.poll(async () => Number((await workflowClip.getAttribute('data-preview-source-in')) ?? '0')).toBeGreaterThan(beforeWorkflowSourceIn + 0.2);
    const neighborImpact = page.getByTestId('timeline-neighbor-impact-preview-track-v1');
    await expect(neighborImpact).toBeVisible();
    await expect(neighborImpact).toHaveAttribute('data-preview-operation', 'roll');
    await expect(neighborImpact).toHaveAttribute('data-preview-edge', 'start');
    await expect.poll(async () => Number((await neighborImpact.getAttribute('data-preview-affected-count')) ?? '0')).toBeGreaterThan(1);
    await expect(page.getByTestId('timeline-neighbor-impact-preview-clip-clip-interview-1')).toHaveAttribute('data-preview-role', 'neighbor');
    await expect(page.getByTestId('timeline-neighbor-impact-preview-clip-clip-interview-2')).toHaveAttribute('data-preview-role', 'anchor');
    const rollHud = page.getByTestId('timeline-clip-edit-hud-clip-interview-2');
    await expect(rollHud).toHaveAttribute('data-hud-operation', 'roll');
  });

  await expect.poll(async () => Number((await founderClip.getAttribute('data-preview-duration')) ?? '0')).toBeGreaterThan(beforeFounderDuration + 0.2);
  await expect.poll(async () => Number((await workflowClip.getAttribute('data-preview-start')) ?? '0')).toBeGreaterThan(beforeWorkflowStart + 0.2);
  await expect.poll(async () => Number((await workflowClip.getAttribute('data-source-in')) ?? '0')).toBeGreaterThan(beforeWorkflowSourceIn + 0.2);
});

test('supports direct slide edit with Shift Alt clip drag when a next clip exists', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const assetThumbnail = page.getByTestId('media-asset-drag-handle-asset-interview');
  const targetLane = page.getByTestId('timeline-lane-track-v1');
  await assetThumbnail.scrollIntoViewIfNeeded();
  await targetLane.scrollIntoViewIfNeeded();
  await dragAssetToLaneOnTrack(page, assetThumbnail, targetLane, 'track-v1', 70);
  await expect(page.getByTestId('editor-status')).toContainText('Interview master take dropped on A-roll');

  const workflowClip = page.getByTestId('timeline-clip-clip-interview-2');
  await workflowClip.scrollIntoViewIfNeeded();
  await expect(workflowClip).toBeVisible();

  const beforeStart = Number((await workflowClip.getAttribute('data-preview-start')) ?? '0');
  const beforeDuration = Number((await workflowClip.getAttribute('data-preview-duration')) ?? '0');

  await dragLocatorCenterDuringWithModifiers(page, workflowClip, 24, 0, ['Shift', 'Alt'], async () => {
    await expect(workflowClip).toHaveAttribute('aria-grabbed', 'true');
    await expect(workflowClip).toHaveAttribute('data-preview-operation', 'slide');
    await expect.poll(async () => Number((await workflowClip.getAttribute('data-preview-start')) ?? '0')).toBeGreaterThan(beforeStart + 0.2);
    expect(Number((await workflowClip.getAttribute('data-preview-duration')) ?? '0')).toBeCloseTo(beforeDuration, 3);
    const neighborImpact = page.getByTestId('timeline-neighbor-impact-preview-track-v1');
    await expect(neighborImpact).toBeVisible();
    await expect(neighborImpact).toHaveAttribute('data-preview-operation', 'slide');
    await expect.poll(async () => Number((await neighborImpact.getAttribute('data-preview-affected-count')) ?? '0')).toBeGreaterThan(1);
    await expect(page.getByTestId('timeline-neighbor-impact-preview-clip-clip-interview-2')).toHaveAttribute('data-preview-role', 'anchor');
    const slideHud = page.getByTestId('timeline-clip-edit-hud-clip-interview-2');
    await expect(slideHud).toHaveAttribute('data-hud-operation', 'slide');
  });

  await expect.poll(async () => Number((await workflowClip.getAttribute('data-preview-start')) ?? '0')).toBeGreaterThan(beforeStart + 0.2);
  expect(Number((await workflowClip.getAttribute('data-preview-duration')) ?? '0')).toBeCloseTo(beforeDuration, 3);
});

test('supports direct clip drag move to another compatible video track', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const workflowClip = page.getByTestId('timeline-clip-clip-interview-2');
  const targetLane = page.getByTestId('timeline-lane-track-v2');
  await workflowClip.scrollIntoViewIfNeeded();
  await expect(workflowClip).toBeVisible();
  await expect(workflowClip).toHaveAttribute('data-track-id', 'track-v1');
  await targetLane.scrollIntoViewIfNeeded();
  await expect(targetLane).toBeVisible();

  await dragLocatorCenterToLocatorDuring(page, workflowClip, targetLane, async () => {
    const preview = page.getByTestId('timeline-drop-preview-clip-track-v2');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('data-drop-valid', 'true');
    await expect(preview).toHaveAttribute('data-drop-state', 'ready');
    await expect(preview).toHaveAttribute('data-drop-operation', 'clip-drop');
    await expect(preview).toHaveAttribute('data-drop-collision', 'false');
    await expect(preview).toHaveAttribute('data-drop-impact', /clip|snap|move/);
    await expect(page.getByTestId('timeline-drop-preview-start-clip-track-v2')).toBeVisible();
    await expect(page.getByTestId('timeline-drop-preview-end-clip-track-v2')).toBeVisible();
    const guideLine = page.getByTestId('timeline-edit-guide-line-track-v2');
    await expect(guideLine).toHaveAttribute('data-guide-active-track', 'true');
    await expect(guideLine).toHaveAttribute('data-guide-tone', 'drop');
  });

  await expect.poll(async () => await workflowClip.getAttribute('data-track-id')).toBe('track-v2');
});

test('supports direct media bin drag drop onto timeline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const assetCard = page.getByTestId('media-asset-card-asset-interview');
  const assetThumbnail = page.getByTestId('media-asset-thumbnail-asset-interview');
  const targetLane = page.getByTestId('timeline-lane-track-v2');
  await assetThumbnail.scrollIntoViewIfNeeded();
  await expect(assetCard).toBeVisible();
  await expect(assetThumbnail).toBeVisible();
  await targetLane.scrollIntoViewIfNeeded();
  await expect(targetLane).toBeVisible();

  await dragAssetToLane(page, assetThumbnail, targetLane, 30);

  await expect(page.getByTestId('editor-status')).toContainText('Interview master take dropped on AI B-roll');
});

test('keeps monitor diagnostics hidden by default and source video audio unmuted', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const programMonitor = page.getByTestId('program-monitor');
  const monitorWorkspace = page.getByTestId('editor-monitor-workspace');
  await expect(programMonitor.getByTestId('program-preview-performance')).toBeHidden();
  await expect(programMonitor.getByTestId('program-stack-overlay')).toBeHidden();
  await expect(programMonitor.getByRole('button', { name: 'Info' })).toBeVisible();
  await expect(monitorWorkspace).toHaveAttribute('data-active-monitor', 'program');
  await expect(monitorWorkspace).toHaveAttribute('data-source-monitor-visible', 'false');
  await expect(page.getByTestId('editor-monitor-switch-program')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('editor-monitor-switch-source')).toHaveAttribute('aria-pressed', 'false');

  await page.getByTestId('editor-monitor-switch-source').click();
  await expect(monitorWorkspace).toHaveAttribute('data-active-monitor', 'source');
  await expect(monitorWorkspace).toHaveAttribute('data-source-monitor-visible', 'true');
  await expect(page.getByTestId('editor-source-monitor-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('source-monitor')).toHaveAttribute('data-active', 'true');
  await expect(programMonitor).toHaveAttribute('data-active', 'false');

  await page.getByTestId('editor-monitor-switch-program').click();
  await expect(monitorWorkspace).toHaveAttribute('data-active-monitor', 'program');
  await expect(monitorWorkspace).toHaveAttribute('data-source-monitor-visible', 'true');
  await expect(page.getByTestId('source-monitor')).toHaveAttribute('data-active', 'false');
  await expect(programMonitor).toHaveAttribute('data-active', 'true');

  await page.getByTestId('editor-source-monitor-toggle').click();
  await expect(page.getByTestId('editor-source-monitor-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('editor-source-monitor-toggle').click();
  await expect(page.getByTestId('editor-source-monitor-toggle')).toHaveAttribute('aria-pressed', 'true');

  const sourceMonitor = page.getByRole('button', { name: /^Source Monitor/ });
  const sourceVideo = sourceMonitor.locator('video').first();
  await expect(sourceVideo).toBeVisible();
  await expect(sourceVideo).not.toHaveAttribute('muted', '');
  await expect(sourceMonitor.getByTestId('source-video-scopes')).toBeHidden();
  await expect(sourceMonitor.getByRole('button', { name: 'Info' })).toBeVisible();
});

test('links program monitor player controls to the timeline state', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const programMonitor = page.getByTestId('program-monitor');
  const monitorWorkspace = page.getByTestId('editor-monitor-workspace');
  const controls = page.getByTestId('program-monitor-controls');
  await expect(controls).toBeVisible();
  await expect(controls.getByText(/00:00:00:00/)).toBeVisible();
  await expect(controls).toHaveAttribute('data-playhead-value', '0');
  await expect(controls).toHaveAttribute('data-playback-state', 'paused');
  await expect(controls).toHaveAttribute('data-playback-rate', '0');
  await expect(controls).toHaveAttribute('data-audio-layer-count', /[1-9][0-9]*/);
  await expect(controls).toHaveAttribute('data-overlay-mode', 'clean');
  await expect(controls).toHaveAttribute('data-controls-density', 'compact');
  await expect(page.getByTestId('program-monitor-frame')).toHaveAttribute('data-audio-layer-count', /[1-9][0-9]*/);
  await expect(page.getByTestId('program-monitor-frame')).toHaveAttribute('data-overlay-mode', 'clean');
  await expect(controls.getByText('16:9')).toBeVisible();
  await expect(page.getByTestId('program-monitor-aspect-label')).toHaveAttribute('data-aspect-label', '16:9');
  await expect(page.getByTestId('program-monitor-frame')).toHaveAttribute('data-monitor-aspect', '16:9');
  await expect(controls).toHaveAttribute('data-monitor-fullscreen', 'false');
  await expect(controls.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect(controls.getByRole('button', { name: /Proxy/ })).toBeVisible();
  await expect(controls.getByRole('button', { name: 'Full' })).toBeVisible();

  const programAudioLayer = page.locator('[data-testid^="program-audio-layer-"]').first();
  await expect(programAudioLayer).toBeAttached();
  await expect(programAudioLayer).not.toHaveAttribute('muted', '');

  await controls.getByRole('button', { name: 'Play' }).click();
  await expect.poll(async () => Number((await programAudioLayer.getAttribute('data-audio-playback-rate')) ?? '0')).toBeGreaterThan(0);
  await expect(programAudioLayer).toHaveAttribute('data-audio-can-play', 'true');
  await expect.poll(async () => Number((await programAudioLayer.getAttribute('data-audio-gain')) ?? '0')).toBeGreaterThan(0);
  await controls.getByRole('button', { name: /Pause/ }).click();

  const programPlayhead = page.getByTestId('program-monitor-playhead-slider');
  const timelinePlayhead = page.getByTestId('timeline-playhead-slider');
  await page.getByTestId('editor-monitor-switch-source').click();
  await expect(monitorWorkspace).toHaveAttribute('data-active-monitor', 'source');
  await setRangeInputValue(programPlayhead, 12);
  await expect(monitorWorkspace).toHaveAttribute('data-active-monitor', 'program');
  await expect(controls).toHaveAttribute('data-playhead-value', '12');
  await expect(page.getByTestId('program-monitor-frame')).toHaveAttribute('data-playhead-value', '12');
  await expect.poll(async () => Number((await timelinePlayhead.getAttribute('data-playhead-value')) ?? '0')).toBeCloseTo(12, 1);

  const frame = page.getByTestId('program-monitor-frame');
  await expect.poll(async () => {
    const monitorBox = await programMonitor.boundingBox();
    const frameBox = await frame.boundingBox();
    if (!monitorBox || !frameBox) {
      return 0;
    }
    return frameBox.height / monitorBox.height;
  }).toBeGreaterThan(0.9);
  await expect.poll(async () => {
    const monitorBox = await programMonitor.boundingBox();
    const frameBox = await frame.boundingBox();
    if (!monitorBox || !frameBox) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.abs((frameBox.x + frameBox.width / 2) - (monitorBox.x + monitorBox.width / 2));
  }).toBeLessThan(2);
  await expect.poll(async () => {
    const frameBox = await frame.boundingBox();
    const viewportBox = await page.getByTestId('program-monitor-canvas-viewport').boundingBox();
    const controlsBox = await controls.boundingBox();
    const mediaBox = await programMonitor.locator('video, img').first().boundingBox();
    if (!frameBox || !viewportBox || !controlsBox || !mediaBox) {
      return Number.POSITIVE_INFINITY;
    }
    const centerX = frameBox.x + frameBox.width / 2;
    return Math.max(
      Math.abs((viewportBox.x + viewportBox.width / 2) - centerX),
      Math.abs((controlsBox.x + controlsBox.width / 2) - centerX),
      Math.abs((mediaBox.x + mediaBox.width / 2) - centerX),
    );
  }).toBeLessThan(2);

  const beforeStageBox = await programMonitor.locator('video, img').first().boundingBox();
  const zoomSlider = page.getByTestId('program-monitor-zoom-slider');
  await setRangeInputValue(zoomSlider, 150);
  await expect(page.getByTestId('program-monitor-zoom-readout')).toHaveAttribute('data-zoom-percent', '150');
  await expect(page.getByTestId('program-monitor-fit-button')).toHaveText('Fit');
  await expect(controls).toHaveAttribute('data-monitor-zoom', '150');
  await expect(frame).toHaveAttribute('data-monitor-zoom', '150');
  await expect(page.getByTestId('program-monitor-canvas-viewport')).toHaveAttribute('data-pan-enabled', 'true');
  await expect(page.getByTestId('program-monitor-canvas-stage')).toHaveAttribute('data-zoom-percent', '150');
  const afterStageBox = await frame.locator('video, img').first().boundingBox();
  expect(afterStageBox?.width ?? 0).toBeGreaterThan(beforeStageBox?.width ?? 0);
  await page.getByTestId('program-monitor-fit-button').click();
  await expect(page.getByTestId('program-monitor-zoom-readout')).toHaveAttribute('data-zoom-percent', '100');
  await setRangeInputValue(zoomSlider, 150);

  const canvasViewport = page.getByTestId('program-monitor-canvas-viewport');
  const canvasStage = page.getByTestId('program-monitor-canvas-stage');
  await dragLocatorCenterWithButton(page, canvasViewport, -80, -42, 'middle');
  await expect.poll(async () => {
    const panX = Number((await canvasStage.getAttribute('data-pan-x')) ?? '0');
    const panY = Number((await canvasStage.getAttribute('data-pan-y')) ?? '0');
    return Math.abs(panX) + Math.abs(panY);
  }).toBeGreaterThan(20);
  await expect(frame).not.toHaveAttribute('data-monitor-pan-x', '0');

  await canvasViewport.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -180,
      clientX: rect.left + rect.width * 0.75,
      clientY: rect.top + rect.height * 0.6,
    }));
  });
  await expect(page.getByTestId('program-monitor-zoom-readout')).toHaveAttribute('data-zoom-percent', '170');
  await expect(canvasStage).toHaveAttribute('data-zoom-percent', '170');
});

async function setRangeInputValue(locator: Locator, value: number): Promise<void> {
  await locator.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    input.value = String(nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function activateSourceMonitor(page: Page): Promise<void> {
  await page.getByTestId('editor-source-monitor-toggle').click();
  const sourceMonitor = page.getByTestId('source-monitor');
  await expect(sourceMonitor).toBeVisible();
  await sourceMonitor.click();
  await expect(sourceMonitor).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('program-monitor')).toHaveAttribute('data-active', 'false');
}

async function readTimelineTimeAtLocalRatio(locator: Locator, ratio: number): Promise<number> {
  return locator.evaluate((element, localRatio) => {
    const pixelsPerSecond = Number(element.getAttribute('data-pixels-per-second') ?? '0');
    if (!Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) {
      return 0;
    }

    return (element.scrollLeft + element.clientWidth * localRatio) / pixelsPerSecond;
  }, ratio);
}

async function setNumberInputValue(locator: Locator, value: number): Promise<void> {
  await locator.fill(String(value));
  await locator.dispatchEvent('change');
}

async function dragLocatorCenter(page: Page, locator: Locator, deltaX: number, deltaY: number): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, 'drag target should be measurable').not.toBeNull();

  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 6 });
  await page.mouse.up();
}

async function dragLocatorCenterWithButton(
  page: Page,
  locator: Locator,
  deltaX: number,
  deltaY: number,
  button: 'left' | 'right' | 'middle',
): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, 'drag target should be measurable').not.toBeNull();

  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down({ button });
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 6 });
  await page.mouse.up({ button });
}

async function dragRangeByRatio(page: Page, locator: Locator, fromRatio: number, toRatio: number): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, 'range input should be measurable').not.toBeNull();

  const startX = box!.x + box!.width * fromRatio;
  const endX = box!.x + box!.width * toRatio;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(endX, y, { steps: 8 });
  await page.mouse.up();
}

async function dragTimelineLaneRange(
  page: Page,
  lane: Locator,
  startSeconds: number,
  endSeconds: number,
  duringDrag: () => Promise<void>,
): Promise<void> {
  const box = await lane.boundingBox();
  expect(box, 'timeline lane should be measurable').not.toBeNull();

  const pixelsPerSecond = await lane.evaluate((element) => {
    const scrollContainer = element.closest('[data-testid="timeline-scroll-container"]');
    return Number(scrollContainer?.getAttribute('data-pixels-per-second') ?? '12');
  });
  const startX = box!.x + startSeconds * pixelsPerSecond;
  const endX = box!.x + endSeconds * pixelsPerSecond;
  const y = box!.y + box!.height - 7;

  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(endX, y, { steps: 10 });
  await duringDrag();
  await page.mouse.up();
}

async function dragAssetToLane(page: Page, assetCard: Locator, lane: Locator, targetSeconds: number): Promise<void> {
  const sourceBox = await assetCard.boundingBox();
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
  const targetY = laneBox!.y + laneBox!.height - 8;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 12 });
  const preview = page.getByTestId('timeline-drop-preview-asset-track-v2');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('data-drop-tone', 'asset');
  await expect(preview).toHaveAttribute('data-drop-label', /Interview master take/);
  await expect(preview).toHaveAttribute('data-drop-operation', 'asset-drop');
  await expect(preview).toHaveAttribute('data-drop-ripple', 'true');
  await expect(preview).toHaveAttribute('data-drop-ghost', 'true');
  await expect(preview).toHaveAttribute('data-drop-ghost-reason', 'ripple');
  await expect(preview).toHaveAttribute('data-drop-collision', 'false');
  await expect(preview).toHaveAttribute('data-drop-impact', /insert|snap/);
  const impactGhost = page.getByTestId('timeline-drop-preview-impact-asset-track-v2');
  await expect(impactGhost).toBeVisible();
  await expect(impactGhost).toHaveAttribute('data-impact-reason', 'ripple');
  await page.mouse.up();
}

async function dragAssetToLaneOnTrack(
  page: Page,
  assetCard: Locator,
  lane: Locator,
  trackId: string,
  targetSeconds: number,
): Promise<void> {
  const sourceBox = await assetCard.boundingBox();
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
  const targetY = laneBox!.y + laneBox!.height - 8;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 12 });
  const preview = page.getByTestId(`timeline-drop-preview-asset-${trackId}`);
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('data-drop-valid', 'true');
  await expect(preview).toHaveAttribute('data-drop-tone', 'asset');
  await page.mouse.up();
}

async function dragTimelineRulerVisibleDuring(
  page: Page,
  scrubber: Locator,
  deltaX: number,
  duringDrag: () => Promise<void>,
): Promise<void> {
  const scrubberBox = await scrubber.boundingBox();
  const scrollBox = await page.getByTestId('timeline-scroll-container').boundingBox();
  expect(scrubberBox, 'timeline ruler should be measurable').not.toBeNull();
  expect(scrollBox, 'timeline scroll viewport should be measurable').not.toBeNull();

  const pixelsPerSecond = await scrubber.evaluate((element) => {
    const scrollContainer = element.closest('[data-testid="timeline-scroll-container"]');
    return Number(scrollContainer?.getAttribute('data-pixels-per-second') ?? '12');
  });
  const startX = Math.min(scrollBox!.x + 10 * pixelsPerSecond, scrollBox!.x + scrollBox!.width - 180);
  const maxEndX = scrollBox!.x + scrollBox!.width - 24;
  const endX = Math.min(startX + deltaX, maxEndX);
  const y = scrubberBox!.y + scrubberBox!.height - 4;

  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(endX, y, { steps: 8 });
  await duringDrag();
  await page.mouse.up();
}

async function dragLocatorCenterDuringWithModifiers(
  page: Page,
  locator: Locator,
  deltaX: number,
  deltaY: number,
  modifiers: Array<'Alt' | 'Shift'>,
  duringDrag: () => Promise<void>,
): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, 'drag target should be measurable').not.toBeNull();

  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  for (const modifier of modifiers) {
    await page.keyboard.down(modifier);
  }

  let mouseIsDown = false;
  try {
    await page.mouse.down();
    mouseIsDown = true;
    await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 6 });
    await duringDrag();
    await page.mouse.up();
    mouseIsDown = false;
  } finally {
    if (mouseIsDown) {
      await page.mouse.up();
    }
    for (const modifier of [...modifiers].reverse()) {
      await page.keyboard.up(modifier);
    }
  }
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

async function dragLocatorCenterToLocatorDuring(
  page: Page,
  source: Locator,
  target: Locator,
  duringDrag: () => Promise<void>,
): Promise<void> {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox, 'drag source should be measurable').not.toBeNull();
  expect(targetBox, 'drag target should be measurable').not.toBeNull();

  const startX = sourceBox!.x + sourceBox!.width / 2;
  const startY = sourceBox!.y + sourceBox!.height / 2;
  const endX = startX;
  const endY = targetBox!.y + targetBox!.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 10 });
  await duringDrag();
  await page.mouse.up();
}

async function readOverlay(overlay: Locator): Promise<{ width: number; height: number }> {
  return overlay.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
    };
  });
}

async function readHitLabelAtCenter(locator: Locator): Promise<string | null> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    let current: Element | null = hit;
    while (current) {
      const label = current.getAttribute('aria-label') ?? current.getAttribute('data-testid');
      if (label) {
        return label;
      }
      current = current.parentElement;
    }

    return hit?.tagName ?? null;
  });
}
