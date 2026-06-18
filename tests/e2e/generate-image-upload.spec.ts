import { expect, test } from '@playwright/test';

const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('uploads a reference image and includes it when starting generation', async ({ page }) => {
  let generateRequest: unknown;

  await page.route('**/api/generate/image', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        image: {
          originalName: 'reference.png',
          name: '123-reference.png',
          mimeType: 'image/png',
          size: Buffer.from(pngBase64, 'base64').byteLength,
          source: `data:image/png;base64,${pngBase64}`,
        },
      }),
    });
  });

  await page.route('**/api/generate', async (route) => {
    generateRequest = route.request().postDataJSON();
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'job-upload-1',
        status: 'pending',
        promptId: 'prompt-upload-1',
        createdAt: '2026-06-16T00:00:00.000Z',
      }),
    });
  });

  await page.goto('/generate');
  await page.getByTestId('generate-image-input').setInputFiles({
    name: 'reference.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pngBase64, 'base64'),
  });

  await expect(page.getByTestId('generate-image-preview')).toBeVisible();
  await expect(page.getByText('reference.png')).toBeVisible();

  await page.getByPlaceholder('Describe what you want to generate...').fill('A clean product shot');
  await page.getByText('Advanced').click();
  await page.getByTestId('generate-seed-input').fill('12345');
  await page.getByTestId('generate-steps-input').fill('20');
  await page.getByRole('button', { name: 'Generate' }).click();

  await expect(page.getByRole('heading', { name: 'Generation Started!' })).toBeVisible();
  await expect(page.getByText('Job ID: job-upload-1')).toBeVisible();
  expect(generateRequest).toMatchObject({
    modelName: 'wan_i2v',
    workflowName: 'broll_reference_i2v',
    parameters: {
      prompt: 'A clean product shot',
      seed: 12345,
      steps: 20,
    },
    image: {
      name: '123-reference.png',
    },
  });
});
