import z from "zod";
import type { Tool } from ".";
import { createAgentLogUpdate } from "../utils/agent-log";

/**
 * Parses the arguments for a computer tool call and returns the appropriate schema and arguments.
 * This function is used to dynamically determine the correct Zod schema based on the args and return as specific of a schema as possible.
 * This allows us to try and fix the incoming args as needed.
 *
 * @param args - The arguments for the computer tool call, which can be a JSON string or an object.
 * @returns An object containing the appropriate Zod schema and the parsed arguments, or null if the action is unknown.
 * @internal
 */
export const parseComputerToolArgs = (args: string | object) => {
  const parsedArgs = (() => {
    if (typeof args === "object") {
      return args;
    }
    try {
      return JSON.parse(args);
    } catch {
      return null;
    }
  })();
  if (!parsedArgs) {
    return { schema: computerActionSchema, args: null };
  }
  const baseSchema = z.object({
    action: z.union([
      z.string().describe("Type of action to perform"),
      z.object({
        type: z.string().describe("Type of action to perform"),
      }),
    ]),
  });

  const result = baseSchema.safeParse(parsedArgs);
  if (!result.success) {
    return { schema: computerActionSchema, args: parsedArgs };
  }
  const actionString =
    typeof result.data.action === "string"
      ? result.data.action
      : result.data.action.type;

  if (actionString.includes("click")) {
    return { schema: clickActionSchema, args: parsedArgs };
  }
  if (actionString.includes("double_click")) {
    return { schema: doubleClickActionSchema, args: parsedArgs };
  }
  if (actionString.includes("drag")) {
    return { schema: dragActionSchema, args: parsedArgs };
  }
  if (actionString.includes("keypress")) {
    return { schema: keypressActionSchema, args: parsedArgs };
  }
  if (actionString.includes("move")) {
    return { schema: moveActionSchema, args: parsedArgs };
  }
  if (actionString.includes("scroll")) {
    return { schema: scrollActionSchema, args: parsedArgs };
  }
  if (actionString.includes("type")) {
    return { schema: typeActionSchema, args: parsedArgs };
  }
  if (actionString.includes("wait")) {
    return { schema: waitActionSchema, args: parsedArgs };
  }
  return null;
};

const clickActionSchema = z
  .object({
    type: z.literal("click").describe("Type of action to perform"),
    x: z.number().describe("X coordinate for the click"),
    y: z.number().describe("Y coordinate for the click"),
    button: z
      .enum(["left", "right", "wheel"])
      .describe("Mouse button to use for the click"),
  })
  .describe("Click one of the mouse buttons at a certain coordinate.");

const doubleClickActionSchema = z
  .object({
    type: z.literal("double_click").describe("Type of action to perform"),
    x: z.number().describe("X coordinate for the double click"),
    y: z.number().describe("Y coordinate for the double click"),
  })
  .describe("Double click the left mouse button at a certain coordinate.");

const dragActionSchema = z
  .object({
    type: z.literal("drag").describe("Type of action to perform"),
    path: z
      .array(z.object({ x: z.number(), y: z.number() }))
      .describe("Array of coordinates for the drag path"),
  })
  .describe("Click and drag the left mouse button to a certain coordinate.");

const keypressActionSchema = z
  .object({
    type: z.literal("keypress").describe("Type of action to perform"),
    keys: z.array(z.string()).describe("Array of keys to press"),
  })
  .describe("Press a certain key or combination of keys.");

const moveActionSchema = z
  .object({
    type: z.literal("move").describe("Type of action to perform"),
    x: z.number().describe("X coordinate to move the mouse to"),
    y: z.number().describe("Y coordinate to move the mouse to"),
  })
  .describe("Move the mouse to a certain coordinate.");

const scrollActionSchema = z
  .object({
    type: z.literal("scroll").describe("Type of action to perform"),
    x: z.number().describe("X coordinate for the scroll"),
    y: z.number().describe("Y coordinate for the scroll"),
    scroll_x: z.number().describe("Horizontal scroll amount"),
    scroll_y: z.number().describe("Vertical scroll amount"),
  })
  .describe("Scroll action. One of scroll_x or scroll_y MUST BE non-zero.");

const typeActionSchema = z
  .object({
    type: z.literal("type").describe("Type of action to perform"),
    text: z.string().min(1, "Text cannot be empty").describe("Text to type"),
  })
  .describe("Type a certain text. Text MUST BE non-empty.");

const waitActionSchema = z
  .object({
    type: z.literal("wait").describe("Type of action to perform"),
    duration: z.number().min(0).describe("Duration to wait in seconds"),
  })
  .describe("Wait for a specified duration in seconds.");

export const computerActionSchema = z.union([
  clickActionSchema,
  doubleClickActionSchema,
  scrollActionSchema,
  keypressActionSchema,
  typeActionSchema,
  dragActionSchema,
  moveActionSchema,
  waitActionSchema,
]);
/**
 * Represents an action that can be performed by the computer, such as clicking, typing, or scrolling.
 * This type is a union of all possible computer action schemas.
 */
export type ComputerAction = z.infer<typeof computerActionSchema>;

/**
 * Represents the result of a computer action, including the type of action performed, a description of what was done,
 * the reasoning behind the action, and a timestamp.
 */
export interface ComputerActionResult {
  type: ComputerAction["type"];
  actionPerformed: string;
  reasoning: string;
  timestamp: string;
}

export interface ScreenSize {
  width: number;
  height: number;
}

/**
 * An interface for a computer provider, which is responsible for interacting with a remote environment,
 * such as a browser or a desktop. This allows the agent to perform actions like navigating to URLs,
 * taking screenshots, and executing user-like interactions.
 *
 * @template T - The type of the underlying instance managed by the provider (e.g., a Playwright Browser).
 * @template R - The type of the options that can be passed when starting a new session.
 */
// biome-ignore lint/suspicious/noExplicitAny: user defined
export interface ComputerProvider<T, R = Record<string, any>> {
  /**
   * Returns the current URL of the environment.
   * @param sessionId - The session ID.
   * @throws {ComputerProviderError} If the sessionId is invalid.
   * @returns The current URL.
   */
  getCurrentUrl(sessionId: string): Promise<string>;

  /**
   * Takes a screenshot of the environment.
   * @param sessionId - The session ID.
   * @throws {ComputerProviderError} If the sessionId is invalid or if the screenshot cannot be taken.
   * @returns The base64 image string.
   */
  takeScreenshot(sessionId: string): Promise<string>;

  /**
   * Returns the instance of the computer provider to allow for advanced interactions.
   * @param sessionId - The session ID.
   * @throws {ComputerProviderError} If the sessionId is invalid.
   * @returns The instance of the computer provider.
   */
  getInstance(sessionId: string): Promise<T>;

  /**
   * Returns the current URL of the browser, or undefined if not applicable.
   * @param sessionId The ID of the current session.
   * @returns A promise that resolves to the current URL or undefined.
   */
  getCurrentUrl(sessionId: string): Promise<string | undefined>;

  /**
   * Uploads a screenshot and returns its public URL. If not provided, screenshots will be kept in base64 format.
   * Note that the url returned should be accessible by the agent for the duration of the task.
   * @param options - The options for uploading the screenshot.
   * @returns A promise that resolves to an object containing the URL of the uploaded screenshot.
   */
  uploadScreenshot:
    | ((options: {
        screenshotBase64: string;
        sessionId: string;
        step: number;
      }) => Promise<{ url: string }>)
    | undefined;

  /**
   * Navigates to a certain URL.
   * @param args - The arguments for the navigation.
   * @throws {ComputerProviderError} If the sessionId is invalid or if the navigation cannot be performed.
   */
  navigateTo(args: { sessionId: string; url: string }): Promise<void>;

  /**
   * Executes a standard computer action.
   * @param action - The computer action to perform.
   * @param context - Additional context for the action, such as session ID and step number.
   * @param context.reasoning - The reasoning for the action.
   * @param context.sessionId - The session ID.
   * @param context.step - The step number.
   * @throws {ComputerProviderError} If the sessionId is invalid or if the action cannot be performed.
   * @returns The result of the action.
   */
  performAction(
    action: ComputerAction,
    context: {
      reasoning?: string;
      sessionId: string;
      step: number;
    },
  ): Promise<ComputerActionResult>;

  /**
   * Starts a new session.
   * @param sessionId - The session ID.
   * @param options - The options for the session to be passed on to the underlying computer provider.
   * @throws {ComputerProviderError} If the session cannot be started.
   * @returns The computer provider ID and the live URL if available.
   */
  start(
    sessionId: string,
    options?: R | undefined,
  ): Promise<{
    computerProviderId: string;
    liveUrl?: string;
  }>;

  /**
   * Stops the session.
   * @param sessionId - The session ID.
   * @throws {ComputerProviderError} If the session cannot be stopped or if sessionId is invalid.
   */
  stop(sessionId: string): Promise<void>;

  /**
   * Restores a session from a saved state by reconnecting to an existing browser instance.
   * @param sessionId - The session ID to restore.
   * @param cdpUrl - The CDP URL to reconnect to.
   * @param liveUrl - The live view URL if available.
   * @param computerProviderId - The computer provider's session ID.
   * @throws {ComputerProviderError} If the session cannot be restored.
   */
  restoreSession?(
    sessionId: string,
    cdpUrl: string,
    liveUrl?: string,
    computerProviderId?: string,
  ): Promise<void>;

  /**
   * Returns the screen size of the environment.
   * @returns The width and height of the screen.
   */
  screenSize(): Promise<ScreenSize>;
}

const computerToolSchema = z.object({
  action: computerActionSchema,
  reasoning: z
    .string()
    .describe(
      "The reasoning for performing the action. Make sure you provide a clear and concise reasoning for the action so that users can understand what you are doing.",
    ),
  previousStepEvaluation: z
    .string()
    .describe(
      "Previous step evaluation: Did you achieve the goal you set? What worked? What didn't work?",
    ),
  currentStepReasoning: z
    .string()
    .describe(
      "Current step reasoning: What do you see? What's the current state? What needs to be done?",
    ),
  nextStepGoal: z
    .string()
    .describe(
      "Next step goal: What specific, actionable goal do you plan to accomplish next?",
    ),
});
export type ComputerToolArgs = z.infer<typeof computerToolSchema>;

/**
 * Creates a tool that allows the agent to perform computer actions.
 * This tool is a wrapper around a `ComputerProvider` and provides a standardized
 * way for the agent to interact with the computer.
 *
 * @param options - The options for creating the computer tool.
 * @param options.computerProvider - The computer provider to use for performing actions.
 * @returns A tool that can be used by the agent to perform computer actions.
 */
export function createComputerTool<T, R>({
  computerProvider,
}: {
  computerProvider: ComputerProvider<T, R>;
}): Tool<typeof computerToolSchema> & {
  getCurrentUrl: (context: { sessionId: string }) => Promise<string>;
} {
  return {
    description:
      "Execute a computer action like clicking, dragging, typing, scrolling, etc. Use this for ALL interactions with the screen.",
    schema: computerToolSchema,
    getCurrentUrl: (context) => {
      return computerProvider.getCurrentUrl(context.sessionId);
    },
    execute: async (args, context) => {
      const result = await computerProvider.performAction(args.action, context);
      const screenshot = await computerProvider.takeScreenshot(
        context.sessionId,
      );
      const screenshotUrl = await computerProvider.uploadScreenshot?.({
        screenshotBase64: screenshot,
        sessionId: context.sessionId,
        step: context.step,
      });
      // Add planning data to conversation history
      const planningMessage = `[PLANNING - Step ${context.step}]
        Previous Step Evaluation: ${args.previousStepEvaluation}
        Current Step Reasoning: ${args.currentStepReasoning}
        Next Step Goal: ${args.nextStepGoal}`;

      const response = {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text: planningMessage,
          },
          {
            type: "text" as const,
            text: `Computer action on ${result.timestamp}, result: ${result.actionPerformed}. Reasoning: ${result.reasoning} Screenshot as attached.`,
          },
          {
            type: "image" as const,
            image: screenshotUrl?.url ? new URL(screenshotUrl.url) : screenshot,
          },
        ],
      };
      return {
        type: "response",
        response,
        updateCurrentAgentLog: createAgentLogUpdate({
          toolCallId: context.toolCallId,
          toolName: "computer_action",
          args,
          reasoning: result.reasoning,
          screenshot: {
            value:
              screenshotUrl?.url ?? "[screenshot removed to preserve size]",
            overrideLogScreenshot: true,
          },
          planningData: {
            previousStepEvaluation: args.previousStepEvaluation,
            currentStepReasoning: args.currentStepReasoning,
            nextStepGoal: args.nextStepGoal,
          },
          response: {
            role: "user",
            content: response.content.map((c) => {
              if (c.type === "text") {
                return c;
              }
              return {
                type: "image",
                image:
                  screenshotUrl?.url ?? "[screenshot removed to preserve size]",
              };
            }),
          },
        }),
      };
    },
  };
}
