import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';

import { GET as getMedia } from '../../src/app/media/[...path]/route';
import { GET as getSamplePack } from '../../src/app/sample-pack/[...path]/route';

const originalSamplePackage = process.env.DANBI_SAMPLE_PROJECT_PACKAGE;

describe('media preview routes', () => {
  afterEach(() => {
    process.env.DANBI_SAMPLE_PROJECT_PACKAGE = originalSamplePackage;
  });

  it('serves default demo media from the generated sample package fallback', async () => {
    const sampleDir = await createSamplePackageFixture();
    process.env.DANBI_SAMPLE_PROJECT_PACKAGE = sampleDir;

    const response = await getMedia(
      new NextRequest('http://localhost/media/interview-master.mp4', {
        headers: { Range: 'bytes=0-3' },
      }),
      { params: Promise.resolve({ path: ['interview-master.mp4'] }) },
    );

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Type')).toContain('video/mp4');
    expect(response.headers.get('Content-Range')).toBe('bytes 0-3/10');
  });

  it('serves rewritten sample-pack preview paths', async () => {
    const sampleDir = await createSamplePackageFixture();
    process.env.DANBI_SAMPLE_PROJECT_PACKAGE = sampleDir;

    const response = await getSamplePack(
      new NextRequest('http://localhost/sample-pack/media/asset-sample-intro/proxy-test.mp4', {
        headers: { Range: 'bytes=2-5' },
      }),
      { params: Promise.resolve({ path: ['media', 'asset-sample-intro', 'proxy-test.mp4'] }) },
    );

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Type')).toContain('video/mp4');
    expect(response.headers.get('Content-Range')).toBe('bytes 2-5/10');
  });
});

async function createSamplePackageFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'danbi-media-preview-routes-'));
  const sampleDir = join(root, 'sample');
  const introDir = join(sampleDir, 'media', 'asset-sample-intro');
  const musicDir = join(sampleDir, 'media', 'asset-sample-music');

  await mkdir(introDir, { recursive: true });
  await mkdir(musicDir, { recursive: true });
  await writeFile(join(sampleDir, 'project.danbi-project.json'), '{}', 'utf8');
  await writeFile(join(sampleDir, 'tutorial.md'), '# Tutorial', 'utf8');
  await writeFile(join(introDir, 'proxy-test.mp4'), Buffer.from('0123456789'));
  await writeFile(join(introDir, 'source-test.mp4'), Buffer.from('abcdefghij'));
  await writeFile(join(musicDir, 'source-test.wav'), Buffer.from('abcdefghij'));

  return sampleDir;
}

