export const TRACK_VOLUME_MIN_DB = -60;
export const TRACK_VOLUME_MAX_DB = 12;
export const TRACK_PAN_MIN = -1;
export const TRACK_PAN_MAX = 1;
export const CLIP_VOLUME_MIN = 0;
export const CLIP_VOLUME_MAX = 2;
export const CLIP_GAIN_MIN_DB = -60;
export const CLIP_GAIN_MAX_DB = 6.02;
// 클립 단위 게인(clip.volumeDb) — 선형 volume(0~2)이 담지 못하는 넓은 편차 전용.
// 생성형 SFX의 컷별 정규화가 +15dB대까지 필요해 상한을 트랙 게인(+12dB)보다 높게 잡는다.
export const CLIP_VOLUME_MIN_DB = -60;
export const CLIP_VOLUME_MAX_DB = 24;

export function normalizeTrackVolumeDb(value: unknown): number {
  return roundTo(clampFiniteNumber(value, 0, TRACK_VOLUME_MIN_DB, TRACK_VOLUME_MAX_DB), 10);
}

export function normalizeTrackPan(value: unknown): number {
  return roundTo(clampFiniteNumber(value, 0, TRACK_PAN_MIN, TRACK_PAN_MAX), 100);
}

export function trackVolumeDbToGain(value: unknown): number {
  const volumeDb = normalizeTrackVolumeDb(value);
  if (volumeDb <= TRACK_VOLUME_MIN_DB) {
    return 0;
  }

  return roundTo(Math.pow(10, volumeDb / 20), 1000);
}

export function formatTrackVolumeDb(value: unknown): string {
  const volumeDb = normalizeTrackVolumeDb(value);
  const formatted = Number.isInteger(volumeDb) ? volumeDb.toFixed(0) : volumeDb.toFixed(1);
  return `${volumeDb > 0 ? '+' : ''}${formatted} dB`;
}

export function formatTrackPan(value: unknown): string {
  const pan = normalizeTrackPan(value);
  if (Math.abs(pan) < 0.01) {
    return 'Center';
  }

  return `${Math.round(Math.abs(pan) * 100)}% ${pan < 0 ? 'L' : 'R'}`;
}

export function normalizeClipVolumeDb(value: unknown): number {
  return roundTo(clampFiniteNumber(value, 0, CLIP_VOLUME_MIN_DB, CLIP_VOLUME_MAX_DB), 10);
}

export function clipVolumeDbToGain(value: unknown): number {
  if (value === undefined || value === null) {
    return 1;
  }

  const volumeDb = normalizeClipVolumeDb(value);
  if (volumeDb <= CLIP_VOLUME_MIN_DB) {
    return 0;
  }

  return roundTo(Math.pow(10, volumeDb / 20), 1000);
}

export function formatClipVolumeDb(value: unknown): string {
  const volumeDb = normalizeClipVolumeDb(value);
  const formatted = Number.isInteger(volumeDb) ? volumeDb.toFixed(0) : volumeDb.toFixed(1);
  return `${volumeDb > 0 ? '+' : ''}${formatted} dB`;
}

export function normalizeClipVolume(value: unknown): number {
  return roundTo(clampFiniteNumber(value, 1, CLIP_VOLUME_MIN, CLIP_VOLUME_MAX), 1000);
}

export function clipVolumeToGainDb(value: unknown): number {
  const volume = normalizeClipVolume(value);
  if (volume <= 0.001) {
    return CLIP_GAIN_MIN_DB;
  }

  return roundTo(clampFiniteNumber(20 * Math.log10(volume), 0, CLIP_GAIN_MIN_DB, CLIP_GAIN_MAX_DB), 100);
}

export function clipGainDbToVolume(value: unknown): number {
  const gainDb = clampFiniteNumber(value, 0, CLIP_GAIN_MIN_DB, CLIP_GAIN_MAX_DB);
  if (gainDb <= CLIP_GAIN_MIN_DB) {
    return CLIP_VOLUME_MIN;
  }

  return normalizeClipVolume(Math.pow(10, gainDb / 20));
}

export function formatClipGainDbFromVolume(value: unknown): string {
  const volume = normalizeClipVolume(value);
  if (volume <= 0.001) {
    return '-inf dB';
  }

  const gainDb = clipVolumeToGainDb(volume);
  const formatted = Number.isInteger(gainDb) ? gainDb.toFixed(0) : gainDb.toFixed(1);
  return `${gainDb > 0 ? '+' : ''}${formatted} dB`;
}

function clampFiniteNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, multiplier: number): number {
  return Math.round(value * multiplier) / multiplier;
}
