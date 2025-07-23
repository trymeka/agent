import type {
  AIProvider,
  AgentMessage,
  GenerateObjectResult,
  GenerateTextResult,
  Tool,
} from "@trymeka/core";
import {
  type ComputerToolArgs,
  parseComputerToolArgs,
} from "@trymeka/core/tools/computer";
import type { Logger } from "@trymeka/core/utils/logger";
import {
  type CoreMessage,
  type LanguageModel,
  NoSuchToolError,
  type Tool as VercelTool,
  generateObject,
  generateText,
  tool as vercelTool,
} from "ai";
import type { z } from "zod";

function toCoreMessages(messages: AgentMessage[]): CoreMessage[] {
  return messages.map((message) => {
    if (message.role === "user") {
      return {
        role: "user",
        content: message.content,
      };
    }
    return {
      role: "assistant",
      content: message.content,
      toolInvocations: message.toolCalls?.map((tc) => ({
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.args,
      })),
    };
  });
}

function toVercelTools<T extends z.ZodSchema>(
  // biome-ignore lint/suspicious/noExplicitAny: user defined
  tools?: Record<string, Tool<T, any>>,
): Record<string, VercelTool> {
  if (!tools) {
    return {};
  }
  const vercelTools: Record<string, VercelTool> = {};
  for (const [name, tool] of Object.entries(tools)) {
    // @ts-expect-error - exactOptionalPropertyTypes causing issues
    vercelTools[name] = vercelTool({
      description: tool.description,
      parameters: tool.schema,
    });
  }
  return vercelTools;
}

export function createVercelAIProvider({
  model,
  logger,
  ...vercelOptions
}: {
  model: LanguageModel;
  logger?: Logger;
} & Pick<
  Parameters<typeof generateText>[0],
  | "topP"
  | "temperature"
  | "topK"
  | "frequencyPenalty"
  | "presencePenalty"
  | "providerOptions"
  | "maxRetries"
  | "maxTokens"
>): AIProvider {
  return {
    modelName() {
      return Promise.resolve(model.modelId);
    },
    async generateText(options): Promise<GenerateTextResult> {
      const tools = toVercelTools(options.tools);
      const result = await generateText({
        model,
        ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
        messages: toCoreMessages(options.messages),
        tools,
        // to keep o3 performant and fast
        providerOptions: {
          openai: {
            reasoningEffort: "low",
            reasoningSummary: "auto",
          },
        },
        experimental_repairToolCall: async ({
          toolCall,
          parameterSchema,
          error,
        }) => {
          // do not attempt to fix invalid tool names
          if (NoSuchToolError.isInstance(error)) {
            return null;
          }

          logger?.info("[VercelAIProvider] Repairing tool call", {
            toolCall,
            parameterSchema,
          });
          if (toolCall.toolName === "computer_action") {
            const toolCallResult = parseComputerToolArgs(toolCall.args);
            if (!toolCallResult) {
              return null;
            }
            logger?.info("[VercelAIProvider] Computer action tool call", {
              toolCallResult,
            });

            const result = await generateObject({
              model: model,
              schema: toolCallResult.schema,
              prompt: [
                `The model tried to call the tool "${toolCall.toolName}" with the following arguments:`,
                JSON.stringify(toolCallResult.args.action),
                "Please review the generated object and fix the arguments based on the required schema.",
              ].join("\n"),
              experimental_repairText: ({ text, error }) => {
                logger?.info(
                  "[VercelAIProvider] Error parsing text initially generated for computer_action",
                  {
                    text,
                    error,
                  },
                );
                return Promise.resolve(text);
              },
              maxRetries: 3,
            }).catch((error) => {
              logger?.error(
                "[VercelAIProvider] Error generating object for computer_action",
                {
                  error: error.message,
                },
              );
              return null;
            });
            if (!result) {
              return null;
            }
            logger?.info("[VercelAIProvider] Repairing tool call result", {
              output: result?.object,
            });

            return {
              ...toolCall,
              args: JSON.stringify({
                action: result.object,
                reasoning: toolCallResult.args.reasoning,
                previousStepEvaluation:
                  toolCallResult.args.previousStepEvaluation,
                nextStepGoal: toolCallResult.args.nextStepGoal,
                currentStepReasoning: toolCallResult.args.currentStepReasoning,
              } satisfies ComputerToolArgs),
            };
          }

          const result = await generateObject({
            model: model,
            schema: parameterSchema(toolCall),
            prompt: [
              `The model tried to call the tool "${toolCall.toolName}" with the following arguments:`,
              JSON.stringify(toolCall.args),
              "Please review the generated object and fix the arguments based on the required schema.",
            ].join("\n"),
            experimental_repairText: ({ text, error }) => {
              logger?.info("[VercelAIProvider] Error generating object", {
                text,
                error,
              });
              return Promise.resolve(text);
            },
            maxRetries: 3,
          }).catch((error) => {
            logger?.error("[VercelAIProvider] Error generating object", {
              error: error.message,
            });
            return null;
          });
          if (!result) {
            return null;
          }
          logger?.info("[VercelAIProvider] Repairing tool call result", {
            output: result?.object,
          });

          return {
            ...toolCall,
            args: JSON.stringify(result.object),
          };
        },
        maxSteps: 1,
        maxRetries: 3,
        ...vercelOptions,
      });

      return {
        text: result.text,
        toolCalls: result.toolCalls.map((tc) => ({
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          args: tc.args,
        })),
        usage: result.usage,
      };
    },
    async generateObject<T extends z.ZodSchema>(options: {
      schema: T;
      prompt: string;
      systemPrompt?: string;
      messages?: AgentMessage[];
    }): Promise<GenerateObjectResult<T>> {
      const result = await generateObject({
        model,
        schema: options.schema,
        ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
        messages: toCoreMessages(options.messages ?? []),
        maxRetries: 3,
        ...vercelOptions,
      });
      return {
        object: result.object as z.infer<T>,
        usage: result.usage,
      };
    },
  };
}
