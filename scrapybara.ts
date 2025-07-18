import type OpenAI from "openai";
import { chromium } from "playwright-core";
import { ScrapybaraClient, UbuntuInstance } from "scrapybara";
import type { Button } from "scrapybara/api/types/Button";
import logger from "../../config/datadog";
import type { OpenAIAction } from "../../types/cua";
import { retryWithExponentialBackoff } from "../utils/retry"; // Import shared retry
import {
  AbstractSessionProvider,
  type ActionOutcome,
  type ActiveSession,
  type ComputerSession,
  DEFAULT_SCRAPYBARA_ACTION_TIMEOUT_MS,
  type RecordingUrlResponse,
} from "./base"; // Assuming base.ts will export these

// New mapping for Scrapybara XK Keysyms
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

// Number of pixels that correspond to a single scroll "unit" or "tick".
// Adjust this value to change scroll sensitivity.
const SCROLL_PIXELS_PER_UNIT = 152;

// Helper function to race Scrapybara computer actions against a timeout
async function callScrapybaraComputerWithTimeout<T>(
  computerPromise: Promise<T>,
  actionName: string,
  timeoutMs: number = DEFAULT_SCRAPYBARA_ACTION_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Scrapybara computer action '${actionName}' timed out after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);

    computerPromise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export class ScrapybaraProvider extends AbstractSessionProvider {
  private scrapybaraClient: ScrapybaraClient;

  constructor() {
    super();
    const apiKey = process.env.SCRAPYBARA_API_KEY;

    this.scrapybaraClient = new ScrapybaraClient({
      apiKey,
    });
  }

  async startUbuntuInstanceWithRepo({
    repoUrl,
    repoName,
    commitSha,
    sessionId,
  }: {
    repoUrl: string;
    repoName: string;
    commitSha: string;
    sessionId: string;
  }) {
    const sessionLogger = logger.child({ sessionId });
    const screenSizeFinal = {
      width: 1600,
      height: 900,
    };
    const instance = await this.scrapybaraClient.startUbuntu({
      timeoutHours: 1,
      resolution: [screenSizeFinal.width, screenSizeFinal.height],
    });

    sessionLogger.info(`[TestGenAgent] Cloning repository ${repoName}`);
    const cloneResult = await instance.bash({
      command: `git clone ${repoUrl} && cd ${repoName} && git checkout ${commitSha}`,
    });
    sessionLogger.info(`[TestGenAgent] Cloned repository ${repoName}`, {
      cloneResult,
    });

    // install ripgrep
    const installRipgrepResult = await instance.bash({
      command: "sudo apt-get install ripgrep -y",
    });
    sessionLogger.info("[TestGenAgent] Installed ripgrep", {
      installRipgrepResult,
    });

    return {
      id: instance.id,
      kind: "computer",
      instance: instance,
      providerName: "scrapybara",
      screenSize: screenSizeFinal,
    };
  }

  async setup(
    _screenSize?: {
      width: number;
      height: number;
    },
    initialUrl?: string,
    sessionId?: string,
  ): Promise<ComputerSession> {
    const sessionLogger = logger.child({ sessionId });
    const screenSizeFinal = {
      width: 1600,
      height: 900,
    };
    sessionLogger.info("[ScrapybaraProvider] Starting up scrapybara instance");
    const instance = await this.scrapybaraClient.startBrowser({
      timeoutHours: 1,
      resolution: [screenSizeFinal.width, screenSizeFinal.height],
    });

    sessionLogger.info("[ScrapybaraProvider] instance", {
      id: instance.id,
    });
    const cdpUrl = (await instance.getCdpUrl()).cdpUrl;
    const browser = await chromium.connectOverCDP(cdpUrl);
    const page = this._getPage(browser, "Scrapybara");
    page.on("dialog", (dialog) => {
      // Note that we neither need to accept nor dismiss the dialog here.
      // The dialog will be handled by the cua agent
      sessionLogger.info(
        `[ScrapybaraProvider] dialog message triggered: ${dialog.message()}`,
      );
    });
    const streamUrl = (await instance.getStreamUrl()).streamUrl;
    if (initialUrl) {
      await page.goto(initialUrl);
      sessionLogger.info(
        `[ScrapybaraProvider] Successfully navigated to initial url ${initialUrl}`,
      );
    }
    return {
      id: instance.id,
      kind: "computer",
      browser,
      page,
      instance: instance,
      liveUrl: streamUrl,
      providerName: "scrapybara",
      screenSize: screenSizeFinal,
    };
  }

  async stopSession(
    instanceId: string,
  ): Promise<{ status: "success" | "failed" }> {
    const instance = await this.scrapybaraClient.get(instanceId);
    if (instance instanceof UbuntuInstance) {
      await instance.browser.stop();
    }
    await instance.stop();
    logger.info(
      `[ScrapybaraProvider] Scrapybara instance ${instanceId} stopped via stopSession.`,
    );

    return {
      status: "success",
    };
  }

  getVideoRecordingUrl(_: string): Promise<RecordingUrlResponse> {
    return Promise.reject(new Error("Not implemented by ScrapybaraProvider"));
  }

  getRRWebRecordingUrl(_: string): Promise<RecordingUrlResponse> {
    return Promise.reject(new Error("Not implemented by ScrapybaraProvider"));
  }

  async takeScreenshot(session: ActiveSession): Promise<string> {
    const shouldRetry = (error: unknown): boolean => {
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
      return false;
    };

    return retryWithExponentialBackoff({
      fn: async () => {
        if (session.kind === "computer") {
          const screenshot = await session.instance.screenshot();
          return screenshot.base64Image;
        }
        logger.error(
          "[ScrapybaraProvider] takeScreenshot called with non-computer session. This is unexpected.",
        );
        throw new Error(
          `ScrapybaraProvider: takeScreenshot expects a 'computer' session. Received: ${session.kind}`,
        );
      },
      maxRetries: 5,
      initialDelay: 1000,
      shouldRetryError: shouldRetry,
      logContext: "ScrapybaraProvider.takeScreenshot",
    });
  }

  public handlePagePreStepChecks(session: ActiveSession): Promise<boolean> {
    if (session.kind === "computer") {
      logger.info(
        `[ScrapybaraProvider] Performing pre-step checks for computer session ${session.id}. No page checks needed.`,
      );
      return Promise.resolve(false);
    }
    logger.warn(
      `[ScrapybaraProvider] handlePagePreStepChecks called with non-computer session type: ${session.kind}. This is unexpected.`,
    );
    return Promise.resolve(false);
  }

  public async handleModelAction(
    activeSession: ActiveSession,
    action: OpenAIAction,
    reasoning?: OpenAI.Responses.ResponseReasoningItem,
    message?: OpenAI.Responses.ResponseOutputMessage,
    sessionId?: string,
  ): Promise<ActionOutcome> {
    const sessionLogger = logger.child({ sessionId: sessionId });
    const shouldRetry = (error: unknown): boolean => {
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

    return retryWithExponentialBackoff({
      fn: async () => {
        if (activeSession.kind !== "computer") {
          sessionLogger.error(
            `[ScrapybaraProvider] handleModelAction called with non-computer session type: ${activeSession.kind}. This provider only handles 'computer' sessions. Session ID: ${activeSession.id}`,
          );
          throw new Error(
            `ScrapybaraProvider cannot handle session type '${activeSession.kind}'. Action: ${action.type}`,
          );
        }

        const computerInstance = activeSession.instance;
        const actionType = action.type;
        sessionLogger.info(
          `[ScrapybaraProvider] Handling COMPUTER action for session ${activeSession.id}: ${actionType}, Details: ${JSON.stringify(action, null, 2)}`,
        );

        const defaultReasoning =
          "Performing action on the computer desktop environment.";
        const llmReasoning =
          reasoning?.summary[0]?.text ??
          message?.content
            ?.map((part) => (part.type === "output_text" ? part.text : ""))
            .join(" ");

        type ScrapybaraMouseButton = Button;

        try {
          switch (actionType) {
            case "click": {
              const { x, y, button = "left" } = action;
              const clickCoords: [number, number] = [x, y];
              let sbActualClickButton: ScrapybaraMouseButton | undefined;

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
                case "back":
                  sbActualClickButton = "back";
                  break;
                case "forward":
                  sbActualClickButton = "forward";
                  break;
                default:
                  sessionLogger.warn(
                    `[ScrapybaraProvider] Unknown CUA click button type '${normalizedOaiButton}' received. Defaulting to 'left' click.`,
                  );
                  sbActualClickButton = "left";
                  break;
              }

              if (sbActualClickButton) {
                await callScrapybaraComputerWithTimeout(
                  computerInstance.computer({
                    action: "click_mouse",
                    button: sbActualClickButton,
                    coordinates: clickCoords,
                    screenshot: false,
                  }),
                  "click_mouse",
                );
                return {
                  text: `Computer clicked (button: ${sbActualClickButton}) at position (${x}, ${y})`,
                  type: "CLICK",
                  reasoning:
                    llmReasoning ??
                    `Clicked (button: ${sbActualClickButton}) at computer coordinates (${x},${y}). ${defaultReasoning}`,
                  newPage: undefined,
                };
              }

              sessionLogger.error(
                `[ScrapybaraProvider] Internal logic error: No click action determined for button '${normalizedOaiButton}'. This path should ideally not be reached. Defaulting to no-op.`,
              );
              return {
                text: `Computer click action with button '${normalizedOaiButton}' at (${x}, ${y}) was not processed due to an unexpected internal state.`,
                type: "CLICK_PROCESSING_ERROR",
                reasoning:
                  llmReasoning ??
                  `Failed to process click due to unhandled button type or internal logic error for '${normalizedOaiButton}'.`,
                newPage: undefined,
              };
            }
            case "double_click": {
              const { x, y } = action;
              await callScrapybaraComputerWithTimeout(
                computerInstance.computer({
                  action: "click_mouse",
                  button: "left",
                  coordinates: [x, y],
                  numClicks: 2,
                  screenshot: false,
                }),
                "double_click (as click_mouse)",
              );
              return {
                text: `Computer double-clicked at position (${x}, ${y})`,
                type: "DOUBLE_CLICK",
                reasoning:
                  llmReasoning ??
                  `Double-clicked at computer coordinates (${x},${y}). ${defaultReasoning}`,
                newPage: undefined,
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

              await callScrapybaraComputerWithTimeout(
                computerInstance.computer({
                  action: "scroll",
                  coordinates: [x, y],
                  deltaX: mappedDeltaX,
                  deltaY: mappedDeltaY,
                  screenshot: false,
                }),
                "scroll",
              );
              return {
                text: `Computer scrolled by (scrollX=${scrollX}, scrollY=${scrollY}) at mouse position (${x},${y})`,
                type: "SCROLL",
                reasoning:
                  llmReasoning ?? `Scrolled computer view. ${defaultReasoning}`,
                newPage: undefined,
              };
            }
            case "keypress": {
              const { keys } = action;
              const mappedKeys = keys.map(
                (k: string) =>
                  CUA_KEY_TO_XK_KEYSYM[k.toLowerCase()] ?? k.toLowerCase(),
              );
              sessionLogger.info(
                `[ScrapybaraProvider] Action: computer keypress, mapped XK keysyms: ${mappedKeys.join(", ")}`,
              );
              await callScrapybaraComputerWithTimeout(
                computerInstance.computer({
                  action: "press_key",
                  keys: mappedKeys,
                  screenshot: false,
                }),
                "press_key",
              );
              return {
                text: `Computer pressed keys (XK): ${mappedKeys.join("+")}`,
                type: "KEYPRESS",
                reasoning:
                  llmReasoning ??
                  `Pressed keys (${mappedKeys.join("+")}) on computer using XK keysyms. ${defaultReasoning}`,
                newPage: undefined,
              };
            }
            case "type": {
              const { text } = action;
              await callScrapybaraComputerWithTimeout(
                computerInstance.computer({
                  action: "type_text",
                  text: text,
                  screenshot: false,
                }),
                "type_text",
              );
              return {
                text: `Computer typed text: ${text}`,
                type: "TYPE",
                reasoning:
                  llmReasoning ??
                  `Typed text \\"${text}\\" on computer. ${defaultReasoning}`,
                newPage: undefined,
              };
            }
            case "wait": {
              await callScrapybaraComputerWithTimeout(
                computerInstance.computer({
                  action: "wait",
                  duration: 2,
                  screenshot: false,
                }),
                "wait",
              );
              return {
                text: "Computer waited for 2 seconds",
                type: "WAIT",
                reasoning:
                  llmReasoning ?? `Waited for 2 seconds. ${defaultReasoning}`,
                newPage: undefined,
              };
            }
            case "screenshot": {
              sessionLogger.info(
                "[ScrapybaraProvider] CUA 'screenshot' action noted for computer session. Actual screenshot capture is handled by the main loop's takeScreenshot.",
              );
              return {
                text: "Screenshot action noted (capture managed by main loop for computer)",
                type: "SCREENSHOT",
                reasoning:
                  llmReasoning ??
                  "Noted screenshot request. Computer environment state captured by standard step screenshot.",
                newPage: undefined,
              };
            }
            case "drag": {
              const { path } = action;
              if (!path || path.length < 2) {
                throw new Error("Drag path invalid for computer action.");
              }
              const dragPath: [number, number][] = path.map((p) => [p.x, p.y]);
              await callScrapybaraComputerWithTimeout(
                computerInstance.computer({
                  action: "drag_mouse",
                  path: dragPath,
                  screenshot: false,
                }),
                "drag_mouse",
              );
              return {
                text: `Computer dragged mouse along path from (${dragPath[0]?.[0]},${dragPath[0]?.[1]}) to (${dragPath[dragPath.length - 1]?.[0]},${dragPath[dragPath.length - 1]?.[1]})`,
                type: "DRAG",
                reasoning:
                  llmReasoning ??
                  `Dragged mouse on computer. ${defaultReasoning}`,
                newPage: undefined,
              };
            }
            case "move": {
              const { x, y } = action;
              await callScrapybaraComputerWithTimeout(
                computerInstance.computer({
                  action: "move_mouse",
                  coordinates: [x, y],
                  screenshot: false,
                }),
                "move_mouse",
              );
              return {
                text: `Computer moved mouse to (${x}, ${y})`,
                type: "MOVE",
                reasoning:
                  llmReasoning ??
                  `Moved mouse cursor on computer to (${x},${y}). ${defaultReasoning}`,
                newPage: undefined,
              };
            }
            default: {
              const _action: never = action;
              sessionLogger.warn(
                `[ScrapybaraProvider] Unrecognized CUA action type for 'computer' session: ${(_action as OpenAIAction).type}`,
              );
              throw new Error(
                `Unrecognized CUA action type for Scrapybara 'computer' session: ${(_action as OpenAIAction).type}`,
              );
            }
          }
        } catch (e) {
          sessionLogger.error(
            `[ScrapybaraProvider] Error handling COMPUTER action ${actionType} for session ${activeSession.id}. Action Details: ${JSON.stringify(action, null, 2)}. Error: ${e instanceof Error ? e.stack : String(e)}`,
          );
          throw e;
        }
      },
      maxRetries: 5,
      initialDelay: 1000,
      shouldRetryError: shouldRetry,
      logContext: "ScrapybaraProvider.handleModelAction",
    });
  }
}
