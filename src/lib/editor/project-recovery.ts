// Adapted from OpenCut Classic services/storage persistence, migration, and quota patterns.
// Source: https://github.com/opencut-app/opencut-classic
// Commit: cf5e79e919144200294fb9fed22a222592a0aeea
// License: MIT. See third_party/NOTICE.md and docs/THIRD_PARTY_SOURCE_REGISTER_KR.md.

import { serializeProject, summarizeProject } from './project-store';
import type { EditorProject } from './types';

export type ProjectRecoverySource = 'database' | 'autosave' | 'local-fallback' | 'package-import';
export type ProjectStorageCapacityReason = 'enough-space' | 'insufficient-space' | 'estimate-unavailable';

export interface ProjectRecoveryCandidate {
  id: string;
  projectId: string;
  name: string;
  source: ProjectRecoverySource;
  savedAt: string;
  duration: number;
  clipCount: number;
  warningCount: number;
  reason?: string;
  serializedProjectText?: string;
  storageBytes?: number;
}

export interface ProjectRecoveryIndex {
  candidates: ProjectRecoveryCandidate[];
  recommended?: ProjectRecoveryCandidate;
  skippedCount: number;
  warnings: string[];
}

export interface ProjectStorageCapacityStatus {
  canStore: boolean;
  reason: ProjectStorageCapacityReason;
  requiredBytes: number;
  availableBytes: number | null;
  reserveBytes: number;
  label: string;
}

const DEFAULT_RECOVERY_STORAGE_RESERVE_BYTES = 5 * 1024 * 1024;

const SOURCE_PRIORITY: Record<ProjectRecoverySource, number> = {
  autosave: 40,
  'local-fallback': 30,
  database: 20,
  'package-import': 10,
};

export function buildProjectRecoveryCandidateFromProject({
  source,
  project,
  savedAt = project.updatedAt,
  reason,
  warningCount = 0,
}: {
  source: ProjectRecoverySource;
  project: EditorProject;
  savedAt?: string;
  reason?: string;
  warningCount?: number;
}): ProjectRecoveryCandidate {
  const summary = summarizeProject(project, savedAt, savedAt);
  const serializedProjectText = serializeProject(project);

  return {
    id: `${source}:${project.id}`,
    projectId: project.id,
    name: project.name,
    source,
    savedAt,
    duration: summary.duration,
    clipCount: summary.clipCount,
    warningCount: Math.max(0, Math.floor(warningCount)),
    reason,
    serializedProjectText,
    storageBytes: estimateProjectStorageBytes(serializedProjectText),
  };
}

export function buildProjectRecoveryIndex(
  candidates: ProjectRecoveryCandidate[],
  options: {
    currentProjectId?: string;
  } = {},
): ProjectRecoveryIndex {
  const { validCandidates, skippedCount } = normalizeProjectRecoveryCandidates(candidates);
  const sortedCandidates = [...validCandidates].sort((left, right) => compareProjectRecoveryCandidates(left, right, options.currentProjectId));
  const recommended = sortedCandidates[0];

  return {
    candidates: sortedCandidates,
    recommended,
    skippedCount,
    warnings: buildProjectRecoveryWarnings(sortedCandidates, recommended),
  };
}

export function evaluateProjectStorageCapacity({
  serializedProjectText,
  availableBytes,
  reserveBytes = DEFAULT_RECOVERY_STORAGE_RESERVE_BYTES,
}: {
  serializedProjectText: string;
  availableBytes: number | null;
  reserveBytes?: number;
}): ProjectStorageCapacityStatus {
  const requiredBytes = estimateProjectStorageBytes(serializedProjectText);
  const normalizedReserveBytes = Math.max(0, Math.floor(reserveBytes));

  if (availableBytes === null || !Number.isFinite(availableBytes)) {
    return {
      canStore: true,
      reason: 'estimate-unavailable',
      requiredBytes,
      availableBytes: null,
      reserveBytes: normalizedReserveBytes,
      label: `${formatProjectStorageBytes(requiredBytes)} project; storage estimate unavailable`,
    };
  }

  const usableBytes = Math.max(0, Math.floor(availableBytes) - normalizedReserveBytes);
  const canStore = requiredBytes <= usableBytes;

  return {
    canStore,
    reason: canStore ? 'enough-space' : 'insufficient-space',
    requiredBytes,
    availableBytes: usableBytes,
    reserveBytes: normalizedReserveBytes,
    label: canStore
      ? `${formatProjectStorageBytes(requiredBytes)} project fits in ${formatProjectStorageBytes(usableBytes)} available`
      : `${formatProjectStorageBytes(requiredBytes)} project exceeds ${formatProjectStorageBytes(usableBytes)} available`,
  };
}

export function estimateProjectStorageBytes(projectText: string): number {
  return new TextEncoder().encode(projectText).byteLength;
}

export function formatProjectStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function normalizeProjectRecoveryCandidates(candidates: ProjectRecoveryCandidate[]): {
  validCandidates: ProjectRecoveryCandidate[];
  skippedCount: number;
} {
  const byKey = new Map<string, ProjectRecoveryCandidate>();
  let skippedCount = 0;

  for (const candidate of candidates) {
    if (!isValidProjectRecoveryCandidate(candidate)) {
      skippedCount++;
      continue;
    }

    const normalizedCandidate = normalizeProjectRecoveryCandidate(candidate);
    const key = `${normalizedCandidate.source}:${normalizedCandidate.projectId}`;
    const existing = byKey.get(key);
    if (!existing || compareProjectRecoveryCandidates(normalizedCandidate, existing) < 0) {
      byKey.set(key, normalizedCandidate);
    }
  }

  return {
    validCandidates: Array.from(byKey.values()),
    skippedCount,
  };
}

function normalizeProjectRecoveryCandidate(candidate: ProjectRecoveryCandidate): ProjectRecoveryCandidate {
  return {
    ...candidate,
    duration: readNonNegativeFiniteNumber(candidate.duration),
    clipCount: readNonNegativeInteger(candidate.clipCount),
    warningCount: readNonNegativeInteger(candidate.warningCount),
    storageBytes: candidate.storageBytes === undefined
      ? undefined
      : readNonNegativeInteger(candidate.storageBytes),
  };
}

function compareProjectRecoveryCandidates(
  left: ProjectRecoveryCandidate,
  right: ProjectRecoveryCandidate,
  currentProjectId?: string,
): number {
  const leftTime = Date.parse(left.savedAt);
  const rightTime = Date.parse(right.savedAt);
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  const leftCurrent = currentProjectId && left.projectId === currentProjectId ? 1 : 0;
  const rightCurrent = currentProjectId && right.projectId === currentProjectId ? 1 : 0;
  if (leftCurrent !== rightCurrent) {
    return rightCurrent - leftCurrent;
  }

  const leftPriority = SOURCE_PRIORITY[left.source];
  const rightPriority = SOURCE_PRIORITY[right.source];
  if (leftPriority !== rightPriority) {
    return rightPriority - leftPriority;
  }

  if (left.warningCount !== right.warningCount) {
    return left.warningCount - right.warningCount;
  }

  return left.name.localeCompare(right.name);
}

function buildProjectRecoveryWarnings(
  candidates: ProjectRecoveryCandidate[],
  recommended: ProjectRecoveryCandidate | undefined,
): string[] {
  const warnings: string[] = [];

  if (candidates.length === 0) {
    warnings.push('No project recovery snapshots are available.');
    return warnings;
  }

  const databaseByProjectId = new Map(candidates
    .filter((candidate) => candidate.source === 'database')
    .map((candidate) => [candidate.projectId, candidate]));

  for (const candidate of candidates) {
    const databaseCandidate = databaseByProjectId.get(candidate.projectId);
    if (
      databaseCandidate &&
      candidate.source !== 'database' &&
      Date.parse(candidate.savedAt) > Date.parse(databaseCandidate.savedAt)
    ) {
      warnings.push(`${candidate.name} has a newer ${candidate.source} snapshot than the saved database project.`);
    }
  }

  if (recommended && recommended.warningCount > 0) {
    warnings.push(`${recommended.name} recovery candidate has ${recommended.warningCount} import warning${recommended.warningCount > 1 ? 's' : ''}.`);
  }

  return warnings;
}

function isValidProjectRecoveryCandidate(candidate: ProjectRecoveryCandidate): boolean {
  return Boolean(
    candidate.id &&
    candidate.projectId &&
    candidate.name &&
    SOURCE_PRIORITY[candidate.source] !== undefined &&
    Number.isFinite(Date.parse(candidate.savedAt)),
  );
}

function readNonNegativeFiniteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function readNonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
