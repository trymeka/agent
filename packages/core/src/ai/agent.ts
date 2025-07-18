import type { StandardSchemaV1 } from "@standard-schema/spec";
import type {
  AIProvider,
  AgentLog,
  AgentMessage,
  GenerateObjectResult,
} from ".";
import { type Logger, createNoOpLogger } from "../logger";
import { type Tool, createCompleteTaskTool } from "../tools";
import {
  type ComputerActionResult,
  type ComputerProvider,
  createComputerTool,
} from "../tools/computer";
import { ComputerProviderError, ToolCallError } from "../tools/errors";
import { AIProviderError, AgentOutOfStepsError } from "./errors";
import { SYSTEM_PROMPT } from "./prompts/system";

const sessionIdGenerator = () => `session_${crypto.randomUUID()}`;

export function createAgent(options: {
  aiProvider: AIProvider;
  computerProvider: ComputerProvider;
  logger?: Logger;
}) {
  // Dependencies are destructured and composed.
  const { aiProvider, computerProvider } = options;
  const logger = options.logger ?? createNoOpLogger();
  const sessionManager = {
    initialize: async (sessionIdOverride?: string) => {
      const sessionId = sessionIdOverride ?? sessionIdGenerator();
      try {
        const { computerProviderId, liveUrl } =
          await computerProvider.start(sessionId);
        const session = {
          id: sessionId,
          computer: {
            id: computerProviderId,
            liveUrl,
          },
        };
        return session;
      } catch (error) {
        throw new ComputerProviderError("Failed to start computer provider", {
          cause: error,
        });
      }
    },
    run: async <T extends StandardSchemaV1>(task: {
      sessionId: string;
      instructions: string;
      outputSchema: T;
      // biome-ignore lint/suspicious/noExplicitAny: user defined
      customTools?: Record<string, Tool<StandardSchemaV1, any>>;
    }): Promise<GenerateObjectResult<T>> => {
      const MAX_STEPS = 300;
      const CONVERSATION_LOOK_BACK = 7;

      const coreTools = {
        computer_action: createComputerTool({
          computerProvider,
        }),
        complete_task: createCompleteTaskTool({
          aiProvider,
          outputSchema: task.outputSchema,
        }),
      };
      // biome-ignore lint/suspicious/noExplicitAny: user defined
      const allTools: Record<string, Tool<StandardSchemaV1, any>> = {
        ...coreTools,
        ...task.customTools,
      };

      const conversationHistory: AgentMessage[] = [];
      const conversationChunk = new Map<number, AgentMessage[]>();
      function buildMessageInput(step: number, messages: AgentMessage[]) {
        conversationHistory.push(...messages);
        const chunk = conversationChunk.get(step);
        if (chunk) {
          conversationChunk.set(step, [...chunk, ...messages]);
        } else {
          conversationChunk.set(step, messages);
        }
      }

      function getMessageInput(step: number): AgentMessage[] {
        const conversations = Array.from(conversationChunk.entries()).sort(
          ([a], [b]) => a - b,
        );
        const relevantConversations = conversations.slice(
          -CONVERSATION_LOOK_BACK,
        );

        if (step > CONVERSATION_LOOK_BACK) {
          const task = conversationChunk.get(1);
          if (task) {
            relevantConversations.unshift([1, task]);
          }
        }
        return relevantConversations.flatMap(([_, messages]) => messages);
      }

      logger.info("[Agent] Starting task execution", {
        task,
        tools: Object.keys(allTools),
      });

      let step = 1;
      const screenSize = await computerProvider.screenSize().catch((error) => {
        throw new ComputerProviderError("Failed to get screen size", {
          cause: error,
        });
      });
      const firstScreenshot = await computerProvider.takeScreenshot(
        task.sessionId,
      );
      const { url: firstScreenshotUrl } = await computerProvider
        .uploadScreenshot({
          screenshotBase64: firstScreenshot,
          sessionId: task.sessionId,
          step: step,
        })
        .catch((error) => {
          throw new ComputerProviderError("Failed to upload screenshot", {
            cause: error,
          });
        });
      logger.info("[Agent] screenshot uploaded", {
        firstScreenshotUrl,
      });
      buildMessageInput(step, [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${task.instructions}

Here is the current state of the screen:`,
            },
            {
              type: "image",
              image: new URL(firstScreenshotUrl),
            },
          ],
        },
      ]);

      while (step < MAX_STEPS) {
        const messages = getMessageInput(step);
        logger.info(`[Agent]: Step ${step}`, {
          messages: messages.map((m) => m.content),
        });

        // Generate model response
        const response = await aiProvider
          .generateText({
            systemPrompt: SYSTEM_PROMPT({
              screenSize,
            }),
            messages,
            tools: allTools,
          })
          .catch((error) => {
            throw new AIProviderError("AI provider failed to generate text", {
              cause: error,
            });
          });

        logger.info("[Agent] Received response from LLM", {
          response: response.text,
          reasoning: response.reasoning,
          toolCalls: response.toolCalls,
        });

        // Add assistant response to conversation history
        if (response.text || response.reasoning) {
          buildMessageInput(step, [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  // fallback to empty string if no text or reasoning is provided
                  // Should never happen, since we check for reasoning and text above
                  text: response.text || response.reasoning || "",
                },
              ],
            },
          ]);
        }

        if (response.toolCalls.length === 0) {
          logger.info(
            "[Agent] No tool calls in response, prompting for continuation",
          );
          buildMessageInput(step + 1, [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "You haven't called any tools. Please continue with the task or use the complete_task tool if you believe the task is complete and all requirements have been met.",
                },
              ],
            },
          ]);
        }

        // Create agent log for this step
        const agentLog: AgentLog = {
          screenshot: "",
          step: step,
          timestamp: new Date().toISOString(),
          modelOutput: {
            done: {
              type: "text",
              text: response.text ?? "Processing...",
              reasoning: response.reasoning ?? "No reasoning provided",
            },
          },
          usage: {
            model: aiProvider.modelName,
            inputTokensStep: response.usage?.promptTokens,
            outputTokensStep: response.usage?.completionTokens,
            totalTokensStep: response.usage?.totalTokens,
          },
        };

        // Process tool calls
        for (const toolCall of response.toolCalls) {
          logger.info(`[Agent] Processing tool call: ${toolCall.toolName}`, {
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            toolArgs: toolCall.args,
          });
          const tool = allTools[toolCall.toolName];
          if (!tool) {
            logger.error(`[Agent] Tool ${toolCall.toolName} not found`, {
              toolCallId: toolCall.toolCallId,
              toolName: toolCall.toolName,
            });
            // Let the agent know the tool is not found
            buildMessageInput(step, [
              {
                role: "assistant",
                content: [
                  {
                    type: "text",
                    text: `Tool ${toolCall.toolName} not found. Please select another tool.`,
                  },
                ],
              },
            ]);
            continue;
          }
          const result = await tool
            .execute(toolCall.args, {
              toolCallId: toolCall.toolCallId,
              sessionId: task.sessionId,
              step,
              messages: conversationHistory,
            })
            .catch((error) => {
              throw new ToolCallError(
                `Error executing tool call: ${toolCall.toolName}`,
                {
                  cause: error,
                  toolName: toolCall.toolName,
                  toolArgs: toolCall.args,
                },
              );
            });

          // If the tool is `complete_task`, we should return the result and stop the agent.
          if (toolCall.toolName === "complete_task") {
            logger.info("[Agent] Task completed", { result });
            return result;
          }

          // For computer actions, we expect a certain output to build the next message.
          if (toolCall.toolName === "computer_action") {
            const computerActionResult = result as ComputerActionResult & {
              screenshotUrl: string;
            };
            agentLog.screenshot = computerActionResult.screenshotUrl;
            buildMessageInput(step + 1, [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Computer action on ${computerActionResult.timestamp}, result: ${computerActionResult.actionPerformed}. Reasoning: ${computerActionResult.reasoning} Screenshot as attached.`,
                  },
                  {
                    type: "image",
                    image: new URL(computerActionResult.screenshotUrl),
                  },
                ],
              },
            ]);
          } else {
            // For other tools, we just add the result as text.
            buildMessageInput(step + 1, [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Tool ${toolCall.toolName} executed with result: ${JSON.stringify(result)}`,
                  },
                ],
              },
            ]);
          }
        }
        ++step;
      }

      throw new AgentOutOfStepsError(
        `Agent has reached maximum steps of ${MAX_STEPS}.`,
      );
    },
  };

  return { session: sessionManager };
}
