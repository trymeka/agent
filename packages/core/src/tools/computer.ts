import z from "zod";
import type { Tool } from ".";

// Generic browser instance type (e.g., Playwright Browser)
// This avoids importing specific browser libraries in the core package
export type BrowserInstance = {
  contexts(): Array<{
    pages(): Array<{
      url(): string;
    }>;
  }>;
};

export const parseComputerToolArgs = (args: string) => {
  const parsedArgs = (() => {
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
    action: z.object({
      type: z.string().describe("Type of action to perform"),
    }),
  });

  const result = baseSchema.safeParse(parsedArgs);
  if (!result.success) {
    return { schema: computerActionSchema, args: parsedArgs };
  }
  const type = result.data.action.type;
  switch (type) {
    case "click":
      return { schema: clickActionSchema, args: parsedArgs };
    case "double_click":
      return { schema: doubleClickActionSchema, args: parsedArgs };
    case "drag":
      return { schema: dragActionSchema, args: parsedArgs };
    case "keypress":
      return { schema: keypressActionSchema, args: parsedArgs };
    case "move":
      return { schema: moveActionSchema, args: parsedArgs };
    case "scroll":
      return { schema: scrollActionSchema, args: parsedArgs };
    case "type":
      return { schema: typeActionSchema, args: parsedArgs };
    case "wait":
      return { schema: waitActionSchema, args: parsedArgs };
    default:
      return null;
  }
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
    duration: z.number().describe("Duration to wait in seconds"),
  })
  .describe(
    "Wait for a certain duration. Normally used to wait for a page to load.",
  );

export const computerActionSchema = z.union([
  clickActionSchema,
  doubleClickActionSchema,
  scrollActionSchema,
  keypressActionSchema,
  typeActionSchema,
  waitActionSchema,
  dragActionSchema,
  moveActionSchema,
]);
export type ComputerAction = z.infer<typeof computerActionSchema>;
export interface ComputerActionResult {
  type: ComputerAction["type"];
  actionPerformed: string;
  reasoning: string;
  timestamp: string;
}
export interface ComputerProvider {
  /** Takes a screenshot of the environment. */
  takeScreenshot(sessionId: string): Promise<string>; // Returns base64 image string

  /** Uploads a screenshot and returns its public URL. */
  uploadScreenshot:
    | ((options: {
        screenshotBase64: string;
        sessionId: string;
        step: number;
      }) => Promise<{ url: string }>)
    | undefined;

  /** Executes a standard computer action. */
  performAction(
    action: ComputerAction,
    context: {
      reasoning?: string;
      sessionId: string;
      step: number;
    },
  ): Promise<ComputerActionResult>;

  /** Any necessary setup or teardown logic. */
  start(sessionId: string): Promise<{
    computerProviderId: string;
    liveUrl?: string;
    browser?: BrowserInstance; // Optional browser instance for providers that support it (e.g., Playwright Browser)
  }>;
  stop(sessionId: string): Promise<void>;

  screenSize(): Promise<{ width: number; height: number }>;
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
      "Previous step evaluation: Did you achieve the goal you set? What worked? What didn't work? (Use 'Starting task' for first step)",
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
export function createComputerTool({
  computerProvider,
}: {
  computerProvider: ComputerProvider;
}): Tool<
  typeof computerToolSchema,
  ComputerActionResult & {
    screenshot: string | URL;
    previousStepEvaluation: string;
    currentStepReasoning: string;
    nextStepGoal: string;
  }
> {
  return {
    description:
      "Execute a computer action like clicking, dragging, typing, scrolling, etc. Use this for ALL interactions with the screen.",
    schema: computerToolSchema,
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
      return {
        ...result,
        screenshot: screenshotUrl?.url
          ? new URL(screenshotUrl.url)
          : screenshot,
        previousStepEvaluation: args.previousStepEvaluation,
        currentStepReasoning: args.currentStepReasoning,
        nextStepGoal: args.nextStepGoal,
      };
    },
  };
}
