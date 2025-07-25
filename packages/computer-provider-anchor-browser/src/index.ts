import { Buffer } from "node:buffer";
import {
  type ComputerAction,
  type ComputerActionResult,
  type ComputerProvider,
  ComputerProviderError,
} from "@trymeka/core";
import { type Logger, createNoOpLogger } from "@trymeka/core/utils/logger";
import { type Browser, type Page, chromium } from "playwright-core";

const CUA_KEY_TO_PLAYWRIGHT_KEY: Record<string, string> = {
  "/": "Divide",
  "\\": "Backslash",
  alt: "Alt",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  arrowup: "ArrowUp",
  backspace: "Backspace",
  capslock: "CapsLock",
  cmd: "Meta",
  ctrl: "Control",
  delete: "Delete",
  end: "End",
  enter: "Enter",
  esc: "Escape",
  home: "Home",
  insert: "Insert",
  option: "Alt",
  pagedown: "PageDown",
  pageup: "PageUp",
  shift: "Shift",
  space: " ",
  super: "Meta",
  tab: "Tab",
  win: "Meta",
};

export function createAnchorBrowserComputerProvider(options: {
  apiKey: string;
  uploadScreenshot?: (options: {
    screenshotBase64: string;
    sessionId: string;
    step: number;
  }) => Promise<{ url: string }>;
  screenSize?: { width: number; height: number };
  initialUrl?: string;
  logger?: Logger;
}): ComputerProvider<
  {
    browser: Browser;
    page: Page;
  },
  {
    session: {
      initialUrl?: string;
      recording?: {
        active: boolean;
      };
      proxy?:
        | {
            active: boolean;
            type: "anchor_residential" | "anchor_mobile";
            country_code:
              | "us"
              | "uk"
              | "fr"
              | "it"
              | "jp"
              | "au"
              | "de"
              | "fi"
              | "ca";
          }
        | {
            active: boolean;
            type: "custom";
            server: string;
            username: string;
            password: string;
          };
      timeout?: {
        max_duration: number;
        idle_timeout: number;
      };
      live_view?: {
        read_only: boolean;
      };
    };
    browser: {
      profile?: {
        name?: string;
        persist?: boolean;
      };
      adblock?: {
        active: boolean;
      };
      popup_blocker?: {
        active: boolean;
      };
      captcha_solver?: {
        active: boolean;
      };
      headless?: {
        active: boolean;
      };
      viewport?: {
        width: number;
        height: number;
      };
      fullscreen?: {
        active: boolean;
      };
      extensions?: string[];
    };
    // biome-ignore lint/suspicious/noExplicitAny: user defined
  } & Record<string, any>
> {
  const logger = options.logger ?? createNoOpLogger();
  const screenSize = options.screenSize ?? { width: 1600, height: 900 };
  const sessionMap = new Map<
    string,
    { browser: Browser; page: Page; anchorSessionId?: string }
  >();

  return {
    screenSize() {
      return Promise.resolve(screenSize);
    },
    getInstance(sessionId: string) {
      const result = sessionMap.get(sessionId);
      if (!result) {
        throw new ComputerProviderError(
          `No instance found for sessionId ${sessionId}. Call .start(sessionId) first.`,
        );
      }
      return Promise.resolve({ browser: result.browser, page: result.page });
    },

    async start(sessionId, browserOptions) {
      logger.info("[ComputerProvider] Starting up anchor browser instance");

      const response = await fetch("https://api.anchorbrowser.io/v1/sessions", {
        method: "POST",
        body: JSON.stringify(browserOptions),
        headers: {
          "anchor-api-key": options.apiKey,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const error = (await response.json()) as {
          error: { code: number; message: string };
        };
        throw new ComputerProviderError(
          `Failed to start anchor browser instance: ${error.error.code} ${error.error.message}`,
        );
      }

      const anchorSession = (await response.json()) as {
        data: {
          id: string;
          cdp_url: string;
          live_view_url: string;
        };
      };
      console.log("anchorSession", anchorSession.data);
      const anchorSessionId = anchorSession.data.id;

      const browser = await chromium.connectOverCDP(
        `wss://connect.anchorbrowser.io?apiKey=${options.apiKey}&sessionId=${sessionId}`,
      );
      const page = await browser.newPage();
      page.on("dialog", () => {
        // Note that we neither need to accept nor dismiss the dialog here.
        // The dialog will be handled by the agent
      });
      if (options.initialUrl) {
        await page.goto(options.initialUrl);
        logger.info(
          `[ComputerProvider] Successfully navigated to initial url ${options.initialUrl}`,
        );
      }
      sessionMap.set(sessionId, { browser, page, anchorSessionId });
      return {
        computerProviderId: sessionId,
        liveUrl: anchorSession.data.live_view_url,
      };
    },
    async stop(sessionId: string) {
      const result = sessionMap.get(sessionId);
      if (!result) {
        throw new ComputerProviderError(
          `No instance found for sessionId ${sessionId}. Call .start(sessionId) first.`,
        );
      }
      await result.browser.close();
      const response = await fetch(
        `https://api.anchorbrowser.io/v1/sessions/${result.anchorSessionId}`,
        {
          method: "DELETE",
          headers: {
            "anchor-api-key": options.apiKey,
          },
        },
      );
      if (!response.ok) {
        const error = (await response.json()) as {
          error: { code: number; message: string };
        };
        throw new ComputerProviderError(
          `Failed to stop anchor browser instance: ${error.error.code} ${error.error.message}`,
        );
      }
      sessionMap.delete(sessionId);
    },
    navigateTo: async (args: { sessionId: string; url: string }) => {
      const { sessionId, url } = args;
      const result = sessionMap.get(sessionId);
      if (!result) {
        throw new ComputerProviderError(
          `No instance found for sessionId ${sessionId}. Call .start(sessionId) first.`,
        );
      }
      await result.page.goto(url);
    },
    uploadScreenshot: options.uploadScreenshot
      ? options.uploadScreenshot
      : undefined,
    getCurrentUrl(sessionId: string) {
      const result = sessionMap.get(sessionId);
      if (!result) {
        throw new ComputerProviderError(
          `No instance found for sessionId ${sessionId}. Call .start(sessionId) first.`,
        );
      }
      return Promise.resolve(result.page.url());
    },
    async takeScreenshot(sessionId: string) {
      const result = sessionMap.get(sessionId);
      if (!result) {
        throw new ComputerProviderError(
          `No instance found for sessionId ${sessionId}. Call .start(sessionId) first.`,
        );
      }
      const response = await fetch(
        `https://api.anchorbrowser.io/v1/sessions/${result.anchorSessionId}/screenshot`,
        {
          method: "GET",
          headers: {
            "anchor-api-key": options.apiKey,
          },
        },
      );
      if (!response.ok) {
        throw new ComputerProviderError(
          `Failed to take screenshot: ${response.statusText}`,
        );
      }
      const screenshot = await response.arrayBuffer();
      return Buffer.from(screenshot).toString("base64");
    },
    async performAction(
      action: ComputerAction,
      context: { sessionId: string; step: number; reasoning?: string },
    ): Promise<ComputerActionResult> {
      const result = sessionMap.get(context.sessionId);
      if (!result) {
        throw new ComputerProviderError(
          `No instance found for sessionId ${context.sessionId}. Call .start(sessionId) first. `,
        );
      }
      const { page } = result;

      switch (action.type) {
        case "click": {
          const { x, y, button = "left" } = action;
          const response = await fetch(
            `https://api.anchorbrowser.io/v1/sessions/${result.anchorSessionId}/mouse/click`,
            {
              method: "POST",
              body: JSON.stringify({
                x,
                y,
                button: button === "wheel" ? "wheel" : button,
              }),
            },
          );
          if (!response.ok) {
            throw new ComputerProviderError(
              `Failed to click: ${response.statusText}`,
            );
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
          const response = await fetch(
            `https://api.anchorbrowser.io/v1/sessions/${result.anchorSessionId}/mouse/doubleClick`,
            {
              method: "POST",
              body: JSON.stringify({ x, y, button: "left" }),
            },
          );
          if (!response.ok) {
            throw new ComputerProviderError(
              `Failed to double-click: ${response.statusText}`,
            );
          }
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
          const response = await fetch(
            `https://api.anchorbrowser.io/v1/sessions/${result.anchorSessionId}/scroll`,
            {
              method: "POST",
              body: JSON.stringify({
                x,
                y,
                deltaX: scrollX,
                deltaY: scrollY,
              }),
            },
          );
          if (!response.ok) {
            const error = (await response.json()) as {
              error: { code: number; message: string };
            };
            throw new ComputerProviderError(
              `Failed to scroll: ${error.error.code} ${error.error.message}`,
            );
          }
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
          const response = await fetch(
            `https://api.anchorbrowser.io/v1/sessions/${result.anchorSessionId}/keyboard/shortcut`,
            {
              method: "POST",
              body: JSON.stringify({
                keys: keys.map(
                  (k) =>
                    CUA_KEY_TO_PLAYWRIGHT_KEY[k.toLowerCase()] ??
                    k.toLowerCase(),
                ),
              }),
            },
          );
          if (!response.ok) {
            const error = (await response.json()) as {
              error: { code: number; message: string };
            };
            throw new ComputerProviderError(
              `Failed to press keys: ${error.error.code} ${error.error.message}`,
            );
          }
          return {
            type: "keypress",
            actionPerformed: `Pressed keys: ${keys.join("+")}`,
            reasoning: context.reasoning ?? `Pressed keys: ${keys.join("+")}`,
            timestamp: new Date().toISOString(),
          };
        }
        case "type": {
          const { text } = action;
          const response = await fetch(
            `https://api.anchorbrowser.io/v1/sessions/${result.anchorSessionId}/keyboard/type`,
            {
              method: "POST",
              // TODO: 30ms delay between each keypress to mimic human typing and prevent bot detection. Might need to be adjusted/exposed
              body: JSON.stringify({ text, delay: 30 }),
            },
          );
          if (!response.ok) {
            const error = (await response.json()) as {
              error: { code: number; message: string };
            };
            throw new ComputerProviderError(
              `Failed to type text: ${error.error.code} ${error.error.message}`,
            );
          }
          return {
            type: "type",
            actionPerformed: `Typed text: ${text}`,
            reasoning: context.reasoning ?? `Typed text: ${text}`,
            timestamp: new Date().toISOString(),
          };
        }
        case "wait": {
          const { duration } = action;
          await page.waitForTimeout(duration * 1000);
          return {
            type: "wait",
            actionPerformed: `Waited for ${duration} seconds`,
            reasoning: context.reasoning ?? `Waited for ${duration} seconds`,
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

          const response = await fetch(
            `https://api.anchorbrowser.io/v1/sessions/${result.anchorSessionId}/drag-and-drop`,
            {
              method: "POST",
              body: JSON.stringify({
                startX: firstPoint.x,
                startY: firstPoint.y,
                endX: lastPoint.x,
                endY: lastPoint.y,
                button: "left",
              }),
            },
          );
          if (!response.ok) {
            const error = (await response.json()) as {
              error: { code: number; message: string };
            };
            throw new ComputerProviderError(
              `Failed to drag mouse: ${error.error.code} ${error.error.message}`,
            );
          }
          return {
            type: "drag",
            actionPerformed: `Dragged mouse from (${firstPoint?.x},${firstPoint?.y}) to (${lastPoint?.x},${lastPoint?.y})`,
            reasoning:
              context.reasoning ??
              `Dragged mouse from (${firstPoint?.x},${firstPoint?.y}) to (${lastPoint?.x},${lastPoint?.y})`,
            timestamp: new Date().toISOString(),
          };
        }
        case "move": {
          const { x, y } = action;
          const response = await fetch(
            `https://api.anchorbrowser.io/v1/sessions/${result.anchorSessionId}/mouse/move`,
            {
              method: "POST",
              body: JSON.stringify({ x, y }),
            },
          );
          if (!response.ok) {
            const error = (await response.json()) as {
              error: { code: number; message: string };
            };
            throw new ComputerProviderError(
              `Failed to move mouse: ${error.error.code} ${error.error.message}`,
            );
          }
          return {
            type: "move",
            actionPerformed: `Moved mouse to (${x}, ${y})`,
            reasoning: context.reasoning ?? `Moved mouse to (${x}, ${y})`,
            timestamp: new Date().toISOString(),
          };
        }
        default: {
          const _never: never = action;
          throw new ComputerProviderError("Unsupported computer action");
        }
      }
    },
  };
}
