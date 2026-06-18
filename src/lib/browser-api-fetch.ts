export interface BrowserApiFetchInit extends RequestInit {
  timeoutMs?: number;
}

export async function browserApiFetch(input: RequestInfo | URL, init: BrowserApiFetchInit = {}): Promise<Response> {
  const timeout = createBrowserApiFetchTimeout(init);

  try {
    return await fetch(input, buildBrowserApiFetchRequestInit(init, timeout.signal));
  } finally {
    timeout.clear();
  }
}

function buildBrowserApiFetchRequestInit(init: BrowserApiFetchInit, signal?: AbortSignal): RequestInit {
  const { timeoutMs: _timeoutMs, ...requestInit } = init;
  return signal ? { ...requestInit, signal } : requestInit;
}

function createBrowserApiFetchTimeout(init: BrowserApiFetchInit): { signal?: AbortSignal; clear: () => void } {
  if (!init.timeoutMs || init.timeoutMs <= 0 || typeof AbortController === 'undefined') {
    return {
      signal: init.signal ?? undefined,
      clear: () => {},
    };
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), Math.max(1, init.timeoutMs));
  const abortFromParent = () => controller.abort();

  if (init.signal?.aborted) {
    controller.abort();
  } else {
    init.signal?.addEventListener('abort', abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    clear: () => {
      globalThis.clearTimeout(timeout);
      init.signal?.removeEventListener('abort', abortFromParent);
    },
  };
}
