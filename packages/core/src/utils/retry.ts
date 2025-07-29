import type { Logger } from "./logger";

/**
 * @internal
 *
 * Retries a function with exponential backoff.
 * This is useful for handling transient errors that may resolve on their own after a short period of time.
 *
 * @template T The return type of the function to retry.
 * @param options The options for the retry logic.
 * @param options.fn The function to retry.
 * @param options.maxRetries The maximum number of retries.
 * @param options.initialDelay The initial delay between retries, in milliseconds.
 * @param options.shouldRetryError A function that determines whether an error should be retried.
 * @param options.logger An optional logger to log retry attempts.
 * @returns A promise that resolves with the result of the function if it succeeds, or rejects with the last error if all retries fail.
 */
export async function retryWithExponentialBackoff<T>({
  fn,
  maxRetries = 3,
  initialDelay = 500,
  shouldRetryError = () => true,
  logger,
}: {
  fn: () => Promise<T>;
  maxRetries?: number;
  initialDelay?: number;
  shouldRetryError?: (error: unknown) => boolean;
  logger?: Logger;
}): Promise<T> {
  let attempts = 0;
  let delay = initialDelay;

  while (attempts < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      ++attempts;
      if (attempts >= maxRetries || !shouldRetryError(error)) {
        logger?.error(
          `Failed after ${attempts} attempts. Error: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
      logger?.warn(
        `Attempt ${attempts} failed. Retrying in ${delay}ms. Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
  // This line should ideally not be reached if maxRetries > 0,
  // as the loop should either return a result or throw an error.
  // However, to satisfy TypeScript's return type, we throw an error here.
  throw new Error("Max retries reached without success.");
}
