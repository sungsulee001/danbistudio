/**
 * ComfyUI Client Library
 *
 * Provides methods to interact with ComfyUI REST API
 */

export interface ComfyUIClientConfig {
  baseUrl: string;
  allowedUrls?: string[];
  allowLocalhost?: boolean;
  requestTimeoutMs?: number;
  queueTimeoutMs?: number;
  uploadTimeoutMs?: number;
  statusTimeoutMs?: number;
  healthTimeoutMs?: number;
}

export interface QueuePromptResponse {
  prompt_id: string;
  number: number;
  node_errors?: Record<string, unknown>;
}

export interface PromptStatus {
  status: string;
  outputs?: any;
}

export interface ComfyUIImageUploadResponse {
  name: string;
  subfolder: string;
  type: string;
}

export interface ComfyUIImageUploadOptions {
  filename: string;
  mimeType?: string;
  type?: 'input' | 'output' | 'temp';
  overwrite?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ComfyUIRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_COMFYUI_REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_COMFYUI_QUEUE_TIMEOUT_MS = 15000;
const DEFAULT_COMFYUI_UPLOAD_TIMEOUT_MS = 30000;
const DEFAULT_COMFYUI_STATUS_TIMEOUT_MS = 5000;
const DEFAULT_COMFYUI_HEALTH_TIMEOUT_MS = 5000;

export class ComfyUIClient {
  private baseUrl: string;
  private allowedUrls: string[];
  private allowLocalhost: boolean;
  private queueTimeoutMs: number;
  private uploadTimeoutMs: number;
  private statusTimeoutMs: number;
  private healthTimeoutMs: number;

  constructor(config: ComfyUIClientConfig) {
    this.baseUrl = config.baseUrl;
    this.allowedUrls = config.allowedUrls ?? [];
    this.allowLocalhost = config.allowLocalhost ?? true;
    const requestTimeoutMs = config.requestTimeoutMs === undefined
      ? undefined
      : normalizeComfyUITimeout(config.requestTimeoutMs, DEFAULT_COMFYUI_REQUEST_TIMEOUT_MS);
    this.queueTimeoutMs = normalizeComfyUITimeout(config.queueTimeoutMs, requestTimeoutMs ?? DEFAULT_COMFYUI_QUEUE_TIMEOUT_MS);
    this.uploadTimeoutMs = normalizeComfyUITimeout(config.uploadTimeoutMs, requestTimeoutMs ?? DEFAULT_COMFYUI_UPLOAD_TIMEOUT_MS);
    this.statusTimeoutMs = normalizeComfyUITimeout(config.statusTimeoutMs, requestTimeoutMs ?? DEFAULT_COMFYUI_STATUS_TIMEOUT_MS);
    this.healthTimeoutMs = normalizeComfyUITimeout(config.healthTimeoutMs, requestTimeoutMs ?? DEFAULT_COMFYUI_HEALTH_TIMEOUT_MS);
  }

  /**
   * Queue a workflow prompt to ComfyUI
   */
  async queuePrompt(
    workflow: object,
    clientId: string = 'danbistudio',
    options: ComfyUIRequestOptions = {},
  ): Promise<QueuePromptResponse> {
    const response = await this.fetchComfyUI('/prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: workflow,
        client_id: clientId
      }),
    }, options, this.queueTimeoutMs);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to queue prompt: ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Upload a source image into ComfyUI's input storage for image-to-video workflows.
   */
  async uploadImage(image: Uint8Array | Blob, options: ComfyUIImageUploadOptions): Promise<ComfyUIImageUploadResponse> {
    const formData = new FormData();
    const blob = image instanceof Blob
      ? image
      : new Blob([image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength) as ArrayBuffer], {
        type: options.mimeType || 'application/octet-stream',
      });

    formData.append('image', blob, options.filename);
    formData.append('type', options.type ?? 'input');
    formData.append('overwrite', (options.overwrite ?? true) ? 'true' : 'false');

    const response = await this.fetchComfyUI('/upload/image', {
      method: 'POST',
      body: formData,
    }, options, this.uploadTimeoutMs);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload image to ComfyUI: ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Get the status of a queued prompt
   */
  async getPromptStatus(promptId: string, options: ComfyUIRequestOptions = {}): Promise<PromptStatus> {
    const response = await this.fetchComfyUI(
      `/history/${encodeURIComponent(promptId)}`,
      {},
      options,
      this.statusTimeoutMs,
    );

    if (!response.ok) {
      throw new Error(`Failed to get prompt status: ${response.statusText}`);
    }

    const history = await response.json();
    const promptData = history[promptId];

    if (!promptData) {
      throw new Error(`Prompt ${promptId} not found in history`);
    }

    return {
      status: promptData.status?.status_str || 'unknown',
      outputs: promptData.outputs
    };
  }

  /**
   * Check if ComfyUI server is healthy
   */
  async isHealthy(options: ComfyUIRequestOptions = {}): Promise<boolean> {
    try {
      const response = await this.fetchComfyUI('/system_stats', {}, options, this.healthTimeoutMs);
      return response.ok;
    } catch {
      return false;
    }
  }

  private async fetchComfyUI(
    pathname: string,
    init: RequestInit,
    options: ComfyUIRequestOptions,
    fallbackTimeoutMs: number,
  ): Promise<Response> {
    const timeout = createComfyUITimeoutSignal(
      normalizeComfyUITimeout(options.timeoutMs, fallbackTimeoutMs),
      options.signal,
    );

    try {
      return await fetch(this.buildEndpoint(pathname), timeout.signal ? { ...init, signal: timeout.signal } : init);
    } finally {
      timeout.clear();
    }
  }

  private buildEndpoint(pathname: string): string {
    const validation = validateComfyUIBaseUrl(this.baseUrl, {
      allowedUrls: this.allowedUrls,
      allowLocalhost: this.allowLocalhost,
    });
    if (!validation.ok) {
      throw new Error(validation.reason);
    }

    return new URL(pathname, validation.url).href;
  }
}

// Default client instance
export const comfyuiClient = new ComfyUIClient(readComfyUIClientConfig());

export interface ComfyUIClientSafetyOptions {
  allowedUrls?: string[];
  allowLocalhost?: boolean;
}

export interface ResolvedComfyUIClientConfig extends Required<ComfyUIClientSafetyOptions> {
  baseUrl: string;
}

export function readComfyUIClientConfig(
  env: Record<string, string | undefined> = process.env,
): ResolvedComfyUIClientConfig {
  return {
    baseUrl: env.COMFYUI_URL || 'http://localhost:8188',
    allowedUrls: parseComfyUIAllowlist(env.COMFYUI_ALLOWED_URLS ?? env.COMFYUI_ALLOWLIST),
    allowLocalhost: readBooleanEnv(env.COMFYUI_ALLOW_LOCALHOST, true),
  };
}

export function parseComfyUIAllowlist(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function validateComfyUIBaseUrl(
  baseUrl: string,
  options: ComfyUIClientSafetyOptions = {},
): { ok: true; url: URL } | { ok: false; reason: string } {
  const trimmedBaseUrl = baseUrl.trim();
  if (!trimmedBaseUrl) {
    return { ok: false, reason: 'ComfyUI server URL is missing.' };
  }

  let url: URL;
  try {
    url = new URL(trimmedBaseUrl);
  } catch {
    return { ok: false, reason: `ComfyUI server URL is invalid: ${baseUrl}` };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `ComfyUI server protocol must be http or https: ${url.protocol}` };
  }

  if (url.username || url.password) {
    return { ok: false, reason: 'ComfyUI server URL must not include credentials.' };
  }

  if ((options.allowLocalhost ?? true) && isLocalhost(url.hostname)) {
    return { ok: true, url: normalizeComfyUIBaseUrl(url) };
  }

  if ((options.allowedUrls ?? []).some((entry) => matchesComfyUIAllowlistEntry(url, entry))) {
    return { ok: true, url: normalizeComfyUIBaseUrl(url) };
  }

  return {
    ok: false,
    reason: 'ComfyUI target is not allowed. Use localhost/127.0.0.1, or add the server to COMFYUI_ALLOWED_URLS for explicit remote execution.',
  };
}

function normalizeComfyUIBaseUrl(url: URL): URL {
  return new URL(`${url.protocol}//${url.host}/`);
}

function matchesComfyUIAllowlistEntry(url: URL, rawEntry: string): boolean {
  const entry = rawEntry.trim().toLowerCase();
  if (!entry) {
    return false;
  }

  try {
    const allowedUrl = new URL(entry);
    return url.origin.toLowerCase() === allowedUrl.origin.toLowerCase();
  } catch {
    const host = url.host.toLowerCase();
    const hostname = stripIpv6Brackets(url.hostname.toLowerCase());
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(2);
      return hostname === suffix || hostname.endsWith(`.${suffix}`);
    }

    return host === entry || hostname === entry;
  }
}

function isLocalhost(hostname: string): boolean {
  const host = stripIpv6Brackets(hostname.toLowerCase());
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '');
}

function createComfyUITimeoutSignal(
  timeoutMs: number,
  parentSignal?: AbortSignal,
): { signal?: AbortSignal; clear: () => void } {
  if (timeoutMs <= 0 || typeof AbortController === 'undefined') {
    return {
      signal: parentSignal,
      clear: () => {},
    };
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  const abortFromParent = () => controller.abort();

  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    clear: () => {
      globalThis.clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
  };
}

function normalizeComfyUITimeout(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.round(value));
}

function readBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}
