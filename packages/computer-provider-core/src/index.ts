import { ComputerProviderError } from "@trymeka/core";
import type { Browser, Page } from "playwright-core";

/**
 * @internal
 * Gets the current page from a browser. This is used to get the current page from a browser.
 * @param browser The browser to get the page from.
 * @param providerName The name of the computer provider. Used for error messages.
 * @returns The current page.
 */
export function getPage(browser: Browser, providerName: string): Page {
  const contexts = browser.contexts();
  if (contexts.length === 0) {
    throw new ComputerProviderError(
      `No browser contexts found for ${providerName}. A context should typically exist.`,
    );
  }
  for (const context of contexts) {
    const pages = context.pages();
    const nonBlankPage = pages.find((p) => p.url() !== "about:blank");
    if (nonBlankPage) {
      nonBlankPage.on("dialog", () => {
        // Note that we neither need to accept nor dismiss the dialog here.
        // The dialog will be handled by the agent
      });
      return nonBlankPage;
    }
    // Only blank pages found in the context are returned
    const page = pages[0];
    page?.on("dialog", () => {
      // Note that we neither need to accept nor dismiss the dialog here.
      // The dialog will be handled by the agent
    });
    if (page) {
      return page;
    }
  }
  throw new Error(`No default page found in any context for ${providerName}.`);
}

/**
 * @internal
 * Gets the instance from the session map. This is used to get the instance from the session map.
 * @param sessionId The ID of the session.
 * @param sessionMap The session map.
 * @throws {ComputerProviderError} If the instance is not found.
 * @returns The instance.
 */
export function getInstance<T>(sessionId: string, sessionMap: Map<string, T>) {
  const result = sessionMap.get(sessionId);
  if (!result) {
    console.error(`[getInstance] sessionId ${sessionId} not found in sessionMap`, {
      sessionId,
      sessionMapKeys: Array.from(sessionMap.keys()),
      sessionMapSize: sessionMap.size,
    });
    throw new ComputerProviderError(
      `No instance found for sessionId ${sessionId}. Call .start(sessionId) first.`,
    );
  }
  return result;
}
