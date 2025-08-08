import { z } from "zod";
import type { Tool } from ".";
import type {
  AIProvider,
  AgentMessage,
  ImageContent,
  TextContent,
  UserMessage,
} from "../ai";
import { createAgentLogUpdate } from "../utils/agent-log";
import type { Logger } from "../utils/logger";
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
 * Limits the message history to keep only the most recent N images/documents
 * to avoid API limits while preserving important context.
 */
function limitHistory(
  messages: AgentMessage[],
  maxImages: number,
): AgentMessage[] {
  let imageCount = 0;
  const result: AgentMessage[] = [];

  // Process messages in reverse order to keep the most recent ones
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) {
      continue;
    }

    if (message.role === "user") {
      const contentItems = (message.content ?? []) as (
        | TextContent
        | ImageContent
      )[];
      const messageImageCount = contentItems.reduce((count, item) => {
        return count + (item.type === "image" ? 1 : 0);
      }, 0);

      // If adding this message would exceed the limit, filter its content
      if (imageCount + messageImageCount > maxImages) {
        const remainingSlots = Math.max(0, maxImages - imageCount);
        const filteredContent: (TextContent | ImageContent)[] = [];
        let slotsUsed = 0;

        // Keep text content and as many images as possible
        for (const item of contentItems) {
          if (item.type === "text") {
            filteredContent.push(item);
          } else if (item.type === "image" && slotsUsed < remainingSlots) {
            filteredContent.push(item);
            slotsUsed++;
          }
        }

        if (filteredContent.length > 0) {
          result.unshift({
            role: "user",
            content: filteredContent,
          });
        }
        imageCount += slotsUsed;

        // Stop processing if we've reached the limit
        if (imageCount >= maxImages) {
          break;
        }
      } else {
        // Add the entire message
        result.unshift(message);
        imageCount += messageImageCount;
      }
    } else {
      // Keep non-user messages as-is
      result.unshift(message);
    }
  }

  return result;
}

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
  logger,
}: {
  ground: AIProvider;
  evaluator: AIProvider | undefined;
  outputSchema: T;
  currentInstruction: string;
  logger?: Logger;
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

        const processedEvaluationMessages = await processMessages(
          evaluationMessages,
          logger,
        );
        logger?.info("[CompleteTaskTool] Evaluating task completion");
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
        logger?.info("[CompleteTaskTool] Evaluation result", {
          evaluationResult,
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

      logger?.info("[CompleteTaskTool] Generating final output");
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

      // Limit to most recent 95 images/documents to avoid API limits
      const limitedHistory = limitHistory(fullHistory, 95);
      const processedFullHistory = await processMessages(limitedHistory);
      const result = await ground.generateObject({
        messages: processedFullHistory,
        schema: outputSchema,
      });
      logger?.info("[CompleteTaskTool] Final output generated", {
        result,
      });
      return { type: "completion", output: result.object };
    },
  };
}
