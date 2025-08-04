import { Buffer } from "node:buffer";
import { getInstance, getPage } from "@trymeka/computer-provider-core";
import { DEFAULT_SCREEN_SIZE } from "@trymeka/computer-provider-core/constants";
import {
  type ComputerAction,
  type ComputerActionResult,
  type ComputerProvider,
  ComputerProviderError,
} from "@trymeka/core";
import { type Logger, createNoOpLogger } from "@trymeka/core/utils/logger";
import { retryWithExponentialBackoff } from "@trymeka/core/utils/retry";
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
  (apiKey: string, logger?: Logger) =>
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
    const response = await retryWithExponentialBackoff({
      fn: () =>
        fetch(`https://api.anchorbrowser.io/v1/sessions/${anchorId}${path}`, {
          method,
          headers: {
            "anchor-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: method === "GET" ? null : JSON.stringify(body),
        }).then(async (res) => {
          if (res.status >= 500) {
            console.log(
              `Response calling anchor browser ${anchorId}${path}: ${res.status}`,
            );
            const error = await res.text();
            throw new ComputerProviderError(
              `Failed to perform ${method} ${path}: ${error} (500)`,
            );
          }
          return res;
        }),
      shouldRetryError: (e) => {
        if (e instanceof ComputerProviderError) {
          // We retry on 500 errors
          return true;
        }
        // This happens when fetch fails for some reason due to no internet connection, etc.
        return true;
      },
      logger: logger ?? createNoOpLogger(),
    });
    if (!response.ok) {
      const error = (await response.json()) as {
        error: { code: number; message: string };
      };
      throw new ComputerProviderError(
        `Failed to perform ${method} ${path}: ${error.error.code} ${JSON.stringify(error)}`,
      );
    }
    return response;
  };

/**
 * Creates a computer provider that interacts with Anchor Browser.
 * This provider is responsible for managing browser sessions, handling user actions
 * like clicking, typing, and navigating, and providing screenshots of the browser state.
 *
 * @param options - The configuration options for the Anchor Browser computer provider.
 * @param options.apiKey - The API key for accessing the Anchor Browser service.
 * @param options.uploadScreenshot - An optional function to upload screenshots after each step. If not provided, screenshots will be kept in base64 format.
 * @param options.screenSize - Override for the screen size of the browser window. Defaults to 1366x768.
 * @param options.initialUrl - The initial URL to navigate to when a session starts.
 * @param options.logger - An optional logger for logging internal events.
 * @returns A `ComputerProvider` instance configured for Anchor Browser.
 */
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
    cdpUrl: string | undefined;
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
  const screenSize = options.screenSize
    ? {
        width: options.screenSize.width,
        height: options.screenSize.height - 90,
      }
    : {
        width: DEFAULT_SCREEN_SIZE.width,
        // For some reason, anchor browser add 90px to the overall height of the browser.
        height: DEFAULT_SCREEN_SIZE.height - 90,
      };
  const sessionMap = new Map<
    string,
    {
      browser: Browser;
      page: Page;
      anchorSessionId: string;
      liveUrl: string;
      cdpUrl: string;
    }
  >();

  const anchorClient = createAnchorClient(options.apiKey, logger);

  return {
    screenSize() {
      return Promise.resolve(screenSize);
    },
    getInstance(sessionId: string) {
      const result = getInstance(sessionId, sessionMap);
      return Promise.resolve({
        browser: result.browser,
        page: result.page,
        liveUrl: result.liveUrl,
        anchorSessionId: result.anchorSessionId,
        cdpUrl: result.cdpUrl,
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

      logger.info("[ComputerProvider] anchor browser instance started", {
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

      logger.info("[ComputerProvider] anchorSession", {
        anchorSessionId,
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
        cdpUrl: anchorSession.data.cdp_url,
      });

      return {
        computerProviderId: anchorSession.data.id,
        liveUrl: anchorSession.data.live_view_url,
      };
    },
    async stop(sessionId: string) {
      const result = getInstance(sessionId, sessionMap);
      await result.browser.close();
      await anchorClient({
        anchorId: result.anchorSessionId,
        path: "/",
        body: {},
        method: "DELETE",
      });
      sessionMap.delete(sessionId);
    },

    async restoreSession(
      sessionId: string,
      cdpUrl: string,
      liveUrl?: string,
      computerProviderId?: string,
    ) {
      logger.info("[ComputerProvider] Restoring session from CDP URL", {
        sessionId,
        cdpUrl,
        liveUrl,
        computerProviderId,
      });

      try {
        // Connect to the existing browser session
        const browser = await chromium.connectOverCDP(cdpUrl);

        // Get the page (similar to how the computer provider does it in start method)
        const contexts = browser.contexts();
        let page = undefined;
        for (const context of contexts) {
          const pages = context.pages();
          const nonBlankPage = pages.find((p) => p.url() !== "about:blank");
          if (nonBlankPage) {
            page = nonBlankPage;
            break;
          }
          if (pages[0]) {
            page = pages[0];
            break;
          }
        }

        if (!page) {
          throw new ComputerProviderError("No page found in browser context");
        }

        // Restore the sessionMap entry
        sessionMap.set(sessionId, {
          browser,
          page,
          anchorSessionId: computerProviderId || "",
          liveUrl: liveUrl || "",
          cdpUrl,
        });

        logger.info("[ComputerProvider] Session restored successfully", {
          sessionId,
          anchorSessionId: computerProviderId,
          liveUrl,
        });
      } catch (error) {
        logger.error("[ComputerProvider] Failed to restore session", {
          sessionId,
          error,
        });
        throw new ComputerProviderError(
          `Failed to restore session: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
    navigateTo: async (args: { sessionId: string; url: string }) => {
      const { sessionId, url } = args;
      const result = getInstance(sessionId, sessionMap);
      await result.page.goto(url);
    },
    uploadScreenshot: options.uploadScreenshot
      ? options.uploadScreenshot
      : undefined,
    getCurrentUrl(sessionId: string) {
      const result = getInstance(sessionId, sessionMap);
      return Promise.resolve(result.page.url());
    },
    async takeScreenshot(sessionId: string) {
      const result = getInstance(sessionId, sessionMap);
      const response = await anchorClient({
        anchorId: result.anchorSessionId,
        path: "/screenshot",
        method: "GET",
      });

      const screenshot = await response.arrayBuffer();
      const b64 = Buffer.from(screenshot).toString("base64");
      return b64;
    },
    async performAction(
      action: ComputerAction,
      context: { sessionId: string; step: number; reasoning?: string },
    ): Promise<ComputerActionResult> {
      const result = getInstance(context.sessionId, sessionMap);

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
          const response = await anchorClient({
            anchorId: result.anchorSessionId,
            path: "/keyboard/shortcut",
            body: {
              keys: keys.map(
                (k) =>
                  // We try to map the keys from the LLM to the anchor browser keys.
                  CUA_KEY_TO_PLAYWRIGHT_KEY[k.toLowerCase()] ??
                  // If the key map didn't succeed, we try to use the key as is.
                  // If the key is a single character, we convert it to lowercase. This is so that keys like CTRL A -> ctrl+a, CTRL L -> ctrl+l, etc.
                  // If the key is a multi-character key, we use the key as is. These Keys are often some modifier keys like CTRL, SHIFT, etc. that was missed in the mapping above. These keys will likely throw an error in the anchor browser.
                  // We handle that by catching the error and returning null. The LLM should then retry with a different set of keys/action.
                  (k.length === 1 ? k.toLowerCase() : k),
              ),
            },
          }).catch((e) => {
            if (
              e instanceof ComputerProviderError &&
              e.message.includes("500")
            ) {
              return null;
            }
            throw e;
          });

          if (!response) {
            logger.warn(
              `[ComputerProvider] Failed to press keys: ${keys.join("+")}. Not a valid key combination.`,
            );
            return {
              type: "keypress",
              actionPerformed: `Failed to press keys: ${keys.join("+")}. Not a valid key combination.`,
              reasoning:
                context.reasoning ?? `Failed to press keys: ${keys.join("+")}`,
              timestamp: new Date().toISOString(),
            };
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
