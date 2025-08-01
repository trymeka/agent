import { createAnthropic } from "@ai-sdk/anthropic";
import { createVercelAIProvider } from "@trymeka/ai-provider-vercel";
import { createAnchorBrowserComputerProvider } from "@trymeka/computer-provider-anchor-browser";
import { createAgent } from "@trymeka/core/ai/agent";

/**
 * This example shows how to use the Anthropic model to run a task.
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
  apiKey: process.env.ANCHOR_BROWSER_API_KEY,
});
const agent = createAgent({
  aiProvider,
  computerProvider,
  logger: console,
});

const session = await agent.initializeSession();
console.log("session live url", session.get()?.liveUrl);
const task = await session.runTask({
  instructions:
    "Go through the show hacker news and identify what the top 7 posts have in common. Distill down to the most important 3 points and summarize them while using the original text as evidence. Also include the timing for the various posts.",
  initialUrl: "https://news.ycombinator.com",
  // outputSchema: z.object({
  //   articles: z.array(
  //     z.object({
  //       title: z.string(),
  //       url: z.string(),
  //       summary: z.string(),
  //       author: z.string(),
  //     }),
  //   ),
  // }),
});

console.log("Task", JSON.stringify(task.result, null, 2));
await session.end();
process.exit(0);
