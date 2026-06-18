import { describe, expect, it } from 'vitest';

import { validateRenderOutputPathSafety } from '../../src/lib/editor/render-output';

describe('render output path safety', () => {
  it('accepts normal render output file paths', () => {
    expect(validateRenderOutputPathSafety('E:/renders/final.mp4', 'mp4')).toBeUndefined();
    expect(validateRenderOutputPathSafety('/tmp/danbi/final.webm', 'webm')).toBeUndefined();
  });

  it('rejects Windows device namespace output paths', () => {
    expect(validateRenderOutputPathSafety('\\\\.\\pipe\\danbi-render-output', 'mp4')).toMatchObject({
      code: 'windows-device-output-path',
      message: 'Render output path uses a Windows device namespace path.',
    });
    expect(validateRenderOutputPathSafety('\\\\?\\C:\\renders\\final.mp4', 'mp4')).toMatchObject({
      code: 'windows-device-output-path',
      message: 'Render output path uses a Windows device namespace path.',
    });
  });
});
