export class AIProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(
      `AIProviderError: ${message}. ${
        options?.cause instanceof Error
          ? options.cause.message
          : String(options?.cause)
      }`,
      options,
    );
    this.name = "AIProviderError";
    if (options?.cause instanceof Error) {
      Error.captureStackTrace(options.cause);
    }
  }
}

export class AgentError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(
      `AgentError: ${message}. ${
        options?.cause instanceof Error
          ? options.cause.message
          : String(options?.cause)
      }`,
      options,
    );
    this.name = "AgentError";
    if (options?.cause instanceof Error) {
      Error.captureStackTrace(options.cause);
    }
  }
}
