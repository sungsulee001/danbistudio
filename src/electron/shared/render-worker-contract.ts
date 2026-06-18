export const RENDER_WORKER_HANDOFF_SCHEMA_VERSION = 1;
export const RENDER_WORKER_HANDOFF_KIND = 'danbi.render-worker-handoff';
export const RENDER_WORKER_RUN_REPORT_KIND = 'danbi.render-worker-run-report';
export const RENDER_WORKER_DAEMON_STATUS_KIND = 'danbi.render-worker-daemon-status';
export const RENDER_WORKER_DAEMON_RUN_EVENT_KIND = 'danbi.render-worker-daemon-run-event';
export const RENDER_WORKER_DAEMON_FLEET_EVENT_KIND = 'danbi.render-worker-daemon-fleet-event';
export const RENDER_WORKER_DISCOVERY_SCHEMA_VERSION = 1;
export const RENDER_WORKER_DISCOVERY_PROBE_KIND = 'danbi.render-worker-discovery-probe';
export const RENDER_WORKER_DISCOVERY_ANNOUNCEMENT_KIND = 'danbi.render-worker-discovery-announcement';

export interface RenderWorkerHandoffCommand {
  executable: string;
  args: string[];
  cwd: string;
}

export interface RenderWorkerHandoffJob {
  id: string;
  profileId: string;
  profileLabel: string;
  outputFilename: string;
  outputPath: string;
  encoderPreference: string;
  exportRange?: {
    start: number;
    end: number;
  };
  preflightStatus: 'ready' | 'warning' | 'blocked';
  blocked: boolean;
  warningCount: number;
  blockedCount: number;
  issues: Array<{
    severity: 'blocked' | 'warning';
    source: string;
    message: string;
    action: string;
  }>;
  commandText: string;
  ffmpegCommand: string[];
  workerCommand?: RenderWorkerHandoffCommand;
  extensionHooks?: unknown;
}

export interface RenderWorkerHandoffManifest {
  schemaVersion: typeof RENDER_WORKER_HANDOFF_SCHEMA_VERSION;
  kind: typeof RENDER_WORKER_HANDOFF_KIND;
  createdAt: string;
  batchId: string;
  controller: {
    protocol: 'headless-render-v1';
    mode: 'local-network-handoff';
  };
  project: {
    id: string;
    name: string;
    schemaVersion: number;
    duration: number;
    fps: number;
    width: number;
    height: number;
    projectPath?: string;
  };
  summary: {
    totalJobs: number;
    blockedJobs: number;
    warningJobs: number;
    readyJobs: number;
  };
  jobs: RenderWorkerHandoffJob[];
}

export type RenderWorkerJobStatus = 'planned' | 'running' | 'completed' | 'blocked' | 'skipped' | 'failed';

export interface RenderWorkerJobReport {
  jobId: string;
  profileId: string;
  profileLabel: string;
  outputPath: string;
  status: RenderWorkerJobStatus;
  commandText: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  stdoutTail?: string;
  stderrTail?: string;
  error?: string;
}

export interface RenderWorkerRunReport {
  schemaVersion: 1;
  kind: typeof RENDER_WORKER_RUN_REPORT_KIND;
  workerId: string;
  sourceManifestKind: string;
  sourceBatchId: string;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  summary: {
    totalJobs: number;
    plannedJobs: number;
    completedJobs: number;
    blockedJobs: number;
    skippedJobs: number;
    failedJobs: number;
  };
  jobs: RenderWorkerJobReport[];
}

export interface RenderWorkerRunProgress {
  updatedAt: string;
  totalJobs: number;
  pendingJobs: number;
  runningJobs: number;
  plannedJobs: number;
  completedJobs: number;
  blockedJobs: number;
  skippedJobs: number;
  failedJobs: number;
  jobs: RenderWorkerJobReport[];
}

export type RenderWorkerDaemonRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface RenderWorkerDaemonRunLease {
  workerId: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
}

export interface RenderWorkerDaemonRunRecord {
  id: string;
  status: RenderWorkerDaemonRunStatus;
  submittedAt: string;
  dryRun: boolean;
  executeBlocked: boolean;
  jobIds: string[];
  sourceBatchId?: string;
  startedAt?: string;
  finishedAt?: string;
  progress?: RenderWorkerRunProgress;
  report?: RenderWorkerRunReport;
  lease?: RenderWorkerDaemonRunLease;
  error?: string;
}

export type RenderWorkerDaemonRunEventType = 'snapshot' | 'progress' | 'completed' | 'failed';

export interface RenderWorkerDaemonRunEvent {
  kind: typeof RENDER_WORKER_DAEMON_RUN_EVENT_KIND;
  type: RenderWorkerDaemonRunEventType;
  emittedAt: string;
  run: RenderWorkerDaemonRunRecord;
}

export type RenderWorkerDaemonFleetEventType = 'snapshot' | 'status' | 'run-progress' | 'run-completed' | 'run-failed';

export interface RenderWorkerDaemonFleetEvent {
  kind: typeof RENDER_WORKER_DAEMON_FLEET_EVENT_KIND;
  type: RenderWorkerDaemonFleetEventType;
  emittedAt: string;
  status: RenderWorkerDaemonStatus;
  run?: RenderWorkerDaemonRunRecord;
}

export interface RenderWorkerDaemonRunSummary {
  id: string;
  status: RenderWorkerDaemonRunStatus;
  submittedAt: string;
  dryRun: boolean;
  executeBlocked: boolean;
  jobIds: string[];
  sourceBatchId?: string;
  startedAt?: string;
  finishedAt?: string;
  lease?: RenderWorkerDaemonRunLease;
  totalJobs?: number;
  pendingJobs?: number;
  runningJobs?: number;
  plannedJobs?: number;
  completedJobs?: number;
  blockedJobs?: number;
  skippedJobs?: number;
  failedJobs?: number;
  error?: string;
}

export interface RenderWorkerDaemonHealth {
  kind: 'danbi.render-worker-daemon-health';
  ok: true;
  workerId: string;
  startedAt: string;
  authRequired?: boolean;
}

export interface RenderWorkerDaemonStatus {
  kind: typeof RENDER_WORKER_DAEMON_STATUS_KIND;
  workerId: string;
  host: string;
  port: number;
  url: string;
  startedAt: string;
  authRequired?: boolean;
  discovery?: {
    enabled: boolean;
    port: number;
  };
  activeRuns: number;
  queuedRuns: number;
  runningRuns: number;
  maxConcurrentRuns: number;
  completedRuns: number;
  failedRuns: number;
  runs: RenderWorkerDaemonRunSummary[];
}

export interface RenderWorkerDiscoveryProbe {
  schemaVersion: typeof RENDER_WORKER_DISCOVERY_SCHEMA_VERSION;
  kind: typeof RENDER_WORKER_DISCOVERY_PROBE_KIND;
  probeId: string;
}

export interface RenderWorkerDiscoveryAnnouncement {
  schemaVersion: typeof RENDER_WORKER_DISCOVERY_SCHEMA_VERSION;
  kind: typeof RENDER_WORKER_DISCOVERY_ANNOUNCEMENT_KIND;
  probeId: string;
  workerId: string;
  host: string;
  port: number;
  url: string;
  startedAt: string;
  authRequired: boolean;
  discoveryPort: number;
}

export interface RenderWorkerDaemonSubmitRequest {
  manifest: RenderWorkerHandoffManifest;
  runId?: string;
  jobIds?: string[];
  dryRun?: boolean;
  executeBlocked?: boolean;
}

export interface RenderWorkerDaemonSubmitResponse {
  kind: 'danbi.render-worker-daemon-submit';
  runId: string;
  status: RenderWorkerDaemonRunStatus;
  statusUrl: string;
}
