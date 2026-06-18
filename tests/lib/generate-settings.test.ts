import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GENERATE_OUTPUT_FORMAT,
  DEFAULT_GENERATE_SEED,
  DEFAULT_GENERATE_STEPS,
  normalizeGenerateOutputFormat,
  normalizeGenerateSeedSetting,
  normalizeGenerateStepsSetting,
  parseGenerateOutputFormat,
  resolveGenerateSeedSetting,
} from '../../src/lib/generate-settings';

describe('generate settings helpers', () => {
  it('normalizes generation step defaults to the API-supported range', () => {
    expect(normalizeGenerateStepsSetting('1')).toBe('1');
    expect(normalizeGenerateStepsSetting(100)).toBe('100');
    expect(normalizeGenerateStepsSetting('')).toBe(DEFAULT_GENERATE_STEPS);
    expect(normalizeGenerateStepsSetting('0')).toBe(DEFAULT_GENERATE_STEPS);
    expect(normalizeGenerateStepsSetting('101')).toBe(DEFAULT_GENERATE_STEPS);
    expect(normalizeGenerateStepsSetting('1.5')).toBe(DEFAULT_GENERATE_STEPS);
  });

  it('keeps either a numeric seed or the Random sentinel', () => {
    expect(normalizeGenerateSeedSetting('Random')).toBe(DEFAULT_GENERATE_SEED);
    expect(normalizeGenerateSeedSetting(' random ')).toBe(DEFAULT_GENERATE_SEED);
    expect(normalizeGenerateSeedSetting('0')).toBe('0');
    expect(normalizeGenerateSeedSetting(9007199254740991)).toBe('9007199254740991');
    expect(normalizeGenerateSeedSetting('-1')).toBe(DEFAULT_GENERATE_SEED);
    expect(normalizeGenerateSeedSetting('1.5')).toBe(DEFAULT_GENERATE_SEED);
  });

  it('resolves Random seeds to bounded integer values', () => {
    expect(resolveGenerateSeedSetting('Random', () => 0)).toBe('0');
    expect(resolveGenerateSeedSetting('Random', () => 0.999999999)).toBe('2147483645');
    expect(resolveGenerateSeedSetting('123', () => 0)).toBe('123');
  });

  it('normalizes output format settings and exposes strict parsing for API validation', () => {
    expect(normalizeGenerateOutputFormat('mp4')).toBe('MP4');
    expect(normalizeGenerateOutputFormat('png')).toBe('PNG');
    expect(normalizeGenerateOutputFormat('bad')).toBe(DEFAULT_GENERATE_OUTPUT_FORMAT);
    expect(parseGenerateOutputFormat('jpg')).toBe('JPG');
    expect(parseGenerateOutputFormat('webm')).toBeNull();
  });
});
