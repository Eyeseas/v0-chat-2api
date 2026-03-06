export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}

export class RetryableError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly isRetryable: boolean
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof RetryableError) {
    return error.isRetryable;
  }
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const status = (error as { statusCode: number }).statusCode;
    return status >= 500 && status < 600;
  }
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 30000 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries || !isRetryableError(error)) {
        throw error;
      }

      const delay = Math.min(
        baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelay
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Retry loop exhausted');
}
