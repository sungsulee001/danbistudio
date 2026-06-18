import type { EditorProject, ExportProfile } from './types';

export type ExportProfilePatch = Partial<Omit<ExportProfile, 'id'>>;

export const EXPORT_PROFILE_MIN_DIMENSION = 16;
export const EXPORT_PROFILE_MAX_DIMENSION = 8192;

const CODECS: ExportProfile['codec'][] = ['h264', 'h265', 'prores', 'av1'];
const CONTAINERS: ExportProfile['container'][] = ['mp4', 'mov', 'webm'];
const PURPOSES: NonNullable<ExportProfile['purpose']>[] = ['master', 'social', 'proxy'];
const PRESETS: NonNullable<ExportProfile['ffmpegPreset']>[] = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow'];
const CODECS_BY_CONTAINER: Record<ExportProfile['container'], ExportProfile['codec'][]> = {
  mp4: ['h264', 'h265', 'av1'],
  mov: ['h264', 'h265', 'prores'],
  webm: ['av1'],
};
const DEFAULT_CODEC_BY_CONTAINER: Record<ExportProfile['container'], ExportProfile['codec']> = {
  mp4: 'h264',
  mov: 'h264',
  webm: 'av1',
};

export function getExportProfileCodecOptions(container: ExportProfile['container']): ExportProfile['codec'][] {
  return [...CODECS_BY_CONTAINER[container]];
}

export function isExportProfileCodecContainerCompatible(
  profile: Pick<ExportProfile, 'container' | 'codec'>,
): boolean {
  return CODECS_BY_CONTAINER[profile.container].includes(profile.codec);
}

export function normalizeExportProfileDimension(value: number): number {
  return normalizeEvenInteger(value, EXPORT_PROFILE_MIN_DIMENSION, EXPORT_PROFILE_MAX_DIMENSION);
}

export function normalizeExportProfileDimensions(
  profile: Pick<ExportProfile, 'width' | 'height'>,
): Pick<ExportProfile, 'width' | 'height'> {
  return {
    width: normalizeExportProfileDimension(profile.width),
    height: normalizeExportProfileDimension(profile.height),
  };
}

export function isExportProfileDimensionCompatible(
  profile: Pick<ExportProfile, 'width' | 'height'>,
): boolean {
  return isEvenIntegerInRange(profile.width, EXPORT_PROFILE_MIN_DIMENSION, EXPORT_PROFILE_MAX_DIMENSION) &&
    isEvenIntegerInRange(profile.height, EXPORT_PROFILE_MIN_DIMENSION, EXPORT_PROFILE_MAX_DIMENSION);
}

export function buildExportProfileDimensionCompatibilityMessage(
  profile: Pick<ExportProfile, 'label' | 'width' | 'height'>,
): string | undefined {
  if (isExportProfileDimensionCompatible(profile)) {
    return undefined;
  }

  return `Export profile "${profile.label}" uses ${formatDimension(profile.width)}x${formatDimension(profile.height)}. Export dimensions must be even integers between ${EXPORT_PROFILE_MIN_DIMENSION} and ${EXPORT_PROFILE_MAX_DIMENSION} for FFmpeg pixel formats.`;
}

export function updateExportProfile(
  project: EditorProject,
  profileId: string,
  patch: ExportProfilePatch,
): EditorProject {
  const index = project.exportProfiles.findIndex((profile) => profile.id === profileId);
  if (index === -1) {
    throw new Error(`Export profile not found: ${profileId}`);
  }

  const nextProfile = normalizeExportProfile({
    ...project.exportProfiles[index],
    ...patch,
    id: profileId,
  });

  if (profilesEqual(project.exportProfiles[index], nextProfile)) {
    return project;
  }

  return {
    ...project,
    exportProfiles: project.exportProfiles.map((profile) => (
      profile.id === profileId ? nextProfile : profile
    )),
    updatedAt: new Date().toISOString(),
  };
}

export function duplicateExportProfile(
  project: EditorProject,
  profileId: string,
  label?: string,
): { project: EditorProject; profile: ExportProfile } {
  const source = project.exportProfiles.find((profile) => profile.id === profileId);
  if (!source) {
    throw new Error(`Export profile not found: ${profileId}`);
  }

  const profile = normalizeExportProfile({
    ...source,
    id: uniqueProfileId(project.exportProfiles, source.id),
    label: normalizeLabel(label, `${source.label} Copy`),
  });

  return {
    profile,
    project: {
      ...project,
      exportProfiles: [...project.exportProfiles, profile],
      updatedAt: new Date().toISOString(),
    },
  };
}

export function removeExportProfile(project: EditorProject, profileId: string): EditorProject {
  const exists = project.exportProfiles.some((profile) => profile.id === profileId);
  if (!exists) {
    throw new Error(`Export profile not found: ${profileId}`);
  }

  if (project.exportProfiles.length <= 1) {
    throw new Error('At least one export profile is required.');
  }

  return {
    ...project,
    exportProfiles: project.exportProfiles.filter((profile) => profile.id !== profileId),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeExportProfile(profile: ExportProfile): ExportProfile {
  const codec = CODECS.includes(profile.codec) ? profile.codec : 'h264';
  const container = CONTAINERS.includes(profile.container) ? profile.container : 'mp4';
  const compatibleCodec = CODECS_BY_CONTAINER[container].includes(codec)
    ? codec
    : DEFAULT_CODEC_BY_CONTAINER[container];
  const preset = profile.ffmpegPreset && PRESETS.includes(profile.ffmpegPreset)
    ? profile.ffmpegPreset
    : undefined;
  const dimensions = normalizeExportProfileDimensions(profile);

  return {
    id: profile.id,
    label: normalizeLabel(profile.label, 'Custom Export'),
    purpose: profile.purpose && PURPOSES.includes(profile.purpose) ? profile.purpose : undefined,
    container,
    codec: compatibleCodec,
    width: dimensions.width,
    height: dimensions.height,
    fps: clampNumber(profile.fps, 1, 240),
    videoBitrateMbps: clampNumber(profile.videoBitrateMbps, 0.5, 300),
    audioBitrateKbps: clampInteger(profile.audioBitrateKbps, 32, 1024),
    ffmpegPreset: preset,
    crf: profile.crf === undefined ? undefined : clampInteger(profile.crf, 0, 51),
  };
}

function normalizeLabel(value: string | undefined, fallback: string): string {
  const normalized = (value ?? '').trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : fallback;
}

function uniqueProfileId(profiles: ExportProfile[], sourceId: string): string {
  const ids = new Set(profiles.map((profile) => profile.id));
  const base = `${sourceId}-copy`;
  if (!ids.has(base)) {
    return base;
  }

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!ids.has(candidate)) {
      return candidate;
    }
  }

  return `${base}-${Date.now()}`;
}

function profilesEqual(left: ExportProfile, right: ExportProfile): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeEvenInteger(value: number, min: number, max: number): number {
  const clamped = clampInteger(value, min, max);
  return clamped % 2 === 0 ? clamped : clamped + (clamped >= max ? -1 : 1);
}

function isEvenIntegerInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max && value % 2 === 0;
}

function formatDimension(value: number): string {
  return Number.isFinite(value) ? String(value) : 'invalid';
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
