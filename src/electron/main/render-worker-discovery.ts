import { randomUUID } from 'node:crypto';
import { createSocket, type RemoteInfo, type Socket } from 'node:dgram';
import type {
  RenderWorkerDaemonStatus,
  RenderWorkerDiscoveryAnnouncement,
  RenderWorkerDiscoveryProbe,
} from '../shared/render-worker-contract';
import {
  RENDER_WORKER_DISCOVERY_ANNOUNCEMENT_KIND,
  RENDER_WORKER_DISCOVERY_PROBE_KIND,
  RENDER_WORKER_DISCOVERY_SCHEMA_VERSION,
} from '../shared/render-worker-contract';
import type {
  EditorRenderWorkerLanDiscoveryRequest,
  EditorRenderWorkerLanDiscoveryResponse,
} from '../shared/ipc-contract';

export const DEFAULT_RENDER_WORKER_DISCOVERY_PORT = 47684;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 800;
const DEFAULT_DISCOVERY_ADDRESSES = ['255.255.255.255', '127.0.0.1'];

export interface RenderWorkerDiscoveryResponder {
  port: number;
  close: () => Promise<void>;
}

export interface StartRenderWorkerDiscoveryResponderOptions {
  host?: string;
  port?: number;
  getStatus: () => RenderWorkerDaemonStatus;
}

export async function startRenderWorkerDiscoveryResponder({
  host = '0.0.0.0',
  port = DEFAULT_RENDER_WORKER_DISCOVERY_PORT,
  getStatus,
}: StartRenderWorkerDiscoveryResponderOptions): Promise<RenderWorkerDiscoveryResponder> {
  const socket = createSocket('udp4');

  socket.on('message', (message, remote) => {
    const probe = parseDiscoveryProbe(message);
    if (!probe) {
      return;
    }

    const status = getStatus();
    const announcement = buildDiscoveryAnnouncement(status, probe.probeId);
    const payload = Buffer.from(JSON.stringify(announcement), 'utf8');
    socket.send(payload, remote.port, remote.address);
  });

  await bindUdpSocket(socket, port, host);
  const address = socket.address();
  const boundPort = typeof address === 'object' ? address.port : port;

  return {
    port: boundPort,
    close: () => closeUdpSocket(socket),
  };
}

export async function discoverRenderWorkerDaemonAnnouncements(
  request: EditorRenderWorkerLanDiscoveryRequest = {},
): Promise<EditorRenderWorkerLanDiscoveryResponse> {
  const port = normalizeDiscoveryPort(request.port);
  const timeoutMs = normalizeDiscoveryTimeout(request.timeoutMs);
  const broadcastAddresses = normalizeDiscoveryAddresses(request.broadcastAddresses);
  const probeId = randomUUID();
  const socket = createSocket('udp4');
  const announcements = new Map<string, RenderWorkerDiscoveryAnnouncement>();
  const warnings: string[] = [];

  socket.on('message', (message, remote) => {
    const announcement = parseDiscoveryAnnouncement(message, probeId, remote);
    if (!announcement) {
      return;
    }

    announcements.set(`${announcement.workerId}:${announcement.url}`, announcement);
  });

  try {
    await bindUdpSocket(socket, 0, '0.0.0.0');
    socket.setBroadcast(true);

    const probe: RenderWorkerDiscoveryProbe = {
      schemaVersion: RENDER_WORKER_DISCOVERY_SCHEMA_VERSION,
      kind: RENDER_WORKER_DISCOVERY_PROBE_KIND,
      probeId,
    };
    const payload = Buffer.from(JSON.stringify(probe), 'utf8');
    for (const address of broadcastAddresses) {
      try {
        await sendUdpMessage(socket, payload, port, address);
      } catch (error) {
        warnings.push(`Discovery probe to ${address}:${port} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await wait(timeoutMs);
  } finally {
    await closeUdpSocket(socket);
  }

  const sortedAnnouncements = Array.from(announcements.values()).sort((a, b) => (
    a.workerId.localeCompare(b.workerId) || a.url.localeCompare(b.url)
  ));

  return {
    kind: 'danbi.render-worker.lan-discovery',
    candidates: sortedAnnouncements.map((announcement) => announcement.url),
    announcements: sortedAnnouncements,
    warnings,
  };
}

function buildDiscoveryAnnouncement(
  status: RenderWorkerDaemonStatus,
  probeId: string,
): RenderWorkerDiscoveryAnnouncement {
  return {
    schemaVersion: RENDER_WORKER_DISCOVERY_SCHEMA_VERSION,
    kind: RENDER_WORKER_DISCOVERY_ANNOUNCEMENT_KIND,
    probeId,
    workerId: status.workerId,
    host: status.host,
    port: status.port,
    url: status.url,
    startedAt: status.startedAt,
    authRequired: Boolean(status.authRequired),
    discoveryPort: status.discovery?.port ?? DEFAULT_RENDER_WORKER_DISCOVERY_PORT,
  };
}

function parseDiscoveryProbe(message: Buffer): RenderWorkerDiscoveryProbe | undefined {
  const data = parseJsonObject(message);
  if (
    data?.kind !== RENDER_WORKER_DISCOVERY_PROBE_KIND ||
    data.schemaVersion !== RENDER_WORKER_DISCOVERY_SCHEMA_VERSION ||
    typeof data.probeId !== 'string' ||
    !data.probeId.trim()
  ) {
    return undefined;
  }

  return {
    schemaVersion: RENDER_WORKER_DISCOVERY_SCHEMA_VERSION,
    kind: RENDER_WORKER_DISCOVERY_PROBE_KIND,
    probeId: data.probeId.trim(),
  };
}

function parseDiscoveryAnnouncement(
  message: Buffer,
  probeId: string,
  remote: RemoteInfo,
): RenderWorkerDiscoveryAnnouncement | undefined {
  const data = parseJsonObject(message);
  if (
    data?.kind !== RENDER_WORKER_DISCOVERY_ANNOUNCEMENT_KIND ||
    data.schemaVersion !== RENDER_WORKER_DISCOVERY_SCHEMA_VERSION ||
    data.probeId !== probeId ||
    typeof data.workerId !== 'string' ||
    typeof data.host !== 'string' ||
    typeof data.port !== 'number' ||
    typeof data.url !== 'string' ||
    typeof data.startedAt !== 'string' ||
    typeof data.authRequired !== 'boolean' ||
    typeof data.discoveryPort !== 'number'
  ) {
    return undefined;
  }

  const port = normalizeDiscoveryPort(data.port);
  return {
    schemaVersion: RENDER_WORKER_DISCOVERY_SCHEMA_VERSION,
    kind: RENDER_WORKER_DISCOVERY_ANNOUNCEMENT_KIND,
    probeId,
    workerId: data.workerId,
    host: data.host,
    port,
    url: rewriteLoopbackAnnouncementUrl(data.url, remote.address, port),
    startedAt: data.startedAt,
    authRequired: data.authRequired,
    discoveryPort: normalizeDiscoveryPort(data.discoveryPort),
  };
}

function rewriteLoopbackAnnouncementUrl(url: string, remoteAddress: string, port: number): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '0.0.0.0') {
      parsed.hostname = remoteAddress;
      parsed.port = String(port);
      return parsed.toString().replace(/\/$/, '');
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return `http://${formatHostForUrl(remoteAddress)}:${port}`;
  }
}

function parseJsonObject(message: Buffer): Record<string, unknown> | undefined {
  try {
    const data = JSON.parse(message.toString('utf8')) as unknown;
    return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function normalizeDiscoveryPort(value: number | undefined): number {
  const port = value ?? DEFAULT_RENDER_WORKER_DISCOVERY_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid render worker discovery port: ${String(value)}`);
  }

  return port;
}

function normalizeDiscoveryTimeout(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_DISCOVERY_TIMEOUT_MS;
  }

  if (!Number.isFinite(value) || value < 50 || value > 5000) {
    throw new Error(`Invalid render worker discovery timeout: ${String(value)}`);
  }

  return Math.floor(value);
}

function normalizeDiscoveryAddresses(value: string[] | undefined): string[] {
  const addresses = value?.length ? value : DEFAULT_DISCOVERY_ADDRESSES;
  return Array.from(new Set(addresses.map((address) => address.trim()).filter(Boolean)));
}

function bindUdpSocket(socket: Socket, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      socket.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      socket.off('error', onError);
      resolve();
    };

    socket.once('error', onError);
    socket.once('listening', onListening);
    socket.bind(port, host);
  });
}

function sendUdpMessage(socket: Socket, payload: Buffer, port: number, address: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.send(payload, port, address, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function closeUdpSocket(socket: Socket): Promise<void> {
  return new Promise((resolve) => {
    try {
      socket.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

function wait(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}

function formatHostForUrl(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}
