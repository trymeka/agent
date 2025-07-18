import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Tool } from "../tools";

/**
 * Defines the structured messages used for conversations.
 */
export interface UserMessage {
  role: "user";
  content: Array<
    { type: "text"; text: string } | { type: "image"; image: string }
  >;
}

export interface ToolCall {
  toolCallId: string;
  toolName: string;
  args: unknown;
}
export interface AssistantMessage {
  role: "assistant";
  content: Array<{ type: "text"; text: string }>;
  toolCalls?: ToolCall[];
}

export type AgentMessage = UserMessage | AssistantMessage;

/**
 * The result of a `generateText` call.
 */
export interface GenerateTextResult {
  text: string;
  toolCalls?: ToolCall[];
  // ... other metadata like usage, finishReason
}

/**
 * The result of a `generateObject` call.
 */
export interface GenerateObjectResult<T> {
  object: T;
  // ... other metadata
}

/**
 * The primary interface for an AI Provider.
 */
export interface AIProvider {
  /**
   * Generates a textual response from the model.
   */
  generateText(options: {
    systemPrompt?: string;
    messages: AgentMessage[];
    tools?: Record<string, Tool<StandardSchemaV1>>;
  }): Promise<GenerateTextResult>;

  /**
   * Generates a structured object that conforms to a given schema.
   */
  generateObject<T extends StandardSchemaV1>(options: {
    schema: T;
    prompt: string;
    messages?: AgentMessage[];
  }): Promise<StandardSchemaV1.InferOutput<T>>;
}
