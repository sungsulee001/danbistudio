import { buildFfmpegRenderPlan } from '../../lib/editor/ffmpeg-renderer';
import { buildBatchRenderOutputFilename } from '../../lib/editor/render-output';
import { buildRenderPreflightReport } from '../../lib/editor/render-preflight';
import type { EditorProject } from '../../lib/editor/types';
import {
  RENDER_WORKER_HANDOFF_KIND,
  RENDER_WORKER_HANDOFF_SCHEMA_VERSION,
  type RenderWorkerDaemonRunRecord,
  type RenderWorkerDaemonStatus,
  type RenderWorkerHandoffCommand,
  type RenderWorkerHandoffJob,
  type RenderWorkerHandoffManifest,
} from '../shared/render-worker-contract';
import type { ExportRangeRequest } from './export-workflow-helpers';

export const RENDER_WORKER_TRUST_STORE_KEY = 'danbi.render-workers.trusted.v1';

export interface RenderWorkerControllerSettings {
  daemonUrl: string;
  remoteDaemonUrls: string;
  authToken: string;
  workerCwd: string;
  workerExecutable: string;
  dryRun: boolean;
  executeBlocked: boolean;
  autoRoute: boolean;
}

export interface RenderWorkerTrustedDaemon {
  workerId: string;
  url: string;
  firstSeenAt: string;
  lastSeenAt: string;
  authRequired: boolean;
  discoveryPort?: number;
}

export interface RenderWorkerCentralTrustPolicy {
  allowLocalhostWorkers: boolean;
  requireTrustedRemoteWorkers: boolean;
  requireRemotePairToken: boolean;
  allowedWorkerIds?: string[];
  blockedWorkerIds?: string[];
  allowedUrlOrigins?: string[];
  blockedUrlOrigins?: string[];
}

export interface RenderWorkerCentralTrustDecision {
  allowed: boolean;
  severity: 'allow' | 'review' | 'block';
  reason: string;
  warnings: string[];
  workerId: string;
  url: string;
  origin: string;
  local: boolean;
  trusted: boolean;
}

export interface RenderWorkerCentralTrustGovernanceSummary {
  policy: RenderWorkerCentralTrustPolicy;
  totalWorkers: number;
  allowedWorkers: number;
  reviewWorkers: number;
  blockedWorkers: number;
  localWorkers: number;
  remoteWorkers: number;
  trustedWorkers: number;
  decisions: RenderWorkerCentralTrustDecision[];
}

export interface RenderWorkerDaemonRouteOptions {
  trustedWorkers?: RenderWorkerTrustedDaemon[];
  trustPolicy?: RenderWorkerCentralTrustPolicy;
}

export interface RenderWorkerTrustStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RenderWorkerDaemonDiscoveryRequest {
  daemonUrl?: string;
  remoteDaemonUrls?: string | string[];
  pageOrigin?: string;
  ports?: number[];
}

export interface RenderWorkerHandoffBuildRequest {
  project: EditorProject;
  profileIds: string[];
  projectFilePath: string;
  exportRange: ExportRangeRequest;
  playhead: number;
  batchId?: string;
  workerCwd: string;
  workerExecutable: string;
  createdAt?: string;
}

export interface RenderWorkerControllerSubmitPlan {
  canSubmit: boolean;
  manifest?: RenderWorkerHandoffManifest;
  status: string;
}

export const DEFAULT_RENDER_WORKER_CENTRAL_TRUST_POLICY: RenderWorkerCentralTrustPolicy = {
  allowLocalhostWorkers: true,
  requireTrustedRemoteWorkers: true,
  requireRemotePairToken: true,
};

export function normalizeRenderWorkerDaemonUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return 'http://127.0.0.1:47683';
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export function buildRenderWorkerDaemonDiscoveryCandidates({
  daemonUrl = '',
  remoteDaemonUrls = '',
  pageOrigin,
  ports = [47683],
}: RenderWorkerDaemonDiscoveryRequest = {}): string[] {
  const remoteCandidates = parseRenderWorkerRemoteDaemonUrls(remoteDaemonUrls);
  const hosts = [
    readUrlHost(daemonUrl),
    readUrlHost(pageOrigin),
    '127.0.0.1',
    'localhost',
  ].filter((host): host is string => Boolean(host));
  const candidates = [
    daemonUrl,
    ...remoteCandidates,
    ...hosts.flatMap((host) => ports.map((port) => `http://${host}:${port}`)),
  ];
  const normalized = new Set<string>();

  for (const candidate of candidates) {
    if (!candidate.trim()) {
      continue;
    }

    normalized.add(normalizeRenderWorkerDaemonUrl(candidate));
  }

  if (normalized.size === 0) {
    normalized.add(normalizeRenderWorkerDaemonUrl(''));
  }

  return Array.from(normalized);
}

export function parseRenderWorkerRemoteDaemonUrls(value: string | string[] | undefined): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : (value ?? '').split(/[\s,;]+/g);
  const normalized = new Set<string>();

  for (const rawValue of rawValues) {
    const candidate = rawValue.trim();
    if (!candidate) {
      continue;
    }

    normalized.add(normalizeRenderWorkerDaemonUrl(candidate));
  }

  return Array.from(normalized);
}

export function buildRenderWorkerTrustedCandidateUrls(trustedWorkers: RenderWorkerTrustedDaemon[]): string[] {
  return Array.from(new Set(trustedWorkers.map((worker) => normalizeRenderWorkerDaemonUrl(worker.url))));
}

export function trustRenderWorkerDaemon(
  trustedWorkers: RenderWorkerTrustedDaemon[],
  status: RenderWorkerDaemonStatus,
  now = new Date().toISOString(),
): RenderWorkerTrustedDaemon[] {
  const normalizedUrl = normalizeRenderWorkerDaemonUrl(status.url);
  const existing = trustedWorkers.find((worker) => isTrustedRenderWorkerMatch(worker, status.workerId, normalizedUrl));
  const next: RenderWorkerTrustedDaemon = {
    workerId: status.workerId,
    url: normalizedUrl,
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
    authRequired: Boolean(status.authRequired),
    ...(status.discovery?.port ? { discoveryPort: status.discovery.port } : existing?.discoveryPort ? { discoveryPort: existing.discoveryPort } : {}),
  };
  const withoutExisting = trustedWorkers.filter((worker) => !isTrustedRenderWorkerMatch(worker, status.workerId, normalizedUrl));
  return [...withoutExisting, next].sort(compareTrustedRenderWorkers);
}

export function forgetTrustedRenderWorkerDaemon(
  trustedWorkers: RenderWorkerTrustedDaemon[],
  daemonUrl: string,
): RenderWorkerTrustedDaemon[] {
  const normalizedUrl = normalizeRenderWorkerDaemonUrl(daemonUrl);
  return trustedWorkers.filter((worker) => normalizeRenderWorkerDaemonUrl(worker.url) !== normalizedUrl);
}

export function isRenderWorkerDaemonTrusted(
  trustedWorkers: RenderWorkerTrustedDaemon[],
  status: RenderWorkerDaemonStatus,
): boolean {
  return trustedWorkers.some((worker) => isTrustedRenderWorkerMatch(worker, status.workerId, normalizeRenderWorkerDaemonUrl(status.url)));
}

export function evaluateRenderWorkerCentralTrustPolicy(
  status: RenderWorkerDaemonStatus,
  trustedWorkers: RenderWorkerTrustedDaemon[] = [],
  policy: RenderWorkerCentralTrustPolicy = DEFAULT_RENDER_WORKER_CENTRAL_TRUST_POLICY,
): RenderWorkerCentralTrustDecision {
  const url = normalizeRenderWorkerDaemonUrl(status.url);
  const origin = readUrlOrigin(url);
  const workerId = status.workerId;
  const local = isLocalRenderWorkerUrl(url);
  const trusted = isRenderWorkerDaemonTrusted(trustedWorkers, status);
  const warnings: string[] = [];

  const normalizedAllowedOrigins = normalizeOriginList(policy.allowedUrlOrigins);
  const normalizedBlockedOrigins = normalizeOriginList(policy.blockedUrlOrigins);
  const blockedWorkerIds = new Set(policy.blockedWorkerIds ?? []);
  const allowedWorkerIds = new Set(policy.allowedWorkerIds ?? []);

  if (blockedWorkerIds.has(workerId)) {
    return buildRenderWorkerTrustDecision({
      allowed: false,
      reason: `Worker ${workerId} is blocked by central trust policy.`,
      warnings,
      workerId,
      url,
      origin,
      local,
      trusted,
    });
  }

  if (normalizedBlockedOrigins.has(origin)) {
    return buildRenderWorkerTrustDecision({
      allowed: false,
      reason: `Worker origin ${origin} is blocked by central trust policy.`,
      warnings,
      workerId,
      url,
      origin,
      local,
      trusted,
    });
  }

  if (allowedWorkerIds.size > 0 && !allowedWorkerIds.has(workerId)) {
    return buildRenderWorkerTrustDecision({
      allowed: false,
      reason: `Worker ${workerId} is outside the central worker allowlist.`,
      warnings,
      workerId,
      url,
      origin,
      local,
      trusted,
    });
  }

  if (normalizedAllowedOrigins.size > 0 && !normalizedAllowedOrigins.has(origin)) {
    return buildRenderWorkerTrustDecision({
      allowed: false,
      reason: `Worker origin ${origin} is outside the central origin allowlist.`,
      warnings,
      workerId,
      url,
      origin,
      local,
      trusted,
    });
  }

  if (local) {
    if (!policy.allowLocalhostWorkers) {
      return buildRenderWorkerTrustDecision({
        allowed: false,
        reason: 'Localhost workers are disabled by central trust policy.',
        warnings,
        workerId,
        url,
        origin,
        local,
        trusted,
      });
    }

    if (!status.authRequired) {
      warnings.push('Local worker does not require a Pair token; keep it bound to localhost.');
    }

    return buildRenderWorkerTrustDecision({
      allowed: true,
      reason: trusted ? 'Local trusted worker allowed by central trust policy.' : 'Local worker allowed by central trust policy.',
      warnings,
      workerId,
      url,
      origin,
      local,
      trusted,
    });
  }

  if (policy.requireTrustedRemoteWorkers && !trusted) {
    return buildRenderWorkerTrustDecision({
      allowed: false,
      reason: `Remote worker ${workerId} must be enrolled with Trust before submission.`,
      warnings,
      workerId,
      url,
      origin,
      local,
      trusted,
    });
  }

  if (policy.requireRemotePairToken && !status.authRequired) {
    return buildRenderWorkerTrustDecision({
      allowed: false,
      reason: `Remote worker ${workerId} must require a Pair token.`,
      warnings,
      workerId,
      url,
      origin,
      local,
      trusted,
    });
  }

  return buildRenderWorkerTrustDecision({
    allowed: true,
    reason: trusted ? 'Remote trusted worker allowed by central trust policy.' : 'Remote worker allowed by central trust policy.',
    warnings,
    workerId,
    url,
    origin,
    local,
    trusted,
  });
}

export function buildRenderWorkerCentralTrustGovernanceSummary(
  statuses: RenderWorkerDaemonStatus[],
  trustedWorkers: RenderWorkerTrustedDaemon[] = [],
  policy: RenderWorkerCentralTrustPolicy = DEFAULT_RENDER_WORKER_CENTRAL_TRUST_POLICY,
): RenderWorkerCentralTrustGovernanceSummary {
  const decisions = dedupeRenderWorkerStatuses(statuses)
    .map((status) => evaluateRenderWorkerCentralTrustPolicy(status, trustedWorkers, policy));

  return {
    policy,
    totalWorkers: decisions.length,
    allowedWorkers: decisions.filter((decision) => decision.allowed).length,
    reviewWorkers: decisions.filter((decision) => decision.severity === 'review').length,
    blockedWorkers: decisions.filter((decision) => decision.severity === 'block').length,
    localWorkers: decisions.filter((decision) => decision.local).length,
    remoteWorkers: decisions.filter((decision) => !decision.local).length,
    trustedWorkers: decisions.filter((decision) => decision.trusted).length,
    decisions,
  };
}

export function formatRenderWorkerCentralTrustGovernanceSummary(summary: RenderWorkerCentralTrustGovernanceSummary): string {
  if (summary.totalWorkers === 0) {
    return 'Trust policy: no workers checked';
  }

  return `Trust policy: ${summary.allowedWorkers}/${summary.totalWorkers} allowed, ${summary.blockedWorkers} blocked, ${summary.trustedWorkers} trusted, ${summary.remoteWorkers} remote`;
}

export function filterRenderWorkerDaemonsByCentralTrustPolicy(
  statuses: RenderWorkerDaemonStatus[],
  trustedWorkers: RenderWorkerTrustedDaemon[] = [],
  policy: RenderWorkerCentralTrustPolicy = DEFAULT_RENDER_WORKER_CENTRAL_TRUST_POLICY,
): RenderWorkerDaemonStatus[] {
  return statuses.filter((status) => evaluateRenderWorkerCentralTrustPolicy(status, trustedWorkers, policy).allowed);
}

export function readTrustedRenderWorkers(storage = getDefaultTrustStorage()): RenderWorkerTrustedDaemon[] {
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(RENDER_WORKER_TRUST_STORE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeTrustedRenderWorker)
      .filter((worker): worker is RenderWorkerTrustedDaemon => Boolean(worker))
      .sort(compareTrustedRenderWorkers);
  } catch {
    return [];
  }
}

export function writeTrustedRenderWorkers(
  trustedWorkers: RenderWorkerTrustedDaemon[],
  storage = getDefaultTrustStorage(),
): RenderWorkerTrustedDaemon[] {
  const normalized = trustedWorkers
    .map(normalizeTrustedRenderWorker)
    .filter((worker): worker is RenderWorkerTrustedDaemon => Boolean(worker))
    .sort(compareTrustedRenderWorkers);

  if (storage) {
    if (normalized.length === 0) {
      storage.removeItem(RENDER_WORKER_TRUST_STORE_KEY);
    } else {
      storage.setItem(RENDER_WORKER_TRUST_STORE_KEY, JSON.stringify(normalized));
    }
  }

  return normalized;
}

export function buildRenderWorkerControllerHandoff({
  project,
  profileIds,
  projectFilePath,
  exportRange,
  playhead,
  batchId = String(Date.now()),
  workerCwd,
  workerExecutable,
  createdAt = new Date().toISOString(),
}: RenderWorkerHandoffBuildRequest): RenderWorkerControllerSubmitPlan {
  const validProfiles = profileIds
    .map((profileId) => project.exportProfiles.find((profile) => profile.id === profileId))
    .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile));

  if (validProfiles.length === 0) {
    return {
      canSubmit: false,
      status: 'Render worker handoff blocked: no valid export profiles selected.',
    };
  }

  if (!projectFilePath.trim()) {
    return {
      canSubmit: false,
      status: 'Render worker handoff blocked: export a portable project package first.',
    };
  }

  const jobs: RenderWorkerHandoffJob[] = validProfiles.map((profile) => {
    const outputFilename = buildBatchRenderOutputFilename(project, profile.id, batchId);
    const outputPath = `renders/${outputFilename}`;
    const plan = buildFfmpegRenderPlan(project, profile.id, outputPath, {
      encoderPreference: 'auto',
      exportRange,
    });
    const preflight = buildRenderPreflightReport(project, profile.id, {
      exportRange,
      playhead,
      plan,
    });

    return {
      id: `${sanitizeId(batchId)}-${sanitizeId(profile.id)}`,
      profileId: profile.id,
      profileLabel: profile.label,
      outputFilename,
      outputPath,
      encoderPreference: 'auto',
      ...(exportRange ? { exportRange } : {}),
      preflightStatus: preflight.status,
      blocked: preflight.blockedCount > 0,
      warningCount: preflight.warningCount,
      blockedCount: preflight.blockedCount,
      issues: preflight.issues.map((issue) => ({
        severity: issue.severity,
        source: issue.source,
        message: issue.message,
        action: issue.action,
      })),
      commandText: plan.commandText,
      ffmpegCommand: plan.command,
      workerCommand: buildHeadlessRenderWorkerCommand({
        executable: workerExecutable,
        cwd: workerCwd,
        projectFilePath,
        profileId: profile.id,
        outputPath,
        batchId,
      }),
    };
  });
  const blockedJobs = jobs.filter((job) => job.blocked).length;
  const warningJobs = jobs.filter((job) => !job.blocked && job.warningCount > 0).length;

  return {
    canSubmit: true,
    manifest: {
      schemaVersion: RENDER_WORKER_HANDOFF_SCHEMA_VERSION,
      kind: RENDER_WORKER_HANDOFF_KIND,
      createdAt,
      batchId,
      controller: {
        protocol: 'headless-render-v1',
        mode: 'local-network-handoff',
      },
      project: {
        id: project.id,
        name: project.name,
        schemaVersion: project.schemaVersion,
        duration: project.duration,
        fps: project.fps,
        width: project.width,
        height: project.height,
        projectPath: projectFilePath,
      },
      summary: {
        totalJobs: jobs.length,
        blockedJobs,
        warningJobs,
        readyJobs: jobs.length - blockedJobs - warningJobs,
      },
      jobs,
    },
    status: `Prepared ${jobs.length} render worker job${jobs.length === 1 ? '' : 's'} (${blockedJobs} blocked, ${warningJobs} warning).`,
  };
}

export function formatRenderWorkerDaemonStatus(status: RenderWorkerDaemonStatus | null): string {
  if (!status) {
    return 'Not checked';
  }

  return `${status.workerId} / running ${status.runningRuns ?? 0} / queued ${status.queuedRuns ?? 0} / cap ${status.maxConcurrentRuns ?? 1} / completed ${status.completedRuns} / failed ${status.failedRuns}`;
}

export function formatRenderWorkerFleetStatus(statuses: RenderWorkerDaemonStatus[]): string {
  if (statuses.length === 0) {
    return 'No workers discovered';
  }

  const activeRuns = statuses.reduce((sum, status) => sum + status.activeRuns, 0);
  const runningRuns = statuses.reduce((sum, status) => sum + (status.runningRuns ?? 0), 0);
  const queuedRuns = statuses.reduce((sum, status) => sum + (status.queuedRuns ?? 0), 0);
  const capacity = statuses.reduce((sum, status) => sum + (status.maxConcurrentRuns ?? 1), 0);
  const completedRuns = statuses.reduce((sum, status) => sum + status.completedRuns, 0);
  const failedRuns = statuses.reduce((sum, status) => sum + status.failedRuns, 0);
  return `${statuses.length} worker${statuses.length === 1 ? '' : 's'} / running ${runningRuns} / queued ${queuedRuns} / cap ${capacity} / active ${activeRuns} / completed ${completedRuns} / failed ${failedRuns}`;
}

export function selectRenderWorkerDaemonForHandoff(
  statuses: RenderWorkerDaemonStatus[],
  currentDaemonUrl = '',
  options: RenderWorkerDaemonRouteOptions = {},
): RenderWorkerDaemonStatus | undefined {
  const currentUrl = normalizeRenderWorkerDaemonUrl(currentDaemonUrl);
  const candidates = options.trustedWorkers
    ? filterRenderWorkerDaemonsByCentralTrustPolicy(statuses, options.trustedWorkers, options.trustPolicy)
    : statuses;
  return [...candidates].sort((a, b) => compareRenderWorkerRoute(a, b, currentUrl))[0];
}

export function formatRenderWorkerRunStatus(run: RenderWorkerDaemonRunRecord | null): string {
  if (!run) {
    return 'No worker run submitted';
  }

  const summary = run.report?.summary ?? run.progress;
  if (!summary) {
    return `${run.id}: ${run.status}`;
  }

  const pendingText = 'pendingJobs' in summary ? ` / pending ${summary.pendingJobs}` : '';
  const runningText = 'runningJobs' in summary ? ` / running ${summary.runningJobs}` : '';
  return `${run.id}: ${run.status}${runningText}${pendingText} / completed ${summary.completedJobs} / planned ${summary.plannedJobs} / blocked ${summary.blockedJobs} / failed ${summary.failedJobs}`;
}

export function shouldPollRenderWorkerRun(run: RenderWorkerDaemonRunRecord | null): run is RenderWorkerDaemonRunRecord {
  return Boolean(run && (run.status === 'queued' || run.status === 'running'));
}

function buildHeadlessRenderWorkerCommand({
  executable,
  cwd,
  projectFilePath,
  profileId,
  outputPath,
  batchId,
}: {
  executable: string;
  cwd: string;
  projectFilePath: string;
  profileId: string;
  outputPath: string;
  batchId: string;
}): RenderWorkerHandoffCommand {
  return {
    executable: executable.trim() || defaultNpmExecutable(),
    cwd: cwd.trim() || '.',
    args: [
      'run',
      'editor:headless-render',
      '--',
      '--project',
      projectFilePath,
      '--profile',
      profileId,
      '--out-dir',
      dirname(outputPath),
      '--batch-id',
      batchId,
      '--encoder',
      'auto',
    ],
  };
}

function defaultNpmExecutable(): string {
  return typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent) ? 'npm.cmd' : 'npm';
}

function dirname(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index > 0 ? normalized.slice(0, index) : '.';
}

function sanitizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'job';
}

function compareRenderWorkerRoute(
  a: RenderWorkerDaemonStatus,
  b: RenderWorkerDaemonStatus,
  currentUrl: string,
): number {
  const scoreA = buildRenderWorkerRouteScore(a, currentUrl);
  const scoreB = buildRenderWorkerRouteScore(b, currentUrl);
  return scoreB.openReady - scoreA.openReady
    || scoreA.loadRatio - scoreB.loadRatio
    || scoreA.queuedRuns - scoreB.queuedRuns
    || scoreA.runningRuns - scoreB.runningRuns
    || scoreB.capacity - scoreA.capacity
    || scoreB.isCurrent - scoreA.isCurrent
    || a.workerId.localeCompare(b.workerId)
    || normalizeRenderWorkerDaemonUrl(a.url).localeCompare(normalizeRenderWorkerDaemonUrl(b.url));
}

function buildRenderWorkerRouteScore(status: RenderWorkerDaemonStatus, currentUrl: string) {
  const capacity = Math.max(1, Math.floor(status.maxConcurrentRuns ?? 1));
  const runningRuns = Math.max(0, Math.floor(status.runningRuns ?? 0));
  const queuedRuns = Math.max(0, Math.floor(status.queuedRuns ?? 0));
  const openSlots = Math.max(0, capacity - runningRuns);
  return {
    capacity,
    runningRuns,
    queuedRuns,
    openReady: openSlots > 0 && queuedRuns === 0 ? 1 : 0,
    loadRatio: (runningRuns + queuedRuns) / capacity,
    isCurrent: normalizeRenderWorkerDaemonUrl(status.url) === currentUrl ? 1 : 0,
  };
}

function readUrlHost(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  try {
    return new URL(normalizeRenderWorkerDaemonUrl(value)).hostname || undefined;
  } catch {
    return undefined;
  }
}

function readUrlOrigin(value: string): string {
  try {
    return new URL(normalizeRenderWorkerDaemonUrl(value)).origin;
  } catch {
    return normalizeRenderWorkerDaemonUrl(value);
  }
}

function normalizeOriginList(values: string[] | undefined): Set<string> {
  return new Set((values ?? [])
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => readUrlOrigin(value)));
}

function isLocalRenderWorkerUrl(value: string): boolean {
  const host = readUrlHost(value)?.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

function buildRenderWorkerTrustDecision({
  allowed,
  reason,
  warnings,
  workerId,
  url,
  origin,
  local,
  trusted,
}: {
  allowed: boolean;
  reason: string;
  warnings: string[];
  workerId: string;
  url: string;
  origin: string;
  local: boolean;
  trusted: boolean;
}): RenderWorkerCentralTrustDecision {
  return {
    allowed,
    severity: allowed ? warnings.length > 0 ? 'review' : 'allow' : 'block',
    reason,
    warnings,
    workerId,
    url,
    origin,
    local,
    trusted,
  };
}

function dedupeRenderWorkerStatuses(statuses: RenderWorkerDaemonStatus[]): RenderWorkerDaemonStatus[] {
  const byUrl = new Map<string, RenderWorkerDaemonStatus>();
  for (const status of statuses) {
    byUrl.set(normalizeRenderWorkerDaemonUrl(status.url), status);
  }

  return Array.from(byUrl.values());
}

function normalizeTrustedRenderWorker(value: unknown): RenderWorkerTrustedDaemon | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Partial<RenderWorkerTrustedDaemon>;
  if (typeof record.workerId !== 'string' || !record.workerId.trim() || typeof record.url !== 'string' || !record.url.trim()) {
    return undefined;
  }

  const firstSeenAt = typeof record.firstSeenAt === 'string' && record.firstSeenAt.trim()
    ? record.firstSeenAt
    : new Date(0).toISOString();
  const lastSeenAt = typeof record.lastSeenAt === 'string' && record.lastSeenAt.trim()
    ? record.lastSeenAt
    : firstSeenAt;
  const discoveryPort = Number.isInteger(record.discoveryPort) && record.discoveryPort! > 0 && record.discoveryPort! <= 65535
    ? record.discoveryPort
    : undefined;

  return {
    workerId: record.workerId.trim(),
    url: normalizeRenderWorkerDaemonUrl(record.url),
    firstSeenAt,
    lastSeenAt,
    authRequired: Boolean(record.authRequired),
    ...(discoveryPort ? { discoveryPort } : {}),
  };
}

function isTrustedRenderWorkerMatch(worker: RenderWorkerTrustedDaemon, workerId: string, normalizedUrl: string): boolean {
  return worker.workerId === workerId && normalizeRenderWorkerDaemonUrl(worker.url) === normalizedUrl;
}

function compareTrustedRenderWorkers(a: RenderWorkerTrustedDaemon, b: RenderWorkerTrustedDaemon): number {
  return b.lastSeenAt.localeCompare(a.lastSeenAt)
    || a.workerId.localeCompare(b.workerId)
    || normalizeRenderWorkerDaemonUrl(a.url).localeCompare(normalizeRenderWorkerDaemonUrl(b.url));
}

function getDefaultTrustStorage(): RenderWorkerTrustStorage | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage;
}
