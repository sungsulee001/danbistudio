import { describe, expect, it } from 'vitest';

import { inferComfyUIQueueResultMimeType } from '../../src/lib/editor/comfyui-queue';

describe('ComfyUI queue result MIME inference', () => {
  it('uses the shared supported media fallback instead of defaulting unknown files to video', () => {
    expect(inferComfyUIQueueResultMimeType('clip.webm')).toBe('video/webm');
    expect(inferComfyUIQueueResultMimeType('clip.avi')).toBe('video/x-msvideo');
    expect(inferComfyUIQueueResultMimeType('voice.ogg')).toBe('audio/ogg');
    expect(inferComfyUIQueueResultMimeType('scan.tiff')).toBe('image/tiff');
    expect(inferComfyUIQueueResultMimeType('vector.svg')).toBe('application/octet-stream');
  });
});
