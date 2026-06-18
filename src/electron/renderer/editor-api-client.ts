export const EDITOR_API_TOKEN_STORAGE_KEY = 'danbi.editorApiToken';

export interface EditorApiRequestInit extends RequestInit {
  timeoutMs?: number;
}

export async function editorApiFetch(input: RequestInfo | URL, init: EditorApiRequestInit = {}): Promise<Response> {
  const timeout = createEditorApiRequestTimeout(init);

  try {
    return await fetch(input, buildEditorApiRequestInit({
      ...init,
      signal: timeout.signal,
    }));
  } finally {
    timeout.clear();
  }
}

export function buildEditorApiRequestInit(init: EditorApiRequestInit = {}, token = readStoredEditorApiToken()): RequestInit {
  const { timeoutMs: _timeoutMs, ...requestInit } = init;
  const normalizedToken = normalizeEditorApiToken(token);
  if (!normalizedToken) {
    return requestInit;
  }

  const headers = new Headers(requestInit.headers);
  if (!headers.has('Authorization') && !headers.has('X-Danbi-Editor-Api-Token') && !headers.has('X-Danbi-Api-Token')) {
    headers.set('Authorization', `Bearer ${normalizedToken}`);
  }

  return {
    ...requestInit,
    headers,
  };
}

export function readStoredEditorApiToken(): string | undefined {
  if (!canUseLocalStorage()) {
    return undefined;
  }

  try {
    return normalizeEditorApiToken(localStorage.getItem(EDITOR_API_TOKEN_STORAGE_KEY));
  } catch {
    return undefined;
  }
}

export function writeStoredEditorApiToken(token: string): boolean {
  if (!canUseLocalStorage()) {
    return false;
  }

  const normalizedToken = normalizeEditorApiToken(token);
  try {
    if (normalizedToken) {
      localStorage.setItem(EDITOR_API_TOKEN_STORAGE_KEY, normalizedToken);
    } else {
      localStorage.removeItem(EDITOR_API_TOKEN_STORAGE_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

export function clearStoredEditorApiToken(): boolean {
  return writeStoredEditorApiToken('');
}

export function normalizeEditorApiToken(token: string | null | undefined): string | undefined {
  const normalized = token?.trim();
  return normalized ? normalized : undefined;
}

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function createEditorApiRequestTimeout(
  init: EditorApiRequestInit,
): { signal?: AbortSignal; clear: () => void } {
  if (!init.timeoutMs || init.timeoutMs <= 0 || typeof AbortController === 'undefined') {
    return {
      signal: init.signal ?? undefined,
      clear: () => undefined,
    };
  }
  if (init.signal?.aborted) {
    return {
      signal: init.signal ?? undefined,
      clear: () => undefined,
    };
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), Math.max(1, init.timeoutMs));
  const abortFromParent = () => controller.abort();
  init.signal?.addEventListener('abort', abortFromParent, { once: true });

  return {
    signal: controller.signal,
    clear: () => {
      globalThis.clearTimeout(timeout);
      init.signal?.removeEventListener('abort', abortFromParent);
    },
  };
}
