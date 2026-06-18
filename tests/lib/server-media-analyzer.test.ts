import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { analyzeMediaFile, runFfprobe } from '../../src/server/editor/media-analyzer';

class FakeFfprobeProcess extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  killedWith: NodeJS.Signals | number | undefined;

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killedWith = signal;
    this.emit('close', null);
    return true;
  }
}

describe('server media analyzer', () => {
  it('bounds stalled ffprobe analysis and kills the probe process', async () => {
    vi.useFakeTimers();
    const child = new FakeFfprobeProcess();

    try {
      const probe = expect(runFfprobe('E:/media/stalled.mov', {
        ffprobeTimeoutMs: 1000,
        spawnImpl: () => child,
      })).rejects.toThrow('ffprobe timed out after 1000ms.');

      await vi.advanceTimersByTimeAsync(1000);
      await probe;

      expect(child.killedWith).toBe('SIGTERM');
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to degraded media metadata when ffprobe times out', async () => {
    vi.useFakeTimers();
    const child = new FakeFfprobeProcess();

    try {
      const analysisPromise = analyzeMediaFile('E:/media/stalled.mov', 'video/quicktime', {
        ffprobeTimeoutMs: 1000,
        spawnImpl: () => child,
      });

      await vi.advanceTimersByTimeAsync(1000);
      await expect(analysisPromise).resolves.toMatchObject({
        hasVideo: true,
        hasAudio: false,
        warnings: ['ffprobe analysis failed: ffprobe timed out after 1000ms.'],
      });
      expect(child.killedWith).toBe('SIGTERM');
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses normalized MIME parameters for degraded audio-only fallback metadata', async () => {
    vi.useFakeTimers();
    const child = new FakeFfprobeProcess();

    try {
      const analysisPromise = analyzeMediaFile('E:/media/voiceover.webm', 'audio/webm;codecs=opus', {
        ffprobeTimeoutMs: 1000,
        spawnImpl: () => child,
      });

      await vi.advanceTimersByTimeAsync(1000);
      await expect(analysisPromise).resolves.toMatchObject({
        hasVideo: false,
        hasAudio: true,
        warnings: ['ffprobe analysis failed: ffprobe timed out after 1000ms.'],
      });
      expect(child.killedWith).toBe('SIGTERM');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not mark unsupported broad image MIME as visual media when ffprobe fails', async () => {
    vi.useFakeTimers();
    const child = new FakeFfprobeProcess();

    try {
      const analysisPromise = analyzeMediaFile('E:/media/vector.svg', 'image/svg+xml', {
        ffprobeTimeoutMs: 1000,
        spawnImpl: () => child,
      });

      await vi.advanceTimersByTimeAsync(1000);
      await expect(analysisPromise).resolves.toMatchObject({
        hasVideo: false,
        hasAudio: false,
        warnings: ['ffprobe analysis failed: ffprobe timed out after 1000ms.'],
      });
      expect(child.killedWith).toBe('SIGTERM');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not trust supported extensions when ffprobe fails with an explicit unsupported MIME', async () => {
    vi.useFakeTimers();
    const child = new FakeFfprobeProcess();

    try {
      const analysisPromise = analyzeMediaFile('E:/media/spoofed.png', 'image/svg+xml', {
        ffprobeTimeoutMs: 1000,
        spawnImpl: () => child,
      });

      await vi.advanceTimersByTimeAsync(1000);
      await expect(analysisPromise).resolves.toMatchObject({
        hasVideo: false,
        hasAudio: false,
        warnings: ['ffprobe analysis failed: ffprobe timed out after 1000ms.'],
      });
      expect(child.killedWith).toBe('SIGTERM');
    } finally {
      vi.useRealTimers();
    }
  });
});
