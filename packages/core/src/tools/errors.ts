/**
 * Represents an error that occurs during the execution of a tool.
 * This error is thrown when a tool fails to execute properly, and it includes
 * information about the tool that was called and the arguments it received.
 */
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

/**
 * Represents an error that occurs within a computer provider.
 * This error is thrown when there is an issue with the underlying service that
 * provides the computer interaction capabilities, such as a failure to start a
 * session or take a screenshot.
 */
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
