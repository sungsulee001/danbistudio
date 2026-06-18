import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import {
  DEFAULT_RENDER_WORKER_DISCOVERY_PORT,
  startRenderWorkerDiscoveryResponder,
  type RenderWorkerDiscoveryResponder,
} from './render-worker-discovery';
import {
  parseRenderWorkerHandoffManifest,
  runRenderWorkerHandoffManifest,
  type RenderWorkerCommandExecutor,
} from './render-worker-runner';
import type {
  RenderWorkerDaemonRunRecord,
  RenderWorkerDaemonFleetEvent,
  RenderWorkerDaemonFleetEventType,
  RenderWorkerDaemonRunEvent,
  RenderWorkerDaemonRunEventType,
  RenderWorkerDaemonRunSummary,
  RenderWorkerDaemonStatus,
  RenderWorkerDaemonSubmitRequest,
  RenderWorkerDaemonSubmitResponse,
  RenderWorkerHandoffManifest,
} from '../shared/render-worker-contract';

const DEFAULT_RENDER_WORKER_DAEMON_HOST = '127.0.0.1';
const DEFAULT_RENDER_WORKER_DAEMON_PORT = 47683;
const DEFAULT_MAX_BODY_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_CONCURRENT_RUNS = 1;
const DEFAULT_RUN_LEASE_SECONDS = 600;
const FETCH_BLOCKED_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
  101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179,
  389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587,
  601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061,
  6000, 6566, 6697, 10080,
]);
const FETCH_BLOCKED_PORT_RANGES = [
  [6665, 6669],
] as const;
const RANDOM_PORT_MAX_ATTEMPTS = 20;

export interface RenderWorkerDaemonCliOptions {
  host: string;
  port: number;
  workerId: string;
  dryRun: boolean;
  executeBlocked: boolean;
  maxConcurrentRuns: number;
  runLeaseSeconds: number;
  authToken?: string;
  discovery: boolean;
  discoveryPort: number;
  help: boolean;
}

export type {
  RenderWorkerDaemonRunRecord,
  RenderWorkerDaemonRunStatus,
  RenderWorkerDaemonRunSummary,
  RenderWorkerDaemonStatus,
  RenderWorkerDaemonSubmitRequest,
  RenderWorkerDaemonSubmitResponse,
} from '../shared/render-worker-contract';

export interface RenderWorkerDaemonController {
  server: Server;
  url: string;
  workerId: string;
  snapshot: () => RenderWorkerDaemonStatus;
  getRun: (runId: string) => RenderWorkerDaemonRunRecord | undefined;
  close: () => Promise<void>;
}

export interface StartRenderWorkerDaemonOptions {
  host?: string;
  port?: number;
  workerId?: string;
  dryRun?: boolean;
  executeBlocked?: boolean;
  maxConcurrentRuns?: number;
  runLeaseSeconds?: number;
  authToken?: string;
  discovery?: boolean;
  discoveryPort?: number;
  executeCommand?: RenderWorkerCommandExecutor;
  now?: () => string;
  maxBodyBytes?: number;
}

interface RenderWorkerDaemonState {
  workerId: string;
  host: string;
  port: number;
  url: string;
  startedAt: string;
  dryRun: boolean;
  executeBlocked: boolean;
  maxConcurrentRuns: number;
  runLeaseSeconds: number;
  authToken?: string;
  discovery: boolean;
  discoveryPort: number;
  discoveryResponder?: RenderWorkerDiscoveryResponder;
  executeCommand?: RenderWorkerCommandExecutor;
  now: () => string;
  maxBodyBytes: number;
  nextRunNumber: number;
  runs: Map<string, RenderWorkerDaemonRunRecord>;
  runManifests: Map<string, RenderWorkerHandoffManifest>;
  runningRunIds: Set<string>;
  runSubscribers: Map<string, Set<ServerResponse>>;
  fleetSubscribers: Set<Duplex>;
}

export function parseRenderWorkerDaemonCliArgs(argv: string[]): RenderWorkerDaemonCliOptions {
  const options: RenderWorkerDaemonCliOptions = {
    host: DEFAULT_RENDER_WORKER_DAEMON_HOST,
    port: DEFAULT_RENDER_WORKER_DAEMON_PORT,
    workerId: `worker-${process.env.COMPUTERNAME || process.env.HOSTNAME || 'local'}`,
    dryRun: false,
    executeBlocked: false,
    maxConcurrentRuns: DEFAULT_MAX_CONCURRENT_RUNS,
    runLeaseSeconds: DEFAULT_RUN_LEASE_SECONDS,
    authToken: normalizeAuthToken(process.env.DANBI_RENDER_WORKER_AUTH_TOKEN),
    discovery: process.env.DANBI_RENDER_WORKER_DISCOVERY === '1',
    discoveryPort: parsePort(process.env.DANBI_RENDER_WORKER_DISCOVERY_PORT || String(DEFAULT_RENDER_WORKER_DISCOVERY_PORT)),
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--host':
        options.host = readRequiredValue(argv, index, arg);
        index += 1;
        break;
      case '--port':
        options.port = parsePort(readRequiredValue(argv, index, arg));
        index += 1;
        break;
      case '--worker-id':
        options.workerId = readRequiredValue(argv, index, arg).trim() || options.workerId;
        index += 1;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--execute-blocked':
        options.executeBlocked = true;
        break;
      case '--max-runs':
        options.maxConcurrentRuns = parsePositiveInteger(readRequiredValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--lease-seconds':
        options.runLeaseSeconds = parsePositiveInteger(readRequiredValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--auth-token':
        options.authToken = normalizeAuthToken(readRequiredValue(argv, index, arg));
        index += 1;
        break;
      case '--discovery':
        options.discovery = true;
        break;
      case '--discovery-port':
        options.discoveryPort = parsePort(readRequiredValue(argv, index, arg));
        index += 1;
        break;
      default:
        throw new Error(`Unknown render worker daemon argument: ${arg}`);
    }
  }

  return options;
}

export function formatRenderWorkerDaemonHelp(): string {
  return [
    'Usage: npm run editor:render-worker-daemon -- [options]',
    '',
    'Options:',
    '  --host <host>          Host to bind. Defaults to 127.0.0.1.',
    '  --port <port>          Port to bind. Defaults to 47683. Use 0 for a random port.',
    '  --worker-id <id>       Worker identifier for status and reports.',
    '  --dry-run              Default submitted handoff runs to dry-run mode.',
    '  --execute-blocked      Default submitted runs to execute blocked preflight jobs.',
    '  --max-runs <count>     Maximum concurrent submitted runs. Defaults to 1.',
    '  --lease-seconds <sec>  Lease timeout reported for running jobs. Defaults to 600.',
    '  --auth-token <token>   Require bearer token auth for status, runs, SSE, and WebSocket endpoints.',
    '  --discovery            Enable UDP zero-config discovery responses for Electron controllers.',
    `  --discovery-port <port> UDP discovery port. Defaults to ${DEFAULT_RENDER_WORKER_DISCOVERY_PORT}.`,
  ].join('\n');
}

export async function startRenderWorkerDaemon(options: StartRenderWorkerDaemonOptions = {}): Promise<RenderWorkerDaemonController> {
  const server = createServer();
  const state: RenderWorkerDaemonState = {
    workerId: options.workerId ?? `worker-${process.env.COMPUTERNAME || process.env.HOSTNAME || 'local'}`,
    host: options.host ?? DEFAULT_RENDER_WORKER_DAEMON_HOST,
    port: options.port ?? DEFAULT_RENDER_WORKER_DAEMON_PORT,
    url: '',
    startedAt: (options.now ?? defaultNow)(),
    dryRun: options.dryRun ?? false,
    executeBlocked: options.executeBlocked ?? false,
    maxConcurrentRuns: Math.max(1, Math.floor(options.maxConcurrentRuns ?? DEFAULT_MAX_CONCURRENT_RUNS)),
    runLeaseSeconds: Math.max(1, Math.floor(options.runLeaseSeconds ?? DEFAULT_RUN_LEASE_SECONDS)),
    authToken: normalizeAuthToken(options.authToken ?? process.env.DANBI_RENDER_WORKER_AUTH_TOKEN),
    discovery: options.discovery ?? process.env.DANBI_RENDER_WORKER_DISCOVERY === '1',
    discoveryPort: parsePort(String(options.discoveryPort ?? process.env.DANBI_RENDER_WORKER_DISCOVERY_PORT ?? DEFAULT_RENDER_WORKER_DISCOVERY_PORT)),
    executeCommand: options.executeCommand,
    now: options.now ?? defaultNow,
    maxBodyBytes: options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
    nextRunNumber: 1,
    runs: new Map(),
    runManifests: new Map(),
    runningRunIds: new Set(),
    runSubscribers: new Map(),
    fleetSubscribers: new Set(),
  };

  server.on('request', (request, response) => {
    void handleRenderWorkerDaemonRequest(request, response, state).catch((error) => {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
  server.on('upgrade', (request, socket) => {
    handleRenderWorkerDaemonUpgrade(request, socket, state);
  });

  state.port = await listenOnFetchReachablePort(server, state.port, state.host);
  state.url = `http://${formatHostForUrl(state.host)}:${state.port}`;
  if (state.discovery) {
    state.discoveryResponder = await startRenderWorkerDiscoveryResponder({
      port: state.discoveryPort,
      getStatus: () => buildDaemonStatus(state),
    });
    state.discoveryPort = state.discoveryResponder.port;
  }

  return {
    server,
    url: state.url,
    workerId: state.workerId,
    snapshot: () => buildDaemonStatus(state),
    getRun: (runId) => state.runs.get(runId),
    close: async () => {
      closeRunEventSubscribers(state);
      closeFleetEventSubscribers(state);
      await state.discoveryResponder?.close();
      await closeServer(server);
    },
  };
}

export function formatRenderWorkerDaemonStarted(status: RenderWorkerDaemonStatus): string {
  return [
    'Render worker daemon started.',
    `- worker: ${status.workerId}`,
    `- url: ${status.url}`,
    `- auth: ${status.authRequired ? 'required' : 'not required'}`,
    `- discovery: ${status.discovery?.enabled ? `udp/${status.discovery.port}` : 'disabled'}`,
    '- endpoints: GET /health, GET /status, POST /runs, GET /runs/:id, GET /runs/:id/events, WS /events',
  ].join('\n');
}

async function handleRenderWorkerDaemonRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: RenderWorkerDaemonState,
): Promise<void> {
  setCommonHeaders(response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const requestUrl = new URL(request.url ?? '/', state.url || `http://${formatHostForUrl(state.host)}:${state.port}`);

  if (request.method === 'GET' && requestUrl.pathname === '/health') {
    sendJson(response, 200, {
      kind: 'danbi.render-worker-daemon-health',
      ok: true,
      workerId: state.workerId,
      startedAt: state.startedAt,
      authRequired: Boolean(state.authToken),
    });
    return;
  }

  if (state.authToken && !isAuthorizedRenderWorkerRequest(request, requestUrl, state.authToken)) {
    sendJson(response, 401, {
      error: 'Render worker daemon authentication required.',
      authRequired: true,
    });
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/status') {
    sendJson(response, 200, buildDaemonStatus(state));
    return;
  }

  const runEventsId = readRunEventsId(requestUrl.pathname);
  if (request.method === 'GET' && runEventsId) {
    openRunEventStream(request, response, state, runEventsId);
    return;
  }

  const runId = readRunId(requestUrl.pathname);
  if (request.method === 'GET' && runId) {
    const run = state.runs.get(runId);
    if (!run) {
      sendJson(response, 404, { error: `Unknown render worker run: ${runId}` });
      return;
    }

    sendJson(response, 200, {
      kind: 'danbi.render-worker-daemon-run',
      run,
    });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/runs') {
    const submit = await readJsonBody<RenderWorkerDaemonSubmitRequest>(request, state.maxBodyBytes);
    const accepted = submitDaemonRun(submit, state);
    sendJson(response, 202, accepted);
    return;
  }

  sendJson(response, 404, { error: 'Unknown render worker daemon endpoint.' });
}

function handleRenderWorkerDaemonUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  state: RenderWorkerDaemonState,
): void {
  const requestUrl = new URL(request.url ?? '/', state.url || `http://${formatHostForUrl(state.host)}:${state.port}`);
  if (requestUrl.pathname !== '/events') {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  if (state.authToken && !isAuthorizedRenderWorkerRequest(request, requestUrl, state.authToken)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const key = request.headers['sec-websocket-key'];
  if (typeof key !== 'string' || !key.trim()) {
    socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const accept = createHash('sha1')
    .update(`${key.trim()}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n'));

  state.fleetSubscribers.add(socket);
  writeFleetEvent(socket, buildFleetEvent(state, 'snapshot'));

  const cleanup = () => {
    state.fleetSubscribers.delete(socket);
  };
  socket.on('close', cleanup);
  socket.on('end', cleanup);
  socket.on('error', cleanup);
  socket.on('data', (chunk: Buffer) => {
    if ((chunk[0] & 0x0f) === 0x08) {
      cleanup();
      socket.end();
    }
  });
}

function submitDaemonRun(
  submit: RenderWorkerDaemonSubmitRequest,
  state: RenderWorkerDaemonState,
): RenderWorkerDaemonSubmitResponse {
  const manifest = parseRenderWorkerHandoffManifest(JSON.stringify(submit.manifest));
  const runId = sanitizeRunId(submit.runId || `run-${Date.now()}-${state.nextRunNumber}`);
  state.nextRunNumber += 1;

  if (state.runs.has(runId)) {
    throw new Error(`Render worker run already exists: ${runId}`);
  }

  const record: RenderWorkerDaemonRunRecord = {
    id: runId,
    status: 'queued',
    submittedAt: state.now(),
    dryRun: submit.dryRun ?? state.dryRun,
    executeBlocked: submit.executeBlocked ?? state.executeBlocked,
    jobIds: normalizeJobIds(submit.jobIds),
    sourceBatchId: manifest.batchId,
  };
  state.runs.set(runId, record);
  state.runManifests.set(runId, manifest);
  broadcastFleetEvent(state, 'status', record);

  scheduleDaemonRuns(state);

  return {
    kind: 'danbi.render-worker-daemon-submit',
    runId,
    status: record.status,
    statusUrl: `${state.url}/runs/${encodeURIComponent(runId)}`,
  };
}

function scheduleDaemonRuns(state: RenderWorkerDaemonState): void {
  while (state.runningRunIds.size < state.maxConcurrentRuns) {
    const nextRecord = Array.from(state.runs.values()).find((run) => run.status === 'queued' && !state.runningRunIds.has(run.id));
    if (!nextRecord) {
      return;
    }

    const manifest = state.runManifests.get(nextRecord.id);
    if (!manifest) {
      nextRecord.status = 'failed';
      nextRecord.finishedAt = state.now();
      nextRecord.error = 'Render worker run manifest is missing.';
      broadcastFleetEvent(state, 'run-failed', nextRecord);
      continue;
    }

    state.runningRunIds.add(nextRecord.id);
    void executeDaemonRun(nextRecord, manifest, state).finally(() => {
      state.runningRunIds.delete(nextRecord.id);
      state.runManifests.delete(nextRecord.id);
      scheduleDaemonRuns(state);
    });
  }
}

async function executeDaemonRun(
  record: RenderWorkerDaemonRunRecord,
  manifest: RenderWorkerHandoffManifest,
  state: RenderWorkerDaemonState,
): Promise<void> {
  record.status = 'running';
  record.startedAt = state.now();
  record.lease = buildRunLease(state);
  broadcastRunEvent(state, record, 'progress');
  broadcastFleetEvent(state, 'run-progress', record);

  try {
    const report = await runRenderWorkerHandoffManifest({
      manifest,
      workerId: state.workerId,
      jobIds: record.jobIds,
      dryRun: record.dryRun,
      executeBlocked: record.executeBlocked,
      now: state.now,
      onProgress: (progress) => {
        record.progress = progress;
        record.lease = refreshRunLease(record.lease, state);
        broadcastRunEvent(state, record, 'progress');
        broadcastFleetEvent(state, 'run-progress', record);
      },
      ...(state.executeCommand ? { executeCommand: state.executeCommand } : {}),
    });
    record.report = report;
    record.finishedAt = report.finishedAt;
    record.status = report.summary.failedJobs > 0 ? 'failed' : 'completed';
    record.lease = undefined;
    record.error = report.summary.failedJobs > 0 ? 'One or more worker jobs failed.' : undefined;
    broadcastRunEvent(state, record, record.status);
    broadcastFleetEvent(state, record.status === 'failed' ? 'run-failed' : 'run-completed', record);
  } catch (error) {
    record.status = 'failed';
    record.finishedAt = state.now();
    record.lease = undefined;
    record.error = error instanceof Error ? error.message : String(error);
    broadcastRunEvent(state, record, 'failed');
    broadcastFleetEvent(state, 'run-failed', record);
  }
}

function buildDaemonStatus(state: RenderWorkerDaemonState): RenderWorkerDaemonStatus {
  const runs = Array.from(state.runs.values());
  const queuedRuns = runs.filter((run) => run.status === 'queued').length;
  const runningRuns = runs.filter((run) => run.status === 'running').length;
  return {
    kind: 'danbi.render-worker-daemon-status',
    workerId: state.workerId,
    host: state.host,
    port: state.port,
    url: state.url,
    startedAt: state.startedAt,
    authRequired: Boolean(state.authToken),
    discovery: state.discovery ? {
      enabled: true,
      port: state.discoveryPort,
    } : undefined,
    activeRuns: runs.filter((run) => run.status === 'queued' || run.status === 'running').length,
    queuedRuns,
    runningRuns,
    maxConcurrentRuns: state.maxConcurrentRuns,
    completedRuns: runs.filter((run) => run.status === 'completed').length,
    failedRuns: runs.filter((run) => run.status === 'failed').length,
    runs: runs.map(summarizeRun).reverse().slice(0, 50),
  };
}

function summarizeRun(run: RenderWorkerDaemonRunRecord): RenderWorkerDaemonRunSummary {
  return {
    id: run.id,
    status: run.status,
    submittedAt: run.submittedAt,
    dryRun: run.dryRun,
    executeBlocked: run.executeBlocked,
    jobIds: run.jobIds,
    sourceBatchId: run.sourceBatchId,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    lease: run.lease,
    totalJobs: run.report?.summary.totalJobs ?? run.progress?.totalJobs,
    pendingJobs: run.progress?.pendingJobs,
    runningJobs: run.progress?.runningJobs,
    plannedJobs: run.report?.summary.plannedJobs ?? run.progress?.plannedJobs,
    completedJobs: run.report?.summary.completedJobs ?? run.progress?.completedJobs,
    blockedJobs: run.report?.summary.blockedJobs ?? run.progress?.blockedJobs,
    skippedJobs: run.report?.summary.skippedJobs ?? run.progress?.skippedJobs,
    failedJobs: run.report?.summary.failedJobs ?? run.progress?.failedJobs,
    error: run.error,
  };
}

function buildRunLease(state: RenderWorkerDaemonState): NonNullable<RenderWorkerDaemonRunRecord['lease']> {
  const now = state.now();
  return {
    workerId: state.workerId,
    acquiredAt: now,
    heartbeatAt: now,
    expiresAt: addSeconds(now, state.runLeaseSeconds),
  };
}

function refreshRunLease(
  lease: NonNullable<RenderWorkerDaemonRunRecord['lease']> | undefined,
  state: RenderWorkerDaemonState,
): NonNullable<RenderWorkerDaemonRunRecord['lease']> {
  const now = state.now();
  return {
    workerId: state.workerId,
    acquiredAt: lease?.acquiredAt ?? now,
    heartbeatAt: now,
    expiresAt: addSeconds(now, state.runLeaseSeconds),
  };
}

function readRunId(pathname: string): string | undefined {
  const match = pathname.match(/^\/runs\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function readRunEventsId(pathname: string): string | undefined {
  const match = pathname.match(/^\/runs\/([^/]+)\/events$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function openRunEventStream(
  request: IncomingMessage,
  response: ServerResponse,
  state: RenderWorkerDaemonState,
  runId: string,
): void {
  const run = state.runs.get(runId);
  if (!run) {
    sendJson(response, 404, { error: `Unknown render worker run: ${runId}` });
    return;
  }

  setCommonHeaders(response);
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.flushHeaders();
  writeRunEvent(response, buildRunEvent(state, run, 'snapshot'));

  const subscribers = state.runSubscribers.get(runId) ?? new Set<ServerResponse>();
  subscribers.add(response);
  state.runSubscribers.set(runId, subscribers);

  request.on('close', () => {
    removeRunEventSubscriber(state, runId, response);
  });
}

function broadcastRunEvent(
  state: RenderWorkerDaemonState,
  run: RenderWorkerDaemonRunRecord,
  type: RenderWorkerDaemonRunEventType,
): void {
  const subscribers = state.runSubscribers.get(run.id);
  if (!subscribers || subscribers.size === 0) {
    return;
  }

  const event = buildRunEvent(state, run, type);
  for (const response of Array.from(subscribers)) {
    if (response.destroyed || response.writableEnded) {
      subscribers.delete(response);
      continue;
    }

    try {
      writeRunEvent(response, event);
    } catch {
      subscribers.delete(response);
      response.destroy();
    }
  }

  if (subscribers.size === 0) {
    state.runSubscribers.delete(run.id);
  }
}

function buildRunEvent(
  state: RenderWorkerDaemonState,
  run: RenderWorkerDaemonRunRecord,
  type: RenderWorkerDaemonRunEventType,
): RenderWorkerDaemonRunEvent {
  return {
    kind: 'danbi.render-worker-daemon-run-event',
    type,
    emittedAt: state.now(),
    run,
  };
}

function writeRunEvent(response: ServerResponse, event: RenderWorkerDaemonRunEvent): void {
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function broadcastFleetEvent(
  state: RenderWorkerDaemonState,
  type: RenderWorkerDaemonFleetEventType,
  run?: RenderWorkerDaemonRunRecord,
): void {
  if (state.fleetSubscribers.size === 0) {
    return;
  }

  const event = buildFleetEvent(state, type, run);
  for (const socket of Array.from(state.fleetSubscribers)) {
    if (socket.destroyed || !socket.writable) {
      state.fleetSubscribers.delete(socket);
      continue;
    }

    try {
      writeFleetEvent(socket, event);
    } catch {
      state.fleetSubscribers.delete(socket);
      socket.destroy();
    }
  }
}

function buildFleetEvent(
  state: RenderWorkerDaemonState,
  type: RenderWorkerDaemonFleetEventType,
  run?: RenderWorkerDaemonRunRecord,
): RenderWorkerDaemonFleetEvent {
  return {
    kind: 'danbi.render-worker-daemon-fleet-event',
    type,
    emittedAt: state.now(),
    status: buildDaemonStatus(state),
    ...(run ? { run } : {}),
  };
}

function writeFleetEvent(socket: Duplex, event: RenderWorkerDaemonFleetEvent): void {
  socket.write(encodeWebSocketTextFrame(JSON.stringify(event)));
}

function encodeWebSocketTextFrame(message: string): Buffer {
  const payload = Buffer.from(message, 'utf8');
  if (payload.length < 126) {
    return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  }

  if (payload.length <= 0xffff) {
    const header = Buffer.allocUnsafe(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
    return Buffer.concat([header, payload]);
  }

  const header = Buffer.allocUnsafe(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(payload.length), 2);
  return Buffer.concat([header, payload]);
}

function removeRunEventSubscriber(
  state: RenderWorkerDaemonState,
  runId: string,
  response: ServerResponse,
): void {
  const subscribers = state.runSubscribers.get(runId);
  if (!subscribers) {
    return;
  }

  subscribers.delete(response);
  if (subscribers.size === 0) {
    state.runSubscribers.delete(runId);
  }
}

function closeRunEventSubscribers(state: RenderWorkerDaemonState): void {
  for (const subscribers of state.runSubscribers.values()) {
    for (const response of subscribers) {
      if (!response.destroyed && !response.writableEnded) {
        response.end();
      }
    }
  }
  state.runSubscribers.clear();
}

function closeFleetEventSubscribers(state: RenderWorkerDaemonState): void {
  for (const socket of state.fleetSubscribers) {
    if (!socket.destroyed) {
      socket.end();
    }
  }
  state.fleetSubscribers.clear();
}

function readJsonBody<T>(request: IncomingMessage, maxBytes: number): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;

    request.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error('Render worker daemon request body is too large.'));
        request.destroy();
        return;
      }

      body += chunk.toString('utf8');
    });
    request.on('error', reject);
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}') as T);
      } catch {
        reject(new Error('Render worker daemon request body must be valid JSON.'));
      }
    });
  });
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  if (!response.headersSent) {
    setCommonHeaders(response);
    response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  }
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function setCommonHeaders(response: ServerResponse): void {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Danbi-Render-Worker-Token');
  response.setHeader('Cache-Control', 'no-store');
}

function isAuthorizedRenderWorkerRequest(
  request: IncomingMessage,
  requestUrl: URL,
  authToken: string,
): boolean {
  const candidates = [
    readBearerToken(request.headers.authorization),
    readHeaderToken(request.headers['x-danbi-render-worker-token']),
    requestUrl.searchParams.get('token'),
  ].filter((value): value is string => Boolean(value));

  return candidates.some((candidate) => constantTimeEqual(candidate, authToken));
}

function readBearerToken(value: string | string[] | undefined): string | undefined {
  const header = Array.isArray(value) ? value[0] : value;
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

function readHeaderToken(value: string | string[] | undefined): string | undefined {
  const header = Array.isArray(value) ? value[0] : value;
  return header?.trim() || undefined;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

async function listenOnFetchReachablePort(server: Server, requestedPort: number, host: string): Promise<number> {
  const randomPort = requestedPort === 0;
  const maxAttempts = randomPort ? RANDOM_PORT_MAX_ATTEMPTS : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await listen(server, requestedPort, host);
    const address = server.address() as AddressInfo;
    const boundPort = address.port;
    if (!isFetchBlockedRenderWorkerDaemonPort(boundPort)) {
      return boundPort;
    }

    await closeServer(server);
    if (!randomPort) {
      throw new Error(`Render worker daemon port ${boundPort} is blocked by Fetch clients; choose another port.`);
    }
  }

  throw new Error(`Could not bind a Fetch-reachable random render worker daemon port after ${maxAttempts} attempts.`);
}

export function isFetchBlockedRenderWorkerDaemonPort(port: number): boolean {
  if (FETCH_BLOCKED_PORTS.has(port)) {
    return true;
  }

  return FETCH_BLOCKED_PORT_RANGES.some(([start, end]) => port >= start && port <= end);
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function formatHostForUrl(host: string): string {
  return host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
}

function normalizeJobIds(jobIds: string[] | undefined): string[] {
  return Array.isArray(jobIds) ? jobIds.map((jobId) => jobId.trim()).filter(Boolean) : [];
}

function sanitizeRunId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || `run-${Date.now()}`;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid render worker daemon port: ${value}`);
  }

  return port;
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return parsed;
}

function normalizeAuthToken(value: string | undefined): string | undefined {
  const token = value?.trim();
  if (!token) {
    return undefined;
  }
  if (token.length < 8) {
    throw new Error('Render worker auth token must be at least 8 characters.');
  }
  if (token.includes('\0') || /\s/.test(token)) {
    throw new Error('Render worker auth token cannot contain whitespace or null bytes.');
  }
  return token;
}

function readRequiredValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function defaultNow(): string {
  return new Date().toISOString();
}

function addSeconds(value: string, seconds: number): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    return value;
  }

  return new Date(time + seconds * 1000).toISOString();
}
