import { expect, test, type Locator, type Page } from '@playwright/test';

test('exposes connected top toolbar menus and safe toggle states', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);

  await expect(page.getByTestId('timeline-toolbar-undo')).toBeDisabled();
  await expect(page.getByTestId('timeline-toolbar-redo')).toBeDisabled();
  await expect(page.getByTestId('editor-toolbar-import')).toBeVisible();
  await expect(page.getByTestId('editor-toolbar-commands')).toBeVisible();
  await expect(page.getByTestId('editor-toolbar-cut')).toBeHidden();
  await expect(page.getByTestId('editor-toolbar-delete')).toBeHidden();
  await expect(page.getByTestId('timeline-local-toolbar')).toBeVisible();
  await expect(page.getByTestId('timeline-toolbar-cut')).toBeVisible();
  await expect(page.getByTestId('timeline-toolbar-trim-in')).toBeVisible();
  await expect(page.getByTestId('timeline-toolbar-trim-out')).toBeVisible();
  await expect(page.getByTestId('timeline-toolbar-ripple-delete')).toBeVisible();
  await expect(page.getByTestId('timeline-toolbar-delete')).toBeVisible();
  await expect(page.getByTestId('editor-toolbar-export')).toBeVisible();
  await expect(page.getByTestId('editor-toolbar-render')).toBeVisible();
  await expect(page.getByTestId('editor-toolbar-command-rail')).toHaveAttribute('data-selected-clip-count', /[0-9]+/);
  await expect(page.getByTestId('editor-toolbar-command-rail')).toHaveAttribute('data-render-state', /ready|blocked|rendering/);
  await expect(page.getByTestId('editor-toolbar-group-history')).toBeHidden();
  await expect(page.getByTestId('editor-toolbar-group-history')).toHaveAttribute('data-toolbar-group-label', 'History');
  await expect(page.getByTestId('editor-toolbar-group-ingest')).toBeVisible();
  await expect(page.getByTestId('editor-toolbar-group-edit')).toBeHidden();
  await expect(page.getByTestId('editor-toolbar-group-edit')).toHaveAttribute('data-toolbar-command-count', /[1-9][0-9]*/);
  await expect(page.getByTestId('editor-toolbar-group-timeline')).toBeHidden();
  await expect(page.getByTestId('editor-toolbar-group-output')).toBeVisible();
  await expect(page.getByTestId('editor-toolbar-group-state')).toBeVisible();
  await expect(page.getByTestId('editor-toolbar-selection-summary')).toContainText(/[0-9]+ selected/);
  await expect(page.getByTestId('editor-workspace-layout')).toHaveAttribute('data-layout-density', 'commercial-compact');
  await expect(page.getByTestId('editor-workspace-layout')).toHaveAttribute('data-asset-column-width', '420');
  await expect(page.getByTestId('editor-workspace-layout')).toHaveAttribute('data-inspector-column-width', '300');
  await expect(page.getByTestId('editor-workspace-layout')).toHaveAttribute('data-timeline-row-height', '300');
  await expect(page.getByTestId('editor-asset-bay')).toHaveAttribute('data-panel-density', 'compact');
  await expect(page.getByTestId('editor-inspector-panel')).toHaveAttribute('data-panel-density', 'clustered');
  await expect(page.getByTestId('editor-timeline-panel')).toHaveAttribute('data-panel-density', 'timeline-first');
  await expect(page.getByTestId('timeline-ruler-row')).toHaveAttribute('data-track-header-width', '128');
  await expect(page.getByTestId('timeline-track-stack')).toHaveAttribute('data-track-header-width', '128');
  const rulerLeft = await page.getByTestId('timeline-ruler-scrubber').evaluate((node) => (
    Math.round(node.getBoundingClientRect().left)
  ));
  const laneLeft = await page.getByTestId('timeline-lane-track-v1').evaluate((node) => (
    Math.round(node.getBoundingClientRect().left)
  ));
  expect(Math.abs(rulerLeft - laneLeft)).toBeLessThanOrEqual(1);

  await page.getByTestId('editor-toolbar-commands').click();
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden();

  await expect(page.getByTestId('editor-toolbar-menu-edit')).toHaveAttribute('data-menu-command-count', /[1-9][0-9]*/);
  await expect(page.getByTestId('editor-toolbar-menu-edit-count')).toBeHidden();
  await expect(page.getByTestId('editor-toolbar-menu-source')).toBeHidden();
  await expect(page.getByTestId('editor-toolbar-menu-marks')).toBeHidden();
  await expectToolbarMenu(page, 'ai', ['Comfy Batch', 'STT Captions']);

  await expect(page.getByTestId('timeline-ripple-toggle')).toBeVisible();
  await expect(page.getByTestId('timeline-snap-toggle')).toBeVisible();
  await expect(page.getByTestId('timeline-loop-toggle')).toBeVisible();

  await setRangeInputValue(page.getByTestId('timeline-playhead-slider'), 5);
  await expect(page.getByTestId('timeline-toolbar-trim-in')).toBeEnabled();
  await expect(page.getByTestId('timeline-toolbar-trim-out')).toBeEnabled();
  await expect(page.getByTestId('timeline-toolbar-ripple-delete')).toBeEnabled();
  await expect(page.getByTestId('timeline-toolbar-delete')).toBeEnabled();

  await expectToggleFlips(page.getByTestId('timeline-ripple-toggle'));
  await expectToggleFlips(page.getByTestId('timeline-snap-toggle'));
  await expect(page.getByTestId('timeline-loop-toggle')).toHaveAttribute('aria-pressed', /true|false/);
});

test('applies Korean menu language to editor and timeline menus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/settings', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('settings-menu-language')).toBeVisible();
  await page.getByTestId('settings-menu-language-ko').click();

  await openEditor(page);

  await expect(page.getByRole('link', { name: '편집', exact: true })).toBeVisible();
  await expect(page.getByTestId('editor-toolbar-import')).toContainText('가져오기');
  await expect(page.getByTestId('editor-toolbar-commands')).toContainText('명령');
  await expect(page.getByTestId('timeline-toolbar-cut')).toContainText('자르기');
  await expect(page.getByTestId('timeline-ripple-toggle')).toContainText('리플');
  await expect(page.getByTestId('editor-toolbar-selection-summary')).toContainText('선택');
  await expect(page.getByTestId('editor-asset-bay')).toContainText('에셋 보관함');
  await expect(page.getByTestId('media-bin-panel')).toContainText('미디어');
  await expect(page.getByTestId('editor-monitor-workspace')).toContainText('편집 작업공간');
  await expect(page.getByTestId('editor-monitor-switch-program')).toContainText('프로그램');
  await expect(page.getByTestId('editor-source-monitor-toggle')).toContainText('소스');
  await expect(page.getByTestId('editor-inspector-panel')).toContainText('인스펙터');
  await expect(page.getByTestId('inspector-primary-transform-panel')).toContainText('변형');
  await expect(page.getByTestId('inspector-command-panel')).toContainText('재생헤드에서 자르기');
});

test('routes primary mode buttons to their asset bay and inspector panels', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);

  const shell = page.getByTestId('editor-shell');
  const modes = [
    { id: 'media', label: 'Media' },
    { id: 'audio', label: 'Audio' },
    { id: 'text', label: 'Text' },
    { id: 'effects', label: 'Effects' },
    { id: 'transitions', label: 'Transitions' },
    { id: 'captions', label: 'Captions' },
    { id: 'adjust', label: 'Adjust' },
    { id: 'templates', label: 'Templates' },
    { id: 'ai', label: 'AI' },
  ] as const;

  for (const mode of modes) {
    const button = page.getByTestId(`editor-primary-mode-${mode.id}`);
    await button.scrollIntoViewIfNeeded();
    const expectedAssetPanel = await readRequiredAttribute(button, 'data-mode-asset-panel');
    const expectedDockPanel = await readRequiredAttribute(button, 'data-mode-dock-panel');

    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(shell).toHaveAttribute('data-active-primary-mode', mode.id);
    await expect(shell).toHaveAttribute('data-active-asset-panel', expectedAssetPanel);
    await expect(shell).toHaveAttribute('data-active-dock-panel', expectedDockPanel);
    await expect(page.getByTestId('editor-status')).toContainText(`${mode.label} workspace selected`);
  }
});

test('connects top toolbar cut/delete buttons to timeline state and history', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);

  await page.getByRole('button', { name: 'Timeline clip Workflow demo' }).click();
  const playheadSlider = page.getByTestId('timeline-playhead-slider');
  await setRangeInputValue(playheadSlider, 40);
  await expect(playheadSlider).toHaveAttribute('data-playhead-value', '40');
  await expect(page.getByTestId('timeline-clip-clip-interview-2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Timeline clip Workflow demo' })).toHaveCount(1);

  await page.getByTestId('timeline-toolbar-cut').click();
  await expect(page.getByTestId('editor-status')).toContainText(/Split 1 selected clip at 00:00:40:00/);
  await expect(page.getByRole('button', { name: 'Timeline clip Workflow demo' })).toHaveCount(2);
  await expect(page.getByTestId('timeline-toolbar-undo')).toBeEnabled();

  await page.getByTestId('timeline-toolbar-undo').click();
  await expect(page.getByTestId('editor-status')).toContainText('Undo');
  await expect(page.getByRole('button', { name: 'Timeline clip Workflow demo' })).toHaveCount(1);
  await expect(page.getByTestId('timeline-toolbar-redo')).toBeEnabled();

  await page.getByRole('button', { name: 'Timeline clip Workflow demo' }).click();
  await page.getByTestId('timeline-toolbar-delete').click();
  await expect(page.getByTestId('editor-status')).toContainText(/Deleted|Removed|Ripple deleted/);
  await expect(page.getByRole('button', { name: 'Timeline clip Workflow demo' })).toHaveCount(0);

  await page.getByTestId('timeline-toolbar-undo').click();
  await expect(page.getByRole('button', { name: 'Timeline clip Workflow demo' })).toHaveCount(1);
});

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('editor-shell')).toHaveAttribute('data-hydrated', 'true', { timeout: 30_000 });
}

async function openToolbarMenu(page: Page, menuId: string): Promise<void> {
  const menu = page.getByTestId(`editor-toolbar-menu-${menuId}`);
  if ((await menu.getAttribute('open')) === '') {
    return;
  }

  const summary = page.getByTestId(`editor-toolbar-menu-${menuId}-summary`);
  await summary.scrollIntoViewIfNeeded();
  await summary.click();
  await expect(menu).toHaveAttribute('open', '');
}

async function expectToolbarMenu(page: Page, menuId: string, labels: string[]): Promise<void> {
  await openToolbarMenu(page, menuId);
  const content = page.getByTestId(`editor-toolbar-menu-${menuId}-content`);
  await expect(content).toBeVisible();
  for (const label of labels) {
    await expect(content.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
}

async function expectToggleFlips(toggle: Locator): Promise<void> {
  const before = await readRequiredAttribute(toggle, 'aria-pressed');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', before);
}

async function readRequiredAttribute(locator: Locator, attributeName: string): Promise<string> {
  const value = await locator.getAttribute(attributeName);
  expect(value, `${attributeName} should be present`).toBeTruthy();
  return value!;
}

async function setRangeInputValue(locator: Locator, value: number): Promise<void> {
  await locator.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, String(nextValue));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
