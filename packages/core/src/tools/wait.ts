import z from "zod";
import type { Tool } from ".";
import { createAgentLogUpdate } from "../utils/agent-log";

const waitToolSchema = z.object({
  duration: z
    .number()
    .describe(
      "Duration to wait in seconds. For example, use 5 to wait for 5 seconds for a page to load.",
    ),
  reasoning: z.string().describe("The reason for waiting."),
});

export type WaitToolArgs = z.infer<typeof waitToolSchema>;

export function createWaitTool(): Tool<typeof waitToolSchema> {
  return {
    description:
      "Wait for a certain duration. Normally used to wait for a page to load, an animation to complete, or a certain task/action to complete.",
    schema: waitToolSchema,
    execute: async (args, context) => {
      await new Promise((resolve) => setTimeout(resolve, args.duration * 1000));

      const response = {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text: `Waited for ${args.duration} seconds. Reason: ${args.reasoning}`,
          },
        ],
      };

      return {
        type: "response",
        response,
        updateCurrentAgentLog: createAgentLogUpdate({
          toolCallId: context.toolCallId,
          toolName: "wait",
          args,
          reasoning: args.reasoning,
          response,
        }),
      };
    },
  };
}
