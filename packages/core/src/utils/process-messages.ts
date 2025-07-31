import { Buffer } from "node:buffer";
import { AgentError, type AgentMessage } from "../ai";
import { createLRU } from "./lru";
import { retryWithExponentialBackoff } from "./retry";

// TODO: make this configurable and aligned with the agent's max steps in runTask
const imageCache = createLRU<string>(7);

async function downloadImage(url: string): Promise<string> {
  const response = await retryWithExponentialBackoff({
    fn: () => fetch(url),
    shouldRetryError: () => {
      // fetch only throws an error if fetch failed, which we want to retry
      return true;
    },
  });
  if (!response.ok) {
    throw new AgentError(`Failed to download image from ${url}`);
  }
  const buffer = await response.arrayBuffer();
  const imageInBase64 = Buffer.from(buffer).toString("base64");
  return imageInBase64;
}

export async function processMessages(
  messages: AgentMessage[],
): Promise<AgentMessage[]> {
  const processedMessages = await Promise.all(
    messages.map(async (message) => {
      if (message.role !== "user") {
        return message;
      }

      const processedContent = await Promise.all(
        message.content.map(async (contentItem) => {
          if (contentItem.type === "text") {
            return contentItem;
          }
          if (!(contentItem.image instanceof URL)) {
            return contentItem;
          }

          const imageUrl = contentItem.image.href;
          let imageBase64 = imageCache.get(imageUrl);

          if (!imageBase64) {
            imageBase64 = await downloadImage(imageUrl);
            imageCache.set(imageUrl, imageBase64);
          }

          return {
            ...contentItem,
            image: imageBase64,
          };
        }),
      );
      return {
        ...message,
        content: processedContent,
      };
    }),
  );
  return processedMessages;
}
