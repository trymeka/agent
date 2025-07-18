import { z } from "zod";
import type { Tool } from ".";
import type { AIProvider, UserMessage } from "../ai";

const completeTaskSchema = z.object({
  completionSummary: z
    .string()
    .describe(
      "A comprehensive summary of what was accomplished during the task",
    ),
  verificationEvidence: z
    .string()
    .describe(
      "Evidence that the task requirements have been met (reference specific screenshots, actions, or outcomes)",
    ),
  finalStateDescription: z
    .string()
    .describe(
      "Description of the final state of the application after completing the task",
    ),
});

export function createCompleteTaskTool<T extends z.ZodSchema>({
  aiProvider,
  outputSchema,
}: {
  aiProvider: AIProvider;
  outputSchema: T;
}): Tool<typeof completeTaskSchema, { output: z.infer<T> }> {
  return {
    description:
      "Declare that the task is complete. This tool MUST be used to officially end the task. The task cannot be completed without calling this tool.",
    schema: completeTaskSchema,
    execute: async (args, context) => {
      const fullHistory = [
        ...(context.messages ?? []),
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Task completed. Summary: ${args.completionSummary}. Evidence: ${args.verificationEvidence}. Final state: ${args.finalStateDescription}. Generate a JSON object as defined in the schema.`,
            },
          ],
        } satisfies UserMessage,
      ];
      const result = await aiProvider.generateObject({
        messages: fullHistory,
        schema: outputSchema,
      });
      return { output: result.object };
    },
  };
}
