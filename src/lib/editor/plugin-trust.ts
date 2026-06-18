import type {
  EditorPluginExporterWriter,
  EditorPluginExporterWriterRuntimePackage,
  EditorPluginExporterWriterTrust,
  EditorPluginExporterWriterTrustAuditEntry,
  EditorProject,
} from './types';

const MAX_WRITER_TRUST_HISTORY = 32;

export interface PluginExporterWriterTrustFingerprintInput {
  id: string;
  executable: string;
  args: string[];
  cwd?: string | null;
  timeoutMs?: number | null;
  runtimePackage?: EditorPluginExporterWriterRuntimePackage | null;
}

export interface PluginExporterWriterTrustUpdateResult {
  project: EditorProject;
  updated: boolean;
  status: 'updated' | 'plugin-not-found' | 'writer-not-found' | 'unchanged';
  previousTrust?: EditorPluginExporterWriterTrust;
  nextTrust: EditorPluginExporterWriterTrust;
  fingerprint?: string;
  auditEntry?: EditorPluginExporterWriterTrustAuditEntry;
}

export function updatePluginExporterWriterTrust(
  project: EditorProject,
  pluginId: string,
  writerId: string,
  trust: EditorPluginExporterWriterTrust,
  options: { updatedAt?: string; source?: string } = {},
): PluginExporterWriterTrustUpdateResult {
  const plugin = project.plugins.find((candidate) => candidate.id === pluginId);
  if (!plugin) {
    return {
      project,
      updated: false,
      status: 'plugin-not-found',
      nextTrust: trust,
    };
  }

  const writers = Array.isArray(plugin.exporterWriters) ? plugin.exporterWriters : [];
  const writer = writers.find((candidate) => candidate.id === writerId);
  if (!writer) {
    return {
      project,
      updated: false,
      status: 'writer-not-found',
      nextTrust: trust,
    };
  }

  const previousTrust = writer.trust ?? 'prompt';
  const fingerprint = buildPluginExporterWriterTrustFingerprint(writer);
  const updatedAt = options.updatedAt ?? new Date().toISOString();
  const trustAlreadyCurrent = previousTrust === trust &&
    (trust !== 'trusted' || writer.trustFingerprint === fingerprint);
  if (trustAlreadyCurrent) {
    return {
      project,
      updated: false,
      status: 'unchanged',
      previousTrust,
      nextTrust: trust,
      fingerprint: writer.trustFingerprint,
    };
  }

  const auditEntry = buildPluginExporterWriterTrustAuditEntry({
    writer,
    action: trust,
    previousTrust,
    nextTrust: trust,
    fingerprint,
    at: updatedAt,
    source: options.source,
  });

  return {
    project: {
      ...project,
      updatedAt,
      plugins: project.plugins.map((candidate) => (
        candidate.id === pluginId
          ? {
              ...candidate,
              exporterWriters: writers.map((candidateWriter) => (
                candidateWriter.id === writerId
                  ? buildTrustedExporterWriterPatch(candidateWriter, trust, fingerprint, updatedAt, auditEntry)
                  : candidateWriter
              )),
            }
          : candidate
      )),
    },
    updated: true,
    status: 'updated',
    previousTrust,
    nextTrust: trust,
    fingerprint,
    auditEntry,
  };
}

export function buildPluginExporterWriterTrustFingerprint(
  writer: PluginExporterWriterTrustFingerprintInput,
): string {
  const payload = JSON.stringify({
    version: 1,
    id: writer.id,
    executable: writer.executable.trim(),
    args: writer.args,
    cwd: writer.cwd ? writer.cwd.trim() : null,
    runtimePackage: normalizeRuntimePackageForFingerprint(writer.runtimePackage),
    timeoutMs: typeof writer.timeoutMs === 'number' && Number.isFinite(writer.timeoutMs)
      ? Math.trunc(writer.timeoutMs)
      : null,
  });

  return `writer-v1-${hashText(payload)}`;
}

export function isPluginExporterWriterTrustCurrent(writer: EditorPluginExporterWriter): boolean {
  return writer.trust === 'trusted' &&
    writer.trustFingerprint === buildPluginExporterWriterTrustFingerprint(writer);
}

function buildTrustedExporterWriterPatch(
  writer: EditorPluginExporterWriter,
  trust: EditorPluginExporterWriterTrust,
  fingerprint: string,
  updatedAt: string,
  auditEntry: EditorPluginExporterWriterTrustAuditEntry,
): EditorPluginExporterWriter {
  const trustHistory = appendWriterTrustHistory(writer.trustHistory, auditEntry);
  if (trust === 'trusted') {
    return {
      ...writer,
      trust,
      trustFingerprint: fingerprint,
      trustedAt: updatedAt,
      trustHistory,
    };
  }

  const {
    trustFingerprint: _trustFingerprint,
    trustedAt: _trustedAt,
    ...rest
  } = writer;
  return {
    ...rest,
    trust,
    trustHistory,
  };
}

function buildPluginExporterWriterTrustAuditEntry({
  writer,
  action,
  previousTrust,
  nextTrust,
  fingerprint,
  at,
  source,
}: {
  writer: EditorPluginExporterWriter;
  action: EditorPluginExporterWriterTrust;
  previousTrust: EditorPluginExporterWriterTrust;
  nextTrust: EditorPluginExporterWriterTrust;
  fingerprint: string;
  at: string;
  source: string | undefined;
}): EditorPluginExporterWriterTrustAuditEntry {
  return {
    at,
    action: action === 'trusted' ? 'approved' : action === 'blocked' ? 'blocked' : 'review-required',
    previousTrust,
    nextTrust,
    fingerprint,
    commandPreview: buildPluginExporterWriterCommandPreview(writer),
    ...(source ? { source } : {}),
  };
}

function appendWriterTrustHistory(
  history: EditorPluginExporterWriterTrustAuditEntry[] | undefined,
  entry: EditorPluginExporterWriterTrustAuditEntry,
): EditorPluginExporterWriterTrustAuditEntry[] {
  const existing = Array.isArray(history) ? history : [];
  return [...existing, entry].slice(-MAX_WRITER_TRUST_HISTORY);
}

function buildPluginExporterWriterCommandPreview(writer: PluginExporterWriterTrustFingerprintInput): string {
  return [writer.executable, ...writer.args].filter(Boolean).join(' ');
}

function normalizeRuntimePackageForFingerprint(
  runtimePackage: EditorPluginExporterWriterRuntimePackage | null | undefined,
): Record<string, unknown> | null {
  if (!runtimePackage) {
    return null;
  }

  return {
    packageId: runtimePackage.packageId.trim(),
    runtime: runtimePackage.runtime,
    root: runtimePackage.root.trim().replace(/\\/g, '/'),
    entry: runtimePackage.entry.trim().replace(/\\/g, '/'),
    packagedAt: runtimePackage.packagedAt ?? null,
    files: [...runtimePackage.files]
      .map((file) => ({
        path: file.path.trim().replace(/\\/g, '/'),
        sha256: file.sha256 ?? null,
        bytes: typeof file.bytes === 'number' && Number.isFinite(file.bytes)
          ? Math.trunc(file.bytes)
          : null,
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  };
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(36).padStart(7, '0');
}
