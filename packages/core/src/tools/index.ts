import type { z } from "zod";
import type { AgentLog, AgentMessage, UserMessage } from "../ai";

/**
 * Defines a tool that the agent can execute.
 */
export interface Tool<T extends z.ZodSchema, Output = never> {
  /** A description of what the tool does, for use by the AI model. */
  description: string;

  /** The schema that defines and validates the tool's arguments. */
  schema: T;

  /** The function to execute when the tool is called. */
  execute(
    args: z.infer<T>,
    context: {
      toolCallId: string;
      sessionId: string;
      step: number;
      messages: AgentMessage[];
    },
  ): Promise<
    | { type: "completion"; output: Output }
    | {
        type: "response";
        response: UserMessage;
        updateCurrentAgentLog?: (log: AgentLog) => AgentLog;
      }
  >;
}

export { createCompleteTaskTool } from "./complete-task";
export {
  createComputerTool,
  type ComputerProvider,
  type ComputerAction,
  type ComputerActionResult,
} from "./computer";
export { createWaitTool } from "./wait";
export {
  createMemoryTool,
  type MemoryStore,
} from "./memory";
export {
  createTaskListTool,
  SessionToDoListStore,
  type ToDoListStore,
  type ToDo,
} from "./todo-list";
export { ToolCallError, ComputerProviderError } from "./errors";
