import z from "zod";
import type { Tool } from ".";

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
    text: z.string().describe("Text to type"),
  })
  .describe("Type a certain text. Text MUST BE non-empty..");

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
  uploadScreenshot(options: {
    screenshotBase64: string;
    sessionId: string;
    step: number;
  }): Promise<{ url: string }>;

  /** Executes a standard computer action. */
  performAction(
    action: ComputerAction,
    context: {
      sessionId: string;
      step: number;
    },
  ): Promise<ComputerActionResult>;

  /** Any necessary setup or teardown logic. */
  start(sessionId: string): Promise<{
    computerProviderId: string;
    liveUrl?: string;
  }>;
  stop(sessionId: string): Promise<void>;

  screenSize(): Promise<{ width: number; height: number }>;
}

export function createComputerTool({
  computerProvider,
}: {
  computerProvider: ComputerProvider;
}): Tool<
  typeof computerActionSchema,
  ComputerActionResult & { screenshotUrl: string }
> {
  return {
    description:
      "Execute a computer action like clicking, dragging, typing, scrolling, etc. Use this for ALL interactions with the screen.",
    schema: computerActionSchema,
    execute: async (args, context) => {
      const result = await computerProvider.performAction(args, context);
      const screenshot = await computerProvider.takeScreenshot(
        context.sessionId,
      );
      const screenshotUrl = await computerProvider.uploadScreenshot({
        screenshotBase64: screenshot,
        sessionId: context.sessionId,
        step: context.step,
      });
      return {
        ...result,
        screenshotUrl: screenshotUrl.url,
      };
    },
  };
}
