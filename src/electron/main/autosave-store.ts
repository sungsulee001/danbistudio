import { randomUUID } from 'crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { deserializeProject, serializeProject, summarizeProject, type ProjectSummary } from '../../lib/editor/project-store';
import type { EditorProject } from '../../lib/editor/types';
import { getAutosaveStorageRoot } from '../../server/autosave-storage';
import { assertValidProjectJson } from '../shared/project-schema';

export interface EditorAutosaveSummary extends ProjectSummary {
  projectId: string;
  savedAt: string;
  reason: string;
}

export interface EditorAutosaveSnapshot {
  projectId: string;
  reason: string;
  savedAt: string;
  summary: EditorAutosaveSummary;
  project: EditorProject;
}

interface AutosaveRecord {
  projectId: string;
  reason: string;
  savedAt: string;
  data: string;
}

const writeKey = 'editor-autosaves';
let pendingWrite: Promise<void> | undefined;

export async function saveEditorAutosave(
  project: EditorProject,
  reason = 'autosave',
  savedAt = new Date().toISOString(),
): Promise<EditorAutosaveSnapshot> {
  const migratedProject = assertValidProjectJson({
    ...project,
    updatedAt: savedAt,
  }, 'Cannot autosave editor project because its JSON is invalid');
  const nextRecord: AutosaveRecord = {
    projectId: migratedProject.id,
    reason: sanitizeReason(reason),
    savedAt,
    data: serializeProject(migratedProject),
  };

  return mutateAutosaveRecords((records) => ({
    records: [
      nextRecord,
      ...records.filter((record) => record.projectId !== migratedProject.id),
    ].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, 25),
    result: buildSnapshot(nextRecord),
  }));
}

export async function listEditorAutosaves(): Promise<EditorAutosaveSummary[]> {
  await waitForPendingWrite();
  const records = await readAutosaveRecords();
  return records
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .map((record) => buildSnapshot(record).summary);
}

export async function getEditorAutosave(projectId: string): Promise<EditorAutosaveSnapshot | undefined> {
  await waitForPendingWrite();
  const records = await readAutosaveRecords();
  const record = records.find((item) => item.projectId === projectId);
  return record ? buildSnapshot(record) : undefined;
}

export async function deleteEditorAutosave(projectId: string): Promise<boolean> {
  return mutateAutosaveRecords((records) => {
    const nextRecords = records.filter((record) => record.projectId !== projectId);
    if (nextRecords.length === records.length) {
      return {
        records,
        result: false,
        write: false,
      };
    }

    return {
      records: nextRecords,
      result: true,
    };
  });
}

export async function clearEditorAutosaves(): Promise<number> {
  return mutateAutosaveRecords((records) => ({
    records: [],
    result: records.length,
    write: records.length > 0,
  }));
}

function buildSnapshot(record: AutosaveRecord): EditorAutosaveSnapshot {
  const project = deserializeProject(record.data);
  const summary = summarizeProject(project, record.savedAt, record.savedAt);
  return {
    projectId: record.projectId,
    reason: record.reason,
    savedAt: record.savedAt,
    summary: {
      ...summary,
      projectId: record.projectId,
      savedAt: record.savedAt,
      reason: record.reason,
    },
    project,
  };
}

async function waitForPendingWrite(): Promise<void> {
  await pendingWrite?.catch(() => undefined);
}

async function readAutosaveRecords(): Promise<AutosaveRecord[]> {
  try {
    const raw = await readFile(storePath(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.map(readAutosaveRecord).filter((record): record is AutosaveRecord => Boolean(record))
      : [];
  } catch {
    return [];
  }
}

function readAutosaveRecord(value: unknown): AutosaveRecord | undefined {
  const record = value as Partial<AutosaveRecord>;
  if (
    !value
    || typeof value !== 'object'
    || typeof record.projectId !== 'string'
    || typeof record.savedAt !== 'string'
    || typeof record.data !== 'string'
    || !Number.isFinite(Date.parse(record.savedAt))
  ) {
    return undefined;
  }

  try {
    const project = deserializeProject(record.data);
    if (project.id !== record.projectId) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  return {
    projectId: record.projectId,
    reason: typeof record.reason === 'string' ? sanitizeReason(record.reason) : 'autosave',
    savedAt: record.savedAt,
    data: record.data,
  };
}

async function mutateAutosaveRecords<T>(
  mutator: (records: AutosaveRecord[]) => {
    records: AutosaveRecord[];
    result: T;
    write?: boolean;
  },
): Promise<T> {
  const previousWrite = pendingWrite ?? Promise.resolve();
  const operation = previousWrite.catch(() => undefined).then(async () => {
    const mutation = mutator(await readAutosaveRecords());
    if (mutation.write !== false) {
      await writeAutosaveRecordsToDisk(mutation.records);
    }
    return mutation.result;
  });

  pendingWrite = operation.then(() => undefined, () => undefined);
  return operation;
}

async function writeAutosaveRecordsToDisk(records: AutosaveRecord[]): Promise<void> {
  const root = storeRoot();
  await mkdir(root, { recursive: true });
  const target = storePath();
  const temp = `${target}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;

  try {
    await writeFile(temp, JSON.stringify(records, null, 2), 'utf8');
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true }).catch(() => undefined);
  }
}

function sanitizeReason(reason: string): string {
  const normalized = reason.trim().replace(/\s+/g, '-').toLowerCase();
  return normalized || 'autosave';
}

function storeRoot(): string {
  return getAutosaveStorageRoot();
}

function storePath(): string {
  return join(storeRoot(), `${writeKey}.json`);
}
