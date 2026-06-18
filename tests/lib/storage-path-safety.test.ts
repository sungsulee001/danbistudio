import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveCacheStoragePath, toCacheSourcePath } from '../../src/server/cache-storage';
import { resolveImportStoragePath, toImportSourcePath } from '../../src/server/import-storage';
import { resolveOutputStoragePath, toOutputSourcePath } from '../../src/server/output-storage';

describe('storage path safety', () => {
  it('keeps normal storage paths readable and source-path friendly', () => {
    const rootDir = 'E:/danbi-project';

    expect(resolveCacheStoragePath('media/thumbnails/thumb.jpg', rootDir)).toBe(join(rootDir, '.danbi', 'cache', 'media', 'thumbnails', 'thumb.jpg'));
    expect(resolveImportStoragePath('voice/clip.wav', rootDir)).toBe(join(rootDir, '.danbi', 'imports', 'voice', 'clip.wav'));
    expect(resolveOutputStoragePath('renders/final.mp4', rootDir)).toBe(join(rootDir, '.danbi', 'outputs', 'renders', 'final.mp4'));
    expect(toCacheSourcePath('media/thumbnails/thumb.jpg')).toBe('/cache/media/thumbnails/thumb.jpg');
    expect(toImportSourcePath('voice/clip.wav')).toBe('/imports/voice/clip.wav');
    expect(toOutputSourcePath('renders/final.mp4')).toBe('/outputs/renders/final.mp4');
  });

  it('rejects Windows-invalid and reserved storage path segments', () => {
    expect(() => resolveCacheStoragePath('media/CON.jpg')).toThrow('Cache storage path is unsafe.');
    expect(() => resolveImportStoragePath('voice/clip:bad.wav')).toThrow('Import storage path is unsafe.');
    expect(() => resolveOutputStoragePath('renders/AUX.mp4')).toThrow('Output storage path is unsafe.');
    expect(() => toCacheSourcePath('media/*/thumb.jpg')).toThrow('Cache storage path is unsafe.');
    expect(() => toImportSourcePath('NUL.srt')).toThrow('Import storage path is unsafe.');
    expect(() => toOutputSourcePath('renders/final?.mp4')).toThrow('Output storage path is unsafe.');
  });
});
