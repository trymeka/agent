import { Buffer } from "node:buffer";
import { type Sandbox, SandboxError, type SandboxOpts } from "@e2b/desktop";
import { getInstance } from "@trymeka/computer-provider-core";
import { DEFAULT_SCREEN_SIZE } from "@trymeka/computer-provider-core/constants";
import {
  type ComputerAction,
  type ComputerActionResult,
  type ComputerProvider,
  ComputerProviderError,
} from "@trymeka/core";
import type { ScreenSize } from "@trymeka/core/tools/computer";
import { type Logger, createNoOpLogger } from "@trymeka/core/utils/logger";
import { retryWithExponentialBackoff } from "@trymeka/core/utils/retry";

const shouldRetryE2B = (e: unknown): boolean => {
  // From https://github.com/e2b-dev/E2B/blob/main/packages/js-sdk/src/envd/rpc.ts#L8
  // it seems like the sandbox error is for unhandled / non user errors
  if (e instanceof SandboxError) {
    return true;
  }
  // everything else is either timeout or user error
  return false;
};

/**
 * Wraps a Sandbox instance with retry logic for all its methods.
 * This is to make the interaction with E2B more robust against transient errors.
 *
 * @param sandbox The E2B Sandbox instance to wrap.
 * @param logger An optional logger.
 * @returns A proxied Sandbox instance.
 */
function wrapSandboxWithRetries(sandbox: Sandbox, logger?: Logger): Sandbox {
  return new Proxy(sandbox, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);

      if (typeof original === "function") {
        return (...args: unknown[]) => {
          const boundFn = original.bind(target);
          return retryWithExponentialBackoff({
            fn: () => boundFn(...args),
            shouldRetryError: shouldRetryE2B,
            logger: logger ?? createNoOpLogger(),
          });
        };
      }

      return original;
    },
  });
}

/**
 * Creates a computer provider that interacts with E2B.
 * This provider is responsible for managing sandboxed desktop environments,
 * handling user actions, and providing screenshots of the virtual desktop.
 *
 * @param options - The configuration options for the E2B computer provider.
 * @param options.apiKey - The API key for accessing E2B.
 * @param options.uploadScreenshot - An optional function to upload screenshots after each step. If not provided, screenshots will be kept in base64 format.
 * @param options.screenSize - Override for the screen size of the virtual desktop. Defaults to 1000x768.
 * @param options.initialUrl - The initial URL to navigate to when the browser starts.
 * @param options.logger - An optional logger for logging internal events.
 * @returns A `ComputerProvider` instance configured for E2B.
 */
export function createE2BComputerProvider(options: {
  apiKey: string;
  uploadScreenshot?: (options: {
    screenshotBase64: string;
    sessionId: string;
    step: number;
  }) => Promise<{ url: string }>;
  screenSize?: ScreenSize;
  initialUrl?: string;
  logger?: Logger;
}): ComputerProvider<
  {
    sandbox: Sandbox;
  },
  SandboxOpts
> {
  const logger = options.logger ?? createNoOpLogger();
  const screenSize = options.screenSize ?? {
    ...DEFAULT_SCREEN_SIZE,
    width: 1000,
  };
  const sessionMap = new Map<string, { sandbox: Sandbox }>();

  return {
    async screenSize() {
      return await Promise.resolve(screenSize);
    },
    getInstance(sessionId: string) {
      return Promise.resolve(getInstance(sessionId, sessionMap));
    },
    async navigateTo({ sessionId, url }) {
      const { sandbox } = getInstance(sessionId, sessionMap);
      await sandbox.press("ctrl+l");
      await sandbox.write(url);
      await sandbox.press("enter");
      await sandbox.wait(2_000); // Wait 2s for navigation to complete
    },
    uploadScreenshot: options.uploadScreenshot
      ? options.uploadScreenshot
      : undefined,
    async getCurrentUrl(sessionId: string) {
      const { sandbox } = getInstance(sessionId, sessionMap);
      await sandbox.press(["ctrl", "l"]);
      await sandbox.press(["ctrl", "c"]);
      const commandResult = await sandbox.commands.run(
        "xsel --clipboard --output",
      );
      logger.info("[ComputerProvider] Current URL", {
        commandResult: commandResult,
      });
      return commandResult.stdout;
    },
    async start(sessionId, browserOptions) {
      logger.info("[ComputerProvider] Starting E2B Desktop Sandbox");

      const { Sandbox } = await import("@e2b/desktop");

      const sandboxUnwrapped = await Sandbox.create({
        apiKey: options.apiKey,
        metadata: { sessionId },
        resolution: [screenSize.width, screenSize.height],
        logger,
        ...browserOptions,
      });

      const sandbox = wrapSandboxWithRetries(sandboxUnwrapped, logger);

      logger.info("[ComputerProvider] E2B sandbox started", { sessionId });

      await sandbox.launch("google-chrome");
      await sandbox.wait(5_000); // Wait 5s for app to start
      logger.info("[ComputerProvider] Launched google chrome");
      // needed to read the clipboard
      await sandbox.commands.run(
        "sudo apt-get update && sudo apt-get install -y xsel",
      );

      // Launch initial applications if specified
      if (options.initialUrl) {
        await sandbox.write(options.initialUrl);
        await sandbox.press("Enter");
        logger.info("[ComputerProvider] Navigated to initial URL", {
          initialUrl: options.initialUrl,
        });
      }

      await sandbox.stream.start({
        requireAuth: true,
        windowId: await sandbox.getCurrentWindowId(),
      });
      const streamAuthKey = await sandbox.stream.getAuthKey();
      const liveUrl = sandbox.stream.getUrl({
        authKey: streamAuthKey,
      });
      sessionMap.set(sessionId, { sandbox });

      return {
        computerProviderId: sandbox.sandboxId,
        liveUrl,
      };
    },

    async stop(sessionId: string) {
      const { sandbox } = getInstance(sessionId, sessionMap);

      await sandbox.stream.stop();
      await sandbox.kill();

      sessionMap.delete(sessionId);
    },

    async takeScreenshot(sessionId: string) {
      const { sandbox } = getInstance(sessionId, sessionMap);

      const screenshot = await sandbox.screenshot();

      const base64 = Buffer.from(screenshot).toString("base64");
      return base64;
    },

    async performAction(
      action: ComputerAction,
      context: { sessionId: string; step: number; reasoning?: string },
    ): Promise<ComputerActionResult> {
      const { sandbox } = getInstance(context.sessionId, sessionMap);
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
              throw new ComputerProviderError(`Unsupported button: ${button}`);
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
              context.reasoning ?? `Double-clicked at position (${x}, ${y})`,
            timestamp: new Date().toISOString(),
          };
        }
        case "scroll": {
          const { x, y, scroll_x: scrollX, scroll_y: scrollY } = action;

          // arbitrary number of 100 pixels per notch
          const scrollYNotches = Math.abs(Math.floor(scrollY / 100)) || 1;

          // TODO: Figure out how to handle scrollX
          await sandbox.moveMouse(x, y);
          await sandbox.scroll(scrollY > 0 ? "down" : "up", scrollYNotches);
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
          await sandbox.press(keys);

          return {
            type: "keypress",
            actionPerformed: `Pressed keys: ${keys.join("+")}`,
            reasoning: context.reasoning ?? `Pressed keys: ${keys.join("+")}`,
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

        case "drag": {
          const { path } = action;
          if (path.length < 2) {
            throw new ComputerProviderError(
              "Drag path invalid for computer action.",
            );
          }

          const firstPoint = path[0];
          const lastPoint = path[path.length - 1];
          if (!firstPoint || !lastPoint) {
            throw new ComputerProviderError(
              "Bad drag path: Drag path invalid for computer action.",
            );
          }

          await sandbox.drag(
            [firstPoint.x, firstPoint.y],
            [lastPoint.x, lastPoint.y],
          );
          return {
            type: "drag",
            actionPerformed: `Dragged mouse from (${firstPoint.x},${firstPoint.y}) to (${lastPoint.x},${lastPoint.y})`,
            reasoning:
              context.reasoning ??
              `Dragged mouse from (${firstPoint.x},${firstPoint.y}) to (${lastPoint.x},${lastPoint.y})`,
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
        case "wait": {
          const { duration } = action;
          await new Promise((resolve) => setTimeout(resolve, duration * 1000));
          return {
            type: "wait",
            actionPerformed: `Waited for ${duration} seconds`,
            reasoning: context.reasoning ?? `Waited for ${duration} seconds`,
            timestamp: new Date().toISOString(),
          };
        }
        default: {
          const _never: never = action;
          throw new Error("Unsupported action type.");
        }
      }
    },
  };
}
