import { describe, expect, it } from 'vitest';

import { isJpegMimeType, parseFfprobeOutput } from '../../src/lib/editor/media-analyzer';

describe('media analyzer parser', () => {
  it('uses the supported media allowlist for MIME-only stream fallback', () => {
    const emptyProbe = JSON.stringify({ streams: [], format: {} });

    expect(parseFfprobeOutput(emptyProbe, 'image/png')).toMatchObject({
      hasVideo: true,
      hasAudio: false,
    });
    expect(parseFfprobeOutput(emptyProbe, 'audio/webm')).toMatchObject({
      hasVideo: false,
      hasAudio: true,
    });
    expect(parseFfprobeOutput(emptyProbe, 'audio/webm;codecs=opus')).toMatchObject({
      hasVideo: false,
      hasAudio: true,
    });
    expect(parseFfprobeOutput(emptyProbe, 'image/svg+xml')).toMatchObject({
      hasVideo: false,
      hasAudio: false,
    });
  });

  it('normalizes JPEG MIME parameters before EXIF orientation checks', () => {
    expect(isJpegMimeType(' Image/JPEG; charset=binary ')).toBe(true);
    expect(isJpegMimeType('image/svg+xml')).toBe(false);
  });
});
