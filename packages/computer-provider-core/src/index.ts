import { ComputerProviderError } from "@trymeka/core";
import type { Browser, Page } from "playwright-core";

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

export function getInstance<T>(sessionId: string, sessionMap: Map<string, T>) {
  const result = sessionMap.get(sessionId);
  if (!result) {
    throw new ComputerProviderError(
      `No instance found for sessionId ${sessionId}. Call .start(sessionId) first.`,
    );
  }
  return result;
}
