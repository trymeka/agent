/**
 * Creates a no-op logger that does nothing.
 * @returns A logger that does nothing.
 */
export function createNoOpLogger(): Logger {
  return {
    info: () => {
      // no-op
    },
    error: () => {
      // no-op
    },
    warn: () => {
      // no-op
    },
  };
}
/**
 * An interface for a logger that can be used to log messages at different levels.
 * This allows for flexible logging implementations, such as logging to the console,
 * to a file, or to a remote service.
 */
export interface Logger {
  /**
   * Logs an informational message.
   * @param message - The message to log.
   * @param args - Additional arguments to log.
   */
  info(message: string, ...args: unknown[]): void;
  /**
   * Logs an error message.
   * @param message - The message to log.
   * @param args - Additional arguments to log.
   */
  error(message: string, ...args: unknown[]): void;
  /**
   * Logs a warning message.
   * @param message - The message to log.
   * @param args - Additional arguments to log.
   */
  warn(message: string, ...args: unknown[]): void;
}
