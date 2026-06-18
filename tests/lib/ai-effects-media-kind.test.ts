import { describe, expect, it } from 'vitest';

import { buildAiModelEffectPass, readAiModelEffectPass } from '../../src/lib/editor/ai-effects';

describe('AI model effect media kind inference', () => {
  it('uses the shared supported media fallback for still-image pass formats', () => {
    const bmpPass = readAiModelEffectPass(buildAiModelEffectPass(undefined, {
      renderPath: 'E:/renders/matte.bmp',
    }));
    const tiffPass = readAiModelEffectPass(buildAiModelEffectPass(undefined, {
      renderPath: 'E:/renders/restoration-layer.bin',
      mimeType: 'image/tiff',
    }));
    const webmPass = readAiModelEffectPass(buildAiModelEffectPass(undefined, {
      renderPath: 'E:/renders/restoration-pass.webm',
    }));

    expect(bmpPass?.kind).toBe('image');
    expect(tiffPass?.kind).toBe('image');
    expect(webmPass?.kind).toBe('video');
  });
});
