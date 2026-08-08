import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * 저장된 다중 오디오 클립 프로젝트(A1 나레이션 16클립)를 재생하면서
 * 클립 경계마다 다음 오디오 요소가 실제로 생성/재생되는지, 캡션이 계속 합성되는지 확인한다.
 * 회귀 대상: 프로그램 모니터 FFT 샘플이 재생 중 편집기 최상위 상태를 매 프레임 갱신해
 * "Maximum update depth exceeded"로 커밋이 끊기면서 다음 클립 요소가 마운트되지 않던 버그.
 */
test.setTimeout(240_000);

test('keeps program audio clips and captions committing across clip boundaries', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');
  await expect(page.getByTestId('editor-shell')).toHaveAttribute('data-hydrated', 'true', { timeout: 90_000 });

  const savedProject = await openSavedMultiClipAudioProject(page);
  test.skip(!savedProject, 'The multi-clip narration project is not present in this environment.');

  const frame = page.getByTestId('program-monitor-frame');
  const slider = page.getByTestId('program-monitor-playhead-slider');

  // 첫 나레이션 클립 끝 직전에서 시작해 연속된 클립 경계 3개를 지나간다.
  await setRangeInputValue(slider, 29);
  await expect(frame).toHaveAttribute('data-playhead-value', /^29/);

  await page.getByTestId('program-monitor').click({ position: { x: 10, y: 10 } });
  await page.getByRole('button', { name: 'Play', exact: true }).first().click();
  await expect(frame).toHaveAttribute('data-playback-state', 'playing');

  const observedNarrationClips = new Set<string>();
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && observedNarrationClips.size < 3) {
    for (const clipId of await readPlayingNarrationClipIds(page)) {
      observedNarrationClips.add(clipId);
    }

    await page.waitForTimeout(500);
  }

  expect(
    observedNarrationClips.size,
    `each narration clip after a boundary must mount its own playing audio element (saw ${Array.from(observedNarrationClips).join(', ')})`,
  ).toBeGreaterThanOrEqual(3);

  await expect(page.getByTestId('program-caption-overlay')).toBeVisible();
  await expect(frame).toHaveAttribute('data-playback-state', 'playing');

  // 재생 루프가 살아 있어야 다음 클립 요소가 계속 마운트된다.
  const playheadBefore = Number(await frame.getAttribute('data-playhead-value'));
  await page.waitForTimeout(2_000);
  expect(Number(await frame.getAttribute('data-playhead-value'))).toBeGreaterThan(playheadBefore + 1);
});

async function openSavedMultiClipAudioProject(page: Page): Promise<boolean> {
  await page.getByTestId('editor-primary-mode-captions').click();
  await expect(page.getByTestId('editor-shell')).toHaveAttribute('data-active-asset-panel', 'project');

  const projectButton = page.getByRole('button', { name: /장영실/ }).first();
  if (await projectButton.count() === 0) {
    return false;
  }

  await projectButton.click();
  await expect(page.getByTestId('program-monitor-playhead-slider')).toHaveAttribute('max', '556.7', { timeout: 60_000 });
  return true;
}

async function readPlayingNarrationClipIds(page: Page): Promise<string[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll('audio'))
    .filter((audio) => !audio.paused && (audio.getAttribute('data-audio-clip-id') ?? '').includes('narrator'))
    .map((audio) => audio.getAttribute('data-audio-clip-id') ?? ''));
}

async function setRangeInputValue(locator: Locator, value: number) {
  await locator.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, String(nextValue));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
