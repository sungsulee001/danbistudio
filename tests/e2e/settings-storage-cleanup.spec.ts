import { expect, test } from '@playwright/test';

test('scans and clears old cache/output/STT files from settings', async ({ page }) => {
  let cleanupRequest: unknown;
  const logsPath = 'E:\\Danbi\\UserData\\logs';

  await page.addInitScript((runtimeLogsPath) => {
    (window as unknown as { __revealedPaths: string[] }).__revealedPaths = [];
    (window as unknown as {
      danbiEditor: {
        system: {
          diagnostics: () => Promise<unknown>;
        };
        files: {
          openPath: (path: string) => Promise<{ ok: boolean; path: string }>;
          revealInFolder: (path: string) => Promise<{ ok: boolean; path: string }>;
        };
      };
      __revealedPaths: string[];
    }).danbiEditor = {
      system: {
        diagnostics: async () => ({
          checkedAt: '2026-06-17T00:00:00.000Z',
          app: {
            name: 'Danbi Studio',
            version: '0.1.0',
            isPackaged: true,
            platform: 'win32',
            arch: 'x64',
            electronVersion: '42.4.0',
            chromeVersion: '142.0.0.0',
            nodeVersion: '24.0.0',
          },
          rendererUrl: 'http://127.0.0.1:3100/editor',
          paths: {
            userDataPath: 'E:\\Danbi\\UserData',
            logsPath: runtimeLogsPath,
            crashDumpsPath: 'E:\\Danbi\\UserData\\crashDumps',
            projectsPath: 'E:\\Danbi\\UserData\\projects',
            packagesPath: 'E:\\Danbi\\UserData\\packages',
            rendersPath: 'E:\\Danbi\\UserData\\renders',
            tempPath: 'E:\\Danbi\\UserData\\temp',
          },
          ffmpeg: {
            checkedAt: '2026-06-17T00:00:00.000Z',
            ready: true,
            ffmpegPath: 'ffmpeg.exe',
            ffprobePath: 'ffprobe.exe',
            candidates: [],
            warnings: [],
          },
          samples: {
            available: true,
            gettingStartedPackagePath: 'E:\\Danbi\\Samples\\getting-started',
            candidates: ['E:\\Danbi\\Samples\\getting-started'],
          },
          warnings: [],
        }),
      },
      files: {
        openPath: async (path: string) => ({ ok: true, path }),
        revealInFolder: async (path: string) => {
          (window as unknown as { __revealedPaths: string[] }).__revealedPaths.push(path);
          return { ok: true, path };
        },
      },
    };
  }, logsPath);

  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'healthy',
        services: {
          database: true,
          comfyui: true,
        },
      }),
    });
  });

  await page.route('**/api/storage/cleanup**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          dryRun: true,
          maxAgeDays: 30,
          eligibleFiles: 3,
          deletedFiles: 0,
          eligibleBytes: 3584,
          deletedBytes: 0,
          directoriesRemoved: 0,
          targets: [
            {
              id: 'cache',
              label: 'Preview cache',
              scannedFiles: 3,
              eligibleFiles: 1,
              deletedFiles: 0,
              eligibleBytes: 1024,
              deletedBytes: 0,
              directoriesRemoved: 0,
              errors: [],
            },
            {
              id: 'outputs',
              label: 'Rendered outputs',
              scannedFiles: 2,
              eligibleFiles: 1,
              deletedFiles: 0,
              eligibleBytes: 2048,
              deletedBytes: 0,
              directoriesRemoved: 0,
              errors: [],
            },
            {
              id: 'stt',
              label: 'Speech transcripts',
              scannedFiles: 1,
              eligibleFiles: 1,
              deletedFiles: 0,
              eligibleBytes: 512,
              deletedBytes: 0,
              directoriesRemoved: 0,
              errors: [],
            },
          ],
        }),
      });
      return;
    }

    cleanupRequest = request.postDataJSON();
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        dryRun: false,
        maxAgeDays: 30,
        eligibleFiles: 3,
        deletedFiles: 3,
        eligibleBytes: 3584,
        deletedBytes: 3584,
        directoriesRemoved: 1,
        targets: [
          {
            id: 'cache',
            label: 'Preview cache',
            scannedFiles: 3,
            eligibleFiles: 1,
            deletedFiles: 1,
            eligibleBytes: 1024,
            deletedBytes: 1024,
            directoriesRemoved: 1,
            errors: [],
          },
          {
            id: 'outputs',
            label: 'Rendered outputs',
            scannedFiles: 2,
            eligibleFiles: 1,
            deletedFiles: 1,
            eligibleBytes: 2048,
            deletedBytes: 2048,
            directoriesRemoved: 0,
            errors: [],
          },
          {
            id: 'stt',
            label: 'Speech transcripts',
            scannedFiles: 1,
            eligibleFiles: 1,
            deletedFiles: 1,
            eligibleBytes: 512,
            deletedBytes: 512,
            directoriesRemoved: 0,
            errors: [],
          },
        ],
      }),
    });
  });

  page.on('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Delete 3 cache/output/STT files older than 30 days');
    await dialog.accept();
  });

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText(/3 old files \/ 3\.5 KB eligible/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Runtime Diagnostics' })).toBeVisible();
  await expect(page.getByText('Danbi Studio 0.1.0 / FFmpeg ready')).toBeVisible();
  await expect(page.getByTestId('runtime-path-logs')).toContainText(logsPath);
  await expect(page.getByText('Preview cache')).toBeVisible();
  await expect(page.getByText('Rendered outputs')).toBeVisible();
  await expect(page.getByText('Speech transcripts')).toBeVisible();

  await page.getByTestId('runtime-path-logs').getByRole('button', { name: 'Reveal' }).click();
  await expect(page.getByText('Revealed Logs folder')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __revealedPaths: string[] }).__revealedPaths)).toEqual([logsPath]);

  await page.getByRole('button', { name: 'Clear Old Files' }).click();
  await expect(page.getByText(/Deleted 3 files \/ 3\.5 KB; removed 1 empty folders/)).toBeVisible();
  expect(cleanupRequest).toEqual({
    dryRun: false,
    maxAgeDays: 30,
    targets: ['cache', 'outputs', 'stt'],
  });
});
