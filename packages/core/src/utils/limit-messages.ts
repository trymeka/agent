import { Buffer } from "node:buffer";
import type { AgentMessage, ImageContent, TextContent } from "../ai";

// gemini model limit is 20MB, so we limit to 18MB to be safe
const EIGHTEEN_MB_BYTES = 18 * 1024 * 1024; // 18MB
// anthropic model limit is 100 images, so we limit to 95 to be safe
const DEFAULT_IMAGE_LENGTH = 95; // 95 images
const DEFAULT_URL_IMAGE_ESTIMATE_BYTES = Math.round(1 * 1024 * 1024); // 1MB

function isAnthropicModel(modelName: string): boolean {
  const name = modelName.toLowerCase();
  return name.includes("anthropic") || name.includes("claude");
}

function isOpenAIModel(modelName: string): boolean {
  const name = modelName.toLowerCase();
  return (
    name.includes("openai") ||
    name.includes("gpt") ||
    name.includes("o3") ||
    name.includes("o1") ||
    name.includes("o4")
  );
}

function isGeminiModel(modelName: string): boolean {
  const name = modelName.toLowerCase();
  return name.includes("gemini") || name.includes("google");
}

// https://softwareengineering.stackexchange.com/questions/288670/know-file-size-with-a-base64-string
function estimateBase64SizeBytes(value: string): number {
  // Remove possible data URI prefix
  const commaIndex = value.indexOf(",");
  const base64 =
    value.startsWith("data:") && commaIndex !== -1
      ? value.slice(commaIndex + 1)
      : value;
  const len = base64.length;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

function getContentItemSizeBytes(item: TextContent | ImageContent): number {
  if (item.type === "text") {
    return Buffer.byteLength(item.text, "utf8");
  }
  // image
  if (typeof item.image === "string") {
    // If it's already base64 or data URI, estimate its binary size
    if (
      item.image.startsWith("data:") ||
      /[A-Za-z0-9+/=]{100,}/.test(item.image)
    ) {
      return estimateBase64SizeBytes(item.image);
    }
    // Otherwise treat as a URL string
    return DEFAULT_URL_IMAGE_ESTIMATE_BYTES;
  }
  // URL instance
  return DEFAULT_URL_IMAGE_ESTIMATE_BYTES;
}

function limitByImageCount(
  messages: AgentMessage[],
  maxImages: number,
): AgentMessage[] {
  let imageCount = 0;
  const result: AgentMessage[] = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue;

    if (message.role === "user") {
      const contentItems = message.content ?? [];
      const messageImageCount = contentItems.reduce(
        (count, item) => count + (item.type === "image" ? 1 : 0),
        0,
      );

      if (imageCount + messageImageCount > maxImages) {
        const remainingSlots = Math.max(0, maxImages - imageCount);
        const filteredContent: (TextContent | ImageContent)[] = [];
        let slotsUsed = 0;

        for (const item of contentItems) {
          if (item.type === "text") {
            filteredContent.push(item);
          } else if (item.type === "image" && slotsUsed < remainingSlots) {
            filteredContent.push(item);
            ++slotsUsed;
          }
        }

        if (filteredContent.length > 0) {
          result.unshift({ role: "user", content: filteredContent });
        }
        imageCount += slotsUsed;
        if (imageCount >= maxImages) {
          break;
        }
      } else {
        result.unshift(message);
        imageCount += messageImageCount;
      }
    } else {
      result.unshift(message);
    }
  }

  return result;
}

function limitByTotalSize(
  messages: AgentMessage[],
  maxBytes: number,
): AgentMessage[] {
  let totalSize = 0;
  const result: AgentMessage[] = [];

  for (let i = messages.length - 1; i >= 0; --i) {
    const message = messages[i];
    if (!message) continue;

    if (message.role === "user") {
      const messageSize = message.content.reduce(
        (sum, item) => sum + getContentItemSizeBytes(item),
        0,
      );
      if (totalSize + messageSize <= maxBytes) {
        result.unshift(message);
        totalSize += messageSize;
        continue;
      }
      const filteredContent: (TextContent | ImageContent)[] = [];
      for (const item of message.content) {
        if (item.type !== "text") continue;
        const itemSize = getContentItemSizeBytes(item);
        if (totalSize + itemSize <= maxBytes) {
          filteredContent.push(item);
          totalSize += itemSize;
        }
      }
      for (const item of message.content) {
        if (item.type !== "image") continue;
        const itemSize = getContentItemSizeBytes(item);
        if (totalSize + itemSize <= maxBytes) {
          filteredContent.push(item);
          totalSize += itemSize;
        }
      }
      if (filteredContent.length > 0) {
        result.unshift({
          role: "user",
          content: filteredContent,
        });
      }
    } else {
      const contentItems = message.content;
      const messageSize = contentItems.reduce(
        (sum, item) => sum + getContentItemSizeBytes(item),
        0,
      );
      if (totalSize + messageSize <= maxBytes) {
        result.unshift(message);
        totalSize += messageSize;
        continue;
      }
      const filteredContent: TextContent[] = [];
      for (const item of contentItems) {
        const itemSize = getContentItemSizeBytes(item);
        if (totalSize + itemSize <= maxBytes) {
          filteredContent.push(item);
          totalSize += itemSize;
        }
      }
      if (filteredContent.length > 0) {
        result.unshift({
          role: "assistant",
          content: filteredContent,
        });
      }
    }

    if (totalSize >= maxBytes) break;
  }

  return result;
}

export function limitMessages(
  messages: AgentMessage[],
  modelName: string,
): AgentMessage[] {
  // Anthropic models have a limit on the number of images
  // OpenAi models have a context length limit, of which a 1366 x 768 image is 1100 tokens.
  // So we limit to 95 images to be safe which is about 100, 000 tokens, leaving the other half for the text. (o3 has a context length of 200,000 tokens)
  if (isAnthropicModel(modelName) || isOpenAIModel(modelName)) {
    return limitByImageCount(messages, DEFAULT_IMAGE_LENGTH);
  }
  // Gemini models have a limit on the total size of the messages
  if (isGeminiModel(modelName)) {
    return limitByTotalSize(messages, EIGHTEEN_MB_BYTES);
  }
  // Default: no limiting
  return messages;
}
