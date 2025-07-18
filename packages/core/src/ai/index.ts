import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Tool } from "../tools";

export interface TextContent {
  type: "text";
  text: string;
}
export interface ImageContent {
  type: "image";
  image: string | URL;
}

export interface ToolCall {
  toolCallId: string;
  toolName: string;
  args: unknown;
}

/**
 * Defines the structured messages used for conversations.
 */
export interface UserMessage {
  role: "user";
  content: (TextContent | ImageContent)[];
}

export interface AssistantMessage {
  role: "assistant";
  content: TextContent[];
  toolCalls?: ToolCall[];
}

export type AgentMessage = UserMessage | AssistantMessage;
export interface AgentLog {
  screenshot: string;
  step: number;
  timestamp: string;
  modelOutput: {
    done: {
      type: "text";
      text: string;
      reasoning?: string;
    };
  };
  usage: {
    model: string;
    inputTokensStep?: number | undefined;
    outputTokensStep?: number | undefined;
    totalTokensStep?: number | undefined;
  };
}
/**
 * The result of a `generateText` call.
 */
export interface GenerateTextResult {
  text?: string;
  reasoning?: string;
  toolCalls: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * The result of a `generateObject` call.
 */
export interface GenerateObjectResult<T extends StandardSchemaV1> {
  object: StandardSchemaV1.InferOutput<T>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * The primary interface for an AI Provider.
 */
export interface AIProvider {
  /**
   * The name of the model used for the generation.
   */
  modelName: string;
  /**
   * Generates a textual response from the model.
   */
  generateText(options: {
    systemPrompt?: string;
    messages: AgentMessage[];
    // biome-ignore lint/suspicious/noExplicitAny: user defined
    tools?: Record<string, Tool<StandardSchemaV1, any>>;
  }): Promise<GenerateTextResult>;

  /**
   * Generates a structured object that conforms to a given schema.
   */
  generateObject<T extends StandardSchemaV1>(options: {
    schema: T;
    systemPrompt?: string;
    messages?: AgentMessage[];
  }): Promise<GenerateObjectResult<T>>;
}

export { createAgent } from "./agent";
