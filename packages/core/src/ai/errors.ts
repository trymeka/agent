/**
 * Represents an error that occurs within an AI provider.
 * This error is thrown when there is an issue with the AI model's response,
 * such as a failure to generate text or a problem with the provider's service.
 */
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

/**
 * Represents an error that occurs within the agent's logic.
 * This error is thrown for issues related to session management, task execution,
 * or other agent-specific operations that are not directly tied to the AI provider.
 */
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
