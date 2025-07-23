export class ToolCallError extends Error {
  public readonly toolName: string;
  public readonly toolArgs: unknown;

  constructor(
    message: string,
    options: { cause?: unknown; toolName: string; toolArgs: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "ToolCallError";
    this.toolName = options.toolName;
    this.toolArgs = options.toolArgs;
  }
}

export class ComputerProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(
      `ComputerProviderError: ${message}. ${
        options?.cause instanceof Error
          ? options.cause.message
          : String(options?.cause)
      }`,
      options,
    );
    this.name = "ComputerProviderError";
    if (options?.cause instanceof Error) {
      Error.captureStackTrace(options.cause);
    }
  }
}
