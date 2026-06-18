import type { EditorProject } from './types';

export const MASTER_LOUDNESS_MIN_LUFS = -30;
export const MASTER_LOUDNESS_MAX_LUFS = -5;
export const MASTER_TRUE_PEAK_MIN_DB = -12;
export const MASTER_TRUE_PEAK_MAX_DB = 0;
export const DEFAULT_MASTER_LOUDNESS_LUFS = -14;
export const DEFAULT_MASTER_TRUE_PEAK_DB = -1.5;

export interface MasterAudioSettings {
  loudnessLufs?: number;
  truePeakDb?: number;
}

export function resolveMasterAudioSettings(project: EditorProject): MasterAudioSettings {
  const localRule = findLocalBeforeExportRule(project);
  if (!localRule) {
    return {};
  }

  const loudnessLufs = readFiniteNumber(localRule.parameters.loudnessLufs);
  const truePeakDb = readFiniteNumber(localRule.parameters.truePeakDb);

  return {
    ...(loudnessLufs === undefined ? {} : { loudnessLufs: normalizeMasterLoudnessLufs(loudnessLufs) }),
    ...(truePeakDb === undefined ? {} : { truePeakDb: normalizeMasterTruePeakDb(truePeakDb) }),
  };
}

export function updateMasterAudioSettings(
  project: EditorProject,
  patch: MasterAudioSettings,
): EditorProject {
  const existingRule = findLocalBeforeExportRule(project);
  const parameters = {
    ...(existingRule?.parameters ?? {}),
    ...(patch.loudnessLufs === undefined ? {} : { loudnessLufs: normalizeMasterLoudnessLufs(patch.loudnessLufs) }),
    ...(patch.truePeakDb === undefined ? {} : { truePeakDb: normalizeMasterTruePeakDb(patch.truePeakDb) }),
  };

  if (existingRule) {
    return {
      ...project,
      updatedAt: new Date().toISOString(),
      automation: project.automation.map((rule) => (
        rule.id === existingRule.id
          ? { ...rule, parameters }
          : rule
      )),
    };
  }

  return {
    ...project,
    updatedAt: new Date().toISOString(),
    automation: [
      ...project.automation,
      {
        id: `rule-master-audio-${Date.now()}`,
        name: 'Master audio',
        provider: 'local',
        trigger: 'before-export',
        targetTrackIds: [],
        parameters,
      },
    ],
  };
}

export function normalizeMasterLoudnessLufs(value: number): number {
  return roundTo(clamp(value, MASTER_LOUDNESS_MIN_LUFS, MASTER_LOUDNESS_MAX_LUFS), 10);
}

export function normalizeMasterTruePeakDb(value: number): number {
  return roundTo(clamp(value, MASTER_TRUE_PEAK_MIN_DB, MASTER_TRUE_PEAK_MAX_DB), 10);
}

export function truePeakDbToLinearLimit(value: number): number {
  return roundTo(Math.pow(10, normalizeMasterTruePeakDb(value) / 20), 1000);
}

function findLocalBeforeExportRule(project: EditorProject) {
  return project.automation.find((rule) => rule.trigger === 'before-export' && rule.provider === 'local');
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundTo(value: number, multiplier: number): number {
  return Math.round(value * multiplier) / multiplier;
}
