import type { EditorHookPlan, EditorHookWebhookPayload } from './hooks';

export type EditorWebhookExecutionStatus = 'sent' | 'skipped' | 'failed';

export interface EditorWebhookExecutionOptions {
  allowedUrls?: string[];
  allowLocalhost?: boolean;
  timeoutMs?: number;
  retryCount?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
  secretEnv?: Record<string, string | undefined>;
  secretPrefix?: string;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  sleepImpl?: (durationMs: number, signal?: AbortSignal) => Promise<void>;
}

export interface EditorWebhookExecutionResult {
  id: string;
  ruleId: string;
  ruleName: string;
  targetUrl?: string;
  status: EditorWebhookExecutionStatus;
  httpStatus?: number;
  ok?: boolean;
  attemptCount: number;
  durationMs: number;
  responsePreview?: string;
  error?: string;
  warnings: string[];
}

export interface EditorWebhookExecutionSummary {
  executedAt: string;
  requestedCount: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  results: EditorWebhookExecutionResult[];
  warnings: string[];
}

export interface EditorWebhookExecutionConfig {
  allowedUrls: string[];
  allowLocalhost: boolean;
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
  secretPrefix: string;
}

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 30000;
const DEFAULT_RETRY_COUNT = 0;
const MAX_RETRY_COUNT = 3;
const DEFAULT_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 10000;
const DEFAULT_SECRET_PREFIX = 'DANBI_EDITOR_WEBHOOK_SECRET_';
const RESPONSE_PREVIEW_LIMIT = 1200;

export function readEditorWebhookExecutionConfig(
  env: Record<string, string | undefined> = process.env,
): EditorWebhookExecutionConfig {
  return {
    allowedUrls: parseWebhookAllowlist(env.DANBI_EDITOR_WEBHOOK_ALLOWLIST ?? env.DANBI_EDITOR_WEBHOOK_ALLOWED_URLS),
    allowLocalhost: readBooleanEnv(env.DANBI_EDITOR_WEBHOOK_ALLOW_LOCALHOST, true),
    timeoutMs: normalizeTimeout(env.DANBI_EDITOR_WEBHOOK_TIMEOUT_MS),
    retryCount: normalizeRetryCount(env.DANBI_EDITOR_WEBHOOK_RETRY_COUNT),
    retryDelayMs: normalizeRetryDelayMs(env.DANBI_EDITOR_WEBHOOK_RETRY_DELAY_MS),
    secretPrefix: normalizeSecretPrefix(env.DANBI_EDITOR_WEBHOOK_SECRET_PREFIX),
  };
}

export function parseWebhookAllowlist(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function executeEditorWebhookPayloads(
  plan: EditorHookPlan,
  options: EditorWebhookExecutionOptions = {},
): Promise<EditorWebhookExecutionSummary> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const retryCount = normalizeRetryCount(options.retryCount);
  const retryDelayMs = normalizeRetryDelayMs(options.retryDelayMs);
  const sleepImpl = options.sleepImpl ?? sleep;
  const payloads = plan.actions.flatMap((action) => (
    action.webhookPayloads.map((payload, index) => ({ action, payload, index }))
  ));
  const results: EditorWebhookExecutionResult[] = [];

  for (const item of payloads) {
    results.push(await executeWebhookPayload(item.payload, {
      id: `${item.action.id}-webhook-${item.index + 1}`,
      ruleId: item.action.ruleId,
      ruleName: item.action.ruleName,
      fetchImpl,
      timeoutMs,
      retryCount,
      retryDelayMs,
      signal: options.signal,
      sleepImpl,
      allowedUrls: options.allowedUrls ?? [],
      allowLocalhost: options.allowLocalhost === true,
      secretEnv: options.secretEnv ?? process.env,
      secretPrefix: normalizeSecretPrefix(options.secretPrefix),
    }));
  }

  const sentCount = results.filter((result) => result.status === 'sent').length;
  const skippedCount = results.filter((result) => result.status === 'skipped').length;
  const failedCount = results.filter((result) => result.status === 'failed').length;

  return {
    executedAt: new Date().toISOString(),
    requestedCount: payloads.length,
    sentCount,
    skippedCount,
    failedCount,
    results,
    warnings: results.flatMap((result) => result.warnings.map((warning) => `${result.ruleName}: ${warning}`)),
  };
}

async function executeWebhookPayload(
  payload: EditorHookWebhookPayload,
  context: {
    id: string;
    ruleId: string;
    ruleName: string;
    fetchImpl: (input: string | URL, init?: RequestInit) => Promise<Response>;
    timeoutMs: number;
    retryCount: number;
    retryDelayMs: number;
    signal?: AbortSignal;
    sleepImpl: (durationMs: number, signal?: AbortSignal) => Promise<void>;
    allowedUrls: string[];
    allowLocalhost: boolean;
    secretEnv: Record<string, string | undefined>;
    secretPrefix: string;
  },
): Promise<EditorWebhookExecutionResult> {
  const startedAt = Date.now();
  const targetUrl = payload.targetUrl;
  const allowed = validateWebhookTarget(targetUrl, context.allowedUrls, context.allowLocalhost);

  if (!allowed.ok) {
    return {
      id: context.id,
      ruleId: context.ruleId,
      ruleName: context.ruleName,
      targetUrl,
      status: 'skipped',
      attemptCount: 0,
      durationMs: elapsedSince(startedAt),
      warnings: [allowed.reason],
    };
  }

  const auth = resolveWebhookAuthorization(payload, context.secretEnv, context.secretPrefix);
  if (!auth.ok) {
    return {
      id: context.id,
      ruleId: context.ruleId,
      ruleName: context.ruleName,
      targetUrl,
      status: 'skipped',
      attemptCount: 0,
      durationMs: elapsedSince(startedAt),
      warnings: [auth.reason],
    };
  }

  const retryWarnings: string[] = [];
  const maxAttempts = context.retryCount + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (context.signal?.aborted) {
      return {
        id: context.id,
        ruleId: context.ruleId,
        ruleName: context.ruleName,
        targetUrl,
        status: 'failed',
        attemptCount: attempt - 1,
        durationMs: elapsedSince(startedAt),
        error: 'Webhook execution aborted.',
        warnings: retryWarnings,
      };
    }

    const result = await sendWebhookAttempt(payload, allowed.url, {
      id: context.id,
      ruleId: context.ruleId,
      ruleName: context.ruleName,
      fetchImpl: context.fetchImpl,
      timeoutMs: context.timeoutMs,
      authorizationToken: auth.token,
      startedAt,
      attempt,
      signal: context.signal,
    });

    if (!shouldRetryWebhookResult(result) || attempt >= maxAttempts) {
      return {
        ...result,
        warnings: [
          ...retryWarnings,
          ...result.warnings,
        ],
      };
    }

    retryWarnings.push(`Webhook attempt ${attempt} failed; retrying in ${context.retryDelayMs}ms.`);
    if (context.retryDelayMs > 0) {
      try {
        await context.sleepImpl(context.retryDelayMs, context.signal);
      } catch (error) {
        return {
          ...result,
          error: describeWebhookAbortError(error),
          warnings: [
            ...retryWarnings,
            ...result.warnings,
          ],
        };
      }
    }
  }

  return {
    id: context.id,
    ruleId: context.ruleId,
    ruleName: context.ruleName,
    targetUrl,
    status: 'failed',
    attemptCount: maxAttempts,
    durationMs: elapsedSince(startedAt),
    error: 'Webhook retry loop ended without a result.',
    warnings: retryWarnings,
  };
}

async function sendWebhookAttempt(
  payload: EditorHookWebhookPayload,
  url: URL,
  context: {
    id: string;
    ruleId: string;
    ruleName: string;
    fetchImpl: (input: string | URL, init?: RequestInit) => Promise<Response>;
    timeoutMs: number;
    authorizationToken?: string;
    startedAt: number;
    attempt: number;
    signal?: AbortSignal;
  },
): Promise<EditorWebhookExecutionResult> {
  const timeout = createWebhookAbortSignal(context.timeoutMs, context.signal);

  try {
    const response = await context.fetchImpl(url.href, {
      method: 'POST',
      headers: buildWebhookHeaders(payload, context.authorizationToken),
      body: JSON.stringify(redactWebhookPayload(payload)),
      signal: timeout.signal,
    });
    const responsePreview = await readResponsePreview(response);

    return {
      id: context.id,
      ruleId: context.ruleId,
      ruleName: context.ruleName,
      targetUrl: payload.targetUrl,
      status: response.ok ? 'sent' : 'failed',
      httpStatus: response.status,
      ok: response.ok,
      attemptCount: context.attempt,
      durationMs: elapsedSince(context.startedAt),
      responsePreview,
      warnings: response.ok ? [] : [`Webhook returned HTTP ${response.status}.`],
    };
  } catch (error) {
    return {
      id: context.id,
      ruleId: context.ruleId,
      ruleName: context.ruleName,
      targetUrl: payload.targetUrl,
      status: 'failed',
      attemptCount: context.attempt,
      durationMs: elapsedSince(context.startedAt),
      error: describeWebhookError(error, context.timeoutMs, context.signal),
      warnings: [],
    };
  } finally {
    timeout.clear();
  }
}

function shouldRetryWebhookResult(result: EditorWebhookExecutionResult): boolean {
  if (result.status !== 'failed') {
    return false;
  }

  if (result.error) {
    return true;
  }

  return result.httpStatus === 429 || (typeof result.httpStatus === 'number' && result.httpStatus >= 500);
}

function validateWebhookTarget(
  targetUrl: string | undefined,
  allowedUrls: string[],
  allowLocalhost: boolean,
): { ok: true; url: URL } | { ok: false; reason: string } {
  if (!targetUrl) {
    return { ok: false, reason: 'Webhook target url is missing.' };
  }

  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return { ok: false, reason: `Webhook target url is invalid: ${targetUrl}` };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `Webhook protocol must be http or https: ${url.protocol}` };
  }

  if (allowLocalhost && isLocalhost(url.hostname)) {
    return { ok: true, url };
  }

  if (allowedUrls.some((entry) => matchesAllowlistEntry(url, entry))) {
    return { ok: true, url };
  }

  return {
    ok: false,
    reason: 'Webhook target is not allowed. Add it to DANBI_EDITOR_WEBHOOK_ALLOWLIST or enable localhost execution for local automation.',
  };
}

function matchesAllowlistEntry(url: URL, rawEntry: string): boolean {
  const entry = rawEntry.trim().toLowerCase();
  if (!entry) {
    return false;
  }

  try {
    const allowedUrl = new URL(entry);
    const entryHasPath = allowedUrl.pathname !== '/' || allowedUrl.search.length > 0;
    return entryHasPath
      ? url.href.toLowerCase().startsWith(allowedUrl.href.toLowerCase())
      : url.origin.toLowerCase() === allowedUrl.origin.toLowerCase();
  } catch {
    const host = url.host.toLowerCase();
    const hostname = url.hostname.toLowerCase();
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(2);
      return hostname === suffix || hostname.endsWith(`.${suffix}`);
    }

    return host === entry || hostname === entry;
  }
}

function isLocalhost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
}

function buildWebhookHeaders(payload: EditorHookWebhookPayload, authorizationToken?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Danbi-Event': payload.event,
    'X-Danbi-Rule': payload.ruleId,
  };

  if (authorizationToken) {
    headers.Authorization = `Bearer ${authorizationToken}`;
  }

  return headers;
}

function resolveWebhookAuthorization(
  payload: EditorHookWebhookPayload,
  env: Record<string, string | undefined>,
  secretPrefix: string,
): { ok: true; token?: string } | { ok: false; reason: string } {
  const secretName = readWebhookSecretName(payload.parameters);
  if (secretName) {
    const envName = buildWebhookSecretEnvName(secretName, secretPrefix);
    if (!envName) {
      return { ok: false, reason: `Webhook token secret name is invalid: ${secretName}` };
    }

    const token = normalizeToken(env[envName]);
    return token
      ? { ok: true, token }
      : { ok: false, reason: `Webhook token secret ${envName} is not configured.` };
  }

  const token = typeof payload.parameters.token === 'string'
    ? payload.parameters.token
    : typeof payload.parameters.webhookToken === 'string'
      ? payload.parameters.webhookToken
      : undefined;

  return { ok: true, token: normalizeToken(token) };
}

function readWebhookSecretName(parameters: EditorHookWebhookPayload['parameters']): string | undefined {
  const candidate = parameters.tokenSecret ?? parameters.webhookTokenSecret ?? parameters.secretName;
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : undefined;
}

function buildWebhookSecretEnvName(secretName: string, secretPrefix: string): string | undefined {
  const normalizedName = secretName.trim().toUpperCase();
  if (!/^[A-Z0-9_]+$/.test(normalizedName)) {
    return undefined;
  }

  return `${secretPrefix}${normalizedName}`;
}

function redactWebhookPayload(payload: EditorHookWebhookPayload): EditorHookWebhookPayload {
  return {
    ...payload,
    parameters: Object.fromEntries(
      Object.entries(payload.parameters).map(([key, value]) => [
        key,
        isSensitiveWebhookParameterKey(key) ? '[redacted]' : value,
      ]),
    ) as EditorHookWebhookPayload['parameters'],
  };
}

function isSensitiveWebhookParameterKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized.includes('token')
    || normalized.includes('secret')
    || normalized.includes('authorization')
    || normalized.includes('password')
    || normalized.includes('apikey')
    || normalized.includes('api_key');
}

async function readResponsePreview(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    return text.length > RESPONSE_PREVIEW_LIMIT ? `${text.slice(0, RESPONSE_PREVIEW_LIMIT)}...` : text;
  } catch {
    return undefined;
  }
}

function normalizeTimeout(value: unknown): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseInt(value, 10)
      : DEFAULT_TIMEOUT_MS;

  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.round(Math.min(MAX_TIMEOUT_MS, Math.max(250, parsed)));
}

function normalizeRetryCount(value: unknown): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseInt(value, 10)
      : DEFAULT_RETRY_COUNT;

  if (!Number.isFinite(parsed)) {
    return DEFAULT_RETRY_COUNT;
  }

  return Math.round(Math.min(MAX_RETRY_COUNT, Math.max(0, parsed)));
}

function normalizeRetryDelayMs(value: unknown): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseInt(value, 10)
      : DEFAULT_RETRY_DELAY_MS;

  if (!Number.isFinite(parsed)) {
    return DEFAULT_RETRY_DELAY_MS;
  }

  return Math.round(Math.min(MAX_RETRY_DELAY_MS, Math.max(0, parsed)));
}

function normalizeSecretPrefix(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return DEFAULT_SECRET_PREFIX;
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9_]+$/.test(normalized) ? normalized : DEFAULT_SECRET_PREFIX;
}

function normalizeToken(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function readBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}

function describeWebhookError(error: unknown, timeoutMs: number, signal?: AbortSignal): string {
  if (signal?.aborted) {
    return 'Webhook execution aborted.';
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return `Webhook timed out after ${timeoutMs}ms.`;
  }

  return error instanceof Error ? error.message : 'Webhook request failed.';
}

function describeWebhookAbortError(error: unknown): string {
  return error instanceof Error ? error.message : 'Webhook execution aborted.';
}

function elapsedSince(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function sleep(durationMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new Error('Webhook execution aborted.'));
  }

  let abort: (() => void) | undefined;
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, durationMs);
    abort = () => {
      clearTimeout(timeout);
      reject(new Error('Webhook execution aborted.'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  }).finally(() => {
    if (abort) {
      signal?.removeEventListener('abort', abort);
    }
  });
}

function createWebhookAbortSignal(
  timeoutMs: number,
  parentSignal?: AbortSignal,
): { signal?: AbortSignal; clear: () => void } {
  if (typeof AbortController === 'undefined') {
    return {
      signal: parentSignal,
      clear: () => {},
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromParent = () => controller.abort();

  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
  };
}
