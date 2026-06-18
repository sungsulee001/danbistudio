export const COMFYUI_URL_STORAGE_KEY = 'danbi.comfyuiUrl';
export const GENERATE_DEFAULT_STEPS_STORAGE_KEY = 'danbi.generate.defaultSteps';
export const GENERATE_DEFAULT_SEED_STORAGE_KEY = 'danbi.generate.defaultSeed';
export const GENERATE_OUTPUT_FORMAT_STORAGE_KEY = 'danbi.generate.outputFormat';

export const DEFAULT_COMFYUI_URL = 'http://localhost:8188';
export const DEFAULT_GENERATE_STEPS = '25';
export const DEFAULT_GENERATE_SEED = 'Random';
export const DEFAULT_GENERATE_OUTPUT_FORMAT = 'MP4';
export const GENERATE_RANDOM_SEED_MAX = 2147483647;

export type GenerateOutputFormat = 'MP4' | 'PNG' | 'JPG';

const OUTPUT_FORMATS = new Set<GenerateOutputFormat>(['MP4', 'PNG', 'JPG']);

export function normalizeGenerateStepsSetting(
  value: unknown,
  fallback = DEFAULT_GENERATE_STEPS,
): string {
  const parsed = parseIntegerSetting(value);
  if (parsed === null || parsed < 1 || parsed > 100) {
    return fallback;
  }

  return String(parsed);
}

export function normalizeGenerateSeedSetting(
  value: unknown,
  fallback = DEFAULT_GENERATE_SEED,
): string {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'random') {
    return DEFAULT_GENERATE_SEED;
  }

  const parsed = parseIntegerSetting(value);
  if (parsed === null || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER) {
    return fallback;
  }

  return String(parsed);
}

export function resolveGenerateSeedSetting(
  value: unknown,
  random = Math.random,
): string {
  const normalized = normalizeGenerateSeedSetting(value);
  if (normalized === DEFAULT_GENERATE_SEED) {
    return String(Math.floor(clampRandom(random()) * (GENERATE_RANDOM_SEED_MAX + 1)));
  }

  return normalized;
}

export function parseGenerateOutputFormat(value: unknown): GenerateOutputFormat | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return OUTPUT_FORMATS.has(normalized as GenerateOutputFormat)
    ? normalized as GenerateOutputFormat
    : null;
}

export function normalizeGenerateOutputFormat(
  value: unknown,
  fallback: GenerateOutputFormat = DEFAULT_GENERATE_OUTPUT_FORMAT,
): GenerateOutputFormat {
  return parseGenerateOutputFormat(value) ?? fallback;
}

function parseIntegerSetting(value: unknown): number | null {
  const parsed = typeof value === 'string' && value.trim() !== ''
    ? Number(value.trim())
    : value;

  return typeof parsed === 'number' && Number.isFinite(parsed) && Number.isInteger(parsed)
    ? parsed
    : null;
}

function clampRandom(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 0.9999999999999999);
}
