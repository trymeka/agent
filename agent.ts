import { Buffer } from "node:buffer";
import {
  type CoreMessage,
  NoSuchToolError,
  generateObject,
  generateText,
} from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import logger from "../config/datadog";
import { db } from "../db";
import { getCuaBrowserSession } from "../db/queries";
import { cuaBrowserSession } from "../db/schema";
import {
  updateBrowserSession,
  updateBrowserSessionAgentLogs,
} from "../db/updates";
import { analyzeTool } from "../lib/agent-tools/analyze";
import {
  computerActionTool,
  executeComputerAction,
  getToolCallSchema,
} from "../lib/agent-tools/computer-use/action";
import {
  executeTaskCompletion,
  taskCompletionTool,
} from "../lib/agent-tools/computer-use/task-completion";
import {
  geminiPro,
  o3,
  vercelProviderOptions,
} from "../lib/agent-tools/models";
import { formatResources } from "../lib/agent-tools/resource/format-resources";
import { listResourcesTool } from "../lib/agent-tools/resource/list";
import type { ActiveSession, SessionProvider } from "../lib/browser-providers";
import {
  startHyperbrowserRecording,
  stopHyperbrowserRecording,
} from "../lib/utils/hyperbrowser-video-recording";
import { uploadScreenshotToS3 } from "../lib/utils/uploadScreenshotToS3";
import type { AgentLog, GithubCommitDetails, Task } from "../types/cua";
import { terminateSessionWithProvider } from "./cuaService";
import {
  sendCompletedWebhook,
  sendNewStepWebhook,
  sendTaskCompletedWebhook,
  sendTaskStartedWebhook,
} from "./webhookService";

// Output schema for test results
const outputSchema = z.object({
  issues: z.array(
    z.object({
      summary: z
        .string()
        .describe("A concise summary of the issue (1 sentence max)"),
      description: z
        .string()
        .describe("A detailed description of what went wrong and its impact"),
      status: z.enum(["error"]).describe("The status of the issue"),
      screenshot: z
        .string()
        .describe("The screenshot of the issue when it was first seen"),
      timestamp: z
        .string()
        .describe("ISO timestamp of when the issue was first observed"),
    }),
  ),
  scenarios: z.array(
    z.object({
      name: z.string().describe("A descriptive name for the test scenario"),
      steps: z.array(
        z.object({
          action: z.string().describe("The action performed"),
          reasoning: z
            .string()
            .nullable()
            .describe("The reasoning for the action"),
          screenshot: z
            .string()
            .nullable()
            .describe("The screenshot of the action"),
          timestamp: z.string().describe("ISO timestamp of the action"),
        }),
      ),
    }),
  ),
});

// Main testing agent
export class ExperimentalAgentV2 {
  private model = o3;
  private sessionLogger: ReturnType<typeof logger.child>;
  private conversationLookBack = 7;
  private conversationHistory: CoreMessage[] = [];
  private conversationChunk: Map<number, CoreMessage[]> = new Map();

  constructor(
    private sessionId: string,
    private provider: SessionProvider,
    private session: ActiveSession,
  ) {
    this.sessionLogger = logger.child({ sessionId });
  }

  private getSystemPrompt(): string {
    return `You are an advanced QA Testing Agent with computer vision capabilities. Your role is to perform comprehensive testing of web applications by directly interacting with them through computer actions.

## TASK COMPLETION REQUIREMENT
- You MUST use the task_completion tool to officially end the task
- The task cannot be completed without calling this tool
- You CANNOT end the task by simply stopping - you must explicitly call task_completion

## FULL DESKTOP INTERACTION CAPABILITIES
IMPORTANT: You can interact with the ENTIRE computer screen, not just the browser content!
- The screenshot shows the complete desktop (${this.session.screenSize.width} width x ${this.session.screenSize.height} height pixels)
- You can click ANYWHERE on this screenshot: browser chrome, tabs, address bar, desktop, taskbar, etc.
- Coordinates (0,0) (width, height) start at the top-left corner of the ENTIRE SCREENSHOT
- Do NOT limit yourself to just the webpage content area
- Browser UI elements (address bar, tabs, bookmarks) are all clickable
- Operating system elements are also interactive

## COORDINATE PRECISION
- Analyze the ENTIRE screenshot carefully before clicking
- Look for ALL visual elements: buttons, links, input fields, browser UI, etc.
- Calculate coordinates based on the FULL screenshot dimensions
- If you see an element at position X,Y in the screenshot, click exactly at X,Y
- No coordinate adjustments needed - what you see is what you click

## CORE PRINCIPLES

1. **Follow Instructions Precisely**: When given specific testing steps, follow them exactly as written, starting from the provided URL.

2. **Take Action Immediately**: After taking a screenshot, DO NOT spend multiple turns analyzing. Take concrete actions immediately.

3. **Think Like a User**: Approach testing from an end-user perspective, not a developer's viewpoint. Consider what a typical user would expect and experience.

4. **Verification-Driven Testing**: For each step, explicitly state your verification criteria before and after execution. If explicit verification criteria are provided in the instructions, follow them precisely.

5. **Fail Fast on Critical Issues**: If you encounter obvious functional failures or cannot navigate to required sections, fail the test immediately rather than continuing.

6. **Context Awareness**: You have access to the most recent 7 screenshots and all previous conversation history. Screenshots are labeled with step numbers (e.g., "Screenshot at Step 3") so you can track progress and avoid repeating failed actions from earlier steps.

## AVAILABLE COMPUTER ACTIONS

You can interact with the application using these computer actions:
- **click**: Click at specific coordinates with optional button (left, right, middle, back, forward)
- **double_click**: Double-click at specific coordinates
- **scroll**: Scroll at specific coordinates with scroll_x and scroll_y values
- **keypress**: Press specific key combinations
- **type**: Type text at the current cursor position
- **wait**: Wait for a specified duration (or default)
- **screenshot**: Take a screenshot of the current state
- **drag**: Drag along a path of coordinates
- **move**: Move cursor to specific coordinates

## TASK COMPLETION TOOL

You have access to a task_completion tool that you MUST use to officially end the task:
- **task_completion**: Declare task completion with evidence and summary

## TESTING WORKFLOW

1. **Initial Assessment**: Take a screenshot and analyze the current state
2. **Immediate Action**: After seeing the current state, take the next required action immediately
3. **No Excessive Analysis**: Do NOT use analyze_step repeatedly - use it only when you genuinely need to pause and think
4. **Action First**: When you know what to do (like clicking a button or typing text), use computer_action immediately
5. **Verification**: Take a screenshot after significant actions to verify results
6. **Official Completion**: Use task_completion tool when all requirements are met

## ACTION PRIORITY

- **ALWAYS prefer computer_action over analyze_step when you can see what needs to be done**
- Use analyze_step ONLY when you are genuinely confused about what to do next
- If you can see a button to click, text field to fill, or other UI element to interact with - ACT immediately
- Do NOT analyze the same page multiple times - if you've analyzed it once, take action

## VERIFICATION CRITERIA

- **Explicit Criteria**: If the instruction provides specific verification criteria, follow them exactly
- **Implicit Criteria**: Based on the action, determine logical success criteria
- **User Experience**: Consider if the result makes sense from a user's perspective
- **Functional Validation**: Ensure the action achieved its intended purpose

## FAILURE CONDITIONS

- **Navigation Failures**: Cannot reach required pages or sections
- **Functional Failures**: Features don't work as expected
- **Verification Failures**: Explicit verification criteria are not met
- **Logic Breaks**: User flow doesn't make logical sense
- **Critical Errors**: Application crashes or becomes unusable

## ISSUE REPORTING

Report issues that affect real users:
- Broken functionality (buttons not working, forms not submitting)
- Confusing UX (misleading labels, unexpected behavior)
- Logic inconsistencies (actions don't match expectations)
- Performance problems affecting usability
- Missing or broken content

## IMPORTANT EXECUTION NOTES

- **BE DECISIVE**: When you see a login form, immediately start filling it out
- **NO ENDLESS ANALYSIS**: One analysis per page/state is enough
- **ACT ON WHAT YOU SEE**: If you see an email field and have credentials, click and type immediately
- **FOLLOW THE TASK**: For login testing, take a screenshot, then immediately start logging in
- **USE SCREENSHOTS FOR VERIFICATION**: Take screenshots after actions to confirm they worked
- **MUST USE TASK_COMPLETION**: You cannot end the task without using the task_completion tool

Begin by taking a screenshot to see the current state, then immediately start executing the testing instructions without excessive analysis.

REMEMBER: You MUST use the task_completion tool to officially end the task. The task is NOT complete until you call task_completion.
`;
  }

  private createComputerActionTools() {
    return {
      analyze: analyzeTool,
      computer_action: computerActionTool,
      task_completion: taskCompletionTool,
    };
  }
  private resetMessageInput() {
    this.conversationHistory = [];
    this.conversationChunk = new Map();
  }
  private buildMessageInput(iteration: number, messages: CoreMessage[]) {
    this.conversationHistory.push(...messages);
    const chunk = this.conversationChunk.get(iteration);
    if (chunk) {
      this.conversationChunk.set(iteration, [...chunk, ...messages]);
    } else {
      this.conversationChunk.set(iteration, messages);
    }
  }
  private getMessageInput(iteration: number): CoreMessage[] {
    const conversations = Array.from(this.conversationChunk.entries()).sort(
      ([a], [b]) => a - b,
    );
    const relevantConversations = conversations.slice(
      -this.conversationLookBack,
    );
    if (iteration > this.conversationLookBack) {
      const task = this.conversationChunk.get(1);
      if (task) {
        relevantConversations.unshift([1, task]);
      }
    }

    this.sessionLogger.info("[ExperimentalAgentV2] Getting message input", {
      relevantConversations,
    });
    return relevantConversations.flatMap(([_, messages]) => messages);
  }

  async executeTask(
    task: Task,
    webhookUrl: string,
  ): Promise<z.infer<typeof outputSchema>> {
    const systemPrompt = this.getSystemPrompt();
    const tools = this.createComputerActionTools();
    this.resetMessageInput();

    this.sessionLogger.info("[ExperimentalAgentV2] Starting task execution", {
      task,
      tools: Object.keys(tools),
    });
    const MAX_ITERATIONS = 300;
    let iteration = 1;
    const firstScreenshot = await this.provider.takeScreenshot(this.session);
    const firstScreenshotUrl = await uploadScreenshotToS3(
      Buffer.from(firstScreenshot, "base64"),
      this.sessionId,
      iteration,
    );
    this.sessionLogger.info("[ExperimentalAgentV2] First screenshot uploaded", {
      firstScreenshotUrl,
    });
    this.buildMessageInput(iteration, [
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
            image: firstScreenshotUrl,
          },
        ],
      },
    ]);

    while (iteration < MAX_ITERATIONS) {
      const messages = this.getMessageInput(iteration);
      this.sessionLogger.info(`[ExperimentalAgentV2]: iteration ${iteration}`, {
        messages: messages.map((m) => m.content),
      });

      // Generate model response
      const response = await generateText({
        model: this.model,
        system: systemPrompt,
        messages,
        tools,
        temperature: 0.1,
        providerOptions: vercelProviderOptions,
        experimental_repairToolCall: async ({
          toolCall,
          parameterSchema,
          error,
        }) => {
          this.sessionLogger.warn(
            "[ExperimentalAgentV2] repair tool call triggered",
            {
              toolCall,
              tools,
              params: parameterSchema(toolCall),
              error,
            },
          );
          // do not attempt to fix invalid tool names
          if (NoSuchToolError.isInstance(error)) {
            return null;
          }

          const toolCallResult = getToolCallSchema(toolCall.args);
          if (!toolCallResult) {
            return null;
          }

          const result = await generateObject({
            model: geminiPro,
            schema: toolCallResult.schema,
            providerOptions: vercelProviderOptions,
            prompt: [
              `The model tried to call the tool "${toolCall.toolName}" with the following arguments:`,
              JSON.stringify(toolCall.args),
              "The tool accepts the following schema:",
              JSON.stringify(parameterSchema(toolCall)),
              "Please fix the arguments.",
            ].join("\n"),
            maxRetries: 3,
          }).catch((error) => {
            this.sessionLogger.error(
              "[ExperimentalAgentV2] Error repairing tool call",
              { error },
            );
            return null;
          });
          if (!result) {
            return null;
          }

          this.sessionLogger.info(
            "[ExperimentalAgentV2] attempted to repair tool call",
            {
              repairedArgs: result.object,
            },
          );

          return {
            ...toolCall,
            args: JSON.stringify({
              action: result.object,
              reasoning: toolCallResult.args.reasoning,
            }),
          };
        },
        maxSteps: 1,
        maxRetries: 3,
      }).catch((error) => {
        this.sessionLogger.error(
          `[ExperimentalAgentV2] Error in iteration ${iteration}`,
          {
            error,
            errorMessage:
              error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
          },
        );
        throw error;
      });

      this.sessionLogger.info(
        "[ExperimentalAgentV2] Received response from LLM",
        {
          response: response.text,
          toolCalls: response.toolCalls,
          toolResults: response.toolResults,
          finishReason: response.finishReason,
          reasoning: response.reasoning,
          reasoningDetails: response.reasoningDetails,
          providerMetadata: response.providerMetadata,
          rawResponse: JSON.stringify(response, null, 2).substring(0, 5000), // First 5000 chars
        },
      );

      // Extract reasoning from response
      let reasoning = "No reasoning provided";
      // Check for reasoning in various possible locations
      if (response.reasoning?.trim()) {
        reasoning = response.reasoning;
      } else if (response.text?.trim()) {
        reasoning = response.text;
      }

      // Add assistant response to conversation history
      this.buildMessageInput(iteration, [
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: response.text || "Processing...",
            },
          ],
        },
      ]);

      // Create agent log for this step
      const agentLog: AgentLog = {
        screenshot: "",
        step: iteration,
        timestamp: new Date().toISOString(),
        modelOutput: {
          action: {
            done: {
              type: "text",
              text: response.text ?? "Processing...",
              reasoning,
            },
          },
        },
        usage: {
          model: this.model.modelId,
          inputTokensStep: response.usage?.promptTokens ?? 0,
          outputTokensStep: response.usage?.completionTokens ?? 0,
          totalTokensStep: response.usage?.totalTokens ?? 0,
          inputTokensTotal: 0,
          outputTokensTotal: 0,
          totalTokensTotal: 0,
        },
      };

      if (response.toolCalls.length === 0) {
        this.sessionLogger.info(
          "[ExperimentalAgentV2] No tool calls in response, prompting for continuation",
        );
        this.buildMessageInput(iteration + 1, [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "You haven't called any tools. Please continue with the task or use the task_completion tool if you believe the task is complete and all requirements have been met.",
              },
            ],
          },
        ]);
      }
      // Process tool calls
      for (const toolCall of response.toolCalls) {
        this.sessionLogger.info(
          `[ExperimentalAgentV2] Processing tool call: ${toolCall.toolName}`,
          {
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            toolArgs: toolCall.args,
          },
        );

        switch (toolCall.toolName) {
          case "computer_action": {
            const result = await executeComputerAction({
              ...toolCall.args,
              provider: this.provider,
              activeSession: this.session,
              sessionId: this.sessionId,
              iteration,
            }).catch((error) => {
              this.sessionLogger.error(
                `[ExperimentalAgentV2] Error executing tool call ${toolCall.toolName}`,
                { error },
              );
              this.buildMessageInput(iteration + 1, [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `Error executing tool call ${toolCall.toolName}: ${error instanceof Error ? error.message : String(error)}. Please review the task requirements and try again.`,
                    },
                  ],
                },
              ]);
              return null;
            });
            if (!result) {
              // If the tool call fails, we continue to the next iteration
              continue;
            }

            agentLog.screenshot = result.screenshot;
            if (agentLog.modelOutput.action.done) {
              agentLog.modelOutput.action.done.reasoning = result.reasoning;
            }
            // Update conversation history
            // This belongs to the next iteration where the input is user action and the output is the result of the action / what to do next
            this.buildMessageInput(iteration + 1, [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Computer action on ${result.timestamp}, result: ${result.text}. Reasoning: ${result.reasoning} Screenshot as attached.`,
                  },
                  {
                    type: "image",
                    image: new URL(result.screenshot),
                  },
                ],
              },
            ]);
            break;
          }
          case "task_completion": {
            const taskCompletionResult = await executeTaskCompletion({
              ...toolCall.args,
              sessionId: this.sessionId,
              model: this.model,
              systemPrompt: this.getSystemPrompt(),
              jsonOutputSchema: outputSchema,
              messages: this.conversationHistory,
            }).catch((error) => {
              this.sessionLogger.error(
                "[ExperimentalAgentV2] Error executing task completion tool",
                { error },
              );
              // Add error feedback to conversation
              this.buildMessageInput(iteration + 1, [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `Task completion failed: ${error instanceof Error ? error.message : String(error)}. Please review the task requirements and try again.`,
                    },
                  ],
                },
              ]);
              return null;
            });
            if (!taskCompletionResult) {
              continue;
            }

            this.sessionLogger.info("[ExperimentalAgentV2] Task completed", {
              taskCompletionResult,
            });
            return taskCompletionResult;
          }
          case "analyze": {
            this.sessionLogger.info(
              "[ExperimentalAgentV2] Analyze tool called",
              {
                toolCall,
              },
            );
            const result = await tools.analyze.execute(toolCall.args, {
              toolCallId: toolCall.toolCallId,
              messages: this.conversationHistory,
            });
            this.buildMessageInput(iteration + 1, [
              {
                role: "user",
                content: [{ type: "text", text: result.analysis }],
              },
            ]);
            break;
          }
          default: {
            // type guard to prevent unknown tool calls
            const _never: never = toolCall;
            break;
          }
        }

        // Send step update webhook
        await Promise.all([
          updateBrowserSessionAgentLogs(this.sessionId, agentLog),
          sendNewStepWebhook(
            webhookUrl,
            this.sessionId,
            [agentLog],
            new Date().toISOString(),
          ),
        ]);
        iteration++;
      }
    }

    this.sessionLogger.warn("[ExperimentalAgentV2] Reached maximum iterations");
    return { issues: [], scenarios: [] };
  }
}

// Main function to run the experimental agent
export async function runExperimentalAgentV2({
  tasks,
  initialUrl,
  teamId,
  webhookUrl,
  sessionId,
  commitDetails: _commitDetails,
  activeSession,
  provider,
}: {
  tasks: Task[];
  initialUrl: string;
  teamId: string;
  webhookUrl: string;
  sessionId: string;
  commitDetails?: GithubCommitDetails;
  activeSession: ActiveSession;
  provider: SessionProvider;
}) {
  const sessionLogger = logger.child({ sessionId });
  sessionLogger.info("[ExperimentalAgentV2] Starting execution", {
    tasks,
    initialUrl,
    teamId,
    webhookUrl,
  });

  const agent = new ExperimentalAgentV2(sessionId, provider, activeSession);
  const outputs: z.infer<typeof outputSchema>[] = [];

  // Get resources for context
  const resources = await listResourcesTool({
    teamId,
    sessionId,
  }).execute({}, { messages: [], toolCallId: "" });

  try {
    // Start recording for the entire agent execution
    startHyperbrowserRecording(
      activeSession.liveUrl,
      sessionId,
      activeSession.screenSize,
    ).then((result) => {
      if (!result) {
        return;
      }
      const { hbSessionId, videoRecordingStartedAt } = result;
      sessionLogger.info(
        "[ExperimentalAgentV2] Started Hyperbrowser recording",
        {
          hbSessionId,
          videoRecordingStartedAt,
        },
      );
      if (hbSessionId) {
        db.update(cuaBrowserSession)
          .set({
            recordingProviderId: hbSessionId,
            videoRecordingStartedAt,
          })
          .where(eq(cuaBrowserSession.id, sessionId))
          .then(() => {
            sessionLogger.info(
              "[ExperimentalAgentV2] Successfully updated recordingProviderId in db",
              { hbSessionId },
            );
          })
          .catch((error: unknown) => {
            sessionLogger.error(
              "[ExperimentalAgentV2] Error updating recordingProviderId in db",
              { error },
            );
          });
      }
    });

    for (const [index, task] of tasks.entries()) {
      sessionLogger.info("[ExperimentalAgentV2] Starting task", { task });
      await sendTaskStartedWebhook(webhookUrl, sessionId, task);

      const session = await getCuaBrowserSession(sessionId);
      if (session?.status === "stopped") {
        sessionLogger.info(
          "[ExperimentalAgentV2] Session was stopped manually, terminating execution.",
        );
        await sendTaskCompletedWebhook(webhookUrl, sessionId, {
          task,
          status: "stopped",
          result: undefined,
        });
        continue;
      }
      const taskInstruction = `Execute the following QA testing task:

**Task Instructions:**
${task.instructions}

**Starting URL:** ${initialUrl}

${formatResources(resources)}

Follow the instructions step by step with proper verification at each stage.`;
      try {
        const result = await agent.executeTask(
          { ...task, instructions: taskInstruction },
          webhookUrl,
        );
        outputs.push(result);

        await sendTaskCompletedWebhook(webhookUrl, sessionId, {
          task,
          result: JSON.stringify(result),
          status: "completed",
        });
      } catch (error) {
        sessionLogger.error("[ExperimentalAgentV2] Error executing task", {
          task,
          error,
        });
        await sendTaskCompletedWebhook(webhookUrl, sessionId, {
          task,
          result: String(error),
          status: "failed",
        });
      }

      // Reset browser state for next task
      if (index < tasks.length - 1) {
        sessionLogger.info(
          "[ExperimentalAgentV2] Resetting browser state for next task",
        );
        await provider.resetBrowserState(activeSession, initialUrl).then(
          () => {
            sessionLogger.info(
              "[ExperimentalAgentV2] Browser state reset successfully",
            );
          },
          (error) => {
            sessionLogger.error(
              "[ExperimentalAgentV2] Failed to reset browser state",
              { error },
            );
          },
        );
      }
    }

    sessionLogger.info("[ExperimentalAgentV2] All tasks completed");

    const session = await getCuaBrowserSession(sessionId);
    const completedAt = new Date();
    const finalStatus = session?.status === "stopped" ? "stopped" : "completed";

    await updateBrowserSession(sessionId, {
      status: finalStatus,
      endedAt: completedAt,
      finalOutput: JSON.stringify(outputs),
    });

    await sendCompletedWebhook(
      webhookUrl,
      sessionId,
      completedAt.toISOString(),
      JSON.stringify(outputs),
      finalStatus,
    );
  } finally {
    await terminateSessionWithProvider(
      activeSession.id,
      activeSession.providerName,
    ).catch((error) =>
      sessionLogger.error(
        "[ExperimentalAgentV2] Failed to stop provider session",
        { error },
      ),
    );

    await stopHyperbrowserRecording(sessionId, webhookUrl);
  }
}
