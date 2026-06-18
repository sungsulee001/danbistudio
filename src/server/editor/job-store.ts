import { randomUUID } from 'crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { getJobStorageRoot } from '../job-storage';

export interface PersistedJobRecord<TSnapshot extends { id: string; status: string; createdAt: string }> {
  id: string;
  kind: string;
  status: string;
  snapshot: TSnapshot;
  createdAt: string;
  updatedAt: string;
}

const storeRoot = () => getJobStorageRoot();
const writeQueues = new Map<string, Promise<void>>();

export async function savePersistedJob<TSnapshot extends { id: string; status: string; createdAt: string }>(
  kind: string,
  snapshot: TSnapshot,
): Promise<void> {
  await mutatePersistedJobRecords<TSnapshot, void>(kind, (records) => {
    const now = new Date().toISOString();
    const nextRecord: PersistedJobRecord<TSnapshot> = {
      id: snapshot.id,
      kind,
      status: snapshot.status,
      snapshot,
      createdAt: records.find((record) => record.id === snapshot.id)?.createdAt ?? snapshot.createdAt,
      updatedAt: now,
    };
    const nextRecords = [
      nextRecord,
      ...records.filter((record) => record.id !== snapshot.id),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      records: nextRecords,
      result: undefined,
    };
  });
}

export async function getPersistedJob<TSnapshot extends { id: string; status: string; createdAt: string }>(
  kind: string,
  id: string,
): Promise<TSnapshot | undefined> {
  await waitForPendingWrite(kind);
  const records = await readPersistedJobRecords<TSnapshot>(kind);
  return records.find((record) => record.id === id)?.snapshot;
}

export async function listPersistedJobs<TSnapshot extends { id: string; status: string; createdAt: string }>(
  kind: string,
): Promise<TSnapshot[]> {
  await waitForPendingWrite(kind);
  const records = await readPersistedJobRecords<TSnapshot>(kind);
  return records
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((record) => record.snapshot);
}

export async function clearTerminalPersistedJobs(kind: string): Promise<number> {
  return mutatePersistedJobRecords(kind, (records) => {
    const activeRecords = records.filter((record) => !['completed', 'failed', 'cancelled'].includes(record.status));
    const deleted = records.length - activeRecords.length;

    return {
      records: activeRecords,
      result: deleted,
      write: deleted > 0,
    };
  });
}

async function waitForPendingWrite(kind: string): Promise<void> {
  await writeQueues.get(kind)?.catch(() => undefined);
}

async function readPersistedJobRecords<TSnapshot extends { id: string; status: string; createdAt: string }>(
  kind: string,
): Promise<Array<PersistedJobRecord<TSnapshot>>> {
  try {
    const raw = await readFile(storePath(kind), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((record) => readPersistedJobRecord<TSnapshot>(record, kind)).filter((record): record is PersistedJobRecord<TSnapshot> => Boolean(record))
      : [];
  } catch {
    return [];
  }
}

function readPersistedJobRecord<TSnapshot extends { id: string; status: string; createdAt: string }>(
  value: unknown,
  kind: string,
): PersistedJobRecord<TSnapshot> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Partial<PersistedJobRecord<TSnapshot>>;
  const snapshot = record.snapshot as Partial<TSnapshot> | undefined;

  if (
    !snapshot
    || typeof snapshot !== 'object'
    || typeof snapshot.id !== 'string'
    || typeof snapshot.status !== 'string'
    || typeof snapshot.createdAt !== 'string'
    || !Number.isFinite(Date.parse(snapshot.createdAt))
  ) {
    return undefined;
  }

  const id = typeof record.id === 'string' ? record.id : snapshot.id;
  if (id !== snapshot.id) {
    return undefined;
  }

  const createdAt = typeof record.createdAt === 'string' && Number.isFinite(Date.parse(record.createdAt))
    ? record.createdAt
    : snapshot.createdAt;
  const updatedAt = typeof record.updatedAt === 'string' && Number.isFinite(Date.parse(record.updatedAt))
    ? record.updatedAt
    : createdAt;

  return {
    id,
    kind: typeof record.kind === 'string' ? record.kind : kind,
    status: snapshot.status,
    snapshot: {
      ...snapshot,
      id: snapshot.id,
      status: snapshot.status,
      createdAt: snapshot.createdAt,
    } as TSnapshot,
    createdAt,
    updatedAt,
  };
}

async function writePersistedJobRecords<TSnapshot extends { id: string; status: string; createdAt: string }>(
  kind: string,
  records: Array<PersistedJobRecord<TSnapshot>>,
): Promise<void> {
  const root = storeRoot();
  await mkdir(root, { recursive: true });
  const target = storePath(kind);
  const temp = `${target}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;

  try {
    await writeFile(temp, JSON.stringify(records, null, 2), 'utf8');
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true }).catch(() => undefined);
  }
}

async function mutatePersistedJobRecords<
  TSnapshot extends { id: string; status: string; createdAt: string },
  TResult,
>(
  kind: string,
  mutator: (records: Array<PersistedJobRecord<TSnapshot>>) => {
    records: Array<PersistedJobRecord<TSnapshot>>;
    result: TResult;
    write?: boolean;
  },
): Promise<TResult> {
  const previousWrite = writeQueues.get(kind) ?? Promise.resolve();
  const operation = previousWrite.catch(() => undefined).then(async () => {
    const mutation = mutator(await readPersistedJobRecords<TSnapshot>(kind));
    if (mutation.write !== false) {
      await writePersistedJobRecords(kind, mutation.records);
    }
    return mutation.result;
  });

  writeQueues.set(kind, operation.then(() => undefined, () => undefined));
  return operation;
}

function storePath(kind: string): string {
  const normalizedKind = kind
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '') || 'jobs';
  const safeKind = isWindowsReservedPathName(normalizedKind) ? `jobs-${normalizedKind}` : normalizedKind;
  return join(storeRoot(), `${safeKind}.json`);
}

function isWindowsReservedPathName(value: string): boolean {
  const baseName = value.split('.')[0]?.toLowerCase();
  return Boolean(baseName) && WINDOWS_RESERVED_PATH_NAMES.has(baseName);
}

const WINDOWS_RESERVED_PATH_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);
