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
export interface Logger {
  info(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
}
