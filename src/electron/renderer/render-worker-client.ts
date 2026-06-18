import type {
  EditorRenderWorkerLanDiscoveryRequest,
  EditorRenderWorkerLanDiscoveryResponse,
} from '../shared/ipc-contract';
import type {
  RenderWorkerDaemonHealth,
  RenderWorkerDaemonFleetEvent,
  RenderWorkerDaemonRunEvent,
  RenderWorkerDaemonRunRecord,
  RenderWorkerDaemonStatus,
  RenderWorkerDaemonSubmitRequest,
  RenderWorkerDaemonSubmitResponse,
} from '../shared/render-worker-contract';
import { getWindowEditorIpcClient } from './editor-ipc-client';
import { normalizeRenderWorkerDaemonUrl } from './render-worker-controller-helpers';

export interface RenderWorkerDaemonRunEventHandlers {
  onEvent: (event: RenderWorkerDaemonRunEvent) => void;
  onError?: () => void;
}

export interface RenderWorkerDaemonFleetEventHandlers {
  onEvent: (event: RenderWorkerDaemonFleetEvent) => void;
  onError?: () => void;
}

export interface RenderWorkerDaemonDiscoveryAttempt {
  url: string;
  ok: boolean;
  workerId?: string;
  error?: string;
}

export interface RenderWorkerDaemonDiscoveryResult {
  found: boolean;
  url?: string;
  status?: RenderWorkerDaemonStatus;
  attempts: RenderWorkerDaemonDiscoveryAttempt[];
}

export interface RenderWorkerDaemonFleetDiscoveryResult {
  found: boolean;
  statuses: RenderWorkerDaemonStatus[];
  attempts: RenderWorkerDaemonDiscoveryAttempt[];
}

export interface RenderWorkerDaemonClientOptions {
  authToken?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function fetchRenderWorkerDaemonHealth(
  daemonUrl: string,
  options: RenderWorkerDaemonClientOptions = {},
): Promise<RenderWorkerDaemonHealth> {
  return fetchRenderWorkerJson<RenderWorkerDaemonHealth>(daemonUrl, '/health', options);
}

export async function fetchRenderWorkerDaemonStatus(
  daemonUrl: string,
  options: RenderWorkerDaemonClientOptions = {},
): Promise<RenderWorkerDaemonStatus> {
  return fetchRenderWorkerJson<RenderWorkerDaemonStatus>(daemonUrl, '/status', options);
}

export async function discoverRenderWorkerDaemon({
  candidates,
  timeoutMs = 900,
  authToken,
}: {
  candidates: string[];
  timeoutMs?: number;
  authToken?: string;
}): Promise<RenderWorkerDaemonDiscoveryResult> {
  const attempts: RenderWorkerDaemonDiscoveryAttempt[] = [];

  for (const candidate of dedupeCandidates(candidates)) {
    const result = await probeRenderWorkerDaemon(candidate, timeoutMs, { authToken });
    attempts.push(result.attempt);
    if (result.status) {
      return {
        found: true,
        url: result.attempt.url,
        status: result.status,
        attempts,
      };
    }
  }

  return {
    found: false,
    attempts,
  };
}

export async function discoverRenderWorkerDaemons({
  candidates,
  timeoutMs = 900,
  authToken,
}: {
  candidates: string[];
  timeoutMs?: number;
  authToken?: string;
}): Promise<RenderWorkerDaemonFleetDiscoveryResult> {
  const results = await Promise.all(dedupeCandidates(candidates).map((candidate) => (
    probeRenderWorkerDaemon(candidate, timeoutMs, { authToken })
  )));
  const statuses = results
    .map((result) => result.status)
    .filter((status): status is RenderWorkerDaemonStatus => Boolean(status))
    .sort((a, b) => a.workerId.localeCompare(b.workerId));

  return {
    found: statuses.length > 0,
    statuses,
    attempts: results.map((result) => result.attempt),
  };
}

export async function discoverRenderWorkerDaemonLanCandidates(
  request: EditorRenderWorkerLanDiscoveryRequest = {},
): Promise<EditorRenderWorkerLanDiscoveryResponse> {
  const client = getWindowEditorIpcClient();
  if (!client?.renderWorkers?.discoverLan) {
    return {
      kind: 'danbi.render-worker.lan-discovery',
      candidates: [],
      announcements: [],
      warnings: ['Electron render worker LAN discovery is not available in this runtime.'],
    };
  }

  return client.renderWorkers.discoverLan(request) as Promise<EditorRenderWorkerLanDiscoveryResponse>;
}

export async function fetchRenderWorkerDaemonRun(
  daemonUrl: string,
  runId: string,
  options: RenderWorkerDaemonClientOptions = {},
): Promise<RenderWorkerDaemonRunRecord> {
  const data = await fetchRenderWorkerJson<{ run?: RenderWorkerDaemonRunRecord }>(
    daemonUrl,
    `/runs/${encodeURIComponent(runId)}`,
    options,
  );
  if (!data.run) {
    throw new Error(`Render worker run not found: ${runId}`);
  }

  return data.run;
}

export async function submitRenderWorkerDaemonRun(
  daemonUrl: string,
  request: RenderWorkerDaemonSubmitRequest,
  options: RenderWorkerDaemonClientOptions = {},
): Promise<RenderWorkerDaemonSubmitResponse> {
  const baseUrl = normalizeRenderWorkerDaemonUrl(daemonUrl);
  const timeout = createRenderWorkerRequestTimeout(options);

  try {
    const response = await fetch(`${baseUrl}/runs`, {
      method: 'POST',
      headers: buildRenderWorkerHeaders({
        'Content-Type': 'application/json',
      }, options),
      body: JSON.stringify(request),
      signal: timeout.signal,
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(readRenderWorkerError(data, response.statusText));
    }

    return data as RenderWorkerDaemonSubmitResponse;
  } finally {
    timeout.clear();
  }
}

export function subscribeRenderWorkerDaemonRunEvents(
  daemonUrl: string,
  runId: string,
  handlers: RenderWorkerDaemonRunEventHandlers,
  options: RenderWorkerDaemonClientOptions = {},
): (() => void) | undefined {
  if (typeof EventSource === 'undefined') {
    return undefined;
  }
  if (options.signal?.aborted) {
    return undefined;
  }

  const baseUrl = normalizeRenderWorkerDaemonUrl(daemonUrl);
  const source = new EventSource(buildRenderWorkerUrl(
    baseUrl,
    `/runs/${encodeURIComponent(runId)}/events`,
    options,
  ));
  let closed = false;
  let openTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;

  const clearOpenTimeout = () => {
    if (openTimeout !== undefined) {
      globalThis.clearTimeout(openTimeout);
      openTimeout = undefined;
    }
  };
  const close = () => {
    if (closed) {
      return;
    }

    closed = true;
    clearOpenTimeout();
    options.signal?.removeEventListener('abort', handleAbort);
    source.onopen = null;
    source.onerror = null;
    for (const eventType of eventTypes) {
      source.removeEventListener(eventType, handleEvent as EventListener);
    }
    source.close();
  };
  const handleAbort = () => close();
  const handleOpen = () => clearOpenTimeout();

  const handleEvent = (event: MessageEvent<string>) => {
    clearOpenTimeout();
    try {
      handlers.onEvent(JSON.parse(event.data) as RenderWorkerDaemonRunEvent);
    } catch {
      handlers.onError?.();
    }
  };
  const handleError = () => {
    if (!closed) {
      handlers.onError?.();
    }
  };
  const eventTypes: RenderWorkerDaemonRunEvent['type'][] = ['snapshot', 'progress', 'completed', 'failed'];

  for (const eventType of eventTypes) {
    source.addEventListener(eventType, handleEvent as EventListener);
  }
  source.onopen = handleOpen;
  source.onerror = handleError;
  options.signal?.addEventListener('abort', handleAbort, { once: true });
  if (options.timeoutMs && options.timeoutMs > 0) {
    openTimeout = globalThis.setTimeout(() => {
      if (!closed) {
        handlers.onError?.();
      }
      close();
    }, Math.max(1, options.timeoutMs));
  }

  return close;
}

export function subscribeRenderWorkerDaemonFleetEvents(
  daemonUrl: string,
  handlers: RenderWorkerDaemonFleetEventHandlers,
  options: RenderWorkerDaemonClientOptions = {},
): (() => void) | undefined {
  if (typeof WebSocket === 'undefined') {
    return undefined;
  }
  if (options.signal?.aborted) {
    return undefined;
  }

  const socket = new WebSocket(buildRenderWorkerUrl(
    toRenderWorkerWebSocketBaseUrl(daemonUrl),
    '/events',
    options,
  ));
  let closed = false;
  let openTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;

  const clearOpenTimeout = () => {
    if (openTimeout !== undefined) {
      globalThis.clearTimeout(openTimeout);
      openTimeout = undefined;
    }
  };
  const close = () => {
    if (closed) {
      return;
    }

    closed = true;
    clearOpenTimeout();
    options.signal?.removeEventListener('abort', handleAbort);
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.close();
  };
  const handleAbort = () => close();

  socket.onopen = () => {
    clearOpenTimeout();
  };
  socket.onmessage = (event) => {
    clearOpenTimeout();
    try {
      handlers.onEvent(JSON.parse(String(event.data)) as RenderWorkerDaemonFleetEvent);
    } catch {
      handlers.onError?.();
    }
  };
  socket.onerror = () => {
    if (!closed) {
      handlers.onError?.();
    }
  };
  options.signal?.addEventListener('abort', handleAbort, { once: true });
  if (options.timeoutMs && options.timeoutMs > 0) {
    openTimeout = globalThis.setTimeout(() => {
      if (!closed) {
        handlers.onError?.();
      }
      close();
    }, Math.max(1, options.timeoutMs));
  }

  return close;
}

async function fetchRenderWorkerJson<T>(
  daemonUrl: string,
  path: string,
  options: RenderWorkerDaemonClientOptions = {},
): Promise<T> {
  const baseUrl = normalizeRenderWorkerDaemonUrl(daemonUrl);
  const timeout = createRenderWorkerRequestTimeout(options);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: buildRenderWorkerHeaders({}, options),
      signal: timeout.signal,
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(readRenderWorkerError(data, response.statusText));
    }

    return data as T;
  } finally {
    timeout.clear();
  }
}

function readRenderWorkerError(data: unknown, fallback: string): string {
  return data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
    ? (data as { error: string }).error
    : fallback;
}

async function probeRenderWorkerDaemon(
  candidate: string,
  timeoutMs: number,
  options: RenderWorkerDaemonClientOptions = {},
): Promise<{ attempt: RenderWorkerDaemonDiscoveryAttempt; status?: RenderWorkerDaemonStatus }> {
  const url = normalizeRenderWorkerDaemonUrl(candidate);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timeout = controller && timeoutMs > 0
    ? globalThis.setTimeout(() => controller.abort(), timeoutMs)
    : undefined;

  try {
    const status = await fetchRenderWorkerJson<RenderWorkerDaemonStatus>(url, '/status', {
      signal: controller?.signal,
      authToken: options.authToken,
    });
    return {
      attempt: { url, ok: true, workerId: status.workerId },
      status,
    };
  } catch (error) {
    return {
      attempt: {
        url,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  } finally {
    if (timeout !== undefined) {
      globalThis.clearTimeout(timeout);
    }
  }
}

function createRenderWorkerRequestTimeout(
  options: RenderWorkerDaemonClientOptions,
): { signal?: AbortSignal; clear: () => void } {
  if (!options.timeoutMs || options.timeoutMs <= 0 || typeof AbortController === 'undefined') {
    return {
      signal: options.signal,
      clear: () => undefined,
    };
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), Math.max(1, options.timeoutMs));
  const abortFromParent = () => controller.abort();

  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener('abort', abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    clear: () => {
      globalThis.clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abortFromParent);
    },
  };
}

function buildRenderWorkerHeaders(
  baseHeaders: Record<string, string>,
  options: RenderWorkerDaemonClientOptions,
): Record<string, string> {
  const token = normalizeAuthToken(options.authToken);
  return {
    ...baseHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function buildRenderWorkerUrl(
  baseUrl: string,
  path: string,
  options: RenderWorkerDaemonClientOptions,
): string {
  const url = new URL(`${baseUrl}${path}`);
  const token = normalizeAuthToken(options.authToken);
  if (token) {
    url.searchParams.set('token', token);
  }
  return url.toString();
}

function normalizeAuthToken(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function dedupeCandidates(candidates: string[]): string[] {
  return Array.from(new Set(candidates.map(normalizeRenderWorkerDaemonUrl)));
}

function toRenderWorkerWebSocketBaseUrl(daemonUrl: string): string {
  const normalized = normalizeRenderWorkerDaemonUrl(daemonUrl);
  if (normalized.startsWith('https://')) {
    return `wss://${normalized.slice('https://'.length)}`;
  }

  return `ws://${normalized.replace(/^https?:\/\//i, '')}`;
}
