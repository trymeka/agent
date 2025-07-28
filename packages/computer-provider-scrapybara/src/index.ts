import { Buffer } from "node:buffer";
import { writeFileSync } from "node:fs";
import { getPage } from "@trymeka/computer-provider-core";
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
import { type BrowserInstance, ScrapybaraClient } from "scrapybara";
import type { Button } from "scrapybara/api/types/Button";

const CUA_KEY_TO_XK_KEYSYM: Record<string, string> = {
  // CUA Key: XK Keysym
  "/": "slash",
  "\\\\": "backslash",
  alt: "Alt_L",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
  arrowup: "Up",
  backspace: "BackSpace",
  capslock: "Caps_Lock",
  cmd: "Control_L",
  ctrl: "Control_L",
  delete: "Delete",
  end: "End",
  enter: "Return",
  esc: "Escape",
  home: "Home",
  insert: "Insert",
  option: "Alt_L",
  pagedown: "Page_Down",
  pageup: "Page_Up",
  shift: "Shift_L",
  space: "space",
  super: "Super_L",
  tab: "Tab",
  win: "Super_L",
};

const SCROLL_PIXELS_PER_UNIT = 152;

const shouldRetryScrapybara = (error: unknown): boolean => {
  if (
    error instanceof TypeError &&
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return true;
  }
  if (
    error &&
    typeof error === "object" &&
    (("status" in error &&
      typeof error.status === "number" &&
      error.status >= 500) ||
      ("statusCode" in error &&
        typeof error.statusCode === "number" &&
        error.statusCode >= 500))
  ) {
    return true;
  }
  if (error instanceof Error && error.message.includes("timed out after")) {
    return true;
  }
  return false;
};

export function createScrapybaraComputerProvider(options: {
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
    instance: BrowserInstance;
  },
  ScrapybaraClient.RequestOptions
> {
  const logger = options.logger ?? createNoOpLogger();
  const screenSize = options.screenSize ?? DEFAULT_SCREEN_SIZE;
  const scrapybaraClient = new ScrapybaraClient({
    apiKey: () => process.env.SCRAPYBARA_API_KEY ?? "",
  });
  const sessionMap = new Map<string, { instance: BrowserInstance }>();

  return {
    screenSize() {
      return Promise.resolve(screenSize);
    },
    getInstance: async (sessionId: string) => {
      const result = sessionMap.get(sessionId);
      if (!result) {
        throw new ComputerProviderError(
          `No instance found for sessionId ${sessionId}. Call .start(sessionId) first.`,
        );
      }
      const cdpUrl = (await result.instance.getCdpUrl()).cdpUrl;
      const browser = await chromium.connectOverCDP(cdpUrl);
      const page = getPage(browser, "Scrapybara");

      return { browser, page, instance: result.instance };
    },
    navigateTo: async (args: {
      sessionId: string;
      url: string;
    }) => {
      const { sessionId, url } = args;
      const result = sessionMap.get(sessionId);
      if (!result) {
        throw new ComputerProviderError(
          `No instance found for sessionId ${sessionId}. Call .start(sessionId) first.`,
        );
      }
      const cdpUrl = (await result.instance.getCdpUrl()).cdpUrl;
      const browser = await chromium.connectOverCDP(cdpUrl);
      const page = getPage(browser, "Scrapybara");
      await page.goto(url);
    },
    uploadScreenshot: options.uploadScreenshot
      ? options.uploadScreenshot
      : undefined,
    async getCurrentUrl(sessionId: string) {
      const result = sessionMap.get(sessionId);
      if (!result) {
        throw new ComputerProviderError(
          `No instance found for sessionId ${sessionId}. Call .start(sessionId) first.`,
        );
      }
      const cdpUrl = (await result.instance.getCdpUrl()).cdpUrl;
      const browser = await chromium.connectOverCDP(cdpUrl);
      const page = getPage(browser, "Scrapybara");
      return page.url();
    },
    async start(
      sessionId: string,
      browserOptions: ScrapybaraClient.RequestOptions,
    ) {
      logger.info("[ComputerProvider] Starting up scrapybara instance");
      const instance = await scrapybaraClient.startBrowser({
        timeoutHours: 1,
        resolution: [screenSize.width, screenSize.height],
        ...browserOptions,
      });

      logger.info("[ComputerProvider] instance started", {
        sessionId,
      });
      const cdpUrl = (await instance.getCdpUrl()).cdpUrl;
      const browser = await chromium.connectOverCDP(cdpUrl);
      const page = getPage(browser, "Scrapybara");
      if (options.initialUrl) {
        await page.goto(options.initialUrl);
        logger.info(
          `[ComputerProvider] Successfully navigated to initial url ${options.initialUrl}`,
        );
      }

      sessionMap.set(sessionId, { instance });

      const streamUrl = (await instance.getStreamUrl()).streamUrl;
      logger.info("[ComputerProvider] streamUrl", {
        streamUrl,
      });

      return {
        computerProviderId: instance.id,
        liveUrl: streamUrl,
      };
    },

    async stop(sessionId: string) {
      const result = sessionMap.get(sessionId);
      if (!result) {
        throw new ComputerProviderError(
          `No instance found for sessionId ${sessionId}. Call .start(sessionId) first.`,
        );
      }
      await result.instance.stop();
      sessionMap.delete(sessionId);
    },

    async takeScreenshot(sessionId: string) {
      const result = sessionMap.get(sessionId);
      if (!result) {
        throw new ComputerProviderError(
          `No instance found for sessionId ${sessionId}. Call .start(sessionId) first.`,
        );
      }
      const screenshot = await retryWithExponentialBackoff({
        fn: () => result.instance.screenshot(),
        shouldRetryError: shouldRetryScrapybara,
      });
      const buffer = Buffer.from(screenshot.base64Image, "base64");
      writeFileSync("screenshot.png", buffer);
      return screenshot.base64Image;
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
      const { instance } = result;

      return retryWithExponentialBackoff({
        fn: async () => {
          switch (action.type) {
            case "click": {
              const { x, y, button = "left" } = action;
              const clickCoords: [number, number] = [x, y];
              let sbActualClickButton: Button | undefined;

              const normalizedOaiButton = button.toLowerCase();

              switch (normalizedOaiButton) {
                case "left":
                  sbActualClickButton = "left";
                  break;
                case "right":
                  sbActualClickButton = "right";
                  break;
                case "wheel":
                  sbActualClickButton = "middle";
                  break;
                default:
                  sbActualClickButton = "left";
                  break;
              }

              if (sbActualClickButton) {
                await instance.computer({
                  action: "click_mouse",
                  button: sbActualClickButton,
                  coordinates: clickCoords,
                  screenshot: false,
                });
                return {
                  type: "click",
                  actionPerformed: `Clicked (button: ${sbActualClickButton}) at position (${x}, ${y})`,
                  reasoning:
                    context.reasoning ??
                    `Clicked (button: ${sbActualClickButton}) at position (${x}, ${y})`,
                  timestamp: new Date().toISOString(),
                };
              }
              throw new Error("Click failed");
            }
            case "double_click": {
              const { x, y } = action;
              await instance.computer({
                action: "click_mouse",
                button: "left",
                coordinates: [x, y],
                numClicks: 2,
                screenshot: false,
              });
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

              let mappedDeltaX = Math.round(scrollX / SCROLL_PIXELS_PER_UNIT);
              if (mappedDeltaX === 0 && scrollX !== 0)
                mappedDeltaX = scrollX > 0 ? 1 : -1;

              let mappedDeltaY = Math.round(scrollY / SCROLL_PIXELS_PER_UNIT);
              if (mappedDeltaY === 0 && scrollY !== 0)
                mappedDeltaY = scrollY > 0 ? 1 : -1;

              await instance.computer({
                action: "scroll",
                coordinates: [x, y],
                deltaX: mappedDeltaX,
                // prevent scrolling by 0px 0px
                deltaY: mappedDeltaY || (mappedDeltaX === 0 ? 1 : 0),
                screenshot: false,
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
              const mappedKeys = keys.map(
                (k: string) =>
                  CUA_KEY_TO_XK_KEYSYM[k.toLowerCase()] ?? k.toLowerCase(),
              );
              await instance.computer({
                action: "press_key",
                keys: mappedKeys,
                screenshot: false,
              });
              return {
                type: "keypress",
                actionPerformed: `Pressed keys (XK): ${mappedKeys.join("+")}`,
                reasoning:
                  context.reasoning ??
                  `Pressed keys (XK): ${mappedKeys.join("+")}`,
                timestamp: new Date().toISOString(),
              };
            }
            case "type": {
              const { text } = action;
              await instance.computer({
                action: "type_text",
                text: text,
                screenshot: false,
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
              if (!path || path.length < 2) {
                throw new Error("Drag path invalid for computer action.");
              }
              const dragPath: [number, number][] = path.map(
                (p: { x: number; y: number }) => [p.x, p.y],
              );
              await instance.computer({
                action: "drag_mouse",
                path: dragPath,
                screenshot: false,
              });
              return {
                type: "drag",
                actionPerformed: `Dragged mouse along path from (${dragPath[0]?.[0]},${dragPath[0]?.[1]}) to (${
                  dragPath[dragPath.length - 1]?.[0]
                },${dragPath[dragPath.length - 1]?.[1]})`,
                reasoning:
                  context.reasoning ??
                  `Dragged mouse along path from (${dragPath[0]?.[0]},${dragPath[0]?.[1]}) to (${
                    dragPath[dragPath.length - 1]?.[0]
                  },${dragPath[dragPath.length - 1]?.[1]})`,
                timestamp: new Date().toISOString(),
              };
            }
            case "move": {
              const { x, y } = action;
              await instance.computer({
                action: "move_mouse",
                coordinates: [x, y],
                screenshot: false,
              });
              return {
                type: "move",
                actionPerformed: `Moved mouse to (${x}, ${y})`,
                reasoning: context.reasoning ?? `Moved mouse to (${x}, ${y})`,
                timestamp: new Date().toISOString(),
              };
            }
          }
        },
        shouldRetryError: shouldRetryScrapybara,
        logger: logger,
      });
    },
  };
}
