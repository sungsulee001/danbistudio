/**
 * Polling Utilities
 *
 * Utilities for polling ComfyUI status with exponential backoff
 */

export interface PollOptions {
  interval?: number; // milliseconds
  timeout?: number; // milliseconds
  maxRetries?: number;
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
  fn: () => Promise<T | null>,
  checkFn: (data: T) => boolean,
  options: PollOptions = {}
): Promise<PollResult<T>> {
  const {
    interval = 2000, // 2 seconds default
    timeout = 300000, // 5 minutes default
    maxRetries = 150 // max attempts
  } = options;

  const startTime = Date.now();
  let attempts = 0;

  while (attempts < maxRetries) {
    attempts++;

    try {
      const data = await fn();

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
      await sleep(backoffInterval);

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
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Poll ComfyUI for prompt completion
 */
export async function pollPromptCompletion(
  promptId: string,
  getStatusFn: (id: string) => Promise<{ status: string; outputs?: any }>,
  options?: PollOptions
): Promise<PollResult<{ status: string; outputs?: any }>> {
  return poll(
    () => getStatusFn(promptId),
    (data) => {
      // Check if completed or failed
      return data.status === 'success' || data.status === 'error';
    },
    options
  );
}
