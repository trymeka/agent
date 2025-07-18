import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { AgentMessage } from "../ai";

/**
 * Defines a tool that the agent can execute.
 */
export interface Tool<T extends StandardSchemaV1, Output> {
  /** A description of what the tool does, for use by the AI model. */
  description: string;

  /** The schema that defines and validates the tool's arguments. */
  schema: T;

  /** The function to execute when the tool is called. */
  execute(
    args: StandardSchemaV1.InferOutput<T>,
    context: {
      toolCallId: string;
      sessionId: string;
      step: number;
      messages: AgentMessage[];
    },
  ): Promise<Output>;
}

export { createCompleteTaskTool } from "./complete-task";
export {
  createComputerTool,
  type ComputerProvider,
  type ComputerAction,
  type ComputerActionResult,
} from "./computer";
export { ToolCallError, ComputerProviderError } from "./errors";
