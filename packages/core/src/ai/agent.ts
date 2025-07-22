import { z } from "zod";
import type { AIProvider, AgentLog, AgentMessage, PlanningData } from ".";
import { type Tool, createCompleteTaskTool } from "../tools";
import {
  type ComputerActionResult,
  type ComputerProvider,
  createComputerTool,
} from "../tools/computer";
import { ComputerProviderError, ToolCallError } from "../tools/errors";
import { SessionMemoryStore, createMemoryTool } from "../tools/memory";
import { type Logger, createNoOpLogger } from "../utils/logger";
import { AIProviderError, AgentError } from "./errors";
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
  const sessionMap = new Map<
    string,
    {
      id: string;
      liveUrl: string;
      status: "queued" | "running" | "idle" | "stopped";
      tasks: {
        instructions: string;
        result: unknown;
        logs: AgentLog[];
      }[];
    }
  >();

  function createSession(sessionId: string) {
    return {
      id: sessionId,
      end: async () => {
        const currentSession = sessionMap.get(sessionId);
        if (!currentSession) {
          throw new AgentError(`Session not found for sessionId: ${sessionId}`);
        }
        sessionMap.set(sessionId, {
          ...currentSession,
          status: "stopped",
          liveUrl: "",
        });
        await computerProvider.stop(sessionId);
      },
      get: () => {
        const currentSession = sessionMap.get(sessionId);
        if (!currentSession) {
          throw new AgentError(`Session not found for sessionId: ${sessionId}`);
        }
        return currentSession;
      },
      runTask: async <T extends z.ZodSchema>(task: {
        instructions: string;
        outputSchema?: T;
        // biome-ignore lint/suspicious/noExplicitAny: user defined
        customTools?: Record<string, Tool<z.ZodSchema, any>>;
      }): Promise<{ result: z.infer<T> }> => {
        const MAX_STEPS = 300;
        const CONVERSATION_LOOK_BACK = 7;

        // Create persistent memory store for this task
        const memoryStore = new SessionMemoryStore();

        const coreTools = {
          computer_action: createComputerTool({
            computerProvider,
          }),
          complete_task: createCompleteTaskTool({
            aiProvider,
            outputSchema: task.outputSchema ?? z.string(),
          }),
          memory: createMemoryTool({
            memoryStore,
          }),
        };
        // biome-ignore lint/suspicious/noExplicitAny: user defined
        const allTools: Record<string, Tool<z.ZodSchema, any>> = {
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
            const initialTaskMessage = task?.filter(
              (msg) => msg.role === "user",
            );
            if (initialTaskMessage?.length) {
              // Only preserve the initial user task message, not assistant responses/planning from Step 1
              relevantConversations.unshift([1, initialTaskMessage]);
            }
          }

          const messages = relevantConversations.flatMap(
            ([_, messages]) => messages,
          );

          // Inject persistent memory context if available
          const memoryContext = (
            memoryStore as SessionMemoryStore
          ).getMemoryContext();
          if (memoryContext) {
            // Add memory context as the first user message so it's always visible
            messages.unshift({
              role: "user",
              content: [
                {
                  type: "text",
                  text: memoryContext,
                },
              ],
            });
          }

          return messages;
        }

        const currentSession = sessionMap.get(sessionId);
        if (!currentSession) {
          throw new AgentError(`Session not found for sessionId: ${sessionId}`);
        }
        currentSession.status = "running";
        const currentTask: {
          instructions: string;
          result: unknown;
          logs: AgentLog[];
        } = {
          instructions: task.instructions,
          logs: [] as AgentLog[],
          result: undefined,
        };
        currentSession.tasks.push(currentTask);

        logger.info("[Agent] Starting task execution", {
          task,
          tools: Object.keys(allTools),
        });

        let step = 1;
        const screenSize = await computerProvider
          .screenSize()
          .catch((error) => {
            throw new ComputerProviderError("Failed to get screen size", {
              cause: error,
            });
          });
        const modelName = await aiProvider.modelName();
        const firstScreenshot = await computerProvider
          .takeScreenshot(sessionId)
          .catch((error) => {
            throw new ComputerProviderError("Failed to take screenshot", {
              cause: error,
            });
          });
        const uploadResult = await computerProvider
          .uploadScreenshot?.({
            screenshotBase64: firstScreenshot,
            sessionId,
            step,
          })
          .catch((error) => {
            throw new ComputerProviderError("Failed to upload screenshot", {
              cause: error,
            });
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
                image: uploadResult
                  ? new URL(uploadResult.url)
                  : firstScreenshot,
              },
            ],
          },
        ]);

        while (step < MAX_STEPS) {
          const messages = getMessageInput(step);
          logger.info(`[Agent]: Step ${step}`, {
            messages: messages.map((m) =>
              m.content.flatMap((c) => (c.type === "text" ? c.text : c.type)),
            ),
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

          // Planning data will be extracted from computer actions
          let planningData: PlanningData | undefined;

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
              model: modelName,
              inputTokensStep: response.usage?.promptTokens,
              outputTokensStep: response.usage?.completionTokens,
              totalTokensStep: response.usage?.totalTokens,
            },
            ...(planningData ? { planning: planningData } : {}),
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
                sessionId,
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

            logger.info("[Agent] Tool call result", {
              result: {
                ...result,
                ...(typeof result === "object" &&
                !!result &&
                "screenshot" in result
                  ? {
                      screenshot:
                        result.screenshot instanceof URL
                          ? result.screenshot.toString()
                          : "image-data",
                    }
                  : {}),
              },
            });
            // If the tool is `complete_task`, we should return the result and stop the agent.
            if (toolCall.toolName === "complete_task") {
              currentTask.result = result.output;
              if (currentSession) {
                currentSession.status = "idle";
              }
              return { result: result.output };
            }

            // For computer actions, we expect a certain output to build the next message.
            if (toolCall.toolName === "computer_action") {
              const computerActionResult = result as ComputerActionResult & {
                screenshot: string | URL;
                previousStepEvaluation: string;
                currentStepReasoning: string;
                nextStepGoal: string;
              };
              agentLog.screenshot = computerActionResult.screenshot.toString();
              agentLog.modelOutput.done.reasoning =
                computerActionResult.reasoning;

              // Extract planning data from computer action
              planningData = {
                previousStepEvaluation:
                  computerActionResult.previousStepEvaluation,
                currentStepReasoning: computerActionResult.currentStepReasoning,
                nextStepGoal: computerActionResult.nextStepGoal,
              };

              // Add planning data to agent log
              agentLog.planning = planningData;

              // Add planning data to conversation history
              const planningMessage = `[PLANNING - Step ${step}]
Previous Step Evaluation: ${computerActionResult.previousStepEvaluation}
Current Step Reasoning: ${computerActionResult.currentStepReasoning}
Next Step Goal: ${computerActionResult.nextStepGoal}`;

              buildMessageInput(step, [
                {
                  role: "assistant",
                  content: [
                    {
                      type: "text",
                      text: planningMessage,
                    },
                  ],
                },
              ]);

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
                      image: computerActionResult.screenshot,
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
                      text: `Tool ${toolCall.toolName} executed with result: ${JSON.stringify(
                        result,
                      )}`,
                    },
                  ],
                },
              ]);
            }
          }

          currentTask.logs.push(agentLog);
          ++step;
        }

        throw new AgentError(
          `Agent has reached maximum steps of ${MAX_STEPS}.`,
        );
      },
    };
  }

  const sessionManager = {
    getSession: (sessionId: string) => {
      const currentSession = sessionMap.get(sessionId);
      if (!currentSession) {
        throw new AgentError(`Session not found for sessionId: ${sessionId}`);
      }
      return createSession(sessionId);
    },
    initializeSession: async (sessionIdOverride?: string) => {
      const sessionId = sessionIdOverride ?? sessionIdGenerator();
      sessionMap.set(sessionId, {
        id: sessionId,
        liveUrl: "",
        tasks: [],
        status: "queued",
      });
      const { liveUrl, browser } = await computerProvider
        .start(sessionId)
        .catch((error) => {
          throw new ComputerProviderError("Failed to start computer provider", {
            cause: error,
          });
        });
      sessionMap.set(sessionId, {
        id: sessionId,
        liveUrl: liveUrl ?? "",
        ...(browser ? { browser } : {}),
        tasks: [],
        status: "idle",
      });
      return createSession(sessionId);
    },
  };

  return sessionManager;
}
