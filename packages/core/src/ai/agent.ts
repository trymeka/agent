import { z } from "zod";
import type { AIProvider, AgentLog, AgentMessage, Session, Task } from ".";
import { type Tool, createCompleteTaskTool, createWaitTool } from "../tools";
import {
  type ComputerProvider,
  type ScreenSize,
  createComputerTool,
} from "../tools/computer";
import { ComputerProviderError, ToolCallError } from "../tools/errors";
import { SessionMemoryStore, createMemoryTool } from "../tools/memory";
import { type Logger, createNoOpLogger } from "../utils/logger";
import { processMessages } from "../utils/process-messages";
import { AIProviderError, AgentError } from "./errors";
import { SYSTEM_PROMPT } from "./prompts/system";
import type { SerializableSessionState } from "./session-persistence";

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
  createSystemPrompt?: (options: {
    screenSize: ScreenSize;
  }) => string;
  logger?: Logger;
}) {
  const {
    aiProvider,
    computerProvider,
    logger: loggerOverride,
    createSystemPrompt,
  } = options;
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
  const sessionObjectCache = new Map<
    string,
    ReturnType<typeof createSession>
  >();

  function createSession(sessionId: string) {
    // Session-level state for persistence
    let sessionMemoryStore: SessionMemoryStore | null = null;
    let sessionConversationChunk: Map<number, AgentMessage[]> | null = null;
    let sessionConversationHistory: AgentMessage[] | null = null;

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

        // Create or reuse persistent memory store for this task
        if (!sessionMemoryStore) {
          sessionMemoryStore = new SessionMemoryStore();
        }
        const memoryStore = sessionMemoryStore;

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
            logger,
          }),
          memory: createMemoryTool({
            memoryStore,
          }),
          wait: createWaitTool({
            computerProvider,
          }),
        };

        // biome-ignore lint/suspicious/noExplicitAny: user defined
        const allTools: Record<string, Tool<z.ZodSchema, any>> = {
          ...coreTools,
          ...task.customTools,
        };

        // Conversation state will be initialized after we determine if resuming or starting new
        let conversationHistory: AgentMessage[];
        let conversationChunk: Map<number, AgentMessage[]>;
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

          return messages;
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

        // Check if there's an existing unfinished task to resume
        let currentTask: Omit<Task<T>, "result"> & { result: T | undefined };
        const existingTask =
          currentSession.tasks[currentSession.tasks.length - 1];

        if (
          existingTask &&
          !existingTask.result &&
          existingTask.logs.length > 0
        ) {
          // Resume existing task - use existing conversation state
          currentTask = existingTask as Omit<Task<T>, "result"> & {
            result: T | undefined;
          };
          conversationHistory = sessionConversationHistory || [];
          conversationChunk =
            sessionConversationChunk || new Map<number, AgentMessage[]>();

          logger.info("[Agent] Resuming existing task", {
            taskId: currentTask.id,
            currentStep: currentTask.logs.length,
            instructions: currentTask.instructions,
          });
        } else {
          // Create new task - initialize fresh conversation state
          currentTask = {
            id: crypto.randomUUID(),
            instructions: task.instructions,
            logs: [],
            result: undefined,
            initialUrl: task.initialUrl,
          };
          currentSession.tasks.push(currentTask);

          // Initialize fresh conversation state for new tasks
          sessionConversationHistory = [];
          sessionConversationChunk = new Map<number, AgentMessage[]>();
          conversationHistory = sessionConversationHistory;
          conversationChunk = sessionConversationChunk;

          logger.info("[Agent] Starting new task", {
            taskId: currentTask.id,
            instructions: task.instructions,
          });

          // Only navigate to initial URL for new tasks
          if (task.initialUrl) {
            await computerProvider.navigateTo({
              sessionId,
              url: task.initialUrl,
            });
            logger.info("[Agent] Navigated to initial URL", {
              initialUrl: task.initialUrl,
            });
          }
        }

        logger.info("[Agent] Starting task execution", {
          task: {
            ...task,
            outputSchema: task.outputSchema ? "custom" : "default",
          },
          tools: Object.keys(allTools),
        });

        // Determine starting step - use current logs length + 1 for resumed sessions
        let step =
          currentTask.logs.length > 0 ? currentTask.logs.length + 1 : 1;
        const isResumedSession = currentTask.logs.length > 0;

        const screenSize = await computerProvider
          .screenSize()
          .catch((error) => {
            throw new ComputerProviderError("Failed to get screen size", {
              cause: error,
            });
          });

        // Only take initial screenshot and build initial message for new sessions
        if (!isResumedSession) {
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
        }

        while (step < MAX_STEPS) {
          const messages = getMessageInput(step);
          const processedMessages = await processMessages(messages, logger);
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
          const requestPayload = {
            systemPrompt:
              createSystemPrompt?.({
                screenSize,
              }) ??
              SYSTEM_PROMPT({
                screenSize,
              }),
            messages: processedMessages,
            tools: allTools,
          };

          logger.info("[Agent] Sending request to AI provider", {
            modelName: currentModel.model,
            messagesCount: processedMessages.length,
            toolsCount: Object.keys(allTools).length,
            systemPromptLength: requestPayload.systemPrompt.length,
          });

          const response = await currentModel.provider
            .generateText(requestPayload)
            .catch((error) => {
              logger.error("[Agent] AI provider failed to generate text", {
                error: error.message,
                errorName: error.name,
                errorStack: error.stack,
                fullError: error,
                modelName: currentModel.model,
                requestPayload: {
                  systemPromptLength: requestPayload.systemPrompt.length,
                  messagesCount: requestPayload.messages.length,
                  toolsCount: Object.keys(requestPayload.tools).length,
                  messages: requestPayload.messages.map((msg) => ({
                    role: msg.role,
                    contentLength: msg.content.length,
                    hasToolCalls: !!(
                      "toolCalls" in msg && msg.toolCalls?.length
                    ),
                  })),
                },
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
              inputTokensStep: response.usage?.inputTokens,
              outputTokensStep: response.usage?.outputTokens,
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

      /**
       * Saves the current session state for persistence.
       * @returns The serializable session state.
       * @throws {AgentError} If the session is not found or no task is running.
       */
      save: async (): Promise<SerializableSessionState> => {
        const currentSession = sessionMap.get(sessionId);
        if (!currentSession) {
          throw new AgentError(`Session not found for sessionId: ${sessionId}`);
        }

        const currentTask =
          currentSession.tasks[currentSession.tasks.length - 1];
        if (!currentTask) {
          throw new AgentError(`No active task found for session ${sessionId}`);
        }

        // Extract conversation chunks (only last 7 steps)
        const conversationChunks: Record<number, AgentMessage[]> = {};
        if (sessionConversationChunk) {
          const currentStep = currentTask.logs.length;
          const startStep = Math.max(1, currentStep - 7);

          for (let i = startStep; i <= currentStep; i++) {
            const chunk = sessionConversationChunk.get(i);
            if (chunk) {
              conversationChunks[i] = chunk;
            }
          }
        }

        // Extract memory data
        const memoryData: Record<string, string> = {};
        if (sessionMemoryStore) {
          const keys = sessionMemoryStore.list();
          for (const key of keys) {
            const value = sessionMemoryStore.get(key);
            if (value !== undefined) {
              memoryData[key] = value;
            }
          }
        }

        // Get CDP URL from computer provider if available
        let cdpUrl: string | undefined;
        try {
          const instance = await computerProvider.getInstance(sessionId);
          cdpUrl = (instance as { cdpUrl: string }).cdpUrl;
        } catch (error) {
          logger.warn(`Could not get CDP URL from computer provider: ${error}`);
        }

        const state: SerializableSessionState = {
          sessionId,
          currentStep: currentTask.logs.length,
          instructions: currentTask.instructions,
          ...(currentTask.initialUrl && { initialUrl: currentTask.initialUrl }),
          computerProviderId: currentSession.computerProviderId || "",
          ...(currentSession.liveUrl && { liveUrl: currentSession.liveUrl }),
          ...(cdpUrl && { cdpUrl }),
          task: {
            id: currentTask.id,
            logs: currentTask.logs,
          },
          conversationChunks,
          memoryData,
          createdAt: new Date().toISOString(),
          lastSavedAt: new Date().toISOString(),
        };

        return state;
      },

      /**
       * Pauses the current session by stopping task execution.
       * @throws {AgentError} If the session is not found.
       */
      pause: (): void => {
        const currentSession = sessionMap.get(sessionId);
        if (!currentSession) {
          throw new AgentError(`Session not found for sessionId: ${sessionId}`);
        }

        // Mark session as paused
        sessionMap.set(sessionId, {
          ...currentSession,
          status: "idle", // Use idle status for paused state
        });

        logger.info(`Session ${sessionId} paused`);
      },

      /**
       * Loads a saved session state.
       * @param state The serializable session state to load.
       * @throws {AgentError} If loading fails.
       */
      load: (state: SerializableSessionState): void => {
        // Restore session in sessionMap
        sessionMap.set(sessionId, {
          id: sessionId,
          computerProviderId: state.computerProviderId,
          liveUrl: state.liveUrl,
          status: "idle",
          tasks: [
            {
              id: state.task.id,
              instructions: state.instructions,
              initialUrl: state.initialUrl,
              logs: state.task.logs,
              result: undefined, // Will be set when task completes
            },
          ],
        });

        // Restore conversation chunks
        sessionConversationChunk = new Map();
        sessionConversationHistory = [];

        for (const [step, messages] of Object.entries(
          state.conversationChunks,
        )) {
          sessionConversationChunk.set(Number.parseInt(step), messages);
          sessionConversationHistory.push(...messages);
        }

        // Restore memory data
        sessionMemoryStore = new SessionMemoryStore();
        for (const [key, value] of Object.entries(state.memoryData)) {
          sessionMemoryStore.set(key, value);
        }

        logger.info(`Session ${sessionId} loaded from saved state`);
      },

      /**
       * Resumes a paused session by continuing task execution.
       * @throws {AgentError} If the session is not found or not paused.
       */
      resume: (): void => {
        const currentSession = sessionMap.get(sessionId);
        if (!currentSession) {
          throw new AgentError(`Session not found for sessionId: ${sessionId}`);
        }

        const currentTask =
          currentSession.tasks[currentSession.tasks.length - 1];
        if (!currentTask) {
          throw new AgentError(`No task to resume for session ${sessionId}`);
        }

        // Mark as running
        sessionMap.set(sessionId, {
          ...currentSession,
          status: "running",
        });

        logger.info(
          `Session ${sessionId} resumed - ready for runTask continuation`,
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

      // Check if we already have a session object for this ID
      let sessionObject = sessionObjectCache.get(sessionId);
      if (!sessionObject) {
        sessionObject = createSession(sessionId);
        sessionObjectCache.set(sessionId, sessionObject);
      }

      return sessionObject;
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
      const sessionObject = createSession(sessionId);
      sessionObjectCache.set(sessionId, sessionObject);
      return sessionObject;
    },

    /**
     * Restores a session from saved state.
     * @param state The serializable session state to restore.
     * @returns A session object for the restored session.
     * @throws {AgentError} If restoration fails.
     */
    restoreSession: async (state: SerializableSessionState) => {
      const sessionId = state.sessionId;

      // Create session object first and cache it
      const session = createSession(sessionId);
      sessionObjectCache.set(sessionId, session);

      // Restore computer provider session if we have the CDP URL
      if (
        state.cdpUrl &&
        state.computerProviderId &&
        computerProvider.restoreSession
      ) {
        try {
          await computerProvider.restoreSession(
            sessionId,
            state.cdpUrl,
            state.liveUrl,
            state.computerProviderId,
          );
          logger.info(`Computer provider session restored for ${sessionId}`);
        } catch (error) {
          logger.error(
            `Failed to restore computer provider session for ${sessionId}`,
            { error },
          );
          throw new AgentError(
            `Failed to restore computer provider session: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }

      // Set up the session state
      sessionMap.set(sessionId, {
        id: sessionId,
        liveUrl: state.liveUrl,
        computerProviderId: state.computerProviderId,
        tasks: [
          {
            id: state.task.id,
            instructions: state.instructions,
            initialUrl: state.initialUrl,
            logs: state.task.logs,
            result: undefined,
          },
        ],
        status: "idle",
      });

      // Load the saved state into the session
      session.load(state);

      logger.info(`Session ${sessionId} restored from saved state`);

      return session;
    },
  };

  return sessionManager;
}
