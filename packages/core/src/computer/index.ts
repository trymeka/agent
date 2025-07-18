/** A discriminated union of all possible computer actions. */
export type ComputerAction =
  | { type: "click"; x: number; y: number; button: "left" | "right" | "wheel" }
  | { type: "double_click"; x: number; y: number }
  | { type: "drag"; path: { x: number; y: number }[] }
  | { type: "keypress"; keys: string[] }
  | { type: "move"; x: number; y: number }
  | { type: "scroll"; x: number; y: number; scroll_x: number; scroll_y: number }
  | { type: "type"; text: string }
  | { type: "wait"; duration: number };

export interface ComputerProvider {
  /** Takes a screenshot of the environment. */
  takeScreenshot(): Promise<string>; // Returns base64 image string

  /** Uploads a screenshot and returns its public URL. */
  uploadScreenshot(options: {
    screenshotBase64: string;
    sessionId: string;
    step: number;
  }): Promise<{ url: string }>;

  /** Executes a standard computer action. */
  performAction(action: ComputerAction): Promise<{ result: string }>;

  /** Any necessary setup or teardown logic. */
  start(sessionId: string): Promise<void>;
  stop(sessionId: string): Promise<void>;
}
