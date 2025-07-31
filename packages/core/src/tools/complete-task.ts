import { z } from "zod";
import type { Tool } from ".";
import type { AIProvider, UserMessage } from "../ai";
import { createAgentLogUpdate } from "../utils/agent-log";
import { processMessages } from "../utils/process-messages";

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

/**
 * Creates a tool that allows the agent to declare a task as complete.
 * This tool is essential for signaling the end of a task and for providing a final summary,
 * evidence of completion, and a description of the final state. It also includes a mechanism
 * for self-correction, where an evaluator can review the completion and provide feedback if necessary.
 *
 * @param options - The options for creating the complete task tool.
 * @param options.ground - The primary AI provider for generating the final output.
 * @param options.evaluator - An optional AI provider for evaluating the task completion.
 * @param options.outputSchema - The Zod schema for the final output of the task.
 * @param options.currentInstruction - The original instruction for the task.
 * @returns A tool that can be used by the agent to complete a task.
 */
export function createCompleteTaskTool<T extends z.ZodSchema>({
  ground,
  evaluator,
  outputSchema,
  currentInstruction,
}: {
  ground: AIProvider;
  evaluator: AIProvider | undefined;
  outputSchema: T;
  currentInstruction: string;
}): Tool<typeof completeTaskSchema, z.infer<T>> {
  return {
    description:
      "Declare that the task is complete. This tool MUST be used to officially end the task. The task cannot be completed without calling this tool.",
    schema: completeTaskSchema,
    execute: async (args, context) => {
      const completionAttempts = context.messages.filter(
        (message) =>
          message.role === "assistant" &&
          !!message.toolCalls?.find(
            (toolCall) => toolCall.toolName === "complete_task",
          ),
      );
      const forceComplete = completionAttempts.length > 3;
      if (evaluator && !forceComplete) {
        const evaluationPrompt = `You are evaluating the quality and truthfulness of this task completion by cross-referencing the completion claims against the actual conversation history.

ORIGINAL TASK: ${currentInstruction}

CLAIMED COMPLETION:
- Summary: ${args.completionSummary}
- Evidence: ${args.verificationEvidence}
- Final State: ${args.finalStateDescription}

Please carefully review the conversation history above to verify:
1. ACCURACY: Does the verification evidence match what actually happened in the conversation? Are there any false claims?
2. COMPLETENESS: Were all task requirements fulfilled based on the actual actions taken?
3. TRUTHFULNESS: Is the final state description accurate based on the conversation and screenshots?
4. SPECIFICITY: Is the evidence specific and credible, referencing actual actions, screenshots, or outcomes from the conversation?

Cross-reference the claimed completion against the actual conversation history. Look for:
- Actions that were claimed but not actually performed
- Evidence that doesn't match the screenshots or tool results
- Missing requirements that weren't addressed
- Inaccurate descriptions of the final state

Respond with either an APPROVED or REFLECTION object based on your evaluation. Follow the schema provided for the full response.`;

        const evaluationMessages = [
          ...(context.messages ?? []),
          {
            role: "user",
            content: [
              {
                type: "text",
                text: evaluationPrompt,
              },
            ],
          } satisfies UserMessage,
        ];

        const processedEvaluationMessages =
          await processMessages(evaluationMessages);

        const evaluationResult = await evaluator.generateObject({
          schema: z.object({
            approved: z
              .object({
                reason: z.string().describe("Reason for approval"),
              })
              .nullable(),
            reflection: z
              .object({
                reason: z.string().describe("Reason for reflection"),
                reflectionForImprovement: z
                  .string()
                  .describe(
                    "Specific feedback for improvement that the assistant should use to properly complete the task.",
                  ),
              })
              .nullable(),
          }),
          messages: processedEvaluationMessages,
        });

        // If evaluation indicates issues, provide reflection
        if (evaluationResult.object.reflection) {
          const rejectionText = `This task was determined to be incomplete. The reason is: ${evaluationResult.object.reflection.reason}. Please improve the task completion based on the following feedback: ${evaluationResult.object.reflection.reflectionForImprovement}`;
          const response = {
            role: "user" as const,
            content: [
              {
                type: "text" as const,
                text: rejectionText,
              },
            ],
          };
          return {
            type: "response",
            response,
            updateCurrentAgentLog: createAgentLogUpdate({
              toolCallId: context.toolCallId,
              toolName: "complete_task",
              args,
              reasoning: evaluationResult.object.reflection.reason,
              response,
            }),
          };
        }
      }

      // Proceed with ground model to generate final output
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
      const processedFullHistory = await processMessages(fullHistory);
      const result = await ground.generateObject({
        messages: processedFullHistory,
        schema: outputSchema,
      });
      return { type: "completion", output: result.object };
    },
  };
}
