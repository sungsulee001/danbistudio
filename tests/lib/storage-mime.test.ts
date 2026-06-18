import { describe, expect, it } from 'vitest';

import { inferCacheStorageMimeType } from '../../src/server/cache-storage';
import { inferImportStorageMimeType } from '../../src/server/import-storage';
import { inferOutputStorageMimeType } from '../../src/server/output-storage';

describe('storage MIME inference', () => {
  it('serves supported import media with the shared MIME fallback', () => {
    expect(inferImportStorageMimeType('clip.avi')).toBe('video/x-msvideo');
    expect(inferImportStorageMimeType('voice.ogg')).toBe('audio/ogg');
    expect(inferImportStorageMimeType('still.bmp')).toBe('image/bmp');
    expect(inferImportStorageMimeType('scan.tiff')).toBe('image/tiff');
  });

  it('serves supported output media with the shared MIME fallback while preserving sidecars', () => {
    expect(inferOutputStorageMimeType('render.webm')).toBe('video/webm');
    expect(inferOutputStorageMimeType('scan.tif')).toBe('image/tiff');
    expect(inferOutputStorageMimeType('captions.vtt')).toBe('text/vtt; charset=utf-8');
    expect(inferOutputStorageMimeType('manifest.json')).toBe('application/json; charset=utf-8');
    expect(inferOutputStorageMimeType('vector.svg')).toBe('application/octet-stream');
  });

  it('serves supported cache media with the shared MIME fallback while preserving waveform JSON', () => {
    expect(inferCacheStorageMimeType('proxy.avi')).toBe('video/x-msvideo');
    expect(inferCacheStorageMimeType('thumbnail.bmp')).toBe('image/bmp');
    expect(inferCacheStorageMimeType('waveform.json')).toBe('application/json; charset=utf-8');
  });
});
