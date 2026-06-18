import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { connect } from 'node:net';
import {
  formatRenderWorkerDaemonHelp,
  isFetchBlockedRenderWorkerDaemonPort,
  parseRenderWorkerDaemonCliArgs,
  startRenderWorkerDaemon,
  type RenderWorkerDaemonRunRecord,
} from '../../src/electron/main/render-worker-daemon';
import { discoverRenderWorkerDaemonAnnouncements } from '../../src/electron/main/render-worker-discovery';
import {
  RENDER_WORKER_HANDOFF_KIND,
  RENDER_WORKER_HANDOFF_SCHEMA_VERSION,
  type RenderWorkerHandoffManifest,
} from '../../src/electron/main/render-worker-handoff';
import {
  discoverRenderWorkerDaemon,
  discoverRenderWorkerDaemons,
  fetchRenderWorkerDaemonRun,
  fetchRenderWorkerDaemonStatus,
  submitRenderWorkerDaemonRun,
} from '../../src/electron/renderer/render-worker-client';
import type { RenderWorkerDaemonFleetEvent, RenderWorkerDaemonRunEvent } from '../../src/electron/shared/render-worker-contract';

describe('render worker daemon', () => {
  it('parses daemon CLI options', () => {
    const options = parseRenderWorkerDaemonCliArgs([
      '--host',
      '0.0.0.0',
      '--port',
      '49123',
      '--worker-id',
      'node-a',
      '--dry-run',
      '--execute-blocked',
      '--max-runs',
      '2',
      '--lease-seconds',
      '120',
      '--auth-token',
      'pairing-token',
      '--discovery',
      '--discovery-port',
      '49124',
    ]);

    expect(options).toMatchObject({
      host: '0.0.0.0',
      port: 49123,
      workerId: 'node-a',
      dryRun: true,
      executeBlocked: true,
      maxConcurrentRuns: 2,
      runLeaseSeconds: 120,
      authToken: 'pairing-token',
      discovery: true,
      discoveryPort: 49124,
    });
    expect(formatRenderWorkerDaemonHelp()).toContain('editor:render-worker-daemon');
    expect(formatRenderWorkerDaemonHelp()).toContain('--discovery');
  });

  it('keeps daemon HTTP ports compatible with Fetch clients', () => {
    expect(isFetchBlockedRenderWorkerDaemonPort(6000)).toBe(true);
    expect(isFetchBlockedRenderWorkerDaemonPort(6667)).toBe(true);
    expect(isFetchBlockedRenderWorkerDaemonPort(49123)).toBe(false);
  });

  it('requires a pairing token for protected daemon endpoints when auth is enabled', async () => {
    const daemon = await startRenderWorkerDaemon({
      host: '127.0.0.1',
      port: 0,
      workerId: 'daemon-auth',
      dryRun: true,
      authToken: 'secret-token',
      now: createClock(),
    });

    try {
      const health = await readJson<{ ok: boolean; authRequired: boolean; workerId: string }>(`${daemon.url}/health`);
      expect(health).toMatchObject({
        ok: true,
        workerId: 'daemon-auth',
        authRequired: true,
      });

      const unauthorizedStatus = await fetch(`${daemon.url}/status`);
      expect(unauthorizedStatus.status).toBe(401);

      const failedDiscovery = await discoverRenderWorkerDaemon({
        candidates: [daemon.url],
        timeoutMs: 1000,
      });
      expect(failedDiscovery.found).toBe(false);
      expect(failedDiscovery.attempts[0]).toMatchObject({
        ok: false,
      });

      const daemonStatus = await fetchRenderWorkerDaemonStatus(daemon.url, {
        authToken: 'secret-token',
      });
      expect(daemonStatus).toMatchObject({
        workerId: 'daemon-auth',
        authRequired: true,
      });

      const discovery = await discoverRenderWorkerDaemon({
        candidates: [daemon.url],
        timeoutMs: 1000,
        authToken: 'secret-token',
      });
      expect(discovery.found).toBe(true);
      expect(discovery.status?.workerId).toBe('daemon-auth');

      const accepted = await submitRenderWorkerDaemonRun(daemon.url, {
        runId: 'authed-render',
        manifest: buildDaemonManifest(),
      }, {
        authToken: 'secret-token',
      });
      expect(accepted.statusUrl).toBe(`${daemon.url}/runs/authed-render`);

      const unauthorizedRun = await fetch(`${daemon.url}/runs/authed-render`);
      expect(unauthorizedRun.status).toBe(401);

      const completedRun = await waitForAuthedRun(daemon.url, 'authed-render', {
        authToken: 'secret-token',
      });
      expect(completedRun).toMatchObject({
        id: 'authed-render',
        status: 'completed',
      });
    } finally {
      await daemon.close();
    }
  });

  it('accepts handoff manifests and publishes dry-run reports over HTTP', async () => {
    const daemon = await startRenderWorkerDaemon({
      host: '127.0.0.1',
      port: 0,
      workerId: 'daemon-test',
      dryRun: true,
      now: createClock(),
    });

    try {
      const health = await readJson<{ ok: boolean; workerId: string }>(`${daemon.url}/health`);
      expect(health).toMatchObject({
        ok: true,
        workerId: 'daemon-test',
      });

      const submitResponse = await fetch(`${daemon.url}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: 'daily-handoff',
          manifest: buildDaemonManifest(),
        }),
      });
      expect(submitResponse.status).toBe(202);
      const accepted = await submitResponse.json() as { runId: string; statusUrl: string };
      expect(accepted).toMatchObject({
        runId: 'daily-handoff',
        statusUrl: `${daemon.url}/runs/daily-handoff`,
      });

      const run = await waitForCompletedRun(accepted.statusUrl);
      expect(run).toMatchObject({
        id: 'daily-handoff',
        status: 'completed',
        dryRun: true,
        sourceBatchId: 'daily',
      });
      expect(run.report?.summary).toMatchObject({
        totalJobs: 2,
        plannedJobs: 1,
        blockedJobs: 1,
        failedJobs: 0,
      });

      const status = await readJson<{ activeRuns: number; queuedRuns: number; runningRuns: number; maxConcurrentRuns: number; completedRuns: number; runs: Array<{ id: string; plannedJobs?: number }> }>(`${daemon.url}/status`);
      expect(status.activeRuns).toBe(0);
      expect(status.queuedRuns).toBe(0);
      expect(status.runningRuns).toBe(0);
      expect(status.maxConcurrentRuns).toBe(1);
      expect(status.completedRuns).toBe(1);
      expect(status.runs[0]).toMatchObject({
        id: 'daily-handoff',
        plannedJobs: 1,
      });
    } finally {
      await daemon.close();
    }
  });

  it('discovers a running daemon by probing status candidates', async () => {
    const daemon = await startRenderWorkerDaemon({
      host: '127.0.0.1',
      port: 0,
      workerId: 'daemon-discovery',
      dryRun: true,
      now: createClock(),
    });

    try {
      const discovery = await discoverRenderWorkerDaemon({
        candidates: [daemon.url],
        timeoutMs: 1000,
      });

      expect(discovery).toMatchObject({
        found: true,
        url: daemon.url,
        status: {
          workerId: 'daemon-discovery',
          activeRuns: 0,
        },
      });
      expect(discovery.attempts).toEqual([
        {
          url: daemon.url,
          ok: true,
          workerId: 'daemon-discovery',
        },
      ]);
    } finally {
      await daemon.close();
    }
  });

  it('discovers multiple daemon workers as a local fleet', async () => {
    const daemonA = await startRenderWorkerDaemon({
      host: '127.0.0.1',
      port: 0,
      workerId: 'daemon-fleet-a',
      dryRun: true,
      now: createClock(),
    });
    const daemonB = await startRenderWorkerDaemon({
      host: '127.0.0.1',
      port: 0,
      workerId: 'daemon-fleet-b',
      dryRun: true,
      now: createClock(),
    });

    try {
      const discovery = await discoverRenderWorkerDaemons({
        candidates: [daemonB.url, daemonA.url],
        timeoutMs: 1000,
      });

      expect(discovery.found).toBe(true);
      expect(discovery.statuses.map((status) => status.workerId)).toEqual([
        'daemon-fleet-a',
        'daemon-fleet-b',
      ]);
      expect(discovery.statuses.map((status) => status.url).sort()).toEqual([daemonA.url, daemonB.url].sort());
      expect(discovery.attempts.filter((attempt) => attempt.ok)).toHaveLength(2);
    } finally {
      await daemonA.close();
      await daemonB.close();
    }
  });

  it('advertises zero-config LAN discovery without exposing the pair token', async () => {
    const daemon = await startRenderWorkerDaemon({
      host: '127.0.0.1',
      port: 0,
      workerId: 'daemon-lan-discovery',
      dryRun: true,
      authToken: 'secret-token',
      discovery: true,
      discoveryPort: 0,
      now: createClock(),
    });

    try {
      const status = daemon.snapshot();
      expect(status.discovery).toMatchObject({
        enabled: true,
      });
      expect(status.discovery?.port).toBeGreaterThan(0);

      const lan = await discoverRenderWorkerDaemonAnnouncements({
        port: status.discovery?.port,
        timeoutMs: 150,
        broadcastAddresses: ['127.0.0.1'],
      });
      expect(lan.warnings).toEqual([]);
      expect(lan.candidates).toEqual([daemon.url]);
      expect(lan.announcements[0]).toMatchObject({
        kind: 'danbi.render-worker-discovery-announcement',
        workerId: 'daemon-lan-discovery',
        url: daemon.url,
        authRequired: true,
        port: status.port,
        discoveryPort: status.discovery?.port,
      });
      expect(JSON.stringify(lan)).not.toContain('secret-token');

      const discovery = await discoverRenderWorkerDaemons({
        candidates: lan.candidates,
        timeoutMs: 1000,
        authToken: 'secret-token',
      });
      expect(discovery.found).toBe(true);
      expect(discovery.statuses[0]?.workerId).toBe('daemon-lan-discovery');
    } finally {
      await daemon.close();
    }
  });

  it('executes selected daemon jobs with an injected command executor', async () => {
    const executedCommands: string[] = [];
    const daemon = await startRenderWorkerDaemon({
      host: '127.0.0.1',
      port: 0,
      workerId: 'daemon-execute',
      now: createClock(),
      executeCommand: async (command) => {
        executedCommands.push(`${command.executable} ${command.args.join(' ')}`);
        return { exitCode: 0, stdout: 'done', stderr: '' };
      },
    });

    try {
      const submitResponse = await fetch(`${daemon.url}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: 'selected-render',
          jobIds: ['daily-ready'],
          manifest: buildDaemonManifest(),
        }),
      });
      expect(submitResponse.status).toBe(202);
      const accepted = await submitResponse.json() as { statusUrl: string };
      const run = await waitForCompletedRun(accepted.statusUrl);

      expect(executedCommands).toEqual([
        'node -e console.log("render")',
      ]);
      expect(run.report?.summary).toMatchObject({
        completedJobs: 1,
        skippedJobs: 1,
        failedJobs: 0,
      });
      expect(run.report?.jobs[0]).toMatchObject({
        jobId: 'daily-ready',
        status: 'completed',
        stdoutTail: 'done',
      });
    } finally {
      await daemon.close();
    }
  });

  it('publishes live progress while a worker command is running', async () => {
    let resolveCommand: ((value: { exitCode: number; stdout: string; stderr: string }) => void) | undefined;
    let started = false;
    const daemon = await startRenderWorkerDaemon({
      host: '127.0.0.1',
      port: 0,
      workerId: 'daemon-progress',
      now: createClock(),
      executeCommand: async () => {
        started = true;
        return await new Promise((resolve) => {
          resolveCommand = resolve;
        });
      },
    });

    try {
      const submitResponse = await fetch(`${daemon.url}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: 'progress-render',
          jobIds: ['daily-ready'],
          manifest: buildDaemonManifest(),
        }),
      });
      expect(submitResponse.status).toBe(202);
      const accepted = await submitResponse.json() as { statusUrl: string };
      const runningRun = await waitForRun(accepted.statusUrl, (run) => Boolean(run.progress?.runningJobs));

      expect(started).toBe(true);
      expect(runningRun).toMatchObject({
        id: 'progress-render',
        status: 'running',
      });
      expect(runningRun.progress).toMatchObject({
        totalJobs: 2,
        pendingJobs: 1,
        runningJobs: 1,
        completedJobs: 0,
      });
      expect(runningRun.progress?.jobs[0]).toMatchObject({
        jobId: 'daily-ready',
        status: 'running',
      });

      resolveCommand?.({ exitCode: 0, stdout: 'ok', stderr: '' });
      const completedRun = await waitForCompletedRun(accepted.statusUrl);
      expect(completedRun.report?.summary).toMatchObject({
        completedJobs: 1,
        skippedJobs: 1,
      });
    } finally {
      resolveCommand?.({ exitCode: 1, stdout: '', stderr: 'closed' });
      await daemon.close();
    }
  });

  it('queues submitted runs behind the daemon capacity and leases the running slot', async () => {
    let resolveFirstCommand: ((value: { exitCode: number; stdout: string; stderr: string }) => void) | undefined;
    let resolveSecondCommand: ((value: { exitCode: number; stdout: string; stderr: string }) => void) | undefined;
    let commandCount = 0;
    const daemon = await startRenderWorkerDaemon({
      host: '127.0.0.1',
      port: 0,
      workerId: 'daemon-scheduler',
      maxConcurrentRuns: 1,
      runLeaseSeconds: 30,
      now: createClock(),
      executeCommand: async () => {
        commandCount += 1;
        if (commandCount === 1) {
          return await new Promise((resolve) => {
            resolveFirstCommand = resolve;
          });
        }

        return await new Promise((resolve) => {
          resolveSecondCommand = resolve;
        });
      },
    });

    try {
      await submitDaemonRunRequest(daemon.url, 'scheduled-a');
      await submitDaemonRunRequest(daemon.url, 'scheduled-b');

      const queuedStatus = await waitForDaemonStatus(daemon.url, (status) => status.runningRuns === 1 && status.queuedRuns === 1);
      expect(queuedStatus).toMatchObject({
        activeRuns: 2,
        runningRuns: 1,
        queuedRuns: 1,
        maxConcurrentRuns: 1,
      });
      expect(queuedStatus.runs.find((run) => run.id === 'scheduled-a')).toMatchObject({
        status: 'running',
        lease: {
          workerId: 'daemon-scheduler',
        },
      });
      expect(queuedStatus.runs.find((run) => run.id === 'scheduled-b')).toMatchObject({
        status: 'queued',
      });
      expect(queuedStatus.runs.find((run) => run.id === 'scheduled-b')?.lease).toBeUndefined();

      resolveFirstCommand?.({ exitCode: 0, stdout: 'first', stderr: '' });
      const secondRunning = await waitForDaemonStatus(daemon.url, (status) => (
        status.runningRuns === 1 &&
        status.queuedRuns === 0 &&
        status.runs.some((run) => run.id === 'scheduled-b' && run.status === 'running')
      ));
      expect(secondRunning.runs.find((run) => run.id === 'scheduled-b')?.lease).toMatchObject({
        workerId: 'daemon-scheduler',
      });

      resolveSecondCommand?.({ exitCode: 0, stdout: 'second', stderr: '' });
      const completedStatus = await waitForDaemonStatus(daemon.url, (status) => status.completedRuns === 2);
      expect(completedStatus).toMatchObject({
        activeRuns: 0,
        queuedRuns: 0,
        runningRuns: 0,
        completedRuns: 2,
      });
    } finally {
      resolveFirstCommand?.({ exitCode: 1, stdout: '', stderr: 'closed' });
      resolveSecondCommand?.({ exitCode: 1, stdout: '', stderr: 'closed' });
      await daemon.close();
    }
  });

  it('streams run snapshots, progress, and completion over server-sent events', async () => {
    let resolveCommand: ((value: { exitCode: number; stdout: string; stderr: string }) => void) | undefined;
    const daemon = await startRenderWorkerDaemon({
      host: '127.0.0.1',
      port: 0,
      workerId: 'daemon-sse',
      now: createClock(),
      executeCommand: async () => {
        return await new Promise((resolve) => {
          resolveCommand = resolve;
        });
      },
    });

    let eventStream: SseTestStream<RenderWorkerDaemonRunEvent> | undefined;

    try {
      const submitResponse = await fetch(`${daemon.url}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: 'sse-render',
          jobIds: ['daily-ready'],
          manifest: buildDaemonManifest(),
        }),
      });
      expect(submitResponse.status).toBe(202);
      const accepted = await submitResponse.json() as { statusUrl: string };

      eventStream = await openSseStream<RenderWorkerDaemonRunEvent>(`${accepted.statusUrl}/events`);
      const snapshot = await eventStream.next((event) => event.type === 'snapshot');
      expect(snapshot).toMatchObject({
        kind: 'danbi.render-worker-daemon-run-event',
        type: 'snapshot',
        run: {
          id: 'sse-render',
        },
      });

      resolveCommand?.({ exitCode: 0, stdout: 'streamed', stderr: '' });
      const progress = await eventStream.next((event) => event.type === 'progress' && Boolean(event.run.progress?.completedJobs));
      expect(progress.run.progress).toMatchObject({
        completedJobs: 1,
      });

      const completed = await eventStream.next((event) => event.type === 'completed');
      expect(completed.run).toMatchObject({
        id: 'sse-render',
        status: 'completed',
      });
      expect(completed.run.report?.summary).toMatchObject({
        completedJobs: 1,
        skippedJobs: 1,
      });
    } finally {
      resolveCommand?.({ exitCode: 1, stdout: '', stderr: 'closed' });
      await eventStream?.close();
      await daemon.close();
    }
  });

  it('streams daemon-wide fleet status over WebSocket events', async () => {
    let resolveCommand: ((value: { exitCode: number; stdout: string; stderr: string }) => void) | undefined;
    const daemon = await startRenderWorkerDaemon({
      host: '127.0.0.1',
      port: 0,
      workerId: 'daemon-websocket',
      now: createClock(),
      executeCommand: async () => {
        return await new Promise((resolve) => {
          resolveCommand = resolve;
        });
      },
    });

    let eventStream: WebSocketTestStream<RenderWorkerDaemonFleetEvent> | undefined;

    try {
      eventStream = await openWebSocketStream<RenderWorkerDaemonFleetEvent>(`${daemon.url}/events`);
      const snapshot = await eventStream.next((event) => event.type === 'snapshot');
      expect(snapshot).toMatchObject({
        kind: 'danbi.render-worker-daemon-fleet-event',
        type: 'snapshot',
        status: {
          workerId: 'daemon-websocket',
          activeRuns: 0,
        },
      });

      const submitResponse = await fetch(`${daemon.url}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: 'websocket-render',
          jobIds: ['daily-ready'],
          manifest: buildDaemonManifest(),
        }),
      });
      expect(submitResponse.status).toBe(202);

      const progress = await eventStream.next((event) => event.type === 'run-progress' && event.status.activeRuns === 1);
      expect(progress.run).toMatchObject({
        id: 'websocket-render',
        status: 'running',
      });
      expect(progress.status.runs[0]).toMatchObject({
        id: 'websocket-render',
        status: 'running',
      });

      resolveCommand?.({ exitCode: 0, stdout: 'websocket', stderr: '' });
      const completed = await eventStream.next((event) => event.type === 'run-completed');
      expect(completed).toMatchObject({
        status: {
          activeRuns: 0,
          completedRuns: 1,
        },
        run: {
          id: 'websocket-render',
          status: 'completed',
        },
      });
    } finally {
      resolveCommand?.({ exitCode: 1, stdout: '', stderr: 'closed' });
      await eventStream?.close();
      await daemon.close();
    }
  });
});

function buildDaemonManifest(): RenderWorkerHandoffManifest {
  return {
    schemaVersion: RENDER_WORKER_HANDOFF_SCHEMA_VERSION,
    kind: RENDER_WORKER_HANDOFF_KIND,
    createdAt: '2026-06-15T00:00:00.000Z',
    batchId: 'daily',
    controller: {
      protocol: 'headless-render-v1',
      mode: 'local-network-handoff',
    },
    project: {
      id: 'project-1',
      name: 'Daemon Project',
      schemaVersion: 1,
      duration: 10,
      fps: 30,
      width: 1920,
      height: 1080,
      projectPath: 'E:\\work\\project.danbi-project.json',
    },
    summary: {
      totalJobs: 2,
      blockedJobs: 1,
      warningJobs: 0,
      readyJobs: 1,
    },
    jobs: [
      {
        id: 'daily-ready',
        profileId: 'profile-h264',
        profileLabel: 'H.264',
        outputFilename: 'daily.mp4',
        outputPath: 'E:\\work\\renders\\daily.mp4',
        encoderPreference: 'auto',
        preflightStatus: 'ready',
        blocked: false,
        warningCount: 0,
        blockedCount: 0,
        issues: [],
        commandText: 'ffmpeg -i input output',
        ffmpegCommand: ['ffmpeg', '-i', 'input', 'output'],
        workerCommand: {
          executable: 'node',
          args: ['-e', 'console.log("render")'],
          cwd: 'E:\\work',
        },
      },
      {
        id: 'daily-blocked',
        profileId: 'profile-blocked',
        profileLabel: 'Blocked',
        outputFilename: 'blocked.mp4',
        outputPath: 'E:\\work\\renders\\blocked.mp4',
        encoderPreference: 'auto',
        preflightStatus: 'blocked',
        blocked: true,
        warningCount: 0,
        blockedCount: 1,
        issues: [{
          severity: 'blocked',
          source: 'media',
          message: 'Missing source media.',
          action: 'Relink media before rendering.',
        }],
        commandText: 'ffmpeg -i missing output',
        ffmpegCommand: ['ffmpeg', '-i', 'missing', 'output'],
        workerCommand: {
          executable: 'node',
          args: ['-e', 'console.log("blocked")'],
          cwd: 'E:\\work',
        },
      },
    ],
  };
}

function createClock(): () => string {
  let tick = 0;
  return () => `2026-06-15T00:00:${String(tick += 1).padStart(2, '0')}.000Z`;
}

async function waitForCompletedRun(statusUrl: string): Promise<RenderWorkerDaemonRunRecord> {
  return waitForRun(statusUrl, (run) => run.status === 'completed' || run.status === 'failed');
}

async function submitDaemonRunRequest(daemonUrl: string, runId: string): Promise<void> {
  const response = await fetch(`${daemonUrl}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      runId,
      jobIds: ['daily-ready'],
      manifest: buildDaemonManifest(),
    }),
  });
  expect(response.status).toBe(202);
}

async function waitForDaemonStatus(
  daemonUrl: string,
  predicate: (status: Awaited<ReturnType<typeof readDaemonStatus>>) => boolean,
): Promise<Awaited<ReturnType<typeof readDaemonStatus>>> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const status = await readDaemonStatus(daemonUrl);
    if (predicate(status)) {
      return status;
    }

    await delay(20);
  }

  throw new Error(`Timed out waiting for render worker daemon status: ${daemonUrl}`);
}

async function readDaemonStatus(url: string) {
  return await readJson<{
    activeRuns: number;
    queuedRuns: number;
    runningRuns: number;
    maxConcurrentRuns: number;
    completedRuns: number;
    failedRuns: number;
    runs: Array<{
      id: string;
      status: string;
      lease?: {
        workerId: string;
        acquiredAt: string;
        heartbeatAt: string;
        expiresAt: string;
      };
    }>;
  }>(`${url}/status`);
}

async function waitForRun(
  statusUrl: string,
  predicate: (run: RenderWorkerDaemonRunRecord) => boolean,
): Promise<RenderWorkerDaemonRunRecord> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await readJson<{ run: RenderWorkerDaemonRunRecord }>(statusUrl);
    if (predicate(response.run)) {
      return response.run;
    }

    await delay(20);
  }

  throw new Error(`Timed out waiting for render worker daemon run: ${statusUrl}`);
}

async function waitForAuthedRun(
  daemonUrl: string,
  runId: string,
  options: { authToken: string },
): Promise<RenderWorkerDaemonRunRecord> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const run = await fetchRenderWorkerDaemonRun(daemonUrl, runId, options);
    if (run.status === 'completed' || run.status === 'failed') {
      return run;
    }

    await delay(20);
  }

  throw new Error(`Timed out waiting for authenticated render worker daemon run: ${daemonUrl}/${runId}`);
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  expect(response.ok).toBe(true);
  return await response.json() as T;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

interface SseTestStream<T> {
  next: (predicate: (event: T) => boolean) => Promise<T>;
  close: () => Promise<void>;
}

async function openSseStream<T>(url: string): Promise<SseTestStream<T>> {
  const response = await fetch(url);
  expect(response.ok).toBe(true);
  expect(response.headers.get('content-type')).toContain('text/event-stream');

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('SSE response body is not readable.');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  const events: T[] = [];

  const parseEvents = () => {
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const data = part
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).trimStart())
        .join('\n');

      if (data) {
        events.push(JSON.parse(data) as T);
      }
    }
  };

  return {
    next: async (predicate) => {
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        const eventIndex = events.findIndex(predicate);
        if (eventIndex >= 0) {
          const [event] = events.splice(eventIndex, 1);
          return event;
        }

        const read = await Promise.race([
          reader.read(),
          delay(100).then(() => undefined),
        ]);
        if (!read) {
          continue;
        }
        if (read.done) {
          break;
        }

        buffer += decoder.decode(read.value, { stream: true });
        parseEvents();
      }

      throw new Error(`Timed out waiting for SSE event: ${url}`);
    },
    close: async () => {
      await reader.cancel().catch(() => undefined);
    },
  };
}

interface WebSocketTestStream<T> {
  next: (predicate: (event: T) => boolean) => Promise<T>;
  close: () => Promise<void>;
}

async function openWebSocketStream<T>(url: string): Promise<WebSocketTestStream<T>> {
  const endpoint = new URL(url);
  const socket = connect(Number(endpoint.port), endpoint.hostname);
  const key = randomBytes(16).toString('base64');
  let buffer = Buffer.alloc(0);
  let handshakeComplete = false;
  const events: T[] = [];

  const parseFrames = () => {
    while (buffer.length >= 2) {
      const opcode = buffer[0] & 0x0f;
      let length = buffer[1] & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (buffer.length < 4) {
          return;
        }
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) {
          return;
        }
        const longLength = buffer.readBigUInt64BE(2);
        if (longLength > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error('WebSocket test frame is too large.');
        }
        length = Number(longLength);
        offset = 10;
      }

      if (buffer.length < offset + length) {
        return;
      }

      const payload = buffer.subarray(offset, offset + length);
      buffer = buffer.subarray(offset + length);

      if (opcode === 0x1) {
        events.push(JSON.parse(payload.toString('utf8')) as T);
      }
    }
  };

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      socket.off('connect', onConnect);
      reject(error);
    };
    const onConnect = () => {
      socket.off('error', onError);
      socket.write([
        `GET ${endpoint.pathname} HTTP/1.1`,
        `Host: ${endpoint.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n'));
    };
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!handshakeComplete) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd < 0) {
          return;
        }

        const header = buffer.subarray(0, headerEnd).toString('utf8');
        expect(header).toContain('101 Switching Protocols');
        buffer = buffer.subarray(headerEnd + 4);
        handshakeComplete = true;
        parseFrames();
        socket.off('data', onData);
        socket.on('data', (nextChunk) => {
          buffer = Buffer.concat([buffer, nextChunk]);
          parseFrames();
        });
        resolve();
      }
    };

    socket.once('error', onError);
    socket.once('connect', onConnect);
    socket.on('data', onData);
  });

  return {
    next: async (predicate) => {
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        const eventIndex = events.findIndex(predicate);
        if (eventIndex >= 0) {
          const [event] = events.splice(eventIndex, 1);
          return event;
        }

        await delay(20);
      }

      throw new Error(`Timed out waiting for WebSocket event: ${url}`);
    },
    close: async () => {
      socket.end();
      socket.destroy();
    },
  };
}
