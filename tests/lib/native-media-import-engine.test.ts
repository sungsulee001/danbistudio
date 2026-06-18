import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  importNativeMediaFilePaths,
  resolveNativeMediaImportAutomationFilePaths,
  selectAndImportNativeMediaFiles,
} from '../../src/electron/main/native-media-import-engine';

vi.mock('../../src/server/editor/media-analyzer', () => ({
  analyzeMediaFile: vi.fn(async () => ({
    hasVideo: false,
    hasAudio: true,
    warnings: [],
  })),
}));

const originalLocalDataRoot = process.env.DANBI_LOCAL_DATA_ROOT;
const originalElectronUserData = process.env.DANBI_ELECTRON_USER_DATA;
const originalAutomationMediaFilePaths = process.env.DANBI_ELECTRON_AUTOMATION_MEDIA_FILE_PATHS;

describe('native media import engine', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = join(tmpdir(), `danbi-native-import-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await mkdir(tempRoot, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    restoreEnvValue('DANBI_LOCAL_DATA_ROOT', originalLocalDataRoot);
    restoreEnvValue('DANBI_ELECTRON_USER_DATA', originalElectronUserData);
    restoreEnvValue('DANBI_ELECTRON_AUTOMATION_MEDIA_FILE_PATHS', originalAutomationMediaFilePaths);
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('keeps native imports unique and trims dot-only filename stems', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1800000000000);

    const sourcePath = join(tempRoot, 'source', '...wav');
    await mkdir(dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, 'native audio');

    const first = await importNativeMediaFilePaths([sourcePath], {
      sourceRoot: tempRoot,
      queueCache: false,
    });
    const second = await importNativeMediaFilePaths([sourcePath], {
      sourceRoot: tempRoot,
      queueCache: false,
    });

    expect(first.warnings).toEqual([]);
    expect(second.warnings).toEqual([]);
    expect(first.files[0]).toMatchObject({
      originalName: '...wav',
      name: '1800000000000-0-media.wav',
      source: '/imports/1800000000000-0-media.wav',
    });
    expect(second.files[0]).toMatchObject({
      originalName: '...wav',
      name: '1800000000000-0-media-1.wav',
      source: '/imports/1800000000000-0-media-1.wav',
    });
    await expect(readFile(first.files[0].renderPath, 'utf8')).resolves.toBe('native audio');
    await expect(readFile(second.files[0].renderPath, 'utf8')).resolves.toBe('native audio');
  });

  it('skips unsupported native media before copying into import storage', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1800000000000);

    const unsupportedPath = join(tempRoot, 'source', 'notes.pdf');
    const audioPath = join(tempRoot, 'source', 'voice.wav');
    await mkdir(dirname(unsupportedPath), { recursive: true });
    await writeFile(unsupportedPath, 'not media');
    await writeFile(audioPath, 'native audio');

    const result = await importNativeMediaFilePaths([unsupportedPath, audioPath], {
      sourceRoot: tempRoot,
      queueCache: false,
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({
      originalName: 'voice.wav',
      name: '1800000000000-1-voice.wav',
      source: '/imports/1800000000000-1-voice.wav',
    });
    expect(result.warnings).toEqual(['notes.pdf import skipped: Unsupported media file.']);
    await expect(readdir(join(tempRoot, '.danbi', 'imports'))).resolves.toEqual(['1800000000000-1-voice.wav']);
  });

  it('skips non-local native import paths before copying into import storage', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1800000000000);

    const audioPath = join(tempRoot, 'source', 'voice.wav');
    const nullBytePath = `E:/source/${String.fromCharCode(0)}bad.wav`;
    await mkdir(dirname(audioPath), { recursive: true });
    await writeFile(audioPath, 'native audio');

    const result = await importNativeMediaFilePaths([
      'https://example.com/remote.mp4',
      'relative.mp4',
      '\\\\.\\pipe\\danbi-media.wav',
      nullBytePath,
      audioPath,
    ], {
      sourceRoot: tempRoot,
      queueCache: false,
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({
      originalName: 'voice.wav',
      name: '1800000000000-4-voice.wav',
    });
    expect(result.warnings).toEqual([
      'remote.mp4 import skipped: Native import only accepts filesystem paths, not URLs or shell protocols.',
      'relative.mp4 import skipped: Native import requires a local absolute file path.',
      'danbi-media.wav import skipped: Native import cannot read Windows device namespace paths.',
      'bad.wav import skipped: Native import path cannot contain null bytes.',
    ]);
    await expect(readdir(join(tempRoot, '.danbi', 'imports'))).resolves.toEqual(['1800000000000-4-voice.wav']);
  });

  it('uses the shared supported media extension list for native selection and MIME metadata', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1800000000000);

    const aviPath = join(tempRoot, 'source', 'capture.avi');
    const tiffPath = join(tempRoot, 'source', 'scan.tiff');
    await mkdir(dirname(aviPath), { recursive: true });
    await writeFile(aviPath, 'native video');
    await writeFile(tiffPath, 'native image');

    const selected = await selectAndImportNativeMediaFiles({
      async showOpenDialog(options) {
        expect(options.filters?.[0].extensions).toEqual(expect.arrayContaining(['avi', 'ogg', 'bmp', 'tif', 'tiff']));
        expect(options.filters?.[0].extensions).not.toContain('*');
        return {
          canceled: false,
          filePaths: [aviPath, tiffPath],
        };
      },
    }, {}, {
      sourceRoot: tempRoot,
      queueCache: false,
    });

    expect(selected.warnings).toEqual([]);
    expect(selected.files).toHaveLength(2);
    expect(selected.files[0]).toMatchObject({
      originalName: 'capture.avi',
      mimeType: 'video/x-msvideo',
    });
    expect(selected.files[1]).toMatchObject({
      originalName: 'scan.tiff',
      mimeType: 'image/tiff',
    });
  });

  it('uses automation media file paths for installed-app smoke imports', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1800000000000);

    const audioPath = join(tempRoot, 'source', 'automation.wav');
    await mkdir(dirname(audioPath), { recursive: true });
    await writeFile(audioPath, 'native audio');
    process.env.DANBI_ELECTRON_AUTOMATION_MEDIA_FILE_PATHS = JSON.stringify([audioPath]);

    const selected = await selectAndImportNativeMediaFiles({
      async showOpenDialog() {
        throw new Error('Automated media import should not open a native dialog.');
      },
    }, {}, {
      sourceRoot: tempRoot,
      queueCache: false,
    });

    expect(resolveNativeMediaImportAutomationFilePaths({
      DANBI_ELECTRON_AUTOMATION_MEDIA_FILE_PATHS: JSON.stringify([audioPath, '']),
    })).toEqual([audioPath]);
    expect(selected.warnings).toEqual([]);
    expect(selected.files[0]).toMatchObject({
      originalName: 'automation.wav',
      source: '/imports/1800000000000-0-automation.wav',
    });
  });

  it('stores packaged native imports under Electron userData instead of the app cwd', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1800000000000);

    const originalCwd = process.cwd();
    const appCwd = join(tempRoot, 'Program Files', 'Danbi Studio');
    const userDataRoot = join(tempRoot, 'user-data');
    const sourcePath = join(tempRoot, 'source', 'voice.wav');
    await mkdir(appCwd, { recursive: true });
    await mkdir(dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, 'native audio');

    try {
      process.chdir(appCwd);
      delete process.env.DANBI_LOCAL_DATA_ROOT;
      process.env.DANBI_ELECTRON_USER_DATA = userDataRoot;

      const imported = await importNativeMediaFilePaths([sourcePath], {
        queueCache: false,
      });

      expect(imported.warnings).toEqual([]);
      expect(imported.files[0]).toMatchObject({
        source: '/imports/1800000000000-0-voice.wav',
        renderPath: join(userDataRoot, 'imports', '1800000000000-0-voice.wav'),
      });
      await expect(readFile(imported.files[0].renderPath, 'utf8')).resolves.toBe('native audio');
      await expect(stat(join(appCwd, '.danbi'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('preserves analyzer audio-only metadata for WebM native imports', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1800000000000);

    const webmPath = join(tempRoot, 'source', 'voice.webm');
    await mkdir(dirname(webmPath), { recursive: true });
    await writeFile(webmPath, 'native audio webm');

    const selected = await importNativeMediaFilePaths([webmPath], {
      sourceRoot: tempRoot,
      queueCache: false,
    });

    expect(selected.files[0]).toMatchObject({
      originalName: 'voice.webm',
      mimeType: 'video/webm',
      metadata: {
        hasVideo: false,
        hasAudio: true,
      },
    });
  });
});

function restoreEnvValue(
  name: 'DANBI_LOCAL_DATA_ROOT' | 'DANBI_ELECTRON_USER_DATA' | 'DANBI_ELECTRON_AUTOMATION_MEDIA_FILE_PATHS',
  value: string | undefined,
): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
