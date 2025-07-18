import type { StandardSchemaV1 } from "@standard-schema/spec";
import { z } from "zod";
import type { ComputerAction, ComputerProvider } from "../computer";

/**
 * Defines a tool that the agent can execute.
 */
export interface Tool<T extends StandardSchemaV1> {
  /** A description of what the tool does, for use by the AI model. */
  description: string;

  /** The schema that defines and validates the tool's arguments. */
  schema: T;

  /** The function to execute when the tool is called. */
  execute(
    args: StandardSchemaV1.InferOutput<T>,
  ): Promise<{ output: string; [key: string]: unknown }>;
}

const computerActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("click"),
    x: z.number(),
    y: z.number(),
    button: z.enum(["left", "right", "wheel"]),
  }),
  z.object({ type: z.literal("double_click"), x: z.number(), y: z.number() }),
  z.object({
    type: z.literal("drag"),
    path: z.array(z.object({ x: z.number(), y: z.number() })),
  }),
  z.object({ type: z.literal("keypress"), keys: z.array(z.string()) }),
  z.object({ type: z.literal("move"), x: z.number(), y: z.number() }),
  z.object({
    type: z.literal("scroll"),
    x: z.number(),
    y: z.number(),
    scroll_x: z.number(),
    scroll_y: z.number(),
  }),
  z.object({ type: z.literal("type"), text: z.string() }),
  z.object({ type: z.literal("wait"), duration: z.number() }),
]);

// The tools feature also provides a factory for the core tools.
export function createCoreTools(
  computerProvider: ComputerProvider,
): Map<string, Tool<StandardSchemaV1>> {
  // `computer_action` tool delegates to the provided computer provider.
  const computerActionTool: Tool<StandardSchemaV1> = {
    description: "Performs an action on the computer screen.",
    // A Standard Schema object (e.g., from Zod, Valibot) defines arguments.
    schema: computerActionSchema,
    execute: async (args) => {
      const result = await computerProvider.performAction(
        args as ComputerAction,
      );
      return { output: result.result };
    },
  };

  // The `task_completion` tool is also defined here.
  const taskCompletionTool: Tool<StandardSchemaV1> = {
    description: "Completes the task.",
    schema: z.object({}),
    execute: () => {
      return Promise.resolve({ output: "Task completed." });
    },
  };

  const toolMap: Map<string, Tool<StandardSchemaV1>> = new Map(
    Object.entries({
      computer_action: computerActionTool,
      task_completion: taskCompletionTool,
    }),
  );

  return toolMap;
}
