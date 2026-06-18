import { describe, expect, it, vi } from 'vitest';
import { createDefaultEditorProject } from '../../src/lib/editor/project';
import {
  buildRenderWorkerCentralTrustGovernanceSummary,
  buildRenderWorkerControllerHandoff,
  buildRenderWorkerDaemonDiscoveryCandidates,
  buildRenderWorkerTrustedCandidateUrls,
  evaluateRenderWorkerCentralTrustPolicy,
  filterRenderWorkerDaemonsByCentralTrustPolicy,
  forgetTrustedRenderWorkerDaemon,
  formatRenderWorkerCentralTrustGovernanceSummary,
  formatRenderWorkerFleetStatus,
  formatRenderWorkerDaemonStatus,
  formatRenderWorkerRunStatus,
  isRenderWorkerDaemonTrusted,
  normalizeRenderWorkerDaemonUrl,
  parseRenderWorkerRemoteDaemonUrls,
  readTrustedRenderWorkers,
  selectRenderWorkerDaemonForHandoff,
  shouldPollRenderWorkerRun,
  trustRenderWorkerDaemon,
  writeTrustedRenderWorkers,
} from '../../src/electron/renderer/render-worker-controller-helpers';
import {
  fetchRenderWorkerDaemonStatus,
  subscribeRenderWorkerDaemonFleetEvents,
  subscribeRenderWorkerDaemonRunEvents,
  submitRenderWorkerDaemonRun,
} from '../../src/electron/renderer/render-worker-client';
import type { RenderWorkerDaemonRunRecord, RenderWorkerDaemonStatus } from '../../src/electron/shared/render-worker-contract';

describe('render worker controller helpers', () => {
  it('normalizes daemon URLs', () => {
    expect(normalizeRenderWorkerDaemonUrl('')).toBe('http://127.0.0.1:47683');
    expect(normalizeRenderWorkerDaemonUrl('127.0.0.1:47683/')).toBe('http://127.0.0.1:47683');
    expect(normalizeRenderWorkerDaemonUrl('http://worker.local:47683/')).toBe('http://worker.local:47683');
  });

  it('builds daemon discovery candidates from the current URL and app host', () => {
    expect(buildRenderWorkerDaemonDiscoveryCandidates({
      daemonUrl: 'worker.local:47683/',
      remoteDaemonUrls: 'render-b.local:47683, http://192.168.0.42:47683\nworker.local:47683/',
      pageOrigin: 'http://editor-box:3000/editor',
    })).toEqual([
      'http://worker.local:47683',
      'http://render-b.local:47683',
      'http://192.168.0.42:47683',
      'http://editor-box:47683',
      'http://127.0.0.1:47683',
      'http://localhost:47683',
    ]);
    expect(parseRenderWorkerRemoteDaemonUrls('render-b.local:47683; http://192.168.0.42:47683 render-b.local:47683')).toEqual([
      'http://render-b.local:47683',
      'http://192.168.0.42:47683',
    ]);
  });

  it('builds daemon handoff manifests from selected export profiles', () => {
    const project = createDefaultEditorProject();
    const plan = buildRenderWorkerControllerHandoff({
      project,
      profileIds: ['profile-youtube-4k', 'profile-short-vertical'],
      projectFilePath: 'E:\\work\\package\\project.danbi-project.json',
      exportRange: { start: 2, end: 8 },
      playhead: 4,
      batchId: 'daily-worker',
      workerCwd: 'E:\\ai_tool\\Danbi_Studio',
      workerExecutable: 'npm.cmd',
      createdAt: '2026-06-15T00:00:00.000Z',
    });

    expect(plan.canSubmit).toBe(true);
    expect(plan.manifest).toMatchObject({
      schemaVersion: 1,
      kind: 'danbi.render-worker-handoff',
      batchId: 'daily-worker',
      project: {
        id: project.id,
        projectPath: 'E:\\work\\package\\project.danbi-project.json',
      },
      summary: {
        totalJobs: 2,
      },
    });
    expect(plan.manifest?.jobs.map((job) => job.id)).toEqual([
      'daily-worker-profile-youtube-4k',
      'daily-worker-profile-short-vertical',
    ]);
    expect(plan.manifest?.jobs[0].workerCommand).toMatchObject({
      executable: 'npm.cmd',
      cwd: 'E:\\ai_tool\\Danbi_Studio',
      args: [
        'run',
        'editor:headless-render',
        '--',
        '--project',
        'E:\\work\\package\\project.danbi-project.json',
        '--profile',
        'profile-youtube-4k',
        '--out-dir',
        'renders',
        '--batch-id',
        'daily-worker',
        '--encoder',
        'auto',
      ],
    });
    expect(plan.manifest?.jobs[0].exportRange).toEqual({ start: 2, end: 8 });
  });

  it('formats daemon and run status summaries', () => {
    const status: RenderWorkerDaemonStatus = {
      kind: 'danbi.render-worker-daemon-status',
      workerId: 'node-a',
      host: '127.0.0.1',
      port: 47683,
      url: 'http://127.0.0.1:47683',
      startedAt: '2026-06-15T00:00:00.000Z',
      activeRuns: 1,
      queuedRuns: 0,
      runningRuns: 1,
      maxConcurrentRuns: 2,
      completedRuns: 2,
      failedRuns: 0,
      runs: [],
    };
    const run: RenderWorkerDaemonRunRecord = {
      id: 'daily',
      status: 'running',
      submittedAt: '2026-06-15T00:00:00.000Z',
      dryRun: true,
      executeBlocked: false,
      jobIds: [],
    };

    expect(formatRenderWorkerDaemonStatus(status)).toBe('node-a / running 1 / queued 0 / cap 2 / completed 2 / failed 0');
    expect(formatRenderWorkerFleetStatus([
      status,
      { ...status, workerId: 'node-b', activeRuns: 2, queuedRuns: 1, runningRuns: 1, maxConcurrentRuns: 1, completedRuns: 1, failedRuns: 1 },
    ])).toBe('2 workers / running 2 / queued 1 / cap 3 / active 3 / completed 3 / failed 1');
    expect(formatRenderWorkerRunStatus(run)).toBe('daily: running');
    expect(shouldPollRenderWorkerRun(run)).toBe(true);
    expect(shouldPollRenderWorkerRun({ ...run, status: 'completed' })).toBe(false);
  });

  it('routes handoffs to the least loaded discovered worker', () => {
    const busyCurrent: RenderWorkerDaemonStatus = {
      kind: 'danbi.render-worker-daemon-status',
      workerId: 'node-a',
      host: '127.0.0.1',
      port: 47683,
      url: 'http://127.0.0.1:47683',
      startedAt: '2026-06-15T00:00:00.000Z',
      activeRuns: 3,
      queuedRuns: 1,
      runningRuns: 2,
      maxConcurrentRuns: 2,
      completedRuns: 4,
      failedRuns: 0,
      runs: [],
    };
    const idleRemote: RenderWorkerDaemonStatus = {
      ...busyCurrent,
      workerId: 'node-b',
      host: '192.168.0.42',
      url: 'http://192.168.0.42:47683',
      activeRuns: 0,
      queuedRuns: 0,
      runningRuns: 0,
      maxConcurrentRuns: 1,
    };

    expect(selectRenderWorkerDaemonForHandoff([busyCurrent, idleRemote], busyCurrent.url)?.workerId).toBe('node-b');
    expect(selectRenderWorkerDaemonForHandoff([idleRemote, { ...idleRemote, workerId: 'node-c', url: 'http://192.168.0.43:47683' }], idleRemote.url)?.workerId).toBe('node-b');
  });

  it('enforces central trust policy for remote render workers', () => {
    const localOpen = createDaemonStatus({
      workerId: 'local-open',
      host: '127.0.0.1',
      url: 'http://127.0.0.1:47683',
      authRequired: false,
    });
    const remoteOpen = createDaemonStatus({
      workerId: 'remote-open',
      host: '192.168.0.40',
      url: 'http://192.168.0.40:47683',
      authRequired: false,
    });
    const remotePaired = createDaemonStatus({
      workerId: 'remote-paired',
      host: '192.168.0.42',
      url: 'http://192.168.0.42:47683',
      authRequired: true,
    });

    const localDecision = evaluateRenderWorkerCentralTrustPolicy(localOpen);
    expect(localDecision).toMatchObject({
      allowed: true,
      severity: 'review',
      local: true,
    });
    expect(localDecision.warnings[0]).toContain('Pair token');

    expect(evaluateRenderWorkerCentralTrustPolicy(remotePaired).allowed).toBe(false);
    expect(evaluateRenderWorkerCentralTrustPolicy(remotePaired).reason).toContain('Trust');

    const trustedOpenRemote = trustRenderWorkerDaemon([], remoteOpen, '2026-06-15T01:00:00.000Z');
    expect(evaluateRenderWorkerCentralTrustPolicy(remoteOpen, trustedOpenRemote)).toMatchObject({
      allowed: false,
      severity: 'block',
    });
    expect(evaluateRenderWorkerCentralTrustPolicy(remoteOpen, trustedOpenRemote).reason).toContain('Pair token');

    const trustedPairedRemote = trustRenderWorkerDaemon([], remotePaired, '2026-06-15T01:00:00.000Z');
    expect(evaluateRenderWorkerCentralTrustPolicy(remotePaired, trustedPairedRemote)).toMatchObject({
      allowed: true,
      severity: 'allow',
      trusted: true,
    });
  });

  it('filters route candidates through central trust governance', () => {
    const busyLocal = createDaemonStatus({
      workerId: 'busy-local',
      host: '127.0.0.1',
      url: 'http://127.0.0.1:47683',
      authRequired: false,
      runningRuns: 2,
      queuedRuns: 1,
      activeRuns: 3,
      maxConcurrentRuns: 2,
    });
    const idleRemote = createDaemonStatus({
      workerId: 'idle-remote',
      host: '192.168.0.42',
      url: 'http://192.168.0.42:47683',
      authRequired: true,
      runningRuns: 0,
      queuedRuns: 0,
      activeRuns: 0,
      maxConcurrentRuns: 2,
    });

    expect(selectRenderWorkerDaemonForHandoff([busyLocal, idleRemote], busyLocal.url, {
      trustedWorkers: [],
    })?.workerId).toBe('busy-local');
    expect(filterRenderWorkerDaemonsByCentralTrustPolicy([busyLocal, idleRemote]).map((worker) => worker.workerId)).toEqual(['busy-local']);

    const trustedRemote = trustRenderWorkerDaemon([], idleRemote, '2026-06-15T01:00:00.000Z');
    expect(selectRenderWorkerDaemonForHandoff([busyLocal, idleRemote], busyLocal.url, {
      trustedWorkers: trustedRemote,
    })?.workerId).toBe('idle-remote');

    const summary = buildRenderWorkerCentralTrustGovernanceSummary([busyLocal, idleRemote], trustedRemote);
    expect(summary).toMatchObject({
      totalWorkers: 2,
      allowedWorkers: 2,
      reviewWorkers: 1,
      blockedWorkers: 0,
      remoteWorkers: 1,
      trustedWorkers: 1,
    });
    expect(formatRenderWorkerCentralTrustGovernanceSummary(summary)).toBe('Trust policy: 2/2 allowed, 0 blocked, 1 trusted, 1 remote');
  });

  it('times out stalled render worker client requests', async () => {
    const previousFetch = globalThis.fetch;
    const abortSignals: AbortSignal[] = [];

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (_url: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          abortSignals.push(signal);
          signal.addEventListener('abort', () => reject(new Error('render worker request aborted')), { once: true });
        }
      }),
    });

    try {
      await expect(fetchRenderWorkerDaemonStatus('http://render-node.local:47683', {
        timeoutMs: 1,
      })).rejects.toThrow('render worker request aborted');
      await expect(submitRenderWorkerDaemonRun('http://render-node.local:47683', {
        runId: 'stalled-submit',
        manifest: {
          schemaVersion: 1,
          kind: 'danbi.render-worker-handoff',
          createdAt: '2026-06-17T00:00:00.000Z',
          batchId: 'stalled-submit',
          project: {
            id: 'project',
            name: 'Project',
            projectPath: 'project.danbi-project.json',
          },
          jobs: [],
          summary: {
            totalJobs: 0,
            selectedJobCount: 0,
            skippedJobCount: 0,
          },
        },
      }, {
        timeoutMs: 1,
      })).rejects.toThrow('render worker request aborted');
      expect(abortSignals).toHaveLength(2);
      expect(abortSignals.every((signal) => signal.aborted)).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
    }
  });

  it('keeps render worker client request timeouts active with parent abort signals', async () => {
    vi.useFakeTimers();
    const previousFetch = globalThis.fetch;
    const parentController = new AbortController();
    const abortSignals: AbortSignal[] = [];

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (_url: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          abortSignals.push(signal);
          signal.addEventListener('abort', () => reject(new Error('render worker merged request aborted')), { once: true });
        }
      }),
    });

    try {
      const request = expect(fetchRenderWorkerDaemonStatus('http://render-node.local:47683', {
        signal: parentController.signal,
        timeoutMs: 25,
      })).rejects.toThrow('render worker merged request aborted');

      await vi.advanceTimersByTimeAsync(25);
      await request;

      expect(parentController.signal.aborted).toBe(false);
      expect(abortSignals).toHaveLength(1);
      expect(abortSignals[0].aborted).toBe(true);
    } finally {
      vi.useRealTimers();
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
    }
  });

  it('closes unopened render worker event subscriptions after timeout', () => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    FakeWebSocket.instances = [];
    const restoreEventSource = replaceGlobalConstructor('EventSource', FakeEventSource);
    const restoreWebSocket = replaceGlobalConstructor('WebSocket', FakeWebSocket);
    const errors: string[] = [];

    try {
      const closeRunStream = subscribeRenderWorkerDaemonRunEvents('http://worker.local:47683', 'run-1', {
        onEvent: () => undefined,
        onError: () => errors.push('run'),
      }, {
        authToken: 'pair-token',
        timeoutMs: 25,
      });
      const closeFleetStream = subscribeRenderWorkerDaemonFleetEvents('http://worker.local:47683', {
        onEvent: () => undefined,
        onError: () => errors.push('fleet'),
      }, {
        authToken: 'pair-token',
        timeoutMs: 25,
      });

      expect(closeRunStream).toEqual(expect.any(Function));
      expect(closeFleetStream).toEqual(expect.any(Function));
      expect(FakeEventSource.instances[0].url).toContain('/runs/run-1/events');
      expect(FakeEventSource.instances[0].url).toContain('token=pair-token');
      expect(FakeWebSocket.instances[0].url).toContain('/events');
      expect(FakeWebSocket.instances[0].url).toContain('token=pair-token');

      vi.advanceTimersByTime(25);

      expect([...errors].sort()).toEqual(['fleet', 'run']);
      expect(FakeEventSource.instances[0].closed).toBe(true);
      expect(FakeWebSocket.instances[0].closed).toBe(true);
      closeRunStream?.();
      closeFleetStream?.();
    } finally {
      vi.useRealTimers();
      restoreEventSource();
      restoreWebSocket();
    }
  });

  it('closes render worker event subscriptions on abort without delivering stale events', () => {
    FakeEventSource.instances = [];
    FakeWebSocket.instances = [];
    const restoreEventSource = replaceGlobalConstructor('EventSource', FakeEventSource);
    const restoreWebSocket = replaceGlobalConstructor('WebSocket', FakeWebSocket);
    const controller = new AbortController();
    const runEvents: string[] = [];
    const fleetEvents: string[] = [];

    try {
      const closeRunStream = subscribeRenderWorkerDaemonRunEvents('http://worker.local:47683', 'run-1', {
        onEvent: (event) => runEvents.push(event.type),
      }, {
        signal: controller.signal,
      });
      const closeFleetStream = subscribeRenderWorkerDaemonFleetEvents('http://worker.local:47683', {
        onEvent: (event) => fleetEvents.push(event.type),
      }, {
        signal: controller.signal,
      });

      controller.abort();

      expect(FakeEventSource.instances[0].closed).toBe(true);
      expect(FakeWebSocket.instances[0].closed).toBe(true);
      FakeEventSource.instances[0].emit('progress', {
        kind: 'danbi.render-worker-daemon-run-event',
        type: 'progress',
        emittedAt: '2026-06-17T00:00:00.000Z',
        run: createRunRecord(),
      });
      FakeWebSocket.instances[0].emitMessage({
        kind: 'danbi.render-worker-daemon-fleet-event',
        type: 'status',
        emittedAt: '2026-06-17T00:00:00.000Z',
        status: createDaemonStatus(),
      });

      expect(runEvents).toEqual([]);
      expect(fleetEvents).toEqual([]);
      closeRunStream?.();
      closeFleetStream?.();
    } finally {
      restoreEventSource();
      restoreWebSocket();
    }
  });

  it('applies central trust policy allowlists and blocklists', () => {
    const remotePaired = createDaemonStatus({
      workerId: 'remote-paired',
      host: '192.168.0.42',
      url: 'http://192.168.0.42:47683',
      authRequired: true,
    });
    const trusted = trustRenderWorkerDaemon([], remotePaired, '2026-06-15T01:00:00.000Z');

    expect(evaluateRenderWorkerCentralTrustPolicy(remotePaired, trusted, {
      allowLocalhostWorkers: true,
      requireTrustedRemoteWorkers: true,
      requireRemotePairToken: true,
      blockedWorkerIds: ['remote-paired'],
    })).toMatchObject({
      allowed: false,
      severity: 'block',
    });
    expect(evaluateRenderWorkerCentralTrustPolicy(remotePaired, trusted, {
      allowLocalhostWorkers: true,
      requireTrustedRemoteWorkers: true,
      requireRemotePairToken: true,
      allowedUrlOrigins: ['http://192.168.0.43:47683'],
    }).reason).toContain('origin allowlist');
  });

  it('persists trusted render workers without storing pair tokens', () => {
    const storage = createMemoryStorage();
    const status: RenderWorkerDaemonStatus = {
      kind: 'danbi.render-worker-daemon-status',
      workerId: 'node-trusted',
      host: '192.168.0.42',
      port: 47683,
      url: 'http://192.168.0.42:47683/',
      startedAt: '2026-06-15T00:00:00.000Z',
      authRequired: true,
      discovery: {
        enabled: true,
        port: 47684,
      },
      activeRuns: 0,
      queuedRuns: 0,
      runningRuns: 0,
      maxConcurrentRuns: 2,
      completedRuns: 0,
      failedRuns: 0,
      runs: [],
    };

    const trusted = trustRenderWorkerDaemon([], status, '2026-06-15T01:00:00.000Z');
    expect(trusted).toEqual([{
      workerId: 'node-trusted',
      url: 'http://192.168.0.42:47683',
      firstSeenAt: '2026-06-15T01:00:00.000Z',
      lastSeenAt: '2026-06-15T01:00:00.000Z',
      authRequired: true,
      discoveryPort: 47684,
    }]);
    expect(isRenderWorkerDaemonTrusted(trusted, { ...status, url: 'http://192.168.0.42:47683' })).toBe(true);
    expect(buildRenderWorkerTrustedCandidateUrls(trusted)).toEqual(['http://192.168.0.42:47683']);

    const refreshed = trustRenderWorkerDaemon(trusted, { ...status, authRequired: false }, '2026-06-15T02:00:00.000Z');
    expect(refreshed[0]).toMatchObject({
      firstSeenAt: '2026-06-15T01:00:00.000Z',
      lastSeenAt: '2026-06-15T02:00:00.000Z',
      authRequired: false,
    });

    writeTrustedRenderWorkers(refreshed, storage);
    expect(storage.dump()).not.toContain('secret-token');
    expect(readTrustedRenderWorkers(storage)).toEqual(refreshed);
    expect(forgetTrustedRenderWorkerDaemon(refreshed, '192.168.0.42:47683')).toEqual([]);
  });
});

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  private readonly listeners = new Map<string, Set<EventListener>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, data: unknown) {
    const event = { data: JSON.stringify(data) } as MessageEvent<string>;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  close() {
    this.closed = true;
  }
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  emitMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }

  close() {
    this.closed = true;
  }
}

function replaceGlobalConstructor(name: 'EventSource' | 'WebSocket', value: unknown): () => void {
  const previous = (globalThis as Record<string, unknown>)[name];
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value,
  });

  return () => {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: previous,
    });
  };
}

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    dump: () => Array.from(values.values()).join('\n'),
  };
}

function createRunRecord(patch: Partial<RenderWorkerDaemonRunRecord> = {}): RenderWorkerDaemonRunRecord {
  return {
    id: 'run-1',
    status: 'running',
    submittedAt: '2026-06-17T00:00:00.000Z',
    dryRun: true,
    executeBlocked: false,
    jobIds: [],
    ...patch,
  };
}

function createDaemonStatus(patch: Partial<RenderWorkerDaemonStatus> = {}): RenderWorkerDaemonStatus {
  return {
    kind: 'danbi.render-worker-daemon-status',
    workerId: 'node-a',
    host: '127.0.0.1',
    port: 47683,
    url: 'http://127.0.0.1:47683',
    startedAt: '2026-06-15T00:00:00.000Z',
    authRequired: true,
    activeRuns: 0,
    queuedRuns: 0,
    runningRuns: 0,
    maxConcurrentRuns: 1,
    completedRuns: 0,
    failedRuns: 0,
    runs: [],
    ...patch,
  };
}
