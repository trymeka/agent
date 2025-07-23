export class AIProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AIProviderError";
    if (typeof options?.cause === "object" && options.cause !== null) {
      Error.captureStackTrace(options.cause);
    }
  }
}

export class AgentError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AgentError";
    if (typeof options?.cause === "object" && options.cause !== null) {
      Error.captureStackTrace(options.cause);
    }
  }
}
