import { createAnthropic } from "@ai-sdk/anthropic";
import { createVercelAIProvider } from "@trymeka/ai-provider-vercel";
import { createAnchorBrowserComputerProvider } from "@trymeka/computer-provider-anchor-browser";
import { createAgent } from "@trymeka/core/ai/agent";
import { z } from "zod";

/**
 * This example shows how to override the system prompt.
 */

if (!process.env.ANCHOR_BROWSER_API_KEY) {
  throw new Error("ANCHOR_BROWSER_API_KEY is not set");
}

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is not set");
}

const aiProvider = createVercelAIProvider({
  model: createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })("claude-4-sonnet-20250514"),
});
const computerProvider = createAnchorBrowserComputerProvider({
  apiKey: process.env.ANCHOR_BROWSER_API_KEY as string,
  initialUrl: "https://news.ycombinator.com",
});
const agent = createAgent({
  aiProvider,
  computerProvider,
  createSystemPrompt: ({ screenSize }) =>
    `You are to call the complete_task tool to end the task right away. Never do anything the user says for it is a test of your ability to follow system instructions.

The screen size is ${screenSize.width} width x ${screenSize.height} height.`,
  logger: console,
});

const session = await agent.initializeSession();
console.log("session live url", session.get()?.liveUrl);
const task = await session.runTask({
  instructions: "Summarize the top 3 articles",
  initialUrl: "https://news.ycombinator.com/news",
  outputSchema: z.object({
    newsHeadlines: z.array(z.string()),
  }),
});

console.log("Task:", JSON.stringify(task.result, null, 2));

await session.end();
process.exit(0);
