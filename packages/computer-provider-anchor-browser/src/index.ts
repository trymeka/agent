import { Buffer } from "node:buffer";
import { writeFileSync } from "node:fs";
import { getPage } from "@trymeka/computer-provider-core";
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
  altleft: "Alt",
  altright: "Alt",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  arrowup: "ArrowUp",
  backspace: "Backspace",
  capslock: "CapsLock",
  cmd: "Meta",
  command: "Meta",
  ctrl: "Control",
  control: "Control",
  delete: "Delete",
  end: "End",
  enter: "Enter",
  return: "Enter",
  esc: "Escape",
  escape: "Escape",
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

const createAnchorClient =
  (apiKey: string) =>
  async ({
    anchorId,
    path,
    body,
    method = "POST",
  }: {
    anchorId: string;
    path: `/${string}`;
    body?: Record<string, unknown>;
    method?: "POST" | "GET" | "DELETE" | "PUT";
  }) => {
    if (method !== "GET" && !body) {
      throw new ComputerProviderError(`Body is required for method ${method}`);
    }
    const response = await fetch(
      `https://api.anchorbrowser.io/v1/sessions/${anchorId}${path}`,
      {
        method,
        headers: {
          "anchor-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: method === "GET" ? null : JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const error = (await response.json()) as {
        error: { code: number; message: string };
      };
      throw new ComputerProviderError(
        `Failed to perform ${method} ${path}: ${error.error.code} ${error.error.message}`,
      );
    }
    return response;
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
    liveUrl: string | undefined;
    anchorSessionId: string | undefined;
  },
  {
    session: {
      initial_url?: string;
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
  const screenSize = options.screenSize ?? { width: 1600, height: 810 };
  const sessionMap = new Map<
    string,
    {
      browser: Browser;
      page: Page;
      anchorSessionId: string;
      liveUrl: string;
    }
  >();

  const anchorClient = createAnchorClient(options.apiKey);

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
      return Promise.resolve({
        browser: result.browser,
        page: result.page,
        liveUrl: result.liveUrl,
        anchorSessionId: result.anchorSessionId,
      });
    },

    async start(sessionId, browserOptions) {
      logger.info("[ComputerProvider] Starting up anchor browser instance");

      const response = await fetch("https://api.anchorbrowser.io/v1/sessions", {
        method: "POST",
        body: JSON.stringify({
          ...browserOptions,
          session: {
            ...browserOptions?.session,
            initial_url:
              browserOptions?.session?.initial_url ?? options.initialUrl,
          },
          browser: {
            ...browserOptions?.browser,
            viewport: {
              width: screenSize.width,
              height: screenSize.height,
              ...browserOptions?.browser?.viewport,
            },
          },
        }),
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

      logger.info("[ComputerProvider] instance started", {
        sessionId,
      });

      const anchorSession = (await response.json()) as {
        data: {
          id: string;
          cdp_url: string;
          live_view_url: string;
        };
      };
      const anchorSessionId = anchorSession.data.id;

      logger.info("[ComputerProvider] anchorSessionId", {
        streamUrl: anchorSession.data.live_view_url,
      });

      const browser = await chromium.connectOverCDP(anchorSession.data.cdp_url);
      const page = getPage(browser, "Anchor Browser");
      if (options.initialUrl) {
        await page.goto(options.initialUrl);
        logger.info(
          `[ComputerProvider] Successfully navigated to initial url ${options.initialUrl}`,
        );
      }
      sessionMap.set(sessionId, {
        browser,
        page,
        anchorSessionId,
        liveUrl: anchorSession.data.live_view_url,
      });

      return {
        computerProviderId: anchorSession.data.id,
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
      await anchorClient({
        anchorId: result.anchorSessionId,
        path: "/",
        body: {},
        method: "DELETE",
      });
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
      const response = await anchorClient({
        anchorId: result.anchorSessionId,
        path: "/screenshot",
        method: "GET",
      });

      const screenshot = await response.arrayBuffer();
      const b64 = Buffer.from(screenshot).toString("base64");
      writeFileSync("screenshot.png", Buffer.from(screenshot));
      return b64;
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
          await anchorClient({
            anchorId: result.anchorSessionId,
            path: "/mouse/click",
            body: {
              x,
              y,
              button: button === "wheel" ? "middle" : button,
            },
          });

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
          await anchorClient({
            anchorId: result.anchorSessionId,
            path: "/mouse/doubleClick",
            body: { x, y, button: "left" },
          });
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
          await anchorClient({
            anchorId: result.anchorSessionId,
            path: "/scroll",
            body: {
              x,
              y,
              deltaX: scrollX,
              // prevent scrolling by 0px 0px
              deltaY: scrollY || (scrollX === 0 ? 1 : 0),
            },
          });

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
          await anchorClient({
            anchorId: result.anchorSessionId,
            path: "/keyboard/shortcut",
            body: {
              keys: keys.map(
                (k) =>
                  CUA_KEY_TO_PLAYWRIGHT_KEY[k.toLowerCase()] ?? k.toLowerCase(),
              ),
            },
          });

          return {
            type: "keypress",
            actionPerformed: `Pressed keys: ${keys.join("+")}`,
            reasoning: context.reasoning ?? `Pressed keys: ${keys.join("+")}`,
            timestamp: new Date().toISOString(),
          };
        }
        case "type": {
          const { text } = action;
          await anchorClient({
            anchorId: result.anchorSessionId,
            path: "/keyboard/type",
            // TODO: 30ms delay between each keypress to mimic human typing and prevent bot detection. Might need to be adjusted/exposed
            body: { text, delay: 30 },
          });

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

          await anchorClient({
            anchorId: result.anchorSessionId,
            path: "/drag-and-drop",
            body: {
              startX: firstPoint.x,
              startY: firstPoint.y,
              endX: lastPoint.x,
              endY: lastPoint.y,
              button: "left",
            },
          });

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
          await anchorClient({
            anchorId: result.anchorSessionId,
            path: "/mouse/move",
            body: { x, y },
          });

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
