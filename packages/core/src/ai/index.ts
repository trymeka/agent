import type { z } from "zod";
import type { Tool } from "../tools";

/**
 * Represents a piece of text content in a message.
 */
export interface TextContent {
  type: "text";
  text: string;
}

/**
 * Represents an image in a message, which can be a base64 string or a URL.
 */
export interface ImageContent {
  type: "image";
  image: string | URL;
}

/**
 * Structure of a tool call.
 */
export interface ToolCall {
  toolCallId: string;
  toolName: string;
  args: unknown;
}

/**
 * Defines a message from the user, which can include text and images.
 */
export interface UserMessage {
  role: "user";
  content: (TextContent | ImageContent)[];
}

/**
 * Defines a message from the assistant, which can include text and tool calls.
 */
export interface AssistantMessage {
  role: "assistant";
  content: TextContent[];
  toolCalls?: ToolCall[];
}

/**
 * Represents a message in the agent's conversation, which can be from either the user or the assistant.
 */
export type AgentMessage = UserMessage | AssistantMessage;

/**
 * Stores the planning data for an agent's step, including reasoning and goals.
 */
export interface PlanningData {
  previousStepEvaluation?: string;
  currentStepReasoning: string;
  nextStepGoal?: string;
}

/**
 * Represents a log of an agent's step, including screenshots, model output, and usage statistics.
 */
export interface AgentLog {
  screenshot: string;
  step: number;
  timestamp: string;
  currentUrl?: string;
  modelOutput: {
    done: (
      | {
          type: "text";
          text: string;
          reasoning?: string;
        }
      | {
          type: "tool_call";
          toolCallId: string;
          toolName: string;
          args: unknown;
          screenshot?: string;
          reasoning?: string;
          result:
            | {
                type: "completion";
                output: unknown;
              }
            | {
                type: "response";
                response: UserMessage;
              };
        }
    )[];
  };
  usage: {
    model: string;
    inputTokensStep?: number | undefined;
    outputTokensStep?: number | undefined;
    totalTokensStep?: number | undefined;
  };
  plan?: PlanningData;
}

/**
 * A task is a single instruction that the agent is working on.
 */
export interface Task<T = unknown> {
  id: string;
  instructions: string;
  result: T;
  logs: AgentLog[];
  initialUrl: string | undefined;
}

/**
 * A session is a collection of tasks that were executed by the agent.
 * It is used to track the state of the agent and the tasks that it has executed/is working on.
 */
export interface Session {
  id: string;
  computerProviderId: string | undefined;
  liveUrl: string | undefined;
  status: "queued" | "running" | "idle" | "stopped";
  tasks: Task[];
}

/**
 * The result of a `generateText` call.
 */
export interface GenerateTextResult {
  text?: string;
  reasoning?: string;
  toolCalls: ToolCall[];
  usage?: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
  };
}

/**
 * The result of a `generateObject` call.
 */
export interface GenerateObjectResult<T extends z.ZodSchema> {
  object: z.infer<T>;
  usage?: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
  };
}

/**
 * The primary interface for an AI Provider.
 */
export interface AIProvider {
  /**
   * The name of the model used for the generation.
   */
  modelName(): Promise<string>;
  /**
   * Generates a textual response from the model.
   */
  generateText(options: {
    systemPrompt?: string;
    messages: AgentMessage[];
    // biome-ignore lint/suspicious/noExplicitAny: user defined
    tools?: Record<string, Tool<z.ZodSchema, any>>;
  }): Promise<GenerateTextResult>;

  /**
   * Generates a structured object that conforms to a given schema.
   */
  generateObject<T extends z.ZodSchema>(options: {
    schema: T;
    systemPrompt?: string;
    messages?: AgentMessage[];
  }): Promise<GenerateObjectResult<T>>;
}

export { createAgent } from "./agent";
export { AIProviderError, AgentError } from "./errors";
export type {
  SerializableSessionState,
  SessionRestorationResult,
} from "./session-persistence";
