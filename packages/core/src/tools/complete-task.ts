import type { StandardSchemaV1 } from "@standard-schema/spec";
import z from "zod";
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

export function createCompleteTaskTool<T extends StandardSchemaV1>({
  aiProvider,
  outputSchema,
}: {
  aiProvider: AIProvider;
  outputSchema: T;
}): Tool<
  typeof completeTaskSchema,
  { output: StandardSchemaV1.InferOutput<T> }
> {
  return {
    description: "Completes the task.",
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
        prompt: "Generate a JSON object as defined in the schema.",
        schema: outputSchema,
      });
      return { output: result.object };
    },
  };
}
