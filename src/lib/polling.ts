/**
 * Polling Utilities
 *
 * Utilities for polling ComfyUI status with exponential backoff
 */

export interface PollOptions {
  interval?: number; // milliseconds
  timeout?: number; // milliseconds
  maxRetries?: number;
  signal?: AbortSignal;
}

export interface PollResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
}

/**
 * Poll a function until it returns a truthy value or timeout
 */
export async function poll<T>(
  fn: (signal?: AbortSignal) => Promise<T | null>,
  checkFn: (data: T) => boolean,
  options: PollOptions = {}
): Promise<PollResult<T>> {
  const {
    interval = 2000, // 2 seconds default
    timeout = 300000, // 5 minutes default
    maxRetries = 150, // max attempts
    signal,
  } = options;

  const startTime = Date.now();
  let attempts = 0;

  while (attempts < maxRetries) {
    attempts++;

    try {
      if (signal?.aborted) {
        return {
          success: false,
          error: 'Polling aborted',
          attempts,
        };
      }

      const data = await fn(signal);

      if (data && checkFn(data)) {
        return {
          success: true,
          data,
          attempts
        };
      }

      // Check timeout
      if (Date.now() - startTime > timeout) {
        return {
          success: false,
          error: 'Polling timeout',
          attempts
        };
      }

      // Wait before next poll (exponential backoff)
      const backoffInterval = Math.min(interval * Math.pow(1.1, attempts), 10000);
      await sleep(backoffInterval, signal);

    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        attempts
      };
    }
  }

  return {
    success: false,
    error: 'Max retries exceeded',
    attempts
  };
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new Error('Polling aborted'));
  }

  let abort: (() => void) | undefined;
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    abort = () => {
      clearTimeout(timeout);
      reject(new Error('Polling aborted'));
    };

    signal?.addEventListener('abort', abort, { once: true });
  }).finally(() => {
    if (abort) {
      signal?.removeEventListener('abort', abort);
    }
  });
}

/**
 * Poll ComfyUI for prompt completion
 */
export async function pollPromptCompletion(
  promptId: string,
  getStatusFn: (id: string, signal?: AbortSignal) => Promise<{ status: string; outputs?: any }>,
  options?: PollOptions
): Promise<PollResult<{ status: string; outputs?: any }>> {
  return poll(
    (signal) => getStatusFn(promptId, signal),
    (data) => {
      // Check if completed or failed
      return data.status === 'success' || data.status === 'error';
    },
    options
  );
}
