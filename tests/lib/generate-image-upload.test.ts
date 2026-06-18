import { access, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeGenerateImageUploadName,
  readGenerateImageUpload,
  saveGenerateImageUpload,
} from '../../src/server/generate-image-upload';

describe('generate image upload storage', () => {
  let rootDir: string;
  let previousLocalDataRoot: string | undefined;
  let previousElectronUserData: string | undefined;

  beforeEach(async () => {
    previousLocalDataRoot = process.env.DANBI_LOCAL_DATA_ROOT;
    previousElectronUserData = process.env.DANBI_ELECTRON_USER_DATA;
    rootDir = join(tmpdir(), `danbi-generate-image-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await mkdir(rootDir, { recursive: true });
    delete process.env.DANBI_LOCAL_DATA_ROOT;
    delete process.env.DANBI_ELECTRON_USER_DATA;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    restoreEnvValue('DANBI_LOCAL_DATA_ROOT', previousLocalDataRoot);
    restoreEnvValue('DANBI_ELECTRON_USER_DATA', previousElectronUserData);
    await rm(rootDir, { recursive: true, force: true });
  });

  it('saves supported image uploads under durable imports and reads them back safely', async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'reference image.png', {
      type: 'image/png',
    });

    const saved = await saveGenerateImageUpload(file, rootDir);
    const read = await readGenerateImageUpload(saved.name, rootDir);

    expect(saved).toMatchObject({
      originalName: 'reference image.png',
      mimeType: 'image/png',
      size: 4,
    });
    expect(saved.name).toMatch(/^\d+-reference-image\.png$/);
    expect(saved.source).toBe(`/imports/generate/${saved.name}`);
    expect(Array.from(read.bytes)).toEqual([137, 80, 78, 71]);
    await expect(access(join(rootDir, '.danbi', 'imports', 'generate', saved.name))).resolves.toBeUndefined();
  });

  it('normalizes unsafe or missing extensions to a supported image extension', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'reference.exe', {
      type: 'image/webp',
    });
    const dotPrefixFile = new File([new Uint8Array([1, 2, 3])], '...png', {
      type: 'image/png',
    });

    const saved = await saveGenerateImageUpload(file, rootDir);
    const dotPrefixSaved = await saveGenerateImageUpload(dotPrefixFile, rootDir);
    const read = await readGenerateImageUpload(saved.name, rootDir);

    expect(saved.name).toMatch(/\.webp$/);
    expect(dotPrefixSaved.name).toMatch(/^\d+-image\.png$/);
    expect(read.mimeType).toBe('image/webp');
  });

  it('keeps duplicate image uploads instead of overwriting the first upload', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1800000000000);

    const first = await saveGenerateImageUpload(new File([new Uint8Array([1, 2, 3])], 'reference.png', {
      type: 'image/png',
    }), rootDir);
    const second = await saveGenerateImageUpload(new File([new Uint8Array([4, 5, 6])], 'reference.png', {
      type: 'image/png',
    }), rootDir);
    const firstRead = await readGenerateImageUpload(first.name, rootDir);
    const secondRead = await readGenerateImageUpload(second.name, rootDir);

    expect(first.name).toBe('1800000000000-reference.png');
    expect(second.name).toBe('1800000000000-reference-1.png');
    expect(first.source).toBe('/imports/generate/1800000000000-reference.png');
    expect(second.source).toBe('/imports/generate/1800000000000-reference-1.png');
    expect(Array.from(firstRead.bytes)).toEqual([1, 2, 3]);
    expect(Array.from(secondRead.bytes)).toEqual([4, 5, 6]);
  });

  it('uses Electron user data storage when no explicit root directory is provided', async () => {
    const userDataRoot = join(rootDir, 'user-data');
    process.env.DANBI_ELECTRON_USER_DATA = userDataRoot;
    const file = new File([new Uint8Array([1, 2, 3])], 'reference.png', {
      type: 'image/png',
    });

    const saved = await saveGenerateImageUpload(file);

    await expect(access(join(userDataRoot, 'imports', 'generate', saved.name))).resolves.toBeUndefined();
    await expect(access(join(rootDir, '.danbi', 'imports', 'generate', saved.name))).rejects.toBeTruthy();
  });

  it('rejects unsupported files and path traversal reads', async () => {
    const textFile = new File(['not an image'], 'notes.txt', {
      type: 'text/plain',
    });

    await expect(saveGenerateImageUpload(textFile, rootDir)).rejects.toThrow('Unsupported image format');
    await expect(readGenerateImageUpload('../secret.png', rootDir)).rejects.toThrow('must not include path separators');
  });

  it('extracts upload names from API payload shapes', () => {
    expect(normalizeGenerateImageUploadName('saved.png')).toBe('saved.png');
    expect(normalizeGenerateImageUploadName({ name: 'saved.png' })).toBe('saved.png');
    expect(normalizeGenerateImageUploadName({ name: 42 })).toBeUndefined();
    expect(normalizeGenerateImageUploadName(null)).toBeUndefined();
  });
});

function restoreEnvValue(name: 'DANBI_LOCAL_DATA_ROOT' | 'DANBI_ELECTRON_USER_DATA', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
