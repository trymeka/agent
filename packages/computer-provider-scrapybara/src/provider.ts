import type { ComputerAction, ComputerProvider } from "@agent/core";
import { ScrapybaraClient, type UbuntuInstance } from "scrapybara";
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

class ScrapybaraProviderImpl implements ComputerProvider {
  private scrapybaraClient: ScrapybaraClient;
  private instance: UbuntuInstance | null = null;

  constructor(
    private options: {
      uploadScreenshot: (options: {
        screenshotBase64: string;
        sessionId: string;
        step: number;
      }) => Promise<{ url: string }>;
    },
  ) {
    this.scrapybaraClient = new ScrapybaraClient({
      apiKey: () => process.env.SCRAPYBARA_API_KEY ?? "",
    });
  }

  async start(sessionId: string): Promise<void> {
    this.instance = await this.scrapybaraClient.startUbuntu({
      timeoutHours: 1,
      resolution: [1600, 900],
    });
  }

  async stop(sessionId: string): Promise<void> {
    if (this.instance) {
      await this.instance.stop();
    }
  }

  async takeScreenshot(): Promise<string> {
    if (!this.instance) {
      throw new Error("Scrapybara instance not started");
    }
    const screenshot = await this.instance.screenshot();
    return screenshot.base64Image;
  }

  uploadScreenshot(options: {
    screenshotBase64: string;
    sessionId: string;
    step: number;
  }): Promise<{ url: string }> {
    return this.options.uploadScreenshot(options);
  }

  async performAction(action: ComputerAction): Promise<{ result: string }> {
    if (!this.instance) {
      throw new Error("Scrapybara instance not started");
    }

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
          await this.instance.computer({
            action: "click_mouse",
            button: sbActualClickButton,
            coordinates: clickCoords,
            screenshot: false,
          });
          return {
            result: `Computer clicked (button: ${sbActualClickButton}) at position (${x}, ${y})`,
          };
        }
        return { result: "Click failed" };
      }
      case "double_click": {
        const { x, y } = action;
        await this.instance.computer({
          action: "click_mouse",
          button: "left",
          coordinates: [x, y],
          numClicks: 2,
          screenshot: false,
        });
        return {
          result: `Computer double-clicked at position (${x}, ${y})`,
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

        await this.instance.computer({
          action: "scroll",
          coordinates: [x, y],
          deltaX: mappedDeltaX,
          deltaY: mappedDeltaY,
          screenshot: false,
        });
        return {
          result: `Computer scrolled by (scrollX=${scrollX}, scrollY=${scrollY}) at mouse position (${x},${y})`,
        };
      }
      case "keypress": {
        const { keys } = action;
        const mappedKeys = keys.map(
          (k: string) =>
            CUA_KEY_TO_XK_KEYSYM[k.toLowerCase()] ?? k.toLowerCase(),
        );
        await this.instance.computer({
          action: "press_key",
          keys: mappedKeys,
          screenshot: false,
        });
        return {
          result: `Computer pressed keys (XK): ${mappedKeys.join("+")}`,
        };
      }
      case "type": {
        const { text } = action;
        await this.instance.computer({
          action: "type_text",
          text: text,
          screenshot: false,
        });
        return {
          result: `Computer typed text: ${text}`,
        };
      }
      case "wait": {
        await this.instance.computer({
          action: "wait",
          duration: 2,
          screenshot: false,
        });
        return {
          result: "Computer waited for 2 seconds",
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
        await this.instance.computer({
          action: "drag_mouse",
          path: dragPath,
          screenshot: false,
        });
        return {
          result: `Computer dragged mouse along path from (${dragPath[0]?.[0]},${dragPath[0]?.[1]}) to (${dragPath[dragPath.length - 1]?.[0]},${dragPath[dragPath.length - 1]?.[1]})`,
        };
      }
      case "move": {
        const { x, y } = action;
        await this.instance.computer({
          action: "move_mouse",
          coordinates: [x, y],
          screenshot: false,
        });
        return {
          result: `Computer moved mouse to (${x}, ${y})`,
        };
      }
    }
    return { result: "Action not implemented" };
  }
}

export function createScrapybaraProvider(options: {
  uploadScreenshot: (options: {
    screenshotBase64: string;
    sessionId: string;
    step: number;
  }) => Promise<{ url: string }>;
}): ComputerProvider {
  return new ScrapybaraProviderImpl(options);
}
