import { Buffer } from "node:buffer";
import type { Sandbox } from "@e2b/desktop";
import {
  type ComputerAction,
  type ComputerActionResult,
  type ComputerProvider,
  ComputerProviderError,
} from "@trymeka/core";
import { type Logger, createNoOpLogger } from "@trymeka/core/utils/logger";
import { retryWithExponentialBackoff } from "@trymeka/core/utils/retry";

const SCROLL_PIXELS_PER_UNIT = 120; // Standard scroll wheel units

// Key mapping for common keys
const KEY_MAPPING: Record<string, string> = {
  "/": "slash",
  "\\": "backslash",
  alt: "alt",
  arrowdown: "down",
  arrowleft: "left",
  arrowright: "right",
  arrowup: "up",
  backspace: "backspace",
  capslock: "caps_lock",
  cmd: "cmd",
  ctrl: "ctrl",
  delete: "delete",
  end: "end",
  enter: "enter",
  esc: "escape",
  escape: "escape",
  home: "home",
  insert: "insert",
  option: "alt",
  pagedown: "page_down",
  pageup: "page_up",
  shift: "shift",
  space: "space",
  super: "super",
  tab: "tab",
  win: "super",
};

function mapKeys(keys: string[]): string[] {
  return keys.map((key) => KEY_MAPPING[key.toLowerCase()] || key.toLowerCase());
}

const shouldRetryE2B = (_: unknown): boolean => {
  // just throw everything for now
  return false;
};

export function createE2BComputerProvider(options: {
  apiKey?: string;
  uploadScreenshot?: (options: {
    screenshotBase64: string;
    sessionId: string;
    step: number;
  }) => Promise<{ url: string }>;
  screenSize?: { width: number; height: number };
  initialApplications?: string[];
  logger?: Logger;
}): ComputerProvider {
  const logger = options.logger ?? createNoOpLogger();
  const screenSize = options.screenSize ?? { width: 1600, height: 900 };
  const sessionMap = new Map<string, { sandbox: Sandbox }>();

  return {
    async screenSize() {
      return await Promise.resolve(screenSize);
    },
    uploadScreenshot: options.uploadScreenshot
      ? options.uploadScreenshot
      : undefined,
    async getCurrentUrl(sessionId: string) {
      const result = sessionMap.get(sessionId);
      if (!result) {
        throw new ComputerProviderError(
          `No E2B sandbox found for sessionId ${sessionId}`,
        );
      }
      // TODO: FIGURE THIS OUT
      try {
        return await Promise.resolve(result.sandbox.stream.getUrl());
      } catch {
        return "";
      }
    },
    async start(sessionId: string) {
      logger.info("[ComputerProvider] Starting E2B Desktop Sandbox");

      const { Sandbox } = await import("@e2b/desktop");

      const apiKey = options.apiKey || process.env.E2B_API_KEY;
      if (!apiKey) {
        throw new ComputerProviderError("E2B API key is required");
      }
      const sandbox = await Sandbox.create({
        apiKey,
        timeoutMs: 300000, // 5 minutes
        metadata: { sessionId },
        resolution: [screenSize.width, screenSize.height],
        logger,
      });

      logger.info("[ComputerProvider] E2B sandbox started", { sessionId });

      // Launch initial applications if specified
      if (options.initialApplications?.length) {
        for (const app of options.initialApplications) {
          try {
            await sandbox.launch(app);
            logger.info(`[ComputerProvider] Launched application: ${app}`);
            await sandbox.wait(2000); // Wait for app to start
          } catch (error) {
            logger.warn(`[ComputerProvider] Failed to launch ${app}:`, error);
          }
        }
      }
      const liveUrl = sandbox.stream.getUrl();

      sessionMap.set(sessionId, { sandbox });

      return {
        computerProviderId: sessionId,
        liveUrl,
      };
    },

    async stop(sessionId: string) {
      const result = sessionMap.get(sessionId);
      if (!result) {
        throw new ComputerProviderError(
          `No E2B sandbox found for sessionId ${sessionId}`,
        );
      }

      try {
        await result.sandbox.stream.stop();
      } catch (error) {
        logger.warn("[ComputerProvider] Failed to stop stream:", error);
      }

      sessionMap.delete(sessionId);
    },

    async takeScreenshot(sessionId: string) {
      const result = sessionMap.get(sessionId);
      if (!result) {
        throw new ComputerProviderError(
          `No E2B sandbox found for sessionId ${sessionId}`,
        );
      }

      const screenshot = await retryWithExponentialBackoff({
        fn: () => result.sandbox.screenshot(),
        shouldRetryError: shouldRetryE2B,
      });

      // Convert Buffer to base64 string
      return Buffer.from(screenshot).toString("base64");
    },

    async performAction(
      action: ComputerAction,
      context: { sessionId: string; step: number; reasoning?: string },
    ): Promise<ComputerActionResult> {
      const result = sessionMap.get(context.sessionId);
      if (!result) {
        throw new ComputerProviderError(
          `No E2B sandbox found for sessionId ${context.sessionId}`,
        );
      }
      const { sandbox } = result;

      return await retryWithExponentialBackoff({
        fn: async () => {
          switch (action.type) {
            case "click": {
              const { x, y, button = "left" } = action;

              switch (button.toLowerCase()) {
                case "left":
                  await sandbox.leftClick(x, y);
                  break;
                case "right":
                  await sandbox.rightClick(x, y);
                  break;
                case "middle":
                case "wheel":
                  await sandbox.middleClick(x, y);
                  break;
                default:
                  await sandbox.leftClick(x, y);
                  break;
              }

              return {
                type: "click",
                actionPerformed: `Clicked (button: ${button}) at position (${x}, ${y})`,
                reasoning:
                  context.reasoning ??
                  `Clicked (button: ${button}) at position (${x}, ${y})`,
                timestamp: new Date().toISOString(),
              };
            }
            case "double_click": {
              const { x, y } = action;
              await sandbox.doubleClick(x, y);
              return {
                type: "double_click",
                actionPerformed: `Double-clicked at position (${x}, ${y})`,
                reasoning:
                  context.reasoning ??
                  `Double-clicked at position (${x}, ${y})`,
                timestamp: new Date().toISOString(),
              };
            }
            case "scroll": {
              const { x, y, scroll_x: scrollX, scroll_y: scrollY } = action;

              // TODO: Figure out how to handle scrollX
              // E2B scroll expects scroll units, convert from pixels
              const scrollAmount = Math.abs(
                Math.round(scrollY / SCROLL_PIXELS_PER_UNIT),
              );

              await sandbox.scroll(scrollY > 0 ? "down" : "up", scrollAmount);
              return {
                type: "scroll",
                actionPerformed: `Scrolled by (scrollX=${scrollX}, scrollY=${scrollY}) at mouse position (${x},${y})`,
                reasoning:
                  context.reasoning ??
                  `Scrolled by (scrollX=${scrollX}, scrollY=${scrollY}) at mouse position (${x},${y})`,
                timestamp: new Date().toISOString(),
              };
            }
            case "keypress": {
              const { keys } = action;
              const mappedKeys = mapKeys(keys);
              if (mappedKeys.length === 0) {
                throw new Error("No keys to press");
              }
              const keyToPress =
                mappedKeys.length === 1 ? mappedKeys[0] : mappedKeys;
              if (!keyToPress) {
                throw new Error("No valid key to press");
              }
              await sandbox.press(keyToPress);
              return {
                type: "keypress",
                actionPerformed: `Pressed keys: ${mappedKeys.join("+")}`,
                reasoning:
                  context.reasoning ?? `Pressed keys: ${mappedKeys.join("+")}`,
                timestamp: new Date().toISOString(),
              };
            }
            case "type": {
              const { text } = action;
              await sandbox.write(text);
              return {
                type: "type",
                actionPerformed: `Typed text: ${text}`,
                reasoning: context.reasoning ?? `Typed text: ${text}`,
                timestamp: new Date().toISOString(),
              };
            }
            case "wait": {
              await sandbox.wait(2000); // Wait for 2 seconds
              return {
                type: "wait",
                actionPerformed: "Waited for 2 seconds",
                reasoning: context.reasoning ?? "Waited for 2 seconds",
                timestamp: new Date().toISOString(),
              };
            }
            case "drag": {
              const { path } = action;
              if (!path || path.length < 2) {
                throw new Error("Drag path invalid for computer action.");
              }

              const firstPoint = path[0];
              const lastPoint = path[path.length - 1];
              if (!firstPoint || !lastPoint) {
                throw new Error("Invalid drag path: missing points");
              }
              const from: [number, number] = [firstPoint.x, firstPoint.y];
              const to: [number, number] = [lastPoint.x, lastPoint.y];

              await sandbox.drag(from, to);
              return {
                type: "drag",
                actionPerformed: `Dragged mouse from (${from[0]},${from[1]}) to (${to[0]},${to[1]})`,
                reasoning:
                  context.reasoning ??
                  `Dragged mouse from (${from[0]},${from[1]}) to (${to[0]},${to[1]})`,
                timestamp: new Date().toISOString(),
              };
            }
            case "move": {
              const { x, y } = action;
              await sandbox.moveMouse(x, y);
              return {
                type: "move",
                actionPerformed: `Moved mouse to (${x}, ${y})`,
                reasoning: context.reasoning ?? `Moved mouse to (${x}, ${y})`,
                timestamp: new Date().toISOString(),
              };
            }
          }
        },
        shouldRetryError: shouldRetryE2B,
        logger: logger,
      });
    },
  };
}
