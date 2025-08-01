import { z } from "zod";
import type { AIProvider, AgentLog, AgentMessage, Session, Task } from ".";
import {
  SessionToDoListStore,
  type Tool,
  createCompleteTaskTool,
  createToDoListTool,
  createWaitTool,
} from "../tools";
import { type ComputerProvider, createComputerTool } from "../tools/computer";
import { ComputerProviderError, ToolCallError } from "../tools/errors";
import { SessionMemoryStore, createMemoryTool } from "../tools/memory";
import { type Logger, createNoOpLogger } from "../utils/logger";
import { processMessages } from "../utils/process-messages";
import { AIProviderError, AgentError } from "./errors";
import { SYSTEM_PROMPT } from "./prompts/system";

const sessionIdGenerator = () => `session_${crypto.randomUUID()}`;

/**
 *@example
 * ```ts
 * const agent = createAgent({
 *   aiProvider: createVercelAIProvider({
 *     model: createOpenAI({
 *       apiKey: process.env.OPENAI_API_KEY,
 *     })("o3"),
 *   }),
 *   computerProvider: createScrapybaraComputerProvider({
 *     apiKey: process.env.SCRAPYBARA_API_KEY,
 *   }),
 * });
 * const session = await agent.initializeSession();
 * const task = await session.runTask({
 *   instructions: "Summarize the top 3 articles",
 *   outputSchema: z.object({
 *     articles: z.array(z.object({
 *       title: z.string(),
 *       url: z.string(),
 *       summary: z.string(),
 *     })),
 *   }),
 *   initialUrl: "https://news.ycombinator.com",
 * });
 * console.log(task);
 * ```
 *
 * Creates an agent that can be used to run tasks.
 * @param {Object} options - The options for the agent.
 * @param {AIProvider | { ground: AIProvider; alternateGround?: AIProvider; evaluator?: AIProvider; }} options.aiProvider - The AI provider to use for the agent.
 * @param {ComputerProvider} options.computerProvider - The computer provider to use for the agent.
 * @param {Logger | undefined} [options.logger] - The logger to use for the agent.
 *
 * @returns A session manager that can be used to start tasks.
 */
export function createAgent<T, R>(options: {
  aiProvider:
    | AIProvider
    | {
        ground: AIProvider;
        alternateGround?: AIProvider;
        evaluator?: AIProvider;
      };
  computerProvider: ComputerProvider<T, R>;
  logger?: Logger;
}) {
  const { aiProvider, computerProvider, logger: loggerOverride } = options;
  const {
    ground,
    evaluator: baseEvaluator,
    alternateGround,
  } = "ground" in aiProvider ? aiProvider : { ground: aiProvider };
  const evaluator: AIProvider | undefined =
    baseEvaluator ??
    // we default to the ground provider if no evaluator is provided.
    // unless the evaluator is explicitly provided (could be undefined)
    ("evaluator" in aiProvider ? aiProvider.evaluator : ground);

  const logger = loggerOverride ?? createNoOpLogger();

  const sessionMap = new Map<string, Session>();

  function createSession(sessionId: string) {
    return {
      id: sessionId,
      /**
       * Ends the current session. This will stop the computer provider and mark the session as "stopped".
       * @throws {AgentError} If the session is not found.
       */
      end: async () => {
        const currentSession = sessionMap.get(sessionId);
        if (!currentSession) {
          throw new AgentError(`Session not found for sessionId: ${sessionId}`);
        }
        sessionMap.set(sessionId, {
          ...currentSession,
          status: "stopped",
          liveUrl: undefined,
          computerProviderId: undefined,
        });
        await computerProvider.stop(sessionId);
      },
      /**
       * Retrieves a task by its ID.
       * @param taskId The ID of the task to retrieve.
       * @throws {AgentError} If the session is not found.
       * @returns The task object if found, otherwise undefined.
       */
      getTask: (taskId: string) => {
        const currentSession = sessionMap.get(sessionId);
        if (!currentSession) {
          throw new AgentError(`Session not found for sessionId: ${sessionId}`);
        }
        return currentSession.tasks.find((task) => task.id === taskId);
      },
      /**
       * Retrieves the current session object.
       * @throws {AgentError} If the session is not found.
       * @returns The current session object.
       */
      get: () => {
        const currentSession = sessionMap.get(sessionId);
        if (!currentSession) {
          throw new AgentError(`Session not found for sessionId: ${sessionId}`);
        }
        return currentSession;
      },
      /**
       * @example
       * ```ts
       * const task = await session.runTask({
       *   instructions: "Summarize the top 3 articles",
       *   outputSchema: z.object({
       *     articles: z.array(z.object({
       *       title: z.string(),
       *       url: z.string(),
       *       summary: z.string(),
       *     })),
       *   }),
       *   initialUrl: "https://news.ycombinator.com",
       * });
       * console.log(task);
       * ```
       * Runs a task and returns the result.
       * @param {Object} task - The task to run.
       * @param {string} task.instructions - The instructions for the task.
       * @param {string} [task.initialUrl] - The initial URL to navigate to. If not provided, the session's initial URL will be used.
       * @param {z.ZodSchema} [task.outputSchema] - The schema for the output of the task.
       * @param {Record<string, Tool<z.ZodSchema, any>>} [task.customTools] - Object mapping tool name to custom tools to use for the task.
       * @param {number} [task.maxSteps] - The maximum number of steps to take for the task.
       * @param {Function} [task.onStepComplete] - A function to call when a step is complete.
       * @param {Function} [task.onTaskComplete] - A function to call when the task is complete.
       * @throws {AgentError} If the session is not found or the agent has reached the maximum number of steps.
       * @throws {ComputerProviderError} If the computer provider fails to navigate to the initial URL or take a screenshot.
       * @throws {AIProviderError} If the AI provider fails to provide a response.
       * @throws {ToolCallError} If a tool call fails.
       * @returns {Promise<Task<z.infer<T>>>} The result of the task.
       */
      runTask: async <T extends z.ZodSchema>(task: {
        instructions: string;
        initialUrl?: string;
        outputSchema?: T;
        // biome-ignore lint/suspicious/noExplicitAny: user defined
        customTools?: Record<string, Tool<z.ZodSchema, any>>;
        maxSteps?: number;
        onStepComplete?: (args: {
          step: number;
          sessionId: string;
          currentLog: AgentLog;
          currentTask: Omit<Task<T>, "result">;
        }) => void | Promise<void>;
        onTaskComplete?: (args: {
          step: number;
          sessionId: string;
          result: z.infer<T>;
          currentTask: Omit<Task<T>, "result">;
        }) => void | Promise<void>;
      }): Promise<Task<z.infer<T>>> => {
        const MAX_STEPS = task.maxSteps ?? 100;
        const CONVERSATION_LOOK_BACK = 7;

        // Create persistent memory store for this task
        const memoryStore = new SessionMemoryStore();
        const todoListStore = new SessionToDoListStore();

        const coreTools = {
          computer_action: createComputerTool({
            computerProvider,
          }),
          complete_task: createCompleteTaskTool({
            ground,
            evaluator,
            outputSchema:
              task.outputSchema ??
              z.object({
                value: z
                  .string()
                  .describe(
                    "Follow this with the result of the task pertaining to the user's instructions. DO NOT describe what you did. Instead, regurgitate the result of the task that the user asked for.",
                  ),
              }),
            currentInstruction: task.instructions,
          }),
          memory: createMemoryTool({
            memoryStore,
          }),
          wait: createWaitTool({
            computerProvider,
          }),
          todo_list: createToDoListTool({
            toDoListStore: todoListStore,
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
          const memoryContext = memoryStore.getMemoryContext();
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

          const taskListContext = todoListStore.getTaskListContext();
          if (taskListContext) {
            // Add task list context as the first user message so it's always visible
            messages.unshift({
              role: "user",
              content: [
                {
                  type: "text",
                  text: taskListContext,
                },
              ],
            });
          }

          return messages;
        }

        if (task.initialUrl) {
          await computerProvider.navigateTo({
            sessionId,
            url: task.initialUrl,
          });
          logger.info("[Agent] Navigated to initial URL", {
            initialUrl: task.initialUrl,
          });
        }

        const [groundModelName, alternateModelName] = await Promise.all([
          ground.modelName(),
          alternateGround?.modelName(),
        ]);

        const getCurrentModel = (step: number) => {
          // If no alternateGround, always use ground
          if (!alternateGround) {
            return { model: groundModelName, provider: ground };
          }
          // Alternate between models: odd steps use ground, even steps use alternateGround
          return step % 2 === 1
            ? { model: groundModelName, provider: ground }
            : // cast is okay because we know alternateGround is defined
              {
                model: alternateModelName as string,
                provider: alternateGround,
              };
        };

        const currentSession = sessionMap.get(sessionId);
        if (!currentSession) {
          throw new AgentError(`Session not found for sessionId: ${sessionId}`);
        }
        currentSession.status = "running";
        const currentTask: Omit<Task<T>, "result"> & { result: T | undefined } =
          {
            id: crypto.randomUUID(),
            instructions: task.instructions,
            logs: [],
            result: undefined,
            initialUrl: task.initialUrl,
          };
        currentSession.tasks.push(currentTask);

        logger.info("[Agent] Starting task execution", {
          task: {
            ...task,
            outputSchema: task.outputSchema ? "custom" : "default",
          },
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
          const processedMessages = await processMessages(messages);
          logger.info(`[Agent]: Step ${step}`, {
            messages: processedMessages.map((m) =>
              m.content.flatMap((c) =>
                c.type === "text"
                  ? c.text
                  : `${c.type} ${c.image instanceof URL ? "url" : "raw"}`,
              ),
            ),
          });

          // Generate model response
          const currentModel = getCurrentModel(step);
          const response = await currentModel.provider
            .generateText({
              systemPrompt: SYSTEM_PROMPT({
                screenSize,
              }),
              messages: processedMessages,
              tools: allTools,
            })
            .catch((error) => {
              logger.error("[Agent] AI provider failed to generate text", {
                error: error.message,
              });
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
                    text: "Please continue with the task with what you think is best. If you or the user believe the task is complete and all requirements have been met, use the complete_task tool.",
                  },
                ],
              },
            ]);
          }
          let agentLog: AgentLog = {
            screenshot: "",
            step,
            timestamp: new Date().toISOString(),
            currentUrl: await computerProvider.getCurrentUrl(sessionId),
            modelOutput: {
              done: [
                {
                  type: "text",
                  text: response.text ?? "Processing...",
                  reasoning: response.reasoning ?? "No reasoning provided",
                },
              ],
            },
            usage: {
              model: currentModel.model,
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
                sessionId,
                step,
                messages: conversationHistory,
              })
              .catch((error) => {
                logger.error("[Agent] Error executing tool call", {
                  error: error.message,
                });
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
              result:
                result.type === "completion"
                  ? result.output
                  : result.response.content.filter((c) => c.type === "text"),
            });

            // If the tool is `complete_task`, we should return the result and stop the agent.
            if (result.type === "completion") {
              currentTask.result = result.output;
              currentSession.status = "idle";
              currentTask.logs.push(agentLog);
              if (task.onTaskComplete) {
                task.onTaskComplete({
                  step,
                  sessionId,
                  result: result.output,
                  currentTask: currentTask,
                });
              }

              return currentTask as Task<T>;
            }

            // Update agent log for this step
            if (result.updateCurrentAgentLog) {
              agentLog = result.updateCurrentAgentLog(agentLog);
            }
            buildMessageInput(step + 1, [result.response]);
          }

          currentTask.logs.push(agentLog);
          if (task.onStepComplete) {
            task.onStepComplete({
              step,
              sessionId,
              currentLog: agentLog,
              currentTask: currentTask,
            });
          }
          ++step;
        }

        throw new AgentError(
          `Agent has reached maximum steps of ${MAX_STEPS}.`,
        );
      },
    };
  }

  const sessionManager = {
    /**
     * Retrieves an existing session.
     * @param sessionId The ID of the session to retrieve.
     * @returns A session object.
     * @throws {AgentError} If the session is not found.
     */
    getSession: (sessionId: string) => {
      const currentSession = sessionMap.get(sessionId);
      if (!currentSession) {
        throw new AgentError(`Session not found for sessionId: ${sessionId}`);
      }
      return createSession(sessionId);
    },
    /**
     * Initializes a new agent session.
     * @param args.sessionIdOverride An optional string to override the generated session ID.
     * @param args.computerProviderOptions An optional object to pass computer provider specific options when starting the session.
     * @returns A new session object.
     * @throws {ComputerProviderError} If the computer provider fails to start.
     */
    initializeSession: async (args?: {
      sessionIdOverride?: string;
      computerProviderOptions?: Parameters<typeof computerProvider.start>[1];
    }) => {
      const sessionId = args?.sessionIdOverride ?? sessionIdGenerator();
      sessionMap.set(sessionId, {
        id: sessionId,
        liveUrl: undefined,
        computerProviderId: "",
        tasks: [],
        status: "queued",
      });
      const { liveUrl, computerProviderId } = await computerProvider
        .start(sessionId, args?.computerProviderOptions)
        .catch((error) => {
          logger.error("[Agent] Failed to start computer provider", {
            error: error.message,
          });
          throw new ComputerProviderError("Failed to start computer provider", {
            cause: error,
          });
        });
      sessionMap.set(sessionId, {
        id: sessionId,
        liveUrl: liveUrl,
        computerProviderId,
        tasks: [],
        status: "idle",
      });
      return createSession(sessionId);
    },
  };

  return sessionManager;
}
