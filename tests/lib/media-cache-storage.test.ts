import { EventEmitter } from 'node:events';
import { access, mkdir, readdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMediaCache } from '../../src/lib/editor/media-cache';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

describe('media cache storage', () => {
  let rootDir: string;
  let previousLocalDataRoot: string | undefined;
  let previousElectronUserData: string | undefined;

  beforeEach(async () => {
    previousLocalDataRoot = process.env.DANBI_LOCAL_DATA_ROOT;
    previousElectronUserData = process.env.DANBI_ELECTRON_USER_DATA;
    rootDir = join(tmpdir(), `danbi-media-cache-storage-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await mkdir(rootDir, { recursive: true });
    delete process.env.DANBI_LOCAL_DATA_ROOT;
    delete process.env.DANBI_ELECTRON_USER_DATA;
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: ReturnType<typeof vi.fn>;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = vi.fn();

      setTimeout(() => {
        const outputPath = args.at(-1);
        if (outputPath === 'pipe:1') {
          child.stdout.emit('data', Buffer.from([0, 0, 0, 64, 0, 127, 0, 0]));
          child.emit('close', 0);
          return;
        }

        if (typeof outputPath === 'string') {
          void writeFile(outputPath, 'ffmpeg cache output').then(
            () => child.emit('close', 0),
            (error: unknown) => child.emit('error', error),
          );
          return;
        }

        child.emit('close', 1);
      }, 0);

      return child;
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    restoreEnvValue('DANBI_LOCAL_DATA_ROOT', previousLocalDataRoot);
    restoreEnvValue('DANBI_ELECTRON_USER_DATA', previousElectronUserData);
    await rm(rootDir, { recursive: true, force: true });
  });

  it('creates default cache directories under Electron user data instead of public assets', async () => {
    const userDataRoot = join(rootDir, 'user-data');
    process.env.DANBI_ELECTRON_USER_DATA = userDataRoot;

    const manifest = await createMediaCache({
      filePath: join(rootDir, 'noop.txt'),
      mimeType: 'text/plain',
      analysis: {
        hasVideo: false,
        hasAudio: false,
        warnings: [],
      },
    });

    expect(manifest.warnings).toEqual([]);
    await expect(access(join(userDataRoot, 'cache', 'media', 'thumbnails'))).resolves.toBeUndefined();
    await expect(access(join(userDataRoot, 'cache', 'media', 'proxies'))).resolves.toBeUndefined();
    await expect(access(join(userDataRoot, 'cache', 'media', 'waveforms'))).resolves.toBeUndefined();
    await expect(access(join(rootDir, 'public', 'cache', 'media'))).rejects.toBeTruthy();
  });

  it('does not generate thumbnail or proxy work for unsupported broad image MIME files', async () => {
    const cacheRoot = join(rootDir, 'cache', 'media');
    const sourcePath = join(rootDir, 'vector.svg');
    const spoofedSourcePath = join(rootDir, 'spoofed.png');
    await writeFile(sourcePath, '<svg />');
    await writeFile(spoofedSourcePath, '<svg />');

    const manifest = await createMediaCache({
      filePath: sourcePath,
      mimeType: 'image/svg+xml',
      cacheRoot,
      publicRoot: '/cache/media',
      analysis: {
        hasVideo: false,
        hasAudio: false,
        warnings: [],
      },
    });
    const spoofedManifest = await createMediaCache({
      filePath: spoofedSourcePath,
      mimeType: 'image/svg+xml',
      cacheRoot,
      publicRoot: '/cache/media',
      analysis: {
        hasVideo: true,
        hasAudio: true,
        warnings: [],
      },
    });

    expect(manifest).toMatchObject({
      warnings: [],
    });
    expect(manifest.thumbnailSource).toBeUndefined();
    expect(manifest.proxySource).toBeUndefined();
    expect(manifest.waveformSource).toBeUndefined();
    expect(spoofedManifest).toMatchObject({
      warnings: [],
    });
    expect(spoofedManifest.thumbnailSource).toBeUndefined();
    expect(spoofedManifest.proxySource).toBeUndefined();
    expect(spoofedManifest.waveformSource).toBeUndefined();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('publishes media cache files only after temporary outputs complete', async () => {
    const sourcePath = join(rootDir, 'camera.mov');
    const cacheRoot = join(rootDir, 'cache', 'media');
    await writeFile(sourcePath, 'source video');

    const manifest = await createMediaCache({
      filePath: sourcePath,
      mimeType: 'video/quicktime',
      cacheRoot,
      publicRoot: '/cache/media',
      waveformSampleCount: 2,
      analysis: {
        duration: 10,
        hasVideo: true,
        hasAudio: true,
        warnings: [],
      },
    });

    const thumbnailFiles = await readdir(join(cacheRoot, 'thumbnails'));
    const proxyFiles = await readdir(join(cacheRoot, 'proxies'));
    const waveformFiles = await readdir(join(cacheRoot, 'waveforms'));

    expect(manifest.thumbnailSource).toMatch(/^\/cache\/media\/thumbnails\/camera-[a-f0-9]{8}\.jpg$/);
    expect(manifest.proxySource).toMatch(/^\/cache\/media\/proxies\/camera-[a-f0-9]{8}\.mp4$/);
    expect(manifest.waveformSource).toMatch(/^\/cache\/media\/waveforms\/camera-[a-f0-9]{8}\.json$/);
    expect(await readFile(manifest.thumbnailPath ?? '', 'utf8')).toBe('ffmpeg cache output');
    expect(await readFile(manifest.proxyPath ?? '', 'utf8')).toBe('ffmpeg cache output');
    await expect(readFile(manifest.waveformPath ?? '', 'utf8')).resolves.toContain('"peaks"');
    expect([...thumbnailFiles, ...proxyFiles, ...waveformFiles].some((filename) => filename.includes('.tmp'))).toBe(false);
  });

  it('does not create waveform cache work for image files with contradictory audio analysis', async () => {
    const sourcePath = join(rootDir, 'still.png');
    const cacheRoot = join(rootDir, 'cache', 'media');
    await writeFile(sourcePath, 'image source');

    const manifest = await createMediaCache({
      filePath: sourcePath,
      mimeType: 'image/png',
      cacheRoot,
      publicRoot: '/cache/media',
      analysis: {
        hasVideo: false,
        hasAudio: true,
        warnings: [],
      },
    });

    expect(manifest.thumbnailSource).toMatch(/^\/cache\/media\/thumbnails\/still-[a-f0-9]{8}\.jpg$/);
    expect(manifest.proxySource).toBeUndefined();
    expect(manifest.waveformSource).toBeUndefined();
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('keeps cache outputs distinct for source files with the same basename', async () => {
    const cacheRoot = join(rootDir, 'cache', 'media');
    const firstSourcePath = join(rootDir, 'camera-a', 'camera.mov');
    const secondSourcePath = join(rootDir, 'camera-b', 'camera.mov');
    await mkdir(join(rootDir, 'camera-a'), { recursive: true });
    await mkdir(join(rootDir, 'camera-b'), { recursive: true });
    await writeFile(firstSourcePath, 'first source');
    await writeFile(secondSourcePath, 'second source');

    const firstManifest = await createMediaCache({
      filePath: firstSourcePath,
      mimeType: 'video/quicktime',
      cacheRoot,
      publicRoot: '/cache/media',
      analysis: {
        duration: 10,
        hasVideo: true,
        hasAudio: false,
        warnings: [],
      },
    });
    const secondManifest = await createMediaCache({
      filePath: secondSourcePath,
      mimeType: 'video/quicktime',
      cacheRoot,
      publicRoot: '/cache/media',
      analysis: {
        duration: 10,
        hasVideo: true,
        hasAudio: false,
        warnings: [],
      },
    });

    expect(firstManifest.thumbnailSource).toMatch(/^\/cache\/media\/thumbnails\/camera-[a-f0-9]{8}\.jpg$/);
    expect(secondManifest.thumbnailSource).toMatch(/^\/cache\/media\/thumbnails\/camera-[a-f0-9]{8}\.jpg$/);
    expect(firstManifest.thumbnailSource).not.toBe(secondManifest.thumbnailSource);
    expect(firstManifest.proxySource).not.toBe(secondManifest.proxySource);
    await expect(readdir(join(cacheRoot, 'thumbnails'))).resolves.toHaveLength(2);
    await expect(readdir(join(cacheRoot, 'proxies'))).resolves.toHaveLength(2);
  });

  it('uses Windows-safe bounded cache keys for reserved and long source filenames', async () => {
    const cacheRoot = join(rootDir, 'cache', 'media');
    const reservedSourcePath = join(rootDir, 'CON.mov');
    const longSourcePath = join(rootDir, `${'very-long-cache-source-name-'.repeat(5)}.mov`);
    await writeFile(reservedSourcePath, 'reserved source');
    await writeFile(longSourcePath, 'long source');

    const reservedManifest = await createMediaCache({
      filePath: reservedSourcePath,
      mimeType: 'video/quicktime',
      cacheRoot,
      publicRoot: '/cache/media',
      analysis: {
        duration: 10,
        hasVideo: true,
        hasAudio: false,
        warnings: [],
      },
    });
    const longManifest = await createMediaCache({
      filePath: longSourcePath,
      mimeType: 'video/quicktime',
      cacheRoot,
      publicRoot: '/cache/media',
      analysis: {
        duration: 10,
        hasVideo: true,
        hasAudio: false,
        warnings: [],
      },
    });

    const longProxyFilename = longManifest.proxySource?.split('/').at(-1) ?? '';

    expect(reservedManifest.thumbnailSource).toMatch(/^\/cache\/media\/thumbnails\/media-CON-[a-f0-9]{8}\.jpg$/);
    expect(reservedManifest.proxySource).toMatch(/^\/cache\/media\/proxies\/media-CON-[a-f0-9]{8}\.mp4$/);
    expect(longProxyFilename.length).toBeLessThanOrEqual(100);
    expect(longProxyFilename).toMatch(/-[a-f0-9]{8}\.mp4$/);
  });
});

function restoreEnvValue(name: 'DANBI_LOCAL_DATA_ROOT' | 'DANBI_ELECTRON_USER_DATA', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
