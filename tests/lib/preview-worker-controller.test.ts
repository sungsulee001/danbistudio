import { describe, expect, it } from 'vitest';

import { shouldAcceptPreviewWorkerFrameResult } from '../../src/electron/renderer/preview-worker-controller';

describe('preview worker controller', () => {
  it('accepts only the latest requested preview frame result', () => {
    expect(shouldAcceptPreviewWorkerFrameResult('preview-1-frame-2', 'preview-1-frame-2')).toBe(true);
    expect(shouldAcceptPreviewWorkerFrameResult('preview-1-frame-1', 'preview-1-frame-2')).toBe(false);
    expect(shouldAcceptPreviewWorkerFrameResult('preview-1-frame-2', '')).toBe(false);
    expect(shouldAcceptPreviewWorkerFrameResult('', 'preview-1-frame-2')).toBe(false);
  });
});
