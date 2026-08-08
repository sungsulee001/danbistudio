import { describe, expect, it } from 'vitest';
import {
  buildProgramAudioFftLayerSample,
  buildProgramAudioFftSample,
  isSameProgramAudioFftSample,
  PROGRAM_AUDIO_FFT_EMIT_INTERVAL_MS,
  shouldEmitProgramAudioFftSample,
} from '../../src/lib/editor/audio-analyzer';

function buildSample(layerId: string, bins: number[], sourceLayerCount = 1) {
  return buildProgramAudioFftSample([buildProgramAudioFftLayerSample(layerId, bins)], { sourceLayerCount });
}

describe('program audio fft emit throttling', () => {
  it('treats value-equal samples as the same so state updates can bail out', () => {
    const first = buildSample('track-a1:clip-n01', [0, 64, 128, 255, 128, 64]);
    const second = buildSample('track-a1:clip-n02', [0, 64, 128, 255, 128, 64]);

    expect(first).not.toBe(second);
    expect(isSameProgramAudioFftSample(first, second)).toBe(true);
    expect(isSameProgramAudioFftSample(null, null)).toBe(true);
    expect(isSameProgramAudioFftSample(first, null)).toBe(false);
    expect(isSameProgramAudioFftSample(first, buildSample('track-a1:clip-n01', [255, 255, 255, 255, 255, 255]))).toBe(false);
  });

  it('drops repeat emits inside the throttle window', () => {
    const previous = buildSample('track-a1:clip-n01', [0, 64, 128, 255, 128, 64]);
    const next = buildSample('track-a1:clip-n01', [0, 70, 130, 250, 120, 60]);

    expect(shouldEmitProgramAudioFftSample({
      previous,
      next,
      lastEmitAt: 1_000,
      now: 1_000 + PROGRAM_AUDIO_FFT_EMIT_INTERVAL_MS - 1,
    })).toBe(false);
    expect(shouldEmitProgramAudioFftSample({
      previous,
      next,
      lastEmitAt: 1_000,
      now: 1_000 + PROGRAM_AUDIO_FFT_EMIT_INTERVAL_MS,
    })).toBe(true);
  });

  it('drops unchanged samples even after the throttle window elapses', () => {
    const previous = buildSample('track-a1:clip-n01', [0, 64, 128, 255, 128, 64]);
    const next = buildSample('track-a1:clip-n01', [0, 64, 128, 255, 128, 64]);

    expect(shouldEmitProgramAudioFftSample({
      previous,
      next,
      lastEmitAt: 0,
      now: 10_000,
    })).toBe(false);
  });

  it('emits layer-count changes immediately so clip handoff is never delayed', () => {
    const previous = buildSample('track-a1:clip-n01', [0, 64, 128, 255, 128, 64], 2);
    const next = buildProgramAudioFftSample([], { sourceLayerCount: 0 });

    expect(shouldEmitProgramAudioFftSample({
      previous,
      next,
      lastEmitAt: 1_000,
      now: 1_001,
    })).toBe(true);
    expect(shouldEmitProgramAudioFftSample({
      previous: null,
      next,
      lastEmitAt: 1_000,
      now: 1_001,
    })).toBe(true);
  });
});
